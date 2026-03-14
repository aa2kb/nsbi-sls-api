import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { eq, sql } from 'drizzle-orm';
import { db, prepared } from '../../db/index.js';
import { meetings, meetingParticipants, users } from '../../db/schema.js';
import { startProcessLog, endProcessLog } from './process-log-service.js';

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
  constructor(id: string, reason: string) {
    super(`Meeting ${id} is not ready for user processing — ${reason}`);
    this.name = 'MeetingNotReadyError';
  }
}

export interface ProcessUsersResult {
  alreadyProcessed: boolean;
  usersCreated?: number;
  usersMatched?: number;
  matches?: Array<{ email: string; speakerName: string | null; userId: string }>;
}

interface LlmMatch {
  email: string;
  speakerName: string | null;
  name: string;
}

/**
 * Uses Claude to match a list of emails to a list of speaker names.
 * The email prefix (e.g. "bconyers" from "bconyers@nsbi.net") is a strong hint.
 */
async function matchEmailsToSpeakers(emails: string[], speakerNames: string[]): Promise<LlmMatch[]> {
  const prompt = `You are matching meeting attendee emails to speaker names from a meeting transcript.

Speaker names from the transcript:
${speakerNames.map((n) => `- ${n}`).join('\n')}

Attendee emails:
${emails.map((e) => `- ${e}`).join('\n')}

Instructions:
- Use the email prefix (the part before "@") as the primary clue. For example, "bconyers" likely matches "Brandon Conyers".
- Match each email to the most likely speaker name from the list above.
- If no speaker in the list matches an email, set "speakerName" to null.
- For "name", always derive a human-readable full name: use the matched speaker name if available, otherwise capitalise the email prefix (e.g. "bconyers" → "B Conyers" or your best guess).

Respond ONLY with a valid JSON array — no explanation, no markdown, no code fences:
[
  { "email": "bconyers@nsbi.net", "speakerName": "Brandon Conyers", "name": "Brandon Conyers" }
]`;

  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 2048,
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
    console.warn('[ProcessUsers] LLM returned no JSON array, raw output:', rawText.slice(0, 500));
    return emails.map((email) => ({ email, speakerName: null, name: email.split('@')[0] }));
  }

  return JSON.parse(jsonMatch[0]) as LlmMatch[];
}

export async function processUsers(meetingId: string): Promise<ProcessUsersResult> {
  const [meeting] = await prepared.getMeetingById.execute({ id: meetingId });

  if (!meeting) {
    throw new MeetingNotFoundError(meetingId);
  }

  if (meeting.usersProcessed) {
    console.log(`[ProcessUsers] Meeting ${meetingId} already users-processed — skipping`);
    return { alreadyProcessed: true };
  }

  if (!meeting.participantsProcessed) {
    throw new MeetingNotReadyError(meetingId, 'participantsProcessed is false — run process-participants first');
  }

  const participantEmails = (meeting.participants ?? []) as string[];

  if (participantEmails.length === 0) {
    throw new MeetingNotReadyError(meetingId, 'meeting.participants is empty — no emails to process');
  }

  const logId = await startProcessLog(meetingId, 'users');

  try {
    const speakerRows = await prepared.getParticipantsByMeetingId.execute({ meetingId });

    const speakerNames = speakerRows.map((r) => r.speakerName);

    console.log(`[ProcessUsers] Calling LLM to match ${participantEmails.length} emails to ${speakerNames.length} speakers`);
    const matches = await matchEmailsToSpeakers(participantEmails, speakerNames);

    // Upsert users — insert if email doesn't exist yet, skip if it does
    let usersCreated = 0;
    const emailToUserId = new Map<string, string>();

    for (const match of matches) {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, match.email))
        .limit(1);

      if (existing.length > 0) {
        emailToUserId.set(match.email, existing[0].id);
        console.log(`[ProcessUsers] User already exists for ${match.email} — skipping insert`);
      } else {
        const [inserted] = await db
          .insert(users)
          .values({ name: match.name, email: match.email })
          .returning({ id: users.id });

        emailToUserId.set(match.email, inserted.id);
        usersCreated++;
        console.log(`[ProcessUsers] Created user ${match.name} <${match.email}>`);
      }
    }

    // Link meeting_participants rows to their user via user_id
    let usersMatched = 0;
    const speakerMap = new Map(speakerRows.map((r) => [r.speakerName.toLowerCase(), r]));

    const resultMatches: ProcessUsersResult['matches'] = [];

    for (const match of matches) {
      const userId = emailToUserId.get(match.email);
      if (!userId) continue;

      resultMatches.push({ email: match.email, speakerName: match.speakerName, userId });

      if (match.speakerName) {
        const participant = speakerMap.get(match.speakerName.toLowerCase());
        if (participant) {
          await db
            .update(meetingParticipants)
            .set({ userId })
            .where(eq(meetingParticipants.id, participant.id));
          usersMatched++;
          console.log(`[ProcessUsers] Linked participant "${match.speakerName}" → user ${userId}`);
        } else {
          console.warn(`[ProcessUsers] No meeting_participant row found for speaker "${match.speakerName}"`);
        }
      }
    }

    await db
      .update(meetings)
      .set({ usersProcessed: true, syncedAt: sql`now()` })
      .where(eq(meetings.id, meetingId));

    console.log(
      `[ProcessUsers] Meeting ${meetingId} — ${usersCreated} users created, ${usersMatched} participants linked`,
    );

    await endProcessLog(logId, true);
    return { alreadyProcessed: false, usersCreated, usersMatched, matches: resultMatches };
  } catch (error) {
    await endProcessLog(logId, false);
    throw error;
  }
}
