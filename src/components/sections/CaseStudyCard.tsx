"use client";

import { useState } from "react";
import type { MouseEvent, ReactNode } from "react";

import Image from "next/image";

import { CaseStudyMockup } from "@/components/sections/CaseStudyMockups";
import { Badge } from "@/components/ui/Badge";
import type { CaseStudy } from "@/content/types";
import { cn } from "@/lib/utils";

type CaseStudyCardProps = {
  study: CaseStudy;
  /** Libellé i18n du bouton de visite — `cases.visitLabel` (dict FR/EN, LEAD). */
  visitLabel: string;
  /** Libellé localisé de la 1re catégorie (`cases.filters[categories[0]]`). */
  categoryLabel?: string;
  /**
   * Variante large — API conservée pour compatibilité. Le rail `02` applique
   * une largeur unique par carte (spécification) : la prop n'est plus lue.
   */
  featured?: boolean;
  /** Classes additionnelles (ex. `h-full` pour aligner les cartes du rail). */
  className?: string;
};

/**
 * M11 — spotlight suiveur (instantané, sans transition) : on écrit les
 * variables `--x` / `--y`, consommées par `.spot::after` (globals.css).
 */
function handleSpotlight(event: MouseEvent<HTMLElement>): void {
  const element = event.currentTarget;
  const rect = element.getBoundingClientRect();
  element.style.setProperty("--x", `${event.clientX - rect.left}px`);
  element.style.setProperty("--y", `${event.clientY - rect.top}px`);
}

/** `CaseStudy.image` est fournie SANS slash (`projects/dental.jpg`). */
function toImageSrc(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Carte d'étude de cas (`02`) : zone mockup 240px (zoom `scale(1.03)` +
 * balayage `.shine` au survol), puis catégorie + filet, titre, description,
 * tags à gauche et métrique business volt à droite (la donnée qui compte).
 * Visuel : `<Image>` réelle si `study.image`, sinon (image absente OU erreur
 * de chargement) repli sur le mockup 100 % CSS `CaseStudyMockup`.
 * Carte NON interactive (pas de page détail) — le hover reste purement visuel.
 */
export function CaseStudyCard({
  study,
  visitLabel,
  categoryLabel,
  className,
}: CaseStudyCardProps): ReactNode {
  const [imageFailed, setImageFailed] = useState<boolean>(false);

  const category = categoryLabel ?? study.categories[0];
  const imageSrc =
    study.image !== undefined && study.image !== "" && !imageFailed
      ? toImageSrc(study.image)
      : null;

  return (
    // DESIGN §2.6 — carte standard : hairline → `line-2`, lift -3px,
    // `--shadow-lift`, 240ms sur la courbe UNIQUE cubic-bezier(0.16,1,0.3,1).
    <article
      onMouseMove={handleSpotlight}
      className={cn(
        "case card spot group flex flex-col overflow-hidden rounded-[20px] border border-line bg-surface transition-[translate,border-color,box-shadow] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[3px] hover:border-line-2 hover:shadow-[0_24px_48px_-28px_rgba(0,0,0,0.85)]",
        className,
      )}
    >
      {/* Zone mockup `.mock` : hauteur fixe, arrondi haut, filet de séparation. */}
      <div className="mock relative h-[240px] overflow-hidden rounded-t-[14px] border-b border-line bg-[#0B0E14]">
        {/* Zoom maîtrisé : le conteneur `.mock` découpe le scale 1.03.
            `relative` = bloc conteneur explicite pour l'<Image fill>. */}
        <div className="mock-inner relative h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.03]">
          {imageSrc !== null ? (
            <Image
              src={imageSrc}
              alt={study.title}
              fill
              // Le rail est tirable à la souris : l'image ne doit jamais
              // déclencher la DnD native du navigateur.
              draggable={false}
              sizes="(max-width: 639.98px) 85vw, (max-width: 1023.98px) 62vw, 46vw"
              className="object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <CaseStudyMockup kind={study.mockup} />
          )}
        </div>

        {/* Voile `.shine` — balayage lumineux au survol de la carte (M13). */}
        <span
          aria-hidden="true"
          className="shine pointer-events-none absolute inset-0 -translate-x-[180%] bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 transition-transform duration-[600ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-[180%] group-hover:opacity-100"
        />
      </div>

      <div className="flex flex-1 flex-col p-6 md:p-7">
        {/* Sérigraphie : catégorie (signal) + filet pleine largeur.
            NOTE: `CaseStudy` ne porte PAS de champ `year` (contenu hors
            périmètre) → pas d'année inventée (i18n strict). */}
        <div className="flex items-center gap-3">
          {/* Catégorie = métadonnée → `muted`. Le VOLT est réservé à la
              métrique (l'unique donnée clé de la carte, DESIGN §2.1). */}
          {category !== undefined ? (
            <span className="micro text-muted">{category}</span>
          ) : null}
          <span aria-hidden="true" className="h-px min-w-6 flex-1 bg-line" />
        </div>

        <h3 className="h-display mt-4 text-[22px] text-fg">{study.title}</h3>

        <p className="mt-3 mb-6 text-[15px] leading-relaxed text-muted">
          {study.description}
        </p>

        {/* Ligne séparée : tags à gauche, métrique volt à droite.
            `metric` est OPTIONNEL : sans lui, les tags occupent toute la
            largeur (`w-full`) et aucun bloc vide n'est réservé. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
          <div
            className={cn(
              "flex flex-wrap gap-2",
              study.metric === undefined && "w-full",
            )}
          >
            {study.tags.map((tag) => (
              <Badge key={tag} variant="tech">
                {tag}
              </Badge>
            ))}
          </div>

          {study.metric !== undefined ? (
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span className="font-mono text-[24px] leading-none text-accent">
                {study.metric.value}
              </span>
              <span className="micro text-faint">{study.metric.label}</span>
            </div>
          ) : null}
        </div>

        {/* PLAN §4.1 — bouton « Visiter le site » : uniquement si `study.url`
            existe (MYKS : aucun bouton ET aucun espace réservé → rendu
            conditionnel total). Le bloc est TOUJOURS présent quand l'URL existe
            (masqué en `opacity-0 translate-y-2`) : la place est réservée, le
            survol ne fait donc JAMAIS sauter la métrique au-dessus.
            Révélation `group-hover` ET `group-focus-within` (le lien reste
            atteignable au clavier même sans survol) ; la transition est
            neutralisée sous `prefers-reduced-motion` par la règle globale de
            `globals.css` (aucun JS). */}
        {study.url !== undefined ? (
          <div className="mt-5 min-h-11">
            <a
              href={study.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${visitLabel} — ${study.title}`}
              // Le rail est tirable : le lien ne doit jamais déclencher la
              // DnD native du navigateur (même garde que l'<Image>).
              draggable={false}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full border border-line-2 px-4",
                "text-[14px] font-semibold text-fg transition-all duration-200",
                "ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer",
                "hover:border-line-3 hover:bg-white/[0.04]",
                "focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]",
                // Révélation : survol de la carte OU focus clavier dans la carte.
                "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0",
                "group-focus-within:opacity-100 group-focus-within:translate-y-0",
              )}
            >
              {visitLabel}
              <span aria-hidden="true" className="inline-block">
                →
              </span>
            </a>
          </div>
        ) : null}
      </div>
    </article>
  );
}
