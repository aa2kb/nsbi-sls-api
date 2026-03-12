import { processData } from './process-data-service.js';
import { processParticipants } from './participant-service.js';
import { processTasks } from './process-tasks-service.js';
import { processUsers } from './process-users-service.js';

export interface PipelineStepResult {
  skipped: boolean;
  [key: string]: unknown;
}

export interface PipelineResult {
  meetingId: string;
  steps: {
    processData: PipelineStepResult;
    processParticipants: PipelineStepResult;
    processTasks: PipelineStepResult;
    processUsers: PipelineStepResult;
  };
}

export async function processPipeline(meetingId: string): Promise<PipelineResult> {
  console.log(`[Pipeline] Starting full pipeline for meeting ${meetingId}`);

  // Step 1 — fetch transcript + audio from Fireflies → S3
  console.log(`[Pipeline] Step 1/4 — processData`);
  const dataResult = await processData(meetingId);
  console.log(`[Pipeline] Step 1/4 done — alreadyProcessed=${dataResult.alreadyProcessed}`);

  // Step 2 — extract speakers → meeting_participants rows
  console.log(`[Pipeline] Step 2/4 — processParticipants`);
  const participantsResult = await processParticipants(meetingId);
  console.log(`[Pipeline] Step 2/4 done — created=${participantsResult.created}, skipped=${participantsResult.skipped}`);

  // Step 3 — LLM task extraction → tasks rows
  console.log(`[Pipeline] Step 3/4 — processTasks`);
  const tasksResult = await processTasks(meetingId);
  console.log(`[Pipeline] Step 3/4 done — tasksCreated=${tasksResult.tasksCreated ?? 'n/a'}`);

  // Step 4 — email → user upsert + participant linking
  console.log(`[Pipeline] Step 4/4 — processUsers`);
  const usersResult = await processUsers(meetingId);
  console.log(`[Pipeline] Step 4/4 done — usersCreated=${usersResult.usersCreated ?? 'n/a'}, matched=${usersResult.usersMatched ?? 'n/a'}`);

  console.log(`[Pipeline] Completed full pipeline for meeting ${meetingId}`);

  return {
    meetingId,
    steps: {
      processData: { skipped: dataResult.alreadyProcessed, ...dataResult },
      processParticipants: { skipped: false, ...participantsResult },
      processTasks: { skipped: tasksResult.alreadyProcessed, ...tasksResult },
      processUsers: { skipped: usersResult.alreadyProcessed, ...usersResult },
    },
  };
}
