import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { EASE, fg, line, line2, radius, surface, surface2, surface3, volt } from "../theme";
import { mono } from "../fonts";

/**
 * « Console d'instrument » — preuve d'exécution (§1.4 : un studio qui vend du
 * code doit montrer du code). Arête lumière en bord supérieur (§2.4).
 */
export const ConsoleMockup: React.FC<{ start?: number }> = ({ start = 0 }) => {
  const frame = useCurrentFrame();
  const appear = interpolate(frame, [start, start + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const bars = [0.42, 0.66, 0.35, 0.78, 0.52, 0.9, 0.6, 0.74, 0.46, 0.86];

  return (
    <div
      style={{
        opacity: appear,
        transform: `translateY(${(1 - appear) * 32}px)`,
        backgroundColor: surface,
        border: `1px solid ${line}`,
        borderTop: `1px solid ${line2}`,
        borderRadius: radius.card,
        padding: 30,
        boxShadow: "0 40px 80px -40px rgba(0,0,0,.9)",
      }}
    >
      {/* barre d'entête mono */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
        <span style={{ fontFamily: mono, fontSize: 19, letterSpacing: "0.14em", color: "#757D8F" }}>
          CONSOLE / PROD
        </span>
        <span style={{ fontFamily: mono, fontSize: 19, letterSpacing: "0.14em", color: fg }}>LIVE</span>
      </div>

      {/* graphique : barres en scaleY, origine basse (M18) */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 240, marginBottom: 26 }}>
        {bars.map((h, i) => {
          const t = start + 10 + i * 1.4;
          const p = interpolate(frame, [t, t + 20], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          });
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h * 240,
                backgroundColor: i === bars.length - 1 ? surface3 : surface2,
                border: `1px solid ${line}`,
                transform: `scaleY(${p})`,
                transformOrigin: "bottom center",
              }}
            />
          );
        })}
      </div>

      {/* ligne de progression — l'unique donnée volt de la carte */}
      <div style={{ height: 3, backgroundColor: line, marginBottom: 26, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: "100%",
            backgroundColor: volt,
            transform: `scaleX(${interpolate(frame, [start + 22, start + 56], [0.06, 0.82], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            })})`,
            transformOrigin: "left center",
          }}
        />
      </div>

      {/* lignes skeleton */}
      {[0.72, 0.48, 0.86].map((w, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width: `${w * 100}%`,
            backgroundColor: surface2,
            marginBottom: i < 2 ? 12 : 0,
            opacity: interpolate(frame, [start + 16 + i * 4, start + 30 + i * 4], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      ))}
    </div>
  );
};

/**
 * Maquette téléphone — silhouettes asymétriques (7/5) pour iOS & Android.
 * L'écran « vit » : liste qui se remplit, toggle qui passe à l'état actif
 * (seul aplat volt autorisé de la carte), barre de chargement.
 */
export const PhoneMockup: React.FC<{
  width: number;
  label: string;
  start?: number;
  delay?: number;
  y?: number;
  primary?: boolean;
}> = ({ width, label, start = 0, delay = 0, y = 0, primary = false }) => {
  const frame = useCurrentFrame();
  const t = start + delay;
  const appear = interpolate(frame, [t, t + 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const height = width * 2.02;
  const pad = width * 0.075;

  // toggle : bascule à l'état actif puis se calme
  const toggleOn = frame > t + 40;
  const micro = Math.max(13, width * 0.05);

  /**
   * Contraste volontairement relevé à l'intérieur du boîtier : en vertical, une
   * maquette « obsidienne » pure disparaît sur le téléphone. Le châssis reste
   * en surface, l'INTERFACE qu'il contient se lit comme une interface.
   */
  const UI = {
    body: "#161A22",
    screen: "#090C12",
    row: "#2F3746",
    dot: "#3B4453",
    chrome: "#4A5464",
    track: "rgba(255,255,255,0.13)",
  };

  return (
    <div
      style={{
        width,
        height,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        opacity: appear,
        transform: `translateY(${(1 - appear) * 28 + y}px)`,
        backgroundColor: UI.body,
        border: `1px solid ${line2}`,
        borderRadius: 28,
        padding: pad,
        boxShadow: "0 40px 80px -40px rgba(0,0,0,.9)",
      }}
    >
      {/* encoche + label mono */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: pad * 0.8 }}>
        <div style={{ width: width * 0.22, height: 6, borderRadius: 999, backgroundColor: UI.chrome }} />
        <span style={{ fontFamily: mono, fontSize: micro, letterSpacing: "0.12em", color: "#9AA1AF" }}>{label}</span>
      </div>

      {/* écran — occupe toute la hauteur restante du boîtier */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          backgroundColor: UI.screen,
          border: `1px solid ${line2}`,
          borderRadius: radius.field,
          padding: pad * 0.8,
          overflow: "hidden",
        }}
      >
        {/* barre de statut */}
        <div style={{ display: "flex", gap: 8, marginBottom: pad * 0.7 }}>
          <div style={{ flex: 2, height: 9, backgroundColor: UI.row }} />
          <div style={{ flex: 1, height: 9, backgroundColor: UI.dot }} />
        </div>

        {/* lignes de liste qui se remplissent */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-evenly" }}>
          {[0.9, 0.66, 0.78, 0.5].map((w, i) => {
            const lt = t + 14 + i * 5;
            const p = interpolate(frame, [lt, lt + 16], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            });
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  opacity: p,
                  transform: `translateX(${(1 - p) * 10}px)`,
                }}
              >
                <div style={{ width: 20, height: 20, borderRadius: 999, backgroundColor: UI.dot, flexShrink: 0 }} />
                <div style={{ height: 9, width: `${w * 100}%`, backgroundColor: UI.row }} />
              </div>
            );
          })}
        </div>

        {/* toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: pad * 0.5 }}>
          <div style={{ height: 9, width: "42%", backgroundColor: UI.row }} />
          <div
            style={{
              width: 44,
              height: 24,
              borderRadius: 999,
              // Un seul signal volt par écran : seul le téléphone principal
              // porte l'état actif ; l'autre reste en acier (§2.1).
              backgroundColor: toggleOn ? (primary ? volt : "#B8C7DF") : UI.chrome,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 3,
                left: toggleOn ? 23 : 3,
                width: 18,
                height: 18,
                borderRadius: 999,
                backgroundColor: toggleOn ? "#06070A" : "#C9CDD6",
              }}
            />
          </div>
        </div>

        {/* barre de chargement */}
        <div style={{ height: 4, backgroundColor: UI.track, marginTop: pad * 0.8, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "100%",
              backgroundColor: primary ? "#8A909E" : surface3,
              transform: `scaleX(${interpolate(frame, [t + 26, t + 64], [0.04, 0.7], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: EASE,
              })})`,
              transformOrigin: "left center",
            }}
          />
        </div>
      </div>
    </div>
  );
};
