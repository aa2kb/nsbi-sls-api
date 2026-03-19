import { eq, sql } from 'drizzle-orm';
import { drizzle as drizzleDataApi } from 'drizzle-orm/aws-data-api/pg';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { cache, meetings, meetingParticipants } from './schema.js';

// ─── Connection strategy ───────────────────────────────────────────────────
// Lambda: AWS RDS Data API (no VPC, no connection pooling, serverless-friendly)
// Local / migrations / drizzle-kit: node-postgres (direct connection)
// See https://orm.drizzle.team/docs/connect-aws-data-api-pg

const useDataApi = !!(
  process.env.DB_RESOURCE_ARN &&
  process.env.SECRET_ARN &&
  process.env.DB_NAME
);

// Use Data API in Lambda, node-postgres otherwise. Only create Pool when using
// direct connection. Cast Data API instance so consumers get correct typings.
const db = useDataApi
  ? (drizzleDataApi({
      connection: {
        database: process.env.DB_NAME!,
        secretArn: process.env.SECRET_ARN!,
        resourceArn: process.env.DB_RESOURCE_ARN!,
        region: process.env.AWS_REGION ?? 'us-east-1',
      },
      schema,
    }) as unknown as ReturnType<typeof drizzleNodePg>)
  : drizzleNodePg(
      new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT ?? 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
        max: 1,
        idleTimeoutMillis: 30000,
      }),
      { schema }
    );

export { db };

// ─── Prepared statements (outside handler scope for Lambda reuse) ─────────────
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
