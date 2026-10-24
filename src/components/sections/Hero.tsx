import { JetBrains_Mono } from "next/font/google";

import { Button } from "@/components/ui/Button";
import type { HeroContent } from "@/content/types";

import { TrustBar } from "./TrustBar";

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

type HeroProps = {
  hero: HeroContent;
};

export function Hero({ hero }: HeroProps) {
  return (
    <section
      id="top"
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden -mt-16 md:-mt-[72px]"
    >
      {/* FOND MESH 100% CSS — décoratif, aucune image, aucune animation. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[#0A0C10]"
      >
        {/* 1. Base charbon. */}
        {/* 2. Grande nappe bleu royal (haut-droit). */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_85%_at_78%_18%,#2B4BE8_0%,transparent_58%)]" />
        {/* 3. Nappe secondaire (bas-gauche). */}
        <div className="absolute inset-0 bg-[radial-gradient(95%_75%_at_28%_72%,#1E3ACF_0%,transparent_62%)]" />
        {/* 4. Reflet « pli » lumineux. */}
        <div className="absolute inset-0 opacity-90 bg-[radial-gradient(55%_45%_at_58%_45%,#4B6FF0_0%,transparent_65%)]" />
        {/* 5. Vignettage sombre en haut-gauche. */}
        <div className="absolute inset-0 bg-[radial-gradient(45%_38%_at_8%_6%,rgba(10,12,16,0.9),transparent_72%)]" />
        {/* 6. Texture tissée très subtile. */}
        <div className="absolute inset-0 opacity-60 bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.035)_0px,rgba(255,255,255,0.035)_1px,transparent_1px,transparent_5px)]" />
        {/* 7. Ancrage du texte (lisibilité du bloc gauche). */}
        <div className="absolute inset-0 bg-[radial-gradient(85%_70%_at_5%_95%,rgba(10,12,16,0.6),transparent_72%)]" />
        {/* 8. Fondu de sortie vers le charbon (continuité avec la section suivante). */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_60%,#0A0C10_100%)]" />
      </div>

      {/* CONTENU — aligné à gauche, centré verticalement. */}
      <div className="relative flex flex-1 flex-col justify-center pt-20 pb-8 md:pt-24">
        <div className="mx-auto w-full max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)]">
          <h1
            id="hero-title"
            className="max-w-[15ch] text-balance font-semibold tracking-[-0.02em] leading-[1.05] text-fg text-[clamp(2.5rem,5.2vw,4.25rem)]"
          >
            {hero.title}
          </h1>
          <p
            className={`${mono.className} mt-6 max-w-[52ch] text-[clamp(0.875rem,1.1vw,1rem)] leading-[1.7] tracking-[0.01em] text-white/85`}
          >
            {hero.subtitle}
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            <Button variant="primary" size="lg" href="#contact">
              {hero.primaryCta}
            </Button>
            <Button
              variant="ghost"
              href={hero.secondaryCtaHref}
              className="text-white/85 hover:text-white"
            >
              {hero.secondaryCta}
            </Button>
          </div>
        </div>
      </div>

      {/* STATS intégrées en bas du hero. */}
      <div className="relative">
        <div className="mx-auto w-full max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)] pb-10 md:pb-12">
          <TrustBar stats={hero.trustStats} />
        </div>
      </div>
    </section>
  );
}
