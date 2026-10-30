/**
 * Vérification du Lot 2 — écran « Start » + fenêtre 3 j.
 *
 * Scénarios sur le VRAI formulaire :
 *  A. session fraîche      → écran Start (pas le formulaire)
 *  B. clic « Start »       → bascule vers le formulaire + started_at repoussé
 *  C. session expirée      → état « expired » dédié
 *  D. session soumise      → état « déjà soumis » (non régressé)
 *
 * Nettoyage en `finally`.
 */
import { randomBytes } from "node:crypto";

import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
const BASE = "http://127.0.0.1:3000";
const PREFIX = "e2e-l2";

async function rows(t, p = []) {
  const r = await sql.query(t, p);
  return r.rows ?? r;
}

async function teardown() {
  await rows(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE email_norm LIKE $1))`,
    [`${PREFIX}-%`],
  );
  await rows(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE email_norm LIKE $1)`,
    [`${PREFIX}-%`],
  );
  await rows(`DELETE FROM job_applications WHERE email_norm LIKE $1`, [`${PREFIX}-%`]);
}

async function makeSession(
  suffix,
  { status = "in_progress", expiresAt = null, startedAt = null, submittedAt = null } = {},
) {
  const token = randomBytes(32).toString("hex");
  const email = `${PREFIX}-${suffix}@example.com`;
  const app = await rows(
    `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
     VALUES ('L2','E2E',$1,$1,'en',$2) RETURNING id`,
    [email, submittedAt ? "exam_submitted" : "exam_pending"],
  );
  // `started_at` est NOT NULL : on ne doit PAS passer la colonne quand on ne
  // veut pas la forcer — sinon `defaultNow()` ne s'applique pas et l'INSERT
  // échoue. On ne l'insère que si une valeur est fournie.
  await rows(
    `INSERT INTO exam_sessions (token,application_id,status,locale,expires_at,submitted_at)
     VALUES ($1,$2,$3,'en',$4,$5)`,
    [token, app[0].id, status, expiresAt, submittedAt],
  );
  if (startedAt !== null) {
    await rows(`UPDATE exam_sessions SET started_at = $2 WHERE token = $1`, [token, startedAt]);
  }
  return { token, appId: app[0].id };
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ ok });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
let fatal = false;

try {
  await teardown();
  const now = new Date();

  // ── A. Session fraîche : écran Start ────────────────────────────────────
  console.log("\n══ A. session fraîche → écran Start ════════════════════");
  // started_at = created_at (INSERT de création, même now()).
  const fresh = await makeSession("fresh", {
    expiresAt: new Date(now.getTime() + 3 * 86400_000),
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}/en/examen/${fresh.token}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  let txt = await page.locator("main").innerText();
  check("titre « You have an assessment »", /assessment to/i.test(txt));
  check("bouton « Start the assessment »", (await page.getByRole("button", { name: /start the assessment/i }).count()) === 1);
  check("mention des 3 jours", /3 days/i.test(txt));
  check("PAS de textarea (formulaire non rendu)", (await page.locator("main textarea").count()) === 0);

  // ── B. Clic Start → formulaire ──────────────────────────────────────────
  console.log("\n══ B. clic Start → formulaire + started_at ═════════════");
  const startedBefore = await rows(
    `SELECT started_at, created_at FROM exam_sessions WHERE token = $1`, [fresh.token],
  );
  await page.getByRole("button", { name: /start the assessment/i }).click();
  await page.waitForTimeout(2500);
  txt = await page.locator("main").innerText();
  check("formulaire rendu (textareas)", (await page.locator("main textarea").count()) > 0);
  check("section 1 affichée", /sales & objection/i.test(txt));

  const startedAfter = await rows(
    `SELECT started_at, created_at FROM exam_sessions WHERE token = $1`, [fresh.token],
  );
  const wasEqual =
    startedBefore[0].started_at.getTime() === startedBefore[0].created_at.getTime();
  const nowDiffers =
    startedAfter[0].started_at.getTime() > startedAfter[0].created_at.getTime();
  check("started_at == created_at AVANT le clic", wasEqual);
  check("started_at > created_at APRÈS le clic", nowDiffers);

  // ── C. Session expirée ──────────────────────────────────────────────────
  console.log("\n══ C. lien expiré → état dédié ════════════════════════");
  const expired = await makeSession("expired", {
    expiresAt: new Date(now.getTime() - 1000),
    startedAt: new Date(now.getTime() - 86400_000),
  });
  await page.goto(`${BASE}/en/examen/${expired.token}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  txt = await page.locator("main").innerText();
  check("titre « This link has expired »", /link has expired/i.test(txt));
  check("PAS de formulaire", (await page.locator("main textarea").count()) === 0);
  check("PAS de bouton Start", (await page.getByRole("button", { name: /start/i }).count()) === 0);

  // ── D. Session soumise (non régressé) ───────────────────────────────────
  console.log("\n══ D. déjà soumis → état dédié ═════════════════════════");
  const done = await makeSession("done", {
    status: "submitted",
    expiresAt: new Date(now.getTime() + 86400_000),
    startedAt: new Date(now.getTime() - 3600_000),
    submittedAt: new Date(now.getTime() - 600_000),
  });
  await page.goto(`${BASE}/en/examen/${done.token}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  txt = await page.locator("main").innerText();
  check("état « already submitted »", /already been used|already submitted/i.test(txt));
  check("PAS de formulaire", (await page.locator("main textarea").count()) === 0);

  await page.close();
} catch (err) {
  fatal = true;
  check("exception", false, err.message.split("\n")[0]);
} finally {
  await browser.close();
  try {
    await teardown();
    const left = await rows(
      `SELECT count(*)::int AS n FROM job_applications WHERE email_norm LIKE $1`,
      [`${PREFIX}-%`],
    );
    console.log(`\nnettoyage : ${left[0].n} ligne(s) restante(s)`);
    if (left[0].n !== 0) fatal = true;
  } catch (e) {
    fatal = true;
    console.error("NETTOYAGE ÉCHOUÉ :", e.message);
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n══ RÉSULTAT : ${passed}/${results.length} vérifications réussies ══`);
process.exit(fatal || passed !== results.length ? 1 : 0);
