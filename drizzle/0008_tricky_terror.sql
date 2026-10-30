CREATE TYPE "public"."identity_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."payout_method" AS ENUM('wise', 'paypal', 'bank');--> statement-breakpoint
CREATE TABLE "contract_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"contract_version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identity_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"status" "identity_status" DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "identity_docs_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "payout_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"method" "payout_method" NOT NULL,
	"account_email" text,
	"currency" text,
	"holder_name" text,
	"bank_name" text,
	"iban" text,
	"swift_bic" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "payout_details_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "exam_sessions" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "identity_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "contract_consents" ADD CONSTRAINT "contract_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_docs" ADD CONSTRAINT "identity_docs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identity_docs" ADD CONSTRAINT "identity_docs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_details" ADD CONSTRAINT "payout_details_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_consents_user_version_uq" ON "contract_consents" USING btree ("user_id","contract_version");--> statement-breakpoint
CREATE INDEX "contract_consents_user_id_idx" ON "contract_consents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "identity_docs_user_id_idx" ON "identity_docs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payout_details_user_id_idx" ON "payout_details" USING btree ("user_id");