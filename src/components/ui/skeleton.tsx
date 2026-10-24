import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // DESIGN §2.3 : aucun bleu décoratif — squelette = surface neutre.
      className={cn("animate-pulse rounded-md bg-surface-2", className)}
      {...props}
    />
  )
}

export { Skeleton }
