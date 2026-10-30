/**
 * Diagnostic ciblé : POURQUOI `saveSection` n'écrit rien.
 *
 * Capture pendant le franchissement d'une section :
 *  - les erreurs console navigateur ;
 *  - les requêtes sortantes (URL, statut, corps de réponse) ;
 *  - le texte d'état d'autosauvegarde rendu par l'UI ;
 *  - l'état réel en base.
 *
 *   node scripts/debug-exam-save.mjs
 */
import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
const BASE = "http://127.0.0.1:3000";
const MARK = "e2e-dbg@atherislabs.com";

async function rows(text, params = []) {
  const res = await sql.query(text, params);
  return res.rows ?? res;
}

// Session de debug.
await rows(`DELETE FROM job_applications WHERE email_norm = $1`, [MARK]);
const token = randomBytes(32).toString("hex");
const app = await rows(
  `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
   VALUES ('DBG','Debug',$1,$1,'en','exam_pending') RETURNING id`,
  [MARK],
);
await rows(
  `INSERT INTO exam_sessions (token,application_id,status,locale) VALUES ($1,$2,'in_progress','en')`,
  [token, app[0].id],
);
console.log(`session de debug : ${token}\n`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

const consoleLogs = [];
page.on("console", (m) => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => consoleLogs.push(`[pageerror] ${e.message}`));
page.on("response", async (r) => {
  const u = r.url();
  if (u.includes("/_next/") || u.includes(".png") || u.includes(".woff")) return;
  let body = "";
  try {
    if (r.request().method() === "POST") body = (await r.text()).slice(0, 300);
  } catch {}
  consoleLogs.push(`[net] ${r.request().method()} ${u.replace(BASE, "")} -> ${r.status()}${body ? ` | ${body}` : ""}`);
});

await page.goto(`${BASE}/en/examen/${token}`, { waitUntil: "networkidle" });
console.log("=== ÉTAT INITIAL ===");
console.log("  textarea count :", await page.locator("main textarea").count());
console.log("  radio count    :", await page.locator('main input[type="radio"]').count());

// Remplit la section 1 entièrement.
const tas = page.locator("main textarea");
for (let i = 0; i < await tas.count(); i++) {
  await tas.nth(i).fill("E2E réponse volontairement longue pour satisfaire le minimum de quarante caracteres du bareme.");
}
console.log("  text remplis   :", await tas.count());

consoleLogs.length = 0; // on ne garde que ce qui suit le clic
console.log("\n=== CLIC « Next section » ===");
await page.getByRole("button", { name: /next section/i }).click();
await page.waitForTimeout(2500);

console.log("\n--- console + réseau capturés ---");
for (const l of consoleLogs) console.log("  " + l);

// Texte d'état d'autosauvegarde rendu.
const statusText = await page
  .locator("main")
  .innerText()
  .then((t) => t.split("\n").filter((l) => /saving|saved|could not save|enregistr/i.test(l)));
console.log("\n--- libellé d'état affiché ---");
console.log("  " + (statusText.length ? statusText.join(" | ") : "(aucun)"));

const saved = await rows(
  `SELECT count(*)::int AS n FROM exam_answers
   WHERE session_id = (SELECT id FROM exam_sessions WHERE token = $1)`,
  [token],
);
console.log("\n--- base ---");
console.log(`  exam_answers : ${saved[0].n} ligne(s)`);

await browser.close();

// Nettoyage.
await rows(`DELETE FROM exam_answers WHERE session_id = (SELECT id FROM exam_sessions WHERE token = $1)`, [token]);
await rows(`DELETE FROM exam_sessions WHERE token = $1`, [token]);
await rows(`DELETE FROM job_applications WHERE email_norm = $1`, [MARK]);
const left = await rows(`SELECT count(*)::int AS n FROM job_applications WHERE email_norm = $1`, [MARK]);
console.log(`\nnettoyage : ${left[0].n} ligne(s) restante(s)`);
