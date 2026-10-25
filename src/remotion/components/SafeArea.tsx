import React from "react";
import { SAFE_H, SAFE_LEFT, SAFE_TOP, SAFE_W } from "../theme";

/**
 * Boîte de sécurité — TODO contenu lisible vit ici.
 * Voir `theme.ts` (SAFE) : TikTok/Reels/Shorts cachent le bord droit (boutons
 * d'action) et le bas (légende, @pseudo, CTA, musique). On ne joue donc JAMAIS
 * sur les 1080×1920 pleins : on compose dans 802×1260.
 */
export const SafeArea: React.FC<{
  children: React.ReactNode;
  justify?: "space-between" | "center" | "flex-start";
  gap?: number;
  align?: "stretch" | "flex-start" | "center" | "flex-end";
  style?: React.CSSProperties;
}> = ({ children, justify = "space-between", gap = 0, align = "stretch", style }) => (
  <div
    style={{
      position: "absolute",
      top: SAFE_TOP,
      left: SAFE_LEFT,
      width: SAFE_W,
      height: SAFE_H,
      display: "flex",
      flexDirection: "column",
      justifyContent: justify,
      alignItems: align,
      gap,
      ...style,
    }}
  >
    {children}
  </div>
);
