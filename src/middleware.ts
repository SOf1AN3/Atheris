import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isValidLocale, locales, type Locale } from "@/i18n/config";
import {
  HOME_BY_ROLE,
  isEspacePath,
  isRole,
  isRouteAllowed,
  type Role,
} from "@/lib/permissions";

/**
 * Atheris — middleware edge : résolution de locale (T01) + garde JWT/RBAC (T07).
 *
 * EDGE-RUNTIME : seuls `next-auth/jwt` (décryptage JWE officiel), les modules
 * purs `@/lib/permissions` / `@/i18n/config` sont importés — aucun import DB,
 * aucun `@/auth` (Auth.js complet = poids mort côté edge). Les `import type`
 * (dont ceux de `permissions.ts` vers le schéma Drizzle) sont effacés à la
 * compilation : zéro runtime DB ici.
 *
 * ⚠ FORMAT DU JETON : Auth.js v5 **chiffre** ses JWT de session (JWE
 * A256CBC-HS512, clé dérivée HKDF avec `salt = nom du cookie`) — une simple
 * vérification de signature (JWS, `jose.jwtVerify`) échouerait systématiquement
 * et bloquerait tout utilisateur connecté. `getToken` de `next-auth/jwt` est
 * l'API de décodage officielle (edge-compatible) : elle déchiffre ET valide
 * l'expiration (`clockTolerance: 15 s`), et renvoie `null` sur tout échec.
 *
 * NOTE DEV (DB-PENDING) : `AUTH_SECRET` est un placeholder dans `.env.local`
 * tant que la DB n'existe pas → le déchiffrement échoue **systématiquement**,
 * ce qui est attendu : le comportement observable est « non connecté »
 * (redirection vers /connexion sur /espace). Le scénario « session valide →
 * redirection home » est invérifiable en dev sans DB — validé plus tard (T36).
 */

// ---------------------------------------------------------------------------
// Résolution de locale (T01 — logique existante, inchangée).
// ---------------------------------------------------------------------------

/**
 * Résout la locale préférée depuis le header `Accept-Language`.
 * - Premier type accepté dont la langue est `fr*` → `fr`
 * - Premier type accepté dont la langue est `en*` → `en`
 * - Sinon (header absent ou langue inconnue) → `defaultLocale`
 */
function resolveLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) {
    return defaultLocale;
  }

  for (const entry of acceptLanguage.split(",")) {
    const tag = entry.split(";")[0].trim().toLowerCase();
    const language = tag.split("-")[0];
    const match = locales.find((locale) => locale === language);
    if (match) {
      return match;
    }
  }

  return defaultLocale;
}

// ---------------------------------------------------------------------------
// Session JWT edge (T07) — vérification + revalidation des claims.
// ---------------------------------------------------------------------------

/**
 * Noms de cookie de session Auth.js v5 (selon le contexte de déploiement) :
 * - dev HTTP (localhost) : `authjs.session-token` ;
 * - prod HTTPS : `__Secure-authjs.session-token`.
 * Les deux sont essayés, dans cet ordre.
 */
const SESSION_COOKIE_CANDIDATES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
] as const;

/**
 * Claims utiles du payload JWT, typés `unknown` **volontairement** : le jeton
 * est chiffré/authentifié (donc intégre), mais son contenu n'est jamais fait foi
 * tel quel : `role` doit repasser le type guard `isRole()` et `status` doit
 * valoir explicitement `active` avant tout usage (jeton d'ancien schéma possible
 * après évolution du schéma DB : l'intégrité du jeton ne prouve pas la validité
 * des valeurs portées).
 */
interface SessionClaims {
  readonly role: unknown;
  readonly status: unknown;
}

/** Lit le cookie de session, quelle que soit sa variante de nom. */
function readSessionCookie(request: NextRequest): { name: string; value: string } | null {
  for (const name of SESSION_COOKIE_CANDIDATES) {
    const value = request.cookies.get(name)?.value;
    if (value) {
      return { name, value };
    }
  }
  return null;
}

/**
 * Déchiffre et valide le JWT de session (JWE Auth.js) puis en extrait les
 * claims bruts.
 *
 * @returns `null` (= non connecté) si : aucun cookie ; `AUTH_SECRET` absent
 *   (placeholder ou non renseigné) ; jeton corrompu, contrefait ou expiré
 *   (`getToken` renvoie `null` silencieusement — aucun détail fuité).
 */
async function readSessionClaims(request: NextRequest): Promise<SessionClaims | null> {
  const cookie = readSessionCookie(request);
  if (cookie === null) {
    return null;
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return null;
  }

  try {
    // `salt = cookie.name` : c'est la dérivation exacte utilisée par Auth.js à
    // l'encodage (options.cookies.sessionToken.name) — sans ce salt, le
    // déchiffrement HKDF échouerait même sur un jeton parfaitement valide.
    const payload = await getToken({
      req: request,
      secret,
      cookieName: cookie.name,
    });
    if (payload === null) {
      return null;
    }
    return { role: payload.role, status: payload.status };
  } catch {
    // Dernier filet (jamais atteint en principe) : tout échec = non connecté.
    return null;
  }
}

// ---------------------------------------------------------------------------
// Redirections (307 Temporary Redirect — la locale/détecté peut changer).
// ---------------------------------------------------------------------------

/**
 * 307 vers `/{locale}/connexion` avec `callbackUrl` = chemin **et query
 * string** d'origine. `encodeURIComponent` encode la query complète (`?a=1&b=2`)
 * dans la valeur du paramètre, pour qu'elle ne soit pas absorbée par l'URL de
 * redirection ni interprétable comme d'autres paramètres (open-redirect).
 */
function redirectToLogin(request: NextRequest, locale: Locale): NextResponse {
  const url = request.nextUrl.clone();
  const callbackUrl = `${url.pathname}${url.search}`;
  url.pathname = `/${locale}/connexion`;
  url.search = `?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  return NextResponse.redirect(url, 307);
}

/** 307 vers la home du rôle (`HOME_BY_ROLE`) — la query string est abandonnée. */
function redirectToRoleHome(request: NextRequest, locale: Locale, role: Role): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${HOME_BY_ROLE[role]}`;
  url.search = "";
  return NextResponse.redirect(url, 307);
}

// ---------------------------------------------------------------------------
// Middleware.
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  // --- Chemin NON localisé : redirection 307 vers `/{locale}…` (T01) --------
  if (!isValidLocale(firstSegment)) {
    const locale = resolveLocale(request.headers.get("accept-language"));

    // `clone()` préserve la query string (`search`) ; le type est inféré depuis
    // `request.nextUrl` (NextURL), zéro `any`.
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    url.search = search;

    // 307 Temporary Redirect (équivalent `permanent: false` : la locale détectée
    // peut changer selon le header Accept-Language du prochain appel).
    return NextResponse.redirect(url, 307);
  }

  // --- Chemin localisé : garde d'authentification + RBAC (T07) -------------
  const locale = firstSegment;
  // Session lue et vérifiée UNE seule fois ; chaque branche décide elle-même
  // de ce qu'elle fait d'un `null` (non connecté / non vérifiable).
  const claims = await readSessionClaims(request);

  // 1) `/…/espace/*` : réservé à un compte **actif**, puis filtré par la
  //    matrice RBAC (structure.md §4.2).
  if (isEspacePath(pathname)) {
    // Pas de cookie, ou JWT non vérifiable (secret placeholder/absent, jeton
    // corrompu ou expiré) → traité comme non connecté : redirection 307 vers
    // la page de connexion avec `callbackUrl` (query string préservée).
    if (claims === null) {
      return redirectToLogin(request, locale);
    }

    // SÉCURITÉ (double filet) : la signature prouve l'intégrité du jeton, pas
    // la validité de ses valeurs (ancien schéma, rôle obsolète). `role` est
    // donc revalidé par le type guard `isRole()` et `status` doit être
    // explicitement `"active"` (pending / rejected / disabled bloqués ici ;
    // le message dédié vient de `login()`, T09).
    const { role, status } = claims;
    if (!isRole(role) || status !== "active") {
      return redirectToLogin(request, locale);
    }

    // Rôle valide mais route interdite pour ce rôle → 307 vers la home du
    // rôle. On ne renvoie **jamais** 403 ici : la home évite de confirmer
    // l'existence de la route et garde une UX cohérente.
    if (!isRouteAllowed(pathname, role)) {
      return redirectToRoleHome(request, locale, role);
    }

    return NextResponse.next();
  }

  // 2) Pages d'authentification : un compte déjà connecté (JWT vérifié +
  //    rôle valide + statut actif) ne doit jamais revoir la page de connexion
  //    (boucle connecté-sur-login). Un jeton non vérifiable ou un compte non
  //    actif laisse la page s'afficher (le message dédié vient de `login()`).
  if (pathname === `/${locale}/connexion` || pathname === `/${locale}/inscription`) {
    if (claims !== null) {
      const { role, status } = claims;
      if (isRole(role) && status === "active") {
        return redirectToRoleHome(request, locale, role);
      }
    }
    return NextResponse.next();
  }

  // 3) Tout le reste (landing locale, pages publiques…) : passage libre.
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclut les assets statiques, l'icône et tout chemin pointant vers un fichier
    // avec extension (images, polices, fichiers, etc.).
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
