"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

import type { TrustStat } from "@/content/types";

type TrustBarProps = {
  stats: TrustStat[];
};

/** M4 — count-up : 0 → N en 1200 ms, ease-out, cascade 100 ms par chiffre. */
const COUNT_DURATION_MS = 1200;
const COUNT_STAGGER_MS = 100;
const OBSERVER_THRESHOLD = 0.35;

type ParsedValue = {
  prefix: string;
  /** `null` quand la valeur ne contient aucun chiffre (ex. `"A → Z"`). */
  target: number | null;
  suffix: string;
};

/** Extrait la première séquence de chiffres d'une valeur textuelle
 *  (`"+20"` → `+ · 20 · ""`, `"100%"` → `"" · 100 · "%"`,
 *  `"A → Z"` → statique). */
function parseValue(value: string): ParsedValue {
  const match = /(\d+)/.exec(value);
  if (match === null) {
    return { prefix: "", target: null, suffix: "" };
  }
  return {
    prefix: value.slice(0, match.index),
    target: Number.parseInt(match[0], 10),
    suffix: value.slice(match.index + match[0].length),
  };
}

/**
 * Bande de stats sous le hero (densité dense, §2.3) : 3 chiffres en
 * `.h-display` + labels `.micro`, séparés par des hairlines en desktop.
 *
 * L'état PAR DÉFAUT = état FINAL : le HTML serveur (et le rendu sans JS)
 * affiche déjà la valeur complète ; le count-up ne fait que rejouer 0 → N
 * à l'entrée dans le viewport, et est neutralisé sous
 * `prefers-reduced-motion`. Composant client (IntersectionObserver +
 * rAF) — aucun état intermédiaire persistant après la fin de l'animation.
 */
export function TrustBar({ stats }: TrustBarProps): ReactNode {
  const listRef = useRef<HTMLDListElement>(null);
  const [displayed, setDisplayed] = useState<string[]>(() =>
    stats.map((stat) => stat.value),
  );

  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;

    const parsed: ParsedValue[] = stats.map((stat) => parseValue(stat.value));
    const hasNumber = parsed.some((item) => item.target !== null);
    if (!hasNumber) return;

    let frame = 0;
    let stopped = false;

    const startCount = (): void => {
      const startedAt = performance.now();
      const total =
        COUNT_DURATION_MS + COUNT_STAGGER_MS * Math.max(0, parsed.length - 1);

      const tick = (now: number): void => {
        if (stopped) return;
        const elapsed = now - startedAt;

        setDisplayed(
          stats.map((stat, index) => {
            const { prefix, target, suffix } = parsed[index];
            if (target === null) return stat.value;
            const progress = Math.min(
              1,
              Math.max(0, (elapsed - index * COUNT_STAGGER_MS) / COUNT_DURATION_MS),
            );
            const eased = 1 - Math.pow(1 - progress, 3);
            return `${prefix}${Math.round(target * eased)}${suffix}`;
          }),
        );

        if (elapsed < total) frame = requestAnimationFrame(tick);
      };

      // Zéro de départ visible immédiatement (aucun flash de la valeur finale).
      setDisplayed(
        stats.map((stat, index) => {
          const { prefix, target, suffix } = parsed[index];
          if (target === null) return stat.value;
          return `${prefix}0${suffix}`;
        }),
      );
      frame = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries: IntersectionObserverEntry[]) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.disconnect();
          if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
          }
          startCount();
        }
      },
      { threshold: OBSERVER_THRESHOLD },
    );

    observer.observe(list);

    return () => {
      stopped = true;
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [stats]);

  return (
    <div className="relative border-t border-line">
      <div className="mx-auto w-full max-w-[1200px] px-[clamp(1.25rem,5vw,2.5rem)] py-[clamp(56px,7vh,88px)]">
        <dl
          ref={listRef}
          className="grid grid-cols-1 gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x"
        >
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={
                index === 0 ? "sm:pr-8" : "sm:px-8 sm:last:pr-0"
              }
            >
              <dt className="h-display text-[clamp(2.5rem,4vw,3.4rem)] text-fg tabular-nums">
                {displayed[index] ?? stat.value}
              </dt>
              <dd className="micro mt-3 text-white/80">{stat.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
