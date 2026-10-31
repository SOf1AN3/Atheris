"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Button } from "@/components/ui/Button";
import type { A11yStrings, Brand, NavContent } from "@/content/types";
import { cn } from "@/lib/utils";

export type HeaderProps = {
  nav: NavContent;
  a11y: A11yStrings;
  className?: string;
};

/** Seuil de bascule de l'état « scrolled » (DESIGN §3.7 / motion M9). */
const SCROLL_THRESHOLD_PX = 24;
/** Seuil de condensation (motion M19) : `64px → 56px` + repli du wordmark. */
const SCROLL_CONDENSED_THRESHOLD_PX = 200;
/** Bande de détection du scrollspy (DESIGN §3.7, lien actif option B). */
const SECTION_ROOT_MARGIN = "-40% 0px -55%";
/** Container §2.7 réutilisé par la barre du header et celle du menu mobile. */
const CONTAINER_CLASS =
  "px-[clamp(1.25rem,5vw,2.5rem)] mx-auto max-w-[1200px]";
const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]";
/** Courbe UNIQUE du site (DESIGN §3.1) — aucune autre easing. */
const EASE_CURVE = "ease-[cubic-bezier(0.16,1,0.3,1)]";
/** Le filet volt est un pseudo-élément : il porte SA propre timing function
 *  (`transition-timing-function` n'est pas hérité). */
const AFTER_EASE_CURVE = "after:ease-[cubic-bezier(0.16,1,0.3,1)]";
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];
/** Nav desktop : mono 12px uppercase +0.1em (DESIGN §2.6).
 *  `.micro` est hors-layer (prioritaire) et fige 11px : on redéclare donc
 *  les propriétés en utilitaires pour garder le 12px demandé. */
const NAV_LINK_BASE =
  "relative font-mono text-[12px] uppercase leading-normal tracking-[0.1em] " +
  "transition-colors duration-150 " +
  EASE_CURVE +
  " after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:origin-left " +
  "after:bg-accent after:scale-x-0 after:transition-transform after:duration-200 " +
  AFTER_EASE_CURVE +
  " after:content-[''] hover:after:scale-x-100";

/**
 * URL d'accès au dashboard : `/{locale}/connexion`.
 * Le locale est lu dans les paramètres d'URL (`[locale]`), avec repli sur le
 * premier segment du pathname — AUCUN code langue en dur (i18n stricte).
 */
function buildLoginHref(
  pathname: string,
  localeParam: string | string[] | undefined,
): string {
  const fromParams = typeof localeParam === "string" ? localeParam : "";
  const fromPath = pathname.split("/")[1] ?? "";
  const locale = fromParams !== "" ? fromParams : fromPath;
  // Segmente uniquement une locale plausible (`fr`, `en`, `fr-DZ`) : on ne
  // préfixe jamais une route déjà pleine (ex. `/connexion` sans locale).
  return /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(locale)
    ? `/${locale}/connexion`
    : "/connexion";
}

/** Monogramme « A » constructiviste (DESIGN §3.7) — décoratif.
 *  Glyphe SEUL : aucun `border`, aucun fond (3 → 1 bordure dans la barre). */
function Monogram({ className }: { className?: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center text-fg",
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
        focusable="false"
        className="h-4 w-4"
      >
        <path d="M4.5 19.5 12 4.5l7.5 15" />
        <path d="M8.25 14.25h7.5" />
      </svg>
    </span>
  );
}

/** Lien marque (glyphe seul + wordmark à deux voix) — réutilisé par le header
 *  et le menu mobile. Au condensé (M19), le wordmark se replie sur le glyphe
 *  (`opacity 1→0` + `translateX(-8px)`, 200ms) sans aucun décalage de layout :
 *  le bloc reste en flux, seul son rendu s'efface. */
function BrandLink({
  brand,
  condensed = false,
  onNavigate,
}: {
  brand: Brand;
  condensed?: boolean;
  onNavigate?: () => void;
}): ReactNode {
  return (
    <Link
      href="#top"
      onClick={onNavigate}
      className={cn(
        "group inline-flex min-h-11 shrink-0 items-center gap-2.5 transition-colors duration-150",
        FOCUS_RING,
      )}
    >
      <Monogram />
      <span
        className={cn(
          "text-[15px] font-bold tracking-[-0.02em] text-fg",
          "transition-[opacity,transform] duration-200",
          EASE_CURVE,
          condensed && "pointer-events-none -translate-x-2 opacity-0",
        )}
      >
        {brand.name}{" "}
        <span className="font-mono text-[11px] font-normal tracking-[0.16em] text-faint transition-colors duration-150 group-hover:text-muted">
          {brand.suffix}
        </span>
      </span>
    </Link>
  );
}

export function Header({ nav, a11y, className }: HeaderProps): ReactNode {
  const reducedMotion = useReducedMotion();
  const pathname = usePathname();
  const params = useParams();
  const loginHref = buildLoginHref(pathname, params["locale"]);
  const [scrolled, setScrolled] = useState<boolean>(false);
  const [condensed, setCondensed] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState<boolean>(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* ---------------------------------------------------------------- scroll */
  useEffect(() => {
    const handleScroll = (): void => {
      const scrollY = window.scrollY;
      setScrolled(scrollY > SCROLL_THRESHOLD_PX);
      // M19 — condensation : second booléen dans le MÊME handler, nettoyé au
      // démontage avec l'état `scrolled` (un seul listener de scroll).
      setCondensed(scrollY > SCROLL_CONDENSED_THRESHOLD_PX);
    };
    // Sync au montage : une page arrivée déjà scrollée (`/fr#contact`,
    // restoration de scroll) bascule en état « scrolled » sans attendre
    // la première interaction de scroll.
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /* ------------------------------------------------------------ scrollspy */
  // Observe uniquement les sections réellement présentes dans le DOM :
  // un id absent ne provoque aucun crash et le cleanup désabonne tout.
  useEffect(() => {
    const ids: string[] = [];
    const seen = new Set<string>();

    for (const item of nav.items) {
      const hash = item.href.startsWith("#") ? item.href.slice(1) : "";
      if (hash === "" || seen.has(hash)) continue;
      seen.add(hash);
      ids.push(hash);
    }

    const targets: HTMLElement[] = [];
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element !== null) targets.push(element);
    }
    if (targets.length === 0) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Premier item de nav encore visible (ordre du contenu respecté).
        setActiveSectionId(ids.find((id) => visible.has(id)) ?? null);
      },
      { rootMargin: SECTION_ROOT_MARGIN },
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [nav.items]);

  /* -------------------------------------------------------- menu mobile */
  const focusToggle = useCallback((): void => {
    // Rendu du focus au bouton hamburger une fois l'état « fermé » committé.
    requestAnimationFrame(() => toggleRef.current?.focus());
  }, []);

  const closeMenu = useCallback(
    (restoreFocus: boolean): void => {
      setMenuOpen(false);
      if (restoreFocus) focusToggle();
    },
    [focusToggle],
  );

  // Fermeture sur navigation (notamment la bascule de locale) : le panneau
  // ne doit jamais rester ouvert sur une autre route.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  // Point d'entrée desktop : la responsive `lg:hidden` masque le panneau,
  // on referme l'état pour ne pas laisser le scroll du body verrouillé.
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const handleBreakpoint = (): void => {
      if (media.matches) setMenuOpen(false);
    };
    media.addEventListener("change", handleBreakpoint);
    return () => media.removeEventListener("change", handleBreakpoint);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeMenu(true);
        return;
      }

      // Piège à focus (DESIGN §4.11) : Tab cycle entre le premier et le
      // dernier élément focusable du panneau tant qu'il est ouvert.
      if (event.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;

        const focusables = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled])',
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !panel.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !panel.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen, closeMenu]);

  /* --------------------------------------------------------------- rendu */
  // DEMANDE CLIENT : la page d'offre (`/recrutement`) s'affiche SANS header
  // (conversion dédiée, lecture pleine largeur) — le footer, lui, est
  // conservé. `return null` AVANT le JSX : aucun `<header>` ni panneau mobile
  // n'est rendu sur cette route ; ailleurs zéro impact (la landing garde son
  // offset `-mt-16`, le scrollspy ne trouve rien à observer ici et reste
  // intact partout ailleurs). Le retour est post-hooks (règle des hooks) :
  // l'état/les effets restent montés mais n'ont aucun DOM à piloter.
  if (pathname.endsWith("/recrutement")) return null;

  // DESIGN: l'état `backdrop-filter` du header crée un bloc de conteneur pour
  // les descendants `fixed` : le panneau plein écran est rendu en FRAGMENT
  // à côté de `<header>` (et non à l'intérieur) pour rester en `inset-0`.
  return (
    <>
      <header
        className={cn(
          // DESIGN: l'interpolation `bg-transparent → bg-ink/80` (couleur →
          // couleur) et `border-transparent → border-line` est couverte par la
          // transition existante sur background-color/border-color.
          // `height` rejoint la transition (M19 anime la hauteur du conteneur :
          // la seule exception de perf admise par DESIGN §3.2 pour M19).
          "sticky top-0 z-50 h-16 border-b transition-[background-color,border-color,box-shadow,backdrop-filter,height] duration-[240ms]",
          EASE_CURVE,
          scrolled
            ? "border-line bg-ink/80 shadow-[0_1px_0_rgba(255,255,255,0.03)] backdrop-blur-[20px] backdrop-saturate-[1.6]"
            : "border-transparent bg-transparent",
          // M19 — condensation `scrollY > 200` : 64px → 56px (inchangé ailleurs).
          condensed && "h-14",
          className,
        )}
      >
        <div
          className={cn(
            CONTAINER_CLASS,
            // 3 modules `[Marque] · [Nav] · [Module d'action]` (Option A) :
            // `gap-6` (plancher 24px) en mobile ; `lg:gap-0` en desktop où
            // les 2 spacers `flex-1` (min 24px) garantissent des respirations
            // GAUCHE = DROITE par construction, jamais sous 24px.
            "flex h-full items-center gap-6 lg:gap-0",
          )}
        >
          {/* Module 1 — marque : glyphe seul + wordmark deux voix, zéro cadre */}
          <BrandLink brand={nav.brand} condensed={condensed} />

          {/* Spacer gauche (flex:1, plancher 24px) */}
          <span aria-hidden="true" className="hidden min-w-6 flex-1 lg:block" />

          {/* Module 2 — navigation desktop : mono 12px caps +0.1em, `muted` →
              `fg`, filet volt 2px sous l'actif — scrollspy conservé intégralement */}
          <nav className="hidden shrink-0 items-center gap-8 lg:flex">
            {nav.items.map((item) => {
              const sectionId = item.href.startsWith("#")
                ? item.href.slice(1)
                : "";
              const isActive = sectionId !== "" && sectionId === activeSectionId;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    NAV_LINK_BASE,
                    FOCUS_RING,
                    isActive ? "text-fg after:scale-x-100" : "text-muted hover:text-fg",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer droit (flex:1, plancher 24px) — équilibre la respiration gauche */}
          <span aria-hidden="true" className="hidden min-w-6 flex-1 lg:block" />

          {/* Module 3 — module d'action UNIQUE : locale texte │ Connexion */}
          <div className="ml-auto flex shrink-0 items-center gap-3 lg:ml-0">
            {/* Locale en TEXTE mono 11px caps (H1 : plus de pill, plus de
                bordure, plus de rayon) — l'actif porte son filet volt 1px,
                les deux liens sont séparés par un `/` en `line-3`. */}
            <LocaleSwitcher
              label={a11y.switchLocale}
              className="hidden shrink-0 lg:inline-flex"
            />
            {/* Filet vertical 1×16px `line-2` : respire, sépare, n'ajoute qu'1 trait */}
            <span
              aria-hidden="true"
              className="hidden h-4 w-px shrink-0 bg-line-2 lg:block"
            />
            {/* CTA §2.6 — SEUL aplat volt de la barre : bouton « Connexion »
                (i18n `nav.loginLabel`) vers `/{locale}/connexion` via
                `loginHref` — aucun libellé ni URL en dur (C2), et UN SEUL
                bouton connexion (plus de lien fantôme en doublon). */}
            <Button variant="primary" size="sm" href={loginHref}>
              {nav.loginLabel}
            </Button>
          </div>

          {/* Mobile — hamburger (44px, DESIGN §4.11) */}
          <button
            ref={toggleRef}
            type="button"
            aria-label={menuOpen ? a11y.closeMenu : a11y.openMenu}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors duration-150 lg:hidden",
              EASE_CURVE,
              FOCUS_RING,
              "text-fg hover:text-muted",
            )}
          >
            <span aria-hidden="true">
              {menuOpen ? (
                <X className="h-6 w-6" strokeWidth={1.5} />
              ) : (
                <Menu className="h-6 w-6" strokeWidth={1.5} />
              )}
            </span>
          </button>
        </div>
      </header>

      {/* Panneau plein écran (DESIGN §4.11) — z-menu: 60 */}
      <AnimatePresence>
        {menuOpen ? (
          <motion.div
            id="mobile-menu"
            key="mobile-menu"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={a11y.openMenu}
            className="fixed inset-0 z-[60] flex flex-col bg-ink lg:hidden"
            initial={reducedMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reducedMotion ? 0 : -8 }}
            transition={{
              duration: reducedMotion ? 0 : 0.22,
              ease: EASE_PREMIUM,
            }}
          >
            {/* Barre haute : logo + fermeture */}
            <div
              className={cn(
                CONTAINER_CLASS,
                "flex h-16 shrink-0 items-center justify-between border-b border-line",
              )}
            >
              <BrandLink brand={nav.brand} onNavigate={() => closeMenu(false)} />
              <button
                ref={closeRef}
                type="button"
                aria-label={a11y.closeMenu}
                onClick={() => closeMenu(true)}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl text-fg transition-colors duration-150 hover:text-muted",
                  EASE_CURVE,
                  FOCUS_RING,
                )}
              >
                <X aria-hidden="true" className="h-6 w-6" strokeWidth={1.5} />
              </button>
            </div>

            {/* Liens */}
            {/* DESIGN: liens de nav sans h3 (hiérarchie de titres respectée — voir §6) */}
            <div className="flex-1 overflow-y-auto px-[clamp(1.25rem,5vw,2.5rem)] py-6">
              {/* DESIGN: nav sans libellé (un seul landmark visible à la fois) */}
              <nav>
                <ul className="flex flex-col gap-2">
                  {nav.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => closeMenu(false)}
                        className={cn(
                          "block border-b border-line py-4 text-[22px] font-semibold text-fg transition-colors duration-150 hover:text-muted",
                          FOCUS_RING,
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            {/* Pied du panneau : locale + UN SEUL bouton « Connexion »
                (aplat volt, i18n `nav.loginLabel`) vers `/{locale}/connexion`. */}
            <div className="flex shrink-0 flex-col gap-4 border-t border-line px-[clamp(1.25rem,5vw,2.5rem)] py-6">
              <LocaleSwitcher label={a11y.switchLocale} className="self-start" />
              <Button
                variant="primary"
                size="md"
                href={loginHref}
                className="w-full"
                onClick={() => closeMenu(false)}
              >
                {nav.loginLabel}
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
