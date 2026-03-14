/**
 * Creates the "auth" PostgreSQL schema and runs all Better Auth migrations
 * against it programmatically — no CLI required.
 *
 * Usage:
 *   tsx scripts/better-auth-migrate.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { getMigrations } from 'better-auth/db/migration';

async function main() {
  // 1. Ensure the "auth" schema exists before Better Auth tries to write to it
  const adminPool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    max: 1,
  });

  try {
    await adminPool.query('CREATE SCHEMA IF NOT EXISTS auth');
    console.log('✔  Schema "auth" is ready');
  } finally {
    await adminPool.end();
  }

  // 2. Load auth config (this also loads the separate auth-schema pool)
  const { auth } = await import('../src/lib/auth.js');

  // 3. Get and run migrations
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(
    auth.options,
  );

  if (toBeCreated.length === 0 && toBeAdded.length === 0) {
    console.log('✔  Better Auth schema is already up to date');
    return;
  }

  if (toBeCreated.length > 0) {
    console.log('Tables to create:', toBeCreated.map((t) => t.table).join(', '));
  }
  if (toBeAdded.length > 0) {
    console.log(
      'Columns to add:',
      toBeAdded.map((c) => `${c.table}.${c.column}`).join(', '),
    );
  }

  await runMigrations();
  console.log('✔  Better Auth migrations complete');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
