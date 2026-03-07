import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings, meetingParticipants } from '../../db/schema.js';

interface Speaker {
  name: string;
  speaker_id: number;
  duration: number;
  word_count: number;
  duration_pct: number;
  filler_words: number;
  monologues_count: number;
  questions: number;
  words_per_minute: number;
  longest_monologue: number;
}

interface Analytics {
  speakers?: Speaker[];
}

export interface ProcessParticipantsResult {
  created: number;
  skipped: number;
  participants: string[];
}

export class MeetingNotFoundError extends Error {
  constructor(meetingId: string) {
    super(`Meeting not found: ${meetingId}`);
    this.name = 'MeetingNotFoundError';
  }
}

function isGenericSpeakerName(name: string): boolean {
  return /^Speaker\s+\d+$/i.test(name.trim());
}

/**
 * Extracts real names from a meeting title.
 * Title format: "Brandon Conyers [+12066292299] <> Jake Priszner [157]"
 * Returns names in order: [leftName, rightName]. A slot is null when the
 * segment is a bare phone number with no preceding alphabetic name.
 */
function extractNamesFromTitle(title: string): (string | null)[] {
  const segments = title.split('<>').map((s) => s.trim());
  return segments.map((segment) => {
    const match = segment.match(/^(.+?)\s*\[/);
    if (!match) return null;
    const candidate = match[1].trim();
    // Reject bare phone numbers (e.g. "+15087367050")
    if (/^\+?\d[\d\s\-().]+$/.test(candidate)) return null;
    return candidate;
  });
}

export async function processParticipants(meetingId: string): Promise<ProcessParticipantsResult> {
  const [meeting] = await db
    .select()
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);

  if (!meeting) {
    throw new MeetingNotFoundError(meetingId);
  }

  const analytics = meeting.analytics as Analytics | null;
  const speakers: Speaker[] = analytics?.speakers ?? [];

  console.log(`[ParticipantService] Meeting "${meeting.title}" has ${speakers.length} speaker(s)`);

  const hasGenericNames = speakers.some((s) => isGenericSpeakerName(s.name));
  let titleNames: (string | null)[] = [];

  if (hasGenericNames && meeting.title) {
    titleNames = extractNamesFromTitle(meeting.title);
    console.log(`[ParticipantService] Generic speaker names detected — extracted from title:`, titleNames);
  }

  const resolvedNames: string[] = speakers.map((speaker) => {
    if (isGenericSpeakerName(speaker.name)) {
      const titleName = titleNames[speaker.speaker_id] ?? null;
      if (titleName) {
        console.log(`[ParticipantService] Resolved "${speaker.name}" → "${titleName}" via title`);
        return titleName;
      }
    }
    return speaker.name;
  });

  let created = 0;
  let skipped = 0;
  const participantNames: string[] = [];

  for (const name of resolvedNames) {
    const result = await db
      .insert(meetingParticipants)
      .values({ speakerName: name, meetingId })
      .onConflictDoNothing()
      .returning();

    if (result.length > 0) {
      created++;
      participantNames.push(name);
      console.log(`[ParticipantService] Created participant "${name}" for meeting ${meetingId}`);
    } else {
      skipped++;
      participantNames.push(name);
      console.log(`[ParticipantService] Skipped duplicate participant "${name}" for meeting ${meetingId}`);
    }
  }

  await db
    .update(meetings)
    .set({ participantsProcessed: true })
    .where(eq(meetings.id, meetingId));

  console.log(`[ParticipantService] Done — created=${created} skipped=${skipped} | meeting marked as participant_processed`);

  return { created, skipped, participants: participantNames };
}
