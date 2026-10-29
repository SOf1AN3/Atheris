import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line, radius, surface, type } from "../../theme";
import { SectionIndex } from "../../components/Backdrop";
import { TwoVoiceTitle } from "../../components/Type";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";
// Réutilisation directe du composant du projet : les 29 tracés de marques
// embarqués (simple-icons, CC0) — zéro dépendance, zéro requête.
import { TECH_PATHS } from "../../../components/icons/TechIcons";

const KEYS = [
  "NextDotJs",
  "ReactIcon",
  "TypeScript",
  "NodeDotJs",
  "PostgreSQL",
  "Prisma",
  "Flutter",
  "Electron",
  "Docker",
  "AmazonAWS",
  "Vercel",
  "GraphQL",
] as const;

const LABELS: Record<string, string> = {
  NextDotJs: "Next.js",
  ReactIcon: "React",
  TypeScript: "TypeScript",
  NodeDotJs: "Node.js",
  PostgreSQL: "PostgreSQL",
  Prisma: "Prisma",
  Flutter: "Flutter",
  Electron: "Electron",
  Docker: "Docker",
  AmazonAWS: "AWS",
  Vercel: "Vercel",
  GraphQL: "GraphQL",
};

/** Grille de technologies — icônes monochromes (§2.2.2 : jamais de couleur de marque). */
export const StackGrid: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell variant="wipeUp" backdrop="hero">
      <SafeArea gap={26} style={{ paddingBottom: 12 }} align="center">
        <SectionIndex n="06" label="STACK" start={0} center />

        <div style={{ width: "100%", textAlign: "center" }}>
          <TwoVoiceTitle
            parts={[{ text: "A stack chosen to" }, { text: "last.", voice: "emotion" }]}
            start={0}
            stagger={2.2}
            size={56}
            align="center"
          />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 18, width: "100%", justifyContent: "center" }}>
          {KEYS.map((k, i) => {
            // Cascade resserrée : les 12 cellules doivent être en place bien
            // avant la fin de la scène (4,0 s). Pendant la révélation, les
            // cellules encore invisibles OCCUPENT déjà leur place dans la
            // rangée centrée → on raccourcit la fenêtre où la ligne paraît
            // décalée à gauche.
            const t = 4 + i * 2;
            const on = interpolate(frame, [t, t + 18], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={k}
                style={{
                  width: 245,
                  height: 158,
                  backgroundColor: surface,
                  border: `1px solid ${line}`,
                  borderRadius: radius.card,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 14,
                  opacity: on,
                  transform: `translateY(${(1 - on) * 16}px)`,
                }}
              >
                <svg width={50} height={50} viewBox="0 0 24 24" fill="#8A909E" aria-hidden>
                  <path d={TECH_PATHS[k]} />
                </svg>
                <span
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 24,
                    letterSpacing: "0.05em",
                    color: "#C9CDD6",
                  }}
                >
                  {LABELS[k]}
                </span>
              </div>
            );
          })}
        </div>

        <div
          style={{
            width: "100%",
            textAlign: "center",
            fontFamily: "var(--mono)",
            fontSize: type.micro,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#757D8F",
            opacity: interpolate(frame, [62, 78], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          + 17 more · maintained in production
        </div>
      </SafeArea>
    </SceneShell>
  );
};
