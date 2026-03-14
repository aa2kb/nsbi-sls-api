import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { cache, meetings, meetingParticipants } from './schema.js';

// ─── Connection & DB (outside handler scope for Lambda reuse) ─────────────────
// Per https://orm.drizzle.team/docs/perf-serverless: declare connection and db
// at module level so Lambda can reuse them across invocations (up to 15min).

let pool: Pool | undefined;

const getPool = (): Pool => {
  if (!pool) {
    pool = new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 5432),
      database: process.env.DB_NAME,
      user: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 1,
      idleTimeoutMillis: 30000,
    });
  }
  return pool;
};

const databaseConnection = getPool();
export const db = drizzle(databaseConnection, { schema });

// ─── Prepared statements (outside handler scope for Lambda reuse) ───────────
// Precompiled queries reused across invocations — avoids re-parsing SQL each time.

export const prepared = {
  getMeetingById: db
    .select()
    .from(meetings)
    .where(eq(meetings.id, sql.placeholder('id')))
    .limit(1)
    .prepare('getMeetingById'),

  getCacheByKey: db
    .select()
    .from(cache)
    .where(eq(cache.key, sql.placeholder('key')))
    .limit(1)
    .prepare('getCacheByKey'),

  getParticipantsByMeetingId: db
    .select()
    .from(meetingParticipants)
    .where(eq(meetingParticipants.meetingId, sql.placeholder('meetingId')))
    .prepare('getParticipantsByMeetingId'),
};
