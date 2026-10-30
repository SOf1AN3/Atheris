ALTER TABLE "job_applications" ALTER COLUMN "cv_filename" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "cv_mime_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "cv_byte_size" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "cv_bytes" DROP NOT NULL;