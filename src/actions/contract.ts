"use server";

/**
 * Atheris — Server Actions du contrat de partenariat SDR (L11 · D5/D6).
 *
 * CONTRAT PUBLIC (codes BRUTS uniquement — le client traduit, C2) :
 * - `acceptContract(input)` → `{ ok: true }` |
 *   `{ ok: false; code: "invalid" | "forbidden" | "failed" }` ;
 * - `getMyContractConsent()` → `{ ok: true; consent }` |
 *   `{ ok: false; code: "forbidden" | "failed" }`.
 *
 * ─── PREUVE DE CONSENTEMENT (D5) ───────────────────────────────────────────
 * `CONTRACT_VERSION` est FIGÉE côté serveur (jamais « latest ») : la preuve
 * doit pouvoir dire QUEL texte a été coché. Une ligne par (compte, version) —
 * `unique(userId, contractVersion)`. L'IP est lue CÔTÉ SERVEUR depuis
 * `x-forwarded-for` (jamais depuis le payload : un champ client ne prouve
 * rien) ; `null` si l'en-tête est absent.
 *
 * neon-http : AUCUNE transaction (C3) — écriture simple +
 * `onConflictDoNothing()` + `.returning()` : **0 ligne = déjà accepté** →
 * succès idempotent `{ ok: true }` (double clic, rejeu).
 *
 * ─── COPIE E-MAIL (best effort, C6) ────────────────────────────────────────
 * Après l'écriture, une copie (9 clauses + horodatage + version) part via
 * `sendMail` (respecte `MAIL_DISABLED=1`). **Un échec ne retire JAMAIS sa
 * validité au consentement** : il est prouvé par `acceptedAt` + `ipAddress`,
 * seul `emailSentAt` reste `NULL` — l'UI n'affiche alors pas la mention
 * « copie envoyée ». Tout échec (compte absent, refus Resend, réseau, UPDATE
 * manqué) est journalisé et avale : l'action renvoie quand même `{ ok: true }`.
 *
 * SÉCURITÉ : session Auth.js + compte `active` + rôle `sdr` relu côté serveur
 * sur CHAQUE action. Le destinataire de la copie est lu EN BASE.
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur des actions (lazy) →
 * `next build` ne lit jamais `DATABASE_URL`.
 */

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/auth";
import { defaultLocale, isValidLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getDb } from "@/lib/db";
import { contractConsents, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { isRole } from "@/lib/permissions";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` : effacés à la
// compilation, seules les fonctions async subsistent (exigence "use server").
// ---------------------------------------------------------------------------

/** Résultat d'`acceptContract` — codes bruts traduits côté client. */
export type AcceptContractResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "forbidden" | "failed" };

/** État du consentement de l'utilisateur courant (100 % sérialisable). */
export type ContractConsentInfo = {
  /** Version courante du contrat (constante serveur — jamais « latest »). */
  version: string;
  /** ISO 8601 de l'acceptation pour CETTE version, `null` si aucune ligne. */
  acceptedAt: string | null;
  /** Copie e-mail effectivement envoyée (`emailSentAt` renseigné). */
  emailSent: boolean;
};

/** Résultat de `getMyContractConsent`. */
export type GetMyContractConsentResult =
  | { ok: true; consent: ContractConsentInfo }
  | { ok: false; code: "forbidden" | "failed" };

// ---------------------------------------------------------------------------
// Constantes et schémas (PRIVÉS : un fichier "use server" n'exporte que des
// fonctions async — `export const` casserait le build C1, pas tsc).
// ---------------------------------------------------------------------------

/**
 * Version FIGÉE du texte accepté — la preuve doit dire quel texte a été coché
 * (`contract_consents.contract_version`). Si le contrat change, bump ici :
 * une NOUVELLE ligne sera exigée, l'ancien consentement reste intact.
 */
const CONTRACT_VERSION = "2026-10-v1";

/** Seule forme d'entrée admise : `accepted` doit être strictement `true`. */
const acceptSchema = z.object({
  accepted: z.literal(true),
});

// ---------------------------------------------------------------------------
// Aides privées.
// ---------------------------------------------------------------------------

/**
 * Session Auth.js reconstruite **côté serveur** (aucun identifiant ni rôle
 * ne transite par le client).
 *
 * @returns `null` si aucune session, compte non `active`, rôle inconnu ou
 *   rôle ≠ `sdr`.
 */
async function activeSdrActor(): Promise<{ id: string } | null> {
  const session = await auth();
  if (!session || session.user.status !== "active") return null;
  if (!isRole(session.user.role)) return null;
  if (session.user.role !== "sdr") return null;
  return { id: session.user.id };
}

/**
 * IP du clic : en-tête serveur `x-forwarded-for` (PREMIER saut, trim) —
 * source non falsifiable côté client, jamais lue depuis le payload.
 * Absente ou illisible (hors requête, dev sans proxy) → `null`.
 */
async function resolveCallerIp(): Promise<string | null> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const first = forwarded === null ? "" : forwarded.split(",")[0].trim();
    return first.length > 0 ? first : null;
  } catch {
    // headers() indisponible (hors requête, tests) : IP inconnue.
    return null;
  }
}

/**
 * Locale de la copie e-mail : la page d'origine (`referer` = URL localisée
 * depuis laquelle l'acceptation a eu lieu), puis `Accept-Language` (miroir de
 * la résolution du middleware), puis `defaultLocale`. Aucune locale stockée
 * sur `users` — cette résolution est le repli serveur exact.
 */
async function resolveCopyLocale(): Promise<Locale> {
  try {
    const h = await headers();

    const referer = h.get("referer");
    if (referer !== null) {
      try {
        const segment = new URL(referer).pathname.split("/")[1];
        if (segment !== undefined && isValidLocale(segment)) return segment;
      } catch {
        // URL illisible → repli sur Accept-Language.
      }
    }

    const acceptLanguage = h.get("accept-language");
    if (acceptLanguage !== null) {
      for (const entry of acceptLanguage.split(",")) {
        const language = entry.split(";")[0].trim().toLowerCase().split("-")[0];
        if (isValidLocale(language)) return language;
      }
    }
  } catch {
    // headers() indisponible (hors requête, tests) : locale par défaut.
  }
  return defaultLocale;
}

/**
 * Format de date/heure UNIQUE pour la copie — miroir de la page
 * (`Africa/Algiers`, la DB stocke en UTC), FR → `fr-DZ`, EN → `en-US`.
 */
function formatDateTime(value: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-DZ" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(value);
}

/**
 * Copie contractuelle par e-mail — **best effort, ne lève jamais** (voir
 * l'en-tête du fichier) : les 9 clauses viennent du bloc `contract` du dict
 * (texte EXACT accepté à l'écran, C2), le destinataire est lu EN BASE.
 *
 * Succès → `emailSentAt` renseigné. Échec → `emailSentAt` reste `NULL`, le
 * consentement reste intégralement valable (`acceptedAt` + `ipAddress`).
 */
async function sendContractCopy(
  userId: string,
  consentId: string,
  acceptedAt: Date,
): Promise<void> {
  try {
    const db = getDb();

    // Destinataire lu EN BASE (jamais issu du payload).
    const accounts = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const account = accounts[0];
    if (account === undefined) return;

    const locale = await resolveCopyLocale();
    const dict = await getDictionary(locale);
    const { mail, clauses } = dict.contract;

    const lines: string[] = [
      mail.greeting,
      "",
      mail.intro,
      "",
      mail.versionLabel.replace("{{version}}", CONTRACT_VERSION),
      mail.acceptedAtLabel.replace("{{date}}", formatDateTime(acceptedAt, locale)),
      "",
    ];
    clauses.forEach((clause, index) => {
      lines.push(`${index + 1}. ${clause.title}`);
      lines.push(clause.body);
      lines.push("");
    });
    lines.push(mail.closing);

    const result = await sendMail({
      to: account.email,
      subject: mail.subject.replace("{{version}}", CONTRACT_VERSION),
      text: lines.join("\n"),
    });

    if (!result.ok) {
      // Refus attendu en dev/tests (`MAIL_DISABLED=1` — C6), clé absente,
      // panne réseau : journalisé (code brut), jamais propagé.
      console.error("[contract] copie e-mail non envoyée", result.error);
      return;
    }

    await db
      .update(contractConsents)
      .set({ emailSentAt: new Date() })
      .where(eq(contractConsents.id, consentId));
  } catch (error) {
    // Best effort intégral : aucune exception ne remonte — le consentement
    // vient d'être écrit et reste valable, seul `emailSentAt` reste NULL.
    console.error("[contract] échec de la copie contractuelle", error);
  }
}

// ---------------------------------------------------------------------------
// acceptContract — enregistrement du consentement (page /espace/contrat).
// ---------------------------------------------------------------------------

/**
 * Enregistre l'acceptation de la version courante du contrat.
 *
 * @param input `{ accepted: boolean }` — Zod exige `accepted === true`.
 * @returns `{ ok: true }` (inscription faite **ou déjà faite** : idempotent),
 *   ou `{ ok: false, code }` (`invalid` / `forbidden` / `failed`).
 */
export async function acceptContract(
  input: { accepted: boolean },
): Promise<AcceptContractResult> {
  // 1. Validation d'entrée (Zod) — `accepted !== true` → `invalid`.
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  // 2. Acteur : session + compte actif + rôle sdr relu côté serveur.
  const actor = await activeSdrActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  // 3. IP lue côté serveur (jamais depuis le payload client).
  const ipAddress = await resolveCallerIp();

  // 4. Écriture idempotente (neon-http : pas de transaction, C3).
  const db = getDb();
  let rows: { id: string; acceptedAt: Date }[];
  try {
    rows = await db
      .insert(contractConsents)
      .values({
        userId: actor.id,
        contractVersion: CONTRACT_VERSION,
        ipAddress,
      })
      .onConflictDoNothing()
      .returning({ id: contractConsents.id, acceptedAt: contractConsents.acceptedAt });
  } catch (error) {
    console.error("[contract] échec de l'insertion du consentement", error);
    return { ok: false, code: "failed" };
  }

  // 0 ligne = conflit sur unique(userId, contractVersion) = déjà accepté →
  // succès idempotent, AUCUN second e-mail.
  if (rows.length === 0) return { ok: true };

  const consent = rows[0];
  if (consent === undefined) return { ok: true };

  // 5. Copie e-mail BEST EFFORT — jamais bloquante (voir l'en-tête) :
  //    un échec laisse `emailSentAt` à NULL, le consentement reste valable.
  await sendContractCopy(actor.id, consent.id, consent.acceptedAt);

  return { ok: true };
}

// ---------------------------------------------------------------------------
// getMyContractConsent — lecture de l'état (page /espace/contrat).
// ---------------------------------------------------------------------------

/**
 * État du consentement de l'utilisateur pour la version COURANTE.
 *
 * SÉCURITÉ : session `active` + rôle `sdr` requis (miroir de la garde de la
 * page). La version retournée est la constante serveur servie à l'affichage.
 *
 * @returns `{ ok: true, consent }` (`acceptedAt === null` = pas encore
 *   accepté), ou `{ ok: false, code }` (`forbidden` sans session/rôle,
 *   `failed` si la lecture DB échoue — journalisée, jamais détaillée en UI).
 */
export async function getMyContractConsent(): Promise<GetMyContractConsentResult> {
  const actor = await activeSdrActor();
  if (actor === null) return { ok: false, code: "forbidden" };

  try {
    const db = getDb();
    const rows = await db
      .select({
        acceptedAt: contractConsents.acceptedAt,
        emailSentAt: contractConsents.emailSentAt,
      })
      .from(contractConsents)
      .where(
        and(
          eq(contractConsents.userId, actor.id),
          eq(contractConsents.contractVersion, CONTRACT_VERSION),
        ),
      )
      .limit(1);

    const row = rows[0] ?? null;
    return {
      ok: true,
      consent: {
        version: CONTRACT_VERSION,
        acceptedAt: row === null ? null : row.acceptedAt.toISOString(),
        emailSent: row !== null && row.emailSentAt !== null,
      },
    };
  } catch (error) {
    console.error("[contract] échec de la lecture du consentement", error);
    return { ok: false, code: "failed" };
  }
}
