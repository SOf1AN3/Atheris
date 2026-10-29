import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { type } from "../theme";
import { Chip, SectionIndex } from "../components/Backdrop";
import { TwoVoiceTitle } from "../components/Type";
import { ConsoleMockup } from "../components/Mocks";
import { SceneShell } from "../components/SceneShell";
import { SafeArea } from "../components/SafeArea";

/**
 * S2 — SERVICE 01 · WEB & SAAS
 * Pôle n°1 de la landing (`services.items[0]`). Preuve visuelle = la console.
 * Composition dans la SafeArea : le rail de boutons TikTok occupe la droite.
 */
export const ServiceWeb: React.FC<{ index?: string; label?: string; center?: boolean }> = ({
  index = "01",
  label = "SERVICES",
  center = false,
}) => {
  const frame = useCurrentFrame();

  // Dérive verticale lente : le feed vertical respire
  const drift = interpolate(frame, [0, 260], [0, -28], { extrapolateRight: "clamp" });

  // Spotlight unique qui balaye la carte (M11 — informatif : « c'est la preuve »)
  const sweepX = interpolate(frame, [70, 150], [-30, 130], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sweepOpacity = interpolate(frame, [60, 75, 150, 168], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <SceneShell variant="wipeUp">
      <AbsoluteFill style={{ transform: `translateY(${drift}px)` }}>
        <SafeArea gap={30} align={center ? "center" : "stretch"}>
          <SectionIndex n={index} label={label} start={0} center={center} />

          <div style={{ width: "100%", textAlign: center ? "center" : "left" }}>
            <TwoVoiceTitle
              parts={[{ text: "Web platforms &" }, { text: "SaaS", voice: "emotion" }, { text: "products" }]}
              start={0}
              stagger={2.2}
              size={type.h2}
              align={center ? "center" : "left"}
            />
            <p
              style={{
                marginTop: 22,
                fontFamily: "var(--structure)",
                fontSize: type.bodyLg,
                lineHeight: 1.5,
                color: "#C9CDD6",
                opacity: interpolate(frame, [10, 30], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              Dashboards, client portals and internal tools — built multi-tenant, shipped to production.
            </p>
          </div>

          {/* Carte panneau : la preuve */}
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 20, width: "100%" }}>
            <ConsoleMockup start={10} />
            <div
              style={{
                position: "absolute",
                inset: 0,
                opacity: sweepOpacity,
                background: `radial-gradient(320px circle at ${sweepX}% 40%, rgba(204,255,74,0.10), transparent 65%)`,
              }}
            />
          </div>

          {/* Chips : la stack du pôle Web (dict `services.items[0].tags`) */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              width: "100%",
              justifyContent: center ? "center" : "flex-start",
            }}
          >
              {["Next.js", "Node.js", "PostgreSQL", "Multi-tenant"].map((label, i) => (
                <Chip key={label} label={label} start={22} index={i} />
              ))}
          </div>

          {/* Usages couverts — mono, faint */}
          <div
            style={{
              width: "100%",
              textAlign: center ? "center" : "left",
              fontFamily: "var(--mono)",
              fontSize: type.micro,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#757D8F",
              opacity: interpolate(frame, [92, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            Dashboards · Client portals · Internal tools
          </div>
        </SafeArea>
      </AbsoluteFill>
    </SceneShell>
  );
};
