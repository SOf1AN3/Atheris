import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { TestimonialsContent } from "@/content/types";

// DESIGN: stagger M2 (§5) appliqué manuellement par carte (0 / 80 / 160ms)
// via <Reveal delay> — même pattern que `Services` : chaque carte est un
// `motion.article` autonome (≤3 enfants animés respectés, M1+M2).
const CARD_DELAY_STEP = 0.08;

type TestimonialsProps = {
  testimonials: TestimonialsContent;
};

/**
 * Section « Témoignages » (§4.8) : SectionHeading centré + grille 3 colonnes
 * de cartes citation (§3.3) révélées en cascade (M1/M2).
 *
 * Carte : guillemet décoratif discret → citation (16px blanc, sans italique,
 * §4.8) → filet séparateur → avatar typographique + nom/rôle + badge
 * « Projet vérifié » (§3.2) → wordmark société (micro, `text-faint`).
 * Cartes non cliquables (aucun lien, aucun `tabIndex`).
 * Composant serveur — l'animation est portée par `Reveal` (client).
 */
export function Testimonials({ testimonials }: TestimonialsProps): ReactNode {
  return (
    // DESIGN: `id="temoignages"` = ancre utile (footer/liens futurs),
    // même convention que `Services` (`id="services"`).
    <section id="temoignages" className="py-[72px] md:py-24 lg:py-[120px]">
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <SectionHeading
          align="center"
          eyebrow={testimonials.eyebrow}
          title={testimonials.title}
          description={testimonials.description}
        />

        <div className="mt-12 grid grid-cols-1 gap-4 md:mt-16 md:grid-cols-3 md:gap-6">
          {testimonials.items.map((item, index) => (
            <Reveal
              key={item.id}
              as="article"
              delay={index * CARD_DELAY_STEP}
              className="flex h-full flex-col rounded-[20px] border border-line bg-surface p-7 md:p-8 transition-[translate,border-color,box-shadow] duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)] hover:-translate-y-1 hover:border-[rgba(59,130,246,0.4)] hover:shadow-[0_20px_40px_-16px_rgba(0,0,0,0.5)]"
            >
              {/* Guillemet ouvrant décoratif (§4.8) — `text-line` silencieux. */}
              <span
                aria-hidden="true"
                className="text-[32px] font-bold leading-none text-line"
              >
                {"\u201C"}
              </span>

              {/* Citation : droit, blanc 16px — italique interdit (§4.8). */}
              <blockquote className="mt-5 text-[16px] leading-relaxed text-fg">
                <p>{item.quote}</p>
              </blockquote>

              <div aria-hidden="true" className="mt-6 h-px bg-line" />

              {/* Identité : avatar typographique + nom/rôle + badge vérifié.
                  `flex-wrap` évite la compression du badge en mobile. */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold text-muted"
                >
                  {item.initials}
                </span>
                <div>
                  <p className="text-sm font-semibold text-fg">{item.name}</p>
                  <p className="text-[13px] text-muted">{item.role}</p>
                </div>
                <Badge variant="verified" className="ml-auto">
                  {item.verifiedLabel}
                </Badge>
              </div>

              {/* Wordmark société : marque typographique discrète (§4.8). */}
              <span className="mt-4 block text-[12px] font-medium uppercase tracking-[0.08em] text-faint">
                {item.company}
              </span>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
