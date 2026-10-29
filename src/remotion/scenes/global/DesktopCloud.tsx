import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line, line2, radius, surface, surface2, surface3, type, volt } from "../../theme";
import { Chip, SectionIndex } from "../../components/Backdrop";
import { TwoVoiceTitle } from "../../components/Type";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";

/** Panneau générique — arête lumière en bord supérieur (§2.4). */
const Panel: React.FC<{ title: string; start: number; children: React.ReactNode; height?: number }> = ({
  title,
  start,
  children,
  height = 300,
}) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 22], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        backgroundColor: surface,
        border: `1px solid ${line}`,
        borderTop: `1px solid ${line2}`,
        borderRadius: radius.card,
        padding: 26,
        width: "100%",
        boxSizing: "border-box",
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: type.micro,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#757D8F",
          marginBottom: 20,
        }}
      >
        {title}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
};

/**
 * S5 — Desktop & Cloud (`services.items[2]` et `[3]`).
 * Deux panneaux empilés — format vertical : on empile, on ne juxtapose pas.
 */
export const DesktopCloud: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell variant="wipeDown" backdrop="hero">
      <SafeArea gap={24} style={{ paddingBottom: 16 }} align="center">
        <SectionIndex n="04" label="DESKTOP & CLOUD" start={0} center />

        <div style={{ width: "100%", textAlign: "center" }}>
          <TwoVoiceTitle
            parts={[{ text: "Desktop tools." }, { text: "Cloud", voice: "emotion" }, { text: "modernisation." }]}
            start={0}
            stagger={2}
            size={54}
            align="center"
          />
        </div>

        {/* Panneau Desktop — fenêtre métier multi-plateforme */}
        <Panel title="Desktop · Electron" start={16} height={250}>
          <div
            style={{
              height: "100%",
              backgroundColor: "#0E1117",
              border: `1px solid ${line2}`,
              borderRadius: radius.field,
              padding: 18,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: surface3 }} />
              ))}
              <div style={{ flex: 1, height: 10, backgroundColor: surface2, marginLeft: 10 }} />
            </div>
            <div style={{ flex: 1, display: "flex", gap: 14 }}>
              <div style={{ width: "26%", backgroundColor: surface2, borderRadius: 8 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                {[0.9, 0.62, 0.78, 0.5].map((w, i) => (
                  <div key={i} style={{ height: 14, width: `${w * 100}%`, backgroundColor: surface2 }} />
                ))}
                <div style={{ height: 4, width: "100%", backgroundColor: line, marginTop: "auto", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: "100%",
                      backgroundColor: "#8A909E",
                      transform: `scaleX(${interpolate(frame, [30, 74], [0.05, 0.66], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                      })})`,
                      transformOrigin: "left center",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </Panel>

        {/* Panneau Cloud — montée en charge */}
        <Panel title="Cloud · Migration & scaling" start={34} height={190}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 120, marginBottom: 18 }}>
            {[0.28, 0.4, 0.55, 0.72, 0.94].map((h, i) => {
              const t = 42 + i * 6;
              const p = interpolate(frame, [t, t + 20], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: h * 120,
                    backgroundColor: i === 4 ? surface3 : surface2,
                    border: `1px solid ${line}`,
                    transform: `scaleY(${p})`,
                    transformOrigin: "bottom center",
                  }}
                />
              );
            })}
            {/* l'unique donnée volt de la scène : l'état cible atteint */}
            <div
              style={{
                width: 56,
                height: 120,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--mono)",
                fontSize: 20,
                color: volt,
                opacity: interpolate(frame, [74, 92], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
              }}
            >
              x10
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {["Audit", "Migration", "Scaling"].map((c, i) => (
              <Chip key={c} label={c} start={64} index={i} />
            ))}
          </div>
        </Panel>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: "100%", justifyContent: "center" }}>
          {["Windows", "macOS", "Linux", "Docker", "AWS"].map((c, i) => (
            <Chip key={c} label={c} start={78} index={i} />
          ))}
        </div>
      </SafeArea>
    </SceneShell>
  );
};
