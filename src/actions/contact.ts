"use server";

/**
 * Atheris — Server Action « formulaire de contact de la landing »
 * (BK-8 · T34 · PLAN §Questions #1 validé).
 *
 * CONTRAT PUBLIC (codes BRUTS, jamais de message) :
 *   `submitContact(input) → { ok: true }`
 *     | { ok: false; code: "duplicate" | "rate_limited" | "invalid" }`
 * L'i18n est fait côté client avec le dict landing FIGÉ
 * (`contact.form.errors.*`) ; le serveur ne renvoie ni message, ni
 * coordonnée d'un prospect existant (non-fuite).
 *
 * CHAQUE message crée un prospect `source = "landing"` dans le pipeline CEO
 * **sans bénéficiaire** : `sourceUserId = NULL` (file orphelins côté UI),
 * `status = "nouveau"`. Les canaux internes (`ldg`/`rayan`/`ceo`) restent
 * l'affaire de `src/actions/prospects.ts` (figé) — voir `deriveSource` là-bas.
 *
 * POURQUOI NE PAS PASSER PAR `createProspect` (décision Lead) :
 * - `phone` y est **requis** (≥ 8 chiffres après normalisation) alors que le
 *   formulaire de contact ne collecte AUCUN téléphone ;
 * - le visiteur est **anonyme** : il n'y a pas de `viewer { id, role }` à
 *   fournir, et le `sourceUserId` doit rester `NULL`.
 * On réutilise donc les modules purs FIGÉS `dedupKey` (+ `normalizeEmail` /
 * `normalizePhone` qu'il compose) de `@/lib/prospect-dedup` + Drizzle en
 * direct, avec la même doctrine de sécurité que `createProspect`.
 *
 * VALIDATION : le schéma Zod FIGÉ du formulaire
 * (`createContactSchema`, `src/lib/form-schema.ts`) est réutilisé **tel quel**
 * — structure d'acceptation strictement identique côté client et serveur
 * (aucune divergence possible). Les 7 messages i18n imposés par son type ne
 * sont QUE du remplissage de signature : ils ne sont jamais lus ni renvoyés
 * (contrat = codes bruts).
 *
 * TÉLÉPHONE — SENTINELLES DOCUMENTÉES (colonnes `NOT NULL` T02 + index
 * `prospects_phone_norm_idx` UNIQUE) :
 * - `phone` brut = `"n/a"` : le formulaire ne possède pas de champ téléphone
 *   (colonnes non null → une valeur littérale obligatoire, jamais `NULL`) ;
 * - `phone_norm` = `"landing-" + emailNorm` : sentinelle **unique par email**.
 *   `normalizePhone("n/a")` → `""` ne convient pas (deux leads sans
 *   téléphone entreraient en collision sur la valeur vide, index UNIQUE) et
 *   toute forme normalisée par `normalizePhone` est exclusivement chiffrée →
 *   la sentinelle ne peut jamais coller un vrai numéro. Le dédoublonnage
 *   `email_norm` garde le rôle métier : 1er message accepté, 2ᵉ du même
 *   email refusé (comportement voulu « un prospect par email »).
 *
 * RATE-LIMIT — 1 envoi / 60 s / IP (Map module-scope) + 2ᵉ filet :
 *  - limite n°1 (BEST EFFORT) : mémoire du process serveur, perdue à froid
 *    en serverless et contournable par une IP neuve → elle amortit les
 *    bots, elle ne les arrête pas ;
 *  - limite n°2 (le filet réel) : dédoublonnage `email_norm` + index UNIQUE —
 *    un seul prospect par email, quel que soit le nombre d'IP.
 *  (PLAN §BK-8 évoquait « 3/h/IP » : décision Lead retenue = 1/60 s.)
 *
 * HONEYPOT `company_website` rempli → **faux succès** `{ ok: true }` sans
 * aucune écriture (ni prospect, ni audit, ni compteur de rate-limit).
 *
 * AUDIT non fatal : `activities.contact.received` (`entityType: "prospect"`,
 * `entityId` = prospect créé, `actorId: NULL` = visiteur anonyme,
 * meta = `{ emailNorm, note }` — le message de la demande est la raison
 * d'être de l'écriture ; `prospects` n'a pas de colonne `note`, le schéma
 * étant figé, il est conservé dans le jsonb d'audit, borné à 2000 car.).
 *
 * DB-PENDING : `getDb()` n'est appelé qu'à l'intérieur de la fonction
 * (lazy) → `next build` ne lit jamais `DATABASE_URL`.
 */

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { createContactSchema } from "@/lib/form-schema";
import type { ContactFormValues } from "@/lib/form-schema";
import { getDb } from "@/lib/db";
import { activities, prospects } from "@/lib/db/schema";
import { dedupKey } from "@/lib/prospect-dedup";
import type { ContactFormStrings } from "@/content/types";

// ---------------------------------------------------------------------------
// Types publics (contrat) — uniquement des `export type` : effacés à la
// compilation, seules les fonctions async subsistent à l'exécution
// (exigence d'un fichier `"use server"`).
// ---------------------------------------------------------------------------

/** Entrée de `submitContact` : valeurs validées du formulaire (figé). */
export type SubmitContactInput = ContactFormValues;

/** Codes d'échec exposés au client (aucun message, i18n = dict landing). */
export type SubmitContactFailureCode = "duplicate" | "rate_limited" | "invalid";

/** Contrat de `submitContact` : union discriminée par `ok`. */
export type SubmitContactResult =
  | { ok: true }
  | { ok: false; code: SubmitContactFailureCode };

// ---------------------------------------------------------------------------
// Schémas Zod (v4) — validation systématique AVANT tout traitement.
// ---------------------------------------------------------------------------

/**
 * Messages du schéma figé côté serveur : **jamais lus** (le contrat ne
 * renvoie que des codes) — ils servent uniquement à satisfaire le type
 * `ContactFormStrings["errors"]` exigé par `createContactSchema`.
 */
const SERVER_FORM_ERRORS: ContactFormStrings["errors"] = {
  nameRequired: "invalid",
  nameMin: "invalid",
  emailRequired: "invalid",
  emailInvalid: "invalid",
  typeRequired: "invalid",
  messageRequired: "invalid",
  messageMin: "invalid",
};

/** Schéma du formulaire de contact, réutilisé TEL QUEL depuis le figé. */
const submitContactSchema = createContactSchema(SERVER_FORM_ERRORS);

/**
 * Enveloppe minimaliste du honeypot : lue **avant** la validation métier pour
 * que tout payload portant `company_website` (même malformé par ailleurs)
 * reçoive le faux succès — aucun signal de validation n'est renvoyé au bot.
 * Enveloppe sans `max` : une valeur gigantesque reste ignorée (non stockée).
 */
const honeypotEnvelopeSchema = z.object({ company_website: z.string().optional() });

// ---------------------------------------------------------------------------
// Bornes applicatives (le schéma figé ne porte aucun `max` sur `name`,
// `email` ni `message` — cf. commentaire dans `form-schema.ts`).
// ---------------------------------------------------------------------------

/** `full_name` : aligné sur `createProspect` (≥ 2 caractères côté schéma). */
const NAME_MAX = 120;
/** Email au-delà du RFC 5321 (254) : payload, pas un vrai correspondant. */
const EMAIL_MAX = 320;
/** Message : la `note` persistée est tronquée à 2000 car. (voir plus bas). */
const MESSAGE_MAX = 5000;

/** Valeur `phone` littérale quand le formulaire n'en collecte aucun (T02). */
const PHONE_ABSENT = "n/a";
/** Préfixe de la sentinelle `phone_norm` d'un lead de la landing. */
const PHONE_NORM_PREFIX = "landing-";

/** `note` agrégée (type de projet + message) : borne jsonb d'audit. */
const NOTE_MAX = 2000;

/** Rate-limit : 1 envoi accepté par IP et par fenêtre de 60 s. */
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_SENDS = 1;
/** Entretien de la Map : purge au-delà de cette taille, purge totale… */
const RATE_MAP_PRUNE_SIZE = 1000;
const RATE_MAP_CLEAR_SIZE = 10_000;

// ---------------------------------------------------------------------------
// Rate-limit (Map module-scope — BEST EFFORT, voir en-tête).
// ---------------------------------------------------------------------------

/** ip → horodatages (ms) des envois acceptés encore dans la fenêtre. */
const rateSends = new Map<string, number[]>();

/**
 * `true` si l'IP a déjà atteint la jauge dans la fenêtre glissante.
 * Les entrées expirées de cette IP sont purgées au passage.
 */
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

/** Consigne un envoi accepté + entretien borné de la Map (fuite contrôlée). */
function recordRateSend(ip: string, now: number): void {
  if (rateSends.size > RATE_MAP_PRUNE_SIZE) {
    for (const [key, hits] of rateSends) {
      if (hits.every((timestamp) => now - timestamp >= RATE_WINDOW_MS)) {
        rateSends.delete(key);
      }
    }
    // Dernier recours : au-delà du plafond, la jauge repart à zéro (limite
    // documentée « au mieux » — le dédoublonnage email reste le filet).
    if (rateSends.size > RATE_MAP_CLEAR_SIZE) rateSends.clear();
  }

  rateSends.set(ip, [...(rateSends.get(ip) ?? []), now]);
}

/**
 * IP visiteur : en-tête serveur d'abord (non falsifiable côté client),
 * repli `"unknown"` (dev sans proxy / hors requête). Miroir du pattern de
 * `src/actions/auth.ts` (fonction locale : rien n'est exporté d'un `"use
 * server"` hors des async publiques).
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
// Aides pures.
// ---------------------------------------------------------------------------

/**
 * Troncature par unités de code UTF-16 **sans couper une paire de
 * substitution** : un demi-emoji dans le jsonb `meta` produirait une chaîne
 * invalide à l'insertion Postgres.
 */
function truncateCodeUnits(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? cut.slice(0, -1) : cut;
}

/**
 * `note` agrégée — format documenté : `« Type: <valeur enum> / Message: <texte> »`
 * borné à 2000 caractères (la locale fournit les libellés, le serveur ne
 * connaît que les `value` snake_case du schéma figé).
 */
function buildNote(type: ContactFormValues["type"], message: string): string {
  const prefix = `Type: ${type} / Message: `;
  const budget = Math.max(0, NOTE_MAX - prefix.length);
  return `${prefix}${truncateCodeUnits(message, budget)}`;
}

/**
 * Détecte une violation d'index UNIQUE PostgreSQL (`23505`) sur le chemin
 * d'une erreur éventuellement enveloppée par le driver/Drizzle : on remonte
 * la chaîne `cause` (5 niveaux max). Miroir du helper **non exporté** de
 * `src/actions/prospects.ts` (fichier figé → duplication assumée).
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

// ---------------------------------------------------------------------------
// submitContact — soumission publique du formulaire de la landing.
// ---------------------------------------------------------------------------

/**
 * Enregistre la demande de contact de la landing comme prospect orphelin.
 *
 * @param input Valeurs du formulaire (`ContactFormValues`, schéma figé).
 * @returns `{ ok: true }` (prospect créé **ou** faux succès honeypot) ;
 *   sinon `invalid` (entrée malformée / bornes dépassées), `rate_limited`
 *   (déjà 1 envoi accepté pour cette IP dans les 60 s), `duplicate` (email
 *   déjà présent en base — **jamais** le moindre détail du prospect).
 * @throws Erreur d'infra non liée au doublon (DB indisponible…) — journalisée
 *   puis propagée → 500, jamais masquée derrière un code métier.
 */
export async function submitContact(
  input: SubmitContactInput,
): Promise<SubmitContactResult> {
  // 1. Honeypot — AVANT toute autre validation : robot → faux succès,
  //    aucune écriture DB, aucun compteur de rate-limit consommé.
  const envelope = honeypotEnvelopeSchema.safeParse(input);
  if (envelope.success) {
    const honeypot = envelope.data.company_website;
    if (honeypot !== undefined && honeypot.trim().length > 0) {
      return { ok: true };
    }
  }

  // 2. Validation Zod avec le schéma FIGÉ (structure seule, réutilisation
  //    telle quelle) — avant tout accès DB.
  const parsed = submitContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const { name, email, type, message } = parsed.data;

  // 3. Bornes anti-payload (le schéma figé n'en porte pas) — aucun détail.
  if (
    name.length > NAME_MAX ||
    email.length > EMAIL_MAX ||
    message.length > MESSAGE_MAX
  ) {
    return { ok: false, code: "invalid" };
  }

  // 4. Rate-limit 1 envoi / 60 s / IP (best effort — la Map est mémoire de
  //    process). L'IP vient des en-têtes serveur, jamais du client.
  const now = Date.now();
  const ip = await resolveVisitorIp();
  if (isRateLimited(ip, now)) return { ok: false, code: "rate_limited" };
  recordRateSend(ip, now);

  // 5. Clés d'anti-doublon + note agrégée (documentées en tête de fichier).
  const { emailNorm } = dedupKey({ email, phone: PHONE_ABSENT });
  const phoneNorm = `${PHONE_NORM_PREFIX}${emailNorm}`;
  const note = buildNote(type, message);

  const db = getDb();

  try {
    // FILET 1 — SELECT préalable sur la forme normalisée de l'email :
    // refus avant toute insertion si ce prospect existe déjà (quelle que soit
    // sa source). Paramètre lié, jamais de concaténation SQL.
    const existing = await db
      .select({ id: prospects.id })
      .from(prospects)
      .where(eq(prospects.emailNorm, emailNorm))
      .limit(1);

    if (existing.length > 0) {
      // Aucune donnée du prospect existant dans le retour ni dans le journal.
      console.warn("[contact] soumission refusée : doublon email (détails non journalisés)");
      return { ok: false, code: "duplicate" };
    }

    let prospectId: string;
    try {
      const inserted = await db
        .insert(prospects)
        .values({
          fullName: name,
          company: null,
          email,
          phone: PHONE_ABSENT,
          emailNorm,
          phoneNorm,
          source: "landing",
          sourceUserId: null,
          status: "nouveau",
        })
        .returning({ id: prospects.id });

      const returnedId = inserted[0]?.id;
      if (returnedId === undefined) {
        throw new Error("submitContact : insertion sans ligne retournée");
      }
      prospectId = returnedId;
    } catch (error) {
      // FILET 2 — course entre le SELECT et l'INSERT : l'index UNIQUE
      // `prospects_email_norm_idx` / `prospects_phone_norm_idx` lève `23505`
      // → même code, mêmes garanties de non-fuite.
      if (isUniqueViolation(error)) {
        console.warn("[contact] soumission refusée : doublon détecté par l'index unique");
        return { ok: false, code: "duplicate" };
      }
      throw error;
    }

    // 6. Audit — requête séparée et NON FATALE : le prospect est déjà créé,
    //    remonter une erreur ferait retenter le client sur un doublon.
    //    `actorId: NULL` = visiteur anonyme (jamais d'uuid forgé).
    try {
      await db.insert(activities).values({
        actorId: null,
        action: "contact.received",
        entityType: "prospect",
        entityId: prospectId,
        meta: { emailNorm, note },
      });
    } catch (error) {
      console.error("[contact] activité `contact.received` non journalisée (prospect créé)", error);
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB, réseau…) : journalisée puis propagée → 500,
    // jamais transformée en code métier (pas de fuite de détail interne).
    console.error("[contact] échec de soumission du formulaire contact", error);
    throw error;
  }
}
