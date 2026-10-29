import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line2, type } from "../../theme";
import { Hairline, SectionIndex } from "../../components/Backdrop";
import { TwoVoiceTitle } from "../../components/Type";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";

/**
 * Les 4 pôles d'expertise de la landing (`services.items`), synthétisés en
 * un tableau de marche : index mono, intitulé, filet. L'item actif prend le
 * texte `fg` + un filet volt (état actif, §3.3) — jamais deux signaux.
 */
const POLES = [
  { n: "01", label: "Web platforms & SaaS" },
  { n: "02", label: "Mobile — iOS & Android" },
  { n: "03", label: "Desktop software" },
  { n: "04", label: "Cloud & modernisation" },
];

export const Disciplines: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell variant="wipeUp" backdrop="hero">
      <SafeArea gap={30}>
        <SectionIndex n="01" label="WHAT WE BUILD" start={0} />

        <TwoVoiceTitle
          parts={[{ text: "Four disciplines." }, { text: "One team.", voice: "emotion" }]}
          start={0}
          stagger={2.4}
          size={type.h2}
        />

        {/* Tableau de marche */}
        <div>
          <Hairline start={10} duration={24} />
          {POLES.map((p, i) => {
            const t = 18 + i * 9;
            const on = interpolate(frame, [t, t + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            const active = i === 0; // le premier est déjà engagé à l'entrée
            return (
              <div key={p.n}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 26,
                    padding: "30px 0",
                    opacity: on,
                    transform: `translateY(${(1 - on) * 18}px)`,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: type.micro,
                      letterSpacing: "0.18em",
                      color: active ? "#CCFF4A" : "#757D8F",
                      lineHeight: 1,
                      width: 46,
                    }}
                  >
                    {p.n}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--structure)",
                      fontSize: 40,
                      fontWeight: 600,
                      letterSpacing: "-0.03em",
                      color: "#F4F2ED",
                    }}
                  >
                    {p.label}
                  </span>
                </div>
                <Hairline start={t + 6} duration={20} color={active ? "#CCFF4A" : line2} />
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
            opacity: interpolate(frame, [70, 88], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          Concept · Design · Build · Run
        </div>
      </SafeArea>
    </SceneShell>
  );
};
