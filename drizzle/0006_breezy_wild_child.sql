CREATE TYPE "public"."exam_status" AS ENUM('in_progress', 'submitted');--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'exam_pending';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'exam_submitted';--> statement-breakpoint
ALTER TYPE "public"."application_status" ADD VALUE 'exam_failed';--> statement-breakpoint
CREATE TABLE "exam_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"section" integer NOT NULL,
	"question_id" text NOT NULL,
	"answer" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "exam_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"application_id" uuid,
	"status" "exam_status" DEFAULT 'in_progress' NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"elapsed_seconds" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "exam_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "exam_answers" ADD CONSTRAINT "exam_answers_session_id_exam_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exam_answers_session_question_uq" ON "exam_answers" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE INDEX "exam_answers_session_id_idx" ON "exam_answers" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_application_id_idx" ON "exam_sessions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "exam_sessions_status_idx" ON "exam_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exam_sessions_submitted_pending_idx" ON "exam_sessions" USING btree ("submitted_at") WHERE status = 'submitted';