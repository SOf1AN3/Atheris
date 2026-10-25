import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { VO_TIMELINE } from "./data/voice";
import { DURATION } from "./theme";
import { structure, emotion, mono } from "./fonts";
import { Hook } from "./scenes/Hook";
import { ServiceWeb } from "./scenes/ServiceWeb";
import { ServiceMobile } from "./scenes/ServiceMobile";
import { Proof } from "./scenes/Proof";
import { CallToAction } from "./scenes/CallToAction";

const FPS = VO_TIMELINE.fps;
const SCENES = [Hook, ServiceWeb, ServiceMobile, Proof, CallToAction];

/**
 * SFX posés sur l'axe absolu du montage.
 * Retour client v3 : **−50 % sur le niveau précédent** (0,16–0,24 → 0,05–0,12).
 * La musique de fond est explicitement validée : NE PAS Y TOUCHER.
 */
const SFX: Array<{ src: string; at: number; volume: number }> = [
  { src: "audio/sfx/swoosh.wav", at: 0, volume: 0.1 }, // filet volt initial (S1)
  { src: "audio/sfx/whoosh.wav", at: VO_TIMELINE.scenes[1].from, volume: 0.08 }, // wipe S2
  { src: "audio/sfx/whoosh.wav", at: VO_TIMELINE.scenes[2].from, volume: 0.08 }, // wipe S3
  { src: "audio/sfx/hit.wav", at: VO_TIMELINE.scenes[3].from, volume: 0.12 }, // coupe franche S4
  { src: "audio/sfx/ding.wav", at: VO_TIMELINE.scenes[3].from + 10, volume: 0.08 }, // compteur +20
  { src: "audio/sfx/ding.wav", at: VO_TIMELINE.scenes[3].from + 18, volume: 0.05 }, // compteur 100%
  { src: "audio/sfx/shing.wav", at: VO_TIMELINE.scenes[4].from + 46, volume: 0.1 }, // CTA
];

/** Ducking : la musique cède le pas à la voix (−4 dB), en douceur. */
const useMusicDucking = () => {
  const frame = useCurrentFrame();
  let duck = 0;
  for (const s of VO_TIMELINE.segments) {
    const a = s.from - 6;
    const b = s.from + s.durationInFrames + 6;
    const inRamp = interpolate(frame, [a - 6, a + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const outRamp = interpolate(frame, [b - 6, b + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    duck = Math.max(duck, Math.min(inRamp, outRamp));
  }
  return 0.34 - 0.18 * duck;
};

export const Ad: React.FC = () => {
  const musicVolume = useMusicDucking();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#06070A",
        // Les 3 voix typographiques exposées en variables (§2.2)
        ["--structure" as string]: structure,
        ["--emotion" as string]: emotion,
        ["--mono" as string]: mono,
      }}
    >
      {/* Fond musical — bed 30 s synthétisé, ducké sous la VO */}
      <Audio src={staticFile("audio/music.wav")} volume={musicVolume} />

      {/* Voix off — segments placés d'après les mesures réelles de synthèse */}
      {VO_TIMELINE.segments.map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.durationInFrames + 4} name={`VO ${s.id}`}>
          <Audio src={staticFile(s.src)} volume={0.95} />
        </Sequence>
      ))}

      {/* SFX */}
      {SFX.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={s.at} durationInFrames={90} name={`SFX ${i}`}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}

      {/* Scènes — bornes calculées depuis la timeline voix off */}
      {SCENES.map((Scene, i) => (
        <Sequence
          key={i}
          from={VO_TIMELINE.scenes[i].from}
          durationInFrames={VO_TIMELINE.scenes[i].durationInFrames}
          name={`Scène ${i + 1}`}
        >
          <Scene />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

export const TOTAL_FRAMES = DURATION;
