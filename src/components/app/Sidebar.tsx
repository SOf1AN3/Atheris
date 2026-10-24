"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { PlatformBrand, PlatformNavItem } from "@/content/platform/types";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Sidebar de l'espace connecté (T08 · DESIGN.md §12.3).
 *
 * Un SEUL rendu de navigation (`SidebarContent`) est réutilisé aux deux
 * emplacements :
 * - `variant: "desktop"` → dans l'`aside` fixe de `AppShell` (≥ lg) ;
 * - `variant: "mobile"` → dans le `Sheet` shadcn monté par `Topbar`
 *   (un seul menu, pas deux : le `Sheet` apporte `Escape` + focus trap).
 */

export type SidebarVariant = "desktop" | "mobile";

export type SidebarContentProps = {
  /** Entrées du rôle (`dict.nav[role]`) — `href` SANS préfixe locale. */
  items: readonly PlatformNavItem[];
  locale: Locale;
  /** Mot-marque (`dict.nav.brand`). */
  brand: PlatformBrand;
  variant: SidebarVariant;
  /** aria-label du bouton de fermeture (variante mobile uniquement). */
  menuClose?: string;
  /** Referme le `Sheet` mobile après activation d'un lien. */
  onClose?: () => void;
};

export type SidebarProps = {
  items: readonly PlatformNavItem[];
  locale: Locale;
  brand: PlatformBrand;
};

/**
 * Monogramme « A » constructiviste : 2 diagonales + barre horizontale,
 * SVG inline (stroke `currentColor` 1.5px) dans un carré
 * `rounded-lg border border-line` — aucune image bitmap (DESIGN §1).
 */
function Monogram(): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-fg"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M5 19 12 5l7 14" />
        <path d="M8.5 14h7" />
      </svg>
    </span>
  );
}

/** Mot-marque : « ATHERIS » blanc 15px/700 + « LABS » `muted`. */
function Wordmark({ brand }: { brand: PlatformBrand }): ReactNode {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[15px] font-bold leading-none tracking-tight text-fg">
        {brand.name}
      </span>
      <span className="text-[11px] font-medium leading-none tracking-[0.16em] text-muted">
        {brand.suffix}
      </span>
    </span>
  );
}

/**
 * État actif : le chemin courant vaut `/{locale}{href}` ou en est un enfant
 * (frontière de segment) — `/espace/prospects` n'active donc jamais un
 * hypothétique `/espace/prospects-x`.
 */
function isItemActive(pathname: string, localizedHref: string): boolean {
  return (
    pathname === localizedHref || pathname.startsWith(`${localizedHref}/`)
  );
}

/**
 * Contenu de navigation partagé (desktop + mobile) : mot-marque en haut,
 * puis la liste des liens du rôle avec l'indicateur actif autorisé en §12.3
 * (fond `surface-2`, texte `fg`, point accent de 1.5 à gauche).
 */
export function SidebarContent({
  items,
  locale,
  brand,
  variant,
  menuClose,
  onClose,
}: SidebarContentProps): ReactNode {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram />
          <Wordmark brand={brand} />
        </div>
        {variant === "mobile" && menuClose ? (
          <button
            type="button"
            aria-label={menuClose}
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const href = `/${locale}${item.href}`;
          const active = isItemActive(pathname, href);

          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={cn(
                "relative flex items-center rounded-lg px-[14px] py-[10px] text-[14px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                active
                  ? "bg-surface-2 text-fg"
                  : "text-muted hover:bg-surface-2/50 hover:text-fg",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent"
                />
              ) : null}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Sidebar desktop (masquée < lg) : `aside` collant plein écran, bordure
 * `line` à droite, fond `ink`.
 */
export function Sidebar({ items, locale, brand }: SidebarProps): ReactNode {
  return (
    <aside
      aria-label={`${brand.name} ${brand.suffix}`}
      className="hidden w-64 shrink-0 border-r border-line bg-ink lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto"
    >
      <SidebarContent
        items={items}
        locale={locale}
        brand={brand}
        variant="desktop"
      />
    </aside>
  );
}
