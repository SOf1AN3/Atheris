"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";

import { AnimatePresence, motion } from "framer-motion";
import { MoveHorizontal } from "lucide-react";

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

/** Seuil (px) distinguant un simple clic d'un TIRAGE du rail (décision Lead). */
const DRAG_THRESHOLD_PX = 6;

/**
 * Point d'ancrage le plus proche du scroll courant — début de la carte la
 * plus proche (cf. `scroll-snap-align: start` du rail).
 *
 * Calculé via les rectangles plutôt que `offsetLeft` : `.rail` n'est pas
 * positionné, les `offsetLeft` enfants seraient référencés à un ancêtre
 * commun éloigné.
 */
function nearestSnapTarget(rail: HTMLDivElement): number {
  const origin = rail.scrollLeft;
  const railLeft = rail.getBoundingClientRect().left;
  let best = origin;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const child of Array.from(rail.children)) {
    const position = origin + (child.getBoundingClientRect().left - railLeft);
    const distance = Math.abs(position - origin);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = position;
    }
  }
  return best;
}

/** État d'un tirage en cours : position de départ + scroll au départ. */
type RailDrag = {
  startX: number;
  startScrollLeft: number;
};

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

  /* ------------------------------- tirage à la souris du rail (souris only) */
  const railDragRef = useRef<RailDrag | null>(null);
  /** Pointer actuellement capturé par le rail (le snap est neutralisé). */
  const [railDragging, setRailDragging] = useState<boolean>(false);
  /** Dépassement du seuil 6px : le prochain `click` sera ANNULÉ. */
  const [dragged, setDragged] = useState<boolean>(false);

  const visibleItems = useMemo(
    () =>
      activeFilter === "all"
        ? cases.items
        : cases.items.filter((item) => item.categories.includes(activeFilter)),
    [activeFilter, cases.items],
  );

  /** Libellé localisé de la PREMIÈRE catégorie (micro-label de la carte). */
  function firstCategoryLabel(categories: readonly string[]): string | undefined {
    const first = categories[0];
    return first !== undefined && isFilterKey(first)
      ? cases.filters[first]
      : undefined;
  }

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

  /* ------------------------------------------------ tirage du rail à la souris
     Le scroll TACTILE reste natif : le drag ne s'active que pour la souris
     (`pointerType === "mouse"`, bouton gauche). Au-delà de 6px de déplacement,
     le `click` issu du même geste est annulé (clic ≠ tirage). */
  function handleRailPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    const rail = event.currentTarget;
    railDragRef.current = {
      startX: event.clientX,
      startScrollLeft: rail.scrollLeft,
    };
    setDragged(false);
    setRailDragging(true);
    rail.setPointerCapture(event.pointerId);
  }

  function handleRailPointerMove(event: PointerEvent<HTMLDivElement>): void {
    const start = railDragRef.current;
    if (start === null) return;

    const deltaX = event.clientX - start.startX;
    if (Math.abs(deltaX) > DRAG_THRESHOLD_PX) setDragged(true);
    event.currentTarget.scrollLeft = start.startScrollLeft - deltaX;
  }

  function handleRailPointerEnd(event: PointerEvent<HTMLDivElement>): void {
    const start = railDragRef.current;
    if (start === null) return;

    railDragRef.current = null;

    const rail = event.currentTarget;
    if (rail.hasPointerCapture(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId);
    }

    // Clic simple (aucun déplacement > seuil) : rien à animer, on rend la main
    // au navigateur — le scroll n'a pas bougé, donc aucun saut possible.
    if (!dragged) {
      setRailDragging(false);
      return;
    }

    // DROP À MOITIÉ D'UNE CARTE → animation vers l'ancre la plus proche.
    //
    // Pourquoi ne pas simplement retirer `scrollSnapType: "none"` ? Mesuré :
    // le navigateur applique alors le snap SANS l'interpoler (un snap
    // déclenché par un scroll programmatique n'est jamais animé) — saut de
    // 478 px en une seule frame. On anime donc nous-mêmes, en gardant le
    // snap neutralisé PENDANT l'animation (sinon il reprend la main et
    // annule notre transition), puis on le rend à la fin.
    const target = nearestSnapTarget(rail);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce || Math.abs(target - rail.scrollLeft) < 1) {
      setRailDragging(false);
      return;
    }

    rail.scrollTo({ left: target, behavior: "smooth" });

    let restored = false;
    const restoreSnap = (): void => {
      if (restored) return;
      restored = true;
      rail.removeEventListener("scrollend", restoreSnap);
      setRailDragging(false);
    };
    rail.addEventListener("scrollend", restoreSnap);
    // Filet : `scrollend` n'est pas universel, et ne se déclenche pas si le
    // navigateur estime le scroll déjà terminé.
    window.setTimeout(restoreSnap, 700);
  }

  // Capture : si le geste était un TIRAGE, on invalide le clic qui suit.
  // `dragged` est réinitialisé au `pointerdown` suivant.
  function handleRailClickCapture(event: MouseEvent<HTMLDivElement>): void {
    if (!dragged) return;
    event.preventDefault();
    event.stopPropagation();
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

          <div className="flex max-w-full shrink-0 items-center gap-3 self-start md:self-end">
            {/* Affordance « faites glisser » : PUREMENT décorative (aucun texte
                → zéro string i18n), visible desktop là où la souris existe. */}
            <span
              aria-hidden="true"
              className="hidden shrink-0 items-center text-faint md:inline-flex"
            >
              <MoveHorizontal className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div
              role="tablist"
              aria-label={filtersLabel}
              onKeyDown={handleTabKeyDown}
              className="hide-scroll inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1"
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
        </div>

        {/* Rail horizontal scroll-snap : `.rail` (globals.css) porte le
            flex + `overflow-x` + `scroll-snap-type: x mandatory`.
            TIRAGE souris (6px de seuil) : snap neutralisé pendant le geste,
            clic annulé au-delà du seuil, scroll tactile laissé natif. */}
        <div
          id="cases-grid"
          role="tabpanel"
          aria-labelledby={`filter-${activeFilter}`}
          tabIndex={0}
          onPointerDown={handleRailPointerDown}
          onPointerMove={handleRailPointerMove}
          onPointerUp={handleRailPointerEnd}
          onPointerCancel={handleRailPointerEnd}
          onClickCapture={handleRailClickCapture}
          style={railDragging ? { scrollSnapType: "none" } : undefined}
          className={cn(
            "rail no-select mt-12",
            // Poignée visuelle : desktop uniquement (le tactile garde son
            // propre affordance = scroll natif + doigt).
            "md:cursor-grab md:active:cursor-grabbing",
          )}
        >
          {/* DESIGN: les 4 filtres sont peuplés (content), pas d'état vide
              prévu — si un filtre venait à être vide, le mapping rend simplement
              rien et la structure reste valide (pas de message inventé). */}
          <AnimatePresence mode="popLayout">
            {visibleItems.map((item) => (
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
                  visitLabel={cases.visitLabel}
                  categoryLabel={firstCategoryLabel(item.categories)}
                  className="h-full"
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
