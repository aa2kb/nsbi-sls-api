import { count, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tasks, meetingParticipants, users, meetings } from '../../db/schema.js';
import type { ParsedQueryParams, QueryColumnMap } from '../../utils/query-params.js';
import { buildOrderBy, buildWhereClause } from '../../utils/query-params.js';

// Only columns on the tasks table are exposed for filtering/sorting.
// Cross-table filtering (e.g. by meeting title) should be added as dedicated
// query params at the handler level if needed in the future.
const COLUMN_MAP: QueryColumnMap = {
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  completedAt: tasks.completedAt,
  complete: tasks.complete,
  meetingId: tasks.meetingId,
  participantId: tasks.participantId,
};

// Selected shape returned per row.
// Join chain:
//   tasks
//   ├── INNER JOIN meeting_participants  (tasks.participant_id → meeting_participants.id)
//   │       └── LEFT JOIN users          (meeting_participants.user_id → users.id, nullable)
//   └── INNER JOIN meetings              (tasks.meeting_id → meetings.id)
const TASK_SELECT = {
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
  meeting: {
    id: meetings.id,
    title: meetings.title,
    date: meetings.date,
    dateString: meetings.dateString,
    hostEmail: meetings.hostEmail,
    organizerEmail: meetings.organizerEmail,
  },
};

function baseQuery() {
  return db
    .select(TASK_SELECT)
    .from(tasks)
    .innerJoin(meetingParticipants, eq(tasks.participantId, meetingParticipants.id))
    .leftJoin(users, eq(meetingParticipants.userId, users.id))
    .innerJoin(meetings, eq(tasks.meetingId, meetings.id));
}

export async function listTasks(params: ParsedQueryParams) {
  const { page, limit, offset, sort, filters } = params;

  const orderBy = buildOrderBy(sort, COLUMN_MAP) ?? desc(tasks.createdAt);
  const whereClause = buildWhereClause(filters, COLUMN_MAP);

  const [rows, countResult] = await Promise.all([
    baseQuery().where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db
      .select({ total: count(tasks.id) })
      .from(tasks)
      .innerJoin(meetingParticipants, eq(tasks.participantId, meetingParticipants.id))
      .leftJoin(users, eq(meetingParticipants.userId, users.id))
      .innerJoin(meetings, eq(tasks.meetingId, meetings.id))
      .where(whereClause),
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    tasks: rows,
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
