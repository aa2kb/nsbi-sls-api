CREATE TABLE "cache" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"speaker_name" varchar(255) NOT NULL,
	"meeting_id" varchar(255) NOT NULL,
	"user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_participants_meeting_id_speaker_name_unique" UNIQUE("meeting_id","speaker_name")
);
--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"cal_id" text,
	"title" text,
	"duration" double precision,
	"host_email" varchar(255),
	"organizer_email" varchar(255),
	"calendar_type" varchar(100),
	"meeting_link" text,
	"analytics" jsonb,
	"date" bigint,
	"date_string" varchar(50),
	"summary" jsonb,
	"participants" jsonb,
	"meeting_attendees" jsonb,
	"meeting_attendance" jsonb,
	"participants_processed" boolean DEFAULT false NOT NULL,
	"data_processed" boolean DEFAULT false NOT NULL,
	"task_processed" boolean DEFAULT false NOT NULL,
	"users_processed" boolean DEFAULT false NOT NULL,
	"attempts_made" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "process_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" varchar(255) NOT NULL,
	"process_type" varchar(50) NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"in_progress" boolean DEFAULT true NOT NULL,
	"success" boolean
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"meeting_id" varchar(255) NOT NULL,
	"task_title" text NOT NULL,
	"task_description" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_logs" ADD CONSTRAINT "process_logs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_participant_id_meeting_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."meeting_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;