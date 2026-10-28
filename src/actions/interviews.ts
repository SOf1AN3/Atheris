"use server";

/**
 * Atheris — Server Actions **entretien Sales Development Representative** (PLAN §2.3 · §Contrats).
 *
 * CONTRAT PUBLIC (codes BRUTS uniquement — le client traduit, jamais de
 * message serveur, voir `SiteContent.interview.errors.*`) :
 * - `createInterviewLink(locale?, label?)` → `{ ok: true; token; url }` |
 *   `{ ok: false; code: "forbidden" | "invalid" | "failed" }` ;
 * - `listInterviews()` → `{ ok: true; interviews: InterviewListItem[] }` |
 *   `{ ok: false; code: "forbidden" }` ;
 * - `deleteInterviewLink(id)` → `{ ok: true }` |
 *   `{ ok: false; code: "forbidden" | "not_found" | "invalid" | "failed" }` ;
 * - `submitInterview(input)` → `{ ok: true }` |
 *   `{ ok: false; code: "invalid" | "not_found" | "taken" | "rate_limited" | "failed" }`.
 *
 * ⚠ CYCLE DE VIE DU LIEN (lecture du contrat §1.1 — toutes les colonnes
 * Candidat sont `NOT NULL`) :
 * 1. `createInterviewLink` **INSERT** la ligne du lien avec des valeurs
 *    sentinelle (`firstName/lastName/email/timezone/localDate/localHour` vides,
 *    `emailNorm = ""` marqueur « pas encore réservé »). Sans cette ligne, la
 *    page `/{locale}/entretien/[token]` ne pourrait pas résoudre le jeton
 *    (404 générique, PLAN §3.1) avant toute saisie.
 * 2. Le candidat soumet → `submitInterview` **UPDATE cette même ligne**
 *    (`WHERE id AND status = 'pending' AND email_norm = ''`) : le jeton est
 *    UNIQUE en base, un second INSERT avec le même jeton déclencherait
 *    mécaniquement `taken` — le lien est donc à **usage unique**, comme le
 *    documente le JSDoc de la table.
 * 3. `startsAt` sentinelle à la création = instant de création (précision
 *    ms) : il est disjoint des créneaux publiés (alignés sur la minute
 *    exacte) et, en pratique, unique parmi les liens `pending` — une
 *    collision d'index (23505) est renvoyée `failed` (création CEO, volume
 *    quasi nul).
 *
 * SÉQUENCE `submitInterview` (PLAN §2.3) : rate-limit 1/60 s/IP (motif
 * `src/actions/contact.ts`) → Zod → token existant + `pending` +
 * non réservé → `isValidSlot()` sur la fenêtre **J+1 → J+3 dérivée du
 * `createdAt` de la ligne en base** (Lot 2 : fenêtre figée à la génération,
 * plus rien ne vient du client) → écriture (violation d'index unique
 * partielle → `taken`) → `sendMail()`.
 *
 * RÈGLE ABSOLUE (PLAN §Sécurité 4) : **l'échec d'e-mail ne fait jamais
 * échouer la réservation** — écriture d'abord, échec mail → `notifiedAt`
 * reste `NULL` + journal serveur, réponse `{ ok: true }`.
 *
 * RATE-LIMIT : la Map est celle du module (best effort, mémoire de process,
 * quotas indépendants de `contact.ts`). Le quota est consommé par **toute**
 * tentative aboutie ou refusée, **sauf `taken`** : le PLAN impose de
 * re-choisir un créneau « sans recharger » (§Sécurité 2), ce qu'une fenêtre
 * de 60 s rendrait impossible.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy) →
 * `next build` ne lit jamais `DATABASE_URL`.
 */

import { randomBytes } from "node:crypto";

import { and, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/auth";
import { locales, type Locale } from "@/i18n/config";
import { getDb } from "@/lib/db";
import { activities, interviewStatus, interviews, jobApplications } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { normalizeEmail } from "@/lib/prospect-dedup";
import { getSlotsForWindowDates, isValidSlot, toRecruiterTime } from "@/lib/slots";
import type { Role } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` : effacés à la
// compilation, seules les fonctions async subsistent à l'exécution (exigence
// d'un fichier `"use server"`).
// ---------------------------------------------------------------------------

/** Statut d'un entretien, dérivé de l'enum Drizzle `interview_status`. */
export type InterviewStatus = (typeof interviewStatus.enumValues)[number];

/** Contrat de `createInterviewLink`. */
export type CreateInterviewLinkResult =
  | { ok: true; token: string; url: string }
  | { ok: false; code: "forbidden" | "invalid" | "failed" };

/** Ligne de la liste `/espace/entretien` — dates en ISO 8601 (sérialisables). */
export type InterviewListItem = {
  id: string;
  token: string;
  /**
   * Étiquette affichée au CEO (nom du candidat si lien issu d'une
   * candidature, texte libre si création manuelle) — `null` si absente.
   * Aucun rapport avec les colonnes de réservation (`firstName`/`lastName`).
   */
  label: string | null;
  firstName: string;
  lastName: string;
  email: string;
  /** Instant UTC du créneau (`starts_at`), ISO 8601. */
  startsAt: string;
  timezone: string;
  localDate: string;
  localHour: string;
  status: InterviewStatus;
  /** `false` = lien créé mais pas encore réservé (valeurs sentinelle). */
  booked: boolean;
  notifiedAt: string | null;
  createdAt: string;
};

/** Contrat de `listInterviews` (tri `createdAt` décroissant). */
export type ListInterviewsResult =
  | { ok: true; interviews: InterviewListItem[] }
  | { ok: false; code: "forbidden" };

/** Contrat de `deleteInterviewLink` (union discriminée par `ok`). */
export type DeleteInterviewLinkResult =
  | { ok: true }
  | { ok: false; code: "forbidden" | "not_found" | "invalid" | "failed" };

/** Entrée de `submitInterview` (contrat PLAN §Contrats inter-pistes). */
export type SubmitInterviewInput = {
  token: string;
  firstName: string;
  lastName: string;
  email: string;
  instant: string;
  timezone: string;
  localDate: string;
  localHour: string;
};

/** Codes d'échec de `submitInterview` — traduits côté client, jamais servis en message. */
export type SubmitInterviewFailureCode =
  | "invalid"
  | "not_found"
  | "taken"
  | "rate_limited"
  | "failed";

/** Contrat de `submitInterview` : union discriminée par `ok`. */
export type SubmitInterviewResult = { ok: true } | { ok: false; code: SubmitInterviewFailureCode };

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout accès DB.
// ---------------------------------------------------------------------------

/** Jeton : 32 bytes aléatoires en hexa minuscules (64 caractères). */
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

const localeSchema = z.enum(locales);

/**
 * Étiquette optionnelle d'un lien (≤ 120 car.) : nom du candidat si le lien
 * est issu d'une candidature, texte libre si création manuelle. Le trim est
 * appliqué par Zod ; un label vide après trim est converti `null` en DB (voir
 * `createInterviewLink`).
 */
const labelSchema = z.string().trim().max(120).optional();

const submitInterviewSchema = z.object({
  token: z.string().regex(TOKEN_PATTERN),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z
    .string()
    .trim()
    .min(1)
    .max(320)
    .pipe(z.email()),
  // ISO 8601 avec offset accepté (`Z` ou `±hh:mm`) — re-validé ensuite par
  // `isValidSlot` (l'offset seul ne prouve rien : c'est l'instant qui compte).
  instant: z.iso.datetime({ offset: true }),
  timezone: z.string().trim().min(1).max(64),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  localHour: z.string().regex(/^\d{2}:\d{2}$/),
});

// ---------------------------------------------------------------------------
// Constantes applicatives.
// ---------------------------------------------------------------------------

/**
 * Destinataire **constant** imposé par l'appelant (jamais issu du
 * formulaire) — PLAN §Sécurité 4.
 */
const RECRUITER_EMAIL = "admin@sofianeasma.me";

/** Locale de repli du lien si l'appelant n'en précise aucune. */
const DEFAULT_LOCALE: Locale = "fr";

/** 32 bytes aléatoires → 64 caractères hexadécimaux. */
const TOKEN_BYTES = 32;

/** Marqueur « lien créé, pas encore réservé » (colonnes `NOT NULL` sans défaut). */
const UNBOOKED = "";

/** Volume maximal renvoyé par `listInterviews` (plafond de payload). */
const LIST_LIMIT = 200;

/** Rate-limit : 1 tentative acceptée par IP et par fenêtre de 60 s. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_SENDS = 1;
/** Entretien de la Map : purge au-delà de cette taille, purge totale après. */
const RATE_MAP_PRUNE_SIZE = 1000;
const RATE_MAP_CLEAR_SIZE = 10_000;

// ---------------------------------------------------------------------------
// Rate-limit (Map module-scope — BEST EFFORT, miroir du motif contact.ts).
// ---------------------------------------------------------------------------

/** ip → horodatages (ms) des tentatives consommées encore dans la fenêtre. */
const rateSends = new Map<string, number[]>();

/** `true` si l'IP a déjà atteint la jauge dans la fenêtre glissante. */
function isRateLimited(ip: string, now: number): boolean {
  const hits = rateSends.get(ip);
  if (hits === undefined) return false;

  const recent = hits.filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (recent.length === 0) {
    rateSends.delete(ip);
    return false;
  }
  rateSends.set(ip, recent);
  return recent.length >= RATE_MAX_SENDS;
}

/** Consigne une tentative comptée + entretien borné de la Map (fuite contrôlée). */
function recordRateSend(ip: string, now: number): void {
  if (rateSends.size > RATE_MAP_PRUNE_SIZE) {
    for (const [key, hits] of rateSends) {
      if (hits.every((timestamp) => now - timestamp >= RATE_WINDOW_MS)) {
        rateSends.delete(key);
      }
    }
    // Dernier recours : au-delà du plafond, la jauge repart à zéro.
    if (rateSends.size > RATE_MAP_CLEAR_SIZE) rateSends.clear();
  }
  rateSends.set(ip, [...(rateSends.get(ip) ?? []), now]);
}

/**
 * IP visiteur : en-têtes serveur d'abord (non falsifiable côté client),
 * repli `"unknown"` (dev sans proxy / hors requête). Miroir du pattern de
 * `src/actions/contact.ts`.
 */
async function resolveVisitorIp(): Promise<string> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  } catch {
    // headers() indisponible (hors requête, tests) : repli silencieux.
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Aides privées.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js reconstruite **côté serveur** (aucun identifiant ni rôle ne
 * transite par le client — miroir de `src/actions/ceo.ts`).
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
 * Détecte une violation d'index UNIQUE PostgreSQL (`23505`) même enveloppée
 * par le driver : on remonte la chaîne `cause` (5 niveaux max). Miroir du
 * helper **non exporté** de `src/actions/contact.ts` (fichier indépendant →
 * duplication assumée).
 */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current !== null && current !== undefined && depth < 5; depth += 1) {
    if (typeof current !== "object") return false;
    const code = (current as { code?: unknown }).code;
    if (code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** `2026-10-27` → `27/10/2026` (affichage e-mail uniquement). */
function formatDateFr(localDate: string): string {
  const [year, month, day] = localDate.split("-");
  return `${day}/${month}/${year}`;
}

/** `10:00` → `10h00` (sujet d'e-mail sans `:` après le premier jeton). */
function hourFr(localHour: string): string {
  return localHour.replace(":", "h");
}

/**
 * Récapitulatif interne **en français** — heure du candidat ET équivalent
 * `Africa/Algiers` (via `toRecruiterTime`), aucune donnée secrète : le
 * jeton du lien n'y figure jamais. Mentionne aussi la consigne métier
 * « présent 5 min avant · ~30 min » (PLAN §5 · clé `interview.meetNote`).
 */
function buildRecapText(args: {
  firstName: string;
  lastName: string;
  email: string;
  instant: string;
  timezone: string;
  localDate: string;
  localHour: string;
}): string {
  const { firstName, lastName, email, instant, timezone, localDate, localHour } = args;
  return [
    "Bonjour,",
    "",
    "Une nouvelle réservation d'entretien a été effectuée via le lien public Atheris Labs.",
    "",
    `Candidat : ${firstName} ${lastName}`,
    `Email : ${email}`,
    `Créneau : ${toRecruiterTime(instant, timezone)}`,
    `Date et heure choisies : ${formatDateFr(localDate)} à ${hourFr(localHour)} (fuseau ${timezone})`,
    "Statut : en attente de réalisation",
    "Rappel entretien : présent 5 min avant · ~30 min (Google Meet)",
    "",
    "Récapitulatif interne — aucun jeton ni donnée confidentielle ne figure dans ce message.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// createInterviewLink — génération d'un lien (réservée CEO/Rayan).
// ---------------------------------------------------------------------------

/**
 * Crée une ligne d'entretien `pending` **à usage unique** et renvoie l'URL
 * publique `/{locale}/entretien/{token}`.
 *
 * SÉCURITÉ : session Auth.js requise, compte `active` **et** rôle `ceo`
 * (le rôle est relu côté serveur — un acteur forgé depuis le client est
 * impossible). Le jeton fait 32 bytes aléatoires (`crypto.randomBytes`,
 * non devinable) et l'URL est renvoyée **au CEO seul**.
 *
 * @param locale Locale optionnelle du lien (défaut `fr`) — validée par Zod.
 * @param label Étiquette optionnelle affichée au CEO (nom du candidat si le
 *   lien est issu d'une candidature, texte libre si création manuelle) —
 *   validée par Zod (`trim`, max 120 car.) ; un label vide/absent est stocké
 *   `null` en DB. Ne touche **jamais** aux colonnes de réservation.
 * @returns `{ ok: true; token; url }` ; sinon `forbidden` (session absente /
 *   rôle non `ceo`), `invalid` (locale ou label forgé) ou `failed` (collision
 *   d'index rare sur la sentinelle `starts_at`).
 * @throws Erreur d'infra DB — journalisée puis propagée → 500 (jamais
 *   transformée en code métier), sauf la violation d'unique traitée ci-dessus.
 */
export async function createInterviewLink(
  locale?: Locale,
  label?: string,
): Promise<CreateInterviewLinkResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const parsedLocale = localeSchema.safeParse(locale ?? DEFAULT_LOCALE);
  if (!parsedLocale.success) return { ok: false, code: "invalid" };

  const parsedLabel = labelSchema.safeParse(label);
  if (!parsedLabel.success) return { ok: false, code: "invalid" };
  // Un label vide après trim (ou absent) → `null` en base.
  const linkLabel = parsedLabel.data && parsedLabel.data.length > 0 ? parsedLabel.data : null;

  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const db = getDb();

  try {
    await db.insert(interviews).values({
      token,
      label: linkLabel,
      // Sentinelles « lien créé, pas encore réservé » (toutes ces colonnes
      // sont NOT NULL sans défaut, PLAN §1.1) — remplies à la réservation.
      firstName: "",
      lastName: "",
      email: UNBOOKED,
      emailNorm: UNBOOKED,
      startsAt: new Date(),
      timezone: UNBOOKED,
      localDate: UNBOOKED,
      localHour: UNBOOKED,
      status: "pending",
      notifiedAt: null,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Deux liens créés exactement au même milliseconde (sentinelle
      // `starts_at` identique) : refus net plutôt que 500.
      console.error("[interviews] collision d'index à la création du lien");
      return { ok: false, code: "failed" };
    }
    console.error("[interviews] échec de création du lien d'entretien", error);
    throw error;
  }

  return { ok: true, token, url: `/${parsedLocale.data}/entretien/${token}` };
}

// ---------------------------------------------------------------------------
// listInterviews — lecture (page /espace/entretien).
// ---------------------------------------------------------------------------

/**
 * Liste les entretiens **du compte** (liens créés + créneaux réservés),
 * triés par `createdAt` décroissant, bornés à `LIST_LIMIT`.
 *
 * SÉCURITÉ : session `active` + rôle `ceo` requis (la donnée contient des
 * PII candidats et les jetons d'accès ; le jeton est renvoyé au seul compte
 * qui peut déjà les générer, afin de permettre la copie du lien).
 *
 * @returns `{ ok: true; interviews }` ou `{ ok: false; code: "forbidden" }`.
 * @throws Erreur d'infra DB — journalisée puis propagée → 500.
 */
export async function listInterviews(): Promise<ListInterviewsResult> {
  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const db = getDb();
  try {
    const rows = await db
      .select({
        id: interviews.id,
        token: interviews.token,
        label: interviews.label,
        firstName: interviews.firstName,
        lastName: interviews.lastName,
        email: interviews.email,
        emailNorm: interviews.emailNorm,
        startsAt: interviews.startsAt,
        timezone: interviews.timezone,
        localDate: interviews.localDate,
        localHour: interviews.localHour,
        status: interviews.status,
        notifiedAt: interviews.notifiedAt,
        createdAt: interviews.createdAt,
      })
      .from(interviews)
      .orderBy(desc(interviews.createdAt))
      .limit(LIST_LIMIT);

    return {
      ok: true,
      interviews: rows.map((row) => ({
        id: row.id,
        token: row.token,
        label: row.label,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        startsAt: row.startsAt.toISOString(),
        timezone: row.timezone,
        localDate: row.localDate,
        localHour: row.localHour,
        status: row.status,
        booked: row.emailNorm.length > 0,
        notifiedAt: row.notifiedAt === null ? null : row.notifiedAt.toISOString(),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("[interviews] échec de la liste des entretiens", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// deleteInterviewLink — suppression d'un lien (CEO seul).
// ---------------------------------------------------------------------------

/**
 * Supprime un lien d'entretien (rôle `ceo` uniquement, miroir des autres
 * actions du fichier : session `active` relu côté serveur).
 *
 * SÉQUENCE (driver `neon-http` : **aucun `db.transaction()`** → statements
 * séquentiels) :
 * 1. Zod uuid sur `id` → sinon `invalid` ; acteur non `ceo` → `forbidden` ;
 * 2. si une candidature référence l'entretien (`job_applications.interview_id`)
 *    : d'abord `UPDATE job_applications SET interview_id = NULL WHERE
 *    interview_id = $id` (la FK `no action` interdirait le DELETE tant que la
 *    référence existe) ;
 * 3. `DELETE FROM interviews WHERE id = $id` — 0 ligne (entretien déjà
 *    supprimé / id inconnu) → `not_found` ;
 * 4. Audit `interview.deleted` — **non fatal**, jamais le token.
 *
 * @param id uuid de la ligne `interviews` (validé par Zod).
 * @returns `{ ok: true }` ; sinon `invalid` (id malformé), `forbidden`
 *   (session absente / rôle non `ceo`), `not_found` (ligne absente) ou
 *   `failed` (infra).
 */
export async function deleteInterviewLink(id: string): Promise<DeleteInterviewLinkResult> {
  // 1. Validation Zod AVANT toute requête — id forgé → `invalid`.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { ok: false, code: "invalid" };

  const actor = await activeActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  const interviewId = parsedId.data;
  const db = getDb();

  try {
    // 2. Détachement des candidatures référençant cet entretien — 0 ou N
    //    lignes, sans conséquence (le DELETE juste après fait foi).
    await db
      .update(jobApplications)
      .set({ interviewId: null })
      .where(eq(jobApplications.interviewId, interviewId));

    // 3. Suppression — `.returning()` : 0 ligne = entretien inconnu/déjà
    //    supprimé, même refus non fuiteux qu'un id forgé côté liste.
    const deleted = await db
      .delete(interviews)
      .where(eq(interviews.id, interviewId))
      .returning({ id: interviews.id });
    if (deleted[0] === undefined) return { ok: false, code: "not_found" };

    // 4. Audit NON FATAL — jamais le token (métadonnées seulement).
    try {
      await db.insert(activities).values({
        actorId: actor.id,
        action: "interview.deleted",
        entityType: "interview",
        entityId: interviewId,
        meta: { actorId: actor.id },
      });
    } catch (error) {
      console.error(
        "[interviews] activité `interview.deleted` non journalisée (lien supprimé)",
        error,
      );
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée, code `failed` — le
    // contrat public de suppression prévoit ce code, pas de 500.
    console.error("[interviews] échec de suppression du lien", error);
    return { ok: false, code: "failed" };
  }
}

// ---------------------------------------------------------------------------
// submitInterview — réservation publique (lien non authentifié).
// ---------------------------------------------------------------------------

/**
 * Corps de la réservation : Zod → token → revalidation créneau → écriture →
 * e-mail. Séparé de l'action pour que le quota de rate-limit ne soit consommé
 * qu'**après** connaissance du résultat (voir plus bas).
 */
async function processSubmission(input: SubmitInterviewInput): Promise<SubmitInterviewResult> {
  // 2. Validation Zod — avant tout accès DB, aucun détail renvoyé.
  const parsed = submitInterviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };
  const { token, firstName, lastName, email, instant, timezone, localDate, localHour } = parsed.data;

  try {
    const db = getDb();
    // 3. Token existant, `pending` et **pas déjà réservé** (usage unique) :
    //    lien inconnu / annulé / déjà consommé → même code, aucun détail.
    const rows = await db
      .select({
        id: interviews.id,
        status: interviews.status,
        emailNorm: interviews.emailNorm,
        // Création du lien → sert à dériver la fenêtre J+1 → J+3 (source
        // serveur : le client ne choisit ni le jour, ni l'étendue).
        createdAt: interviews.createdAt,
      })
      .from(interviews)
      .where(eq(interviews.token, token))
      .limit(1);
    const row = rows[0];
    if (row === undefined || row.status !== "pending" || row.emailNorm !== UNBOOKED) {
      return { ok: false, code: "not_found" };
    }

    // 4. Revalidation SERVEUR du créneau (Lot 2) : la fenêtre **figée**
    //    J+1 → J+3 est dérivée du `createdAt` de CETTE ligne (serveur,
    //    jamais le client) — grille ancrée en heure algérienne, rendue dans
    //    le fuseau reçu, instant exact, trou DST rejeté (PLAN §Sécurité 3).
    //    `createdAt` illisible → `[]` → rejet `invalid` (défaut sûr).
    const dates = getSlotsForWindowDates(row.createdAt);
    if (!isValidSlot({ timezone, localDate, localHour, instant }, dates)) {
      return { ok: false, code: "invalid" };
    }

    // 5. Écriture de la réservation sur la ligne du lien (usage unique).
    const startsAt = new Date(Date.parse(instant));
    let bookingId: string;
    try {
      const updated = await db
        .update(interviews)
        .set({
          firstName,
          lastName,
          email,
          emailNorm: normalizeEmail(email),
          startsAt,
          timezone,
          localDate,
          localHour,
        })
        .where(
          and(
            eq(interviews.id, row.id),
            eq(interviews.status, "pending"),
            eq(interviews.emailNorm, UNBOOKED),
          ),
        )
        .returning({ id: interviews.id });

      // 0 ligne = lien consommé entre la lecture et l'écriture (double clic) :
      // même refus non fuiteux qu'un lien inconnu.
      const returnedId = updated[0]?.id;
      if (returnedId === undefined) return { ok: false, code: "not_found" };
      bookingId = returnedId;
    } catch (error) {
      // Index unique partiel `interviews_pending_starts_at_uq` : un autre
      // entretien `pending` occupe déjà ce créneau → rechoix immédiat.
      if (isUniqueViolation(error)) {
        console.warn("[interviews] créneau déjà occupé (index unique partiel)");
        return { ok: false, code: "taken" };
      }
      console.error("[interviews] échec d'écriture de la réservation", error);
      return { ok: false, code: "failed" };
    }

    // 6. E-mail de récapitulatif — **jamais fatal** (PLAN §Sécurité 4) :
    //    la réservation est déjà en base, un échec Resend laisse simplement
    //    `notified_at` à NULL et est journalisé. L'enveloppe try/catch rend
    //    l'invariant local : MÊME une exception inattendue ici (il ne peut y
    //    en avoir — `sendMail` est un module total) laisserait la réponse en
    //    `{ ok: true }`, la écriture étant déjà confirmée.
    try {
      const subject = `Nouvelle réservation d'entretien — ${firstName} ${lastName} — ${formatDateFr(localDate)} ${hourFr(localHour)}`;
      const mail = await sendMail({
        to: RECRUITER_EMAIL,
        subject,
        text: buildRecapText({ firstName, lastName, email, instant, timezone, localDate, localHour }),
      });

      if (mail.ok) {
        try {
          await db
            .update(interviews)
            .set({ notifiedAt: new Date() })
            .where(eq(interviews.id, bookingId));
        } catch (error) {
          // Non fatal : la réservation est confirmée, seul le suivi manque.
          console.error("[interviews] `notified_at` non journalisé (réservation confirmée)", error);
        }
      } else {
        console.error("[interviews] récapitulatif non envoyé (réservation conservée)", mail.error);
      }
    } catch (error) {
      console.error("[interviews] récapitulatif interrompu (réservation conservée)", error);
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB indisponible…) : journalisée puis renvoyée en code
    // `failed` — le contrat public ne prévoit pas de 500 sur ce formulaire.
    console.error("[interviews] échec de soumission d'entretien", error);
    return { ok: false, code: "failed" };
  }
}

/**
 * Réserve un créneau via un lien public non authentifié.
 *
 * @param input `token`, coordonnées du candidat et créneau choisi
 *   (`instant` + `timezone` + `localDate` + `localHour`).
 * @returns `{ ok: true }` (réservation écrite **et** e-mail tenté) ; sinon
 *   `rate_limited` (1 tentative / 60 s / IP), `invalid` (Zod ou créneau
 *   rejeté par `isValidSlot`), `not_found` (jeton inconnu, annulé ou déjà
 *   consommé), `taken` (créneau occupé par un autre entretien `pending`),
 *   `failed` (infra). Chaque code est renvoyé **tel quel** : le client
 *   traduit, le serveur ne produit aucun message.
 */
export async function submitInterview(input: SubmitInterviewInput): Promise<SubmitInterviewResult> {
  // 1. Rate-limit — vérifié AVANT toute validation (PLAN §2.3) ; l'IP vient
  //    des en-têtes serveur, jamais du client.
  const now = Date.now();
  const ip = await resolveVisitorIp();
  if (isRateLimited(ip, now)) return { ok: false, code: "rate_limited" };

  // 2 → 7 : Zod → token → créneau → écriture → e-mail.
  const result = await processSubmission(input);

  // Consommation du quota : toute tentative aboutie ou refusée compte,
  // **sauf `taken`** — un créneau déjà pris doit pouvoir être re-choisi
  // immédiatement sans recharger (PLAN §Sécurité 2).
  if (result.ok || result.code !== "taken") recordRateSend(ip, now);
  return result;
}
