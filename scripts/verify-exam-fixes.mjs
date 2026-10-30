/**
 * Vérification des deux correctifs signalés par le client.
 *
 * BUG 1 — « expected answer » affiché au CANDIDAT : `option.recommended`
 *   (repère de revue) était rendu dans `ExamForm`, à côté de la bonne
 *   réponse. Dans un test de qualification, c'est donner la solution.
 *
 * BUG 2 — message trompeur à la soumission : un examen à peine répondu
 *   renvoyait « Could not save - check your connection ». La cause n'avait
 *   RIEN à voir avec le réseau : c'était des questions vides, et le
 *   serveur répondait `incomplete` (mappé à tort sur `saveFailedLabel`).
 *
 * Ce script pilote le VRAI formulaire (Playwright) et vérifie :
 *   A. aucun « expected answer » / « réponse attendue » visible ;
 *   B. soumission incomplète → message EXACT + navigation vers la PREMIÈRE
 *      question vide + marquage visuel (bordure danger + libellé).
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
const MARK = "e2e-fix@example.com";

async function rows(t, p = []) {
  const r = await sql.query(t, p);
  return r.rows ?? r;
}

async function teardown() {
  await rows(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE email_norm = $1))`,
    [MARK],
  );
  await rows(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE email_norm = $1)`,
    [MARK],
  );
  await rows(`DELETE FROM job_applications WHERE email_norm = $1`, [MARK]);
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
  const token = randomBytes(32).toString("hex");
  const app = await rows(
    `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
     VALUES ('Fix','E2E',$1,$1,'en','exam_pending') RETURNING id`,
    [MARK],
  );
  await rows(
    `INSERT INTO exam_sessions (token,application_id,status,locale) VALUES ($1,$2,'in_progress','en')`,
    [token, app[0].id],
  );

  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await page.goto(`${BASE}/en/examen/${token}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);

  // ── BUG 1 : la réponse attendue ne doit PAS être visible ────────────────
  // NB : « Expected answer: two to four sentences » est l'INDICE DE LONGUEUR
  // des questions à texte libre (lib/exam.ts) — utile et légitime. Le repère
  // trichant, lui, vivait dans un libellé d'OPTION DE CHOIX et portait un
  // préfixe « ✓ ». On teste donc ces deux endroits précisément.
  console.log("\n══ BUG 1 — pas de réponse attendue côté candidat ═══════");
  const bodyText = await page.locator("main").innerText();
  check("pas de marqueur ✓ (signature du repère trichant)", !/✓/.test(bodyText));
  check(
    "pas de « réponse attendue » dans un libellé d'option",
    (await page.locator("main label").filter({ hasText: /reponse attendue/i }).count()) === 0,
  );

  // Atteindre la section 2 (question à choix) pour vérifier sur le QCM réel.
  const tas = page.locator("main textarea");
  for (let i = 0; i < (await tas.count()); i++) {
    await tas.nth(i).fill("Réponse de test suffisamment longue pour le minimum du barème ici.");
  }
  await page.getByRole("button", { name: /next section/i }).click();
  await page.waitForTimeout(900);

  const sec2Text = await page.locator("main").innerText();
  // Idem : les textareas de la section 2 portent l'indice de longueur
  // « Expected answer… ». On ne teste que les LIBELLÉS D'OPTION.
  check(
    "section 2 (QCM) : aucun repère dans les options",
    (await page.locator("main label").filter({ hasText: /expected answer|r\u00e9ponse attendue/i }).count()) === 0,
  );
  check("section 2 : aucun marqueur ✓", !/✓/.test(sec2Text));
  const radioCount = await page.locator('main input[type="radio"]').count();
  check("les 4 options du QCM sont bien rendues", radioCount === 4, `${radioCount} radio(s)`);

  // ── BUG 2 : soumission incomplète → message exact + navigation ──────────
  console.log("\n══ BUG 2 — message de soumission incomplète ═══════════");
  // On saute directement à la dernière section : les sections 2 à 4 sont
  // donc VIDES, ce qui reproduit exactement le cas du client.
  for (let s = 2; s <= 3; s++) {
    await page.getByRole("button", { name: /next section/i }).click();
    await page.waitForTimeout(800);
  }
  const h2Before = await page.locator("main h2").first().innerText();
  check("on est en section 4", /commission/i.test(h2Before), h2Before.slice(0, 30));

  // Section 4 : on répond « oui » pour isoler le cas (l'éliminatoire n'est
  // PAS le problème ici, ce sont les autres sections vides).
  const yes = page.locator('main input[type="radio"][value="yes"]');
  if ((await yes.count()) > 0) await yes.first().check();

  await page.getByRole("button", { name: /submit my assessment/i }).click();
  await page.waitForTimeout(2000);

  const after = await page.locator("main").innerText();

  check("PAS de message réseau", !/check your connection/i.test(after));
  check("message EXACT (questions vides)", /still empty/i.test(after));
  check("précise le retour à la 1ʳᵉ question", /first one/i.test(after));

  // Navigation vers la première section incomplète (section 2 = la première
  // laissée vide, la 1 étant remplie).
  const h2After = await page.locator("main h2").first().innerText();
  check("navigation vers la section incomplète", /tech|software/i.test(h2After), h2After.slice(0, 34));

  // Marquage visuel des questions vides.
  const marked = await page.locator('main .border-danger').count();
  check("questions vides marquées (bordure danger)", marked > 0, `${marked} carte(s)`);
  check("libellé « This question is empty »", /This question is empty/i.test(after));

  // La soumission n'a PAS dû passer : la session reste in_progress.
  const st = await rows(
    `SELECT s.status FROM exam_sessions s WHERE s.token = $1`,
    [token],
  );
  check("session NON soumise (verrou intact)", st[0]?.status === "in_progress", st[0]?.status);

  await page.close();
} catch (err) {
  fatal = true;
  check("exception", false, err.message.split("\n")[0]);
} finally {
  await browser.close();
  try {
    await teardown();
    const left = await rows(`SELECT count(*)::int AS n FROM job_applications WHERE email_norm = $1`, [MARK]);
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
