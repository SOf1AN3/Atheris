"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// DESIGN: M1 (DESIGN.md §5) — reveal au scroll « retenue Apple » :
// opacity 0→1 + y 16px→0, 500ms, cubic-bezier(0.22, 1, 0.36, 1),
// whileInView once: true, viewport margin -80px. Aucun spring, aucune boucle.
const EASE_PREMIUM: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Mapping explicite d'éléments motion (solution compilant sans `any`
// ni `motion.create` — un seul objet référencé par la prop `as`).
const MOTION_TAGS = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  li: motion.li,
  figure: motion.figure,
} as const;

type RevealTag = keyof typeof MOTION_TAGS;

export type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Délai en secondes, défaut 0 */
  delay?: number;
  /** Déplacement vertical initial en px, défaut 16 */
  y?: number;
  /** Composant HTML rendu, défaut "div" */
  as?: RevealTag;
  /** Désactive l'animation (état final immédiat) */
  disableAnimation?: boolean;
};

/**
 * Bloc révélé au scroll (M1) : fondu + léger déplacement vertical.
 * Rend un `<div>` par défaut ; `as` permet `<section>`, `<article>`, `<li>`
 * ou `<figure>`. Respecte `prefers-reduced-motion` (état final immédiat,
 * aucun flash de contenu invisible — règle dure §5).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 16,
  as = "div",
  disableAnimation = false,
}: RevealProps): ReactNode {
  const reducedMotion = useReducedMotion();
  const MotionTag = MOTION_TAGS[as];
  const rootClassName = cn(className);

  // DESIGN: reduced-motion ou désactivation → aucun attribut d'animation.
  // L'élément rend son état final naturel (opacity 1, y 0) sans délai :
  // zéro risque de flash ni de dépendance aux internals de Framer Motion.
  if (disableAnimation || reducedMotion) {
    return <MotionTag className={rootClassName}>{children}</MotionTag>;
  }

  const variants: Variants = {
    hidden: { opacity: 0, y },
    visible: { opacity: 1, y: 0 },
  };

  return (
    <MotionTag
      className={rootClassName}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5, delay, ease: EASE_PREMIUM }}
    >
      {children}
    </MotionTag>
  );
}
