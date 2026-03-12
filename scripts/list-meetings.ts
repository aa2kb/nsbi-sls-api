import 'dotenv/config';
import pg from 'pg';

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

const { rows } = await pool.query(`
  SELECT id, title, participants_processed, data_processed, task_processed, users_processed,
         jsonb_array_length(participants::jsonb) AS email_count
  FROM meetings
  ORDER BY synced_at DESC
  LIMIT 20
`);

console.table(rows);
await pool.end();
