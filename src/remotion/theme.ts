/**
 * Tokens visuels — transcription stricte du DESIGN.md (§2 « OBSIDIAN INSTRUMENT »).
 * Aucune couleur magique ailleurs : tout passe par ce fichier.
 */
import { Easing, interpolate } from "remotion";

export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FPS = 30;
export const DURATION = 30 * FPS; // 900 frames

/** Tokens fond (obsidienne) */
export const ink = "#06070A";
export const ink2 = "#0A0C11";
export const ink3 = "#0E1117";

/** Tokens surface */
export const surface = "#101319";
export const surface2 = "#161A22";
export const surface3 = "#1D222C";

/** Tokens structure — hairlines */
export const line = "rgba(255,255,255,0.07)";
export const line2 = "rgba(255,255,255,0.14)";
export const line3 = "rgba(255,255,255,0.22)";

/** Tokens texte — blanc CHAUD (§2.1) */
export const fg = "#F4F2ED";
export const fg2 = "#C9CDD6";
export const muted = "#8A909E";
export const faint = "#757D8F";

/** Signal — volt : UNIQUE accent, ≤ 5 % de la surface (§2.1 règle non négociable) */
export const volt = "#CCFF4A";
export const volt2 = "#B8E63C";
export const voltInk = "#06070A";
export const voltDim = "rgba(204,255,74,0.12)";

/** Nappe froide locale (hero uniquement) */
export const coldNappe = "#1B3BAE";

/** Courbe unique de mouvement (§3.1) — zéro rebond, zéro overshoot */
export const EASE = Easing.bezier(0.16, 1, 0.3, 1);
/** Courbe des compteurs : doit *atterrir* */
export const EASE_LAND = Easing.bezier(0.22, 1, 0.36, 1);

/** Échelle typographique — volontairement GROSSE : la vidéo se regarde sur
 *  téléphone en plein écran. Le corps de texte est le minimum confortable
 *  sur un écran 6,1", les titres sont calés pour rester sur 1–2 lignes. */
export const type = {
  display: 96,
  displayL: 84,
  h2: 68,
  h3: 40,
  bodyLg: 34,
  body: 28,
  small: 26,
  micro: 21,
};

/** Gouttière horizontale (container) */
export const GUTTER = 72;

/**
 * ZONE DE SÉCURITÉ — le cadre publicitaire vertical n'est jamais un rectangle
 * plein : TikTok / Reels / Shorts posent leurs boutons d'action à droite, la
 * légende + le CTA en bas, la barre de recherche en haut.
 * Tout contenu lisible (texte, chiffres, CTA, coordonnées) reste DANS ce cadre.
 * Les éléments purement décoratifs (filets, grille, nappe) peuvent le déborder.
 */
export const SAFE = {
  top: 224, // barre de recherche / header
  right: 225, // colonne de boutons (like, comment, share, son)
  bottom: 485, // légende + @pseudo + lien CTA + musique
  left: 82,
} as const;

/** Boîte utile : 773 × 1211 px — MARGE ABSORBÉE par le push-in (scale ≤ 1,02)
 *  et la dérive verticale (≤ 28 px) : même après transformation, AUCUN pixel
 *  lisible ne sort de [68–870] × [190–1450]. */
export const SAFE_LEFT = SAFE.left;
export const SAFE_TOP = SAFE.top;
export const SAFE_W = WIDTH - SAFE.left - SAFE.right;
export const SAFE_H = HEIGHT - SAFE.top - SAFE.bottom;

/** Push-in maximal admis — borné pour ne jamais mordre sur les zones UI */
export const MAX_PUSH = 1.02;

/** Rayons : 3 valeurs max (§2.4) — arrondi = action, carré = contenu */
export const radius = {
  pill: 999,
  card: 20,
  field: 12,
};

/** Interpolation helper — version « atterrissage » pour les compteurs */
export const land = (frame: number, from: number, to: number, duration: number) =>
  interpolate(frame, [from, from + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_LAND,
  });
