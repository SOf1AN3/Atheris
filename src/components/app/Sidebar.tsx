"use client";

import {
  Circle,
  Coins,
  FileCheck2,
  FileSignature,
  FolderKanban,
  LayoutDashboard,
  ShieldCheck,
  Target,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { PlatformBrand, PlatformNavItem } from "@/content/platform/types";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Sidebar de l'espace connecté (T08 · DESIGN.md « OBSIDIAN INSTRUMENT »).
 *
 * Un SEUL rendu de navigation (`SidebarContent`) est réutilisé aux deux
 * emplacements :
 * - `variant: "desktop"` → dans l'`aside` fixe de `AppShell` (≥ lg) ;
 * - `variant: "mobile"` → dans le `Sheet` shadcn monté par `Topbar`
 *   (un seul menu, pas deux : le `Sheet` apporte `Escape` + focus trap).
 *
 * HABILLAGE (§2.4 / §2.6) : fond `ink-2` + filet `border-r border-line`,
 * liens `rounded-xl` (rayon « champ/row compact »), hover `white/4 %`, et un
 * SEUL signal : le lien actif combine `bg-surface-2` + `text-fg` + un filet
 * volt de 3px à gauche (§2.1 — jamais d'aplat volt, jamais de bleu).
 * Courbe unique `cubic-bezier(0.16, 1, 0.3, 1)`, 150ms (§3.1).
 */

export type SidebarVariant = "desktop" | "mobile";

/**
 * Icônes de navigation — **mapping local** (aucune clé ajoutée à
 * `src/content/*`) : la clé est le `href` de `PlatformNavItem`, une donnée
 * technique stable partagée FR/EN, jamais de copy.
 *
 * DESIGN §4.4 : `size={18}` / `strokeWidth={1.5}` ; l'icône est décorative
 * (`aria-hidden`), le libellé porte le sens. Jamais de volt sur une icône
 * (§2.1) : `text-muted` au repos → `text-fg` au survol et si l'item est
 * actif.
 *
 * Repli **obligatoire** : un `href` absent du tableau ne rend jamais de
 * trou ni de `undefined` → `NAV_FALLBACK_ICON` (pastille neutre).
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/espace/tableau-de-bord": LayoutDashboard,
  "/espace/prospects": Target,
  "/espace/commissions": Coins,
  "/espace/equipe": UsersRound,
  "/espace/projet": FolderKanban,
  "/espace/examen": FileCheck2,
  "/espace/verification": ShieldCheck,
  "/espace/contrat": FileSignature,
};

/** Icône rendue quand le `href` n'est pas dans `NAV_ICONS`. */
const NAV_FALLBACK_ICON: LucideIcon = Circle;

/** Résolution `href` → icône, avec repli garanti (jamais `undefined`). */
function iconForHref(href: string): LucideIcon {
  const icon: LucideIcon | undefined = NAV_ICONS[href];
  return icon ?? NAV_FALLBACK_ICON;
}

export type SidebarContentProps = {
  /** Entrées du rôle (`dict.nav[role]`) — `href` SANS préfixe locale. */
  items: readonly PlatformNavItem[];
  locale: Locale;
  /** Mot-marque (`dict.nav.brand`). */
  brand: PlatformBrand;
  variant: SidebarVariant;
  /**
   * Label `.micro text-faint` en tête de section — déjà localisé par
   * l'appelant (`dict.statuses.role[role]`). Optionnel : absent = aucun
   * en-tête rendu.
   */
  sectionLabel?: string;
  /** aria-label du bouton de fermeture (variante mobile uniquement). */
  menuClose?: string;
  /** Referme le `Sheet` mobile après activation d'un lien. */
  onClose?: () => void;
};

export type SidebarProps = {
  items: readonly PlatformNavItem[];
  locale: Locale;
  brand: PlatformBrand;
  /** Label `.micro text-faint` en tête de section (voir `SidebarContentProps`). */
  sectionLabel?: string;
};

/**
 * Monogramme « A » constructiviste : 2 diagonales + barre horizontale,
 * SVG inline (stroke `currentColor` 1.5px) dans un carré compact
 * `rounded-xl border border-line bg-surface` — aucune image bitmap (DESIGN §1).
 * `rounded-xl` (12px) = rayon « compact » de l'échelle à 3 valeurs §2.4.
 */
function Monogram(): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-fg"
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

/**
 * Mot-marque : « ATHERIS » blanc 15px/700 + suffixe en `.micro`
 * (mono 11px uppercase +0.18em) — la sérigraphie mono du système §2.2.
 */
function Wordmark({ brand }: { brand: PlatformBrand }): ReactNode {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="text-[15px] font-bold leading-none tracking-tight text-fg">
        {brand.name}
      </span>
      <span className="micro text-muted">{brand.suffix}</span>
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
 * Contenu de navigation partagé (desktop + mobile) : en-tête de marque filet,
 * puis la liste des liens du rôle.
 *
 * REPOS  : `text-muted rounded-xl px-3 py-2.5 text-[14px]`,
 *          hover `bg-white/[0.04] text-fg`.
 * ACTIF  : `bg-surface-2 text-fg font-semibold` + filet volt `w-[3px]` à
 *          gauche (`aria-current="page"` conservé — la couleur ne porte
 *          jamais le sens seule, §2.7).
 *
 * SECTION : `sectionLabel` rend un label `.micro text-faint` en tête de
 *          liste. Il est **fourni localisé par l'appelant** (le rôle
 *          connecté, `dict.statuses.role[role]`) : aucun libellé n'est écrit
 *          en dur ici, et `dict.nav` ne contient pas de clé de section.
 *
 * ICÔNES : rendues via `NAV_ICONS`, mapping **local** indexé sur le `href`
 *          (clé technique FR/EN, aucune copy ni clé ajoutée à `src/content/*`)
 *          — repli `NAV_FALLBACK_ICON` pour tout href inconnu.
 */
export function SidebarContent({
  items,
  locale,
  brand,
  variant,
  sectionLabel,
  menuClose,
  onClose,
}: SidebarContentProps): ReactNode {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Monogram />
          <Wordmark brand={brand} />
        </div>
        {variant === "mobile" && menuClose ? (
          <button
            type="button"
            aria-label={menuClose}
            onClick={onClose}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.04] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {sectionLabel !== undefined && sectionLabel !== "" ? (
          // Tête de section : mono 11px uppercase +0.18em, alignée sur le
          // texte des liens (`px-3`). Non-heading → hiérarchie de titres
          // intacte (le `<h1>` de la page reste le seul sommet, §2.7).
          <p className="micro px-3 pb-1 text-faint">{sectionLabel}</p>
        ) : null}
        {items.map((item) => {
          const href = `/${locale}${item.href}`;
          const active = isItemActive(pathname, href);
          const Icon = iconForHref(item.href);

          return (
            <Link
              key={item.href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={cn(
                // DESIGN §2.7 : `min-h-11` (44px) — la même nav sert le Sheet
                // mobile (cible tactile) et la sidebar desktop. `gap-3`
                // aligne l'icône (18px) sur la même ligne que le libellé,
                // sans changer la hauteur de ligne ni la cible.
                "group relative flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                active
                  ? "bg-surface-2 font-semibold text-fg"
                  : "text-muted hover:bg-white/[0.04] hover:text-fg",
              )}
            >
              {active ? (
                <span
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                />
              ) : null}
              <Icon
                aria-hidden="true"
                size={18}
                strokeWidth={1.5}
                className={cn(
                  "shrink-0 transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  active ? "text-fg" : "text-muted group-hover:text-fg",
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/**
 * Sidebar desktop (masquée < lg) : `aside` collant plein écran, fond `ink-2`,
 * filet `border-r border-line` (§2.4 — hairline par défaut).
 */
export function Sidebar({
  items,
  locale,
  brand,
  sectionLabel,
}: SidebarProps): ReactNode {
  return (
    <aside
      aria-label={`${brand.name} ${brand.suffix}`}
      className="hidden w-64 shrink-0 border-r border-line bg-ink-2 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto"
    >
      <SidebarContent
        items={items}
        locale={locale}
        brand={brand}
        variant="desktop"
        sectionLabel={sectionLabel}
      />
    </aside>
  );
}
