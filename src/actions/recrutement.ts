"use server";

/**
 * Atheris — Server Actions **recrutement** (candidatures Sales Development Representative,
 * espace CEO).
 *
 * CONTRAT PUBLIC (codes BRUTS uniquement — le client traduit, aucun message
 * serveur) :
 * - `listJobApplications()` → `{ ok: true; items: JobApplicationListItem[] }` |
 *   `{ ok: false; code: "forbidden" }` ;
 * - `getJobApplication(applicationId)` → `{ ok: true; item: JobApplicationDetail }` |
 *   `{ ok: false; code: "forbidden" | "not_found" }` ;
 * - `generateExamLink(applicationId)` → `GenerateExamLinkResult` (le statut
 *   ne bascule PLUS ici : cf. plus bas) ;
 * - `getEmailTemplate(kind, locale)` → `{ ok: true; subject; body }` |
 *   `{ ok: false; code: "forbidden" }` (kinds servis au CEO : `"reject"` et
 *   `"exam_invite"`) ;
 * - `rejectApplication(input)` → `{ ok: true; url: "" }` |
 *   `{ ok: false; code: ApplicationEmailFailureCode }` ;
 * - `sendExamInviteEmail(input)` → `{ ok: true; url: "" }` |
 *   `{ ok: false; code: ApplicationEmailFailureCode }` (envoi RÉEL de
 *   l'invitation d'examen, SEUL moment où le statut passe `exam_pending`) ;
 * - `recruitCandidate(input, actor)` → `{ ok: true }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" | "mail_failed" |
 *   "failed" }`.
 *
 * RÈGLE INVARIABLE : **e-mail d'abord, écriture ensuite** — un échec Resend
 * (`mail_failed`) ne fige JAMAIS un statut : le CEO peut réessayer. Le
 * candidat refuse (`status = "refuse"`) est un état TERMINAL : tout refus sur
 * une telle ligne répond `conflict` (UPDATE conditionnel `status <>
 * 'refuse'` + `.returning()` : idempotence face au double clic ou à une
 * action concurrente du CEO).
 *
 * SÉCURITÉ : session Auth.js + compte `active` + rôle `ceo` relu côté
 * serveur sur CHAQUE action (`activeActor()` ci-dessous). L'e-mail du
 * destinataire est toujours **lu en base** (jamais issu du payload).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy) →
 * `next build` ne lit jamais `DATABASE_URL`.
 */

import { randomBytes } from "node:crypto";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { startExam } from "@/actions/exams";
import { auth } from "@/auth";
import { locales, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { examRelativeUrl } from "@/lib/exam";
import { getDb } from "@/lib/db";
import {
  activities,
  examAnswers,
  examSessions,
  invitations,
  jobApplications,
  recruitmentTemplates,
  roleEnum,
} from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { activeUserIdsByRoles, notify } from "@/lib/notify";
import {
  absoluteInterviewUrl,
  DEFAULT_EMAIL_TEMPLATES,
  renderTemplate,
} from "@/lib/recruitment-templates";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` : effacés à la
// compilation, seules les fonctions async subsistent à l'exécution (exigence
// d'un fichier `"use server"`).
// ---------------------------------------------------------------------------

// `import type` + `typeof` : le type est dérivé de l'enum Drizzle lui-même et
// entièrement effacé à la compilation — un fichier `"use server"` ne peut
// exporter que des fonctions async. AVANTAGE : impossible de désynchroniser
// cette union de `application_status` (c'était le cas : les 3 statuts du
// pipeline zero-interview cassaient `tsc`).
import type { applicationStatusEnum } from "@/lib/db/schema";

/** Statut d'une candidature, dérivé de l'enum Drizzle `application_status`. */
export type JobApplicationStatus =
  (typeof applicationStatusEnum.enumValues)[number];

/** Ligne de la liste `/espace/recrutement` — dates ISO 8601 (sérialisables). */
export type JobApplicationListItem = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: JobApplicationStatus;
  locale: "fr" | "en";
  /** CV facultatif : `null` = déposé sans pièce jointe (contrat nullable). */
  cvFilename: string | null;
  cvByteSize: number | null;
  createdAt: string;
  invitedAt: string | null;
  rejectedAt: string | null;
  /**
   * Examen lié (pipeline zero-interview). `null` = pas de session (candidature
   * antérieure au pipeline, ou création de session échouée).
   *
   * `submittedAt` sert d'indicateur **« < 24 h »** dans la file de revue :
   * l'engagement public est que le CEO tranche sous 24 h — l'UI affiche donc
   * l'ancienneté et passe en alerte au-delà du seuil.
   */
  exam: null | {
    status: "in_progress" | "submitted";
    submittedAt: string | null;
    /** Durée mesurée (indicatif, jamais bloquant) — `null` tant que non soumis. */
    elapsedSeconds: number | null;
  };
};

/** Une réponse d'examen, projetée pour la revue CEO (100 % sérialisable). */
export type ExamAnswerItem = {
  questionId: string;
  /** 1–4 (section du barème). */
  section: number;
  answer: string;
};

/** Détail d'une candidature (liste + message + CV servi par la route API). */
export type JobApplicationDetail = JobApplicationListItem & {
  message: string | null;
  /** `null` quand la candidature est sans CV — l'UI masque alors le CTA. */
  cvMimeType: string | null;
  /** URL relative du CV : `GET /api/applications/{id}/cv` (CEO seul, 404 muet).
   *  `null` sans CV. */
  cvUrl: string | null;
  /**
   * Réponses de l'examen, dans l'ordre du barème. `null` = aucune session.
   * Vide (`[]`) = session créée mais aucune réponse encore écrite.
   *
   * Les questions elle-mêmes ne transitent PAS : le CEO les obtient du barème
   * (`lib/exam.ts`, source de vérité commune). Le serveur n'envoie que des
   * réponses — moins de données, et aucune raison de les dupliquer.
   */
  examAnswers: ExamAnswerItem[] | null;
};

/** Entrée d'un envoi d'e-mail CEO (invitation ou refus). */
export type SendApplicationEmailInput = {
  applicationId: string;
  subject: string;
  body: string;
  saveTemplate?: boolean;
};

/**
 * Contrat de `generateExamLink`.
 *
 * `created: false` = une session EXISTAIT déjà (générée automatiquement au
 * dépôt) — on renvoie SON lien plutôt que d'en créer une seconde. C'est
 * volontaire : `exam_sessions` n'a aucune contrainte UNIQUE sur
 * `application_id`, l'invariant 1:1 ne tient que par construction du code.
 * Créer un second lien briserait ce que la jointure de `listJobApplications`
 * suppose (candidature affichée en double).
 *
 * `examUrl: null` en cas d'échec de création → la candidature reste
 * inchangée, le CEO peut réessayer.
 *
 * `examUrl` est **absolue** (`SITE_URL` + locale incluse, cf.
 * `absoluteInterviewUrl`) : c'est la valeur affichée au CEO, copiable et
 * déjà telle qu'elle sera reçue par le candidat.
 *
 * RETOUR CLIENT : la génération ne pose **plus** `exam_pending` — un lien
 * généré n'a prévenu personne. La bascule de statut a lieu UNIQUEMENT dans
 * `sendExamInviteEmail`, après transmission effective de l'e-mail.
 */
export type GenerateExamLinkResult =
  | { ok: true; examUrl: string; created: boolean }
  | {
      ok: false;
      code: "forbidden" | "not_found" | "invalid" | "conflict" | "failed";
    };

/** Codes d'échec des e-mails de recrutement — traduits côté client. */
export type ApplicationEmailFailureCode =
  | "forbidden"
  | "invalid"
  | "not_found"
  | "conflict"
  | "mail_failed"
  | "failed";

/** Contrat des deux actions d'e-mail : union discriminée par `ok`. */
export type SendApplicationEmailResult =
  | { ok: true; url: string }
  | { ok: false; code: ApplicationEmailFailureCode };

/** Contrat de `recruitCandidate` (union discriminée par `ok`). */
export type RecruitCandidateResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" | "mail_failed" | "failed" };

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

const applicationIdSchema = z.uuid();

/**
 * Kind d'e-mail servis par `getEmailTemplate` (initialisation du formulaire
 * du CEO) : `"reject"` (refus depuis `/espace/examen`) et `"exam_invite"`
 * (aperçu du lien d'examen depuis `/espace/recrutement`, avant envoi réel
 * par `sendExamInviteEmail`). Les kinds `exam_passed` / `exam_failed` restent
 * émis automatiquement par `src/actions/exams.ts`, jamais par ce formulaire.
 */
const emailKindSchema = z.enum(["reject", "exam_invite"]);

const emailLocaleSchema = z.enum(["fr", "en"]);

const sendApplicationEmailSchema = z.object({
  applicationId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  saveTemplate: z.boolean().optional(),
});

/**
 * Entrée de `sendExamInviteEmail` — même gabarit que l'envoi de refus, plus
 * la `locale` du candidat (validée ici, mais le lien est reconstruit côté
 * serveur avec la locale **relue en base** : le payload ne porte jamais de
 * URL ni de langue de destination).
 */
const sendExamInviteEmailSchema = z.object({
  applicationId: z.uuid(),
  locale: z.enum(locales),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
});

const recruitCandidateSchema = z.object({
  applicationId: z.uuid(),
  locale: z.enum(locales),
});

// ---------------------------------------------------------------------------
// Constantes applicatives.
// ---------------------------------------------------------------------------

/** Volume maximal renvoyé par `listJobApplications` (plafond de payload). */
const LIST_LIMIT = 200;

/** Durée de vie d'une invitation de recrutement (48 h, miroir T26). */
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Aides privées.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js reconstruite **côté serveur** (aucun identifiant ni rôle
 * ne transite par le client).
 *
 * @returns `null` si aucune session, compte non `active`, ou rôle non `ceo`.
 */
async function activeActor(): Promise<{ id: string; role: Role } | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  if (session.user.role !== "ceo") return null;
  return { id: session.user.id, role: session.user.role };
}

/**
 * Rétrécit une `locale` relue en base (colonne `text`) vers le tuple
 * `"fr" | "en"` du contrat public. La colonne est NOT NULL avec défaut `"fr"`
 * et n'est écrite qu'après validation Zod au dépôt (`careers.ts`) ; toute
 * valeur inattendue (corruption, ligne héritée) retombe sur `"fr"` — repli
 * sûr, identique à celui de `getPlatformDictionary`.
 */
function asLocale(value: string): "fr" | "en" {
  return value === "en" ? "en" : "fr";
}

// ---------------------------------------------------------------------------
// listJobApplications — lecture (page /espace/recrutement).
// ---------------------------------------------------------------------------

/**
 * Liste les candidatures, triées par `createdAt` décroissant, bornées à
 * `LIST_LIMIT`, SANS les octets du CV (`cvBytes` exclu de la projection :
 * un payload de plusieurs Mo ne transite jamais par une action).
 *
 * SÉCURITÉ : session `active` + rôle `ceo` requis (PII candidats + CV).
 *
 * @returns `{ ok: true; items }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function listJobApplications(): Promise<
  { ok: true; items: JobApplicationListItem[] } | { ok: false; code: "forbidden" }
> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        id: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        status: jobApplications.status,
        locale: jobApplications.locale,
        cvFilename: jobApplications.cvFilename,
        cvByteSize: jobApplications.cvByteSize,
        createdAt: jobApplications.createdAt,
        invitedAt: jobApplications.invitedAt,
        rejectedAt: jobApplications.rejectedAt,
        // Session d'examen éventuelle (LEFT JOIN) - `null` pour les
        // candidatures antérieures au pipeline zero-interview.
        examStatus: examSessions.status,
        examSubmittedAt: examSessions.submittedAt,
        examElapsed: examSessions.elapsedSeconds,
      })
      .from(jobApplications)
      .leftJoin(examSessions, eq(examSessions.applicationId, jobApplications.id))
      .orderBy(desc(jobApplications.createdAt))
      .limit(LIST_LIMIT);

    return {
      ok: true,
      items: rows.map((row) => ({
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        status: row.status,
        locale: asLocale(row.locale),
        cvFilename: row.cvFilename,
        cvByteSize: row.cvByteSize,
        createdAt: row.createdAt.toISOString(),
        invitedAt: row.invitedAt === null ? null : row.invitedAt.toISOString(),
        rejectedAt: row.rejectedAt === null ? null : row.rejectedAt.toISOString(),
        // Session d'examen : `examStatus` non nul ⇔ session JOINée présente.
        exam:
          row.examStatus === null
            ? null
            : {
                status: row.examStatus,
                submittedAt:
                  row.examSubmittedAt === null ? null : row.examSubmittedAt.toISOString(),
                elapsedSeconds: row.examElapsed,
              },
      })),
    };
  } catch (error) {
    console.error("[recrutement] échec de la liste des candidatures", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// getJobApplication — détail d'une candidature.
// ---------------------------------------------------------------------------

/**
 * Détail d'une candidature (message + MIME + URL du CV).
 *
 * SÉCURITÉ : session `active` + rôle `ceo` ; un id non uuid renvoie
 * `not_found` **sans requête** (aucune confirmation d'existence à un
 * acteur forgé).
 *
 * @param applicationId uuid de la candidature.
 * @returns `{ ok: true; item }`, `{ ok: false; code: "not_found" }` (id
 *   malformé ou ligne absente) ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getJobApplication(
  applicationId: string,
): Promise<
  { ok: true; item: JobApplicationDetail } | { ok: false; code: "forbidden" | "not_found" }
> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  // Id validé AVANT toute requête — jamais d'info sur un id forgé.
  const parsedId = applicationIdSchema.safeParse(applicationId);
  if (!parsedId.success) return { ok: false, code: "not_found" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        id: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        status: jobApplications.status,
        locale: jobApplications.locale,
        message: jobApplications.message,
        cvFilename: jobApplications.cvFilename,
        cvMimeType: jobApplications.cvMimeType,
        cvByteSize: jobApplications.cvByteSize,
        createdAt: jobApplications.createdAt,
        invitedAt: jobApplications.invitedAt,
        rejectedAt: jobApplications.rejectedAt,
        // Session d'examen éventuelle (LEFT JOIN) — `null` sans session.
        examStatus: examSessions.status,
        examSessionId: examSessions.id,
        examSubmittedAt: examSessions.submittedAt,
        examElapsed: examSessions.elapsedSeconds,
      })
      .from(jobApplications)
      .leftJoin(examSessions, eq(examSessions.applicationId, jobApplications.id))
      .where(eq(jobApplications.id, parsedId.data))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return { ok: false, code: "not_found" };

    // Réponses de l'examen — SECONDE requête seulement s'il y a une session
    // (une candidature antérieure au pipeline ne paie aucun coût DB).
    let answers: ExamAnswerItem[] | null = null;
    if (row.examSessionId !== null) {
      const answerRows = await db
        .select({
          questionId: examAnswers.questionId,
          section: examAnswers.section,
          answer: examAnswers.answer,
        })
        .from(examAnswers)
        .where(eq(examAnswers.sessionId, row.examSessionId))
        .orderBy(examAnswers.section, examAnswers.questionId);
      answers = answerRows;
    }

    return {
      ok: true,
      item: {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        status: row.status,
        locale: asLocale(row.locale),
        message: row.message,
        cvFilename: row.cvFilename,
        cvMimeType: row.cvMimeType,
        cvByteSize: row.cvByteSize,
        createdAt: row.createdAt.toISOString(),
        invitedAt: row.invitedAt === null ? null : row.invitedAt.toISOString(),
        rejectedAt: row.rejectedAt === null ? null : row.rejectedAt.toISOString(),
        // CV facultatif : sans pièce jointe, aucune URL — l'UI masque le CTA
        // au lieu de pointer vers une route qui renverrait 404.
        cvUrl: row.cvFilename === null ? null : `/api/applications/${row.id}/cv`,
        exam:
          row.examStatus === null
            ? null
            : {
                status: row.examStatus,
                submittedAt:
                  row.examSubmittedAt === null ? null : row.examSubmittedAt.toISOString(),
                elapsedSeconds: row.examElapsed,
              },
        examAnswers: answers,
      },
    };
  } catch (error) {
    console.error("[recrutement] échec de lecture de la candidature", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// generateExamLink — lien d'examen (remplace « inviter à un entretien »).
// ---------------------------------------------------------------------------

/**
 * Génère (ou RÉUTILISE) le lien d'examen d'une candidature — action **CEO**.
 *
 * Remplace l'invitation à un entretien dans l'interface : le parcours
 * zero-interview ne propose plus d'entretien, mais un test en ligne.
 *
 * ─── Idempotence assumée ────────────────────────────────────────────────────
 * Si une session existe déjà (créée automatiquement au dépôt de la
 * candidature), SON lien est renvoyé — jamais une seconde session. Voir le
 * JSDoc de `GenerateExamLinkResult` : créer un second lien briserait
 * l'invariant 1:1 que la jointure de `listJobApplications` suppose.
 *
 * ─── Retour ────────────────────────────────────────────────────────────────
 * `ok: true` avec `examUrl` (**absolue**, locale incluse : `SITE_URL` +
 * `/{locale}/examen/{token}`) — le CEO la copie ou l'envoie telle quelle.
 * `created` distingue « lien neuf » de « lien déjà existant » pour
 * l'affichage.
 *
 * ─── Statut (retour client) ────────────────────────────────────────────────
 * Générer un lien n'écrit AUCUN statut : la bascule `exam_pending` est
 * portée par `sendExamInviteEmail`, **après** envoi effectif de l'e-mail. Le
 * flux de dépôt (`careers.ts`) pose toujours `exam_pending` lui-même à la
 * création de la session auto — inchangé, hors périmètre.
 *
 * @param applicationId Id de candidature (validé par Zod avant toute requête).
 */
export async function generateExamLink(
  applicationId: string,
): Promise<GenerateExamLinkResult> {
  // 1. Zod sur l'entrée — AVANT toute requête DB.
  const parsedId = applicationIdSchema.safeParse(applicationId);
  if (!parsedId.success) return { ok: false, code: "invalid" };

  // 2. Droit d'écriture : SEUL le CEO génère un lien (motif exact de
  //    `recruitCandidate` — l'acteur est relu en session serveur, jamais
  //    transmis depuis le client).
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  try {
    const db = getDb();

    // 3. Candidature — jamais de détail sur un id inconnu.
    const rows = await db
      .select({
        id: jobApplications.id,
        locale: jobApplications.locale,
        status: jobApplications.status,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, parsedId.data))
      .limit(1);
    const application = rows[0];
    if (application === undefined) return { ok: false, code: "not_found" };

    // Statuts TERMINAUX : rien à générer, aucun détail renvoyé.
    if (application.status === "refuse" || application.status === "recrute") {
      return { ok: false, code: "conflict" };
    }

    const locale = asLocale(application.locale);

    // SEUL helper d'absolutisation du repo : `absoluteInterviewUrl`
    // (repli `https://atheris-labs.sofianeasma.me`) — aucun second helper
    // n'est créé ici, la relative de `lib/exam.ts` est réutilisée telle quelle.
    const toAbsoluteExamUrl = (token: string): string =>
      absoluteInterviewUrl(examRelativeUrl(token, locale));

    // 4. Session existante ? → RÉUTILISATION (idempotence).
    const existing = await db
      .select({ token: examSessions.token, status: examSessions.status })
      .from(examSessions)
      .where(eq(examSessions.applicationId, application.id))
      .limit(1);
    const session = existing[0];

    if (session !== undefined) {
      // Session déjà SOUMISE : verrouillée, un nouveau lien ne la rouvrirait
      // pas — le CEO doit trancher le dossier, pas relancer le test.
      if (session.status === "submitted") return { ok: false, code: "conflict" };
      return { ok: true, examUrl: toAbsoluteExamUrl(session.token), created: false };
    }

    // 5. Création (candidature antérieure au pipeline, ou création auto échouée).
    const token = await startExam(application.id, locale);
    if (token === null) return { ok: false, code: "failed" };

    // AUCUNE écriture de statut ici (retour client) : un lien généré n'a
    // prévenu personne — `exam_pending` n'est posé qu'APRÈS l'envoi réel de
    // l'e-mail, par `sendExamInviteEmail`. Le dépôt (`careers.ts`) continue
    // de poser `exam_pending` à la création de la session auto (hors périmètre).
    return { ok: true, examUrl: toAbsoluteExamUrl(token), created: true };
  } catch (error) {
    console.error("[recrutement] échec de génération du lien d'examen", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// getEmailTemplate — initialisation du formulaire d'e-mail CEO.
// ---------------------------------------------------------------------------

/**
 * Modèle d'e-mail (personnalisé en base, sinon défaut) pour initialiser le
 * formulaire d'envoi du CEO.
 *
 * SÉCURITÉ : session `active` + rôle `ceo` ; `kind`/`locale` validés par Zod
 * (valeurs strictes — une valeur forgée est `forbidden`, jamais une requête
 * SQL injectée).
 *
 * @param kind `"reject"` (refus) ou `"exam_invite"` (aperçu du lien
 *   d'examen avant envoi réel) — seuls kinds servis au formulaire CEO.
 * @param locale `"fr"` ou `"en"`.
 * @returns `{ ok: true; subject; body }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getEmailTemplate(
  kind: "reject" | "exam_invite",
  locale: "fr" | "en",
): Promise<{ ok: true; subject: string; body: string } | { ok: false; code: "forbidden" }> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const parsedKind = emailKindSchema.safeParse(kind);
  const parsedLocale = emailLocaleSchema.safeParse(locale);
  if (!parsedKind.success || !parsedLocale.success) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        subject: recruitmentTemplates.subject,
        body: recruitmentTemplates.body,
      })
      .from(recruitmentTemplates)
      .where(
        and(
          eq(recruitmentTemplates.kind, parsedKind.data),
          eq(recruitmentTemplates.locale, parsedLocale.data),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (row !== undefined) return { ok: true, subject: row.subject, body: row.body };

    // Aucune personnalisation enregistrée → modèle par défaut (module pur).
    const fallback = DEFAULT_EMAIL_TEMPLATES[parsedKind.data][parsedLocale.data];
    return { ok: true, subject: fallback.subject, body: fallback.body };
  } catch (error) {
    console.error("[recrutement] échec de lecture du modèle d'e-mail", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// rejectApplication — e-mail de refus CEO puis écriture.
// ---------------------------------------------------------------------------

/** Champs candidature relus en base avant envoi (jamais issus du payload). */
type ApplicationRecipient = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  locale: "fr" | "en";
  status: JobApplicationStatus;
};

/**
 * Enregistre le modèle utilisé (upsert sur kind+locale) — **NON FATAL** :
 * l'e-mail est déjà parti, un échec d'enregistrement du brouillon ne doit
 * pas faire remonter une erreur au CEO.
 */
async function saveEmailTemplateIfRequested(
  db: ReturnType<typeof getDb>,
  args: {
    /** Seul kind encore enregistrable : le formulaire CEO ne sert que le refus. */
    kind: "reject";
    locale: "fr" | "en";
    subject: string;
    body: string;
    actorId: string;
  },
): Promise<void> {
  try {
    await db
      .insert(recruitmentTemplates)
      .values({
        kind: args.kind,
        locale: args.locale,
        subject: args.subject,
        body: args.body,
        updatedBy: args.actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [recruitmentTemplates.kind, recruitmentTemplates.locale],
        set: {
          subject: args.subject,
          body: args.body,
          updatedBy: args.actorId,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    console.error("[recrutement] modèle d'e-mail non enregistré (envoi déjà effectué)", error);
  }
}

/** Audit `activities` — NON FATAL (miroir du motif `src/actions/prospects.ts`). */
async function writeAuditActivity(
  db: ReturnType<typeof getDb>,
  args: { actorId: string; action: string; entityId: string; meta: Record<string, unknown> },
): Promise<void> {
  try {
    await db.insert(activities).values({
      actorId: args.actorId,
      action: args.action,
      entityType: "job_application",
      entityId: args.entityId,
      meta: args.meta,
    });
  } catch (error) {
    console.error(`[recrutement] activité \`${args.action}\` non journalisée`, error);
  }
}

/**
 * Refuse une candidature : e-mail de politesse, puis passage à `refuse`.
 *
 * Règle invariante **e-mail d'abord, écriture ensuite** :
 * - états admis : `nouveau` ET `invite` (`invite` = statut historique encore
 *   présent en base : le parcours d'entretien a été retiré du code) ;
 * - `conflict` si déjà `refuse` (refus terminal, idempotence) ;
 * - PAS de lien dans le rendu (`lien` non fourni → tout `{{lien}}` éventuel
 *   est laissé tel quel) ;
 * - succès : `{ ok: true, url: "" }`.
 *
 * @param input `applicationId` (uuid), `subject` (1–200), `body` (1–10 000),
 *   `saveTemplate` optionnel (upsert du modèle `reject`).
 * @returns `{ ok: true; url: "" }` ou `{ ok: false; code }`.
 * @throws Erreur d'infra DB — journalisée puis renvoyée en `failed`.
 */
export async function rejectApplication(
  input: SendApplicationEmailInput,
): Promise<SendApplicationEmailResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = sendApplicationEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { applicationId, subject, body, saveTemplate } = parsed.data;

  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  try {
    const db = getDb();

    // 2. Lecture de la ligne — e-mail LUE EN BASE, id inconnu = `not_found`.
    const rows = await db
      .select({
        id: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        locale: jobApplications.locale,
        status: jobApplications.status,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .limit(1);
    const application = rows[0];
    if (application === undefined) return { ok: false, code: "not_found" };
    // Déjà refusée : refus terminal, idempotence (aucun double e-mail).
    if (application.status === "refuse") return { ok: false, code: "conflict" };

    const recipient: ApplicationRecipient = {
      ...application,
      locale: asLocale(application.locale),
    };

    // 3. E-mail — AUCUNE écriture avant ce point (règle invariante).
    //    Pas de lien d'entretien : `lien` omis → `{{lien}}` laissé tel quel.
    const text = renderTemplate(body, {
      prenom: recipient.firstName,
      nom: recipient.lastName,
    });
    const mail = await sendMail({ to: recipient.email, subject, text });
    if (!mail.ok) {
      console.error("[recrutement] refus non envoyé (candidature inchangée)", mail.error);
      return { ok: false, code: "mail_failed" };
    }

    // 4. Écriture conditionnelle — 0 ligne = refusé entre-temps (idempotence).
    const updated = await db
      .update(jobApplications)
      .set({
        status: "refuse",
        rejectedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(and(eq(jobApplications.id, applicationId), ne(jobApplications.status, "refuse")))
      .returning({ id: jobApplications.id });
    if (updated[0]?.id === undefined) return { ok: false, code: "conflict" };

    // 5. Sauvegarde du modèle + audit — NON FATAUX (e-mail déjà parti).
    if (saveTemplate === true) {
      await saveEmailTemplateIfRequested(db, {
        kind: "reject",
        locale: recipient.locale,
        subject,
        body,
        actorId: actor.id,
      });
    }
    await writeAuditActivity(db, {
      actorId: actor.id,
      action: "application.rejected",
      entityId: applicationId,
      meta: { actorId: actor.id },
    });

    return { ok: true, url: "" };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée, code `failed`.
    console.error("[recrutement] échec de refus de candidature", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// sendExamInviteEmail — aperçu CEO puis envoi réel de l'invitation d'examen.
// ---------------------------------------------------------------------------

/**
 * Envoie l'e-mail d'invitation à l'examen (modèle `exam_invite` édité et
 * vérifié par le CEO dans `ApplicationEmailModal`) puis — ET SEULEMENT
 * ENSUITE — fait basculer la candidature en `exam_pending`.
 *
 * ─── Séquence (règle invariante **e-mail d'abord, écriture ensuite**) ──────
 * 1. Zod (`applicationId` uuid, `locale` ∈ `locales`, `subject` 1–200,
 *    `body` 1–10 000) → `invalid` ; acteur relu (`activeActor()`) →
 *    `forbidden` ;
 * 2. candidature relue en base (e-mail LUE EN BASE) → absente → `not_found` ;
 *    statut terminal (`refuse` / `recrute`) → `conflict` (idempotence,
 *    aucun double e-mail) ;
 * 3. session d'examen relue : absente → `not_found` (aucun lien à porter —
 *    le flux impose d'avoir généré le lien avant d'ouvrir le modal) ; déjà
 *    soumise → `conflict` (lien verrouillé, miroir de `generateExamLink`) ;
 * 4. lien **absolu** reconstruit côté serveur :
 *    `examRelativeUrl(token, localeRelueEnBase)` → `absoluteInterviewUrl`
 *    (SEUL helper d'absolutisation du repo). La `locale` du payload est
 *    validée mais n'influence ni le lien ni la langue de destination ;
 * 5. `renderTemplate` substitue `{{prenom}}`/`{{nom}}`/`{{lien}}` dans le
 *    corps (**le lien manquant est réinjecté en fin de message** — exigence
 *    métier, identique aux e-mails d'examen de `exams.ts`) ; `sendMail` →
 *    échec → `mail_failed` **SANS AUCUNE ÉCRITURE** ;
 * 6. envoi OK → si `status = 'nouveau'` : UPDATE conditionnel → `exam_pending`
 *    + `{ ok: true }` ; sinon (déjà `exam_pending` ou tout autre statut non
 *    terminal) : aucun changement de statut, `{ ok: true }`.
 *
 * ─── `MAIL_DISABLED` (dev local) ───────────────────────────────────────────
 * `sendMail` répond `{ ok: false, error: "disabled" }` en mode désactivé →
 * l'action renvoie `mail_failed` et **ne bascule pas** le statut : comportement
 * strictement identique à `rejectApplication` (aucun statut n'est promis sans
 * transmission). La règle « envoi désactivé = succès » ne s'applique donc pas
 * ici, puisque `sendMail` ne rapporte PAS de succès en mode disabled.
 *
 * ─── Atomicité (driver `neon-http`) ────────────────────────────────────────
 * Statements séquentiels, pas de `db.transaction()` : l'ordre ci-dessus
 * garantit qu'aucun `exam_pending` n'est posé sans e-mail effectivement parti.
 *
 * @param input `applicationId` (uuid), `locale` (validée), `subject` (1–200),
 *   `body` (1–10 000) — corps déjà substitué côté client, resubstitué ici
 *   (idempotent) pour garantir la présence du lien.
 * @returns `{ ok: true; url: "" }` ou `{ ok: false; code }`.
 */
export async function sendExamInviteEmail(input: {
  applicationId: string;
  locale: Locale;
  subject: string;
  body: string;
}): Promise<SendApplicationEmailResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = sendExamInviteEmailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { applicationId, subject, body } = parsed.data;

  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  try {
    const db = getDb();

    // 2. Lecture de la ligne — e-mail LUE EN BASE, id inconnu = `not_found`.
    const rows = await db
      .select({
        id: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        locale: jobApplications.locale,
        status: jobApplications.status,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .limit(1);
    const application = rows[0];
    if (application === undefined) return { ok: false, code: "not_found" };
    // Statuts TERMINAUX : plus rien à inviter (idempotence du double clic).
    if (application.status === "refuse" || application.status === "recrute") {
      return { ok: false, code: "conflict" };
    }

    // 3. Session d'examen — c'est ELLE qui porte le jeton du lien.
    const sessionRows = await db
      .select({ token: examSessions.token, status: examSessions.status })
      .from(examSessions)
      .where(eq(examSessions.applicationId, applicationId))
      .limit(1);
    const session = sessionRows[0];
    // Aucun lien ne peut être porté sans session : le CEO doit d'abord
    // appeler `generateExamLink` (le modal n'est ouvert qu'après génération).
    if (session === undefined) return { ok: false, code: "not_found" };
    // Session déjà SOUMISE : lien verrouillé, miroir de `generateExamLink`.
    if (session.status === "submitted") return { ok: false, code: "conflict" };

    // 4. Lien ABSOLU reconstruit ici (jamais issu du payload).
    const recipientLocale = asLocale(application.locale);
    const lien = absoluteInterviewUrl(examRelativeUrl(session.token, recipientLocale));
    const text = renderTemplate(body, {
      prenom: application.firstName,
      nom: application.lastName,
      lien,
    });
    // Le sujet n'est rendu qu'avec `prenom`/`nom` : `renderTemplate` réinjecte
    // le lien en FIN de texte quand `{{lien}}` est absent — acceptable dans un
    // corps de message, jamais dans un objet d'e-mail.
    const renderedSubject = renderTemplate(subject, {
      prenom: application.firstName,
      nom: application.lastName,
    });

    // 5. E-mail — AUCUNE écriture avant ce point (règle invariante).
    const mail = await sendMail({ to: application.email, subject: renderedSubject, text });
    if (!mail.ok) {
      console.error(
        "[recrutement] invitation d'examen non envoyée (candidature inchangée)",
        mail.error,
      );
      return { ok: false, code: "mail_failed" };
    }

    // 6. Écriture UNIQUEMENT après transmission effective — et seulement si la
    //    candidature était encore `nouveau` (statut déjà avancé → inchangé).
    if (application.status === "nouveau") {
      await db
        .update(jobApplications)
        .set({ status: "exam_pending", updatedAt: sql`now()` })
        .where(and(eq(jobApplications.id, applicationId), eq(jobApplications.status, "nouveau")));
    }

    // Audit NON FATAL (e-mail déjà parti) — jamais le contenu du message.
    await writeAuditActivity(db, {
      actorId: actor.id,
      action: "application.exam_invite_sent",
      entityId: applicationId,
      meta: { applicationId, actorId: actor.id, locale: recipientLocale },
    });

    return { ok: true, url: "" };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée, code `failed`.
    console.error("[recrutement] échec d'envoi de l'invitation d'examen", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// recruitCandidate — recrutement d'un candidat en SDR (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Recrute un candidat (statut → `recrute`) et lui émet une **invitation
 * `sdr`** (lien d'activation de compte, même mécanique que le portail client).
 *
 * SÉQUENCE (règle invariante **e-mail d'abord, écriture du STATUT ensuite**) :
 * 1. Zod (`applicationId` uuid + `locale` ∈ locales) → `invalid` ; acteur
 *    revalidé (uuid → `invalid`, rôle ≠ `ceo` → `forbidden`) ;
 * 2. candidature lue en base (e-mail LUE EN BASE) → absente → `not_found` ;
 *    `status` ∉ {`nouveau`, `invite`, `exam_submitted`} → `invalid` (déjà
 *    recrutée, refusée ou test non soumis) ;
 * 3. invitation `sdr` **non utilisée** existante pour (email normalisé,
 *    `role = 'sdr'`) → réutilisée (refresh `expiresAt`, même jeton) ; sinon
 *    insert `invitations` : jeton 32 bytes hex, `role: "sdr"`, `projectId:
 *    null`, `applicationId`, TTL 48 h, `createdBy = actor.id` ;
 * 4. `sendMail` avec `dict.auth.invitation.email.sdr.{subject,body}`
 *    (placeholders `{{name}}` = prénom+nom, `{{link}}` = URL **absolue** du
 *    lien d'activation `/{locale}/invitation/{token}`) → échec →
 *    **`mail_failed` SANS changer le statut** (le CEO réessaiera :
 *    l'invitation restante sera réutilisée) ;
 * 5. UPDATE `status = 'recrute'`, `recruited_at = now()` + audit
 *    `application.recruited` (non fatal, **jamais le jeton**) → `{ ok: true }`.
 *
 * ATOMICITÉ (driver `neon-http`) : statements séquentiels, pas de
 * `db.transaction()` — l'ordre ci-dessus garantit qu'aucun statut n'est figé
 * sans e-mail envoyé.
 *
 * @param input `applicationId` (uuid), `locale` (dict d'e-mail).
 * @param actor `{ id, role }` issu de la session serveur (revalidé par Zod).
 * @returns `{ ok: true }` ; sinon `invalid`, `forbidden`, `not_found`,
 *   `mail_failed` ou `failed` (infra).
 */
export async function recruitCandidate(
  input: { applicationId: string; locale: Locale },
  actor: { id: string; role: Role },
): Promise<RecruitCandidateResult> {
  // 1. Validation Zod — avant tout accès DB.
  const parsed = recruitCandidateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { applicationId, locale } = parsed.data;

  // Acteur revalidé : uuid → `invalid`, rôle ≠ `ceo` → `forbidden`.
  const parsedActor = z
    .object({ id: z.uuid(), role: z.enum(roleEnum.enumValues) })
    .safeParse({ id: actor?.id, role: actor?.role });
  if (!parsedActor.success) return { ok: false, code: "invalid" };
  if (parsedActor.data.role !== "ceo") return { ok: false, code: "forbidden" };
  const actorId = parsedActor.data.id;

  try {
    const db = getDb();

    // 2. Candidature — e-mail LUE EN BASE, id inconnu = `not_found`.
    const rows = await db
      .select({
        id: jobApplications.id,
        firstName: jobApplications.firstName,
        lastName: jobApplications.lastName,
        email: jobApplications.email,
        emailNorm: jobApplications.emailNorm,
        status: jobApplications.status,
      })
      .from(jobApplications)
      .where(eq(jobApplications.id, applicationId))
      .limit(1);
    const application = rows[0];
    if (application === undefined) return { ok: false, code: "not_found" };
    // États recrutables : `nouveau`, `invite` (`invite` = statut historique
    // encore présent en base) ou `exam_submitted` (revue CEO depuis la page
    // /espace/examen) — un refus est terminal, un recrutement déjà effectué
    // est idempotent-refusé.
    if (
      application.status !== "nouveau" &&
      application.status !== "invite" &&
      application.status !== "exam_submitted"
    ) {
      return { ok: false, code: "invalid" };
    }

    const emailNorm = application.emailNorm.trim().toLowerCase();
    const expiresAtMs = Date.now() + INVITATION_TTL_MS;
    const expiresAt = new Date(expiresAtMs);

    // 3. Invitation `sdr` non utilisée existante (email + rôle) → refresh.
    const existingRows = await db
      .select({ id: invitations.id, token: invitations.token })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, emailNorm),
          eq(invitations.role, "sdr"),
          isNull(invitations.usedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(1);
    const existing = existingRows[0];

    let token: string;

    if (existing !== undefined) {
      // Réutilisation : seul `expiresAt` est rafraîchi (même jeton).
      token = existing.token;
      await db
        .update(invitations)
        .set({ expiresAt })
        .where(eq(invitations.id, existing.id));
    } else {
      // Nouveau jeton : 32 octets aléatoires → 64 caractères hex.
      token = randomBytes(32).toString("hex");
      await db.insert(invitations).values({
        email: emailNorm,
        token,
        role: "sdr",
        projectId: null,
        applicationId,
        expiresAt,
        createdBy: actorId,
      });
    }

    // 4. E-mail — aucun STATUT écrit avant ce point (`mail_failed` ne fige
    //    rien : le CEO réessaiera et l'invitation sera réutilisée).
    const dict = await getPlatformDictionary(locale);
    const rawSubject = dict.auth.invitation.email.sdr.subject;
    const body = dict.auth.invitation.email.sdr.body;
    const lien = absoluteInterviewUrl(`/${locale}/invitation/${token}`);
    const name = `${application.firstName} ${application.lastName}`;
    const subject = rawSubject.replaceAll("{{name}}", name).replaceAll("{{link}}", lien);
    const text = body.replaceAll("{{name}}", name).replaceAll("{{link}}", lien);
    const mail = await sendMail({ to: application.email, subject, text });
    if (!mail.ok) {
      console.error(
        "[recrutement] invitation sdr non envoyée (candidature inchangée)",
        mail.error,
      );
      // Notification `mail_failed` — NON FATALE, notify() ne throw jamais :
      // comptes **actifs** `ceo` moins l'acteur.
      await notify({
        type: "mail_failed",
        link: "/espace/recrutement",
        meta: { entity: application.email },
        recipientIds: (await activeUserIdsByRoles(["ceo"])).filter(
          (recipientId) => recipientId !== actorId,
        ),
      });
      return { ok: false, code: "mail_failed" };
    }

    // 5. Écriture du recrutement + audit NON FATAL (e-mail déjà parti).
    await db
      .update(jobApplications)
      .set({
        status: "recrute",
        recruitedAt: sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobApplications.id, applicationId));

    await writeAuditActivity(db, {
      actorId,
      action: "application.recruited",
      entityId: applicationId,
      meta: { applicationId, actorId, locale },
    });

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée, code `failed`.
    console.error("[recrutement] échec du recrutement du candidat", error);
    return { ok: false, code: "failed" };
  }
}
