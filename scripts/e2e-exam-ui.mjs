/**
 * E2E Playwright du parcours d'examen — pilote le formulaire RÉEL.
 *
 * Deux scénarios sur deux sessions créées par `e2e-exam.mjs` :
 *  A. « pass »  : 4 sections remplies, section 4 = OUI  → soumission OK,
 *                 candidature `exam_submitted`.
 *  B. « fail »  : même parcours mais section 4 = NON    → échec éliminatoire,
 *                 candidature `exam_failed`.
 *
 * Vérifie AUSSI l'autosauvegarde : après chaque section, les réponses doivent
 * être en base (c'est le cœur du design « rien n'est perdu »).
 *
 * Nettoyage en fin de script (teardown), MÊME en cas d'échec (finally).
 *
 *   node scripts/e2e-exam-ui.mjs
 */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { chromium } from "playwright";

config({ path: ".env.local" });
config({ path: ".env" });

const sql = neon(process.env.DATABASE_URL);
const BASE = "http://127.0.0.1:3000";
const MARK_LIKE = "e2e-%@atherislabs.com";

async function rows(text, params = []) {
  const res = await sql.query(text, params);
  return res.rows ?? res;
}

async function teardown() {
  await sql.query(
    `DELETE FROM exam_answers WHERE session_id IN
       (SELECT id FROM exam_sessions WHERE application_id IN
         (SELECT id FROM job_applications WHERE email_norm LIKE $1))`,
    [MARK_LIKE],
  );
  await sql.query(
    `DELETE FROM exam_sessions WHERE application_id IN
       (SELECT id FROM job_applications WHERE email_norm LIKE $1)`,
    [MARK_LIKE],
  );
  await sql.query(`DELETE FROM job_applications WHERE email_norm LIKE $1`, [MARK_LIKE]);
}

const results = [];
function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch();
let failed = false;

try {
  await teardown();

  // ── Création des deux sessions ────────────────────────────────────────────
  async function make(suffix) {
    const token = (await import("node:crypto")).randomBytes(32).toString("hex");
    const email = `e2e-${suffix}@atherislabs.com`;
    const app = await rows(
      `INSERT INTO job_applications (first_name,last_name,email,email_norm,locale,status)
       VALUES ($1,$2,$3,$3,'en','exam_pending') RETURNING id`,
      ["E2E", suffix.toUpperCase(), email],
    );
    await rows(
      `INSERT INTO exam_sessions (token,application_id,status,locale)
       VALUES ($1,$2,'in_progress','en')`,
      [token, app[0].id],
    );
    return { appId: app[0].id, token };
  }

  const pass = await make("pass");
  const fail = await make("fail");

  /** Remplit une section entière puis clique « Next ».
   *
   * `s4choice` = valeur À COCHER pour la question binaire de la section 4
   * (`"yes"` ou `"no"`). Attention au piège : sans valeur explicite, cocher
   * TOUS les radios fait gagner le dernier de la liste — ce qui a fait échouer
   * à tort le scénario « accepte » (il envoyait implicitement `no`).
   */
  async function fillSection(page, sectionIndex, s4choice) {
    // Textareas de la section courante.
    const textareas = page.locator("main textarea");
    const n = await textareas.count();
    for (let i = 0; i < n; i++) {
      await textareas.nth(i).fill(
        `E2E réponse suffisamment longue pour satisfaire le minimum du barème — section ${sectionIndex}.`,
      );
    }

    // Radios : toujours une cible EXPLICITE (jamais « tous »).
    const radios = page.locator('main input[type="radio"]');
    const rn = await radios.count();
    if (rn > 0) {
      const wanted = sectionIndex === 4 ? s4choice : null;
      if (wanted !== null) {
        await radios.first().locator(`xpath=../..`); // ancre visuelle (non bloquante)
        const target = page.locator(`main input[type="radio"][value="${wanted}"]`);
        if ((await target.count()) === 0) throw new Error(`radio value="${wanted}" introuvable`);
        await target.first().check();
      } else {
        // Sections de choix (2 et 3) : premier choix disponible, sans ambiguity.
        await radios.first().check();
      }
    }
  }

  /** Scénario complet sur un jeton. */
  async function runScenario(label, token, s4answer, expectFailed) {
    console.log(`\n══ SCÉNARIO : ${label} (section 4 = ${s4answer}) ══════════`);
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

    try {
      const resp = await page.goto(`${BASE}/en/examen/${token}`, {
        waitUntil: "networkidle",
        timeout: 30000,
      });
      check("page accessible (200)", resp?.status() === 200, `status=${resp?.status()}`);

      // L'en-tête + la section 1 sont présents.
      check("titre affiché", await page.locator("main h1").first().isVisible());

      let autosaveSeen = false;

      for (let s = 1; s <= 4; s++) {
        await fillSection(page, s, s4answer);

        if (s < 4) {
          const before = await page.locator("main h2").first().innerText();
          await page.getByRole("button", { name: /next section/i }).click();
          await page.waitForTimeout(900);
          const after = await page.locator("main h2").first().innerText();
          check(`section ${s} → navigation`, before !== after, `${before.slice(0, 24)} → ${after.slice(0, 24)}`);

          // Autosauvegarde : les réponses de la section doivent être en base.
          const saved = await rows(
            `SELECT count(*)::int AS n FROM exam_answers
             WHERE session_id = (SELECT id FROM exam_sessions WHERE token = $1) AND section = $2`,
            [token, s],
          );
          if (saved[0].n > 0) autosaveSeen = true;
          check(`autosauvegarde section ${s} en base`, saved[0].n > 0, `${saved[0].n} ligne(s)`);
        }
      }

      check("autosauvegarde globale observée", autosaveSeen);

      // Soumission.
      await page.getByRole("button", { name: /submit my assessment/i }).click();
      await page.waitForTimeout(2500);

      const body = await page.locator("main").innerText();
      if (expectFailed) {
        check("écran « non validé » affiché", /not passed/i.test(body), body.slice(0, 70).replace(/\n/g, " "));
      } else {
        check(
          "écran « soumis » affiché",
          /submitted|24 hours/i.test(body),
          body.slice(0, 70).replace(/\n/g, " "),
        );
      }

      // État en base.
      const st = await rows(
        `SELECT s.status AS session_status, a.status AS app_status
         FROM exam_sessions s JOIN job_applications a ON a.id = s.application_id
         WHERE s.token = $1`,
        [token],
      );
      check("session verrouillée (submitted)", st[0]?.session_status === "submitted", st[0]?.session_status);
      const expectedApp = expectFailed ? "exam_failed" : "exam_submitted";
      check(`candidature = ${expectedApp}`, st[0]?.app_status === expectedApp, st[0]?.app_status);

      const ans = await rows(
        `SELECT count(*)::int AS n FROM exam_answers
         WHERE session_id = (SELECT id FROM exam_sessions WHERE token = $1)`,
        [token],
      );
      // 10 questions au barème : 3 par section pour les sections 1 à 3, plus la
      // question éliminatoire de la section 4 (l'assertion « 9 » initialement
      // écrite était fausse, pas le produit).
      check("10 réponses stockées (barème complet)", ans[0].n === 10, `${ans[0].n}/10`);

      // Idempotence : re-soumettre ne doit PAS rejouer la décision.
      const again = await page.goto(`${BASE}/en/examen/${token}`, { waitUntil: "networkidle" });
      const body2 = await page.locator("main").innerText();
      check("re-ouverture → état « déjà soumis »", /already been used|already submitted|hear back/i.test(body2), `status=${again?.status()}`);
    } catch (err) {
      failed = true;
      check(label, false, `exception: ${err.message.split("\n")[0]}`);
    } finally {
      await page.close();
    }
  }

  await runScenario("A — accepte la commission", pass.token, "yes", false);
  await runScenario("B — refuse la commission", fail.token, "no", true);
} catch (err) {
  failed = true;
  console.error("\nERREUR FATALE :", err.message);
} finally {
  await browser.close();
  // Nettoyage TOUJOURS (même en cas d'échec) — la prod ne garde aucune ligne E2E.
  try {
    await teardown();
    const left = await rows(
      `SELECT count(*)::int AS n FROM job_applications WHERE email_norm LIKE $1`,
      [MARK_LIKE],
    );
    console.log(`\nNettoyage : ${left[0].n} ligne(s) E2E restante(s).`);
  } catch (e) {
    failed = true;
    console.error("NETTOYAGE ÉCHOUÉ — à exécuter manuellement :", e.message);
    console.error("  node scripts/e2e-exam.mjs --teardown");
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\n══ RÉSULTAT : ${passed}/${results.length} vérifications réussies ══`);
if (failed || passed !== results.length) {
  const bad = results.filter((r) => !r.ok);
  for (const b of bad) console.log(`  ÉCHEC : ${b.label} ${b.detail}`);
}
process.exit(failed || passed !== results.length ? 1 : 0);
