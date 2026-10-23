import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "pill" | "tech" | "verified";

type BadgeProps = {
  variant?: BadgeVariant;
  /** Le pill hero utilise dot (par défaut). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  pill: "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-semibold bg-[rgba(59,130,246,0.12)] border-[rgba(59,130,246,0.25)] text-muted",
  tech: "inline-flex items-center rounded-lg border border-line bg-surface-2 px-2.5 py-[5px] text-xs font-medium text-muted",
  verified:
    "inline-flex items-center gap-1.5 rounded-full border border-transparent bg-[rgba(52,211,153,0.10)] px-3 py-1.5 text-xs font-semibold text-success",
};

function CheckIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <path
        d="M2.75 7.25 5.5 10l5.75-6"
        stroke="currentColor"
        strokeWidth="1.6"
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
        <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" />
      ) : null}
      {variant === "verified" ? <CheckIcon /> : null}
      {children}
    </span>
  );
}
