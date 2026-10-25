import type { ReactNode } from "react";

import type { FooterContent, NavContent } from "@/content/types";
import { cn } from "@/lib/utils";

export type FooterProps = {
  footer: FooterContent;
  nav: NavContent;
  /** Année du copyright ; fournie par l'appelant en contexte statique. */
  year?: number;
};

/**
 * Seule string en dur autorisée (contrainte de tâche) : email professionnel,
 * identique FR/EN et non traduisible.
 */
const CONTACT_EMAIL = "contact@atherislabs.com";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]";
/** Courbe UNIQUE du site (DESIGN §3.1). */
const LINK_TRANSITION =
  "transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)]";

/** Monogramme « A » constructiviste (DESIGN §3.7) — duplication du Header. */
function Monogram(): ReactNode {
  return (
    <span
      aria-hidden="true"
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-line text-fg"
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

/**
 * Pied de page (DESIGN §2.5 #12) — composant serveur : aucun état, aucun hook.
 * `md:grid-cols-12` (Marque + baseline 5 / Navigation 3 / Contact 4) →
 * 1 colonne mobile, puis **wordmark géant en contour** (`.wordmark`, rogné
 * par `overflow-hidden`) et barre basse hairline.
 */
export function Footer({ footer, nav, year }: FooterProps): ReactNode {
  const currentYear = year ?? new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* Colonnes — densité dense (§2.3). */}
        <div className="grid gap-10 py-[clamp(56px,7vh,88px)] md:grid-cols-12 md:gap-8">
          {/* Marque + baseline */}
          <div className="flex flex-col gap-4 md:col-span-5">
            <span className="inline-flex min-h-11 items-center gap-2.5">
              <Monogram />
              <span className="text-[15px] font-bold tracking-[-0.02em] text-fg">
                {nav.brand.name}{" "}
                <span className="text-muted">{nav.brand.suffix}</span>
              </span>
            </span>
            <p className="max-w-[34ch] text-sm leading-[1.6] text-muted">
              {footer.tagline}
            </p>
          </div>

          {/* Navigation */}
          <div className="flex flex-col gap-4 md:col-span-3">
            <h2 className="micro text-muted">{footer.navLabel}</h2>
            <ul className="flex flex-col">
              {nav.items.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className={cn(
                      "inline-flex min-h-11 items-center text-sm text-fg/80 hover:text-fg",
                      LINK_TRANSITION,
                      FOCUS_RING,
                    )}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>

            {/* Liens PROPREMENT footer (PLAN Q7) — hors nav principale :
                le header n'affiche jamais cette liste. Séparés par un filet
                pour signaler qu'on quitte la navigation de page. */}
            {footer.links.length > 0 ? (
              <ul className="flex flex-col border-t border-line pt-2">
                {footer.links.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      className={cn(
                        "group inline-flex min-h-11 items-center gap-2 text-sm text-fg/80 hover:text-fg",
                        LINK_TRANSITION,
                        FOCUS_RING,
                      )}
                    >
                      {item.label}
                      <span
                        aria-hidden="true"
                        className="transition-transform duration-200 group-hover:translate-x-1"
                      >
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* Contact */}
          <div className="flex flex-col gap-4 md:col-span-4">
            <h2 className="micro text-muted">{footer.contactLabel}</h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className={cn(
                "w-fit rounded-sm font-mono text-sm text-fg/80 hover:text-fg",
                LINK_TRANSITION,
                FOCUS_RING,
              )}
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {/* WORDMARK géant en contour — rogné par le conteneur, jamais débordant.
            `10rem` max : 12 caractères à ~6.4em restent dans les 1120px utiles. */}
        <div className="overflow-hidden border-t border-line pt-10">
          <div
            className="wordmark text-[clamp(2.25rem,13vw,10rem)]"
            aria-hidden="true"
          >
            {`${nav.brand.name} ${nav.brand.suffix}`}
          </div>
        </div>

        {/* Barre basse hairline : copyright + mentions + retour en haut. */}
        <div className="flex flex-col gap-4 border-t border-line py-6 text-xs text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {currentYear} {nav.brand.name} {nav.brand.suffix}. {footer.rights}
          </p>
          <div className="flex items-center gap-6">
            <span>{footer.legal}</span>
            {/* Retour en haut — glyphe technique, sans copie en dur :
                le glyphe sert de nom accessible au lien. */}
            <a
              href="#top"
              className={cn(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-base text-muted hover:border-line-2 hover:text-fg",
                LINK_TRANSITION,
                FOCUS_RING,
              )}
            >
              ↑
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
