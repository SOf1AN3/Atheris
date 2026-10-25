import type { ReactNode } from "react";

/**
 * Bande de stack défilante (M17) — COMPOSANT SERVEUR : aucune directive
 * `"use client"`, aucun état, aucun hook. L'animation vit intégralement en
 * CSS (`.marquee` de `globals.css`), neutralisée sous
 * `prefers-reduced-motion` et en pause au survol.
 */

/* Noms de technologies (données, pas copy) : constante locale autorisée.
   Ordre figé pour garantir que les deux blocs du marquee sont identiques. */
const TECHS: string[] = [
  "Next.js",
  "React",
  "TypeScript",
  "Node.js",
  "PostgreSQL",
  "Flutter",
  "React Native",
  "Electron",
  "GraphQL",
  "Redis",
  "Docker",
  "AWS",
  "Stripe",
  "Tailwind",
];

/* Le content ne porte pas d'aria-label de marquee (contrat `SiteContent`) :
   on reste sur une valeur technique descriptive. */
const MARQUEE_LABEL = "Technologies maîtrisées";

function renderRun(duplicate: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];

  TECHS.forEach((tech, index) => {
    if (index > 0) {
      nodes.push(
        <span
          key={`star-${duplicate ? "b" : "a"}-${index}`}
          className="text-accent"
          aria-hidden="true"
        >
          ✦
        </span>,
      );
    }
    nodes.push(
      <span
        key={`tech-${duplicate ? "b" : "a"}-${index}`}
        className="micro whitespace-nowrap"
        aria-hidden={duplicate ? "true" : undefined}
      >
        {tech}
      </span>,
    );
  });

  return nodes;
}

/**
 * Section « technologies » : bande mono défilant droite → gauche en boucle,
 * encadrée par deux hairlines. Le premier bloc est lisible par les lecteurs
 * d'écran, sa copie (nécessaire au défilement en boucle) est `aria-hidden`.
 */
export function Marquee(): ReactNode {
  return (
    <section
      className="overflow-hidden border-y border-line py-7"
      aria-label={MARQUEE_LABEL}
    >
      <div className="marquee items-center gap-8 text-muted">
        {renderRun(false)}
        {renderRun(true)}
      </div>
    </section>
  );
}
