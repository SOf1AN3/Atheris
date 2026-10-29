/**
 * Sound design 100 % synthétisé (aucun asset externe, aucune licence).
 * Produit :
 *   public/audio/sfx/{swoosh,whoosh,pop,tick,ding,shing,hit,riser}.wav
 *   public/audio/music.wav          — bed 30 s, La mineur, 120 BPM
 *
 * Écriture WAV PCM 16 bits stéréo 44,1 kHz — lu nativement par Remotion.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SFX_DIR = path.join(ROOT, "public", "audio", "sfx");
const SR = 44100;

/* ------------------------------------------------------------------ WAV IO */
const writeWav = async (file, channels) => {
  const n = channels[0].length;
  const ch = channels.length;
  const dataBytes = n * ch * 2;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * ch * 2, 28);
  buf.writeUInt16LE(ch * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataBytes, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      buf.writeInt16LE(Math.round(s * 32767), o);
      o += 2;
    }
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buf);
};

/* ------------------------------------------------------------------ DSP */
const secs = (s) => Math.round(s * SR);
const noise = (n, seed = 1) => {
  let s = seed >>> 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out[i] = (s / 0xffffffff) * 2 - 1;
  }
  return out;
};
// Enveloppe exponentielle : 1 -> ~0 en `decay` s
const expDecay = (i, decay) => Math.exp(-i / (decay * SR));
// Enveloppe « ataque rapide / relâchement doux » pour les pads
const attack = (i, a) => Math.min(1, i / (a * SR));

const lowpass = (sig, cutoff0, cutoff1 = cutoff0, reso = 0) => {
  const out = new Float32Array(sig.length);
  let lp = 0;
  for (let i = 0; i < sig.length; i++) {
    const t = i / sig.length;
    const fc = (cutoff0 + (cutoff1 - cutoff0) * t) / SR;
    const f = 2 * Math.sin(Math.PI * Math.min(0.45, fc));
    const q = 1 - reso;
    const hp = sig[i] - lp;
    lp += f * hp;
    out[i] = lp * (1 + reso * 2.5);
  }
  return out;
};

const highpass = (sig, cutoff) => {
  const out = new Float32Array(sig.length);
  let lp = 0;
  for (let i = 0; i < sig.length; i++) {
    lp += ((cutoff / SR) * 2 * Math.PI) * (sig[i] - lp);
    out[i] = sig[i] - lp;
  }
  return out;
};

const mixInto = (dst, src, at, gain = 1) => {
  const start = secs(at);
  for (let i = 0; i < src.length && start + i < dst.length; i++) dst[start + i] += src[i] * gain;
};

const normalize = (ch, target = 0.9) => {
  let peak = 0;
  for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak === 0) return ch;
  const g = target / peak;
  for (let i = 0; i < ch.length; i++) ch[i] *= g;
  return ch;
};

const stereo = (mono, spread = 0) =>
  spread === 0 ? [mono, mono.slice()] : [mono, mono.map((v, i) => v * (1 - spread) + (i % 2 ? v : -v * 0.6) * spread)];

/* --------------------------------------------------------------- SFX */
await mkdir(SFX_DIR, { recursive: true });

/** Swoosh sec — balayage de filet (transitions S1) */
{
  const n = secs(0.45);
  const nz = lowpass(noise(n, 7), 300, 6500, 0.12);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    env[i] = Math.sin(Math.PI * Math.pow(t, 0.65)) * (0.35 + 0.65 * Math.pow(t, 2));
  }
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = nz[i] * env[i];
  await writeWav(path.join(SFX_DIR, "swoosh.wav"), stereo(normalize(m, 0.85), 0.35));
}

/** Whoosh long — changement de scène (montée/descente) */
{
  const n = secs(0.7);
  const nz = lowpass(noise(n, 13), 220, 4200, 0.05);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) env[i] = Math.pow(Math.sin(Math.PI * (i / n)), 1.6);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = nz[i] * env[i];
  await writeWav(path.join(SFX_DIR, "whoosh.wav"), stereo(normalize(m, 0.8), 0.5));
}

/** Pop — toggle, chip qui s'allume */
{
  const n = secs(0.12);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    m[i] = Math.sin(2 * Math.PI * (680 - 220 * (t / 0.12)) * t) * expDecay(i, 0.028);
  }
  await writeWav(path.join(SFX_DIR, "pop.wav"), stereo(normalize(m, 0.7), 0.2));
}

/** Tick — battement de mots, index, micro-mouvements */
{
  const n = secs(0.05);
  const nz = highpass(noise(n, 29), 1800);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = nz[i] * expDecay(i, 0.006);
  await writeWav(path.join(SFX_DIR, "tick.wav"), stereo(normalize(m, 0.55), 0.15));
}

/** Ding — compteurs, donnée clé */
{
  const n = secs(0.9);
  const m = new Float32Array(n);
  const f = 1174.7; // R6
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    m[i] =
      (Math.sin(2 * Math.PI * f * t) * 1.0 +
        Math.sin(2 * Math.PI * f * 2.01 * t) * 0.42 +
        Math.sin(2 * Math.PI * f * 3.02 * t) * 0.18) *
      expDecay(i, 0.22);
  }
  await writeWav(path.join(SFX_DIR, "ding.wav"), stereo(normalize(m, 0.75), 0.4));
}

/** Shing — métallique, révélation du CTA */
{
  const n = secs(1.4);
  const m = new Float32Array(n);
  const partials = [784, 1176, 1568, 2352, 3136, 4704];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    partials.forEach((f, k) => {
      v += Math.sin(2 * Math.PI * f * (1 + k * 0.0007) * t) / (k + 1.3);
    });
    m[i] = v * expDecay(i, 0.34) * attack(i, 0.004);
  }
  await writeWav(path.join(SFX_DIR, "shing.wav"), stereo(normalize(m, 0.72), 0.55));
}

/** Hit grave — chute de scène vers la preuve */
{
  const n = secs(1.2);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 92 * Math.exp(-t * 3.2) + 34;
    m[i] = Math.sin(2 * Math.PI * f * t) * expDecay(i, 0.35);
  }
  const nz = lowpass(noise(n, 3), 900, 160, 0.1);
  for (let i = 0; i < n; i++) m[i] += nz[i] * expDecay(i, 0.06) * 0.5;
  await writeWav(path.join(SFX_DIR, "hit.wav"), stereo(normalize(m, 0.9), 0.1));
}

/** Riser — montée de tension avant le CTA (utilisé tel quel ou découpé) */
{
  const n = secs(3.0);
  const nz = lowpass(noise(n, 41), 260, 7800, 0.08);
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) m[i] = nz[i] * Math.pow(i / n, 2.4);
  const t = [...Array(n)].map((_, i) => (i / SR));
  for (let i = 0; i < n; i++) m[i] += Math.sin(2 * Math.PI * (180 + 620 * (i / n)) * t[i]) * Math.pow(i / n, 3) * 0.25;
  await writeWav(path.join(SFX_DIR, "riser.wav"), stereo(normalize(m, 0.7), 0.5));
}

console.log("8 SFX générés dans public/audio/sfx/");

/* --------------------------------------------------------------- MUSIQUE */
/** Bed 30 s — obsidienne sonore : drone + pad La mineur + pulsation + riser */
const DUR = Number(process.env.DUR ?? 30);
const N = secs(DUR);
const L = new Float32Array(N);
const R = new Float32Array(N);

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const midi = (name) => {
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const m = /^([A-G])(#?)(-?\d)$/.exec(name);
  return 12 * (+m[3] + 1) + map[m[1]] + (m[2] ? 1 : 0);
};

/** Pad : 3 voix saw filtrées, attaque longue — progression GÉNÉRÉE pour
 *  s'adapter à la durée (30 s ou 45 s) : cycle Am F C G toutes les 6 s,
 *  retour sur Am pour les 6 dernières secondes. */
const CYCLE = [
  ["A2", "E3", "A3", "C4"], // Am
  ["F2", "C3", "F3", "A3"], // F
  ["C3", "G3", "C4", "E4"], // C
  ["G2", "D3", "G3", "B3"], // G
];
const CHORDS = [];
{
  let k = 0;
  for (let at = 0; at < DUR - 6; at += 6) CHORDS.push({ at, len: 6.5, notes: CYCLE[k++ % CYCLE.length] });
  CHORDS.push({ at: DUR - 6, len: 6, notes: CYCLE[0] }); // retour tonique
}

for (const c of CHORDS) {
  const n = secs(c.len);
  const buf = new Float32Array(n);
  for (const noteName of c.notes) {
    const f = NOTE(midi(noteName));
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      // saw limitée en harmoniques + léger detune -> nappe dense mais mate
      let v = 0;
      for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f * h * t + h) / (h * 1.6);
      v += Math.sin(2 * Math.PI * f * 1.004 * t) * 0.5;
      const env = attack(i, 0.9) * Math.pow(Math.sin(Math.PI * Math.min(1, (i / n) * 1.02)), 0.8);
      buf[i] += v * env * 0.11;
    }
  }
  const filtered = lowpass(buf, 1100, 700, 0.05);
  mixInto(L, filtered, c.at, 0.95);
  mixInto(R, filtered, c.at + 0.012, 0.9); // micro-délai = largeur
}

/** Drone sub — socle continu, monte doucement */
{
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const swell = 0.35 + 0.65 * Math.min(1, t / 2.2);
    buf[i] = (Math.sin(2 * Math.PI * 55 * t) * 0.8 + Math.sin(2 * Math.PI * 110.3 * t) * 0.22) * swell;
  }
  mixInto(L, buf, 0, 0.16);
  mixInto(R, buf, 0, 0.16);
}

/** Pulsation : kick every beat + ticks 8e à partir de 2.5 s */
const BEAT = 0.5;
for (let b = 5; b * BEAT < DUR - 0.6; b++) {
  const at = b * BEAT;
  const strong = b % 4 === 0;
  const n = secs(0.26);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = (strong ? 74 : 58) * Math.exp(-t * 11) + 41;
    buf[i] = Math.sin(2 * Math.PI * f * t) * expDecay(i, strong ? 0.075 : 0.05);
  }
  mixInto(L, buf, at, strong ? 0.32 : 0.17);
  mixInto(R, buf, at, strong ? 0.32 : 0.17);

  // tick 8e sur contretemps
  const tn = secs(0.04);
  const tnz = highpass(noise(tn, 91 + b), 5200);
  const tb = new Float32Array(tn);
  for (let i = 0; i < tn; i++) tb[i] = tnz[i] * expDecay(i, 0.004);
  mixInto(L, tb, at + BEAT / 2, 0.1);
  mixInto(R, tb, at + BEAT / 2 + 0.006, 0.1);
}

/** Arpège discret — « précision » (notes d'accord, 16e, très bas) */
const ARP = ["A4", "C5", "E5", "C5", "A4", "G4", "E5", "G4"];
for (let i = 0; i < secs(DUR) / (SR * 0.25); i++) {
  const at = i * 0.25;
  if (at < 6 || at > DUR - 3) continue;
  const name = ARP[i % ARP.length];
  const f = NOTE(midi(name));
  const n = secs(0.22);
  const buf = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    buf[k] = (Math.sin(2 * Math.PI * f * t) + Math.sin(2 * Math.PI * f * 2 * t) * 0.25) * expDecay(k, 0.05);
  }
  const pan = i % 2 ? 0.22 : -0.22;
  mixInto(L, buf, at, 0.055 * (1 - pan));
  mixInto(R, buf, at, 0.055 * (1 + pan));
}

/** Riser final (3 s) + coupure nette au hit du CTA — positions relatives
 *  à la durée, pour servir aussi bien au film 30 s qu'au film 45 s. */
const RISER_AT = DUR - 9;
const HIT_AT = DUR - 6;
{
  const n = secs(3);
  const nz = lowpass(noise(n, 77), 300, 8200, 0.06);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) buf[i] = nz[i] * Math.pow(i / n, 2.6);
  mixInto(L, buf, RISER_AT, 0.5);
  mixInto(R, buf, RISER_AT + 0.02, 0.5);
}

/** Hit du CTA — reprend la synchro du « shing » */
const hit = (at, gain) => {
  const n = secs(2.2);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 120 * Math.exp(-t * 2.4) + 44;
    buf[i] = Math.sin(2 * Math.PI * f * t) * expDecay(i, 0.5);
  }
  const nz = lowpass(noise(n, 83), 2400, 200, 0.1);
  for (let i = 0; i < n; i++) buf[i] += nz[i] * expDecay(i, 0.14) * 0.4;
  mixInto(L, buf, at, gain);
  mixInto(R, buf, at, gain);
};
hit(HIT_AT, 0.55);

// Film long : accent secondaire à l'entrée de la section « réalisations ».
if (DUR > 36) hit(DUR - 21, 0.28);

/** Retombée progressive sur les 3,5 dernières secondes */
const OUTRO_AT = DUR - 3.5;
for (let i = secs(OUTRO_AT); i < N; i++) {
  const g = 1 - 0.92 * Math.min(1, (i - secs(OUTRO_AT)) / secs(3.4));
  L[i] *= g;
  R[i] *= g;
}

await writeWav(path.join(ROOT, "public", "audio", process.env.MUSIC_NAME ?? "music.wav"), [normalize(L, 0.62), normalize(R, 0.62)]);

console.log(`-> public/audio/music.wav (${DUR}s) + 8 SFX dans public/audio/sfx/`);
