"use client";

import { motion } from "framer-motion";
import type { Variants } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

// DESIGN: pas de branchement sur useReducedMotion ici (cause d'hydration
// mismatch) — le respect de la préférence est délégué à
// MotionConfig(reducedMotion="user") au layout. Seule la prop constante
// `disableAnimation` (identique serveur/client) peut court-circuiter
// l'animation, sans risque de mismatch.

// DESIGN v2 (§3.1) — courbe UNIQUE du site + durées R : 700ms, stagger 80ms.
// Aucun spring, aucune boucle, aucune élastique.
const EASE_PREMIUM: [number, number, number, number] = [0.16, 1, 0.3, 1];

// Mapping explicite d'éléments motion (compile sans `any` ni `motion.create`).
const MOTION_TAGS = {
  div: motion.div,
  section: motion.section,
  ul: motion.ul,
  ol: motion.ol,
} as const;

const MOTION_ITEM_TAGS = {
  div: motion.div,
  li: motion.li,
  figure: motion.figure,
} as const;

type FadeInTag = keyof typeof MOTION_TAGS;
type FadeInItemTag = keyof typeof MOTION_ITEM_TAGS;

// Variants de l'enfant en cascade (partagés, sans valeur par instance).
// Le conteneur FadeIn orchestre la timing (staggerChildren) ; chaque
// FadeInItem porte sa propre durée + easing dans sa variante `visible`.
const ITEM_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE_PREMIUM },
  },
};

export type FadeInProps = {
  children: ReactNode;
  className?: string;
  /** Délai de départ en secondes, défaut 0 */
  delay?: number;
  /** Intervalle entre enfants en secondes, défaut 0.08 */
  stagger?: number;
  as?: FadeInTag;
  disableAnimation?: boolean;
};

// DESIGN: la prop `max` (« max 6 enfants animés », M2) est retirée, faute
// d'implémentation propre sans perte ni fragilité :
// - `Children.toArray(children).slice(0, max)` SUPPRIMERAIT du DOM les
//   enfants au-delà de `max` (contenu perdu → inacceptable) ;
// - grouper le reliquat dans un wrapper casserait les grilles de sections
//   (enfants directs obligatoires) ;
// - injecter un index/cloné (`cloneElement`) dépendrait d'un mapping
//   `Children` fragile, explicitement hors spec.
// La contrainte « cascade ≤ 6 enfants » relève donc de l'appelant (chaque
// section ne place que ≤ 6 `FadeInItem` directs par `FadeIn`).
/**
 * Conteneur de cascade (M2) : ses enfants directs animés via `FadeInItem`
 * apparaissent en séquence (stagger). Le conteneur lui-même ne bouge pas
 * (aucun transform) et n'est révélé qu'une fois (`once: true`).
 * Respecte `prefers-reduced-motion` via `MotionConfig(reducedMotion="user")`
 * au niveau layout (règle dure §5).
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  stagger = 0.08,
  as = "div",
  disableAnimation = false,
}: FadeInProps): ReactNode {
  const MotionTag = MOTION_TAGS[as];
  const rootClassName = cn(className);

  // Conteneur orchestrateur : opacity 1 constant, pas de transform
  // (évite un containing block pour d'éventuels descendants `fixed`).
  // `when: "beforeChildren"` : l'orchestration part après le délai de départ.
  const containerVariants: Variants = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        delay,
        staggerChildren: stagger,
        when: "beforeChildren",
      },
    },
  };

  // DESIGN: désactivation explicite → aucun attribut d'animation sur le
  // conteneur ; les FadeInItem, sans labels hérités, rendent leur état
  // final visible (safe par défaut, aucun flash).
  if (disableAnimation) {
    return <MotionTag className={rootClassName}>{children}</MotionTag>;
  }

  return (
    <MotionTag
      className={rootClassName}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
    >
      {children}
    </MotionTag>
  );
}

export type FadeInItemProps = {
  children: ReactNode;
  className?: string;
  /** Composant HTML rendu, défaut "div" (utiliser "li" dans ul/ol) */
  as?: FadeInItemTag;
  /** Désactive l'animation sur cet enfant précis */
  disableAnimation?: boolean;
};

/**
 * Enfant animé en cascade sous un `<FadeIn>` (M2).
 * Volontairement sans `initial`/`animate`/`whileInView` : les labels de
 * variants (`hidden`/`visible`) sont hérités du conteneur via le contexte
 * Motion, ce qui garantit le décalage `staggerChildren`. Utilisé seul (hors
 * `FadeIn`), il rend son état final visible — comportement sûr par défaut.
 * Respecte `prefers-reduced-motion` via `MotionConfig(reducedMotion="user")`
 * au niveau layout (règle dure §5).
 */
export function FadeInItem({
  children,
  className,
  as = "div",
  disableAnimation = false,
}: FadeInItemProps): ReactNode {
  const ItemTag = MOTION_ITEM_TAGS[as];
  const rootClassName = cn(className);

  // DESIGN: désactivation explicite → rendu naturel (état final).
  if (disableAnimation) {
    return <ItemTag className={rootClassName}>{children}</ItemTag>;
  }

  return (
    <ItemTag className={rootClassName} variants={ITEM_VARIANTS}>
      {children}
    </ItemTag>
  );
}
