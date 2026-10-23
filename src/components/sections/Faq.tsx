"use client";

import { useState } from "react";
import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { cn } from "@/lib/utils";
import type { FaqContent } from "@/content/types";

type FaqProps = {
  faq: FaqContent;
};

/**
 * Section « FAQ » (§4.9 + §3.9) : split desktop (SectionHeading sticky `span 2`
 * / accordéon `span 3`), empilé mobile. Accordéon contrôlé : un seul élément
 * ouvert à la fois, premier fermé au chargement (`openId === null`).
 *
 * Ouverture (M8, 220ms ease-out) : `grid-template-rows 0fr ↔ 1fr` — aucune
 * mesure JS, robuste au contenu dynamique (alternative Framer `height: auto`
 * écartée pour cette raison). `prefers-reduced-motion` neutralise la transition
 * via `motion-reduce:transition-none` (§6.8).
 *
 * A11y (§6) : `<h3>` par question (hiérarchie h2 → h3 sans saut), bouton
 * `type="button"` avec `aria-expanded` / `aria-controls`, réponse en
 * `role="region"` reliée par `aria-labelledby`. Zéro string en dur (i18n).
 *
 * Edge cases : `faq.items` vide → conteneur rendu vide, aucun rendu d'item,
 * aucun crash ; `openId` orphelin → tout replié (le rendu dérive de
 * `openId === item.id`).
 */
export function Faq({ faq }: FaqProps): ReactNode {
  // DESIGN: groupe contrôlé §3.9 — un seul ouvert à la fois ; `null` = tout replié.
  const [openId, setOpenId] = useState<string | null>(null);

  const handleToggle = (itemId: string): void => {
    setOpenId((current) => (current === itemId ? null : itemId));
  };

  return (
    <section
      id="faq"
      aria-labelledby="faq-title"
      className="py-[72px] md:py-24 lg:py-[120px]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* Split §4.9 : titre `span 2` / accordéon `span 3` en desktop. */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-16">
          {/* Colonne gauche : SectionHeading left + sticky sans JS (choix §4.9). */}
          <div className="lg:col-span-2 lg:sticky lg:top-28 lg:self-start">
            <SectionHeading
              align="left"
              headingId="faq-title"
              eyebrow={faq.eyebrow}
              title={faq.title}
              description={faq.description}
            />
          </div>

          {/* Colonne droite : accordéon — un seul `Reveal` sur le bloc (M1).
              Edge case `items` vide : conteneur rendu vide, sans filet orphelin. */}
          <div className="mt-8 lg:col-span-3 lg:mt-0">
            {faq.items.length > 0 ? (
              <Reveal>
                {/* Séparateurs : `border-t` par item + `border-b` final pour fermer. */}
                <div className="border-b border-line">
                  {faq.items.map((item) => {
                    const isOpen = openId === item.id;
                    const questionId = `faq-q-${item.id}`;
                    const answerId = `faq-a-${item.id}`;

                    return (
                      <div key={item.id} className="border-t border-line">
                        <h3 className="m-0">
                          <button
                            type="button"
                            id={questionId}
                            aria-expanded={isOpen}
                            aria-controls={answerId}
                            onClick={() => handleToggle(item.id)}
                            className="flex w-full items-center justify-between gap-4 py-6 text-left"
                          >
                            <span className="text-[17px] font-semibold leading-snug text-fg">
                              {item.question}
                            </span>

                            {/* Chevron inline (pattern SVG du projet, pas de lucide). */}
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className={cn(
                                "size-5 shrink-0 text-muted transition-all duration-[220ms] motion-reduce:transition-none",
                                isOpen && "rotate-180",
                              )}
                              fill="none"
                            >
                              <path
                                d="M6 9l6 6 6-6"
                                stroke="currentColor"
                                strokeWidth={1.75}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </h3>

                        {/* DESIGN: M8 implémenté via grid-rows (0fr↔1fr) — plus robuste
                            que height:auto en mesure JS. Reduced-motion neutralise la
                            transition (§6.8) sans casser l'ouverture. */}
                        <div
                          id={answerId}
                          role="region"
                          aria-labelledby={questionId}
                          aria-hidden={!isOpen}
                          className="grid transition-[grid-template-rows] duration-[220ms] ease-out motion-reduce:transition-none"
                          style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                        >
                          <div className="overflow-hidden">
                            <p className="max-w-[48rem] pb-6 pr-10 text-[15px] leading-relaxed text-muted">
                              {item.answer}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Reveal>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
