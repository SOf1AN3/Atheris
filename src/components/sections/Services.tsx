import type { ReactNode } from "react";

import { CloudCog, Globe, MonitorCog, Smartphone } from "lucide-react";

import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ServiceIcon, ServicesContent } from "@/content/types";

// DESIGN: mapping lucide ciblé (§4.4) — icônes 28px, stroke 1.5, `text-muted`.
// L'accent est interdit sur les icônes décoratives (§2.3).
const ICONS = {
  globe: Globe,
  smartphone: Smartphone,
  monitor: MonitorCog,
  cloud: CloudCog,
} as const satisfies Record<ServiceIcon, typeof Globe>;

// DESIGN: stagger M2 (§5) appliqué manuellement par carte (0 / 80 / 160 / 240ms)
// via <Reveal delay> — pattern sûr côté hydratation : chaque carte est un
// `motion.article` autonome, sans dépendre de variants hérités d'un conteneur.
const CARD_DELAYS = [0, 0.08, 0.16, 0.24] as const;

type ServicesProps = {
  services: ServicesContent;
};

/**
 * Section « Pôles d'Expertise » (§4.4) : SectionHeading centré + grille 2×2
 * de cartes (§3.3) à hauteur égale, révélées en cascade (M1/M2).
 * Composant serveur — l'animation est portée par `Reveal` (client).
 */
export function Services({ services }: ServicesProps): ReactNode {
  return (
    // DESIGN: `id="services"` = ancre de la nav header.
    <section
      id="services"
      aria-labelledby="services-title"
      className="py-[72px] md:py-24 lg:py-[120px]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <SectionHeading
          align="center"
          headingId="services-title"
          eyebrow={services.eyebrow}
          title={services.title}
          description={services.description}
        />

        <div className="mx-auto mt-8 grid max-w-[1000px] grid-cols-1 gap-4 md:mt-12 md:grid-cols-2 md:gap-5 lg:mt-16 lg:gap-6">
          {services.items.map((item, index) => {
            const Icon: typeof Globe = ICONS[item.icon];

            return (
              <Reveal
                key={item.id}
                as="article"
                delay={CARD_DELAYS[index] ?? 0}
                className="group flex flex-col rounded-[20px] border border-line bg-surface p-6 md:p-8 transition-[translate,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-1 hover:border-[rgba(59,130,246,0.4)] hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]"
              >
                <Icon
                  aria-hidden="true"
                  className="size-7 text-muted"
                  strokeWidth={1.5}
                />
                <h3 className="mt-6 text-[22px] font-semibold leading-snug tracking-[-0.02em] text-fg">
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
