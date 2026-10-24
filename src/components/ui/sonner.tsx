"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()
  // Garde de type (aucun `as`) : next-themes expose `string`, sonner attend
  // un littéral. Site dark-only → repli explicite sur `system`.
  const sonnerTheme =
    theme === "light" || theme === "dark" || theme === "system"
      ? theme
      : "system"

  return (
    <Sonner
      theme={sonnerTheme}
      className="toaster group"
      toastOptions={{
        classNames: {
          // DESIGN §3.3 : panneau = `surface` + bordure `line`.
          toast:
            "group toast group-[.toaster]:bg-popover group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          // Action = CTA : `primary` autorisé (§2.3).
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-surface-2 group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
