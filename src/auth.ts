/**
 * Atheris — configuration Auth.js v5 (T03 · PLAN.md §Sécurité).
 *
 * CHOIX TECHNIQUES (validés par le Lead, détails pour le Reviewer) :
 *
 * 1. SESSION JWT (strategy "jwt", 30 jours — H7) — credentials n'a pas de
 *    stockage adapter ; le jeton chiffré (AUTH_SECRET) embarque
 *    id/role/name/status.
 *
 * 2. DIFFÉRENCIATION DES ÉCHECS SANS FUITE — `authorize` ne renvoie jamais de
 *    message : soit `null` (→ code générique "credentials"), soit elle throw
 *    une sous-classe de `CredentialsSignin` portant un `code` explicite
 *    (`rate_limited` / `pending` / `rejected`). Auth.js place ce code dans le
 *    paramètre `code` de l'URL de redirection (`?error=CredentialsSignin&code=
 *    xxx`), que `login()` (src/actions/auth.ts) parse et mappe sur un
 *    discriminated union côté serveur → l'i18n (T09) ne verra que des codes.
 *
 * 3. pages.signIn = "/connexion" (RELATIF) — la connexion passe toujours par
 *    la Server Action `login()` avec `redirect: false` : cette page n'est
 *    jamais la cible d'une navigation automatique. La valeur sert uniquement
 *    de base aux URLs d'erreur générées par Auth.js (jamais naviguées, juste
 *    parsées) et, en filet de sécurité, de cible de repli si un flux futur
 *    redirigeait vers la page built-in. Le middleware de locale (T07) préfixe
 *    `/connexion` → `/fr/connexion`, d'où le choix d'un chemin relatif
 *    « pré-localisable » plutôt qu'une URL codée en dur.
 *
 * 4. RATE-LIMIT PAR EMAIL (5 échecs / 15 min) — table `login_attempts`,
 *    fenêtre glissante serveur, IP enregistrée à chaque échec pour l'audit.
 *    Le blocage n'est PAS déclenché par l'IP seule (verrouillage collatéral
 *    des clients partageant une IP derrière un NAT/CGNAT) — acceptable en v1
 *    (consigne du Lead), pourra évoluer vers un plafond par IP+email.
 *
 * 5. NORMALISATION EMAIL — trim + minuscules AVANT validation Zod ET avant la
 *    requête `eq(users.email, …)` : l'index unique `users_email_idx` est
 *    sensible à la casse (revue T02), la normalisation à l'écriture (T04) et
 *    à la lecture (ici) est la consigne.
 *
 * 6. ANTI-ÉNUMÉRATION — (a) email inconnu : `verifyPassword` tourne contre un
 *    hash leurre (constante ci-dessous) pour uniformiser le temps de réponse
 *    scrypt ; (b) un échec inconnu insère aussi une ligne `login_attempts`
 *    (comportement identique au mauvais mot de passe) ; (c) compte non actif
 *    avec BON mot de passe : aucun `login_attempt` inséré (ce n'est pas de la
 *    force brute) — `disabled` est renvoyé en échec générique "invalid"
 *    (seuls `pending`/`rejected` ont un message dédié, spec T03).
 */

import { and, count, eq, gte } from "drizzle-orm";
import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { loginAttempts, users } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";

// ---------------------------------------------------------------------------
// Constantes de sécurité.
// ---------------------------------------------------------------------------

/** Fenêtre du rate-limit de connexion. */
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
/** Seuil d'échecs consécutifs au-delà duquel la connexion est refusée. */
const RATE_LIMIT_MAX_ATTEMPTS = 5;
/**
 * Durée de vie du jeton de session — **30 jours** (identique JWT + session).
 *
 * H7 (arbitrée par le client, PLAN-REFONTE-PLATEFORME.md §3) : « rester
 * connecté » se définit par un `maxAge` global de 30 jours. C'est une
 * DÉFINITION PRODUIT, pas une garantie de sécurité : le JWT est stateless,
 * un cookie volé reste donc valable 30 jours (aucune checkbox « rester
 * connecté » — maxAge global, comme arbitré).
 */
const SESSION_MAX_AGE = 30 * 24 * 3600;

/**
 * Hash leurre au format `salt:hash` (scrypt N=16384 r=8 p=1 keylen=64) d'un
 * secret inconnu : exécuté quand l'email n'existe pas, pour que le temps de
 * réponse soit identique à celui d'un mauvais mot de passe (pas d'énumération
 * d'utilisateurs via le chronométrage de `authorize`).
 */
const DECOY_PASSWORD_HASH =
  "d52a048692e62cf9457f2b6e9d48e308:b98ae567e2379090f5dfe953a7ae7d7f3928cd" +
  "664807da1b3c4418a266f517ece402d37ebd0e10bf158bd627c657e81c11be3acc7958e9" +
  "e7297dd312d222a577";

// ---------------------------------------------------------------------------
// Erreurs différenciées — chaque `code` atterrit dans l'URL d'erreur Auth.js
// (`?error=CredentialsSignin&code=…`) et nulle part ailleurs.
// ---------------------------------------------------------------------------

/** 5 échecs dépassés sur la fenêtre glissante : temporisation forcée. */
class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

/** Compte existant mais candidature non encore validée par le CEO. */
class PendingAccountError extends CredentialsSignin {
  code = "pending";
}

/** Compte dont la candidature a été refusée. */
class RejectedAccountError extends CredentialsSignin {
  code = "rejected";
}

// ---------------------------------------------------------------------------
// Validation des credentials (Zod v4) — aucune donnée n'est utilisée avant.
// ---------------------------------------------------------------------------

const credentialsSchema = z.object({
  // `trim`/`toLowerCase` sont appliqués par Zod lui-même (normalisation
  // unique, déclarative) avant la validation de format.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
  ip: z.string().trim().min(1).optional(),
});

/** Type inféré des credentials validés (zéro `any`, zéro `!` non justifié). */
type Credentials = z.output<typeof credentialsSchema>;

/**
 * Extrait et valide les credentials bruts du formulaire. Attention : le body
 * URL-encoded transformerait un `ip: undefined` en string littérale
 * `"undefined"` (visitable) — `login()` n'inclut donc la clé `ip` que si une
 * IP réelle a été extraite des en-têtes (voir src/actions/auth.ts).
 */
function parseCredentials(raw: {
  email?: unknown;
  password?: unknown;
  ip?: unknown;
}): Credentials | null {
  const parsed = credentialsSchema.safeParse({
    email: raw.email,
    password: raw.password,
    ip: raw.ip,
  });
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// Opérations DB (uniquement appelées à l'exécution — jamais au build).
// ---------------------------------------------------------------------------

/** Compte les échecs de connexion d'un email sur la fenêtre glissante. */
async function countRecentFailures(email: string): Promise<number> {
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const db = getDb();
  const [row] = await db
    .select({ n: count() })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), gte(loginAttempts.createdAt, since)));
  return row?.n ?? 0;
}

/**
 * Journalise un échec de connexion (email normalisé + IP si connue).
 * Best-effort : un échec d'insertion ne doit pas masquer le vrai refus de
 * connexion, il est journalisé en console serveur puis ignoré.
 */
async function recordFailedAttempt(email: string, ip: string | undefined): Promise<void> {
  try {
    const db = getDb();
    await db.insert(loginAttempts).values({ email, ip });
  } catch (error) {
    console.error("[auth] Impossible de journaliser la tentative de connexion", error);
  }
}

// ---------------------------------------------------------------------------
// Configuration Auth.js.
// ---------------------------------------------------------------------------

const config = {
  // AUTH_SECRET est lu automatiquement dans l'environnement (.env.local).
  pages: {
    // Relatif et pré-localisable — voir CHOIX TECHNIQUES §3 en tête de fichier.
    signIn: "/connexion",
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  jwt: {
    maxAge: SESSION_MAX_AGE,
  },
  callbacks: {
    /** Injecte id/role/name/status dans le jeton dès la connexion. */
    jwt({ token, user }) {
      if (user) {
        // Premier appel (login) : `user` est le retour validé d'authorize.
        token.id = user.id;
        token.role = user.role;
        token.status = user.status;
        token.name = user.name;
      }
      // Appels suivants : le jeton décodé embarque déjà ces champs.
      return token;
    },
    /** Expose id/role/name/status sur `session.user` (Server Components). */
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.status = token.status;
      session.user.name = token.name ?? session.user.name;
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: { type: "email" },
        password: { type: "password" },
      },
      /**
       * Vérifie les identifiants et retourne l'utilisateur authentifié.
       * Aucune donnée n'est lue/écrite avant la validation Zod ; le hash
       * `password_hash` ne quitte jamais la DB.
       */
      async authorize(credentials) {
        // Cast maîtrisé d'une entrée non fiable (body URL-encoded) : les clés
        // sont immédiatement revalidées par Zod, `ip` compris.
        const raw = credentials as {
          email?: unknown;
          password?: unknown;
          ip?: unknown;
        };
        const input = parseCredentials(raw);
        if (!input) return null;

        // 1) Rate-limit AVANT toute vérification de mot de passe (§4 ci-dessus).
        const failures = await countRecentFailures(input.email);
        if (failures >= RATE_LIMIT_MAX_ATTEMPTS) {
          throw new RateLimitedError();
        }

        // 2) Recherche du compte (email normalisé — index unique sensible casse).
        const db = getDb();
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (!user) {
          // Email inconnu : scrypt sur leurre (temps de réponse identique),
          // puis journalisation comme un échec ordinaire.
          await verifyPassword(input.password, DECOY_PASSWORD_HASH);
          await recordFailedAttempt(input.email, input.ip);
          return null;
        }

        // 3) Vérification scrypt (timing-safe, jamais d'exception).
        const valid = await verifyPassword(input.password, user.passwordHash);
        if (!valid) {
          await recordFailedAttempt(input.email, input.ip);
          return null;
        }

        // 4) Statut du compte — BON mot de passe : aucun login_attempt inséré
        // (pas une tentative de force brute, voir note §Anti-énumération).
        if (user.status === "pending") throw new PendingAccountError();
        if (user.status === "rejected") throw new RejectedAccountError();
        if (user.status !== "active") {
          // `disabled` : échec générique, aucun détail (pas de message dédié
          // dans la spec T03).
          return null;
        }

        // 5) Succès — le hash n'est jamais exposé (retour typé `User`).
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
} satisfies Parameters<typeof NextAuth>[0];

// `handlers` alimente src/app/api/auth/[...nextauth]/route.ts ; `signIn`/
// `signOut` sont appelés par la Server Action login()/logout()
// (src/actions/auth.ts) avec `redirect: false` pour rester maître des
// redirections localisées.
const { handlers, auth: nextAuthSession, signIn, signOut } = NextAuth(config);

export { handlers, signIn, signOut };

// UUID canonique (forme basse/casse haute acceptée) — garde anti-jeton corrompu.
const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * `auth()` — session de l'espace connecté, **revalidée en base à chaque
 * résolution** (LE remplaçant de l'export `auth` de NextAuth : signature
 * identique `(): Promise<Session | null>`, aucun consommateur à adapter).
 *
 * ─── POURQUOI ──────────────────────────────────────────────────────────────
 * La session JWT survit à la suppression du compte : un ancien cookie d'un
 * compte **purgé** restait valide `maxAge` (30 jours, H7) — constaté en revue du
 * Lot 4 (session fantôme d'un compte supprimé). Le callback `session` de
 * cette version de NextAuth ne peut pas renvoyer `null` (typage), d'où ce
 * wrapper : le jeton n'est plus qu'une PREUVE d'identité, l'état affiché
 * (rôle, statut, nom) est relu en DB.
 *
 * ─── RÈGLES ────────────────────────────────────────────────────────────────
 * - id de jeton hors forme uuid → `null` (jeton corrompu, zéro requête) ;
 * - compte **absent** ou `status !== 'active'` → `null` (reconnexion forcée
 *   à la prochaine requête) ;
 * - rôle/statut/nom **resynchronisés** depuis la DB (autorité DB > claims
 *   anciens : ex. renommage `vendeur` → `sdr`, changement de rôle) ;
 * - **fail-open sur erreur d'infra** : la session est conservée et l'erreur
 *   journalisée — un incident DB ne déconnecte pas tout le monde, et aucun
 *   accès n'est ouvert au-delà de ce que le jeton prouvait déjà.
 *
 * ⚠ Le middleware Edge reste en lecture de claims (`getToken`, aucun DB) :
 * il continue de servir de filet grossier ; ce wrapper est le contrôle fin,
 * exécuté côté Node par chaque page/action (`await auth()`).
 *
 * Coût : une lecture PK `users` par résolution de session (index `users_pkey`).
 */
export async function auth(): Promise<Session | null> {
  const session = await nextAuthSession();
  if (session === null) return null;

  if (
    typeof session.user.id !== "string" ||
    !UUID_SHAPE.test(session.user.id)
  ) {
    return null;
  }

  try {
    const db = getDb();
    const rows = await db
      .select({ role: users.role, status: users.status, name: users.name })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    const row = rows[0];

    if (row === undefined || row.status !== "active") return null;

    session.user.role = row.role;
    session.user.status = row.status;
    session.user.name = row.name;
    return session;
  } catch (error) {
    console.error("[auth] revalidation de session impossible", error);
    return session;
  }
}
