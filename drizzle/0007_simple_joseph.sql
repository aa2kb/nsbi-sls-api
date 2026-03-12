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
ALTER TABLE "meeting_participants" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "meetings" ADD COLUMN "users_processed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "process_logs" ADD CONSTRAINT "process_logs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;