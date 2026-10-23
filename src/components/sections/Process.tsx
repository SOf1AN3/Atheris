import type { ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ProcessContent } from "@/content/types";

type ProcessProps = {
  process: ProcessContent;
};

/**
 * Section « Notre Processus de Développement » (§4.7) : SectionHeading centré
 * (§3.4) + timeline de 4 étapes — ligne horizontale à partir de `md`,
 * timeline verticale en dessous. Composant serveur : l'animation (M1 +
 * stagger M2, 4 enfants ≤ 6) est portée par `Reveal` (client), un par `<li>`.
 */
export function Process({ process }: ProcessProps): ReactNode {
  return (
    // DESIGN: `id="methode"` = ancre de la nav header (§4.7).
    // Rythme vertical §2.5 : 72px mobile / 96px tablette / 120px desktop.
    <section id="methode" className="py-[72px] md:py-24 lg:py-[120px]">
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <SectionHeading
          align="center"
          eyebrow={process.eyebrow}
          title={process.title}
          description={process.description}
        />

        {/* DESIGN §4.7 — filets de timeline, décoratifs, DERRIÈRE les pastilles.
            Les pastilles font 40px → centre à 20px : `top-5` (ligne horizontale
            desktop) et `left-5` (ligne verticale mobile) les alignent exactement.
            Fond opaque `bg-ink` + `z-10` sur la pastille : le filet s'arrête
            visuellement sous chaque pastille. Ordre DOM : les filets sont posés
            AVANT les étapes, chaque `<li>` positionné vient donc par-dessus. */}
        <div className="relative mt-12 md:mt-16">
          <span
            aria-hidden="true"
            className="absolute left-0 right-0 top-5 hidden h-px bg-line md:block"
          />
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-5 top-0 w-px bg-line md:hidden"
          />

          <ol className="grid grid-cols-1 gap-10 md:grid-cols-4 md:gap-8">
            {process.steps.map((step, index) => (
              <Reveal
                key={step.n}
                as="li"
                delay={index * 0.08}
                className="group relative flex gap-2 md:block"
              >
                {/* DESIGN §4.7 — pastille numérotée. L'accent (§2.3) n'apparaît
                    QU'au survol de l'étape : `group` sur le `<li>` + `group-hover`
                    sur la pastille. Aucun accent au repos. */}
                <span className="relative z-10 flex size-10 items-center justify-center rounded-full border border-line bg-ink text-[13px] font-semibold text-muted transition-colors duration-200 group-hover:border-accent group-hover:bg-accent group-hover:text-white">
                  {step.n}
                </span>
                {/* Mobile : colonne de droite à côté de la pastille (§4.7,
                    contenu décalé). Desktop : bloc sous la pastille. */}
                <div>
                  {/* DESIGN §2.5 — desktop : 24px pastille→titre (`md:mt-6`,
                      valeur d'échelle) ; mobile : titre aligné en tête de la
                      colonne de droite (`mt-1`). */}
                  <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-fg md:mt-6">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-muted md:mt-3">
                    {step.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
