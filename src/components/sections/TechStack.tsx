"use client";

import { useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { SectionHeading } from "@/components/ui/SectionHeading";
import type { TechGroupId, TechStackContent } from "@/content/types";
import { cn } from "@/lib/utils";

// DESIGN: §4.6 + §3.5 (variante « rail underline ») — rail d'onglets
// Frontend / Backend & Data / Mobile & Desktop / Cloud & DevOps pilotant une
// grille de pastilles « tech » premium (2 → 4 colonnes).
type TechStackProps = {
  techStack: TechStackContent;
  /** `aria-label` du `tablist` (fourni par l'assemblage de la page). */
  tabsLabel: string;
};

// DESIGN: M5 (§5) — indicateur d'onglet actif, glissement 240ms,
// cubic-bezier(0.4, 0, 0.2, 1). Aucun spring rebondissant (règle dure §5).
const EASE_STANDARD: [number, number, number, number] = [0.4, 0, 0.2, 1];

// DESIGN: §4.6 — « 8 items max par onglet ». Le contenu actuel en a 7 ; la
// garde `slice(0, 8)` protège si le content venait à grandir au-delà de la
// spec (la grille reste compacte, pas de panneau surchargé).
const MAX_ITEMS_PER_GROUP = 8;

/**
 * Section « Stack Technique » (§4.6) : en-tête + rail d'onglets style
 * « underline » (trait bas `2px` accent, §3.5 variante rail) accessible
 * (roving tabindex, flèches/Home/End, activation on focus) et grille de
 * pastilles non interactives avec transition de panneau M6.
 */
export function TechStack({
  techStack,
  tabsLabel,
}: TechStackProps): ReactNode {
  const reducedMotion = useReducedMotion() === true;

  // Défensif : `groups[0]` absent (jamais dans le content actuel) → repli
  // "frontend" pour ne jamais initialiser un id orphelin.
  const [activeId, setActiveId] = useState<TechGroupId>(
    techStack.groups[0]?.id ?? "frontend",
  );

  // Focus des onglets pour le déplacement clavier (tabIndex roving).
  const tabRefs = useRef<
    Partial<Record<TechGroupId, HTMLButtonElement | null>>
  >({});

  // DESIGN: §3.5 — navigation ← → Home/End : « activation on focus »
  // (déplace le focus ET sélectionne l'onglet). Pattern repris de
  // CaseStudies (variante pill) adapté au rail underline.
  function handleTabKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const { groups } = techStack;
    if (groups.length === 0) return;

    const currentIndex = groups.findIndex((group) => group.id === activeId);
    // Repli silencieux si l'id actif n'est plus dans la liste (contenu
    // remonté autrement) : on part de la première position.
    const baseIndex = currentIndex === -1 ? 0 : currentIndex;

    let nextIndex: number;

    switch (event.key) {
      case "ArrowRight":
        nextIndex = (baseIndex + 1) % groups.length;
        break;
      case "ArrowLeft":
        nextIndex = (baseIndex - 1 + groups.length) % groups.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = groups.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    // `nextIndex` ∈ [0, groups.length) par construction (modulo / bornes).
    const nextGroup = groups[nextIndex];
    setActiveId(nextGroup.id);
    tabRefs.current[nextGroup.id]?.focus();
  }

  // Défense : si `activeId` est introuvable dans `groups`, repli sur le
  // premier groupe — jamais de crash, jamais de panneau orphelin. Si
  // `groups` est vide (défensif), `activeGroup` vaut `null` → panneau rendu
  // vide mais structure ARIA toujours valide.
  const activeGroup =
    techStack.groups.find((group) => group.id === activeId) ??
    techStack.groups[0] ??
    null;

  return (
    // DESIGN: `id="technologies"` = ancre de la nav header.
    <section id="technologies" className="py-[72px] md:py-24 lg:py-[120px]">
      <div className="mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        <SectionHeading
          align="left"
          eyebrow={techStack.eyebrow}
          title={techStack.title}
          description={techStack.description}
        />

        {/* Rail underline : scroll-x autorisé en mobile (4 onglets dépassent
            360px). DESIGN: masque de dégradé aux extrémités volontairement
            omis — le trait bas `border-b` traverserait le fade et l'indicateur
            accent doit rester net de bord à bord (arbitrage aligné CaseStudies).
            `scrollbar-width: none` + webkit masquent la barre native. */}
        <div
          role="tablist"
          aria-label={tabsLabel}
          onKeyDown={handleTabKeyDown}
          className="mt-10 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none] md:mt-12 [&::-webkit-scrollbar]:hidden"
        >
          {techStack.groups.map((group) => {
            const isActive = group.id === activeId;

            return (
              <button
                key={group.id}
                id={`tech-tab-${group.id}`}
                ref={(node) => {
                  tabRefs.current[group.id] = node;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="tech-panel"
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveId(group.id)}
                className={cn(
                  // §6.10 : min-h-11 (44px) = cible tactile. §3.5 variante
                  // underline : texte seul, pas de fond pill — l'accent est
                  // porté exclusivement par le trait bas (§2.3).
                  "relative min-h-11 whitespace-nowrap px-4 pb-3.5 pt-3 text-[15px] font-medium transition-colors duration-150",
                  isActive ? "text-fg font-semibold" : "text-muted hover:text-fg",
                )}
              >
                {/* Indicateur M5 : premier enfant du bouton, sous le texte
                    (z-10). Reduced-motion → trait fixe, sans layout animé. */}
                {isActive ? (
                  reducedMotion ? (
                    <span
                      aria-hidden="true"
                      className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                    />
                  ) : (
                    <motion.span
                      aria-hidden="true"
                      layoutId="tech-tab-indicator"
                      className="absolute -bottom-px left-0 right-0 h-0.5 bg-accent"
                      transition={{ duration: 0.24, ease: EASE_STANDARD }}
                    />
                  )
                ) : null}
                <span className="relative z-10">{group.label}</span>
              </button>
            );
          })}
        </div>

        {/* Panneau : tabpanel focusable (pattern WAI-ARIA recommandé) — le
            focus ring global `:focus-visible` (globals.css) s'applique déjà,
            les classes outline ci-dessous le complètent visuellement. */}
        <div
          id="tech-panel"
          role="tabpanel"
          aria-labelledby={activeGroup ? `tech-tab-${activeGroup.id}` : undefined}
          tabIndex={0}
          className="mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent md:mt-10"
        >
          {/* DESIGN: M6 (§5) — entrée 220ms ease-out (opacity + y 8px→0),
              sortie fade 140ms, un seul panneau visible à la fois
              (`mode="wait"`). Reduced-motion → `initial={false}` (état final
              immédiat). */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeGroup?.id ?? "empty"}
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{
                opacity: 0,
                transition: { duration: 0.14, ease: "easeOut" },
              }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            >
              {/* Pastilles larges §4.6 : éléments NON interactifs (pas de
                  hover, pas de cursor, aucun logo/icône de marque §3.2). */}
              {(activeGroup?.items ?? [])
                .slice(0, MAX_ITEMS_PER_GROUP)
                .map((item, index) => (
                  <div
                    key={`${item.name}-${index}`}
                    className="flex flex-col gap-1 rounded-xl border border-line bg-surface px-[18px] py-[14px]"
                  >
                    <span className="text-[15px] font-medium text-fg">
                      {item.name}
                    </span>
                    <span className="text-[12px] text-faint">{item.hint}</span>
                  </div>
                ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
