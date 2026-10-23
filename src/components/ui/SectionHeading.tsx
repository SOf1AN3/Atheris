import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  as?: "h1" | "h2";
  headingId?: string;
};

export function SectionHeading({
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

  return (
    <div className={cn(isCenter ? "text-center" : "text-left", className)}>
      {eyebrow ? (
        <p
          className={cn(
            "text-[13px] font-semibold uppercase tracking-[0.06em] text-muted",
            isCenter ? "text-center" : "flex items-center gap-3",
          )}
        >
          {isCenter ? null : (
            <span aria-hidden="true" className="h-px w-8 shrink-0 bg-line" />
          )}
          {eyebrow}
        </p>
      ) : null}
      <TitleTag
        {...(headingId ? { id: headingId } : {})}
        className={cn(
          "text-fg",
          as === "h1"
            ? "text-[clamp(2.75rem,6vw,4.75rem)] font-extrabold leading-[1.02] tracking-[-0.035em]"
            : "text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[1.08] tracking-[-0.03em]",
          eyebrow ? "mt-4" : undefined,
        )}
      >
        {title}
      </TitleTag>
      {description ? (
        <p
          className={cn(
            "mt-5 max-w-[36rem] text-[clamp(1.125rem,1.6vw,1.375rem)] leading-relaxed text-muted",
            isCenter && "mx-auto text-center",
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
