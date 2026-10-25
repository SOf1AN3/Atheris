import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, fg, volt } from "../theme";
import { emotion, structure } from "../fonts";

/**
 * Titre à DEUX VOIX révélé mot à mot (M3, §3.2) :
 * `clip-path` + `translateY` par mot, 60 ms/mot, aucune élasticité.
 * Le marqueur d'accent de la landing (`*mot*`) devient la voix serif italique.
 */
export type TitlePart = { text: string; voice?: "structure" | "emotion" | "volt" };

export const TwoVoiceTitle: React.FC<{
  parts: TitlePart[];
  start?: number;
  stagger?: number;
  size?: number;
  color?: string;
  maxWidth?: number;
  align?: "left" | "center";
}> = ({ parts, start = 0, stagger = 2.4, size = 68, color = fg, maxWidth, align = "left" }) => {
  const frame = useCurrentFrame();

  // Découpe en mots en conservant la voix de chaque partie
  const words: Array<{ text: string; voice: TitlePart["voice"] }> = [];
  parts.forEach((part) => {
    part.text
      .split(/\s+/)
      .filter(Boolean)
      .forEach((w) => words.push({ text: w, voice: part.voice ?? "structure" }));
  });

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        columnGap: "0.26em",
        rowGap: "0.02em",
        maxWidth,
        justifyContent: align === "center" ? "center" : "flex-start",
        fontFamily: structure,
        fontSize: size,
        fontWeight: 600,
        lineHeight: 1.02,
        letterSpacing: "-0.035em",
        color,
      }}
    >
      {words.map((w, i) => {
        const t = start + i * stagger;
        const p = interpolate(frame, [t, t + 16], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: EASE,
        });
        const isEmotion = w.voice === "emotion" || w.voice === "volt";
        return (
          <span key={`${w.text}-${i}`} style={{ overflow: "hidden", display: "inline-block", paddingBottom: "0.08em" }}>
            <span
              style={{
                display: "inline-block",
                transform: `translateY(${(1 - p) * 105}%)`,
                opacity: p,
                fontFamily: isEmotion ? emotion : structure,
                fontStyle: isEmotion ? "italic" : "normal",
                fontWeight: isEmotion ? 400 : 600,
                fontSize: isEmotion ? size * 1.06 : size,
                color: w.voice === "volt" ? volt : color,
                letterSpacing: isEmotion ? "-0.01em" : "-0.035em",
              }}
            >
              {w.text}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/**
 * Compteur (M4) — courbe « atterrissage » `0.22, 1, 0.36, 1`, 1200 ms.
 * Une seule donnée clé par écran : `key` bascule le chiffre en volt.
 */
export const CountUp: React.FC<{
  value: number;
  prefix?: string;
  suffix?: string;
  start?: number;
  duration?: number;
  size?: number;
  keyFigure?: boolean;
}> = ({ value, prefix = "", suffix = "", start = 0, duration = 36, size = 150, keyFigure = false }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const shown = Math.round(value * p);
  return (
    <span
      style={{
        fontFamily: structure,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: "-0.045em",
        lineHeight: 0.94,
        color: keyFigure ? volt : fg,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {prefix}
      {shown}
      {suffix}
    </span>
  );
};

/** Texte courant qui monte et se révèle (M1). */
export const RiseText: React.FC<{
  children: React.ReactNode;
  start?: number;
  duration?: number;
  y?: number;
  style?: React.CSSProperties;
}> = ({ children, start = 0, duration = 22, y = 24, style }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>{children}</div>
  );
};
