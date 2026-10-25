import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { SAFE_H, SAFE_LEFT, SAFE_TOP, SAFE_W, EASE, radius, type, volt, voltInk } from "../theme";
import { structure } from "../fonts";
import { Hairline } from "../components/Backdrop";
import { TwoVoiceTitle } from "../components/Type";
import { SceneShell } from "../components/SceneShell";
import { SafeArea } from "../components/SafeArea";

/** Coordonnées — source : `contact.channels` + domaine */
const CONTACT = ["contact@atherislabs.com", "+213 551 79 73 13", "atherislabs.com"];

/**
 * S5 — CTA FINAL
 * Point de fixation unique : wordmark en contour, titre display à deux voix,
 * **un seul aplat volt** (le CTA) — l'élément le plus contraste de la scène.
 */
export const CallToAction: React.FC = () => {
  const frame = useCurrentFrame();

  // Wordmark contour qui monte du bas
  const markP = interpolate(frame, [2, 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Push-in très lent vers le CTA
  const scale = interpolate(frame, [0, 165], [1, 1.02], { extrapolateRight: "clamp" });

  // CTA : entrée + balayage de brillance (M13) + halo volt
  const ctaP = interpolate(frame, [46, 68], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE });
  const shine = interpolate(frame, [70, 104], [-130, 130], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // Sortie : fondu au noir sur les dernières images, le filet volt tient jusqu'au bout
  const outro = interpolate(frame, [150, 164], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneShell variant="cut" backdrop="final">
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <AbsoluteFill style={{ opacity: outro }}>
          <SafeArea justify="center" gap={64} align="center">
            {/* Wordmark géant en contour (§2.5 footer) */}
            <div
              style={{
                textAlign: "center",
                opacity: markP * 0.9,
                transform: `translateY(${(1 - markP) * 50}px)`,
                fontFamily: structure,
                fontWeight: 700,
                fontSize: 140,
                letterSpacing: "-0.05em",
                lineHeight: 1,
                color: "transparent",
                WebkitTextStroke: "1px rgba(255,255,255,0.20)",
              }}
            >
              ATHERIS
            </div>

            {/* Titre display — « yours » en volt : le mot-clé de l'écran */}
            <TwoVoiceTitle
              parts={[{ text: "Let’s build" }, { text: "yours.", voice: "volt" }]}
              start={20}
              stagger={3}
              size={type.display}
              align="center"
            />

            {/* CTA primaire — unique aplat volt de la scène */}
            <div
              style={{
                position: "relative",
                overflow: "hidden",
                display: "inline-flex",
                alignItems: "center",
                gap: 16,
                height: 110,
                paddingInline: 52,
                borderRadius: radius.pill,
                backgroundColor: volt,
                color: voltInk,
                fontFamily: structure,
                fontSize: 38,
                fontWeight: 600,
                letterSpacing: "-0.01em",
                opacity: ctaP,
                transform: `translateY(${(1 - ctaP) * 26}px)`,
                boxShadow: ctaP > 0.9 ? "0 24px 60px -30px rgba(204,255,74,0.55)" : "none",
              }}
            >
              Start your project
              <span style={{ fontFamily: structure, fontWeight: 500 }}>→</span>
              {/* balayage de brillance */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "32%",
                  height: "100%",
                  background: "linear-gradient(105deg, transparent, rgba(255,255,255,0.34), transparent)",
                  transform: `translateX(${shine}%)`,
                }}
              />
            </div>

            {/* Coordonnées */}
            <div style={{ width: "100%" }}>
              <Hairline start={78} duration={26} />
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                {CONTACT.map((c, i) => (
                  <div
                    key={c}
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: type.small,
                      letterSpacing: "0.06em",
                      color: i === 0 ? "#F4F2ED" : "#8A909E",
                      opacity: interpolate(frame, [88 + i * 6, 104 + i * 6], [0, 1], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      }),
                    }}
                  >
                    {c}
                  </div>
                ))}
              </div>
            </div>
          </SafeArea>

          {/* Filet volt de sortie — en pied de zone sûre, tient jusqu'au noir */}
          <div
            style={{
              position: "absolute",
              top: SAFE_TOP + SAFE_H + 90,
              left: SAFE_LEFT,
              width: SAFE_W,
              height: 2,
              backgroundColor: volt,
              opacity: interpolate(frame, [120, 150], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              boxShadow: "0 0 30px rgba(204,255,74,0.5)",
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};
