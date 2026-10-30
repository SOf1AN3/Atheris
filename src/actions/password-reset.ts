"use server";

/**
 * Atheris — Server Actions de réinitialisation de mot de passe (L10 · VAGUE 2,
 * Piston C). Auparavant, aucun flux n'existait (un simple texte « Contactez
 * votre administrateur ») : ce module instaure le flux complet
 * email → jeton → page → nouveau mot de passe, **sans aucune table ni
 * migration** (interdit absolu du plan : les lots L3→L11 n'ont aucun ajout de
 * schéma autorisé).
 *
 * ─── JETON : conception STATELESS (HMAC-SHA256, aucune écriture DB) ──────────
 * `token = base64url(JSON { email, exp }) + "." + base64url(HMAC(payload))`,
 * signé avec `process.env.AUTH_SECRET` (même secret que les JWT Auth.js — un
 * secret unique côté serveur, jamais dans le code). Expiration 30 minutes.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║ LIMITES CONNUES ET ASSUMÉES (ne JAMAIS présenter ce jeton comme une      ║
 * ║ protection parfaite) :                                                   ║
 * ║ • un jeton stateless n'est **pas révocable** : aucune ligne en base ne  ║
 * ║   permet de l'invalider sur demande ; la seule répulsion est la COURTE  ║
 * ║   durée de vie (30 min) ;                                                ║
 * ║ • après une réinitialisation réussie, l'ancien jeton reste techniquement ║
 * ║   valide jusqu'à son expiration (risque accepté et documenté, mitigé par ║
 * ║   HTTPS + secret fort) ;                                                ║
 * ║ • le payload est **signé, pas chiffré** : l'adresse email est lisible par ║
 * ║   quiconque reçoit le lien (acceptable : c'est la boîte mail du          ║
 * ║   destinataire lui-même).                                                ║
 * ║ Le stockage DB d'un jeton aléatoire (révocable à l'usage) serait plus    ║
 * ║ sûr mais exigerait une migration — explicitement interdit par le plan.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ─── ANTI-ÉNUMÉRATION (C4) ──────────────────────────────────────────────────
 * `requestPasswordReset` répond **toujours** `{ ok: true }` : compte inconnu,
 * compte non `active`, e-mail refusé, secret manquant → réponse identique,
 * détails uniquement en journal serveur. Aucune voie d'ouverture d'un compte
 * inconnu (statique ou chronométrique exploitable au-delà du bruit réseau).
 *
 * ─── SESSIONS : LIMITE JWT DOCUMENTÉE ───────────────────────────────────────
 * Le changement de `users.password_hash` **n'invalide PAS les JWT déjà émis**
 * (stratégie JWT stateless, `maxAge` 30 j — H7). `schema.ts` n'expose aucun
 * champ type `passwordChangedAt` (vérifié en lecture seule) : sans colonne de
 * référence, `authorize()` ne peut pas trancher sur l'ancienneté du jeton.
 * On ne rien invente : la limite est assumée, atténuée par le wrapper
 * `auth()` (revalidation du compte en DB à chaque résolution : un compte
 * supprimé/désactivé perd l'accès immédiatement, seul le CHANGEMENT de mot
 * de passe ne révoque pas les sessions existantes). Une colonne
 * `password_changed_at` + un contrôle dans `authorize` est le correctif
 * naturel, hors périmètre sans arbitrage client (migration interdite).
 *
 * CONTRAINTES RSC (C1) : directive en première ligne, uniquement des exports
 * async, aucune constante exportée — `use-server.test.ts` le vérifie.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { defaultLocale, isValidLocale, type Locale } from "@/i18n/config";
import { getPlatformDictionary } from "@/i18n/platform-dictionaries";
import { getDb } from "@/lib/db";
import { loginAttempts, users } from "@/lib/db/schema";
import { sendMail } from "@/lib/mail";
import { hashPassword } from "@/lib/password";
// Motif d'absolutisation déjà en production (liens d'invitation) — aucun
// domaine en dur dupliqué ici, seule source = `SITE_URL` + repli documenté.
import { absoluteInterviewUrl } from "@/lib/recruitment-templates";

// ---------------------------------------------------------------------------
// Constantes (jamais exportées — contrainte RSC).
// ---------------------------------------------------------------------------

/** Durée de vie du jeton de réinitialisation (30 minutes). */
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * Format du jeton : `payload-base64url.signature-base64url`. La signature
 * HMAC-SHA256 en base64url fait exactement 43 caractères ; le payload (JSON
 * court `{"email":…,"exp":…}`) est borné pour rejeter tout junk long avant
 * toute décodification.
 */
const RESET_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,512}\.[A-Za-z0-9_-]{43}$/;

/** Fenêtre du rate-limit de connexion (motif existant de `src/auth.ts`). */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Seuil au-delà duquel AUCUN e-mail de réinitialisation n'est envoyé. */
const RATE_LIMIT_MAX_ATTEMPTS = 5;

// ---------------------------------------------------------------------------
// Validation des entrées (Zod v4).
// ---------------------------------------------------------------------------

const requestResetSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  /**
   * Locale de l'e-mail et du lien, fournie par la page publique. Repli sur la
   * locale par défaut si absente/invalide : une locale fautive ne doit pas
   * faire échouer la demande (réponse toujours générique, cf. anti-enum).
   */
  locale: z.string().optional(),
});

/** Type public de l'entrée de `requestPasswordReset`. */
export type RequestPasswordResetInput = z.input<typeof requestResetSchema>;

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(1024),
  // Mêmes planchers que la connexion/activation du compte : 8..256 (T03/T26).
  password: z.string().min(8).max(256),
});

/** Type public de l'entrée de `resetPassword`. */
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

/** Contrat de `resetPassword` — codes bruts, i18n côté client (C2). */
export type ResetPasswordResult =
  | { ok: true }
  | {
      ok: false;
      /** Jeton absent/malformé/comptait expiré/signature invalide/compte
       *  absent ou non `active` — un SEUL code, aucun détail (C4). */
      code: "invalid";
      /** Secret serveur absent : problème de configuration, pas l'utilisateur. */
    }
  | { ok: false; code: "config" };

// ---------------------------------------------------------------------------
// Jeton stateless (signé HMAC-SHA256, jamais stocké).
// ---------------------------------------------------------------------------

/** Payload validé d'un jeton de réinitialisation. */
type ResetTokenPayload = {
  email: string;
  /** Expiration absolue en millisecondes epoch. */
  exp: number;
};

/** Charge utile décodée — même schéma que l'émission, revalidée à la lecture. */
const resetTokenPayloadSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  exp: z.number().int(),
});

/**
 * Lit le secret partagé. `AUTH_SECRET` est le même secret que celui d'Auth.js
 * (JWT de session) : un secret unique côté serveur, lu dans l'env uniquement.
 */
function readAuthSecret(): string | null {
  const secret = process.env.AUTH_SECRET;
  if (typeof secret !== "string" || secret.trim().length === 0) {
    console.error(
      "[password-reset] AUTH_SECRET absent ou vide — flux de réinitialisation inopérant",
    );
    return null;
  }
  return secret;
}

/** Émet un jeton signé pour l'email normalisé, valable `RESET_TOKEN_TTL_MS`. */
function createResetToken(email: string, secret: string): string {
  const exp = Date.now() + RESET_TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ email, exp }), "utf8").toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Valide un jeton reçu. **Toute anomalie renvoie `null`** — format (regex
 * stricte), signature comparée en temps constant (`timingSafeEqual`), charge
 * utile revalidée par Zod, `exp > now`. Aucun détail n'est distingué côté
 * appelant (un seul code `invalid`, C4).
 */
function verifyResetToken(token: string, secret: string): ResetTokenPayload | null {
  if (!RESET_TOKEN_PATTERN.test(token)) return null;

  const separatorIndex = token.indexOf(".");
  const payloadPart = token.slice(0, separatorIndex);
  const signaturePart = token.slice(separatorIndex + 1);

  // Signature : comparaison sur les OCTETS décodés, en temps constant.
  // `timingSafeEqual` exige des longueurs égales : la regex garantit déjà une
  // signature de 43 caractères base64url (32 octets), on garde le contrôle.
  const expected = createHmac("sha256", secret).update(payloadPart).digest();
  const provided = Buffer.from(signaturePart, "base64url");
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  // Charge utile : décodage + revalidation intégrale (ne jamais truster un
  // JSON décodé, même signé — défense en profondeur).
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = resetTokenPayloadSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (parsed.data.exp <= Date.now()) return null;
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Rate-limit doux (motif existant : table `login_attempts`, sans migration).
// ---------------------------------------------------------------------------

/**
 * Compte les lignes récentes de `login_attempts` pour l'email (même fenêtre
 * et même seuil que le rate-limit de connexion de `src/auth.ts`).
 *
 * NOTE HONNÊTE — pas de rate-limit dédié aux demandes de réinitialisation :
 * le plan interdit toute table nouvelle, et insérer dans `login_attempts`
 * (seul motif existant) **falsifierait le journal d'audit des échecs de
 * connexion** et créerait un vecteur de verrouillage DoS du login par
 * demandes répétées. On réutilise donc la table en LECTURE : un compte
 * déjà sous blocage connexion (≥ 5 échecs / 15 min) ne reçoit plus d'e-mail
 * de réinitialisation (réponse reste `{ ok: true }`). Une table dédiée
 * `password_reset_requests` serait le vrai correctif — hors périmètre sans
 * arbitrage client.
 */
async function isUnderLoginLockout(email: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), gte(loginAttempts.createdAt, since)));
  return (row?.n ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS;
}

// ---------------------------------------------------------------------------
// Actions.
// ---------------------------------------------------------------------------

/**
 * Demande de réinitialisation — **réponse TOUJOURS `{ ok: true }`** (anti-
 * énumération) : inconnu, non `active`, sous blocage, e-mail refusé, erreur
 * d'infra → même réponse côté client, détails en journal serveur uniquement.
 *
 * Si le compte existe et est `active` : e-mail contenant le lien signé
 * `/{locale}/reinitialisation?token=…` (valable 30 min), envoyé via
 * `sendMail` (`MAIL_DISABLED=1` respecté — refus silencieux avant appel
 * réseau, aucun envoi depuis les tests, C6).
 */
export async function requestPasswordReset(
  input: RequestPasswordResetInput,
): Promise<{ ok: true }> {
  const parsed = requestResetSchema.safeParse(input);
  if (!parsed.success) {
    // Email malformé : aucune requête, réponse générique (le formulaire
    // client valide déjà le format avant l'appel).
    return { ok: true };
  }

  const { email } = parsed.data;
  const rawLocale = parsed.data.locale;
  const locale: Locale =
    rawLocale !== undefined && isValidLocale(rawLocale) ? rawLocale : defaultLocale;

  try {
    const secret = readAuthSecret();
    if (secret === null) return { ok: true };

    // Rate-limit doux en lecture (voir note `isUnderLoginLockout`).
    if (await isUnderLoginLockout(email)) {
      console.warn(
        "[password-reset] demande refusée : compte sous blocage de connexion",
      );
      return { ok: true };
    }

    const db = getDb();
    const [user] = await db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    // Compte inconnu OU non `active` : même sortie silencieuse (C4) — aucun
    // e-mail, aucune trace côté client.
    if (user === undefined || user.status !== "active") return { ok: true };

    const token = createResetToken(email, secret);
    const lien = absoluteInterviewUrl(`/${locale}/reinitialisation?token=${token}`);

    // Envoi NON FATAL — jamais de fuite : un échec (clé absente, MAIL_DISABLED,
    // refus Resend) est journalisé puis la réponse reste `{ ok: true }`.
    try {
      const dict = await getPlatformDictionary(locale);
      const subject = dict.auth.passwordReset.email.subject;
      const text = dict.auth.passwordReset.email.body.replaceAll("{{link}}", lien);
      const mail = await sendMail({ to: email, subject, text });
      if (!mail.ok) {
        console.error(
          "[password-reset] e-mail de réinitialisation non envoyé",
          mail.error,
        );
      }
    } catch (error) {
      console.error("[password-reset] envoi d'e-mail interrompu", error);
    }

    return { ok: true };
  } catch (error) {
    // Erreur d'infra (DB…) : journalisée, jamais propagée — la réponse reste
    // générique pour ne révéler rien sur l'état du compte ni du serveur.
    console.error("[password-reset] demande de réinitialisation en échec", error);
    return { ok: true };
  }
}

/**
 * Réinitialisation effective : valide le jeton, charge le compte **par email
 * normalisé** (ligne absente OU compte non `active` → `invalid`, même code),
 * puis écrit le nouveau hash scrypt dans `users.password_hash`.
 *
 * ⚠ Limite JWT assumée (cf. en-tête) : les sessions déjà émises restent
 * valides — `schema.ts` n'expose pas de `passwordChangedAt`, rien est inventé.
 *
 * @returns `{ ok: true }` ou `{ ok: false, code }` (`invalid` = jeton ou
 *   compte ; `config` = `AUTH_SECRET` absent, problème serveur qui n'accuse
 *   jamais l'utilisateur).
 */
export async function resetPassword(
  input: ResetPasswordInput,
): Promise<ResetPasswordResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid" };

  const secret = readAuthSecret();
  if (secret === null) return { ok: false, code: "config" };

  const payload = verifyResetToken(parsed.data.token, secret);
  // Signature invalide, format corrompu ou expiration dépassée → même code.
  if (payload === null) return { ok: false, code: "invalid" };

  const db = getDb();
  const [user] = await db
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);

  if (user === undefined || user.status !== "active") {
    return { ok: false, code: "invalid" };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  // UPDATE conditionnel + `.returning()` (motif C3 — neon-http sans
  // transaction) : 0 ligne = le compte a disparu entre la lecture et
  // l'écriture → même refus générique.
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id))
    .returning({ id: users.id });
  if (updated.length === 0) {
    console.warn("[password-reset] UPDATE sans ligne (compte disparu ?)");
    return { ok: false, code: "invalid" };
  }

  return { ok: true };
}
