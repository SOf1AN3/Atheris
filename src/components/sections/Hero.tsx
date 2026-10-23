import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { HeroContent } from "@/content/types";

import { HeroVisual } from "./HeroVisual";
import { TrustBar } from "./TrustBar";

type HeroProps = {
  hero: HeroContent;
};

export function Hero({ hero }: HeroProps) {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative overflow-hidden pt-[64px] pb-[64px] md:pt-[120px] md:pb-[96px] text-center"
    >
      {/* DESIGN: seul halo radial autorisé du site (DESIGN.md §4.1). Décoratif, non interactif. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(59,130,246,0.10),transparent_70%)]"
      />
      <div className="relative z-10 mx-auto max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
        {/* DESIGN: pulse du point géré au niveau du Badge (tâche ultérieure si requis) —
            le composant Badge n'expose pas le style du point interne ; pas de ciblage
            CSS profond (retenue, DESIGN.md §11). */}
        <Badge variant="pill" dot>
          {hero.badge}
        </Badge>
        <h1 id="hero-title" className="mx-auto mt-8 max-w-[16ch] md:mt-10 md:max-w-[18ch] text-balance font-extrabold tracking-[-0.035em] leading-[1.02] text-fg text-[clamp(2.75rem,6vw,4.75rem)]">
          {hero.title}
        </h1>
        <p className="mx-auto mt-4 max-w-[42rem] text-balance text-[clamp(1.125rem,1.6vw,1.375rem)] leading-relaxed text-muted md:mt-6">
          {hero.subtitle}
        </p>
        <div className="mt-8 flex flex-col items-center md:mt-10">
          <Button variant="primary" size="lg" href="#contact">
            {hero.primaryCta}
          </Button>
          <div className="mt-4">
            <Button variant="ghost" href={hero.secondaryCtaHref}>
              {hero.secondaryCta}
            </Button>
          </div>
        </div>
        <div className="mt-16 md:mt-20">
          <HeroVisual />
        </div>
        <div className="mt-16 md:mt-16">
          <TrustBar stats={hero.trustStats} />
        </div>
      </div>
    </section>
  );
}
