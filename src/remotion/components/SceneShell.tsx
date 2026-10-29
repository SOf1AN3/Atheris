import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "./Backdrop";
import { HEIGHT, SAFE_LEFT, SAFE_W, volt } from "../theme";

/**
 * Easing du wipe : PLUS PROGRESSIF que la courbe standard du site.
 * Avec `EASE` (très « front-loaded »), le filet balayeur traversait tout le
 * cadre en 2 images — invisible. Ici il balaie la boîte de sécurité sur
 * ~8 images, lisiblement.
 */
const EASE_WIPE = Easing.bezier(0.5, 0, 0.2, 1);

/**
 * Coquille de scène : fond opaque + transition d'entrée.
 * - `wipeUp`   : la scène glisse par le bas (S1 → S2), filet volt en tête
 * - `wipeDown` : la scène descend du haut, en opposition (S2 → S3)
 * - `cut`      : coupe franche (S3 → S4 → S5)
 * Zéro cross-fade molle : ça lit « template ».
 */
export const SceneShell: React.FC<{
  variant?: "cut" | "wipeUp" | "wipeDown";
  backdrop?: "hero" | "plain" | "final";
  children: React.ReactNode;
  wipeDuration?: number;
}> = ({ variant = "cut", backdrop, children, wipeDuration = 14 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, wipeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE_WIPE,
  });

  // WIPE = révélation par CLIP, pas par translation.
  // Avec une translation, le contenu de la scène entrante traversait la zone de
  // légende TikTok pendant ~0,5 s. Ici la composition reste figée dans la
  // SafeArea et seule la fenêtre de révélation se déplace.
  const clip = variant === "wipeUp" ? `inset(${(1 - p) * 100}% 0 0 0)` : variant === "wipeDown" ? `inset(0 0 ${(1 - p) * 100}% 0)` : undefined;

  const edgeOpacity = interpolate(frame, [wipeDuration - 2, wipeDuration + 6], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Position absolue du filet balayeur = arête de la fenêtre de révélation.
  // Il ne s'allume QUE dans la boîte de sécurité : hors [190–1450], il reste
  // éteint pour ne pas traverser la barre de recherche ni la zone de légende.
  const edgeY = variant === "wipeUp" ? (1 - p) * HEIGHT : p * HEIGHT;
  const bandOpacity =
    variant === "cut"
      ? 1
      : Math.min(
          interpolate(edgeY, [170, 205], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          interpolate(edgeY, [1435, 1470], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        );

  return (
    // Hors wipe, AUCUN wrapper transformé/clip : sinon Chrome met en cache le
    // calque et fige l'animation de fond (constaté en mesure).
    <AbsoluteFill style={{ clipPath: p < 1 ? clip : undefined }}>
      <Backdrop variant={backdrop ?? (variant === "cut" ? "plain" : "hero")} />
      {variant !== "cut" && p < 1 && (
        <div
          style={{
            position: "absolute",
            // Le filet de balayage reste dans la boîte de sécurité : il ne
            // traverse ni la colonne de boutons ni la barre de recherche.
            left: SAFE_LEFT - 14,
            width: SAFE_W + 28,
            height: 2,
            backgroundColor: volt,
            boxShadow: "0 0 30px rgba(204,255,74,0.6)",
            top: variant === "wipeUp" ? edgeY : edgeY - 2,
            opacity: edgeOpacity * bandOpacity,
          }}
        />
      )}
      {children}
    </AbsoluteFill>
  );
};
