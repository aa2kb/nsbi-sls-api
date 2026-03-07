import { pgTable, uuid, varchar, timestamp, text, jsonb, doublePrecision, bigint, boolean } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export const meetings = pgTable('meetings', {
  id: varchar('id', { length: 255 }).primaryKey(),
  calId: text('cal_id'),
  title: text('title'),
  duration: doublePrecision('duration'),
  hostEmail: varchar('host_email', { length: 255 }),
  organizerEmail: varchar('organizer_email', { length: 255 }),
  calendarType: varchar('calendar_type', { length: 100 }),
  meetingLink: text('meeting_link'),
  analytics: jsonb('analytics'),
  date: bigint('date', { mode: 'number' }),
  dateString: varchar('date_string', { length: 50 }),
  summary: jsonb('summary'),
  participants: jsonb('participants'),
  meetingAttendees: jsonb('meeting_attendees'),
  meetingAttendance: jsonb('meeting_attendance'),
  processed: boolean('processed').notNull().default(false),
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
});

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export const cache = pgTable('cache', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
