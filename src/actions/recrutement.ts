"use server";

/**
 * Atheris — Server Actions **recrutement** (candidatures Sales Development Representative,
 * espace CEO) — miroir du gabarit `src/actions/interviews.ts`.
 *
 * CONTRAT PUBLIC (codes BRUTS uniquement — le client traduit, aucun message
 * serveur) :
 * - `listJobApplications()` → `{ ok: true; items: JobApplicationListItem[] }` |
 *   `{ ok: false; code: "forbidden" }` ;
 * - `getJobApplication(applicationId)` → `{ ok: true; item: JobApplicationDetail }` |
 *   `{ ok: false; code: "forbidden" | "not_found" }` ;
 * - `getEmailTemplate(kind, locale)` → `{ ok: true; subject; body }` |
 *   `{ ok: false; code: "forbidden" }` ;
 * - `inviteToInterview(input)` / `rejectApplication(input)` →
 *   `{ ok: true; url }` | `{ ok: false; code: ApplicationEmailFailureCode }` ;
 * - `recruitCandidate(input, actor)` → `{ ok: true }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" | "mail_failed" |
 *   "failed" }`.
 *
 * RÈGLE INVARIABLE (miroir inversé de `submitInterview`) : **e-mail
 * d'abord, écriture ensuite** — un échec Resend (`mail_failed`) ne fige
 * JAMAIS un statut : le CEO peut réessayer (un nouveau lien est alors
 * généré). Le candidat refuse (`status = "refuse"`) est un état TERMINAL :
 * toute invitation/refus sur une telle ligne répond `conflict` (UPDATE
 * conditionnel `status <> 'refuse'` + `.returning()` : idempotence face au
 * double clic ou à une action concurrente du CEO).
 *
 * SÉCURITÉ : session Auth.js + compte `active` + rôle `ceo` relu côté
 * serveur sur CHAQUE action (miroir de `activeActor()` dans
 * `src/actions/interviews.ts`). L'e-mail du destinataire est toujours **lu
 * en base** (jamais issu du payload) ; le lien d'entretien n'est produit
 * que par `createInterviewLink` (jeton 32 bytes aléatoires) et n'est
 * transmis qu'au candidat dans son e-mail.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy) →
 * `next build` ne lit jamais `DATABASE_URL`.
 */

import { randomBytes } from "node:crypto";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { createInterviewLink } from "@/actions/interviews";
import { auth } from "@/auth";
import { locales, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import {
  activities,
  interviews,
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
  type EmailTemplateKind,
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
  cvFilename: string;
  cvByteSize: number;
  createdAt: string;
  invitedAt: string | null;
  rejectedAt: string | null;
  /** Entretien lié (`interviewId`) — `booked` = créneau réellement réservé. */
  interview: null | { booked: boolean; startsAt: string | null };
};

/** Détail d'une candidature (liste + message + CV servi par la route API). */
export type JobApplicationDetail = JobApplicationListItem & {
  message: string | null;
  cvMimeType: string;
  /** URL relative du CV : `GET /api/applications/{id}/cv` (CEO seul, 404 muet). */
  cvUrl: string;
};

/** Entrée d'un envoi d'e-mail CEO (invitation ou refus). */
export type SendApplicationEmailInput = {
  applicationId: string;
  subject: string;
  body: string;
  saveTemplate?: boolean;
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

const emailKindSchema = z.enum(["invite", "reject"]);

const emailLocaleSchema = z.enum(["fr", "en"]);

const sendApplicationEmailSchema = z.object({
  applicationId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10_000),
  saveTemplate: z.boolean().optional(),
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
 * ne transite par le client) — copie du helper privé de
 * `src/actions/interviews.ts` (fichier `"use server"` : non exportable).
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
 * `interview` provient du LEFT JOIN sur `interviewId` : `booked` = ligne
 * d'entretien présente ET `email_norm` non vide (marqueur « réservé » du
 * JSDoc de `interviews`) ; `startsAt` n'est exposé qu'une fois réservé.
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
        // Colonnes de l'entretien éventuel (LEFT JOIN) — `null` sans ligne.
        interviewStartsAt: interviews.startsAt,
        interviewEmailNorm: interviews.emailNorm,
      })
      .from(jobApplications)
      .leftJoin(interviews, eq(jobApplications.interviewId, interviews.id))
      .orderBy(desc(jobApplications.createdAt))
      .limit(LIST_LIMIT);

    return {
      ok: true,
      items: rows.map((row) => {
        // Marqueur « réservé » : ligne d'entretien présente ET emailNorm
        // non vide (les liens créés mais non réservés portent des sentinelles
        // vides — voir le JSDoc du cycle de vie dans `src/actions/interviews.ts`).
        const hasInterview = row.interviewEmailNorm !== null && row.interviewEmailNorm.length > 0;
        return {
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
          interview: hasInterview
            ? {
                booked: true,
                startsAt:
                  row.interviewStartsAt === null ? null : row.interviewStartsAt.toISOString(),
              }
            : null,
        };
      }),
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
        interviewStartsAt: interviews.startsAt,
        interviewEmailNorm: interviews.emailNorm,
      })
      .from(jobApplications)
      .leftJoin(interviews, eq(jobApplications.interviewId, interviews.id))
      .where(eq(jobApplications.id, parsedId.data))
      .limit(1);

    const row = rows[0];
    if (row === undefined) return { ok: false, code: "not_found" };

    const hasInterview = row.interviewEmailNorm !== null && row.interviewEmailNorm.length > 0;
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
        cvUrl: `/api/applications/${row.id}/cv`,
        interview: hasInterview
          ? {
              booked: true,
              startsAt: row.interviewStartsAt === null ? null : row.interviewStartsAt.toISOString(),
            }
          : null,
      },
    };
  } catch (error) {
    console.error("[recrutement] échec de lecture de la candidature", error);
    throw error;
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
 * @param kind `"invite"` ou `"reject"`.
 * @param locale `"fr"` ou `"en"`.
 * @returns `{ ok: true; subject; body }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function getEmailTemplate(
  kind: EmailTemplateKind,
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
// inviteToInterview / rejectApplication — e-mail CEO puis écriture.
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
    kind: EmailTemplateKind;
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
 * Invite un candidat à un entretien : génère un lien `createInterviewLink`,
 * envoie l'e-mail personnalisé, puis passe la candidature à `invite`.
 *
 * SÉQUENCE (règle invariante **e-mail d'abord, écriture ensuite**) :
 * 1. Zod → session CEO → lecture de la ligne (e-mail LUE EN BASE) ;
 * 2. `status = "refuse"` → `conflict` (refus terminal, aucun détail) ;
 * 3. `createInterviewLink(locale)` → échec → `failed` (jamais de fuite des
 *    codes internes `forbidden`/`invalid` : le CEO est déjà authentifié) ;
 * 4. `renderTemplate` (le lien est TOUJOURS présent dans l'e-mail final)
 *    → `sendMail` → échec → **`mail_failed` sans AUCUNE écriture** (le CEO
 *    réessaiera, un nouveau lien sera généré) ;
 * 5. UPDATE conditionnel `status <> 'refuse'` + `.returning()` → 0 ligne =
 *    `conflict` (refusé/refusé deux fois entre-temps — idempotence) ;
 * 6. sauvegarde optionnelle du modèle + audit, tous deux NON FATAUX.
 *
 * @param input `applicationId` (uuid), `subject` (1–200), `body` (1–10 000),
 *   `saveTemplate` optionnel.
 * @returns `{ ok: true; url }` (URL **absolue** du lien, affichable au CEO)
 *   ou `{ ok: false; code }`. Codes bruts uniquement.
 * @throws Erreur d'infra DB — journalisée puis renvoyée en `failed`.
 */
export async function inviteToInterview(
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

    // 2. Lecture de la ligne — l'e-mail du destinataire vient TOUJOURS de
    //    la base (jamais du payload) ; id inconnu = `not_found`, aucun détail.
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
    // Refus TERMINAL : aucune invitation possible, aucun détail renvoyé.
    if (application.status === "refuse") return { ok: false, code: "conflict" };

    // 3. Lien d'entretien (jeton aléatoire) — codes internes propages en
    //    `failed` (le CEO est déjà authentifié ailleurs : pas de fuite).
    //    Le label porte le nom du candidat (colonnes `label`, distinctes des
    //    colonnes de réservation) — nom vide → aucun label.
    const recipient: ApplicationRecipient = {
      ...application,
      locale: asLocale(application.locale),
    };
    const candidateLabel = `${application.firstName} ${application.lastName}`.trim();
    const link = await createInterviewLink(
      recipient.locale,
      candidateLabel.length > 0 ? candidateLabel : undefined,
    );
    if (!link.ok) return { ok: false, code: "failed" };
    const lien = absoluteInterviewUrl(link.url);

    // Récupération de l'id de la ligne `interviews` créée : `createInterviewLink`
    // ne renvoie que `token`/`url`, et modifier son contrat est hors périmètre.
    // Le token est UNIQUE : 1 ligne garantie.
    const interviewRows = await db
      .select({ id: interviews.id })
      .from(interviews)
      .where(eq(interviews.token, link.token))
      .limit(1);
    const interviewId = interviewRows[0]?.id;
    if (interviewId === undefined) return { ok: false, code: "failed" };

    // 4. E-mail — AUCUNE écriture avant ce point : un échec Resend ne fige
    //    jamais le statut (`mail_failed` → le CEO réessaiera).
    const text = renderTemplate(body, {
      prenom: recipient.firstName,
      nom: recipient.lastName,
      lien,
    });
    const mail = await sendMail({ to: recipient.email, subject, text });
    if (!mail.ok) {
      console.error("[recrutement] invitation non envoyée (candidature inchangée)", mail.error);
      // Notification `mail_failed` — NON FATALE (notify() ne throw jamais) :
      // l'action renvoie son code métier `mail_failed` quoi qu'il arrive.
      // Destinataires : comptes **actifs** `ceo` moins l'acteur (règle d'or).
      await notify({
        type: "mail_failed",
        link: "/espace/recrutement",
        meta: { entity: recipient.email },
        recipientIds: (await activeUserIdsByRoles(["ceo"])).filter(
          (recipientId) => recipientId !== actor.id,
        ),
      });
      return { ok: false, code: "mail_failed" };
    }

    // 5. Écriture conditionnelle — 0 ligne = refusé/refusé entre-temps.
    const updated = await db
      .update(jobApplications)
      .set({
        status: "invite",
        interviewId,
        invitedAt: new Date(),
        updatedAt: sql`now()`,
      })
      .where(and(eq(jobApplications.id, applicationId), ne(jobApplications.status, "refuse")))
      .returning({ id: jobApplications.id });
    if (updated[0]?.id === undefined) return { ok: false, code: "conflict" };

    // 6. Sauvegarde du modèle + audit — NON FATAUX (e-mail déjà parti).
    if (saveTemplate === true) {
      await saveEmailTemplateIfRequested(db, {
        kind: "invite",
        locale: recipient.locale,
        subject,
        body,
        actorId: actor.id,
      });
    }
    await writeAuditActivity(db, {
      actorId: actor.id,
      action: "application.invited",
      entityId: applicationId,
      meta: { interviewId, actorId: actor.id },
    });

    return { ok: true, url: lien };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée, code `failed` —
    // aucun détail interne n'est propagé au client.
    console.error("[recrutement] échec d'invitation à l'entretien", error);
    return { ok: false, code: "failed" };
  }
}

/**
 * Refuse une candidature : e-mail de politesse, puis passage à `refuse`.
 *
 * Miroir de `inviteToInterview` (**e-mail d'abord, écriture ensuite**) :
 * - états admis : `nouveau` ET `invite` (refus possible APRÈS un entretien) ;
 * - `conflict` si déjà `refuse` (refus terminal, idempotence) ;
 * - PAS de lien d'entretien dans le rendu (`lien` non fourni → tout
 *   `{{lien}}` éventuel est laissé tel quel) ;
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
// recruitCandidate — recrutement d'un candidat en SDR (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Recrute un candidat (statut → `recrute`) et lui émet une **invitation
 * `sdr`** (lien d'activation de compte, même mécanique que le portail client).
 *
 * SÉQUENCE (motif `inviteToInterview`, e-mail d'abord sur le STATUT) :
 * 1. Zod (`applicationId` uuid + `locale` ∈ locales) → `invalid` ; acteur
 *    revalidé (uuid → `invalid`, rôle ≠ `ceo` → `forbidden`) ;
 * 2. candidature lue en base (e-mail LUE EN BASE) → absente → `not_found` ;
 *    `status` ∉ {`nouveau`, `invite`} → `invalid` (déjà recrutée ou refusée) ;
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
    // États recrutables : `nouveau` ou `invite` (post-entretien) — un refus
    // est terminal, un recrutement déjà effectué est idempotent-refusé.
    if (application.status !== "nouveau" && application.status !== "invite") {
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
      // Notification `mail_failed` — NON FATALE, même motif que
      // `inviteToInterview` : comptes **actifs** `ceo` moins l'acteur.
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
