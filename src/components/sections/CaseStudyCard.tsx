import type { ReactNode } from "react";

import { CaseStudyMockup } from "@/components/sections/CaseStudyMockups";
import { Badge } from "@/components/ui/Badge";
import type { CaseStudy } from "@/content/types";
import { cn } from "@/lib/utils";

type CaseStudyCardProps = {
  study: CaseStudy;
  /** Variante large (grille asymétrique §4.5) : titre H3 24px au lieu de 18px. */
  featured?: boolean;
  /** Classes additionnelles (ex. `h-full` pour aligner les rangs de grille). */
  className?: string;
};

/**
 * Carte d'étude de cas (§4.5) : mockup produit 16:9 en haut (zoom `scale(1.02)`
 * au hover) puis badges tech, titre, description et métrique business en exergue.
 * Carte NON interactive (pas de page détail) — le hover reste purement visuel.
 */
export function CaseStudyCard({
  study,
  featured = false,
  className,
}: CaseStudyCardProps): ReactNode {
  return (
    // DESIGN: §3.3 — surface `line` → `accent-soft` au hover, `translateY(-4px)`,
    // shadow-card-hover, 260ms cubic-bezier(0.4,0,0.2,1). Note : cible `translate`
    // (et non `transform`) — bug connu de Tailwind v4.
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface transition-[translate,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-1 hover:border-[rgba(59,130,246,0.4)] hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]",
        className,
      )}
    >
      {/* Zoom du mockup au hover : l'enveloppe porte la transition pour ne pas
          modifier l'API de `CaseStudyMockup` (restée `{ kind }`). */}
      <div className="overflow-hidden">
        {/* DESIGN: v4 — scale compile en propriété « scale » */}
        <div className="transition-all duration-[400ms] ease-out group-hover:scale-[1.02]">
          <CaseStudyMockup kind={study.mockup} />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-6 md:p-7">
        <div className="flex flex-wrap gap-2">
          {study.tags.map((tag) => (
            <Badge key={tag} variant="tech">
              {tag}
            </Badge>
          ))}
        </div>

        <h3
          className={cn(
            "mt-4 font-semibold tracking-[-0.015em] text-fg",
            featured ? "text-[20px] lg:text-[24px]" : "text-[18px]",
          )}
        >
          {study.title}
        </h3>

        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          {study.description}
        </p>

        {/* Métrique business en exergue (§4.5) — point focal secondaire. */}
        <div className="mt-5 flex items-baseline gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
          <span className="text-[18px] font-bold tracking-tight text-fg">
            {study.metric.value}
          </span>
          <span className="text-xs text-muted">{study.metric.label}</span>
        </div>
      </div>
    </article>
  );
}
