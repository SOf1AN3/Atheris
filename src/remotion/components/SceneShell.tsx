import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Backdrop } from "./Backdrop";
import { EASE, HEIGHT, SAFE_LEFT, SAFE_W, volt } from "../theme";

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
}> = ({ variant = "cut", backdrop, children, wipeDuration = 12 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [0, wipeDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  const y = variant === "wipeUp" ? (1 - p) * 100 : variant === "wipeDown" ? -(1 - p) * 100 : 0;
  const edgeOpacity = interpolate(frame, [wipeDuration - 2, wipeDuration + 6], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ transform: `translateY(${y}%)` }}>
      <Backdrop variant={backdrop ?? (variant === "cut" ? "plain" : "hero")} />
      {variant !== "cut" && (
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
            top: variant === "wipeUp" ? 0 : HEIGHT - 2,
            opacity: edgeOpacity,
          }}
        />
      )}
      {children}
    </AbsoluteFill>
  );
};
