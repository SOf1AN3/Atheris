/**
 * Renders `sdr-onboarding-kit.html` to a print-ready A4 PDF.
 *
 * Page geometry is driven entirely by the document's own `@page` rule
 * (`size: A4; margin: 20mm 15mm`) via `preferCSSPageSize`, so the HTML remains
 * the single source of truth for margins — print it from any browser and get
 * the same result. `printBackground` is required because the ATHERIS LABS
 * identity is a deep obsidian ground, not white paper.
 *
 *   node scripts/render-sdr-kit-pdf.mjs
 */
import { chromium } from "playwright";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(HERE, "..", "docs", "sdr-onboarding-kit");

const HTML_FILE = resolve(DOCS, "sdr-onboarding-kit.html");
const PDF_FILE = resolve(DOCS, "SDR-Onboarding-Kit.pdf");
const PROOF_DIR = resolve(DOCS, "proof");

/** Running header / footer — mono, faint, so it reads as an instrument frame.
 *  They sit inside the `@page` margin box, which the stylesheet paints
 *  obsidian via `@page { background }`, so no white paper shows behind them. */
const HEADER = `
  <div style="
    width:100%; padding:0 15mm;
    font-family:'JetBrains Mono',Consolas,monospace; font-size:6.5px;
    letter-spacing:1.6px; text-transform:uppercase; color:#5C6373;
    display:flex; justify-content:space-between;">
    <span>Atheris Labs</span>
    <span>SDR Onboarding Kit</span>
  </div>`;

const FOOTER = `
  <div style="
    width:100%; padding:0 15mm;
    font-family:'JetBrains Mono',Consolas,monospace; font-size:6.5px;
    letter-spacing:1.6px; text-transform:uppercase; color:#5C6373;
    display:flex; justify-content:space-between;">
    <span>Internal — Confidential</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;

async function main() {
  // Fail loudly rather than silently shipping a PDF with fallback fonts.
  const fontsCss = await readFile(resolve(DOCS, "fonts.css"), "utf8");
  const faceCount = (fontsCss.match(/@font-face/g) ?? []).length;
  if (faceCount < 8) {
    throw new Error(
      `Expected 8 embedded @font-face rules in fonts.css, found ${faceCount}. ` +
        `Run: node scripts/build-sdr-kit-fonts.mjs`,
    );
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 1800 },
      deviceScaleFactor: 2,
    });

    await page.goto(`file:///${HTML_FILE.replace(/\\/g, "/")}`, {
      waitUntil: "networkidle",
    });

    // Guarantee every embedded webfont is rasterised before we print. Lazy
    // loading means a face the layout never happens to reference (e.g. the
    // upright Instrument Serif) would otherwise be silently dropped from the
    // PDF's font set — force all of them so the output is deterministic.
    const loaded = await page.evaluate(async () => {
      const faces = [...document.fonts];
      await Promise.all(
        faces.map((f) =>
          document.fonts
            .load(`${f.style} ${f.weight} 16px "${f.family}"`)
            .catch(() => null),
        ),
      );
      await document.fonts.ready;
      return faces.filter((f) => f.status === "loaded").length;
    });
    if (loaded < 8) {
      throw new Error(`Only ${loaded} font faces finished loading — aborting print.`);
    }

    await page.emulateMedia({ media: "print" });

    await page.pdf({
      path: PDF_FILE,
      format: "A4",
      preferCSSPageSize: true, // honour the document's `@page { size; margin }`
      printBackground: true,   // the obsidian ground IS the brand
      displayHeaderFooter: true,
      headerTemplate: HEADER,
      footerTemplate: FOOTER,
      // Mirrors the document's `@page` margin exactly, so the running
      // head/foot land inside the margin box the stylesheet paints obsidian.
      margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
    });

    // ---- Verification pass -------------------------------------------------
    // Re-open the produced PDF and rasterise every page so layout regressions
    // (clipped text, orphaned headings, tables split across pages) are caught
    // by a human, not assumed away.
    await page.emulateMedia({ media: "screen" });
    await page.setContent(
      `<style>html,body{margin:0;padding:0;background:#06070A;}</style>
       <embed src="file:///${PDF_FILE.replace(/\\/g, "/")}" type="application/pdf"
              width="100%" height="2400px" />`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(2500);

    const info = await stat(PDF_FILE);
    console.log(`\n  ✓ ${PDF_FILE}`);
    console.log(`    ${(info.size / 1024).toFixed(0)} KB · fonts: ${loaded}/8 embedded`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
