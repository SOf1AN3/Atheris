import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { MAX_PUSH, type } from "../theme";
import { Chip, SectionIndex } from "../components/Backdrop";
import { TwoVoiceTitle } from "../components/Type";
import { PhoneMockup } from "../components/Mocks";
import { SceneShell } from "../components/SceneShell";
import { SafeArea } from "../components/SafeArea";

/**
 * S3 — SERVICE 02 · MOBILE
 * Pôle n°2 de la landing (`services.items[1]`) : iOS & Android natifs.
 * Asymétrie 7/5 : iOS en grand, Android plus petit et décalé — jamais 2 clones.
 */
export const ServiceMobile: React.FC = () => {
  const frame = useCurrentFrame();

  // Push-in centré sur les téléphones (borné : jamais hors SafeArea)
  const scale = interpolate(frame, [0, 210], [1, MAX_PUSH], { extrapolateRight: "clamp" });

  return (
    <SceneShell variant="wipeDown">
      <AbsoluteFill style={{ transform: `scale(${scale})` }}>
        <SafeArea gap={26} style={{ paddingBottom: 20 }}>
          <SectionIndex n="02" label="SERVICES" start={0} />

          <div>
            <TwoVoiceTitle
              parts={[{ text: "Native iOS &" }, { text: "Android", voice: "emotion" }, { text: "apps" }]}
              start={0}
              stagger={2.2}
              size={type.h2}
            />
            <p
              style={{
                marginTop: 20,
                fontFamily: "var(--structure)",
                fontSize: type.bodyLg,
                lineHeight: 1.5,
                color: "#C9CDD6",
                opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              Engineered for everyday use — fluid interfaces, tuned performance, guided store release.
            </p>
          </div>

          {/* Deux silhouettes asymétriques (7/5) */}
          <div style={{ position: "relative", height: 687 }}>
            <div style={{ position: "absolute", left: 0, top: 0 }}>
              <PhoneMockup width={340} label="iOS" start={8} delay={0} primary />
            </div>
            <div style={{ position: "absolute", left: 372, top: 96 }}>
              <PhoneMockup width={245} label="ANDROID" start={8} delay={9} />
            </div>
          </div>

          {/* Chips + disponibilité stores */}
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
              {["Flutter", "React Native", "Mobile-first", "Stores"].map((label, i) => (
                <Chip key={label} label={label} start={44} index={i} />
              ))}
            </div>
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: type.micro,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "#757D8F",
                opacity: interpolate(frame, [72, 90], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              App Store · Google Play
            </span>
          </div>
        </SafeArea>
      </AbsoluteFill>
    </SceneShell>
  );
};
