import { GraphQLClient, gql } from 'graphql-request';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings } from '../../db/schema.js';
import { getMeetingsBucket, uploadJson, uploadStream } from '../../utils/s3.js';

const FIREFLIES_API_URL = 'https://api.fireflies.ai/graphql';

const TRANSCRIPT_QUERY = gql`
  query Transcript($transcriptId: String!) {
    transcript(id: $transcriptId) {
      id
      dateString
      privacy
      analytics {
        sentiments { negative_pct neutral_pct positive_pct }
        categories { questions date_times metrics tasks }
        speakers {
          speaker_id name duration word_count longest_monologue
          monologues_count filler_words questions duration_pct words_per_minute
        }
      }
      speakers { id name }
      sentences {
        index speaker_name speaker_id text raw_text start_time end_time
        ai_filters { task pricing metric question date_and_time text_cleanup sentiment }
      }
      title
      host_email
      organizer_email
      calendar_id
      user {
        user_id email name num_transcripts recent_meeting
        minutes_consumed is_admin integrations
      }
      fireflies_users
      participants
      date
      transcript_url
      audio_url
      video_url
      duration
      meeting_attendees { displayName email phoneNumber name location }
      meeting_attendance { name join_time leave_time }
      summary {
        keywords action_items outline shorthand_bullet overview bullet_gist
        gist short_summary short_overview meeting_type topics_discussed transcript_chapters
      }
      cal_id
      calendar_type
      meeting_info { fred_joined silent_meeting summary_status }
      apps_preview { outputs { transcript_id user_id app_id created_at title prompt response } }
      meeting_link
      channels { id }
    }
  }
`;

interface FirefliesTranscriptData {
  transcript: {
    id: string;
    audio_url: string | null;
    [key: string]: unknown;
  };
}

export class MeetingNotFoundError extends Error {
  constructor(id: string) {
    super(`Meeting not found: ${id}`);
    this.name = 'MeetingNotFoundError';
  }
}

export interface ProcessDataResult {
  alreadyProcessed: boolean;
  dataKey?: string;
  audioKey?: string;
  audioSkipped?: boolean;
}

export async function processData(meetingId: string): Promise<ProcessDataResult> {
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);

  if (!meeting) {
    throw new MeetingNotFoundError(meetingId);
  }

  if (meeting.dataProcessed) {
    console.log(`[ProcessData] Meeting ${meetingId} already processed — skipping`);
    return { alreadyProcessed: true };
  }

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new Error('FIREFLIES_API_KEY environment variable is not set');

  const bucket = getMeetingsBucket();

  console.log(`[ProcessData] Fetching full transcript for meeting ${meetingId}`);

  const client = new GraphQLClient(FIREFLIES_API_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  const data = await client.request<FirefliesTranscriptData>(TRANSCRIPT_QUERY, {
    transcriptId: meetingId,
  });

  const transcript = data.transcript;
  if (!transcript) {
    throw new MeetingNotFoundError(meetingId);
  }

  const dataKey = `${meetingId}/data.json`;
  console.log(`[ProcessData] Uploading transcript JSON to s3://${bucket}/${dataKey}`);
  await uploadJson(bucket, dataKey, JSON.stringify(data, null, 2));

  let audioKey: string | undefined;
  let audioSkipped = false;

  if (transcript.audio_url) {
    audioKey = `${meetingId}/audio.mp3`;
    console.log(`[ProcessData] Downloading audio from ${transcript.audio_url}`);
    const audioResponse = await fetch(transcript.audio_url);

    if (!audioResponse.ok || !audioResponse.body) {
      console.warn(`[ProcessData] Failed to download audio (status ${audioResponse.status}) — skipping`);
      audioSkipped = true;
    } else {
      console.log(`[ProcessData] Uploading audio to s3://${bucket}/${audioKey}`);
      await uploadStream(bucket, audioKey, audioResponse.body, 'audio/mpeg');
    }
  } else {
    console.log('[ProcessData] No audio URL available — skipping audio upload');
    audioSkipped = true;
  }

  await db
    .update(meetings)
    .set({ dataProcessed: true, syncedAt: sql`now()` })
    .where(eq(meetings.id, meetingId));

  console.log(`[ProcessData] Meeting ${meetingId} marked as data_processed`);

  return { alreadyProcessed: false, dataKey, audioKey, audioSkipped };
}
