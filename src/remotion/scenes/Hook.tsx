import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MAX_PUSH, HEIGHT, WIDTH, type } from "../theme";
import { structure } from "../fonts";
import { Hairline, VoltDot } from "../components/Backdrop";
import { TwoVoiceTitle } from "../components/Type";
import { SceneShell } from "../components/SceneShell";
import { SafeArea } from "../components/SafeArea";

/**
 * S1 — HOOK
 * Une affirmation conflictuelle, pas un logo : le mot « template » reprend la
 * critique du DESIGN.md §1.2 (design « généré par IA ») — c'est le hook.
 * Tout le contenu lisible vit dans la SafeArea (802 × 1260).
 */
export const Hook: React.FC = () => {
  const frame = useCurrentFrame();

  // Push-in très lent : la composition respire sans mouvement parasite
  // (borné à MAX_PUSH pour ne jamais sortir de la SafeArea)
  const scale = interpolate(frame, [0, 140], [1, MAX_PUSH], { extrapolateRight: "clamp" });

  // Filet volt qui traverse l'écran au tout premier plan (400 ms) — décoratif
  const sweep = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sweepFade = interpolate(frame, [14, 30], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneShell variant="cut" backdrop="hero">
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        {/* Filet de signal initial — décoratif, plein cadre assumé */}
        <div
          style={{
            position: "absolute",
            top: HEIGHT * 0.34,
            left: 0,
            width: WIDTH,
            height: 2,
            backgroundColor: "#CCFF4A",
            opacity: sweep * sweepFade,
            transform: `scaleX(${sweep})`,
            transformOrigin: "left center",
            boxShadow: "0 0 40px rgba(204,255,74,0.5)",
          }}
        />

        <SafeArea justify="space-between" align="center">
          {/* Wordmark — centré sur ce plan (alternance d'alignement) */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 14,
              opacity: interpolate(frame, [6, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <span style={{ fontFamily: structure, fontWeight: 700, fontSize: 32, letterSpacing: "-0.03em", color: "#F4F2ED" }}>
              ATHERIS
            </span>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: type.micro,
                letterSpacing: "0.24em",
                color: "#757D8F",
                textTransform: "uppercase",
              }}
            >
              Labs
            </span>
          </div>

          {/* Titre à deux voix, révélé mot à mot — centré verticalement dans
              l'espace restant : le H1 reste le sommet de la composition. */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", width: "100%" }}>
            <TwoVoiceTitle
              parts={[{ text: "Your product deserves more than a" }, { text: "template.", voice: "emotion" }]}
              start={10}
              stagger={2.6}
              size={96}
              align="center"
            />
          </div>

          {/* Filet + signature mono — centrés */}
          <div style={{ width: "100%", marginBottom: 40 }}>
            <Hairline start={30} duration={26} />
            <div
              style={{
                marginTop: 24,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 18,
                opacity: interpolate(frame, [38, 56], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              <VoltDot start={44} size={11} />
              <span
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: type.micro,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#8A909E",
                }}
              >
                Software engineering studio
              </span>
            </div>
          </div>
        </SafeArea>
      </AbsoluteFill>
    </SceneShell>
  );
};
