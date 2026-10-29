/**
 * Mix de la voix off sur la piste sonore du film 3 (skill explainer-engaging).
 *
 * Le skill rend la vidéo avec sa bande-son (musique + effets de contact,
 * normalisée à −16 LUFS par render.mjs). Le brief demande une VO anglaise :
 * on la superpose ICI, après coup — impossible de la passer par buildAudio
 * (fichier local non chargeable depuis file://).
 *
 *   $env:PATH="<dir ffmpeg remotion>;$env:PATH"
 *   node scripts/mix-crm-vo.mjs out/crm/draft.mp4 out/crm/draft-vo.mp4
 *
 * ATTENTION : la build ffmpeg embarquée par Remotion n'a NI le muxer `f32le`
 * NI `pcm_*` — tout passe donc par des fichiers WAV (muxer `wav` présent).
 *
 * - timings RÉELS lus dans public/audio/vo3/timings.json
 * - ducking musique −5 dB sous la voix (rampes de 200 ms)
 * - sortie : vidéo copiée, audio AAC 192k, loudnorm −16 LUFS
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const [, , inMp4, outMp4] = process.argv;
if (!inMp4 || !outMp4) { console.error("usage: node scripts/mix-crm-vo.mjs in.mp4 out.mp4"); process.exit(1); }

const SR = 48000;
const run = (args) => new Promise((res, rej) => {
  const p = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  p.on("close", (c) => (c ? rej(new Error("ffmpeg " + c)) : res()));
});

/** WAV PCM16 → Float32 INTERLEAVÉ (taille réelle, tolère les headers pipe). */
const readWav = async (file) => {
  const b = await readFile(file);
  if (b.toString("latin1", 0, 4) !== "RIFF") throw new Error(file + " : pas un WAV");
  let o = 12, fmt = null, data = null;
  while (o < b.length - 8) {
    const id = b.toString("latin1", o, o + 4), size = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { ch: b.readUInt16LE(o + 10), bits: b.readUInt16LE(o + 22) };
    if (id === "data") { data = { at: o + 8, len: size }; break; }
    if (size > b.length) break;
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(file + " : chunk manquant");
  const bytes = fmt.bits / 8, frames = Math.floor(Math.min(data.len, b.length - data.at) / (bytes * fmt.ch));
  const out = new Float32Array(frames * fmt.ch);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(data.at + i * bytes) / 32768;
  return { data: out, ch: fmt.ch, frames };
};

const writeWav = async (file, L, R) => {
  const n = L.length, dataBytes = n * 4, buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + dataBytes, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), o); o += 2;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), o); o += 2;
  }
  await writeFile(file, buf);
};

const timings = JSON.parse(await readFile("public/audio/vo3/timings.json", "utf8"));
const segs = timings.segments;
console.log(`VO : ${segs.length} segments, dernier finit à ${(segs.at(-1).start + segs.at(-1).dur).toFixed(2)} s`);

// 1. piste du film → WAV (muxer dispo)
const srcWav = outMp4 + ".src.wav";
await run(["-v", "error", "-y", "-i", inMp4, "-f", "wav", "-ar", String(SR), "-ac", "2", srcWav]);
const src = await readWav(srcWav);
const left = new Float32Array(src.frames), right = new Float32Array(src.frames);
for (let i = 0; i < src.frames; i++) { left[i] = src.data[2 * i]; right[i] = src.data[2 * i + 1]; }
console.log(`film : ${(src.frames / SR).toFixed(2)} s · ${src.ch} canaux`);

// 2. ducking musique −5 dB sous la voix, rampes de 200 ms
const VO_GAIN = 0.92, DUCK = 0.56;
const duckAt = (frame) => {
  const t = frame / SR;
  let d = 0;
  for (const s of segs) {
    const a = s.start - 0.25, b = s.start + s.dur + 0.25;
    const inR = Math.min(1, Math.max(0, (t - a) / 0.2));
    const outR = Math.min(1, Math.max(0, (b - t) / 0.25));
    d = Math.max(d, Math.min(inR, outR));
  }
  return 1 - (1 - DUCK) * d;
};

// 3. remonte chaque segment à 48 kHz mono (Kokoro sort du 24 kHz — le plaquer
//    tel quel sur la base 48k le ferait jouer à DEMI-VITESSE), puis mixe.
const convWav = outMp4 + ".vo48.wav";
for (const s of segs) {
  const src = `public/audio/vo3/${path.basename(s.file)}`;
  await run(["-v", "error", "-y", "-i", src, "-ar", String(SR), "-ac", "1", convWav]);
  const w = await readWav(convWav);
  const at = Math.round(s.start * SR);
  for (let i = 0; i < w.frames && at + i < left.length; i++) {
    const g = VO_GAIN * duckAt(at + i);
    const v = w.data[i] * VO_GAIN;
    left[at + i] = left[at + i] * g + v;
    right[at + i] = right[at + i] * g + v;
  }
}

// 4. WAV mixé → remux (vidéo copiée)
const mixWav = outMp4 + ".mix.wav";
await writeWav(mixWav, left, right);
await run(["-v", "error", "-y", "-i", inMp4, "-i", mixWav,
  "-map", "0:v:0", "-map", "1:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", outMp4]);
await rm(srcWav); await rm(mixWav); await rm(convWav);
console.log(`\n-> ${outMp4} — ${segs.length} segments VO mixés`);
