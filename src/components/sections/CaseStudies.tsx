"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { AnimatePresence, motion } from "framer-motion";

import { CaseStudyCard } from "@/components/sections/CaseStudyCard";
import { SectionHeading } from "@/components/ui/SectionHeading";
import type { CasesContent } from "@/content/types";
import { cn } from "@/lib/utils";

// DESIGN §2.5 — section `02` : titre à gauche + rail de filtres pills à
// droite, puis RAIL HORIZONTAL scroll-snap de grandes cartes (signalement
// d'affordance de défilement : le 3e/4e élément déborde volontairement).
type CaseStudiesProps = {
  cases: CasesContent;
  /** `aria-label` du `tablist` (fourni par `a11y.filtersLabel` à l'assemblage). */
  filtersLabel: string;
};

const FILTERS = ["all", "web", "mobile", "ai"] as const;
type FilterKey = (typeof FILTERS)[number];

// DESIGN §3.1 — courbe UNIQUE du site : aucun spring, aucun rebond.
const EASE_OBSIDIAN: [number, number, number, number] = [0.16, 1, 0.3, 1];

// DESIGN §2.5 — largeur d'une carte du rail : 85% mobile, 46% desktop →
// le rail déborde toujours d'au moins une carte = on peut faire défiler.
const RAIL_ITEM_CLASS = "w-[85%] shrink-0 sm:w-[62%] lg:w-[46%]";

/** Garantit une clé de `cases.filters` avant indexation (i18n strict). */
function isFilterKey(value: string): value is FilterKey {
  return FILTERS.some((filter) => filter === value);
}

/**
 * Section « Projets & Réalisations » (`02`) : rail d'onglets accessibles
 * (roving tabindex, flèches/Home/End, indicateur glissant M5) + rail
 * horizontal filtré avec animation Framer Motion (M7 fade/scale).
 */
export function CaseStudies({
  cases,
  filtersLabel,
}: CaseStudiesProps): ReactNode {
  // DESIGN: aucun branchement reduced-motion au premier rendu (hydration) —
  // délégué à MotionConfig(reducedMotion="user").
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

  // DESIGN §3.5 — navigation ← → Home/End : « activation on focus »
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
    // DESIGN: `id="realisations"` = ancre de la nav header. Densité NORMALE.
    <section
      id="realisations"
      aria-labelledby="cases-title"
      className="py-[clamp(80px,10vh,128px)]"
    >
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* En-tête asymétrique : index `02` + titre à gauche,
            rail de filtres pills aligné en bas à droite (md:self-end). */}
        <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between md:gap-10">
          <SectionHeading
            align="left"
            index="02"
            headingId="cases-title"
            eyebrow={cases.eyebrow}
            title={cases.title}
            description={cases.description}
            className="md:flex-1"
          />

          <div
            role="tablist"
            aria-label={filtersLabel}
            onKeyDown={handleTabKeyDown}
            className="hide-scroll inline-flex max-w-full shrink-0 gap-1 self-start overflow-x-auto rounded-full border border-line bg-surface p-1 md:self-end"
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
                    // §2.7 : cible ≥44px (`min-h-11`). État actif = fond volt
                    // + texte `ink` (15:1) — jamais de blanc sur volt.
                    "relative min-h-11 shrink-0 rounded-full px-[18px] py-2.5 text-[15px] font-medium transition-colors duration-150",
                    isActive
                      ? "font-semibold text-ink"
                      : "text-muted hover:text-fg",
                  )}
                >
                  {/* Indicateur animé (M5) : glissement 240ms, courbe unique.
                      Le snap reduced-motion est neutralisé par MotionConfig. */}
                  {isActive ? (
                    <motion.span
                      aria-hidden="true"
                      layoutId="cases-tab-indicator"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={{ duration: 0.24, ease: EASE_OBSIDIAN }}
                    />
                  ) : null}
                  <span className="relative z-10">{cases.filters[filter]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Rail horizontal scroll-snap : `.rail` (globals.css) porte le
            flex + `overflow-x` + `scroll-snap-type: x mandatory`. */}
        <div
          id="cases-grid"
          role="tabpanel"
          aria-labelledby={`filter-${activeFilter}`}
          tabIndex={0}
          className="rail mt-12"
        >
          {/* DESIGN: les 4 filtres sont peuplés (content), pas d'état vide
              prévu — si un filtre venait à être vide, le mapping rend simplement
              rien et la structure reste valide (pas de message inventé). */}
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item) => {
              const categoryLabel = isFilterKey(item.category)
                ? cases.filters[item.category]
                : undefined;

              return (
                // DESIGN: M7 — entrée 180ms (opacity + scale 0.98→1),
                // sortie fade 140ms ; `popLayout` évite le reflow pendant l'exit.
                <motion.div
                  key={item.id}
                  layout
                  className={RAIL_ITEM_CLASS}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{
                    opacity: 0,
                    transition: { duration: 0.14, ease: EASE_OBSIDIAN },
                  }}
                  transition={{ duration: 0.18, ease: EASE_OBSIDIAN }}
                >
                  <CaseStudyCard
                    study={item}
                    categoryLabel={categoryLabel}
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
