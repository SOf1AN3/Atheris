import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-32 w-full resize-y rounded-xl border border-input bg-surface px-4 py-4 text-[15px] leading-relaxed text-fg transition-colors placeholder:text-faint focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
