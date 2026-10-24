"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { logout } from "@/actions/auth";
import { SidebarContent } from "@/components/app/Sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type {
  PlatformNavItem,
  PlatformNavContent,
} from "@/content/platform/types";
import { locales } from "@/i18n/config";
import type { Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/**
 * Topbar de l'espace connecté (T08 · DESIGN.md §12.3) : 64px, collante,
 * fond `ink/80` + `backdrop-blur-xl`, filet `line`.
 *
 * CHOIX SHEET MOBILE (le plus simple et le propre) : l'**état du `Sheet` vit
 * dans ce composant**, le déclencheur (hamburger) étant son propre enfant
 * `SheetTrigger`. Aucun `AppShellClient`, aucun contexte, aucune prop de
 * rappel à remonter : `AppShell` reste un Server Component et se contente de
 * rendre `<Sidebar>` (desktop) + `<Topbar>` (qui embarque le seul menu
 * mobile, avec le même `SidebarContent` que la sidebar desktop).
 */

export type TopbarUser = {
  /** Nom affiché (menu avatar + nom accessible du déclencheur). */
  name: string;
};

export type TopbarProps = {
  /** Entrées du rôle (`dict.nav[role]`), servies aussi au `Sheet` mobile. */
  items: readonly PlatformNavItem[];
  locale: Locale;
  /** Libellés partagés de la nav (`dict.nav`). */
  nav: PlatformNavContent;
  user: TopbarUser;
  /** Libellé lisible du rôle (`dict.statuses.role[role]`). */
  roleLabel: string;
};

/** Préfixe de locale en tête de chemin (`/fr…`, `/en…`). */
const LOCALE_PREFIX = new RegExp(`^/(${locales.join("|")})`);

/** Même chemin sous l'autre locale — repli si la locale n'est pas en tête. */
function switchLocalePath(pathname: string, target: Locale): string {
  if (LOCALE_PREFIX.test(pathname)) {
    return pathname.replace(LOCALE_PREFIX, `/${target}`);
  }
  return pathname === "/" ? `/${target}` : `/${target}${pathname}`;
}

/** Initiales (1 à 2 caractères) de l'avatar typographique — DESIGN §4.8. */
function initialsOf(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
  return initials === "" ? "?" : initials;
}

export function Topbar({
  items,
  locale,
  nav,
  user,
  roleLabel,
}: TopbarProps): ReactNode {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Déconnexion : `logout()` (Server Action) invalide le cookie puis déclenche
   * la redirection serveur de `signOut` ; on enchaîne sur la page de connexion
   * locale + `router.refresh()` pour purger le cache RSC (filet).
   */
  const handleLogout = async (): Promise<void> => {
    await logout();
    router.push(`/${locale}/connexion`);
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-ink/80 px-4 backdrop-blur-xl lg:px-6">
      {/* Gauche : ouverture du menu mobile (unique, monté ci-dessous). */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={nav.menuOpen}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 lg:hidden"
          >
            <Menu aria-hidden="true" className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          aria-label={`${nav.brand.name} ${nav.brand.suffix}`}
          // `p-0` : le padding est porté par `SidebarContent` ; la croix
          // intégrée du `Sheet` est masquée au profit de notre bouton
          // étiqueté `nav.menuClose` (44px, DESIGN §cibles tactiles).
          className="bg-ink p-0 [&>button:first-of-type]:hidden"
        >
          <SidebarContent
            items={items}
            locale={locale}
            brand={nav.brand}
            variant="mobile"
            menuClose={nav.menuClose}
            onClose={() => setMobileNavOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Droite : switch de langue + menu avatar. */}
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label={nav.languageSwitcher}
          className="flex items-center gap-1"
        >
          {locales.map((code) => {
            const active = code === locale;
            const href = active ? pathname : switchLocalePath(pathname, code);

            return (
              <Link
                key={code}
                href={href}
                hrefLang={code}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center justify-center rounded-lg px-3 text-[13px] font-semibold tracking-tight transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
                  active ? "bg-surface-2 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {code.toUpperCase()}
              </Link>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <Avatar aria-hidden="true">
                <AvatarFallback>{initialsOf(user.name)}</AvatarFallback>
              </Avatar>
              <span className="sr-only">{user.name}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-[13rem] border-line"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-2">
              <span className="text-sm font-semibold text-fg">
                {user.name}
              </span>
              <span className="text-xs font-normal text-muted">
                {roleLabel}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="hover:bg-surface-2"
              onSelect={() => router.push(`/${locale}/espace/profil`)}
            >
              {nav.profile}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="hover:bg-surface-2"
              onSelect={handleLogout}
            >
              {nav.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
