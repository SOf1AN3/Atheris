import type { ReactNode } from "react";

import { CloudCog, Globe, MonitorCog, Smartphone } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ServiceIcon, ServicesContent } from "@/content/types";
import { cn } from "@/lib/utils";

// DESIGN: mapping lucide ciblé — icônes 28px, stroke 1.5, `text-muted`.
// L'accent est interdit sur les icônes décoratives (§2.1, règle 3).
const ICONS = {
  globe: Globe,
  smartphone: Smartphone,
  monitor: MonitorCog,
  cloud: CloudCog,
} as const satisfies Record<ServiceIcon, typeof Globe>;

// DESIGN §2.5 — grille ASYMÉTRIQUE 7/5 puis 5/7 : jamais 4 cartes clones.
// Au-delà de 4 items (contenu actuel), repli sur une demi-largeur neutre.
const CARD_SPANS: readonly string[] = [
  "lg:col-span-7",
  "lg:col-span-5",
  "lg:col-span-5",
  "lg:col-span-7",
];
const FALLBACK_SPAN = "lg:col-span-6";

// DESIGN §2.6 — carte standard : hairline → `line-2`, lift -3px, ombre
// `--shadow-lift`, 240ms sur la courbe UNIQUE `cubic-bezier(0.16,1,0.3,1)`.
// Pas de `.spot` ici : composant SERVEUR, aucune logique JS de souris (règle 5).
const CARD_CLASS =
  "group flex flex-col rounded-[20px] border border-line bg-surface p-7 md:p-8 transition-[translate,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-line-2 hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]";

/** Index interne `01 / 04` — décoratif (aria-hidden), sérigraphie mono. */
function cardIndexLabel(position: number, total: number): string {
  return `${String(position + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
}

type ServicesProps = {
  services: ServicesContent;
};

/**
 * Section « Pôles d'Expertise » (`01`) — composition asymétrique :
 * titre à gauche (col 7) / description à droite (col 5, `lg:self-end`),
 * puis grille 12 colonnes 7-5 / 5-7 de cartes révélées en cascade (M1/M2).
 * Composant serveur — l'animation est portée par `Reveal` (client).
 */
export function Services({ services }: ServicesProps): ReactNode {
  const total = services.items.length;

  return (
    // DESIGN: `id="services"` = ancre de la nav header. Densité NORMALE (§2.3).
    <section
      id="services"
      aria-labelledby="services-title"
      className="py-[clamp(80px,10vh,128px)]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* En-tête 7/5 : titre + index `01` à gauche, lead à droite. */}
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-10">
          <div className="lg:col-span-7">
            <SectionHeading
              align="left"
              index="01"
              headingId="services-title"
              eyebrow={services.eyebrow}
              title={services.title}
            />
          </div>
          <p className="max-w-[46ch] text-[17px] leading-[1.65] text-muted lg:col-span-5 lg:self-end lg:pb-1">
            {services.description}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:mt-14 md:grid-cols-2 md:gap-5 lg:mt-16 lg:grid-cols-12 lg:gap-6">
          {services.items.map((item, index) => {
            const Icon: typeof Globe = ICONS[item.icon];

            return (
              <Reveal
                key={item.id}
                as="article"
                // DESIGN M2 — stagger 80ms par carte.
                delay={index * 0.08}
                className={cn(CARD_SPANS[index] ?? FALLBACK_SPAN, CARD_CLASS)}
              >
                <div className="flex items-start justify-between gap-4">
                  <Icon
                    aria-hidden="true"
                    className="size-7 text-muted"
                    strokeWidth={1.5}
                  />
                  <span aria-hidden="true" className="micro text-faint">
                    {cardIndexLabel(index, total)}
                  </span>
                </div>

                <h3 className="h-display mt-6 text-[22px] text-fg">
                  {item.title}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  {item.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <Badge key={tag} variant="tech">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
