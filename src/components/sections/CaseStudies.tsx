"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { CaseStudyCard } from "@/components/sections/CaseStudyCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { CasesContent } from "@/content/types";
import { cn } from "@/lib/utils";

// DESIGN: §4.5 + §3.5 — rail d'onglets de filtre (Tous / Web & SaaS / Mobile /
// IA & Médias) pilotant une grille asymétrique 12 colonnes (7 / 5 / 6 / 6).
type CaseStudiesProps = {
  cases: CasesContent;
  /** `aria-label` du `tablist` (fourni par `a11y.filtersLabel` à l'assemblage). */
  filtersLabel: string;
};

const FILTERS = ["all", "web", "mobile", "ai"] as const;
type FilterKey = (typeof FILTERS)[number];

// DESIGN: M5 (§5) — indicateur d'onglet actif, glissement 240ms,
// cubic-bezier(0.4, 0, 0.2, 1). Aucun spring rebondissant (règle dure §5).
const EASE_STANDARD: [number, number, number, number] = [0.4, 0, 0.2, 1];

/** Spans de la grille asymétrique §4.5 : featured 7, suivante 5, puis 6/6. */
function spanForIndex(index: number): string {
  if (index === 0) return "lg:col-span-7";
  if (index === 1) return "lg:col-span-5";
  return "lg:col-span-6";
}

/**
 * Section « Projets & Réalisations » (§4.5) : en-tête + rail d'onglets
 * accessibles (roving tabindex, flèches/Home/End) et grille asymétrique
 * filtrée avec animation Framer Motion (M5 indicateur + M7 fade/scale).
 */
export function CaseStudies({
  cases,
  filtersLabel,
}: CaseStudiesProps): ReactNode {
  const reducedMotion = useReducedMotion() === true;
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const visibleItems = useMemo(
    () =>
      activeFilter === "all"
        ? cases.items
        : cases.items.filter((item) => item.category === activeFilter),
    [activeFilter, cases.items],
  );

  // Focus des onglets pour le déplacement clavier (tabIndex roving).
  const tabRefs = useRef<Partial<Record<FilterKey, HTMLButtonElement | null>>>(
    {},
  );

  // DESIGN: §3.5 — navigation ← → Home/End : « activation on focus »
  // (déplace le focus ET sélectionne l'onglet).
  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const currentIndex = FILTERS.indexOf(activeFilter);
    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % FILTERS.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + FILTERS.length) % FILTERS.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = FILTERS.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextFilter = FILTERS[nextIndex];
    setActiveFilter(nextFilter);
    tabRefs.current[nextFilter]?.focus();
  }

  return (
    // DESIGN: `id="realisations"` = ancre de la nav header.
    <section
      id="realisations"
      aria-labelledby="cases-title"
      className="py-[72px] md:py-24 lg:py-[120px]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            align="left"
            headingId="cases-title"
            eyebrow={cases.eyebrow}
            title={cases.title}
            description={cases.description}
          />

          {/* Rail d'onglets : sous le titre en mobile (scroll-x masqué),
              aligné en bas à droite en desktop.
              DESIGN: masque de dégradé aux extrémités volontairement omis
              (rail fit-to-content, fade permanent risque d'altérer la
              bordure) — arbitrage revue. */}
          <div
            role="tablist"
            aria-label={filtersLabel}
            onKeyDown={handleTabKeyDown}
            className="inline-flex max-w-full shrink-0 gap-2 self-start overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:self-end"
          >
            {FILTERS.map((filter) => {
              const isActive = filter === activeFilter;

              return (
                <button
                  key={filter}
                  id={`filter-${filter}`}
                  ref={(node) => {
                    tabRefs.current[filter] = node;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls="cases-grid"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveFilter(filter)}
                  className={cn(
                    // §6.10 : min-h-11 (44px) = cible tactile. §3.5 :
                    // padding 10px/18px. §2.2 : text-[15px] + font-semibold
                    // (état actif) = dérogation contraste 3.7:1 sur bg-accent.
                    // `text-[15px]` ne fixe que la taille — la couleur reste
                    // pilotée par l'état (`text-muted` / `text-white`).
                    "relative shrink-0 rounded-lg px-[18px] py-2.5 min-h-11 text-[15px] font-medium transition-colors duration-150",
                    isActive
                      ? "font-semibold text-white"
                      : "text-muted hover:text-fg",
                  )}
                >
                  {/* Indicateur animé (M5) : premier enfant, derrière le texte. */}
                  {isActive ? (
                    reducedMotion ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 rounded-lg bg-accent"
                      />
                    ) : (
                      <motion.span
                        aria-hidden="true"
                        layoutId="cases-tab-indicator"
                        className="absolute inset-0 rounded-lg bg-accent"
                        transition={{ duration: 0.24, ease: EASE_STANDARD }}
                      />
                    )
                  ) : null}
                  <span className="relative z-10">{cases.filters[filter]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Grille asymétrique : 1 colonne (mobile), 2 (tablette), 12 avec
            spans 7/5/6/6 en desktop (§4.5). */}
        <div
          id="cases-grid"
          role="tabpanel"
          aria-labelledby={`filter-${activeFilter}`}
          tabIndex={0}
          className="mt-10 grid grid-cols-1 gap-6 md:mt-14 md:grid-cols-2 lg:grid-cols-12"
        >
          {/* DESIGN: les 4 filtres sont peuplés (content), pas d'état vide
              prévu — si un filtre venait à être vide, le mapping rend simplement
              rien et la structure reste valide (pas de message inventé). */}
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item, index) => {
              // `featured` (content) pilote la carte hero ; repli sur l'index 0
              // = comportement identique sur les données actuelles.
              const isFeatured = item.featured || index === 0;

              return (
                // DESIGN: M7 (§5) — entrée 180ms ease-out (opacity + scale
                // 0.98→1), sortie fade 140ms. `popLayout` évite le reflow pendant
                // l'exit ; reduced-motion → aucun scale ni layout (état final).
                <motion.div
                  key={item.id}
                  layout={!reducedMotion}
                  className={cn(isFeatured ? "lg:col-span-7" : spanForIndex(index))}
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.14, ease: "easeOut" },
                  }}
                  transition={{ duration: 0.18, ease: "easeOut" }}
                >
                  <CaseStudyCard
                    study={item}
                    featured={isFeatured}
                    className="h-full"
                  />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
