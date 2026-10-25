import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { Badge } from "@/components/ui/Badge";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { TestimonialsContent } from "@/content/types";

// DESIGN: stagger M2 (§3.2) appliqué par témoignage (0 / 80 / 160ms) via
// `<Reveal delay={index * 0.08}>` — chaque bloc est autonome (M1 + M2),
// ≤6 éléments animés et cascade totale ≤ 480ms respectés.
const CARD_DELAY_STEP = 0.08;

/**
 * Carte standard (DESIGN §2.6) : surface + hairline, rayon 20px, survol
 * lumière (bordure `line-2` + -3px, 240ms courbe unique) — jamais d'ombre
 * noire. `card` = marqueur de carte du prototype ; `spot` = spotlight
 * suiveur (M11). Les classes Tailwind explicites doublent le rendu (les
 * styles `card` du prototype ne sont pas encore portés dans `globals.css`).
 */
const CARD_CLASSES =
  "card spot rounded-[20px] border border-line bg-surface transition-[border-color,translate] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-line-2";

type TestimonialsProps = {
  testimonials: TestimonialsContent;
};

/**
 * Section « Témoignages » `05` — densité AÉRÉE (DESIGN §2.3).
 *
 * Composition 12 colonnes asymétrique (jamais `align="center"`) :
 * - col 7 : citation éditoriale `items[0]` en `.voix` (serif italique 24→36px)
 *   + guillemets, puis `<figcaption>` filet `border-t` : avatar typographique
 *   rond, nom/rôle, `<Badge variant="verified">` aligné à droite ;
 * - col 5 : les 2 autres témoignages en cartes compactes (citation 15px
 *   `fg-2`, filet séparateur, pied avatar + nom/rôle + `company` en `.micro`).
 *
 * Cartes non cliquables (aucun lien, aucun `tabIndex`). Zéro string en dur :
 * tout vient du dict `testimonials`. Composant serveur — l'animation est
 * portée par `Reveal` (client), sans `useReducedMotion` local.
 */
export function Testimonials({ testimonials }: TestimonialsProps): ReactNode {
  // Edge case : `items` vide → aucun rendu d'item, aucun crash.
  const featured = testimonials.items[0];
  const others = testimonials.items.slice(1);

  return (
    // DESIGN: `id="temoignages"` = ancre utile (footer/liens),
    // même convention que `Services` / `Faq` / `Contact`.
    <section
      id="temoignages"
      aria-labelledby="testimonials-title"
      className="py-[clamp(96px,14vh,176px)]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <SectionHeading
          index="06"
          headingId="testimonials-title"
          eyebrow={testimonials.eyebrow}
          title={testimonials.title}
          description={testimonials.description}
        />

        {/* Grille 12 col : citation `span 7` / cartes compactes `span 5`. */}
        <div className="mt-12 grid grid-cols-1 gap-6 md:mt-16 lg:grid-cols-12 lg:gap-8">
          {featured ? (
            <Reveal as="figure" className="m-0 lg:col-span-7">
              {/* Citation éditoriale : la rupture d'échelle typographique (§2.5). */}
              <blockquote className="voix text-[clamp(1.5rem,2.7vw,2.25rem)] leading-[1.35] tracking-[-0.02em] text-fg">
                <span aria-hidden="true">{"\u201C"}</span>
                {featured.quote}
                <span aria-hidden="true">{"\u201D"}</span>
              </blockquote>

              {/* Identité : filet hairline + avatar typographique + badge. */}
              <figcaption className="mt-8 flex flex-wrap items-center gap-4 border-t border-line pt-7">
                <span
                  aria-hidden="true"
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[13px] text-muted"
                >
                  {featured.initials}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-fg">{featured.name}</p>
                  <p className="text-[13px] text-muted">{featured.role}</p>
                </div>
                <Badge variant="verified" className="ml-auto">
                  {featured.verifiedLabel}
                </Badge>
              </figcaption>
            </Reveal>
          ) : null}

          {others.length > 0 ? (
            <div className="flex flex-col gap-4 lg:col-span-5">
              {others.map((item, index) => (
                <Reveal
                  key={item.id}
                  as="article"
                  delay={(index + 1) * CARD_DELAY_STEP}
                  className={`${CARD_CLASSES} flex flex-1 flex-col p-6`}
                >
                  <blockquote className="text-[15px] leading-[1.6] text-fg-2">
                    {item.quote}
                  </blockquote>

                  <div aria-hidden="true" className="mt-5 h-px bg-line" />

                  {/* Pied : avatar + nom/rôle + wordmark société à droite. */}
                  <div className="mt-5 flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-mono text-[12px] text-muted"
                    >
                      {item.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fg">
                        {item.name}
                      </p>
                      <p className="text-[13px] text-muted">{item.role}</p>
                    </div>
                    <span className="micro ml-auto shrink-0 text-faint">
                      {item.company}
                    </span>
                  </div>
                </Reveal>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
