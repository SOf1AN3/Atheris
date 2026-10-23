"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

function isLocale(value: string): value is Locale {
  return value === "fr" || value === "en";
}

/**
 * Bascule de locale FR ↔ EN (segment 1 du pathname), en conservant le reste
 * du chemin ainsi que l'ancre (`hash`) de la page courante.
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
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-1",
        className,
      )}
    >
      {LOCALES.map((locale) => {
        const isActive = locale === currentLocale;

        return (
          <Link
            key={locale}
            href={hrefFor(locale)}
            hrefLang={locale}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold uppercase tracking-wider transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]",
              isActive ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
            )}
          >
            {locale}
          </Link>
        );
      })}
    </div>
  );
}
