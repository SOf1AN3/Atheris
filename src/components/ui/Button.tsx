import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  href?: string;
  children: ReactNode;
  className?: string;
  // Prop littérale : `type` reste omis des deux branches d'attributs ci-dessous
  // pour éviter tout conflit de typage. Transmise UNIQUEMENT à la branche
  // `<button>` — sur un `<a>` l'attribut `type` est un MIME-type.
  type?: "button" | "submit" | "reset";
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "type"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

/* DESIGN §2.6 — PILL unique : arrondi = action. Courbe unique du site.
   `cursor-pointer` EXPLICITE : Tailwind Preflight ne pose plus `cursor:pointer`
   sur `<button>`, les CTA retombaient sur le curseur par défaut. */
const BASE_CLASSES =
  "inline-flex items-center justify-center font-semibold tracking-[-0.01em] transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] rounded-full cursor-pointer disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  /* SEUL aplat volt de la page (§2.1) : contraste maximal obsidienne ↔ signal.
     Texte FONCÉ sur volt : blanc interdit ici (1.7:1 → 15:1 avec `text-ink`). */
  primary:
    "bg-accent text-ink hover:bg-accent-hover hover:-translate-y-0.5 active:translate-y-0 hover:shadow-[0_18px_40px_-22px_rgba(204,255,74,0.75)]",
  secondary:
    "bg-transparent text-fg border border-line-2 hover:border-line-3 hover:bg-white/[0.04]",
  ghost: "bg-transparent text-muted hover:text-fg gap-2",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-11 text-[14px] px-[22px]",
  md: "h-[52px] text-[15px] px-7",
  lg: "h-14 text-[15px] px-8",
};

// Tailwind v4 compile `translate-x-1` vers la propriété `translate` (pas
// `transform`) : `transition-transform` ne l'interpole pas → `transition-all`.
const GHOST_ARROW_CLASSES =
  "inline-block transition-all duration-200 group-hover:translate-x-1";

function GhostArrow(): ReactNode {
  return (
    <span aria-hidden="true" className={GHOST_ARROW_CLASSES}>
      →
    </span>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  href,
  type = "button",
  children,
  className,
  ...rest
}: ButtonProps) {
  const classes = cn(
    BASE_CLASSES,
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    variant === "ghost" && "group",
    className,
  );

  if (href !== undefined) {
    const content = (
      <>
        {children}
        {variant === "ghost" ? <GhostArrow /> : null}
      </>
    );

    if (href.startsWith("#")) {
      return (
        <Link href={href} className={classes} {...rest}>
          {content}
        </Link>
      );
    }

    const { target, rel } = rest;

    return (
      <a
        href={href}
        className={classes}
        {...rest}
        target={target}
        rel={target === "_blank" ? "noopener noreferrer" : rel}
      >
        {content}
      </a>
    );
  }

  return (
    <button type={type} className={classes} {...rest}>
      {children}
      {variant === "ghost" ? <GhostArrow /> : null}
    </button>
  );
}
