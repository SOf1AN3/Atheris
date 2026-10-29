import React from "react";
import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { line, line2, radius, surface, type, volt } from "../../theme";
import { SectionIndex } from "../../components/Backdrop";
import { TwoVoiceTitle } from "../../components/Type";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";

/**
 * Portfolio — source : `cases.items` (src/content/fr.ts), avec les VRAIES
 * captures produit de `public/projects/`. Une seule donnée volt par carte
 * (la métrique) ; la catégorie reste en `muted` (arbitrage DESIGN.md).
 *
 * `bright` : factor d'égalisation PAR IMAGE. Les 4 captures viennent de
 * produits au thème très différent (mesuré : moyennes 65,7 / 61,3 / 18,0 /
 * 35,1 sur 255) — sans normalisation, la grille lit comme « 2 captures
 * claires + 2 sombres ». On vise une moyenne ~40 pour les 4.
 */
const PROJECTS = [
  { img: "projects/dental.jpg", title: "Clinic SaaS", metric: "+100h", label: "saved / year", bright: 0.37 },
  { img: "projects/papernote.jpg", title: "Papernote AI", metric: "8s", label: "per document", bright: 0.39 },
  { img: "projects/delyx.jpg", title: "Delyx Delivery", metric: "Live", label: "GPS tracking", bright: 1.5 },
  { img: "projects/tiberium.jpg", title: "Tiberium", metric: "99ms", label: "message latency", bright: 0.68 },
];

const CARD_W = 370;
const CARD_H = 400;

export const Portfolio: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <SceneShell variant="cut" backdrop="hero">
      <SafeArea gap={22} style={{ paddingBottom: 14 }}>
        <SectionIndex n="05" label="SELECTED WORK" start={0} />

        <TwoVoiceTitle
          parts={[{ text: "Twenty products," }, { text: "shipped.", voice: "emotion" }]}
          start={0}
          stagger={2.2}
          size={56}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 22 }}>
          {PROJECTS.map((p, i) => {
            // Cascade resserrée (×6) : les 4 cartes doivent être en place bien
            // avant la fin de la scène (4,3 s), pas à la limite.
            const t = 10 + i * 6;
            const on = interpolate(frame, [t, t + 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={p.title}
                style={{
                  width: CARD_W,
                  height: CARD_H,
                  backgroundColor: surface,
                  border: `1px solid ${line}`,
                  borderTop: `1px solid ${line2}`,
                  borderRadius: radius.card,
                  overflow: "hidden",
                  opacity: on,
                  transform: `translateY(${(1 - on) * 26}px)`,
                }}
              >
                {/* Capture produit réelle, traitée pour rester dans l'obsidienne :
                    désaturée + assombrie + voile encre — 4 captures de thèmes
                    différents doivent lire comme UNE famille. */}
                <div style={{ position: "relative", height: 236 }}>
                  <Img
                    src={staticFile(p.img)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      filter: `saturate(0.5) brightness(${p.bright}) contrast(1.1)`,
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, rgba(16,19,25,1) 6%, rgba(16,19,25,0.55) 45%, rgba(6,7,10,0.55) 100%)",
                    }}
                  />
                </div>
                <div style={{ padding: "18px 22px" }}>
                  <div
                    style={{
                      fontFamily: "var(--structure)",
                      fontSize: 30,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      color: "#F4F2ED",
                      marginBottom: 10,
                    }}
                  >
                    {p.title}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                    <span style={{ fontFamily: "var(--structure)", fontSize: 40, fontWeight: 700, color: volt, letterSpacing: "-0.03em" }}>
                      {p.metric}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 19,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: "#8A909E",
                      }}
                    >
                      {p.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: type.micro,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#757D8F",
            opacity: interpolate(frame, [58, 74], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
          }}
        >
          SaaS · AI · Delivery · Real-time
        </div>
      </SafeArea>
    </SceneShell>
  );
};
