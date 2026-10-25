"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// DESIGN v2 (§3.1) — courbe UNIQUE du site : `cubic-bezier(0.16, 1, 0.3, 1)`.
// Révélation M1 : opacity 0→1 + y 24px→0, 700ms, whileInView once.
// Aucun spring, aucune boucle.
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
  /** Déplacement vertical initial en px, défaut 24 */
  y?: number;
  /** Composant HTML rendu, défaut "div" */
  as?: RevealTag;
  /** Désactive l'animation (état final immédiat) */
  disableAnimation?: boolean;
};

/**
 * Bloc révélé au scroll (M1) : fondu + léger déplacement vertical.
 * Rend un `<div>` par défaut ; `as` permet `<section>`, `<article>`, `<li>`
 * ou `<figure>`. Respecte `prefers-reduced-motion` via
 * `MotionConfig(reducedMotion="user")` au niveau layout (règle dure §5).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = "div",
  disableAnimation = false,
}: RevealProps): ReactNode {
  const MotionTag = MOTION_TAGS[as];
  const rootClassName = cn(className);

  // DESIGN: pas de branchement sur useReducedMotion ici (cause d'hydration
  // mismatch) — le respect de la préférence est délégué à
  // MotionConfig(reducedMotion="user") au layout. `disableAnimation` est une
  // prop constante (identique serveur/client) → aucun risque de mismatch.
  if (disableAnimation) {
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
      transition={{ duration: 0.7, delay, ease: EASE_PREMIUM }}
    >
      {children}
    </MotionTag>
  );
}
