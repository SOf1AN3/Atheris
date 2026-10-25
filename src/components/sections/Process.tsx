"use client";

import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { ProcessContent } from "@/content/types";

type ProcessProps = {
  process: ProcessContent;
};

type ProcessProgressProps = {
  /** Conteneur `relative` de l'<ol> : réfèrent de mesure de la progression. */
  containerRef: RefObject<HTMLDivElement | null>;
};

/**
 * M15 (§3.2) — ligne de progression liée au scroll, reprise du prototype
 * validé (`preview.html`) : `--p` ∈ [0, 1] pilote `scaleX` de `.track-fill`.
 *
 * Décision d'architecture : la directive `"use client"` est **par module** —
 * impossible d'extraire un composant client dans un fichier serveur. Le
 * fichier est donc entièrement client (le HTML reste servi par SSR) et la
 * logique est isolée dans ce composant, rendu comme voisin de l'`<ol>`.
 *
 * Règles mouvement (§3.4) : `prefers-reduced-motion` est lu **dans l'effet**
 * (jamais au premier rendu → pas de mismatch d'hydratation) et pose alors la
 * ligne pleine (`--p: 1`) d'emblée. Listener `passif`, cadencé par
 * `requestAnimationFrame`, retiré au démontage.
 */
function ProcessProgress({ containerRef }: ProcessProgressProps): ReactNode {
  const fillRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const fill = fillRef.current;
    const container = containerRef.current;
    if (fill === null || container === null) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const apply = (progress: number): void => {
      fill.style.setProperty("--p", progress.toFixed(3));
    };

    const measure = (): void => {
      frame = 0;
      // §3.4 — M15 : mouvement réduit → ligne complète immédiate.
      if (reducedMotion.matches) {
        apply(1);
        return;
      }
      const rect = container.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const denominator = viewportHeight * 0.75 + rect.height * 0.4;
      if (denominator <= 0) {
        apply(0);
        return;
      }
      const raw = (viewportHeight - rect.top) / denominator;
      apply(Math.min(1, Math.max(0, raw)));
    };

    const schedule = (): void => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    reducedMotion.addEventListener("change", schedule);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      reducedMotion.removeEventListener("change", schedule);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [containerRef]);

  return (
    <>
      {/* Filets de timeline (M15), décoratifs : posés AVANT l'<ol>, les
          `<li>` positionnés passent donc au-dessus (les numéraux en
          contour accrochent la ligne). Mobile : masqués — chaque étape
          porte son propre filet volt. */}
      <span
        aria-hidden="true"
        className="track left-0 right-0 top-[52px] hidden h-px md:block"
      />
      <span
        ref={fillRef}
        aria-hidden="true"
        className="track-fill left-0 right-0 top-[52px] hidden h-px md:block"
      />
    </>
  );
}

/**
 * Section « Process » (§2.5 n°07) — le moment « wow » de la page.
 * Composition asymétrique (§2.5) : index + filet pleine largeur, titre sur
 * 7 colonnes, description sur 5 alignée en bas ; densité **spectacle**
 * `clamp(112px, 16vh, 200px)` ; numéraux géants en contour (`.num`) + ligne
 * de progression qui se dessine au scroll (M15). `<ol>` pour les étapes,
 * hiérarchie h2 → h3 conservée.
 */
export function Process({ process }: ProcessProps): ReactNode {
  // Réfèrent de mesure partagé avec `ProcessProgress` (conteneur `relative`).
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    // DESIGN: `id="methode"` = ancre de la nav header.
    <section
      id="methode"
      aria-labelledby="process-title"
      className="py-[clamp(112px,16vh,200px)]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* EN-TÊTE ASYMÉTRIQUE — l'enveloppe devient une grille 12 col. à
            partir de `lg` : le rang de l'index garde le filet pleine
            largeur (§2.5), le `h2` occupe 7 colonnes, la `description`
            5 colonnes calée en bas (`self-end`). Les variantes enfant
            ciblent le DOM interne de `SectionHeading` (p#index, h2, p#desc)
            sans dupliquer aucun style ni aucune string i18n. */}
        <SectionHeading
          index="04"
          headingId="process-title"
          eyebrow={process.eyebrow}
          title={process.title}
          description={process.description}
          className="lg:grid lg:grid-cols-12 lg:gap-x-8 [&>p:first-of-type]:lg:col-span-12 [&>h2]:lg:col-span-7 [&>p:last-of-type]:lg:col-span-5 lg:[&>p:last-of-type]:self-end"
        />

        <div ref={containerRef} className="relative mt-14 md:mt-20">
          <ProcessProgress containerRef={containerRef} />

          <ol className="grid grid-cols-1 gap-12 md:grid-cols-4 md:gap-8">
            {process.steps.map((step, index) => (
              <Reveal
                key={step.n}
                as="li"
                delay={index * 0.08}
                // `.step` est requis par le survol du contour volt
                // (`globals.css` : `.step:hover .num`).
                className="step relative"
              >
                {/* Numéral géant en contour (§2.5) — purement décoratif :
                    le compteur lisible pour les lecteurs d'écran est le
                    titre d'étape qui suit. */}
                <div
                  aria-hidden="true"
                  className="num text-[clamp(64px,9vw,132px)]"
                >
                  {step.n}
                </div>
                {/* Mobile : pas de ligne de progression — un filet volt de
                    40px sous chaque numéral signale l'avancement. */}
                <div
                  aria-hidden="true"
                  className="mt-6 h-px w-10 bg-accent md:hidden"
                />
                <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em] text-fg md:mt-7">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted">
                  {step.description}
                </p>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
