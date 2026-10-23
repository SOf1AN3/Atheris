import type { ReactNode } from "react";

import type { FooterContent, NavContent } from "@/content/types";

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
 * Pied de page (DESIGN §3.8) — composant serveur : aucun état, aucun hook.
 * 3 colonnes desktop (Marque + baseline | Navigation | Contact) → 1 colonne
 * mobile, barre légale séparée par un filet `border-line`.
 */
export function Footer({ footer, nav, year }: FooterProps): ReactNode {
  const currentYear = year ?? new Date().getFullYear();

  return (
    <footer className="border-t border-line bg-ink">
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <div className="grid gap-10 py-16 md:grid-cols-3">
          {/* Colonne 1 — marque + baseline */}
          <div className="flex flex-col gap-4">
            <span className="inline-flex items-center gap-2.5">
              <Monogram />
              <span className="text-[15px] font-bold tracking-[-0.02em] text-fg">
                {nav.brand.name}{" "}
                <span className="text-muted">{nav.brand.suffix}</span>
              </span>
            </span>
            <p className="max-w-[28ch] text-sm text-muted">{footer.tagline}</p>
          </div>

          {/* Colonne 2 — navigation */}
          <div className="flex flex-col gap-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
              {footer.navLabel}
            </h2>
            <ul className="flex flex-col gap-3">
              {nav.items.map((item) => (
                <li key={item.href}>
                  <a
                    href={item.href}
                    className="rounded-sm text-sm text-fg/80 transition-colors duration-150 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Colonne 3 — contact (DESIGN §3.8 : bleu autorisé au hover ici) */}
          <div className="flex flex-col gap-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-muted">
              {footer.contactLabel}
            </h2>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="w-fit rounded-sm text-sm text-fg/80 transition-colors duration-150 hover:text-accent focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>

        {/* Barre légale */}
        <div className="mt-12 flex items-center justify-between gap-4 border-t border-line pt-6 text-xs text-faint">
          <p>
            © {currentYear} {nav.brand.name} {nav.brand.suffix}.{" "}
            {footer.rights}
          </p>
          {/* DESIGN: devient un lien vers /mentions-legales quand la page existera (aucun href mort autorisé) */}
          <span className="shrink-0 text-faint">{footer.legal}</span>
        </div>
      </div>
    </footer>
  );
}
