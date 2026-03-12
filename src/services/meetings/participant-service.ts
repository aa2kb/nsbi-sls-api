import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings, meetingParticipants } from '../../db/schema.js';
import { startProcessLog, endProcessLog } from './process-log-service.js';

interface AttendanceRecord {
  name: string;
  join_time?: string;
  leave_time?: string;
}

export type ParticipantSource = 'attendance' | 'title' | 'none';

export interface ProcessParticipantsResult {
  source: ParticipantSource;
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

/**
 * Extracts real names from a meeting title.
 * Title format: "Brandon Conyers [+12066292299] <> Jake Priszner [157]"
 * Returns names in order: [leftName, rightName]. A slot is null when the
 * segment is a bare phone number with no preceding alphabetic name.
 */
function extractNamesFromTitle(title: string): string[] {
  const segments = title.split('<>').map((s) => s.trim());
  return segments.reduce<string[]>((acc, segment) => {
    const match = segment.match(/^(.+?)\s*\[/);
    if (!match) return acc;
    const candidate = match[1].trim();
    // Reject bare phone numbers (e.g. "+15087367050")
    if (/^\+?\d[\d\s\-().]+$/.test(candidate)) return acc;
    acc.push(candidate);
    return acc;
  }, []);
}

function getNamesFromAttendance(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is AttendanceRecord => r !== null && typeof r === 'object' && typeof r.name === 'string' && r.name.trim() !== '')
    .map((r) => r.name.trim());
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

  const logId = await startProcessLog(meetingId, 'participants');

  try {
    console.log(`[ParticipantService] Processing meeting "${meeting.title}" (${meetingId})`);
    console.log(`[ParticipantService] meetingAttendance raw:`, JSON.stringify(meeting.meetingAttendance));

    // --- Source priority: attendance → title → none ---
    let resolvedNames: string[] = [];
    let source: ParticipantSource = 'none';

    const attendanceNames = getNamesFromAttendance(meeting.meetingAttendance);

    if (attendanceNames.length > 0) {
      source = 'attendance';
      resolvedNames = attendanceNames;
      console.log(`[ParticipantService] Source: attendance (${attendanceNames.length} attendee(s)):`, attendanceNames);
    } else if (meeting.title) {
      const titleNames = extractNamesFromTitle(meeting.title);
      if (titleNames.length > 0) {
        source = 'title';
        resolvedNames = titleNames;
        console.log(`[ParticipantService] Source: title — attendance empty, extracted from "${meeting.title}":`, titleNames);
      } else {
        console.log(`[ParticipantService] Source: none — attendance empty and title yielded no names`);
      }
    } else {
      console.log(`[ParticipantService] Source: none — no attendance data and no title`);
    }

    // --- Insert participants ---
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
        console.log(`[ParticipantService] Created participant "${name}"`);
      } else {
        skipped++;
        console.log(`[ParticipantService] Skipped duplicate "${name}"`);
      }
      participantNames.push(name);
    }

    await db
      .update(meetings)
      .set({ participantsProcessed: true })
      .where(eq(meetings.id, meetingId));

    console.log(`[ParticipantService] Done — source=${source} created=${created} skipped=${skipped}`);

    await endProcessLog(logId, true);
    return { source, created, skipped, participants: participantNames };
  } catch (error) {
    await endProcessLog(logId, false);
    throw error;
  }
}
