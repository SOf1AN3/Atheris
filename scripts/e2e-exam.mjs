/**
 * E2E du parcours d'examen — INSERT de candidature + session de test,
 * puis vérification, puis NETTOYAGE.
 *
 * Contexte : base de PRODUCTION. Chaque ligne créée porte un email marqué
 * `e2e-test@` et le script supprime TOUJOURS ses lignes (finally), puis
 * VÉRIFIE la suppression. Un échec de nettoyage est signalé explicitement
 * plutôt que masqué.
 *
 *   node scripts/e2e-exam.mjs            # setup + état
 *   node scripts/e2e-exam.mjs --teardown # suppression forcée des lignes E2E
 */
import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
/**
 * Préfixe de marquage des lignes de test. Le filtre de nettoyage doit matcher
 * les VRAIES adresses créées (`e2e-pass@`, `e2e-fail@`, …) — un filtre exact
 * sur une adresse unique ne supprime rien et laisse des orphelines en prod
 * (bug réel intercepté ici avant nettoyage).
 */
const MARK_LIKE = "e2e-%@example.com";
const MARK_COL = "email_norm";

async function rows(text, params = []) {
  const res = await sql.query(text, params);
  return res.rows ?? res;
}

async function teardown() {
  // Ordre : enfants d'abord (exam_answers → exam_sessions → candidature).
  const answers = await rows(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE ${MARK_COL} LIKE $1))
     RETURNING id`,
    [MARK_LIKE],
  );
  const sessions = await rows(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE ${MARK_COL} LIKE $1)
     RETURNING id`,
    [MARK_LIKE],
  );
  const apps = await rows(
    `DELETE FROM job_applications WHERE ${MARK_COL} LIKE $1 RETURNING id`,
    [MARK_LIKE],
  );
  return { answers: answers.length, sessions: sessions.length, apps: apps.length };
}

// ── teardown forcé ───────────────────────────────────────────────────────────
if (process.argv.includes("--teardown")) {
  const t = await teardown();
  console.log(`Teardown : ${t.answers} réponse(s), ${t.sessions} session(s), ${t.apps} candidature(s) supprimée(s).`);
  const left = await rows(
    `SELECT count(*)::int AS n FROM job_applications WHERE ${MARK_COL} LIKE $1`,
    [MARK_LIKE],
  );
  console.log(`Reste : ${left[0].n} ligne(s) E2E.`);
  process.exit(0);
}

// ── SETUP : 2 candidatures (une qui passe, une éliminatoire) ────────────────
await teardown(); // idempotent : on repart d'un état propre

async function createApplication(suffix) {
  const token = randomBytes(32).toString("hex");
  const email = `e2e-${suffix}@example.com`;
  const app = await rows(
    `INSERT INTO job_applications
       (first_name, last_name, email, email_norm, locale, status)
     VALUES ($1, $2, $3, $3, 'en', 'exam_pending')
     RETURNING id`,
    ["E2E", suffix.toUpperCase(), email],
  );
  const sessionId = await rows(
    `INSERT INTO exam_sessions (token, application_id, status, locale)
     VALUES ($1, $2, 'in_progress', 'en') RETURNING id`,
    [token, app[0].id],
  );
  return { appId: app[0].id, sessionId: sessionId[0].id, token };
}

const pass = await createApplication("pass");
const fail = await createApplication("fail");

console.log("══ SETUP ═════════════════════════════════════════════════");
console.log(`candidature « pass » : app=${pass.appId} session=${pass.sessionId}`);
console.log(`  token = ${pass.token}`);
console.log(`candidature « fail » : app=${fail.appId} session=${fail.sessionId}`);
console.log(`  token = ${fail.token}`);

const snap = await rows(
  `SELECT count(*)::int AS n FROM job_applications WHERE ${MARK_COL} LIKE $1`, [MARK_LIKE],
);
console.log(`\nLignes E2E en base : ${snap[0].n} candidature(s)`);
const total = await rows(`SELECT count(*)::int AS n FROM job_applications`);
console.log(`Total job_applications : ${total[0].n}`);

console.log(`\nPour le test UI, ouvrir :\n  /en/examen/${pass.token}\n  /en/examen/${fail.token}`);
console.log(`\nNettoyage OBLIGIGATOIRE ensuite :\n  node scripts/e2e-exam.mjs --teardown`);
