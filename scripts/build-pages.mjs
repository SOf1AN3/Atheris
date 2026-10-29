/**
 * Étape « Fonts: embed them » des skills explainer-* :
 *   télécharge les woff2 (cache dans public/fonts/) puis injecte les @font-face
 *   en base64 dans CHAQUE template → HTML autonome livrable.
 *
 * Usage : node scripts/build-pages.mjs
 *   out/crm/template.html  -> out/crm/crm.html
 *   out/ad/template.html   -> out/ad/ad.html
 *   out/global/template.html -> out/global/global.html
 */
import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONT_DIR = path.join(ROOT, "public", "fonts");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

/** les 3 voix du DESIGN.md — Inter Tight va jusqu'à 900 (slams du skill high-energy) */
const FAMILIES = [
  { file: "inter-tight-500.woff2", url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500&display=swap" },
  { file: "inter-tight-600.woff2", url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600&display=swap" },
  { file: "inter-tight-900.woff2", url: "https://fonts.googleapis.com/css2?family=Inter+Tight:wght@900&display=swap" },
  { file: "jetbrains-mono-500.woff2", url: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&display=swap" },
  { file: "instrument-serif-italic.woff2", url: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@1&display=swap" },
];
const LATIN = /\/\*\s*latin\s*\*\/[^}]*?url\((https:[^)]+\.woff2)\)/;

await mkdir(FONT_DIR, { recursive: true });
const bufs = [];
for (const f of FAMILIES) {
  const dest = path.join(FONT_DIR, f.file);
  let buf;
  try { buf = await readFile(dest); console.log(`cache  ${f.file} (${(buf.length / 1024).toFixed(0)} Ko)`); }
  catch {
    const css = await (await fetch(f.url, { headers: { "User-Agent": UA } })).text();
    const m = LATIN.exec(css);
    if (!m) throw new Error(`sous-ensemble latin introuvable pour ${f.file}`);
    buf = Buffer.from(await (await fetch(m[1], { headers: { "User-Agent": UA } })).arrayBuffer());
    await writeFile(dest, buf);
    console.log(`téléchargé ${f.file} (${(buf.length / 1024).toFixed(0)} Ko)`);
  }
  bufs.push(buf);
}

const FACE_CSS = `
@font-face{font-family:'Inter Tight';font-style:normal;font-weight:500;font-display:block;src:url(data:font/woff2;base64,${bufs[0].toString("base64")}) format('woff2');}
@font-face{font-family:'Inter Tight';font-style:normal;font-weight:600;font-display:block;src:url(data:font/woff2;base64,${bufs[1].toString("base64")}) format('woff2');}
@font-face{font-family:'Inter Tight';font-style:normal;font-weight:900;font-display:block;src:url(data:font/woff2;base64,${bufs[2].toString("base64")}) format('woff2');}
@font-face{font-family:'JetBrains Mono';font-style:normal;font-weight:500;font-display:block;src:url(data:font/woff2;base64,${bufs[3].toString("base64")}) format('woff2');}
@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;font-display:block;src:url(data:font/woff2;base64,${bufs[4].toString("base64")}) format('woff2');}
`;

let n = 0;
for (const dir of ["crm", "ad", "global"]) {
  const tpl = path.join(ROOT, "out", dir, "template.html");
  try { await stat(tpl); } catch { continue; }
  const html = await readFile(tpl, "utf8");
  if (!html.includes("__FONT_FACES__")) { console.warn(`skip ${dir} : pas de placeholder`); continue; }
  const out = path.join(ROOT, "out", dir, path.basename(dir) + ".html");
  await writeFile(out, html.replace("__FONT_FACES__", FACE_CSS), "utf8");
  const size = (await readFile(out)).length;
  console.log(`-> ${path.relative(ROOT, out)} (${(size / 1024 / 1024).toFixed(2)} Mo, autonome)`);
  n++;
}
console.log(`\n${n} page(s) construite(s)`);
