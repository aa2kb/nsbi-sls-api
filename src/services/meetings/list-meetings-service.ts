import { count, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { meetings } from '../../db/schema.js';
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

export async function listMeetings(params: ParsedQueryParams) {
  const { page, limit, offset, sort, filters } = params;

  const orderBy = buildOrderBy(sort, COLUMN_MAP) ?? desc(meetings.syncedAt);
  const whereClause = buildWhereClause(filters, COLUMN_MAP);

  const [rows, countResult] = await Promise.all([
    db.select().from(meetings).where(whereClause).orderBy(orderBy).limit(limit).offset(offset),
    db.select({ total: count() }).from(meetings).where(whereClause),
  ]);

  const total = countResult[0]?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return {
    meetings: rows,
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
