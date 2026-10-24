import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[52px] w-full rounded-xl border border-input bg-surface px-4 text-[15px] text-fg transition-colors duration-200 file:border-0 file:bg-transparent file:text-[15px] file:font-medium file:text-foreground placeholder:text-faint focus-visible:border-accent focus-visible:ring-[3px] focus-visible:ring-accent/[0.18] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
