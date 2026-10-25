import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { EASE, GUTTER, HEIGHT, WIDTH, ink, line, line2, volt } from "../theme";

/**
 * Grain — PNG SVG `feTurbulence` en overlay, opacity .045, non interactif (§2.4).
 * Passé en data-URI : Chrome le met en cache, aucun coût par frame.
 */
const GRAIN_URI =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/></filter><rect width='220' height='220' filter='url(%23n)'/></svg>\")";

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.045 }) => (
  <AbsoluteFill
    style={{
      backgroundImage: GRAIN_URI,
      backgroundRepeat: "repeat",
      opacity,
      mixBlendMode: "overlay",
      pointerEvents: "none",
    }}
  />
);

/** Filet horizontal qui se dessine en scaleX 0→1, origine à gauche (M14). */
export const Hairline: React.FC<{
  start?: number;
  duration?: number;
  color?: string;
  thickness?: number;
  width?: string | number;
  delay?: number;
}> = ({ start = 0, duration = 24, color = line2, thickness = 1, width = "100%", delay = 0 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start + delay, start + delay + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <div
      style={{
        width,
        height: thickness,
        backgroundColor: color,
        transform: `scaleX(${p})`,
        transformOrigin: "left center",
      }}
    />
  );
};

/** Index de section `01 — SERVICES` (§2.6) : squelette de lecture. */
export const SectionIndex: React.FC<{ n: string; label: string; start?: number }> = ({ n, label, start = 0 }) => {
  const frame = useCurrentFrame();
  // Révélation rapide (12 f) : l'index doit être lisible DÈS le wipe d'entrée.
  const p = interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: p, lineHeight: 1 }}>
      <span style={{ color: volt, letterSpacing: "0.18em", fontFamily: "var(--mono)", fontSize: 19, lineHeight: 1 }}>{n}</span>
      <span style={{ color: "#757D8F", letterSpacing: "0.18em", fontFamily: "var(--mono)", fontSize: 19, lineHeight: 1 }}>— {label}</span>
      <div style={{ flex: 1, height: 1, backgroundColor: line2, transform: `scaleX(${p})`, transformOrigin: "left center" }} />
    </div>
  );
};

/** Badge / tag : pill, hairline, mono UPPERCASE (§2.6). */
export const Chip: React.FC<{ label: string; start?: number; index?: number; voltAccent?: boolean }> = ({
  label,
  start = 0,
  index = 0,
  voltAccent = false,
}) => {
  const frame = useCurrentFrame();
  const t = start + index * 5; // cascade +80 ms ≈ 2,4 frames... on reste lisible : 5 f
  const p = interpolate(frame, [t, t + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "11px 18px",
        borderRadius: 999,
        border: `1px solid ${voltAccent ? "rgba(204,255,74,0.35)" : line2}`,
        backgroundColor: voltAccent ? "rgba(204,255,74,0.08)" : "transparent",
        color: voltAccent ? volt : "#C9CDD6",
        fontFamily: "var(--mono)",
        fontSize: 21,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`,
      }}
    >
      {label}
    </div>
  );
};

/** Point de signal : pulse unique (« ceci compte »). */
export const VoltDot: React.FC<{ start?: number; size?: number }> = ({ start = 0, size = 12 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const ring = interpolate(frame, [start + 6, start + 40], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ position: "relative", width: size, height: size, opacity: p }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 999,
          backgroundColor: volt,
          boxShadow: `0 0 24px rgba(204,255,74,0.55)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: -4,
          borderRadius: 999,
          border: `1px solid ${volt}`,
          opacity: (1 - ring) * 0.5,
          transform: `scale(${1 + ring * 1.4})`,
        }}
      />
    </div>
  );
};

/**
 * Fond « instrument » — **transposé depuis la hero de la landing**
 * (`globals.css` : `.hero-nappe` + `.floor` + `.hero-vignette`), puis ANIMÉ :
 *  - la nappe froide respire et dérive lentement (transform uniquement, §3.2.5),
 *  - la grille au sol défile en perspective (comme `floor-move`, mais piloté
 *    par la frame pour rester déterministe au rendu),
 *  - le vignettage d'ancrage reste fixe.
 * Aucun CSS `animation` : Chrome ne les synchro pas frame par frame.
 */
const NAPPE =
  "radial-gradient(940px 660px at 74% 34%, rgba(52,102,255,0.78), transparent 64%)," +
  "radial-gradient(760px 540px at 96% 60%, rgba(34,64,205,0.44), transparent 66%)," +
  "radial-gradient(780px 540px at 10% 2%, rgba(36,62,180,0.34), transparent 72%)," +
  "radial-gradient(900px 700px at 4% 92%, rgba(12,18,52,0.9), transparent 70%)";

/** Vignettage : le fondu bas est adouci (74 % → 100 %) pour ne pas éteindre
 *  la dernière ligne de contenu, qui vit à ~75 % de la hauteur. */
const VIGNETTE =
  "radial-gradient(74% 62% at 0% 100%, rgba(6,7,10,0.94), transparent 74%)," +
  "linear-gradient(to bottom, rgba(6,7,10,0.42) 0%, transparent 30%, transparent 74%, rgba(6,7,10,0.90) 100%)";

const FLOOR_GRID =
  "linear-gradient(rgba(255,255,255,0.24) 1px, transparent 1px)," +
  "linear-gradient(90deg, rgba(255,255,255,0.24) 1px, transparent 1px)";

export const Backdrop: React.FC<{ variant?: "hero" | "plain" | "final" }> = ({ variant = "plain" }) => {
  const frame = useCurrentFrame();
  const t = frame / 30; // secondes

  // Nappe : respiration + dérive LISIBLES (les amplitudes « site » sont trop
  // discrètes en vidéo : 8 px en 2 s ne se voit pas). Reste locale, jamais
  // saturée — on ne déplace que des transforms (§3.2.5).
  const nappeScale = 1.05 + 0.075 * Math.sin(t * 0.34);
  const nappeX = Math.sin(t * 0.31) * 4.2;
  const nappeY = Math.cos(t * 0.26) * 3.4;

  // Grille au sol : 72 px toutes les 4 s (le site fait 72 px / 14 s).
  // Défilement continu piloté par la frame → déterministe au rendu.
  const floorY = ((frame * 72) / (30 * 4)) % 72;

  const withHeroBg = variant !== "plain";

  return (
    <AbsoluteFill style={{ backgroundColor: ink }}>
      {withHeroBg && (
        <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {/* Nappe froide localisée */}
          <div
            style={{
              position: "absolute",
              inset: "-10%",
              backgroundImage: NAPPE,
              transform: `translate(${nappeX}%, ${nappeY}%) scale(${nappeScale})`,
              transformOrigin: "center center",
            }}
          />
          {/* Grille au sol en perspective, qui défile */}
          <div
            style={{
              position: "absolute",
              left: "-30%",
              right: "-30%",
              bottom: -2,
              height: "48%",
              backgroundImage: FLOOR_GRID,
              backgroundSize: "72px 72px",
              backgroundPosition: `0 ${floorY}px, 0 ${floorY}px`,
              transform: "perspective(820px) rotateX(60deg)",
              transformOrigin: "bottom center",
              maskImage: "linear-gradient(to top, rgba(0,0,0,0.95), transparent 78%)",
              WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.95), transparent 78%)",
            }}
          />
          {/* Vignettage d'ancrage */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: VIGNETTE }} />
        </div>
      )}

      {/* Colonne hairline — squelette de lecture du site, conservé partout */}
      {[GUTTER, WIDTH / 2, WIDTH - GUTTER].map((x, i) => (
        <div
          key={`v${i}`}
          style={{ position: "absolute", left: x, top: 0, width: 1, height: HEIGHT, backgroundColor: line }}
        />
      ))}
      <div style={{ position: "absolute", left: 0, top: 0, width: WIDTH, height: 1, backgroundColor: line }} />
      <div style={{ position: "absolute", left: 0, bottom: 0, width: WIDTH, height: 1, backgroundColor: line }} />
      <Grain />
    </AbsoluteFill>
  );
};
