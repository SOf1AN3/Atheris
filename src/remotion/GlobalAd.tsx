import React from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { VO_TIMELINE as T } from "./data/voice2";
import { structure, emotion, mono } from "./fonts";
import { AudioBed } from "./components/AudioBed";
import { Hook } from "./scenes/Hook";
import { Disciplines } from "./scenes/global/Disciplines";
import { ServiceWeb } from "./scenes/ServiceWeb";
import { ServiceMobile } from "./scenes/ServiceMobile";
import { DesktopCloud } from "./scenes/global/DesktopCloud";
import { Portfolio } from "./scenes/global/Portfolio";
import { StackGrid } from "./scenes/global/StackGrid";
import { ProcessBig } from "./scenes/global/ProcessBig";
import { Testimonial } from "./scenes/global/Testimonial";
import { CallToAction } from "./scenes/CallToAction";

/**
 * FILM 2 — « GLOBAL » 45 s : la landing entière, scène par scène.
 * Les bornes viennent de `data/voice2.ts` (calculées depuis la VO réelle) :
 * la vidéo ne devine jamais les timings.
 *
 * Ordre = ordre de la landing : hook → pôles → web → mobile → desktop/cloud
 * → réalisations → stack → process → témoignage → CTA.
 *
 * Rythme d'alignement : **C · L · C · L · C · L · C · L · C · C**
 * — chaque scène bascote de côté par rapport à la précédente, ce qui équilibre
 *   la colonne (défaut « presque tout à gauche » relevé en revue), et le CTA
 *   final est parfaitement centré. Ne tombe jamais dans l'interdit §2.8
 *   (« tous les titres centrés »).
 */
const SCENES: Array<React.FC> = [
  Hook, // C
  Disciplines, // L
  () => <ServiceWeb index="02" label="WEB & SAAS" center />, // C
  () => <ServiceMobile index="03" label="MOBILE" />, // L
  DesktopCloud, // C
  Portfolio, // L
  StackGrid, // C
  ProcessBig, // L
  Testimonial, // C
  CallToAction, // C — perfectement centré
];

/** SFX posés sur l'axe absolu — volume « subtil » validé sur le film 1. */
const SFX = [
  { src: "audio/sfx/swoosh.wav", at: T.scenes[0].from, volume: 0.1 }, // filet initial
  ...[1, 2, 3, 4, 6, 7].map((i) => ({
    src: "audio/sfx/whoosh.wav",
    at: T.scenes[i].from,
    volume: 0.08, // transitions à wipe
  })),
  { src: "audio/sfx/hit.wav", at: T.scenes[5].from, volume: 0.12 }, // coupe franche → réalisations
  { src: "audio/sfx/hit.wav", at: T.scenes[8].from, volume: 0.1 }, // coupe franche → témoignage
  { src: "audio/sfx/ding.wav", at: T.scenes[5].from + 22, volume: 0.07 }, // métriques du portfolio
  { src: "audio/sfx/shing.wav", at: T.scenes[9].from + 46, volume: 0.1 }, // CTA
];

export const GlobalAd: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: "#06070A",
      // Les 3 voix typographiques exposées en variables (§2.2)
      ["--structure" as string]: structure,
      ["--emotion" as string]: emotion,
      ["--mono" as string]: mono,
    }}
  >
    <AudioBed
      music="audio/music-global.wav"
      voiceSrcs={T.segments.map((s) => s.src)}
      segments={T.segments}
      sfx={SFX}
    />

    {/* Scènes bornées dans le temps — la dernière du DOM peint au-dessus,
        ce qui donne le sens des wipes. Pas de wrapper zIndex : un calque
        isolé par scène figerait l'animation de fond au rendu (constaté). */}
    {SCENES.map((Scene, i) => (
      <Sequence
        key={i}
        from={T.scenes[i].from}
        durationInFrames={T.scenes[i].durationInFrames}
        name={`Scène ${i + 1}`}
      >
        <Scene />
      </Sequence>
    ))}
  </AbsoluteFill>
);
