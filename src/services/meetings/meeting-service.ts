import { GraphQLClient, gql } from 'graphql-request';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { eq, sql, asc, lt, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings, cache } from '../../db/schema.js';

const MAX_ATTEMPTS = 3;

const PENDING_BATCH_LIMIT = 5;

let _snsClient: SNSClient | null = null;

function getSnsClient(): SNSClient {
  if (!_snsClient) {
    _snsClient = new SNSClient({ region: process.env.AWS_REGION ?? 'us-east-1' });
  }
  return _snsClient;
}

async function publishPipelineEvent(meetingId: string): Promise<void> {
  const topicArn = process.env.PIPELINE_TOPIC_ARN;
  if (!topicArn) {
    console.warn(`[MeetingService] PIPELINE_TOPIC_ARN not set — skipping SNS publish for ${meetingId}`);
    return;
  }
  await getSnsClient().send(
    new PublishCommand({
      TopicArn: topicArn,
      Message: JSON.stringify({ meetingId }),
      Subject: 'process-meeting-pipeline',
    }),
  );
  await db
    .update(meetings)
    .set({ attemptsMade: sql`${meetings.attemptsMade} + 1` })
    .where(eq(meetings.id, meetingId));
  console.log(`[MeetingService] Published SNS event for meeting ${meetingId}`);
}

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';
const CACHE_KEY = 'meetings:last_sync_date';
const FETCH_LIMIT = 5;

const TRANSCRIPTS_QUERY = gql`
  query Transcripts($fromDate: DateTime, $userId: String) {
    transcripts(fromDate: $fromDate, user_id: $userId) {
      id
      cal_id
      title
      duration
      host_email
      organizer_email
      calendar_type
      meeting_link
      analytics {
        sentiments {
          negative_pct
          neutral_pct
          positive_pct
        }
        categories {
          questions
          date_times
          metrics
          tasks
        }
        speakers {
          speaker_id
          name
          duration
          word_count
          longest_monologue
          monologues_count
          filler_words
          questions
          duration_pct
          words_per_minute
        }
      }
      date
      dateString
      organizer_email
      summary {
        keywords
        action_items
        outline
        shorthand_bullet
        overview
        bullet_gist
        gist
        short_summary
        short_overview
        meeting_type
        topics_discussed
        transcript_chapters
      }
      participants
      meeting_attendees {
        displayName
        email
        phoneNumber
        name
        location
      }
      meeting_attendance {
        name
        join_time
        leave_time
      }
    }
  }
`;

interface FirefliesTranscript {
  id: string;
  cal_id: string | null;
  title: string | null;
  duration: number | null;
  host_email: string | null;
  organizer_email: string | null;
  calendar_type: string | null;
  meeting_link: string | null;
  analytics: unknown;
  date: number | null;
  dateString: string | null;
  summary: unknown;
  participants: string[] | null;
  meeting_attendees: unknown;
  meeting_attendance: unknown;
}

interface FirefliesResponse {
  transcripts: FirefliesTranscript[];
}

async function getLastSyncDate(): Promise<string | null> {
  const result = await db.select().from(cache).where(eq(cache.key, CACHE_KEY)).limit(1);
  return result[0]?.value ?? null;
}

async function setLastSyncDate(dateString: string): Promise<void> {
  await db
    .insert(cache)
    .values({ key: CACHE_KEY, value: dateString })
    .onConflictDoUpdate({
      target: cache.key,
      set: { value: dateString, updatedAt: sql`now()` },
    });
}

async function upsertMeeting(transcript: FirefliesTranscript): Promise<void> {
  await db
    .insert(meetings)
    .values({
      id: transcript.id,
      calId: transcript.cal_id,
      title: transcript.title,
      duration: transcript.duration,
      hostEmail: transcript.host_email,
      organizerEmail: transcript.organizer_email,
      calendarType: transcript.calendar_type,
      meetingLink: transcript.meeting_link,
      analytics: transcript.analytics as never,
      date: transcript.date,
      dateString: transcript.dateString,
      summary: transcript.summary as never,
      participants: transcript.participants as never,
      meetingAttendees: transcript.meeting_attendees as never,
      meetingAttendance: transcript.meeting_attendance as never,
    })
    .onConflictDoUpdate({
      target: meetings.id,
      set: {
        calId: transcript.cal_id,
        title: transcript.title,
        duration: transcript.duration,
        hostEmail: transcript.host_email,
        organizerEmail: transcript.organizer_email,
        calendarType: transcript.calendar_type,
        meetingLink: transcript.meeting_link,
        analytics: transcript.analytics as never,
        date: transcript.date,
        dateString: transcript.dateString,
        summary: transcript.summary as never,
        participants: transcript.participants as never,
        meetingAttendees: transcript.meeting_attendees as never,
        meetingAttendance: transcript.meeting_attendance as never,
        syncedAt: sql`now()`,
      },
    });
}

export interface SyncResult {
  fetched: number;
  saved: number;
  fromDate: string | null;
  latestMeetingDate: string | null;
  snsPublished: number;
}

export async function syncMeetings(): Promise<SyncResult> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    throw new Error('FIREFLIES_API_KEY environment variable is not set');
  }

  console.log('[MeetingService] Starting meeting sync');

  // --- Cache check ---
  const lastSyncDate = await getLastSyncDate();
  if (lastSyncDate) {
    console.log(`[MeetingService] Cache hit — fetching meetings from ${lastSyncDate}`);
  } else {
    console.log('[MeetingService] No cache found — fetching all available meetings');
  }

  // --- GraphQL fetch ---
  const client = new GraphQLClient(FIREFLIES_API_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const variables: Record<string, string> = {};
  if (lastSyncDate) variables.fromDate = lastSyncDate;

  console.log('[MeetingService] Calling Fireflies GraphQL API', {
    url: FIREFLIES_API_URL,
    variables,
  });

  const data = await client.request<FirefliesResponse>(TRANSCRIPTS_QUERY, variables);
  const all = data.transcripts ?? [];

  const isFullSync = !lastSyncDate;
  const batch = isFullSync ? all : all.slice(0, FETCH_LIMIT);

  if (isFullSync) {
    console.log(`[MeetingService] API returned ${all.length} transcript(s) — full sync, saving all`);
  } else {
    console.log(`[MeetingService] API returned ${all.length} transcript(s) — incremental sync, limiting to ${FETCH_LIMIT}`);
  }

  // --- Upsert each meeting ---
  let saved = 0;
  for (const transcript of batch) {
    console.log(`[MeetingService] Upserting meeting | id=${transcript.id} | title="${transcript.title ?? 'untitled'}" | date=${transcript.dateString ?? 'unknown'}`);
    await upsertMeeting(transcript);
    saved++;
  }

  // --- Update cache with 1ms past the most recent meeting date ---
  // Using +1ms ensures fromDate is exclusive on the next run, preventing the
  // same meeting from being re-fetched every sync.
  let latestMeetingDate: string | null = null;
  if (batch.length > 0) {
    const latest = batch.reduce((prev, curr) => ((curr.date ?? 0) > (prev.date ?? 0) ? curr : prev));
    latestMeetingDate = latest.dateString ?? null;

    if (latestMeetingDate) {
      const nextFromDate = new Date(new Date(latestMeetingDate).getTime() + 1).toISOString();
      await setLastSyncDate(nextFromDate);
      console.log(`[MeetingService] Cache updated — next sync will start from ${nextFromDate} (1ms after latest meeting)`);
    }
  }

  // --- SNS: publish pipeline event for every newly fetched meeting ---
  const newIds = new Set(batch.map((t) => t.id));
  let snsPublished = 0;

  for (const meetingId of newIds) {
    await publishPipelineEvent(meetingId);
    snsPublished++;
  }

  // --- SNS: re-queue up to PENDING_BATCH_LIMIT existing unfinished meetings ---
  // A meeting is pending if any of the four processing flags is still false
  // and it has not yet hit the max attempt cap.
  // Priority: fewest attempts first (0 → 1 → 2), capped at MAX_ATTEMPTS.
  // Exclude meetings we just published above to avoid duplicates.
  const hasPendingFlag = sql<boolean>`(
    participants_processed = false OR
    data_processed = false OR
    task_processed = false OR
    users_processed = false
  )`;

  const underAttemptCap = lt(meetings.attemptsMade, MAX_ATTEMPTS);

  const pendingRows = newIds.size > 0
    ? await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(sql`${and(underAttemptCap, hasPendingFlag)} AND id != ALL(ARRAY[${sql.join([...newIds].map((id) => sql`${id}`), sql`, `)}])`)
        .orderBy(asc(meetings.attemptsMade))
        .limit(PENDING_BATCH_LIMIT)
    : await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(and(underAttemptCap, hasPendingFlag))
        .orderBy(asc(meetings.attemptsMade))
        .limit(PENDING_BATCH_LIMIT);

  console.log(`[MeetingService] Found ${pendingRows.length} pending meeting(s) to re-queue (cap=${MAX_ATTEMPTS})`);

  for (const row of pendingRows) {
    await publishPipelineEvent(row.id);
    snsPublished++;
  }

  console.log(`[MeetingService] Sync complete | fetched=${all.length} | saved=${saved} | snsPublished=${snsPublished} | fromDate=${lastSyncDate ?? 'all'} | latestDate=${latestMeetingDate ?? 'n/a'}`);

  return {
    fetched: all.length,
    saved,
    fromDate: lastSyncDate,
    latestMeetingDate,
    snsPublished,
  };
}
