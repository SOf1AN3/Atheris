import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isValidLocale, locales, type Locale } from "@/i18n/config";

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

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";

  // Déjà localisé (`/fr...`, `/en...`) : on laisse passer la requête.
  if (firstSegment !== "" && isValidLocale(firstSegment)) {
    return NextResponse.next();
  }

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

export const config = {
  matcher: [
    // Exclut les assets statiques, l'icône et tout chemin pointant vers un fichier
    // avec extension (images, polices, fichiers, etc.).
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
