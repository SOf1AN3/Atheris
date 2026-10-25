import type { MouseEvent, ReactNode } from "react";

import { CaseStudyMockup } from "@/components/sections/CaseStudyMockups";
import { Badge } from "@/components/ui/Badge";
import type { CaseStudy } from "@/content/types";
import { cn } from "@/lib/utils";

type CaseStudyCardProps = {
  study: CaseStudy;
  /** Libellé localisé de la catégorie (`cases.filters[category]`). */
  categoryLabel?: string;
  /**
   * Variante large — API conservée pour compatibilité. Le rail `02` applique
   * une largeur unique par carte (spécification) : la prop n'est plus lue.
   */
  featured?: boolean;
  /** Classes additionnelles (ex. `h-full` pour aligner les cartes du rail). */
  className?: string;
};

/**
 * M11 — spotlight suiveur (instantané, sans transition) : on écrit les
 * variables `--x` / `--y`, consommées par `.spot::after` (globals.css).
 */
function handleSpotlight(event: MouseEvent<HTMLElement>): void {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--x", `${event.clientX - rect.left}px`);
  element.style.setProperty("--y", `${event.clientY - rect.top}px`);
}

/**
 * Carte d'étude de cas (`02`) : zone mockup 240px (zoom `scale(1.03)` +
 * balayage `.shine` au survol), puis catégorie + filet, titre, description,
 * tags à gauche et métrique business volt à droite (la donnée qui compte).
 * Carte NON interactive (pas de page détail) — le hover reste purement visuel.
 */
export function CaseStudyCard({
  study,
  categoryLabel,
  className,
}: CaseStudyCardProps): ReactNode {
  const category = categoryLabel ?? study.category;

  return (
    // DESIGN §2.6 — carte standard : hairline → `line-2`, lift -3px,
    // `--shadow-lift`, 240ms sur la courbe UNIQUE cubic-bezier(0.16,1,0.3,1).
    <article
      onMouseMove={handleSpotlight}
      className={cn(
        "case card spot group flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface transition-[translate,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-line-2 hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      {/* Zone mockup `.mock` : hauteur fixe, arrondi haut, filet de séparation. */}
      <div className="mock relative h-[240px] overflow-hidden rounded-t-[14px] border-b border-line bg-[#0B0E14]">
        {/* Zoom maîtrisé : le conteneur `.mock` découpe le scale 1.03. */}
        <div className="mock-inner h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]">
          <CaseStudyMockup kind={study.mockup} />
        </div>

        {/* Voile `.shine` — balayage lumineux au survol de la carte (M13). */}
        <span
          aria-hidden="true"
          className="shine pointer-events-none absolute inset-0 -translate-x-[180%] bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[180%] group-hover:opacity-100"
        />
      </div>

      <div className="flex flex-1 flex-col p-6 md:p-7">
        {/* Sérigraphie : catégorie (signal) + filet pleine largeur.
            NOTE: `CaseStudy` ne porte PAS de champ `year` (contenu hors
            périmètre) → pas d'année inventée (i18n strict). */}
        <div className="flex items-center gap-3">
          {/* Catégorie = métadonnée → `muted`. Le VOLT est réservé à la
              métrique (l'unique donnée clé de la carte, DESIGN §2.1). */}
          <span className="micro text-muted">{category}</span>
          <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-line" />
        </div>

        <h3 className="h-display mt-4 text-[22px] text-fg">{study.title}</h3>

        <p className="mt-3 mb-6 text-[15px] leading-relaxed text-muted">
          {study.description}
        </p>

        {/* Ligne séparée : tags à gauche, métrique volt à droite. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
          <div className="flex flex-wrap gap-2">
            {study.tags.map((tag) => (
              <Badge key={tag} variant="tech">
                {tag}
              </Badge>
            ))}
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="font-mono text-[24px] leading-none text-accent">
              {study.metric.value}
            </span>
            <span className="micro text-faint">{study.metric.label}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
