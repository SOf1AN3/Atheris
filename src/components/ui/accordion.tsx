"use client"

import * as React from "react"
import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

const Accordion = AccordionPrimitive.Root

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
        // DESIGN §3.9 : séparateurs 1px `line` entre les lignes (pas de cartes).
        className={cn("border-b", className)}
    {...props}
  />
))
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
      // DESIGN §3.9 : question 17px/600 `fg` (ligne entière cliquable),
      // hover = le chevron passe en `fg` (registre §3.7), aucune soulignure.
      "group flex flex-1 items-center justify-between gap-4 py-5 text-left text-[17px] font-semibold leading-snug text-fg transition-colors [&[data-state=open]>svg]:rotate-180",
      className
    )}
    {...props}
  >
    {children}
    {/* DESIGN §3.9 : chevron 20px `muted`, pivot 180° en 220ms. */}
    <ChevronDown className="h-5 w-5 shrink-0 text-muted transition-[transform,color] duration-[220ms] group-hover:text-fg motion-reduce:transition-none" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
))
AccordionTrigger.displayName = AccordionPrimitive.Trigger.displayName

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
    {...props}
  >
    {/* DESIGN §3.9 : réponse `body-sm` `muted`, max 48rem. */}
    <div className={cn("max-w-[48rem] pb-5 text-[15px] leading-relaxed text-muted-foreground", className)}>{children}</div>
  </AccordionPrimitive.Content>
))
AccordionContent.displayName = AccordionPrimitive.Content.displayName

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
