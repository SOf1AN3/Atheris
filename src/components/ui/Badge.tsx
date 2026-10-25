import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "pill" | "tech" | "verified";

type BadgeProps = {
  variant?: BadgeVariant;
  /** Le pill hero utilise un point volt (par défaut). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

/* DESIGN §2.6 — badges = PILL + mono `micro` 11px. Le gris passe à `fg`
   au survol de la carte parente (`group-hover`), jamais de couleur de marque. */
const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  pill: "inline-flex items-center gap-2.5 rounded-full border border-line-2 bg-white/[0.04] px-3.5 py-1.5 micro text-fg-2 backdrop-blur-sm",
  tech: "inline-flex items-center rounded-full border border-line px-3 py-1.5 micro text-faint transition-colors duration-150 group-hover:border-line-2 group-hover:text-fg-2",
  /* Signal positif (vérifié / payé) : le volt dit « état acquis ». */
  verified:
    "inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 micro text-accent",
};

function CheckIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M2.75 7.25 5.5 10l5.75-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Badge({
  variant = "pill",
  dot = true,
  children,
  className,
}: BadgeProps) {
  return (
    <span className={cn(VARIANT_CLASSES[variant], className)}>
      {variant === "pill" && dot ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_10px_rgba(204,255,74,0.9)]"
        />
      ) : null}
      {variant === "verified" ? <CheckIcon /> : null}
      {children}
    </span>
  );
}
