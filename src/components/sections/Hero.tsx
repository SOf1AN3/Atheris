"use client";

import { motion, useSpring } from "framer-motion";
import { useEffect, useRef } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";

import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/Button";
import type { HeroContent } from "@/content/types";
import { cn } from "@/lib/utils";

import { TrustBar } from "./TrustBar";

type HeroProps = {
  hero: HeroContent;
};

/* M16 — parallaxe de la console : rotation ≤ 7°, translation ≤ 8px.
   Lissage surdampé (ζ ≈ 1.8) : AUCUN dépassement, AUCUN rebond — la
   courbe reste la signature du site (DESIGN §3.1). */
const PARALLAX_SPRING = { stiffness: 140, damping: 30, mass: 0.5 };
const MAX_TILT_DEG = 7;
const MAX_SHIFT_PX = 8;

/* Marqueurs techniques internes de la console (étalonnage d'instrument) :
   ce ne sont pas des chaînes de copy → hors périmètre i18n. */
type Kpi = { label: string; value: string; accent: boolean };

const KPIS: Kpi[] = [
  { label: "Latency", value: "42 ms", accent: false },
  { label: "Uptime", value: "99.98%", accent: true },
  { label: "Deploys", value: "1 284", accent: false },
];

/** M18 — barres du chart : cascade 45 ms, dernière barre = donnée clé. */
const BARS: number[] = [34, 48, 41, 58, 52, 67, 61, 74, 69, 83, 77, 91, 86, 100];

/** Variable CSS `--d` (délai de cascade) : typée explicitement, jamais `any`. */
type ConsoleBarStyle = CSSProperties & { "--d": string };

/** Titre à DEUX VOIX (§2.2) : les indices impairs du découpage `*` passent
 *  en serif italique — logique hors `SectionHeading` (donc ici, dans le H1). */
function splitVoix(title: string): ReactNode[] {
  return title.split("*").map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} className="voix">
        {part}
      </span>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function Hero({ hero }: HeroProps): ReactNode {
  const sectionRef = useRef<HTMLElement>(null);
  const reducedRef = useRef<boolean>(false);

  const rotateX = useSpring(0, PARALLAX_SPRING);
  const rotateY = useSpring(0, PARALLAX_SPRING);
  const shiftX = useSpring(0, PARALLAX_SPRING);
  const shiftY = useSpring(0, PARALLAX_SPRING);

  /* Aucun branchement de rendu sur `prefers-reduced-motion` : la préférence
     est lue côté client uniquement (aucun risque d'hydratation), et la
     console redevient statique (DESIGN §3.4 — M16 neutralisé). */
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");

    const sync = (matches: boolean): void => {
      reducedRef.current = matches;
      if (matches) {
        rotateX.set(0);
        rotateY.set(0);
        shiftX.set(0);
        shiftY.set(0);
      }
    };

    const handleChange = (event: MediaQueryListEvent): void => {
      sync(event.matches);
    };

    sync(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [rotateX, rotateY, shiftX, shiftY]);

  /* Aucun `useState` par pixel : les motion values pilotent le transform
     sans re-rendu React. Rien n'est calculé au premier rendu serveur. */
  const handleMouseMove = (event: MouseEvent<HTMLElement>): void => {
    if (reducedRef.current) return;
    const element = sectionRef.current;
    if (element === null) return;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
    const nx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1);
    const ny = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1);

    rotateX.set(-ny * MAX_TILT_DEG);
    rotateY.set(nx * MAX_TILT_DEG);
    shiftX.set(nx * MAX_SHIFT_PX);
    shiftY.set(ny * MAX_SHIFT_PX);
  };

  const handleMouseLeave = (): void => {
    rotateX.set(0);
    rotateY.set(0);
    shiftX.set(0);
    shiftY.set(0);
  };

  return (
    <section
      id="top"
      ref={sectionRef}
      aria-labelledby="hero-title"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative isolate flex min-h-[100svh] flex-col overflow-hidden -mt-16 md:-mt-[72px]"
    >
      {/* FOND INSTRUMENT — décoratif (nappe froide localisée + grille au sol
          + vignettage d'ancrage), 100% CSS via globals.css. */}
      <div aria-hidden="true" className="hero-bg">
        <div className="hero-nappe" />
        <div className="floor" />
        <div className="hero-vignette" />
      </div>

      {/* Composition ASYMÉTRIQUE 6/6 — densité aérée (DESIGN §2.3). */}
      <div className="relative flex flex-1 items-center py-[clamp(96px,14vh,176px)]">
        <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 items-center gap-12 px-[clamp(1.25rem,5vw,2.5rem)] lg:grid-cols-2 lg:gap-16">
          {/* Colonne gauche — H1 (seul h1 de la page), lead, CTA.
              Le badge d'identité a été retiré sur demande client. */}
          <Reveal className="flex flex-col items-start">
            <h1
              id="hero-title"
              className="h-display max-w-[17ch] text-[clamp(2.5rem,5.6vw,4.6rem)] text-fg"
            >
              {splitVoix(hero.title)}
            </h1>

            <p className="mt-6 max-w-[54ch] text-[17px] leading-[1.65] text-fg-2">
              {hero.subtitle}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <Button variant="primary" size="lg" href="#contact">
                {hero.primaryCta}
              </Button>
              <Button variant="ghost" href={hero.secondaryCtaHref}>
                {hero.secondaryCta}
              </Button>
            </div>
          </Reveal>

          {/* Colonne droite — console d'instrument (DÉCORATIVE : aria-hidden). */}
          <Reveal delay={0.12} className="w-full lg:justify-self-end lg:max-w-[520px]">
            <motion.div
              aria-hidden="true"
              className="console p-5 md:p-6"
              style={{
                rotateX,
                rotateY,
                x: shiftX,
                y: shiftY,
                transformPerspective: 1200,
              }}
            >
              {/* (i) Barre supérieure : état de la machine. */}
              <div className="flex items-center gap-3 border-b border-line pb-4">
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="size-2 rounded-full bg-danger" />
                  <span className="size-2 rounded-full bg-warn" />
                  <span className="size-2 rounded-full bg-success" />
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] tracking-[0.06em] text-muted">
                  atheris://production
                </span>
                <span className="micro shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-accent">
                  live
                </span>
              </div>

              {/* (ii) 3 KPI — UPTIME = l'unique donnée clé en volt. */}
              <div className="mt-5 grid grid-cols-3 gap-2 md:gap-3">
                {KPIS.map((kpi) => (
                  <div
                    key={kpi.label}
                    className="rounded-xl border border-line bg-white/[0.03] px-3 py-3"
                  >
                    <div
                      className={cn(
                        "font-mono text-[15px] font-medium tracking-tight tabular-nums md:text-[17px]",
                        kpi.accent ? "text-accent" : "text-fg",
                      )}
                    >
                      {kpi.value}
                    </div>
                    <div className="micro mt-1.5 truncate text-muted">
                      {kpi.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* (iii) Graphe de barres — M18 (cascade déjà câblée en CSS). */}
              <div className="mt-5 flex h-24 items-end gap-1.5 border-b border-line pb-px md:h-28">
                {BARS.map((height, index) => {
                  const isKey = index === BARS.length - 1;
                  const style: ConsoleBarStyle = {
                    height: `${height}%`,
                    "--d": `${index * 45}ms`,
                  };
                  return (
                    <div
                      key={`${index}-${height}`}
                      className={cn(
                        "console-bar flex-1 rounded-t-[2px]",
                        isKey ? "bg-accent" : "bg-white/15",
                      )}
                      style={style}
                    />
                  );
                })}
              </div>

              {/* (iv) Bloc terminal + curseur. */}
              <div className="mt-4 rounded-xl border border-line bg-ink/70 p-3 font-mono text-[12px] leading-[1.7]">
                <p className="truncate text-muted">
                  <span className="text-fg-2">$ </span>
                  atheris deploy --prod
                </p>
                <p className="text-fg-2">
                  build ok · 12.4s <span className="caret" />
                </p>
              </div>
            </motion.div>
          </Reveal>
        </div>
      </div>

      {/* Bande de stats (densité dense) — sous le hero. */}
      <TrustBar stats={hero.trustStats} />
    </section>
  );
}
