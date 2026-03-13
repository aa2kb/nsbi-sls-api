import 'dotenv/config';
import { Pool } from 'pg';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// ── Database ─────────────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function dropDatabase() {
  console.log('⏳ Dropping all tables and drizzle schema...');

  await pool.query(`
    -- Drop tables in dependency order (children first)
    DROP TABLE IF EXISTS process_logs CASCADE;
    DROP TABLE IF EXISTS tasks CASCADE;
    DROP TABLE IF EXISTS meeting_participants CASCADE;
    DROP TABLE IF EXISTS meetings CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS cache CASCADE;

    -- Drop the drizzle migration-tracking schema
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);

  console.log('✅ Database cleared');
}

// ── S3 ────────────────────────────────────────────────────────────────────────

const s3 = new S3Client({ region: 'us-east-1' });
const bucket = process.env.MEETINGS_BUCKET!;

async function clearS3() {
  console.log(`⏳ Clearing S3 bucket: ${bucket}`);

  let continuationToken: string | undefined;
  let totalDeleted = 0;

  do {
    const list = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }),
    );

    const objects = list.Contents ?? [];

    if (objects.length > 0) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.map((o) => ({ Key: o.Key! })) },
        }),
      );
      totalDeleted += objects.length;
      console.log(`   Deleted ${totalDeleted} object(s) so far...`);
    }

    continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (continuationToken);

  console.log(`✅ S3 bucket cleared (${totalDeleted} object(s) deleted)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

try {
  await dropDatabase();
  await clearS3();
} finally {
  await pool.end();
}
