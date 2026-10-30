/**
 * Nettoyage / contrôle des lignes de test E2E en base de PRODUCTION.
 *
 * Les scripts de test ont changé de domaine (`@atherislabs.com`, qui
 * appartient à un TIERS, → `@example.com`, domaine réservé RFC 2606). Ce
 * script :
 *  1. RECENSE les lignes résiduelles sur l'ancien domaine (non couvertes par
 *     les filtres de nettoyage, qui visent désormais `@example.com`) ;
 *  2. les SUPPRIME (ordre : réponses → sessions → candidatures) ;
 *  3. vérifie qu'aucune ligne E2E ne subsiste, quel que soit le domaine.
 *
 *   node scripts/cleanup-e2e-emails.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);

async function rows(text, params = []) {
  const res = await sql.query(text, params);
  return res.rows ?? res;
}

console.log("══ 1. RELEVÉ (avant) ═════════════════════════════════════");
const legacy = await rows(
  `SELECT id, email_norm, status FROM job_applications
   WHERE email_norm LIKE '%atherislabs.com' ORDER BY created_at`,
);
console.log(`  lignes @atherislabs.com : ${legacy.length}`);
for (const l of legacy) console.log(`    ${l.email_norm}  [${l.status}]`);

const anyE2e = await rows(
  `SELECT count(*)::int AS n FROM job_applications
   WHERE email_norm LIKE 'e2e-%' OR email_norm LIKE '%@atherislabs.com'`,
);
console.log(`  lignes E2E (tout domaine) : ${anyE2e[0].n}`);

let deleted = { answers: 0, sessions: 0, apps: 0 };
if (legacy.length > 0 || anyE2e[0].n > 0) {
  console.log("\n══ 2. NETTOYAGE ═════════════════════════════════════════");

  // Les deux filtres : l'ancien domaine ET le préfixe e2e (n'importe quel domaine).
  const WHERE = `(email_norm LIKE 'e2e-%' OR email_norm LIKE '%atherislabs.com')`;

  const a = await rows(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE ${WHERE})) RETURNING id`,
  );
  const s = await rows(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE ${WHERE}) RETURNING id`,
  );
  const p = await rows(
    `DELETE FROM job_applications WHERE ${WHERE} RETURNING id`,
  );
  deleted = { answers: a.length, sessions: s.length, apps: p.length };
  console.log(
    `  supprimé : ${deleted.answers} réponse(s), ${deleted.sessions} session(s), ${deleted.apps} candidature(s)`,
  );
} else {
  console.log("\n  rien à nettoyer.");
}

console.log("\n══ 3. VÉRIFICATION (après) ═══════════════════════════════");
const after = await rows(
  `SELECT count(*)::int AS n FROM job_applications
   WHERE email_norm LIKE 'e2e-%' OR email_norm LIKE '%atherislabs.com'`,
);
console.log(`  lignes E2E résiduelles : ${after[0].n}`);

// Contrôle : le total RÉEL de candidatures ne doit avoir baissé que des
// lignes de test (si aucune ligne test, il ne doit pas bouger).
const total = await rows(`SELECT count(*)::int AS n FROM job_applications`);
console.log(`  total job_applications : ${total[0].n}`);

const ok = after[0].n === 0;
console.log(`\nRÉSULTAT : ${ok ? "✓ OK — aucune ligne de test résiduelle" : "✗ ÉCHEC"}`);
process.exit(ok ? 0 : 1);
