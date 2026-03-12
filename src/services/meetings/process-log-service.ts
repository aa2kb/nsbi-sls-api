import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { processLogs } from '../../db/schema.js';

export type ProcessType = 'participants' | 'data' | 'tasks' | 'users';

/**
 * Inserts a new process_logs row immediately when a process begins.
 * Returns the generated log ID so it can be passed to endProcessLog.
 */
export async function startProcessLog(meetingId: string, processType: ProcessType): Promise<string> {
  const [row] = await db
    .insert(processLogs)
    .values({ meetingId, processType })
    .returning({ id: processLogs.id });

  console.log(`[ProcessLog] Started ${processType} log ${row.id} for meeting ${meetingId}`);
  return row.id;
}

/**
 * Updates an existing process_logs row with the outcome.
 * Call this in both the success path and the catch block.
 */
export async function endProcessLog(logId: string, success: boolean): Promise<void> {
  await db
    .update(processLogs)
    .set({ inProgress: false, success, endTime: sql`now()` })
    .where(eq(processLogs.id, logId));

  console.log(`[ProcessLog] Ended log ${logId} — success=${success}`);
}
