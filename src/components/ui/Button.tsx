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
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "type"> &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type">;

const BASE_CLASSES =
  "inline-flex items-center justify-center font-semibold tracking-tight transition-all duration-[180ms] ease-[cubic-bezier(0.4,0,0.2,1)] rounded-xl focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[3px]";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover hover:-translate-y-px active:translate-y-0",
  secondary:
    "bg-surface text-fg border border-line hover:border-[rgba(59,130,246,0.4)] hover:bg-surface-2",
  ghost: "bg-transparent text-muted hover:text-fg gap-2",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-11 text-[15px] px-6",
  md: "h-[52px] text-[15px] px-6",
  lg: "h-14 text-base px-8",
};

const GHOST_ARROW_CLASSES =
  "inline-block transition-transform duration-200 group-hover:translate-x-1";

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
    <button type="button" className={classes} {...rest}>
      {children}
      {variant === "ghost" ? <GhostArrow /> : null}
    </button>
  );
}
