import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { line, line2, radius, surface3, type, volt } from "../../theme";
import { emotion, structure } from "../../fonts";
import { Hairline, SectionIndex } from "../../components/Backdrop";
import { SceneShell } from "../../components/SceneShell";
import { SafeArea } from "../../components/SafeArea";

/** Témoignage — source : `testimonials[0]` (src/content/fr.ts). */
const QUOTE = "Over a hundred hours saved a year — and code we fully own.";

/**
 * S9 — Témoignage : rupture d'échelle typographique (§2.5). La citation est
 * en serif italique sur PLUSIEURS mots : ici c'est une citation, pas un titre
 * — la règle « 1 à 3 mots » s'applique aux titres de section.
 */
export const Testimonial: React.FC = () => {
  const frame = useCurrentFrame();

  const on = (from: number, dur = 22) =>
    interpolate(frame, [from, from + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <SceneShell variant="cut" backdrop="hero">
      <SafeArea gap={30} style={{ paddingBottom: 20 }} align="center">
        <SectionIndex n="08" label="CLIENTS" start={0} center />

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", width: "100%" }}>
          {/* Guillemet d'ouverture — signal de rupture éditoriale */}
          <div
            style={{
              fontFamily: emotion,
              fontSize: 150,
              lineHeight: 0.6,
              color: "rgba(244,242,237,0.16)",
              opacity: on(4),
              marginBottom: 18,
            }}
          >
            “
          </div>

          <div
            style={{
              fontFamily: emotion,
              fontStyle: "italic",
              fontSize: 56,
              lineHeight: 1.22,
              letterSpacing: "-0.015em",
              color: "#F4F2ED",
              textAlign: "center",
              maxWidth: 740,
              opacity: on(12),
              transform: `translateY(${(1 - on(12)) * 22}px)`,
            }}
          >
            {QUOTE}
          </div>

          <div style={{ marginTop: 40, opacity: on(34), width: "100%" }}>
            <Hairline start={34} duration={22} />
          </div>

          {/* Auteur — centré */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 20,
              marginTop: 28,
              opacity: on(44),
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 999,
                backgroundColor: surface3,
                border: `1px solid ${line2}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: structure,
                fontWeight: 600,
                fontSize: 28,
                color: "#C9CDD6",
                flexShrink: 0,
              }}
            >
              AB
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--structure)", fontSize: 32, fontWeight: 600, color: "#F4F2ED", letterSpacing: "-0.02em" }}>
                Ahcen B.
              </div>
              <div style={{ fontFamily: "var(--structure)", fontSize: 24, color: "#8A909E", marginTop: 4 }}>
                Founder — Dental Clinic · CLINIQUE+
              </div>
            </div>
          </div>
        </div>

        {/* Badge « projet vérifié » — état, donc volt autorisé, mais en pastille
            fine : jamais un second aplat (§2.1) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 14,
            width: "100%",
            opacity: on(58),
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              borderRadius: radius.pill,
              border: "1px solid rgba(204,255,74,0.35)",
              backgroundColor: "rgba(204,255,74,0.08)",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: 999, backgroundColor: volt, display: "inline-block" }} />
            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: 19,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: volt,
              }}
            >
              Verified project
            </span>
          </div>
          <span style={{ fontFamily: "var(--mono)", fontSize: type.micro, letterSpacing: "0.14em", color: "#757D8F" }}>
            + 19 others
          </span>
        </div>
      </SafeArea>
    </SceneShell>
  );
};
