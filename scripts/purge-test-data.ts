/**
 * Atheris — purge des données de test (Lot 3 · PLAN.md §1).
 *
 * ⚠ SCRIPT DESTRUCTIF : supprime TOUTES les données de démo/test sauf :
 *   - l'admin + Saad Fares (racim) côté `users` ;
 *   - la candidature de Meriam Sghaier côté `job_applications` ;
 *   - la table `recruitment_templates` (modèles d'e-mails conservés) ;
 *   - la table `documents` (déjà vide, non touchée).
 *
 * Idempotent : relançable à l'identique (les DELETE n'ont rien à supprimer
 * après un premier passage ; l'UPDATE `default_project_id` est sans-op).
 *
 * Ordre imposé par les FK `no action` (voir schéma §6) :
 *   1. users.default_project_id → NULL (casse le cycle users ↔ projects)
 *   2. activities (actor_id → users, no action)
 *   3. invitations puis messages (→ users / client_projects, no action)
 *   4. client_projects (cascade → milestones)
 *   5. quotes (cascade → payments, commissions)
 *   6. prospects (cascade → prospect_briefs)
 *   7. job_applications hors Meriam Sghaier
 *   8. interviews (toutes)
 *   9. users hors admin + Saad
 *  10. login_attempts
 *
 * Usage : `npx tsx scripts/purge-test-data.ts` (workdir = racine du projet,
 * `.env.local` chargé pour DATABASE_URL réelle).
 */

import { config as loadEnv } from "dotenv";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/** Candidature conservée (Meriam Sghaier). */
const KEEP_APPLICATION_ID = "9447aa7f-00d1-4e76-99e3-f1d1b21e5010";
/** Comptes conservés : l'admin (CEO) + Saad Fares (racim, sdr). */
const KEEP_USER_IDS = [
  "dfeaf925-9547-43b1-a856-c275eed73881",
  "18ae2e5d-97aa-4eca-a12b-47a084fd6d4b",
];

/** Tables comptées avant/après pour le récapitulatif. */
const COUNTED_TABLES = [
  "users",
  "job_applications",
  "prospects",
  "prospect_briefs",
  "quotes",
  "payments",
  "commissions",
  "client_projects",
  "milestones",
  "interviews",
  "activities",
  "messages",
  "invitations",
  "login_attempts",
  "documents",
  "recruitment_templates",
] as const;

type Counts = Record<string, number>;

async function getCounts(
  sql: NeonQueryFunction<false, false>,
): Promise<Counts> {
  const counts: Counts = {};
  for (const table of COUNTED_TABLES) {
    // Table name issu d'une constante littérale (pas d'entrée utilisateur) :
    // interpolation sûre ici ; aucune valeur dynamique dans la requête.
    const rows = await sql.query(`SELECT count(*)::int AS n FROM "${table}"`);
    counts[table] = rows[0].n as number;
  }
  return counts;
}

async function main(): Promise<void> {
  loadEnv({ path: ".env.local" });

  const url = process.env.DATABASE_URL;
  if (!url || url.includes("placeholder")) {
    throw new Error(
      "purge impossible : DATABASE_URL absente ou placeholder — renseigner une URL Neon réelle dans .env.local.",
    );
  }

  const sql = neon(url);

  console.log("[purge] === COMPTES AVANT ===");
  const before = await getCounts(sql);
  console.table(before);

  // 1. users.default_project_id → NULL (casse le cycle users ↔ client_projects).
  await sql`UPDATE "users" SET "default_project_id" = NULL`;

  // 2. activities (actor_id → users, no action).
  await sql`DELETE FROM "activities"`;

  // 3. invitations puis messages (→ users / client_projects, no action).
  await sql`DELETE FROM "invitations"`;
  await sql`DELETE FROM "messages"`;

  // 4. client_projects (cascade → milestones).
  await sql`DELETE FROM "client_projects"`;

  // 5. quotes (cascade → payments, commissions).
  await sql`DELETE FROM "quotes"`;

  // 6. prospects (cascade → prospect_briefs).
  await sql`DELETE FROM "prospects"`;

  // 7. job_applications — conserve Meriam Sghaier.
  await sql`DELETE FROM "job_applications" WHERE "id" NOT IN (${KEEP_APPLICATION_ID})`;

  // 8. interviews (toutes).
  await sql`DELETE FROM "interviews"`;

  // 8b. recruitment_templates : la FK `updated_by → users.id` (no action)
  //     bloquerait la suppression des comptes de test. Le contenu du/des
  //     template(s) est CONSERVÉ (hors périmètre de purge) ; on ne fait que
  //     détacher l'auteur devenu orphelin (NULL autorisé, colonne nullable).
  await sql`UPDATE "recruitment_templates" SET "updated_by" = NULL WHERE "updated_by" IS NOT NULL`;

  // 9. users — conserve l'admin + Saad Fares.
  await sql`DELETE FROM "users" WHERE "id" NOT IN (${KEEP_USER_IDS[0]}, ${KEEP_USER_IDS[1]})`;

  // 10. login_attempts.
  await sql`DELETE FROM "login_attempts"`;

  console.log("[purge] === COMPTES APRÈS ===");
  const after = await getCounts(sql);
  console.table(after);

  console.log(
    "[purge] terminé — conservés : 2 users (admin + Saad), 1 job_application (Meriam), recruitment_templates intact.",
  );
}

main().catch((error: unknown) => {
  console.error(
    "[purge] ÉCHEC —",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
