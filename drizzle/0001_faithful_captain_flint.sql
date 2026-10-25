CREATE TYPE "public"."interview_status" AS ENUM('pending', 'cancelled', 'done');--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"email_norm" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"timezone" text NOT NULL,
	"local_date" text NOT NULL,
	"local_hour" text NOT NULL,
	"status" "interview_status" DEFAULT 'pending' NOT NULL,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interviews_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "interviews_pending_starts_at_uq" ON "interviews" USING btree ("starts_at") WHERE status = 'pending' AND email_norm <> '';--> statement-breakpoint
CREATE INDEX "interviews_created_at_idx" ON "interviews" USING btree ("created_at");