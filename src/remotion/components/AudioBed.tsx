import React from "react";
import { Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

/**
 * Lit audio commune aux deux films : fond musical avec ducking sous la voix,
 * segments de voix off placés d'après la timeline mesurée, SFX posés sur
 * l'axe absolu du montage.
 *
 * Le ducking est piloté par les bornes RÉELLES des segments (timings.json) :
 * la musique recule de `musicVolume` à `duckLevel` avec des rampes de 6 frames,
 * donc jamais de clic.
 */
export type AudioSegment = { from: number; durationInFrames: number };
export type AudioSfx = { src: string; at: number; volume: number };

export const AudioBed: React.FC<{
  music: string;
  voiceSrcs: string[];
  segments: readonly AudioSegment[];
  sfx?: AudioSfx[];
  musicVolume?: number;
  duckLevel?: number;
  voiceVolume?: number;
}> = ({ music, voiceSrcs, segments, sfx = [], musicVolume = 0.34, duckLevel = 0.16, voiceVolume = 0.95 }) => {
  const frame = useCurrentFrame();

  let duck = 0;
  for (const s of segments) {
    const a = s.from - 6;
    const b = s.from + s.durationInFrames + 6;
    const inRamp = interpolate(frame, [a - 6, a + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    const outRamp = interpolate(frame, [b - 6, b + 6], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    duck = Math.max(duck, Math.min(inRamp, outRamp));
  }

  return (
    <>
      <Audio src={staticFile(music)} volume={musicVolume - (musicVolume - duckLevel) * duck} />

      {segments.map((s, i) => (
        <Sequence key={`vo-${i}`} from={s.from} durationInFrames={s.durationInFrames + 4} name={`VO ${i + 1}`}>
          <Audio src={staticFile(voiceSrcs[i])} volume={voiceVolume} />
        </Sequence>
      ))}

      {sfx.map((s, i) => (
        <Sequence key={`sfx-${i}`} from={s.at} durationInFrames={90} name={`SFX ${i + 1}`}>
          <Audio src={staticFile(s.src)} volume={s.volume} />
        </Sequence>
      ))}
    </>
  );
};
