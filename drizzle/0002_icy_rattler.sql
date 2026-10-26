CREATE TYPE "public"."application_status" AS ENUM('nouveau', 'invite', 'refuse');--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"email_norm" text NOT NULL,
	"locale" text DEFAULT 'fr' NOT NULL,
	"message" text,
	"status" "application_status" DEFAULT 'nouveau' NOT NULL,
	"cv_filename" text NOT NULL,
	"cv_mime_type" text NOT NULL,
	"cv_byte_size" integer NOT NULL,
	"cv_bytes" "bytea" NOT NULL,
	"interview_id" uuid,
	"invited_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recruitment_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"locale" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recruitment_templates" ADD CONSTRAINT "recruitment_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_applications_status_idx" ON "job_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_applications_created_at_idx" ON "job_applications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "job_applications_email_norm_idx" ON "job_applications" USING btree ("email_norm");--> statement-breakpoint
CREATE UNIQUE INDEX "recruitment_templates_kind_locale_idx" ON "recruitment_templates" USING btree ("kind","locale");