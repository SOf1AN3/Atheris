"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type LocaleSwitcherProps = {
  /** `a11y.switchLocale` fourni par l'appelant — aucun texte en dur ici. */
  label: string;
  className?: string;
};

/** Codes de locale (pas de traduction : FR/EN sont des identifiants). */
const LOCALES = ["fr", "en"] as const;

type Locale = (typeof LOCALES)[number];

/**
 * DESIGN: chemin sans locale valide (racine, route inconnue…) → la bascule
 * ne sert que quand la locale est détectable ; sinon elle cible `/fr`.
 * Aucune string de libellé n'est produite ici, uniquement des codes.
 */
const FALLBACK_PATHNAME = "/fr";
/** Courbe UNIQUE du site (DESIGN §3.1) — aucune autre easing. */
const EASE_CURVE = "ease-[cubic-bezier(0.16,1,0.3,1)]";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]";

function isLocale(value: string): value is Locale {
  return value === "fr" || value === "en";
}

/**
 * Bascule de locale FR ↔ EN (segment 1 du pathname), en conservant le reste
 * du chemin ainsi que l'ancre (`hash`) de la page courante.
 *
 * Option A (DESIGN §1.6) : la locale n'est plus une « pill » hors-système
 * (H1) mais DEUX liens mono 11px caps séparés par un `/` `line-3`.
 * L'actif = `text-fg` + filet volt 1px sous le texte — pas de fond, pas de
 * bordure, pas de rayon. Cible ≥ 44px, focus volt conservé.
 */
export function LocaleSwitcher({
  label,
  className,
}: LocaleSwitcherProps): ReactNode {
  const pathname = usePathname();
  // Hash lu après montage (état) : évite tout mismatch d'hydratation,
  // la valeur serveur étant toujours "".
  const [hash, setHash] = useState<string>("");

  useEffect(() => {
    const syncHash = (): void => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);

  const segments = pathname.split("/");
  const firstSegment = segments[1] ?? "";
  const currentLocale: Locale | null = isLocale(firstSegment)
    ? firstSegment
    : null;
  /** Reste du chemin après la locale, ex. `contact` dans `/fr/contact`. */
  const tail = segments.slice(2).join("/");

  const hrefFor = (locale: Locale): string => {
    if (currentLocale === null) {
      // Locale inconnue : on pointe la racine de la locale demandée
      // (la FR vaut `/fr`, conforme au repli attendu).
      const basePath = locale === "fr" ? FALLBACK_PATHNAME : "/en";
      return `${basePath}${hash}`;
    }
    if (locale === currentLocale) {
      return `${pathname}${hash}`;
    }
    // Locale cible : on remplace le 1er segment, on conserve la suite.
    const basePath = `/${locale}${tail === "" ? "" : `/${tail}`}`;
    return `${basePath}${hash}`;
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex shrink-0 items-center", className)}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === currentLocale;

        return (
          <Fragment key={locale}>
            {locale === LOCALES[0] ? null : (
              <span aria-hidden="true" className="px-1 micro text-line-3">
                /
              </span>
            )}
            <Link
              href={hrefFor(locale)}
              hrefLang={locale}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                // Cible ≥ 44px : le filet est porté par un sous-élément en
                // flex-col, il suit le texte (pas un offset figé au fond).
                "relative inline-flex min-h-11 flex-col items-center justify-center gap-1 px-1 micro",
                "transition-colors duration-150",
                EASE_CURVE,
                FOCUS_RING,
                isActive ? "text-fg" : "text-faint hover:text-fg-2",
              )}
            >
              {locale}
              <span
                aria-hidden="true"
                className={cn(
                  "h-px w-full origin-left bg-accent transition-transform duration-200",
                  EASE_CURVE,
                  isActive ? "scale-x-100" : "scale-x-0",
                )}
              />
            </Link>
          </Fragment>
        );
      })}
    </div>
  );
}
