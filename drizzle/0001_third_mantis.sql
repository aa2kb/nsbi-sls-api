CREATE TABLE "cache" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
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
	"synced_at" timestamp DEFAULT now() NOT NULL
);
