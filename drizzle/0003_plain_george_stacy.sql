--> statement-breakpoint
-- ============================================================================
-- Lot 3 · migration 0003 — SQL ajusté À LA MAIN après `drizzle-kit generate`
-- (le SQL généré était incorrect : cast `::role` sans mapping vendeur→sdr,
-- référence à `invitations.role` avant son ADD COLUMN, ADD VALUE non
-- transactionnel-safe). Intention unique : aligner le schéma sur le Lot 3
-- (rôle `sdr`, statut `recrute`, colonnes invitations élargies).
-- ============================================================================
--
-- 1. Enum "role" : vendeur → sdr — approche rename/recrée (transactionnelle,
--    contrairement à RENAME VALUE impossible ici et cast brut sans mapping).
--    Le bloc conserve l'intention du Lead mot pour mot.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "role" RENAME TO "role_old";--> statement-breakpoint
CREATE TYPE "role" AS ENUM('ceo', 'manager', 'commercial', 'sdr', 'client');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "role" USING (CASE "role"::text WHEN 'vendeur' THEN 'sdr' ELSE "role"::text END)::"role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ceo';--> statement-breakpoint
DROP TYPE "role_old";--> statement-breakpoint
--
-- 2. Enum "application_status" : ajout de 'recrute' — même approche rename/
--    recrée (ALTER TYPE ADD VALUE interdit/déconseillé dans la transaction
--    unique du fichier de migration drizzle-kit). Le DEFAULT 'nouveau' de
--    job_applications.status est détaché puis reposé (un DEFAULT référençant
--    l'ancien type ne serait pas convertible automatiquement).
ALTER TABLE "job_applications" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "application_status" RENAME TO "application_status_old";--> statement-breakpoint
CREATE TYPE "application_status" AS ENUM('nouveau', 'invite', 'refuse', 'recrute');--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "status" TYPE "application_status" USING "status"::text::"application_status";--> statement-breakpoint
ALTER TABLE "job_applications" ALTER COLUMN "status" SET DEFAULT 'nouveau';--> statement-breakpoint
DROP TYPE "application_status_old";--> statement-breakpoint
--
-- 3. job_applications : instant du recrutement (nullable, pas de default).
ALTER TABLE "job_applications" ADD COLUMN "recruited_at" timestamp with time zone;--> statement-breakpoint
--
-- 4. invitations : colonne `role` (NOT NULL acceptable : table vide — vérifié
--    0 ligne avant migration), `project_id` rendu nullable (invitations de
--    recrutement sans projet), FK `application_id` → job_applications et
--    index partiel anti-doublon (email, rôle) sur invitations non utilisées.
ALTER TABLE "invitations" ADD COLUMN "role" "role" NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invitations" ADD COLUMN "application_id" uuid;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_application_id_job_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."job_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitations_email_role_unused_idx" ON "invitations" USING btree ("email","role") WHERE used_at IS NULL;
