import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  /** Index de section (`01`, `02`…) — rend la ligne d'index + filet. */
  index?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  as?: "h1" | "h2";
  headingId?: string;
};

/**
 * SIGNATURE TYPOGRAPHIQUE (DESIGN §2.2) — « le titre à deux voix ».
 * Le contenu delimite l'accent entre astérisques : `"Pôles d'*Expertise*'"`
 * → structure en Inter Tight 600, accent en Instrument Serif italique.
 * Convention i18n : chaque langue marque SES propres mots (aucun texte en
 * dur dans le composant). Vider les `*` ne casse jamais le rendu.
 */
function TitleVoice({ text }: { text: string }): ReactNode {
  const parts = text.split("*");
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="voix">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

/**
 * En-tête de section v2 — index `01 — SERVICES` + filet, titre à deux voix,
 * description en `fg-2`. Composant serveur, sans état.
 */
export function SectionHeading({
  index,
  eyebrow,
  title,
  description,
  align = "left",
  className,
  as = "h2",
  headingId,
}: SectionHeadingProps) {
  const isCenter = align === "center";
  const TitleTag = as;
  const showIndex = Boolean(index) || Boolean(eyebrow);

  return (
    <div className={cn(isCenter ? "text-center" : "text-left", className)}>
      {showIndex ? (
        <p
          className={cn(
            "flex items-center gap-4",
            isCenter && "justify-center",
          )}
        >
          {index ? (
            <span className="micro text-accent">{index}</span>
          ) : null}
          {eyebrow ? (
            <span className="micro text-faint">
              {index ? "— " : ""}
              {eyebrow}
            </span>
          ) : null}
          {isCenter ? null : (
            <span
              aria-hidden="true"
              className="index-rule h-px min-w-8 flex-1 bg-line-2"
            />
          )}
        </p>
      ) : null}

      <TitleTag
        {...(headingId ? { id: headingId } : {})}
        className={cn(
          "h-display text-fg",
          as === "h1"
            ? "text-[clamp(2.75rem,6vw,4.75rem)]"
            : "text-[clamp(2rem,4vw,3.25rem)]",
          showIndex ? "mt-6" : undefined,
        )}
      >
        <TitleVoice text={title} />
      </TitleTag>

      {description ? (
        <p
          className={cn(
            "mt-5 max-w-[42ch] text-[17px] leading-[1.65] text-muted",
            isCenter && "mx-auto text-center",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
