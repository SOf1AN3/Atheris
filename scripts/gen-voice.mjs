/**
 * ÉTAPE 2 — Génération de la voix off (EN) + calcul de la timeline.
 *
 * Moteur : TTS neurale 100 % locale (Kokoro 82M, WASM) — le WebSocket Edge TTS
 * est bloqué par le réseau de l'environnement et les endpoints gratuits clôturés.
 *
 * Sorties :
 *   public/audio/vo/vo-1.wav … vo-5.wav
 *   public/audio/vo/timings.json        — mesures brutes (audit)
 *   src/remotion/data/voice.ts          — TIMELINE de synchro consommée par l'UI
 *
 * Le fichier TS est la source de vérité : la vidéo ne devine jamais les timings,
 * elle les lit. Re-générer la VO recalcule automatiquement les bornes de scènes.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "audio", "vo");
const TS_OUT = path.join(ROOT, "src", "remotion", "data", "voice.ts");

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = process.env.KOKORO_VOICE ?? "am_michael"; // masculine US, posée
const SPEED = Number(process.env.KOKORO_SPEED ?? 0.92); // débit légèrement ralenti

export const FPS = 30;
export const TOTAL_SECONDS = 30;
/** Respiration avant chaque segment (laisse la scène s'installer) */
const PRE_ROLL = 0.65;
/** Respiration après chaque segment (sauf le dernier) */
const POST_ROLL = 0.6;
/** Silence entre deux segments */
const GAP = 0.85;

const LINES = [
  "Your product deserves more than a template.",
  "We build custom web platforms and SaaS products. Scalable, multi-tenant, rock solid.",
  "And native iOS and Android apps, engineered for everyday use.",
  "Twenty products shipped. Code you own, end to end.",
  "Atheris Labs. Let's build yours.",
];

console.log(`Kokoro TTS — ${MODEL} · voix ${VOICE} · vitesse ${SPEED}`);

const tts = await KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "cpu" });
console.log("Modèle chargé — synthèse…");
await mkdir(OUT, { recursive: true });

const segments = [];
for (let i = 0; i < LINES.length; i++) {
  const text = LINES[i];
  const audio = await tts.generate(text, { voice: VOICE, speed: SPEED });
  const file = path.join(OUT, `vo-${i + 1}.wav`);
  await audio.save(file);
  const dur = +((audio.audio?.length ?? 0) / (audio.sampling_rate ?? 24000)).toFixed(3);
  segments.push({ id: i + 1, text, file: `vo-${i + 1}.wav`, dur });
  console.log(`vo-${i + 1}.wav  ${dur.toFixed(2)}s`);
}

/* ------------------------------------------------- Timeline (synchro) */
const speechTotal = segments.reduce((a, s) => a + s.dur, 0) + GAP * (segments.length - 1);
const firstStart = 0.55;
let cursor = firstStart;
segments.forEach((s, i) => {
  s.start = +cursor.toFixed(3);
  s.end = +(cursor + s.dur).toFixed(3);
  cursor = s.end + GAP;
});

// Bornes de scènes : la scène ouvre PRE_ROLL avant la parole, se referme
// POST_ROLL après. La dernière scène va jusqu'au noir (30 s).
const scenes = segments.map((s, i) => {
  const start = i === 0 ? 0 : Math.max(0, +(s.start - PRE_ROLL).toFixed(3));
  const end = i === segments.length - 1 ? TOTAL_SECONDS : +(s.end + POST_ROLL).toFixed(3);
  return { id: i + 1, start, end, frames: [Math.round(start * FPS), Math.round(end * FPS)] };
});

// Garde-fou : on refuse de livrer une vidéo où la parole déborderait.
const lastEnd = segments.at(-1).end;
if (lastEnd > TOTAL_SECONDS - 1.2) {
  console.warn(`⚠ parole qui court jusqu'à ${lastEnd.toFixed(2)}s — réduire le texte ou monter la vitesse.`);
}

const toFrames = (v) => Math.round(v * FPS);
const data = {
  fps: FPS,
  totalSeconds: TOTAL_SECONDS,
  totalFrames: TOTAL_SECONDS * FPS,
  voice: VOICE,
  speed: SPEED,
  segments: segments.map((s) => ({
    id: s.id,
    text: s.text,
    src: `audio/vo/${s.file}`,
    start: s.start,
    dur: s.dur,
    from: toFrames(s.start),
    durationInFrames: toFrames(s.dur),
  })),
  scenes: scenes.map((sc) => ({ id: sc.id, start: sc.start, end: sc.end, from: sc.frames[0], durationInFrames: sc.frames[1] - sc.frames[0] })),
  contactSeconds: +(segments.at(-1).end + 0.6).toFixed(3),
};

const banner = `/**\n * Généré par scripts/gen-voice.mjs — NE PAS ÉDITER À LA MAIN.\n * Timeline de synchronisation voix off / scènes (sources : public/audio/vo/).\n */\n\n`;
await mkdir(path.dirname(TS_OUT), { recursive: true });
await writeFile(TS_OUT, `${banner}export const VO_TIMELINE = ${JSON.stringify(data, null, 2)} as const;\n`);
await writeFile(path.join(OUT, "timings.json"), JSON.stringify({ engine: "kokoro-js", model: MODEL, voice: VOICE, speed: SPEED, speechTotal: +speechTotal.toFixed(2), segments, scenes }, null, 2));

console.log(`\nParole totale : ${speechTotal.toFixed(2)}s sur ${TOTAL_SECONDS}s`);
scenes.forEach((sc) => console.log(`  scène ${sc.id}  ${sc.start.toFixed(2)}s → ${sc.end.toFixed(2)}s  (${(sc.end - sc.start).toFixed(2)}s)`));
console.log(`\n-> ${path.relative(ROOT, TS_OUT)}`);
