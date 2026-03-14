import { count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings, tasks, meetingParticipants, users } from '../../db/schema.js';
import type { ParsedQueryParams, QueryColumnMap } from '../../utils/query-params.js';
import { buildOrderBy, buildWhereClause } from '../../utils/query-params.js';

// Maps API-facing column names → Drizzle columns on the meetings table.
// "createdAt" is intentionally aliased to syncedAt to follow the project's
// standard sort convention while matching the actual schema column.
const COLUMN_MAP: QueryColumnMap = {
  createdAt: meetings.syncedAt,
  syncedAt: meetings.syncedAt,
  title: meetings.title,
  date: meetings.date,
  duration: meetings.duration,
  hostEmail: meetings.hostEmail,
  organizerEmail: meetings.organizerEmail,
  calendarType: meetings.calendarType,
  participantsProcessed: meetings.participantsProcessed,
  dataProcessed: meetings.dataProcessed,
  taskProcessed: meetings.taskProcessed,
  usersProcessed: meetings.usersProcessed,
  attemptsMade: meetings.attemptsMade,
};

interface MeetingTaskRow {
  id: string;
  taskTitle: string;
  taskDescription: string;
  complete: boolean;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  participant: { id: string; speakerName: string };
  user: { id: string; name: string; email: string } | null;
}

// Fetches all tasks for a set of meeting IDs in a single query,
// joined with their participant and user. Returns a map of meetingId → tasks[].
async function fetchTasksForMeetings(meetingIds: string[]): Promise<Map<string, MeetingTaskRow[]>> {
  if (meetingIds.length === 0) return new Map();

  const rows = await db
    .select({
      meetingId: tasks.meetingId,
      id: tasks.id,
      taskTitle: tasks.taskTitle,
      taskDescription: tasks.taskDescription,
      complete: tasks.complete,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      completedAt: tasks.completedAt,
      participant: {
        id: meetingParticipants.id,
        speakerName: meetingParticipants.speakerName,
      },
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(tasks)
    .innerJoin(meetingParticipants, eq(tasks.participantId, meetingParticipants.id))
    .leftJoin(users, eq(meetingParticipants.userId, users.id))
    .where(inArray(tasks.meetingId, meetingIds))
    .orderBy(tasks.createdAt);

  // Group by meetingId
  const map = new Map<string, MeetingTaskRow[]>();
  for (const row of rows) {
    const { meetingId, ...task } = row;
    const bucket = map.get(meetingId) ?? [];
    bucket.push(task);
    map.set(meetingId, bucket);
  }
  return map;
}

export async function listMeetings(params: ParsedQueryParams) {
  const { page, limit, offset, sort, filters } = params;

  const orderBy = buildOrderBy(sort, COLUMN_MAP) ?? desc(meetings.syncedAt);
  const whereClause = buildWhereClause(filters, COLUMN_MAP);

  const [meetingRows, countResult] = await Promise.all([
    db.select().from(meetings).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(meetings).where(whereClause),
  ]);

  const meetingIds = meetingRows.map((m) => m.id);
  const tasksByMeeting = await fetchTasksForMeetings(meetingIds);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    meetings: meetingRows.map((meeting) => ({
      ...meeting,
      tasks: tasksByMeeting.get(meeting.id) ?? [],
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}
