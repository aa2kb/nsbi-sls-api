import { pgTable, uuid, varchar, timestamp, text, jsonb, doublePrecision, bigint, boolean, integer, unique } from 'drizzle-orm/pg-core';

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
  participantsProcessed: boolean('participants_processed').notNull().default(false),
  dataProcessed: boolean('data_processed').notNull().default(false),
  taskProcessed: boolean('task_processed').notNull().default(false),
  usersProcessed: boolean('users_processed').notNull().default(false),
  attemptsMade: integer('attempts_made').notNull().default(0),
  syncedAt: timestamp('synced_at').notNull().defaultNow(),
});

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

export const cache = pgTable('cache', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const meetingParticipants = pgTable('meeting_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  speakerName: varchar('speaker_name', { length: 255 }).notNull(),
  meetingId: varchar('meeting_id', { length: 255 }).notNull().references(() => meetings.id),
  userId: uuid('user_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  unique('meeting_participants_meeting_id_speaker_name_unique').on(table.meetingId, table.speakerName),
]);

export type MeetingParticipant = typeof meetingParticipants.$inferSelect;
export type NewMeetingParticipant = typeof meetingParticipants.$inferInsert;

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id').notNull().references(() => meetingParticipants.id),
  meetingId: varchar('meeting_id', { length: 255 }).notNull().references(() => meetings.id),
  taskTitle: text('task_title').notNull(),
  taskDescription: text('task_description').notNull(),
  complete: boolean('complete').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export const processLogs = pgTable('process_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  meetingId: varchar('meeting_id', { length: 255 }).notNull().references(() => meetings.id),
  processType: varchar('process_type', { length: 50 }).notNull(),
  startTime: timestamp('start_time').notNull().defaultNow(),
  endTime: timestamp('end_time'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  inProgress: boolean('in_progress').notNull().default(true),
  success: boolean('success'),
});

export type ProcessLog = typeof processLogs.$inferSelect;
export type NewProcessLog = typeof processLogs.$inferInsert;
