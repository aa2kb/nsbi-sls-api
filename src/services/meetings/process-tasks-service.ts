import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings, meetingParticipants, tasks } from '../../db/schema.js';
import { startProcessLog, endProcessLog } from './process-log-service.js';
import { getMeetingsBucket, getJson } from '../../utils/s3.js';

const BEDROCK_REGION = 'us-east-1';
const BEDROCK_MODEL_ID = 'us.anthropic.claude-sonnet-4-6';

let _bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({ region: BEDROCK_REGION });
  }
  return _bedrockClient;
}

export class MeetingNotFoundError extends Error {
  constructor(id: string) {
    super(`Meeting not found: ${id}`);
    this.name = 'MeetingNotFoundError';
  }
}

export class MeetingNotReadyError extends Error {
  constructor(id: string, missing: string[]) {
    super(`Meeting ${id} is not ready for task processing — missing: ${missing.join(', ')}`);
    this.name = 'MeetingNotReadyError';
  }
}

export interface ProcessTasksResult {
  alreadyProcessed: boolean;
  tasksCreated?: number;
}

interface LlmTask {
  participant_name: string;
  taskTitle: string;
  taskDescription: string;
}

function transcriptToText(data: Record<string, unknown>): string {
  const transcript = data.transcript as Record<string, unknown> | undefined;
  if (!transcript) return '';

  const title = transcript.title as string | undefined;
  const sentences = transcript.sentences as Array<{ speaker_name?: string; text?: string }> | undefined;

  const lines: string[] = [];

  if (title) lines.push(`Meeting Title: ${title}\n`);

  if (sentences?.length) {
    lines.push('Transcript:');
    for (const sentence of sentences) {
      if (sentence.speaker_name && sentence.text) {
        lines.push(`${sentence.speaker_name}: ${sentence.text}`);
      }
    }
  }

  const summary = transcript.summary as Record<string, unknown> | undefined;
  if (summary?.overview) {
    lines.push(`\nMeeting Overview: ${summary.overview}`);
  }
  if (summary?.action_items) {
    lines.push(`\nAction Items: ${summary.action_items}`);
  }

  return lines.join('\n');
}

async function callLlm(transcriptText: string, participantNames: string[]): Promise<LlmTask[]> {
  const prompt = `You are analyzing a meeting transcript to create actionable tasks for each participant.

Here is the meeting transcript:
<transcript>
${transcriptText}
</transcript>

Participants in this meeting:
${participantNames.map((n) => `- ${n}`).join('\n')}

For each participant, identify the specific tasks, follow-ups, or action items they are responsible for based on what was discussed. Focus on concrete, actionable items.

Respond ONLY with a valid JSON array. No explanation, no markdown, no code fences — just the raw JSON array:
[
  {
    "participant_name": "exact name from the participants list",
    "taskTitle": "short title of the task",
    "taskDescription": "detailed description of what needs to be done"
  }
]

Only include participants who have actual tasks. Each participant may have multiple task entries.`;

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const response = await getBedrockClient().send(
    new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body,
    }),
  );

  const responseText = new TextDecoder().decode(response.body);
  const responseJson = JSON.parse(responseText) as { content: Array<{ text: string }> };
  const rawText = responseJson.content[0]?.text ?? '[]';

  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.warn('[ProcessTasks] LLM returned no JSON array, raw output:', rawText.slice(0, 500));
    return [];
  }

  return JSON.parse(jsonMatch[0]) as LlmTask[];
}

export async function processTasks(meetingId: string): Promise<ProcessTasksResult> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);

  if (!meeting) {
    throw new MeetingNotFoundError(meetingId);
  }

  if (meeting.taskProcessed) {
    console.log(`[ProcessTasks] Meeting ${meetingId} already task-processed — skipping`);
    return { alreadyProcessed: true };
  }

  const missing: string[] = [];
  if (!meeting.participantsProcessed) missing.push('participantsProcessed');
  if (!meeting.dataProcessed) missing.push('dataProcessed');

  if (missing.length > 0) {
    throw new MeetingNotReadyError(meetingId, missing);
  }

  const logId = await startProcessLog(meetingId, 'tasks');

  try {
    const bucket = getMeetingsBucket();
    const dataKey = `${meetingId}/data.json`;

    console.log(`[ProcessTasks] Reading transcript from s3://${bucket}/${dataKey}`);
    const rawJson = await getJson(bucket, dataKey);
    const transcriptData = JSON.parse(rawJson) as Record<string, unknown>;
    const transcriptText = transcriptToText(transcriptData);

    const participants = await db
      .select()
      .from(meetingParticipants)
      .where(eq(meetingParticipants.meetingId, meetingId));

    if (participants.length === 0) {
      console.warn(`[ProcessTasks] No participants found for meeting ${meetingId}`);
      await db
        .update(meetings)
        .set({ taskProcessed: true, syncedAt: sql`now()` })
        .where(eq(meetings.id, meetingId));
      await endProcessLog(logId, true);
      return { alreadyProcessed: false, tasksCreated: 0 };
    }

    const participantNames = participants.map((p) => p.speakerName);
    console.log(`[ProcessTasks] Calling LLM for ${participantNames.length} participants`);

    const llmTasks = await callLlm(transcriptText, participantNames);
    console.log(`[ProcessTasks] LLM returned ${llmTasks.length} tasks`);

    const participantMap = new Map(participants.map((p) => [p.speakerName.toLowerCase(), p]));

    const taskInserts = llmTasks
      .map((t) => {
        const participant = participantMap.get(t.participant_name.toLowerCase());
        if (!participant) {
          console.warn(`[ProcessTasks] Participant "${t.participant_name}" not found — skipping task`);
          return null;
        }
        return {
          participantId: participant.id,
          meetingId,
          taskTitle: t.taskTitle,
          taskDescription: t.taskDescription,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);

    if (taskInserts.length > 0) {
      await db.insert(tasks).values(taskInserts);
    }

    await db
      .update(meetings)
      .set({ taskProcessed: true, syncedAt: sql`now()` })
      .where(eq(meetings.id, meetingId));

    console.log(`[ProcessTasks] Meeting ${meetingId} — ${taskInserts.length} tasks created, marked as task_processed`);

    await endProcessLog(logId, true);
    return { alreadyProcessed: false, tasksCreated: taskInserts.length };
  } catch (error) {
    await endProcessLog(logId, false);
    throw error;
  }
}
