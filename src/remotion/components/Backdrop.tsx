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

/** Index de section `01 — SERVICES` (§2.6) : squelette de lecture.
 *  `center` : variante centrée avec filets des DEUX côtés — utilisée sur les
 *  scènes paires de l'alternance d'alignement (voir VIDEO.md §rythme). */
export const SectionIndex: React.FC<{ n: string; label: string; start?: number; center?: boolean }> = ({
  n,
  label,
  start = 0,
  center = false,
}) => {
  const frame = useCurrentFrame();
  // Révélation rapide (12 f) : l'index doit être lisible DÈS le wipe d'entrée.
  const p = interpolate(frame, [start, start + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const num = <span style={{ color: volt, letterSpacing: "0.18em", fontFamily: "var(--mono)", fontSize: 19, lineHeight: 1 }}>{n}</span>;
  const lab = (
    <span style={{ color: "#757D8F", letterSpacing: "0.18em", fontFamily: "var(--mono)", fontSize: 19, lineHeight: 1 }}>— {label}</span>
  );

  if (center) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: p, lineHeight: 1, width: "100%" }}>
        <div style={{ flex: 1, height: 1, backgroundColor: line2, transform: `scaleX(${p})`, transformOrigin: "right center" }} />
        {num}
        {lab}
        <div style={{ flex: 1, height: 1, backgroundColor: line2, transform: `scaleX(${p})`, transformOrigin: "left center" }} />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, opacity: p, lineHeight: 1 }}>
      {num}
      {lab}
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
/**
 * « LA LUMIÈRE A UNE SOURCE » — **même système que la hero de la landing**
 * (`globals.css`), reparamétré pour le 1080 × 1920 vertical :
 *  - SOURCE : halo froid désaturé ancré en haut-droite (la vidéo n'a pas de
 *    console, l'écran remplaçant l'objet : la lumière vient du même coin),
 *  - CHUTE : lumière ambiante très large en haut à droite,
 *  - puis `VIGNETTE` (ancrage + brume d'horizon) et la grille au sol.
 * Le bleu n'est plus jamais un aplat : c'est une température de lumière.
 */
const NAPPE =
  "radial-gradient(620px 520px at 76% 20%, rgba(170,198,246,0.36), rgba(84,112,178,0.10) 46%, rgba(40,60,110,0.03) 68%, transparent 82%)," +
  "radial-gradient(1200px 900px at 92% 2%, rgba(96,128,205,0.13), transparent 68%)";

/** Chute verticale du fond (la lumière tombe du haut, le bas est encre) —
 *  posée SOUS `withHeroBg` : la scène 4 « obsidienne plate » ne la prend pas. */
const BASE_GRADIENT = "linear-gradient(180deg, #0b0f16 0%, #070910 46%, #06070a 100%)";

/** Vignettage : le radial bas-gauche ancre le texte, le linéaire gère la
 *  tête (0,55 → transparent 26 %, lisibilité des barres UI) et le pied
 *  (transparent 76 % → 0,74 : la grille reste lisible). L'ordre compte :
 *  la BRUME d'horizon est la dernière couche = peinte derrière les deux
 *  voiles d'encre, mais bien PAR-DESSUS la grille (perspective atmosphérique). */
const VIGNETTE =
  "radial-gradient(74% 62% at 0% 100%, rgba(6,7,10,0.90), transparent 74%)," +
  "linear-gradient(to bottom, rgba(6,7,10,0.55) 0%, transparent 26%, transparent 76%, rgba(6,7,10,0.74) 100%)," +
  "radial-gradient(160% 520px at 50% 70%, rgba(150,185,240,0.16), transparent 70%)";

const VERTICAL_GRID =
  "linear-gradient(90deg, rgba(255,255,255,0.34) 1px, transparent 1px)";

/**
 * Géométrie du sol — reprise de `.floor` de la landing :
 * bande de 48 % de hauteur, bord bas à `HEIGHT + 2`, largeur 160 % centrée,
 * `perspective(820px) rotateX(60°)`, origine au centre du bord bas.
 */
const FLOOR = {
  w: WIDTH * 1.6,
  h: HEIGHT * 0.48,
  persp: 820,
  cos: 0.5, // cos(60°)
  sin: 0.8660254, // sin(60°)
  cell: 72,
};

/**
 * Grille au sol — **projection analytique** pour les lignes horizontales.
 *
 * Un calque animé enfoui sous une transformation 3D + `mask-image` était
 * figé au rendu (mesuré : MAD 0,34 au lieu de ~2 entre deux frames). On
 * calcule donc ici la position écran de chaque maille, frame par frame :
 *   scale = P / (P − sinθ·dy)   y = h + cosθ·dy·scale
 * → zéro transform sur les lignes animées, zéro masque, boucle rigoureusement
 *   périodique (phase mod 72), et la fuite en perspective reste exacte.
 * Les lignes verticales ne défilent pas (elles sont parallèles au sens du
 * mouvement) : elles restent en CSS, calque statique.
 */
const FloorGrid: React.FC<{ phase: number }> = ({ phase }) => {
  const rows: Array<{ y: number; left: number; width: number; key: number }> = [];
  for (let k = -1; k <= 40; k++) {
    const dy = -k * FLOOR.cell + phase; // dy croissant → maille vers le spectateur
    const scale = FLOOR.persp / (FLOOR.persp - FLOOR.sin * dy);
    const y = FLOOR.h + FLOOR.cos * dy * scale;
    if (y < -2 || y > FLOOR.h + 2) continue;
    const width = FLOOR.w * scale;
    rows.push({ y, left: (FLOOR.w - width) / 2, width, key: k });
  }

  return (
    <div
      style={{
        position: "absolute",
        left: "-30%",
        right: "-30%",
        bottom: -2,
        height: FLOOR.h,
        overflow: "hidden",
      }}
    >
      {/* Lignes verticales — fuite en perspective, calque statique */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: VERTICAL_GRID,
          backgroundSize: `${FLOOR.cell}px ${FLOOR.cell}px`,
          transform: `perspective(${FLOOR.persp}px) rotateX(60deg)`,
          transformOrigin: "bottom center",
        }}
      />
      {/* Lignes horizontales — projetées et animées par frame */}
      {rows.map((r) => (
        <div
          key={r.key}
          style={{
            position: "absolute",
            top: r.y,
            left: r.left,
            width: r.width,
            height: 1,
            backgroundColor: "rgba(255,255,255,0.34)",
          }}
        />
      ))}
      {/* Voile d'horizon : OPAC au niveau de la ligne d'horizon, mais
          TRANSPARENT aux deux extrémités de la bande — sinon il découpe le
          nappe bleue en plein milieu de cadre (couture visible). */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(to top," +
            " rgba(6,7,10,0) 0%," +
            " rgba(6,7,10,0.22) 34%," +
            " rgba(6,7,10,0.74) 51%," +
            " rgba(6,7,10,0.45) 62%," +
            " rgba(6,7,10,0.12) 78%," +
            " rgba(6,7,10,0) 100%)",
        }}
      />
    </div>
  );
};

export const Backdrop: React.FC<{ variant?: "hero" | "plain" | "final" }> = ({ variant = "plain" }) => {
  const frame = useCurrentFrame();
  const t = frame / 30; // secondes

  // Nappe : respiration + dérive LISIBLES. Fréquence volontairement rapide
  // (la fenêtre de mesure est de 2 s) et amplitude haute — reste locale.
  const nappeScale = 1.06 + 0.07 * Math.sin(t * 0.5);
  const nappeX = Math.sin(t * 0.45) * 5;
  const nappeY = Math.cos(t * 0.4) * 4;

  // Grille au sol : 72 px toutes les 1,8 s, phase croissante = les mailles
  // avancent VERS le spectateur (≈ 22 px/s en bord bas de cadre).
  const floorPhase = ((frame * 72) / (30 * 1.8)) % 72;

  const withHeroBg = variant !== "plain";

  return (
    <AbsoluteFill style={{ backgroundColor: ink }}>
      {withHeroBg && (
        <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          {/* Chute — la lumière tombe du haut, le bas est encre */}
          <div style={{ position: "absolute", inset: 0, backgroundImage: BASE_GRADIENT }} />
          {/* Source — halo de l'instrument, respire et dérive */}
          <div
            style={{
              position: "absolute",
              inset: "-10%",
              backgroundImage: NAPPE,
              transform: `translate(${nappeX}%, ${nappeY}%) scale(${nappeScale})`,
              transformOrigin: "center center",
            }}
          />
          <FloorGrid phase={floorPhase} />
          {/* Vignettage + brume d'horizon (la grille se dissout dans la lumière) */}
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
