/**
 * Preflight L1 — LECTURE SEULE. Vérifie l'état de la base avant d'appliquer
 * 0008 : suivi Drizzle, tables déjà présentes, colonnes cibles.
 *
 *   node scripts/preflight-l1.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
async function rows(t) {
  const r = await sql.query(t);
  return r.rows ?? r;
}

console.log("══ PREFLIGHT L1 — lecture seule ═══════════════════════════\n");

const tracked = await rows(
  `SELECT count(*)::int AS n, max(created_at) AS last FROM drizzle.__drizzle_migrations`,
);
console.log(`Suivi Drizzle : ${tracked[0].n} migration(s), created_at max = ${tracked[0].last}`);

const tables = await rows(
  `SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name IN
     ('payout_details','identity_docs','contract_consents','users','exam_sessions')
   ORDER BY 1`,
);
console.log(`Tables cibles présentes : ${tables.length ? tables.map((t) => t.table_name).join(", ") : "aucune (à créer)"}`);

const cols = await rows(
  `SELECT table_name, column_name FROM information_schema.columns
   WHERE table_name='users' AND column_name IN ('verified_at','identity_rejection_reason')`,
);
console.log(`Colonnes KYC sur users : ${cols.length ? cols.map((c) => c.column_name).join(", ") : "absentes (à ajouter)"}`);

const ex = await rows(
  `SELECT column_name FROM information_schema.columns
   WHERE table_name='exam_sessions' AND column_name='expires_at'`,
);
console.log(`exam_sessions.expires_at : ${ex.length ? "présente" : "absente (à ajouter)"}`);

const users = await rows(`SELECT count(*)::int AS n FROM users`);
console.log(`\nComptes users : ${users[0].n}`);

console.log("\nLecture seule — aucune écriture.");
