import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line2, type, volt } from "../theme";
import { structure, emotion } from "../fonts";
import { Hairline } from "../components/Backdrop";
import { CountUp, TwoVoiceTitle } from "../components/Type";
import { SceneShell } from "../components/SceneShell";
import { SafeArea } from "../components/SafeArea";

/** Statistiques de confiance — source : `hero.trustStats` (src/content/fr.ts) */
const STATS = [
  { value: 20, prefix: "+", suffix: "", label: "Products shipped", key: true },
  { value: 100, prefix: "", suffix: "%", label: "Proprietary code", key: false },
] as const;

/** Process — source : `process.steps` */
const STEPS = ["Cadrage", "Architecture", "Sprints", "Support"];

/**
 * S4 — PREUVE
 * Section la plus aérée de la vidéo : la densité typographique fait le mouvement.
 * Une seule donnée clé en volt (§2.1) : `+20`.
 */
export const Proof: React.FC = () => {
  const frame = useCurrentFrame();

  // Rail de process : l'étape active avance au rythme de la VO
  const active = Math.min(STEPS.length - 1, Math.max(0, Math.floor((frame - 84) / 13)));

  return (
    <SceneShell variant="cut">
      <SafeArea gap={30} style={{ paddingBottom: 26 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: interpolate(frame, [4, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
          <span style={{ fontFamily: "var(--mono)", fontSize: type.micro, lineHeight: 1, letterSpacing: "0.18em", color: "#757D8F" }}>
            — TRACK RECORD
          </span>
          <div style={{ flex: 1, height: 1, backgroundColor: line2 }} />
        </div>

        {/* Compteurs géants séparés par des filets (M4) */}
        <div>
          {STATS.map((s, i) => (
            <div key={s.label}>
              {i > 0 && (
                <div style={{ opacity: interpolate(frame, [22 + i * 8, 38 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
                  <Hairline start={22 + i * 8} duration={22} />
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 24,
                  padding: "34px 0",
                  opacity: interpolate(frame, [6 + i * 8, 22 + i * 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
                }}
              >
                <CountUp
                  value={s.value}
                  prefix={s.prefix ?? ""}
                  suffix={s.suffix ?? ""}
                  start={10 + i * 8}
                  duration={36}
                  size={152}
                  keyFigure={s.key}
                />
                <span
                  style={{
                    fontFamily: structure,
                    fontSize: type.bodyLg,
                    fontWeight: 500,
                    color: "#C9CDD6",
                    maxWidth: 262,
                    textAlign: "right",
                    lineHeight: 1.3,
                  }}
                >
                  {s.label}
                </span>
              </div>
            </div>
          ))}

          {/* Troisième ligne : valeur éditoriale (A → Z) */}
          <div style={{ opacity: interpolate(frame, [30, 48], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <Hairline start={30} duration={22} />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 24, padding: "30px 0" }}>
              <span style={{ fontFamily: emotion, fontStyle: "italic", fontSize: 120, color: "#F4F2ED", lineHeight: 0.94 }}>
                A&nbsp;→&nbsp;Z
              </span>
              <span
                style={{
                  fontFamily: structure,
                  fontSize: type.bodyLg,
                  fontWeight: 500,
                  color: "#C9CDD6",
                  maxWidth: 262,
                  textAlign: "right",
                  lineHeight: 1.3,
                }}
              >
                End-to-end delivery
              </span>
            </div>
          </div>
        </div>

        {/* Titre à deux voix */}
        <TwoVoiceTitle
          parts={[{ text: "From first spec to" }, { text: "production", voice: "emotion" }]}
          start={44}
          stagger={2.4}
          size={62}
        />

        {/* Rail de process — l'état actif porte un filet volt (§3.3 nav active) */}
        <div>
          <Hairline start={60} duration={26} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            {STEPS.map((s, i) => {
              const isActive = i === active && frame > 84;
              const on = interpolate(frame, [64 + i * 6, 82 + i * 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={s} style={{ opacity: on, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: type.micro,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: isActive ? "#F4F2ED" : "#757D8F",
                    }}
                  >
                    {String(i + 1).padStart(2, "0")} {s}
                  </span>
                  <div
                    style={{
                      width: 56,
                      height: 2,
                      backgroundColor: isActive ? volt : line2,
                      transform: `scaleX(${isActive ? 1 : 0.5})`,
                      transformOrigin: "left center",
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SafeArea>
    </SceneShell>
  );
};
