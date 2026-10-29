/**
 * Mix audio des films ATHERIS (VO + musique validée + SFX) sur le MP4 muet
 * rendu par render-engaging.mjs.
 *
 *   $env:PATH="<node_modules\@remotion\compositor-win32-x64-msvc>;$env:PATH"
 *   node scripts/mix-film.mjs <ad|global|crm> <in.mp4> <out.mp4>
 *
 * Choix de mixique (consignes client) :
 *  - la MUSIQUE est celle validée par le client → jamais retouchée dans son
 *    timbre, seulement duckée sous la voix ;
 *  - les SFX restent SUBTILS (0,05 – 0,11) ;
 *  - la VO est remontée en 48 kHz (Kokoro sort en 24 kHz) avant mix.
 *
 * ATTENTION : la build ffmpeg de Remotion n'a ni muxer `f32le` ni `pcm_*` →
 * tout passe par des WAV (muxer `wav` présent).
 */
import { spawn } from "node:child_process";
import { readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";

const [, , film, inMp4, outMp4] = process.argv;
if (!film || !inMp4 || !outMp4) {
  console.error("usage: node scripts/mix-film.mjs <ad|global|crm> in.mp4 out.mp4");
  process.exit(1);
}

const SR = 48000;
const run = (args) => new Promise((res, rej) => {
  const p = spawn("ffmpeg", args, { stdio: ["ignore", "inherit", "inherit"] });
  p.on("close", (c) => (c ? rej(new Error("ffmpeg " + c)) : res()));
});

/** Durée lue dans la boîte mvhd — les brouillons sont MUETS (pas de
 *  `buildAudio` : la musique est ajoutée ici), donc on ne peut pas extraire
 *  de piste audio pour connaître la longueur. */
const readMp4Duration = async (file) => {
  const b = await readFile(file);
  const box = (s, e, name) => {
    let p = s;
    while (p < e - 8) {
      const size = b.readUInt32BE(p), t = b.toString("latin1", p + 4, p + 8);
      if (t === name) return { p, size };
      p += size;
    }
    return null;
  };
  const moov = box(0, b.length, "moov");
  const mvhd = box(moov.p + 8, moov.p + moov.size, "mvhd");
  const v = b[mvhd.p + 8];
  const ts = v === 1 ? b.readUInt32BE(mvhd.p + 28) : b.readUInt32BE(mvhd.p + 20);
  const du = v === 1 ? Number(b.readBigUInt64BE(mvhd.p + 32)) : b.readUInt32BE(mvhd.p + 24);
  return du / ts;
};

/** WAV PCM16 → Float32 INTERLEAVÉ (taille réelle, tolère les headers pipe). */
const readWav = async (file) => {
  const b = await readFile(file);
  if (b.toString("latin1", 0, 4) !== "RIFF") throw new Error(file + " : pas un WAV");
  let o = 12, fmt = null, data = null;
  while (o < b.length - 8) {
    const id = b.toString("latin1", o, o + 4), size = b.readUInt32LE(o + 4);
  if (id === "fmt ") fmt = { ch: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") { data = { at: o + 8, len: size }; break; }
    if (size > b.length) break;
    o += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(file + " : chunk manquant");
  const bytes = fmt.bits / 8;
  const frames = Math.floor(Math.min(data.len, b.length - data.at) / (bytes * fmt.ch));
  const out = new Float32Array(frames * fmt.ch);
  for (let i = 0; i < out.length; i++) out[i] = b.readInt16LE(data.at + i * bytes) / 32768;
  return { data: out, ch: fmt.ch, rate: fmt.rate, frames };
};

/** Charge un WAV en 48 kHz : musique et SFX sont produits en 44,1 kHz — les
 *  plaquer tels quels sur la base 48 kHz les ferait jouer 8,8 % trop lent
 *  ET faux. On remonte par ffmpeg (muxer `wav` + encodeur pcm_s16le dispo). */
const load48k = async (file) => {
  const w = await readWav(file);
  if (w.rate === SR) return w;
  const tmp = file + ".48k.wav";
  await run(["-v", "error", "-y", "-i", file, "-ar", String(SR), "-ac", String(w.ch), tmp]);
  const o = await readWav(tmp);
  await rm(tmp);
  return o;
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

/* ---------------- configuration par film ---------------- */
const CONFIG = {
  // Film 1 — teaser haute énergie 18 s
  ad: {
    vo: "vo4", music: "music-ad.wav",
    // les 2 derniers segments sont RÉCALÉS sur la grille scénique
    // (« Twenty products shipped » = scène PREUVE à 13,0 · « Let's build » = ENDCARD à 15,4)
    voStarts: [0.55, 3.27, 7.03, 13.05, 15.40],
    sfx: [
      { src: "audio/sfx/swoosh.wav", at: 0.0, volume: 0.09 },
      { src: "audio/sfx/hit.wav", at: 1.5, volume: 0.11 },   // flood
      { src: "audio/sfx/pop.wav", at: 4.0, volume: 0.06 },   // triplé 1
      { src: "audio/sfx/pop.wav", at: 5.0, volume: 0.06 },   // triplé 2
      { src: "audio/sfx/pop.wav", at: 6.0, volume: 0.06 },   // triplé 3
      { src: "audio/sfx/whoosh.wav", at: 7.0, volume: 0.08 },
      { src: "audio/sfx/hit.wav", at: 10.0, volume: 0.09 },  // cube → carte
      { src: "audio/sfx/whoosh.wav", at: 13.0, volume: 0.08 },
      { src: "audio/sfx/hit.wav", at: 15.0, volume: 0.08 },  // rétraction
    ],
  },
  // Film 2 — landing complète 45 s (skill explainer-default).
  // `voStarts` = temps de début PAR INDEX DE SEGMENT ; `null` = segment non utilisé
  // (le segment 7 « One stack… » est retiré : la section stack n'existe pas ici).
  global: {
    vo: "vo2", music: "music-global.wav",
    voStarts: [0.9, 34.4, 5.0, 10.9, 15.6, 20.9, null, 30.1, 25.5, 39.6],
    sfx: [
      { src: "audio/sfx/whoosh.wav", at: 4.6, volume: 0.07 },
      { src: "audio/sfx/whoosh.wav", at: 10.5, volume: 0.07 },
      { src: "audio/sfx/whoosh.wav", at: 15.2, volume: 0.07 },
      { src: "audio/sfx/whoosh.wav", at: 20.4, volume: 0.07 },
      { src: "audio/sfx/hit.wav", at: 21.0, volume: 0.09 },      // compteur
      { src: "audio/sfx/whoosh.wav", at: 25.0, volume: 0.07 },
      { src: "audio/sfx/whoosh.wav", at: 29.7, volume: 0.07 },
      { src: "audio/sfx/pop.wav", at: 30.5, volume: 0.055 },      // étape cochée
      { src: "audio/sfx/whoosh.wav", at: 34.0, volume: 0.07 },
      { src: "audio/sfx/whoosh.wav", at: 39.0, volume: 0.07 },
      { src: "audio/sfx/shing.wav", at: 39.6, volume: 0.08 },     // end card
    ],
  },
  // Film 3 — CRM one-take 25 s (abandonné par le client, gardé pour reprise)
  crm: { vo: "vo3", music: "music.wav", voStarts: null, sfx: [] },
};

const cfg = CONFIG[film];
if (!cfg) { console.error("film inconnu :", film, "| attendu:", Object.keys(CONFIG).join(", ")); process.exit(1); }

const timings = JSON.parse(await readFile(`public/audio/${cfg.vo}/timings.json`, "utf8"));
const segs = timings.segments
  .map((s, i) => ({ ...s, start: cfg.voStarts ? cfg.voStarts[i] : s.start }))
  .filter((s) => s.start != null)                       // null = segment retiré
  .sort((a, b) => a.start - b.start);
const scenes = timings.scenes;
console.log(`[${film}] ${segs.length} segments VO · dernier finit à ${(segs.at(-1).start + segs.at(-1).dur).toFixed(2)} s`);

// 1. on part du MUET : le brouillon n'a pas de piste (la musique est ajoutée
//    par ce script). La durée vient de la boîte mvhd.
const dur = await readMp4Duration(inMp4);
const N = Math.ceil(dur * SR);
const left = new Float32Array(N), right = new Float32Array(N);
console.log(`film muet : ${dur.toFixed(2)} s`);

// 2. ducking musique −5 dB sous la voix (rampes 200 ms) — timbre INCHANGÉ
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

// 3. SFX déjà subtils, posés sur les temps forts du montage
for (const s of cfg.sfx) {
  const w = await load48k(`public/${s.src}`);
  const mono = w.ch === 1 ? w.data : null;
  const at = Math.round(s.at * SR);
  if (mono) {
    for (let i = 0; i < mono.length && at + i < left.length; i++) { const v = mono[i] * s.volume; left[at + i] += v; right[at + i] += v; }
  } else {
    for (let i = 0; i < w.frames && at + i < left.length; i++) {
      left[at + i] += w.data[2 * i] * s.volume;
      right[at + i] += w.data[2 * i + 1] * s.volume;
    }
  }
}

// 4. VO remontée à 48 kHz mono (Kokoro = 24 kHz), puis mixée avec ducking
const conv = outMp4 + ".vo48.wav";
for (const s of segs) {
  await run(["-v", "error", "-y", "-i", `public/audio/${cfg.vo}/${path.basename(s.file)}`, "-ar", String(SR), "-ac", "1", conv]);
  const w = await readWav(conv);
  const at = Math.round(s.start * SR);
  for (let i = 0; i < w.frames && at + i < left.length; i++) {
    const g = VO_GAIN * duckAt(at + i);
    const v = w.data[i] * VO_GAIN;
    left[at + i] = left[at + i] * g + v;
    right[at + i] = right[at + i] * g + v;
  }
}
await rm(conv);

// 5. musique validée : posée SANS traitement de timbre, duckée par la VO
{
  const m = await load48k(`public/audio/${cfg.music}`);
  const n = Math.min(m.frames, left.length);
  for (let i = 0; i < n; i++) {
    const g = duckAt(i);
    if (m.ch === 1) { left[i] += m.data[i] * g; right[i] += m.data[i] * g; }
    else { left[i] += m.data[2 * i] * g; right[i] += m.data[2 * i + 1] * g; }
  }
  console.log(`musique ${cfg.music} : ${(m.frames / SR).toFixed(2)} s posée`);
}

// 6. WAV mixé → remux (vidéo copiée, audio normalisé −16 LUFS)
const mixWav = outMp4 + ".mix.wav";
await writeWav(mixWav, left, right);
await run(["-v", "error", "-y", "-i", inMp4, "-i", mixWav,
  "-map", "0:v:0", "-map", "1:a:0", "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
  "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", outMp4]);
await rm(mixWav);
console.log(`-> ${outMp4} (${segs.length} VO · ${cfg.sfx.length} SFX · musique ${cfg.music})`);
