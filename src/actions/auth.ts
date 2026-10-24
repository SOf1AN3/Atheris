"use server";

/**
 * Atheris — Server Actions d'authentification (T03).
 *
 * CHOIX : signature `login(input: { email, password, ip? })` (objet typé) plutôt
 * que `login(formData: FormData)` :
 * - la validation Zod s'applique directement sur un objet typé, sans
 *   conversion `FormDataEntryValue | null` → string à chaque champ ;
 * - le contrat de retour est un **discriminated union** (`ok` + `code`)
 *   destiné à être lu côté client (`useActionState` / handler async en T08-T09)
 *   puis i18nalisé en T09 — impossible à typer proprement avec un FormData ;
 * - Auth.js v5 impose `signIn(..., { redirect: false })` pour rester maître
 *   des redirections localisées : la valeur retournée est alors l'URL de
 *   redirection, que l'on parse pour extraire le code d'échec.
 *
 * IP : la source prioritaire est l'en-tête `x-forwarded-for` (serveur,
 * non falsifiable côté client) ; `input.ip` n'est qu'un repli (dev local sans
 * proxy, tests). Le rate-limit est indexé sur l'email ; l'IP est une donnée
 * d'audit stockée dans `login_attempts`.
 *
 * codes d'échec (4) — identiques à ceux produits par `authorize()` via
 * `?error=CredentialsSignin&code=…` : invalid | rate_limited | pending |
 * rejected. Aucun message en clair ici → i18n en T09.
 */

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";

/** Codes d'échec de connexion, exposés au client (jamais de message). */
export type LoginFailureCode = "invalid" | "rate_limited" | "pending" | "rejected";

/** Contrat de `login` : union discriminé par `ok`. */
export type LoginResult =
  | { ok: false; code: LoginFailureCode }
  | { ok: true };

const loginInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(256),
  /** Repli d'IP si aucun proxy n'expose `x-forwarded-for` (dev/tests). */
  ip: z.string().trim().min(1).optional(),
});

/** Type public de l'entrée de `login` (dérivé du schéma Zod, zéro `any`). */
export type LoginInput = z.input<typeof loginInputSchema>;

/**
 * Résout l'IP cliente : en-tête serveur d'abord (fiable), repli fourni ensuite.
 */
async function resolveClientIp(fallback: string | undefined): Promise<string | undefined> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const first = forwarded?.split(",")[0]?.trim();
    if (first) return first;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real;
  } catch (error) {
    // headers() indisponible (hors requête) : on retombe sur le repli.
    console.warn("[auth] En-têtes indisponibles pour l'IP de connexion", error);
  }
  return fallback;
}

/**
 * Traduit l'URL retournée par `signIn(..., { redirect: false })` en résultat
 * typé.
 *
 * - Succès : URL de callback **sans** paramètre `error` (relatif ou absolu).
 * - Échec credentials : URL contenant `error=CredentialsSignin&code=<code>`,
 *   `code` étant celui déclaré par les classes d'erreur de `src/auth.ts`.
 * - Tout autre `error` (ex. `Configuration`) : défaut d'infrastructure →
 *   journalisé côté serveur, présenté comme `invalid` côté client (aucune
 *   fuite de détail interne).
 */
function mapSignInResult(result: unknown): LoginResult {
  if (typeof result !== "string") {
    console.error("[auth] Réponse de signIn inattendue", typeof result);
    return { ok: false, code: "invalid" };
  }

  let error: string | null;
  let code: string | null;
  try {
    const url = new URL(result, "http://placeholder.local");
    error = url.searchParams.get("error");
    code = url.searchParams.get("code");
  } catch (error_) {
    console.error("[auth] URL de redirection de signIn illisible", error_);
    return { ok: false, code: "invalid" };
  }

  if (error === null) return { ok: true };

  switch (code) {
    case "rate_limited":
      return { ok: false, code: "rate_limited" };
    case "pending":
      return { ok: false, code: "pending" };
    case "rejected":
      return { ok: false, code: "rejected" };
    default:
      // "credentials" (identifiants invalides) ou code inconnu/défaut serveur.
      if (error !== "CredentialsSignin") {
        console.error("[auth] Échec de connexion non lié aux credentials", error);
      }
      return { ok: false, code: "invalid" };
  }
}

/**
 * Connecte un utilisateur (credentials).
 *
 * @param input Email (normalisé par Zod : trim + minuscules), mot de passe et
 * IP optionnelle (repli — l'en-tête `x-forwarded-for` prime).
 * @returns `{ ok: true }` si la session est créée, sinon
 * `{ ok: false, code }` avec l'un des 4 codes d'échec. Les erreurs
 * d'infrastructure non liées à l'auth sont **rethrow** (→ 500) et
 * journalisées, jamais masquées derrière `invalid`.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const parsed = loginInputSchema.safeParse(input);
  if (!parsed.success) {
    // Entrée malformée (email invalide, mdp vide) = refus, pas d'aller plus
    // loin : aucun accès DB, aucun journal d'essai.
    return { ok: false, code: "invalid" };
  }

  const ip = await resolveClientIp(parsed.data.ip);

  try {
    // `redirect: false` : signIn retourne l'URL de redirection au lieu de
    // déclencher `redirect()` — on la parse pour extraire le code d'échec.
    const redirectTo: unknown = await signIn("credentials", {
      redirect: false,
      email: parsed.data.email,
      password: parsed.data.password,
      // Clé omise si pas d'IP : URLSearchParams sérialiserait `undefined`
      // en littérale "undefined" (voir commentaire dans src/auth.ts).
      ...(ip ? { ip } : {}),
    });
    return mapSignInResult(redirectTo);
  } catch (error) {
    if (error instanceof AuthError) {
      // signIn n'est censé renvoyer l'erreur que via l'URL (redirect:false) ;
      // filet de sécurité si le comportement du runtime change.
      console.error("[auth] AuthError pendant la connexion", error.type);
      return { ok: false, code: "invalid" };
    }
    // Erreur d'infrastructure (DB, réseau…) : journalisée puis propagée → 500.
    console.error("[auth] Erreur inattendue pendant la connexion", error);
    throw error;
  }
}

/**
 * Déconnecte l'utilisateur : invalide le cookie de session puis redirige
 * vers `/` — le middleware de locale (T07) préfixera la locale cible.
 * L'`NEXT_REDIRECT` levé par `signOut` est attendu (contrôle de flux normal
 * d'une Server Action).
 */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
