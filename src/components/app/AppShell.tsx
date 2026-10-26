import type { ReactNode } from "react";

import { Sidebar } from "@/components/app/Sidebar";
import { Topbar } from "@/components/app/Topbar";
import { Toaster } from "@/components/ui/sonner";
import type { PlatformNavItem, PlatformNavContent } from "@/content/platform/types";
import type { Locale } from "@/i18n/config";

/**
 * Shell de l'espace connecté (T08 · Server Component).
 *
 * Structure : `flex min-h-screen` → sidebar desktop (masquée < lg) + colonne
 * droite (topbar collante + `<main id="main">`). Le menu mobile n'existe qu'à
 * un seul endroit : il est monté par `Topbar`, qui porte l'état de son `Sheet`
 * (note de choix détaillée dans `src/components/app/Topbar.tsx`).
 *
 * `<Toaster />` (sonner) est monté ici pour tous les futurs toasts de
 * l'espace ; thème sombre forcé (site dark-only, aucun ThemeProvider).
 */
export type AppShellProps = {
  /** Entrées du rôle connecté — `dict.nav[role]`, href SANS préfixe locale. */
  items: readonly PlatformNavItem[];
  locale: Locale;
  /** Libellés partagés de la nav (`dict.nav`). */
  nav: PlatformNavContent;
  /** Identité affichée dans le menu avatar. */
  user: { name: string };
  /**
   * Libellé lisible du rôle — `dict.statuses.role[role]`. Sert de label
   * `.micro` en tête de section de la sidebar (desktop + menu mobile) et de
   * nom de rôle dans le menu avatar.
   */
  roleLabel: string;
  /** DESIGN §6.4 — libellé du skip-link (`dict.a11y.skipToContent`). */
  skipToContent: string;
  children: ReactNode;
};

export function AppShell({
  items,
  locale,
  nav,
  user,
  roleLabel,
  skipToContent,
  children,
}: AppShellProps): ReactNode {
  return (
    <>
      {/* DESIGN §6.4 — skip-link : premier élément focusable de l'espace
          connecté, visible uniquement au focus, cible `<main id="main">`
          (pattern repris du layout `(marketing)`). */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-sm focus:text-fg"
      >
        {skipToContent}
      </a>
      <div className="flex min-h-screen bg-ink">
        <Sidebar
          items={items}
          locale={locale}
          brand={nav.brand}
          sectionLabel={roleLabel}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            items={items}
            locale={locale}
            nav={nav}
            user={user}
            roleLabel={roleLabel}
          />
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 overflow-y-auto p-6 lg:p-8"
          >
            {children}
          </main>
        </div>
      </div>
      {/* Le grain (DESIGN §2.4) est désormais rendu UNE fois au root
          (`[locale]/layout.tsx`) pour tout le site : pas de second nœud ici,
          sinon l'overlay serait cumulé (opacité double) sur la plateforme. */}
      <Toaster theme="dark" />
    </>
  );
}
