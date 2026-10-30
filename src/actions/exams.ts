"use server";

/**
 * Atheris — Server Actions du pipeline d'examen zero-interview (Lot 2b).
 *
 * ─── SÉCURITÉ — TROIS MODÈLES DISTINCTS ─────────────────────────────────────
 * • `saveSection` / `submitExam` sont des actions **PUBLIQUES** : aucun compte,
 *   aucune session Auth.js — le candidat est anonyme. L'authentification est le
 *   **jeton** (`exam_sessions.token`, 32 bytes hex). Un id d'application ne
 *   suffit jamais : il est public et devinable, le jeton ne l'est pas.
 * • `startExamFromApplication` est réservée au **dépôt de candidature** (même
 *   fenêtre/rate-limit que `applyToJob`, appelée depuis elle).
 * • `listExamReviewSessions` / `getExamReviewSession` sont réservées au **CEO**
 *   (espace `/espace/examen`) : acteur reconstruit en session + rôle relu par
 *   Zod — motif exact de `activeActor()` dans `src/actions/recrutement.ts`.
 *   Le jeton public n'est JAMAIS projeté dans ces résultats.
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

import { and, eq, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { z } from "zod";

import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import {
  examAnswers,
  examSessions,
  jobApplications,
  recruitmentTemplates,
  roleEnum,
} from "@/lib/db/schema";
// `import type` + `typeof` : les types STATUTS sont dérivés des enums Drizzle
// (source de vérité unique) et effacés à la compilation — motif exact de
// `src/actions/recrutement.ts`.
import type { applicationStatusEnum, examStatusEnum } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { activeUserIdsByRoles, notify } from "@/lib/notify";
import type { Role } from "@/lib/permissions";
import {
  DEFAULT_EMAIL_TEMPLATES,
  renderTemplate,
  type EmailTemplateKind,
} from "@/lib/recruitment-templates";
import {
  EXAM_MAX_ANSWER_CHARS,
  EXAM_QUESTIONS,
  EXAM_TOKEN_BYTES,
  EXAM_TOKEN_PATTERN,
  examExpiryFrom,
  isExamExpired,
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

/** Rôle d'acteur relu côté serveur sur l'enum Drizzle `role` (motif Zod du
 *  contrat `recruitCandidate`) : un JWT périmé ne franchit jamais la garde. */
const roleSchema = z.enum(roleEnum.enumValues);

/** Id de session (revue CEO) : uuid validé AVANT toute requête. */
const sessionIdSchema = z.uuid();

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
// Contrats de la REVUE CEO (`/espace/examen`) — lecture seule, CEO seul.
// Le jeton public (`exam_sessions.token`) n'apparaît dans AUCUN d'eux.
// ---------------------------------------------------------------------------

/** Statut d'une candidature, dérivé de l'enum Drizzle `application_status`. */
export type ExamReviewApplicationStatus =
  (typeof applicationStatusEnum.enumValues)[number];

/** Statut d'une session d'examen, dérivé de l'enum Drizzle `exam_status`. */
export type ExamReviewSessionStatus = (typeof examStatusEnum.enumValues)[number];

/** Une session de la file de revue — dates ISO 8601 (sérialisables). */
export type ExamReviewSessionItem = {
  sessionId: string;
  applicationId: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Variante linguistique de la candidature (e-mail de décision). */
  locale: "fr" | "en";
  sessionStatus: ExamReviewSessionStatus;
  /** Toujours renseigné (colonne NOT NULL `defaultNow()`). */
  startedAt: string;
  /** `null` tant que le candidat n'a pas soumis. */
  submittedAt: string | null;
  /** Fin de validité du lien (fenêtre 3 j, H1) — `null` sans limite. */
  expiresAt: string | null;
  /** Durée mesurée (indicative, jamais bloquante) — `null` tant que non soumis. */
  elapsedSeconds: number | null;
  applicationStatus: ExamReviewApplicationStatus;
};

/** Une réponse projetée pour la revue CEO (100 % sérialisable). */
export type ExamReviewAnswerItem = {
  /** 1–4 (section du barème). */
  section: number;
  questionId: string;
  answer: string;
  /** Dernière autosauvegarde de cette réponse (`null` jamais observée en DB). */
  updatedAt: string | null;
};

/** Détail d'une session : réponses + étiquette de candidature. */
export type ExamReviewSessionDetail = ExamReviewSessionItem & {
  answers: ExamReviewAnswerItem[];
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

    // 6. Suite post-soumission — NON FATALE : la soumission est DÉJÀ faite et
    //    le verrou posé. Un échec mail/notification ne la fait jamais échouer
    //    (le candidat a son écran de confirmation, le CEO verra la ligne dans
    //    la liste) — on journalise seulement.
    await notify({
      type: "exam_submitted",
      link: "/espace/recrutement",
      meta: { entity: session.applicationId },
      recipientIds: await activeUserIdsByRoles(["ceo"]),
    });

    const mailResult = await sendExamResultEmail({
      applicationId: session.applicationId,
      locale: session.locale === "en" ? "en" : "fr",
      failed,
    });
    if (!mailResult.ok) {
      console.error("[exams] soumission OK mais e-mail de résultat non envoyé", mailResult.error);
    }

    recordRateSend(key, now);
    return { ok: true, failed };
  } catch (error) {
    console.error("[exams] échec de soumission", error);
    return { ok: false, code: "failed" };
  }
}

/**
 * Résout un modèle d'e-mail : personnalisation en base d'abord, sinon défaut.
 *
 * Même logique que `getEmailTemplate` de `src/actions/recrutement.ts`, SANS la
 * garde d'acteur — ce helper est appelé depuis `submitExam`, action PUBLIQUE
 * exécutée par un candidat anonyme (aucune session CEO à revérifier : seuls
 * des `kind`/`locale` validés par le type atteignent la requête).
 *
 * Les kinds `exam_*` sont absents de `emailKindSchema` (modal CEO) — c'est
 * volontaire : ce modal n'envoie que `invite`/`reject`, pilotés à la main.
 */
async function resolveEmailTemplate(
  kind: EmailTemplateKind,
  locale: "fr" | "en",
): Promise<{ subject: string; body: string }> {
  const db = getDb();
  const rows = await db
    .select({
      subject: recruitmentTemplates.subject,
      body: recruitmentTemplates.body,
    })
    .from(recruitmentTemplates)
    .where(
      and(eq(recruitmentTemplates.kind, kind), eq(recruitmentTemplates.locale, locale)),
    )
    .limit(1);

  const row = rows[0];
  if (row !== undefined) return row;
  return DEFAULT_EMAIL_TEMPLATES[kind][locale];
}

/**
 * Envoie l'e-mail de résultat au candidat (kind `exam_passed` / `exam_failed`).
 *
 * **Jamais fatal** : renvoie `{ ok: false, error }` au lieu de throw, motif
 * exact de `sendMail` — un échec Resend n'annule jamais une soumission déjà
 * verrouillée. Le destinataire est lu EN BASE (jamais issu du jeton public).
 *
 * @param args Identifiant de candidature, locale du parcours, éliminatoire.
 */
async function sendExamResultEmail(args: {
  applicationId: string;
  locale: "fr" | "en";
  failed: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, args.applicationId))
      .limit(1);
    const candidate = rows[0];
    // Candidature disparue entre-temps : rien à envoyer, pas une erreur.
    if (candidate === undefined) return { ok: true };

    const kind: EmailTemplateKind = args.failed ? "exam_failed" : "exam_passed";
    const template = await resolveEmailTemplate(kind, args.locale);
    const body = renderTemplate(template.body, {
      prenom: candidate.firstName,
      nom: candidate.lastName,
    });

    return await sendMail({
      to: candidate.email,
      subject: template.subject,
      text: body,
    });
  } catch (error) {
    console.error("[exams] e-mail de résultat non envoyé", error);
    return { ok: false, error: "exception" };
  }
}

// ---------------------------------------------------------------------------
// beginExam — le clic « Start » du candidat.
// ---------------------------------------------------------------------------

/** Contrat de `beginExam` — union discriminée par `ok`. */
export type BeginExamResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid" | "not_found" | "locked" | "expired";
    };

/**
 * Ouvre effectivement l'examen : repousse `started_at` à l'instant du clic.
 *
 * Pourquoi ce n'est pas fait à la création : la session naît au dépôt de la
 * candidature, mais le candidat peut attendre avant de commencer (il a 3 j).
 * Si le chrono comptait depuis le dépôt, un candidat qui démarre au bout de
 * deux jours afficherait « 48 h d'examen » — faux, et le CEO en déduirait à
 * tort un examen abandonné. Le temps affiché doit être le temps passé sur
 * l'examen, pas celui passé à procrastiner.
 *
 * UPDATE conditionnelle `WHERE status = 'in_progress'` : un double-clic ou
 * deux onglets ne produisent qu'une seule réécriture, et une session déjà
 * soumise ne peut pas être « rouverte » par ce chemin.
 *
 * Une session EXPIRÉE (D6) renvoie `expired` : le lien n'est plus valide et
 * le CEO doit en régénérer un — le candidat n'a plus accès.
 *
 * @param input `{ token }` — 64 chars hex, validés avant toute requête.
 */
export async function beginExam(input: { token: string }): Promise<BeginExamResult> {
  const parsedToken = tokenSchema.safeParse(input?.token);
  if (!parsedToken.success) return { ok: false, code: "invalid" };
  const token = parsedToken.data;

  try {
    const db = getDb();
    const rows = await db
      .select({
        id: examSessions.id,
        status: examSessions.status,
        expiresAt: examSessions.expiresAt,
        startedAt: examSessions.startedAt,
      })
      .from(examSessions)
      .where(eq(examSessions.token, token))
      .limit(1);
    const session = rows[0];
    // Jeton inconnu — aucune distinction (anti-énumération, motif du reste
    // du parcours).
    if (session === undefined) return { ok: false, code: "not_found" };
    // Déjà soumis : verrouillé, pas de « réouverture ».
    if (session.status !== "in_progress") return { ok: false, code: "locked" };
    // Lien expiré (D6).
    if (isExamExpired(session.expiresAt)) return { ok: false, code: "expired" };

    // Repousse `started_at` — CONDITIONNEL, idempotent.
    const updated = await db
      .update(examSessions)
      .set({ startedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(examSessions.id, session.id), eq(examSessions.status, "in_progress")))
      .returning({ id: examSessions.id });
    // 0 ligne = un concurrent l'a soumise entre le SELECT et l'UPDATE.
    if (updated.length === 0) return { ok: false, code: "locked" };

    return { ok: true };
  } catch (error) {
    console.error("[exams] échec d'ouverture de l'examen", error);
    return { ok: false, code: "invalid" };
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
      // Fenêtre 3 j (D6). Calculée à la CRÉATION — dans le flux normal la
      // session naît à la seconde près de la candidature, donc cela
      // satisfait « 3 j depuis la candidature » ; et lors d'une
      // RÉGÉNÉRATION par le CEO sur une candidature ancienne, la fenêtre
      // repart de la régénération (un lien expiré d'avance ne servirait à
      // rien).
      expiresAt: examExpiryFrom(new Date()),
    });
    return token;
  } catch (error) {
    // NON FATAL : la candidature existe déjà — on ne la fait pas échouer pour
    // un sous-système dégradé (le CEO garde un recours manuel).
    console.error("[exams] session non créée (candidature conservée)", error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Revue CEO — /espace/examen : liste puis détail des réponses.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js reconstruite **côté serveur** — copie du helper privé de
 * `src/actions/recrutement.ts` (un fichier `"use server"` n'autorise que des
 * fonctions async : le helper reste local, jamais exporté).
 *
 * Le rôle est REVALIDÉ par Zod sur `roleEnum.enumValues` : le JWT peut
 * provenir d'un ancien schéma et ne fait pas foi à lui seul.
 *
 * @returns `null` si aucune session, compte non `active`, ou rôle non `ceo`.
 */
async function activeActor(): Promise<{ id: string; role: Role } | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  const parsedRole = roleSchema.safeParse(session.user.role);
  if (!parsedRole.success || parsedRole.data !== "ceo") return null;
  return { id: session.user.id, role: parsedRole.data };
}

/**
 * Rétrécit une `locale` relue en base (colonne `text`) vers le tuple
 * `"fr" | "en"` du contrat public — repli sûr sur `"fr"` (miroir exact de
 * `asLocale` dans `src/actions/recrutement.ts`).
 */
function asLocale(value: string): "fr" | "en" {
  return value === "en" ? "en" : "fr";
}

/** Volume maximal renvoyé par `listExamReviewSessions` (plafond de payload). */
const REVIEW_LIST_LIMIT = 200;

/**
 * Liste les sessions d'examen à traiter (page `/espace/examen`, CEO seul).
 *
 * ─── FILTRE H3 « ARCHIVÉS » ─────────────────────────────────────────────────
 * Les candidatures `recrute` / `refuse` / `exam_failed` sont EXCLUES : ce sont
 * les décisions déjà prises. C'est un **filtre de requête**, pas un statut —
 * aucune migration, aucun nouveau statut. Une décision prise via la page fait
 * donc tomber la ligne hors de la liste au prochain `router.refresh()`.
 *
 * ─── TRI ────────────────────────────────────────────────────────────────────
 * `in_progress` d'abord (file « à faire »), puis `submitted` (file de revue
 * « < 24 h »), chacun du plus récent au plus ancien.
 *
 * ─── SÉCURITÉ ───────────────────────────────────────────────────────────────
 * Session `active` + rôle `ceo` revalidé côté serveur (PII candidats). Le
 * jeton public n'est PAS projeté : il ne quitte jamais `exam_sessions` par ce
 * chemin.
 *
 * @returns `{ ok: true; items }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function listExamReviewSessions(): Promise<
  { ok: true; items: ExamReviewSessionItem[] } | { ok: false; code: "forbidden" }
> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        sessionId: examSessions.id,
        sessionStatus: examSessions.status,
        startedAt: examSessions.startedAt,
        submittedAt: examSessions.submittedAt,
        expiresAt: examSessions.expiresAt,
        elapsedSeconds: examSessions.elapsedSeconds,
        applicationId: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        locale: jobApplications.locale,
        applicationStatus: jobApplications.status,
        // NB : `examSessions.token` n'est JAMAIS sélectionné ici.
      })
      .from(examSessions)
      // INNER JOIN : une session orpheline (candidature supprimée) n'a rien à
      // montrer au CEO.
      .innerJoin(jobApplications, eq(examSessions.applicationId, jobApplications.id))
      .where(
        and(
          ne(jobApplications.status, "recrute"),
          ne(jobApplications.status, "refuse"),
          ne(jobApplications.status, "exam_failed"),
        ),
      )
      .orderBy(
        // 0 = en cours (d'abord), 1 = soumis ; puis du plus récent au plus
        // ancien (heure de soumission, sinon heure d'ouverture).
        sql`case when ${examSessions.status} = 'in_progress' then 0 else 1 end`,
        sql`coalesce(${examSessions.submittedAt}, ${examSessions.startedAt}) desc`,
      )
      .limit(REVIEW_LIST_LIMIT);

    return {
      ok: true,
      items: rows.map((row) => ({
        sessionId: row.sessionId,
        applicationId: row.applicationId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        locale: asLocale(row.locale),
        sessionStatus: row.sessionStatus,
        startedAt: row.startedAt.toISOString(),
        submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
        expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
        elapsedSeconds: row.elapsedSeconds,
        applicationStatus: row.applicationStatus,
      })),
    };
  } catch (error) {
    console.error("[exams] échec de la liste de revue d'examen", error);
    throw error;
  }
}

/**
 * Détail d'une session d'examen : identité du candidat + réponses par section.
 *
 * SÉCURITÉ : session `active` + rôle `ceo` ; un id non uuid renvoie
 * `not_found` **sans requête** (motif `getJobApplication` — aucun indice sur un
 * id forgé), idem pour une ligne absente.
 *
 * Les questions elles-mêmes ne transitent PAS : le client les lit dans
 * `EXAM_QUESTIONS` (`src/lib/exam.ts`, source de vérité commune).
 *
 * @param sessionId uuid de la session.
 * @returns `{ ok: true; item }` ou `{ ok: false; code: "forbidden" | "not_found" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getExamReviewSession(
  sessionId: string,
): Promise<
  | { ok: true; item: ExamReviewSessionDetail }
  | { ok: false; code: "forbidden" | "not_found" }
> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  // Id validé AVANT toute requête — jamais d'info sur un id forgé.
  const parsedId = sessionIdSchema.safeParse(sessionId);
  if (!parsedId.success) return { ok: false, code: "not_found" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        sessionId: examSessions.id,
        sessionStatus: examSessions.status,
        startedAt: examSessions.startedAt,
        submittedAt: examSessions.submittedAt,
        expiresAt: examSessions.expiresAt,
        elapsedSeconds: examSessions.elapsedSeconds,
        applicationId: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        locale: jobApplications.locale,
        applicationStatus: jobApplications.status,
      })
      .from(examSessions)
      .innerJoin(jobApplications, eq(examSessions.applicationId, jobApplications.id))
      .where(eq(examSessions.id, parsedId.data))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return { ok: false, code: "not_found" };

    // Réponses — ordre du barème (section, puis id de question).
    const answerRows = await db
      .select({
        section: examAnswers.section,
        questionId: examAnswers.questionId,
        answer: examAnswers.answer,
        updatedAt: examAnswers.updatedAt,
      })
      .from(examAnswers)
      .where(eq(examAnswers.sessionId, row.sessionId))
      .orderBy(examAnswers.section, examAnswers.questionId);

    return {
      ok: true,
      item: {
        sessionId: row.sessionId,
        applicationId: row.applicationId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        locale: asLocale(row.locale),
        sessionStatus: row.sessionStatus,
        startedAt: row.startedAt.toISOString(),
        submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
        expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
        elapsedSeconds: row.elapsedSeconds,
        applicationStatus: row.applicationStatus,
        answers: answerRows.map((answer) => ({
          section: answer.section,
          questionId: answer.questionId,
          answer: answer.answer,
          updatedAt: answer.updatedAt === null ? null : answer.updatedAt.toISOString(),
        })),
      },
    };
  } catch (error) {
    console.error("[exams] échec de la lecture d'une session (revue CEO)", error);
    throw error;
  }
}

// NOTE : aucun helper sync EXPORTÉ ici (les helpers privés — `isRateLimited`,
// `asLocale` — ne franchissent jamais la frontière). Un fichier `"use server"`
// n'autorise que des fonctions ASYNC à l'export (contrainte RSC —
// `examRelativeUrl` vit donc dans `src/lib/exam.ts`). `SECTION_TITLES` /
// `EXAM_SECTIONS` sont également importés depuis `@/lib/exam` : les
// réexporter ici casserait le build RSC (tsc passe de toute façon, la
// contrainte n'est pas typée).
