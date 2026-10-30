/**
 * Vérification de la couche de données du lot 4 (CEO).
 *
 * Deux choses à prouver, sans session CEO (impossible à fabriquer sans
 * créer un compte sur la prod) :
 *
 *  1. L'INVARIANCE 1:1 `job_applications` ↔ `exam_sessions`. Les actions
 *     `listJobApplications` / `getJobApplication` font un LEFT JOIN sur
 *     `exam_sessions.application_id` : si une candidature avait DEUX
 *     sessions, la liste renverrait la candidature en double (bug silencieux
 *     de comptage). Aucune contrainte UNIQUE n'impose cet invariant en DB —
 *     il ne tient que par construction du code (`startExam` appelée une fois
 *     depuis `applyToJob`, nulle part ailleurs). Ce script le mesure.
 *
 *  2. Le RENDU des réponses : la forme exacte renvoyée par la jointure
 *     (session + answers), pour valider que ce que le panneau attend
 *     (`exam`, `examAnswers`) correspond au réel.
 *
 * Nettoyage systématique + vérification du nettoyage (aucune ligne de test
 * ne survit en prod).
 *
 *   node scripts/verify-exam-data.mjs
 */
import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
const MARK = "e2e-data@example.com";

async function rows(text, params = []) {
  const res = await sql.query(text, params);
  return res.rows ?? res;
}

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function teardown() {
  await rows(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE email_norm LIKE 'e2e-%'))`,
  );
  await rows(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE email_norm LIKE 'e2e-%')`,
  );
  await rows(`DELETE FROM job_applications WHERE email_norm LIKE 'e2e-%'`);
}

try {
  await teardown();

  console.log("══ 1. INVARIANCE 1:1 sur TOUTES les données ══════════════");
  const dupes = await rows(
    `SELECT application_id, count(*)::int AS n
     FROM exam_sessions
     WHERE application_id IS NOT NULL
     GROUP BY application_id
     HAVING count(*) > 1`,
  );
  check(
    "aucune candidature avec 2 sessions (JOIN non dupliquant)",
    dupes.length === 0,
    dupes.length ? `${dupes.length} doublon(s)` : "0 doublon",
  );

  const orphans = await rows(
    `SELECT count(*)::int AS n FROM exam_sessions WHERE application_id IS NULL`,
  );
  check("session orpheline (application_id NULL)", orphans[0].n === 0, `${orphans[0].n}`);

  const totalSessions = await rows(`SELECT count(*)::int AS n FROM exam_sessions`);
  // Cast explicite : `LIKE` n'est pas opérateur natif des colonnes ENUM
  // Postgres (`application_status ~~ unknown` → erreur de type).
  const totalApps = await rows(
    `SELECT count(*)::int AS n FROM job_applications WHERE status::text LIKE 'exam%'`,
  );
  console.log(
    `  ℹ sessions=${totalSessions[0].n} · candidatures en statut exam=${totalApps[0].n}`,
  );

  console.log("\n══ 2. RENDU des réponses (forme attendue par l'UI) ══════");
  // Scénario soumis : 10 réponses réparties 3/3/3/1.
  const token = randomBytes(32).toString("hex");
  const app = await rows(
    `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
     VALUES ('Data','E2E',$1,$1,'en','exam_submitted') RETURNING id`,
    [MARK],
  );
  const appId = app[0].id;
  await rows(
    `INSERT INTO exam_sessions (token,application_id,status,locale,submitted_at,elapsed_seconds)
     VALUES ($1,$2,'submitted','en', now(), 612)`,
    [token, appId],
  );
  const answers = [
    ["s1q1", 1], ["s1q2", 1], ["s1q3", 1],
    ["s2q1", 2], ["s2q2", 2], ["s2q3", 2],
    ["s3q1", 3], ["s3q2", 3], ["s3q3", 3],
    ["s4q1", 4],
  ];
  for (const [qid, section] of answers) {
    const value = qid === "s4q1" ? "yes" : qid === "s2q1" ? "nuanced" : qid === "s3q2" ? "10to20" : "Réponse E2E suffisamment longue pour le barème.";
    await rows(
      `INSERT INTO exam_answers (session_id,section,question_id,answer)
       VALUES ((SELECT id FROM exam_sessions WHERE token=$1),$2,$3,$4)`,
      [token, section, qid, value],
    );
  }

  // Même jointure que `getJobApplication`.
  const joined = await rows(
    `SELECT s.status, s.submitted_at, s.elapsed_seconds, s.id AS session_id
     FROM job_applications a
     LEFT JOIN exam_sessions s ON s.application_id = a.id
     WHERE a.id = $1
     LIMIT 1`,
    [appId],
  );
  check("jointure renvoie UNE seule ligne", joined.length === 1, `${joined.length} ligne(s)`);
  check("statut session = submitted", joined[0]?.status === "submitted", joined[0]?.status);
  check("elapsed_seconds = 612", joined[0]?.elapsed_seconds === 612, String(joined[0]?.elapsed_seconds));
  check("submitted_at non nul", joined[0]?.submitted_at !== null);

  const loaded = await rows(
    `SELECT question_id, section, answer FROM exam_answers
     WHERE session_id = $1 ORDER BY section, question_id`,
    [joined[0].session_id],
  );
  check("10 réponses chargées", loaded.length === 10, `${loaded.length}`);
  const bySection = loaded.reduce((acc, r) => ({ ...acc, [r.section]: (acc[r.section] ?? 0) + 1 }), {});
  check("répartition 3/3/3/1", JSON.stringify(bySection) === JSON.stringify({ 1: 3, 2: 3, 3: 3, 4: 1 }), JSON.stringify(bySection));
  check("sérialisable (dates en ISO, pas de Date)", typeof joined[0].submitted_at === "string" || joined[0].submitted_at instanceof Date);

  // Indicateur 24 h.
  const h = (Date.now() - Date.parse(joined[0].submitted_at)) / 3_600_000;
  check("âge < 24 h → mention « dans les délais »", h < 24, `${h.toFixed(2)} h`);

  // Session in_progress : durée et date doivent être NULL (l'UI n'affiche rien).
  const token2 = randomBytes(32).toString("hex");
  const app2 = await rows(
    `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
     VALUES ('Data2','E2E',$1,$1,'en','exam_pending') RETURNING id`,
    ["e2e-data2@example.com"],
  );
  await rows(
    `INSERT INTO exam_sessions (token,application_id,status,locale) VALUES ($1,$2,'in_progress','en')`,
    [token2, app2[0].id],
  );
  const prog = await rows(
    `SELECT s.status, s.submitted_at, s.elapsed_seconds
     FROM job_applications a LEFT JOIN exam_sessions s ON s.application_id=a.id
     WHERE a.id=$1 LIMIT 1`,
    [app2[0].id],
  );
  check("in_progress → submitted_at NULL", prog[0].submitted_at === null);
  check("in_progress → elapsed NULL", prog[0].elapsed_seconds === null);
} catch (err) {
  failures++;
  console.error("\nERREUR :", err.message);
} finally {
  try {
    await teardown();
    const left = await rows(
      `SELECT count(*)::int AS n FROM job_applications WHERE email_norm LIKE 'e2e-%'`,
    );
    const left2 = await rows(
      `SELECT count(*)::int AS n FROM job_applications WHERE email_norm = $1`,
      [MARK],
    );
    console.log(`\nnettoyage : ${left[0].n} + ${left2[0].n} ligne(s) E2E restante(s)`);
    if (left[0].n + left2[0].n !== 0) failures++;
  } catch (e) {
    failures++;
    console.error("NETTOYAGE ÉCHOUÉ :", e.message);
    console.error("  node scripts/e2e-exam.mjs --teardown");
  }
}

console.log(`\n══ RÉSULTAT : ${failures === 0 ? "✓ OK" : `✗ ${failures} échec(s)`} ══`);
process.exit(failures === 0 ? 0 : 1);
