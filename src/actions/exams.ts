"use server";

/**
 * Atheris — Server Actions du pipeline d'examen zero-interview (Lot 2b).
 *
 * ─── SÉCURITÉ — DEUX MODÈLES DISTINCTS ───────────────────────────────────────
 * • `saveSection` / `submitExam` sont des actions **PUBLIQUES** : aucun compte,
 *   aucune session Auth.js — le candidat est anonyme. L'authentification est le
 *   **jeton** (`exam_sessions.token`, 32 bytes hex). Un id d'application ne
 *   suffit jamais : il est public et devinable, le jeton ne l'est pas.
 * • `startExamFromApplication` est réservée au **dépôt de candidature** (même
 *   fenêtre/rate-limit que `applyToJob`, appelée depuis elle).
 *
 * ─── ANTIMIMÉTISME ──────────────────────────────────────────────────────────
 * • `saveSection` → `onConflictDoUpdate` sur `(session_id, question_id)` :
 *   re-sauvegarder écrase sa propre ligne, jamais d'empilement.
 * • `submitExam` → UPDATE **conditionnelle** `WHERE status = 'in_progress'` :
 *   0 ligne = déjà soumis → `conflict`, un double-clic ne rejoue jamais la
 *   décision (gabarit `decideApplication`).
 *
 * ─── DB-PENDING ─────────────────────────────────────────────────────────────
 * `getDb()` est appelé lazy, à l'intérieur des fonctions : `next build` ne lit
 * jamais `DATABASE_URL`.
 */

import { randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { getDb } from "@/lib/db";
import {
  examAnswers,
  examSessions,
  jobApplications,
} from "@/lib/db/schema";
import {
  EXAM_MAX_ANSWER_CHARS,
  EXAM_QUESTIONS,
  EXAM_TOKEN_BYTES,
  EXAM_TOKEN_PATTERN,
  isEliminatoryFailure,
  questionsForSection,
  sectionAnswersAreCoherent,
  validateAnswer,
  type ExamSection,
} from "@/lib/exam";

// ---------------------------------------------------------------------------
// Schémas Zod — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const tokenSchema = z.string().regex(EXAM_TOKEN_PATTERN);

const sectionSchema = z.number().int().min(1).max(4);

/** Réponses : `questionId` → texte. Taille bornée (anti-payload géant). */
const answersSchema = z.record(
  z.string().max(16),
  z.string().max(EXAM_MAX_ANSWER_CHARS),
);

// ---------------------------------------------------------------------------
// Rate-limit (motif `careers.ts` / `contact.ts` — Map module-scope, best effort).
// ---------------------------------------------------------------------------

/** Fenêtre glissante : 4 sections + reprises ≈ 20 envois largement suffisants. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_SENDS = 30;
const RATE_MAP_PRUNE_SIZE = 1000;
const RATE_MAP_CLEAR_SIZE = 10_000;

const rateSends = new Map<string, number[]>();

function isRateLimited(key: string, now: number): boolean {
  const hits = rateSends.get(key);
  if (hits === undefined) return false;
  const recent = hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length === 0) {
    rateSends.delete(key);
    return false;
  }
  rateSends.set(key, recent);
  return recent.length >= RATE_MAX_SENDS;
}

function recordRateSend(key: string, now: number): void {
  if (rateSends.size > RATE_MAP_PRUNE_SIZE) {
    for (const [k, hits] of rateSends) {
      if (hits.every((t) => now - t >= RATE_WINDOW_MS)) rateSends.delete(k);
    }
    if (rateSends.size > RATE_MAP_CLEAR_SIZE) rateSends.clear();
  }
  rateSends.set(key, [...(rateSends.get(key) ?? []), now]);
}

// ---------------------------------------------------------------------------
// Contrats publics (uniquement des `export type` — effacés à la compilation).
// ---------------------------------------------------------------------------

export type SaveSectionResult =
  | { ok: true; saved: number }
  | { ok: false; code: "invalid" | "not_found" | "locked" | "rate_limited" | "failed" };

export type SubmitExamResult =
  | { ok: true; failed: boolean }
  | {
      ok: false;
      code: "invalid" | "not_found" | "locked" | "incomplete" | "rate_limited" | "failed";
    };

// ---------------------------------------------------------------------------
// Aide interne — résolution du jeton → session.
// ---------------------------------------------------------------------------

/**
 * Charge la session portée par un jeton.
 *
 * @returns `null` si le jeton est malformé, inconnu, ou si la session est
 *   **déjà soumise** — dans les trois cas l'appelant répond `not_found` /
 *   `locked` selon le contexte. L'erreur DB se propage (jamais confondue avec
 *   une absence : un incident ne doit pas passer pour un refus).
 */
async function loadSession(token: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: examSessions.id,
      applicationId: examSessions.applicationId,
      status: examSessions.status,
      locale: examSessions.locale,
      startedAt: examSessions.startedAt,
    })
    .from(examSessions)
    .where(eq(examSessions.token, token))
    .limit(1);
  return rows[0];
}

// ---------------------------------------------------------------------------
// saveSection — autosauvegarde idempotente d'une section.
// ---------------------------------------------------------------------------

/**
 * Sauvegarde les réponses d'une section (appelée en franchissant chaque
 * section, JAMAIS en fin de parcours).
 *
 * C'est le garde-fou réseau : sur mobile à connection instable, une coupure
 * n'efface rien — seule la section en cours reste à refaire. Un envoi global
 * en fin de parcours perdrait TOUT le candidat à la dernière seconde.
 *
 * @param input `{ token, section, answers }` — les réponses doivent couvrir
 *   exactement les questions de cette section (cohérence barème).
 */
export async function saveSection(input: {
  token: string;
  section: number;
  answers: Record<string, string>;
}): Promise<SaveSectionResult> {
  // 1. Zod — avant toute lecture DB.
  const parsedToken = tokenSchema.safeParse(input?.token);
  const parsedSection = sectionSchema.safeParse(input?.section);
  const parsedAnswers = answersSchema.safeParse(input?.answers);
  if (!parsedToken.success || !parsedSection.success || !parsedAnswers.success) {
    return { ok: false, code: "invalid" };
  }
  // `answers` doit être un objet PLAT (un tableau ou `null` passent `record`
  // dans certains cas de forge) : re-garde structurelle.
  if (typeof input.answers !== "object" || input.answers === null || Array.isArray(input.answers)) {
    return { ok: false, code: "invalid" };
  }

  const section = parsedSection.data as ExamSection;
  const answers = parsedAnswers.data;

  // 2. Cohérence barème : les clés reçues == les questions de cette section.
  if (!sectionAnswersAreCoherent(section, answers)) return { ok: false, code: "invalid" };

  // 3. Validation métier de CHAQUE réponse (longueur / clé d'option).
  for (const question of questionsForSection(section)) {
    if (!validateAnswer(question, answers[question.id]).valid) {
      return { ok: false, code: "invalid" };
    }
  }

  const now = Date.now();
  const key = `exam:${parsedToken.data}`;
  if (isRateLimited(key, now)) return { ok: false, code: "rate_limited" };

  try {
    const session = await loadSession(parsedToken.data);
    if (session === undefined) return { ok: false, code: "not_found" };
    // Déjà soumise : verrouillée, on ne réécrit plus (sans distinguer « inconnu »
    // d'une candidature fermée côté public).
    if (session.status !== "in_progress") return { ok: false, code: "locked" };
    // Session orpheline (candidature supprimée) : rien à rattacher.
    if (session.applicationId === null) return { ok: false, code: "not_found" };

    const db = getDb();
    // 4. Écriture en batch (neon-http : aucun `db.transaction()`) — chaque
    //    ligne porte son `onConflictDoUpdate` → idempotence par section.
    //    Annoté `BatchItem<"pg">` explicitement (motif exact de `notify.ts`) :
    //    sans elle, l'inférence de `map` ne produit pas le tuple attendu par
    //    `db.batch()`.
    const statements = questionsForSection(section).map((question) => ({
      sessionId: session.id,
      section,
      questionId: question.id,
      answer: (answers[question.id] ?? "").trim(),
    }));

    const items: BatchItem<"pg">[] = statements.map(
      (row): BatchItem<"pg"> =>
        db
          .insert(examAnswers)
          .values(row)
          .onConflictDoUpdate({
            target: [examAnswers.sessionId, examAnswers.questionId],
            set: { answer: row.answer, updatedAt: sql`now()` },
          }),
    );
    // Tuple non vide garanti : une section compte au moins une question.
    const [first, ...rest] = items;
    if (first === undefined) return { ok: false, code: "invalid" };
    await db.batch([first, ...rest]);

    recordRateSend(key, now);
    return { ok: true, saved: items.length };
  } catch (error) {
    console.error("[exams] échec de sauvegarde de section", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// submitExam — verrouillage + décision éliminatoire.
// ---------------------------------------------------------------------------

/**
 * Soumet l'examen : recharge TOUTES les réponses depuis la base, les
 * ré-valide, applique la règle éliminatoire de la section 4, puis verrouille.
 *
 * Les réponses ne sont PAS relues du client : elles viennent de la base (écrites
 * par `saveSection`). Le client n'envoie que le jeton — un client compromis ne
 * peut donc pas faire transiter une réponse qu'il n'a pas déjà fait accepter.
 *
 * @returns `failed: true` = section 4 refusée → la candidature passe en
 *   `exam_failed` (rejet automatique, sans revue CEO : un « non » ne
 *   s'améliore pas en relisant).
 */
export async function submitExam(input: {
  token: string;
}): Promise<SubmitExamResult> {
  const parsedToken = tokenSchema.safeParse(input?.token);
  if (!parsedToken.success) return { ok: false, code: "invalid" };
  const token = parsedToken.data;

  const now = Date.now();
  const key = `exam-submit:${token}`;
  if (isRateLimited(key, now)) return { ok: false, code: "rate_limited" };

  try {
    const session = await loadSession(token);
    if (session === undefined) return { ok: false, code: "not_found" };
    if (session.status !== "in_progress") return { ok: false, code: "locked" };
    if (session.applicationId === null) return { ok: false, code: "not_found" };

    const db = getDb();

    // 1. Recharge TOUTES les réponses depuis la base.
    const rows = await db
      .select({ questionId: examAnswers.questionId, answer: examAnswers.answer })
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, session.id));
    const stored = new Map(rows.map((r) => [r.questionId, r.answer]));

    // 2. Complétude + ré-validation (une ligne altérée en base ne passe pas).
    for (const question of EXAM_QUESTIONS) {
      const verdict = validateAnswer(question, stored.get(question.id));
      if (!verdict.valid) return { ok: false, code: "incomplete" };
    }

    // 3. Règle éliminatoire (section 4).
    const failed = isEliminatoryFailure(stored);

    // 4. VERROU : 0 ligne = déjà soumis (double-clic / requête rejouée).
    const locked = await db
      .update(examSessions)
      .set({
        status: "submitted",
        submittedAt: sql`now()`,
        elapsedSeconds: sql`GREATEST(0, EXTRACT(EPOCH FROM (now() - ${session.startedAt}::timestamptz))::int)`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(examSessions.id, session.id), eq(examSessions.status, "in_progress")))
      .returning({ id: examSessions.id });
    if (locked.length === 0) return { ok: false, code: "locked" };

    // 5. Statut de la CANDIDATURE — la file de revue CEO en dépend.
    //    `exam_failed` = rejet automatique (pas de revue) ; `exam_submitted` =
    //    file de revue « < 24 h ».
    await db
      .update(jobApplications)
      .set({
        status: failed ? "exam_failed" : "exam_submitted",
        ...(failed ? { rejectedAt: sql`now()` } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(jobApplications.id, session.applicationId));

    recordRateSend(key, now);
    return { ok: true, failed };
  } catch (error) {
    console.error("[exams] échec de soumission", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// startExam — création de session (fenêtre `applyToJob`).
// ---------------------------------------------------------------------------

/**
 * Crée la session d'examen d'une candidature et renvoie son jeton.
 *
 * Appelée depuis `applyToJob` APRÈS l'INSERT de la candidature (FK): le lien
 * est donc généré AUTOMATIQUEMENT au dépôt — aucune intervention CEO, c'est
 * tout l'intérêt du zero-interview.
 *
 * NON FATALE : si la création échoue, la candidature reste en base avec le
 * statut `nouveau` et le CEO peut générer un lien manuellement. Un candidat ne
 * doit jamais perdre sa candidature à cause du sous-système d'examen.
 *
 * @param applicationId Id fraîchement inséré.
 * @param locale Langue du parcours (miroir de la candidature).
 * @returns Le jeton, ou `null` en cas d'échec.
 */
export async function startExam(
  applicationId: string,
  locale: "fr" | "en",
): Promise<string | null> {
  const token = randomBytes(EXAM_TOKEN_BYTES).toString("hex");
  try {
    const db = getDb();
    await db.insert(examSessions).values({
      token,
      applicationId,
      status: "in_progress",
      locale,
    });
    return token;
  } catch (error) {
    // NON FATAL : la candidature existe déjà — on ne la fait pas échouer pour
    // un sous-système dégradé (le CEO garde un recours manuel).
    console.error("[exams] session non créée (candidature conservée)", error);
    return null;
  }
}

// NOTE : aucun helper sync ici. Un fichier `"use server"` n'autorise que des
// fonctions ASYNC (contrainte RSC — `examRelativeUrl` vit donc dans
// `src/lib/exam.ts`). `SECTION_TITLES` / `EXAM_SECTIONS` sont également
// importés depuis `@/lib/exam` : les réexporter ici casserait le build RSC
// (tsc passe de toute façon, la contrainte n'est pas typée).
