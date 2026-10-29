/**
 * Étape « How the page must be built » du skill explainer-engaging :
 *   « Fonts: embed them. Download the woff2 files and inline them as base64 @font-face »
 *
 * 1. télécharge les 3 voix du DESIGN.md (Inter Tight, Instrument Serif italique,
 *    JetBrains Mono) dans public/fonts/ (cache : si le fichier existe, pas de requête)
 * 2. les encode en base64
 * 3. injecte le bloc @font-face dans le template HTML → HTML autonome livrable
 *
 * Usage : node scripts/build-crm-video.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = path.join(ROOT, "public", "fonts");
const TEMPLATE = path.join(ROOT, "out", "crm", "template.html");
const OUT = path.join(ROOT, "out", "crm", "crm.html");

// UA moderne pour que Google renvoie du woff2 (sinon il renvoie du ttf/woff1)
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const FAMILIES = [
  { file: "inter-tight-500.woff2", url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500&display=swap", pick: /\/\*\s*latin\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/ },
  { file: "inter-tight-600.woff2", url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600&display=swap", pick: /\/\*\s*latin\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/ },
  { file: "jetbrains-mono-500.woff2", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap", pick: /\/\*\s*latin\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/ },
  { file: "instrument-serif-italic.woff2", url: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap", pick: /\/\*\s*latin\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/ },
];

await mkdir(FONT_DIR, { recursive: true });

const faces = [];
for (const f of FAMILIES) {
  const dest = path.join(FONT_DIR, f.file);
  let buf;
  try {
    buf = await readFile(dest);
  } catch {
    const css = await (await fetch(f.url, { headers: { "User-Agent": UA } })).text();
    const m = f.pick.exec(css);
    if (!m) throw new Error(`pas de sous-ensemble latin trouvé pour ${f.file}`);
    const res = await fetch(m[1], { headers: { "User-Agent": UA } });
    buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
    console.log(`téléchargé ${f.file} (${(buf.length / 1024).toFixed(0)} Ko)`);
  }
  faces.push(buf);
  console.log(`cache  ${f.file} (${(buf.length / 1024).toFixed(0)} Ko)`);
}

const FACE_CSS = `
@font-face{font-family:'Inter Tight';font-style:normal;font-weight:500;font-display:block;src:url(data:font/woff2;base64,${faces[0].toString("base64")}) format('woff2');}
@font-face{font-family:'Inter Tight';font-style:normal;font-weight:600;font-display:block;src:url(data:font/woff2;base64,${faces[1].toString("base64")}) format('woff2');}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:500;font-display:block;src:url(data:font/woff2;base64,${faces[2].toString("base64")}) format('woff2');}
@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${faces[3].toString("base64")}) format('woff2');}
`;

const template = await readFile(TEMPLATE, "utf8");
if (!template.includes("__FONT_FACES__")) throw new Error("placeholder __FONT_FACES__ absent du template");
await writeFile(OUT, template.replace("__FONT_FACES__", FACE_CSS), "utf8");

const size = (await readFile(OUT)).length;
console.log(`\n-> ${path.relative(ROOT, OUT)} (${(size / 1024 / 1024).toFixed(2)} Mo, autonome)`);
