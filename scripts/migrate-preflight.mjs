/**
 * PREFLIGHT migration — LECTURE SEULE (aucune écriture).
 *
 * Contexte : base de PRODUCTION. Avant toute écriture on veut savoir :
 *  1. où vit réellement le suivi Drizzle — le migrateur crée sa table dans le
 *     schéma `drizzle` (voir `neon-http/migrator.cjs` : `migrationsSchema`),
 *     PAS dans `public` ; une recherche limitée à `public` donne un faux
 *     négatif et ferait conclure à tort « aucune migration suivie » ;
 *  2. quelles migrations sont suivies et jusqu'à quand (`created_at` max) —
 *     la règle du migrateur est `!last || last.created_at < when` : table vide
 *     ou absente ⇒ TOUTES les migrations sont rejouées (0000 → 0007) ;
 *  3. un instantané de `job_applications` (lignes + CV) pour comparer
 *     AVANT/APRÈS et prouver qu'aucune donnée n'est perdue.
 *
 *   node scripts/migrate-preflight.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL absent — arrêt.");
  process.exit(1);
}
const sql = neon(url);

async function rows(text) {
  const res = await sql.query(text);
  return res.rows ?? res;
}

console.log("══ PREFLIGHT — lecture seule ══════════════════════════════\n");

// 1. Schémas présents.
const schemas = await rows("SELECT schema_name FROM information_schema.schemata ORDER BY 1");
console.log("Schémas : " + schemas.map((s) => s.schema_name).join(", "));

// 2. Où est le suivi Drizzle ? (TOUS schémas, pas seulement public)
const tracking = await rows(
  `SELECT table_schema, table_name FROM information_schema.tables
   WHERE table_name LIKE '%migration%' ORDER BY 1,2`,
);
if (tracking.length === 0) {
  console.log("\nSuivi Drizzle : AUCUNE table de suivi trouvée (tous schémas).");
  console.log("  → db:migrate rejouerait TOUTES les migrations (0000 → 0007).");
} else {
  for (const t of tracking) {
    const r = await rows(
      `SELECT count(*)::int AS n, max(created_at) AS last FROM "${t.table_schema}"."${t.table_name}"`,
    );
    console.log(
      `\nSuivi : ${t.table_schema}.${t.table_name} — ${r[0].n} migration(s), created_at max = ${r[0].last ?? "nul"}`,
    );
  }
}

// 3. Les tables cibles 0006 existent-elles déjà ?
const tables = await rows(
  `SELECT table_schema, table_name FROM information_schema.tables
   WHERE table_name IN ('exam_sessions','exam_answers','job_applications','interviews')
   ORDER BY 1,2`,
);
console.log("\nTables d'intérêt :");
for (const t of tables) console.log(`  ${t.table_schema}.${t.table_name}`);
const missing = ["exam_sessions", "exam_answers"].filter(
  (n) => !tables.some((t) => t.table_name === n),
);
console.log(`  → absentes (à créer) : ${missing.length ? missing.join(", ") : "aucune (déjà là)"}`);

// 4. Instantané de la table modifiée par 0007 (DROP NOT NULL).
const snap = await rows(
  `SELECT count(*)::int AS n, count(cv_bytes)::int AS with_cv FROM job_applications`,
);
console.log(`\njob_applications : ${snap[0].n} ligne(s), ${snap[0].with_cv} avec CV`);

const nullable = await rows(
  `SELECT column_name, is_nullable FROM information_schema.columns
   WHERE table_name='job_applications' AND column_name IN
     ('cv_filename','cv_mime_type','cv_byte_size','cv_bytes')
   ORDER BY 1`,
);
console.log("Colonnes CV (is_nullable) :");
for (const c of nullable) console.log(`  ${c.column_name.padEnd(14)} ${c.is_nullable}`);

// 5. Valeur max du journal → comparer avec created_at suivi.
const journal = JSON.parse(
  await (await import("node:fs/promises")).readFile("drizzle/meta/_journal.json", "utf8"),
);
console.log("\nJournal (8 entrées) :");
for (const e of journal.entries) console.log(`  ${e.tag}  when=${e.when}`);

console.log("\nLecture seule effectuée — aucune écriture.");
