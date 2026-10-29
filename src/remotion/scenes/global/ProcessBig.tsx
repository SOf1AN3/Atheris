import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line2, type, volt } from "../../theme";
import { structure } from "../../fonts";
import { SectionIndex } from "../../components/Backdrop";
import { TwoVoiceTitle } from "../../components/Type";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";

/** Process — source : `process.steps` (src/content/fr.ts). */
const STEPS = [
  { n: "01", label: "Scoping & specs" },
  { n: "02", label: "Architecture & design" },
  { n: "03", label: "Agile sprints" },
  { n: "04", label: "Launch & support" },
];

const ROW_H = 186;

/**
 * S8 — Process : le moment « wow » de la landing (§2.5) — **numéraux géants
 * en contour** + ligne de progression qui se dessine. La ligne est l'unique
 * signal volt : elle dit *où on en est* (mouvement informatif, §3.2.4).
 */
export const ProcessBig: React.FC = () => {
  const frame = useCurrentFrame();

  // progression continue sur les 4 étapes, liée à la durée de la scène
  const progress = interpolate(frame, [16, 108], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell variant="wipeDown" backdrop="hero">
      <SafeArea gap={26} style={{ paddingBottom: 10 }}>
        <SectionIndex n="07" label="METHOD" start={0} />

        <TwoVoiceTitle
          parts={[{ text: "Scoping, design, sprints," }, { text: "support.", voice: "emotion" }]}
          start={0}
          stagger={2}
          size={52}
        />

        <div style={{ position: "relative", paddingLeft: 46 }}>
          {/* Ligne de progression — se dessine de haut en bas */}
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              bottom: 8,
              width: 2,
              backgroundColor: line2,
            }}
          />
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 8,
              width: 2,
              height: `calc((100% - 16px) * ${progress})`,
              backgroundColor: volt,
              boxShadow: "0 0 18px rgba(204,255,74,0.45)",
            }}
          />

          {STEPS.map((s, i) => {
            const t = 14 + i * 22;
            const on = interpolate(frame, [t, t + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const active = progress >= (i + 0.12) / STEPS.length;
            return (
              <div
                key={s.n}
                style={{
                  height: ROW_H,
                  display: "flex",
                  alignItems: "center",
                  gap: 26,
                  opacity: on,
                  transform: `translateY(${(1 - on) * 20}px)`,
                }}
              >
                <span
                  style={{
                    fontFamily: structure,
                    fontSize: 104,
                    fontWeight: 700,
                    lineHeight: 0.9,
                    letterSpacing: "-0.05em",
                    color: "transparent",
                    WebkitTextStroke: `1.5px ${active ? "rgba(244,242,237,0.9)" : "rgba(244,242,237,0.26)"}`,
                  }}
                >
                  {s.n}
                </span>
                <span
                  style={{
                    fontFamily: "var(--structure)",
                    fontSize: 40,
                    fontWeight: 600,
                    letterSpacing: "-0.03em",
                    color: active ? "#F4F2ED" : "#8A909E",
                  }}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: type.micro,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#757D8F",
            opacity: interpolate(frame, [96, 112], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          Fixed scope · fixed calendar · reviewed at every gate
        </div>
      </SafeArea>
    </SceneShell>
  );
};
