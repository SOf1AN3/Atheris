/**
 * QA harness: rasterises the generated PDF page-by-page with pdf.js and
 * screenshots each page, so pagination defects (clipped text, orphaned
 * headings, tables split across a page break) can be inspected visually
 * instead of assumed away.
 *
 *   node scripts/verify-sdr-kit-pdf.mjs
 */
import { chromium } from "playwright";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOCS = resolve(HERE, "..", "docs", "sdr-onboarding-kit");
const PDF_FILE = resolve(DOCS, "SDR-Onboarding-Kit.pdf");
const PROOF_DIR = resolve(DOCS, "proof");

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs";
const PDFJS_WORKER =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";

const SCALE = 1.6; // ~190 dpi — legible for review, small enough to inspect

async function main() {
  await mkdir(PROOF_DIR, { recursive: true });
  const data = (await readFile(PDF_FILE)).toString("base64");
  const size = (await stat(PDF_FILE)).size;

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  page.on("console", (m) => {
    if (m.type() === "error") console.error("  [page]", m.text());
  });

  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#06070A">
       <script type="module">
         import * as pdfjsLib from "${PDFJS}";
         pdfjsLib.GlobalWorkerOptions.workerSrc = "${PDFJS_WORKER}";
         window.pdfjsLib = pdfjsLib;
         window.__ready = true;
       </script>
     </body></html>`,
    { waitUntil: "networkidle" },
  );
  await page.waitForFunction("window.__ready === true", null, { timeout: 30_000 });

  const pageNums = await page.evaluate(
    async ({ b64, scale }) => {
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const doc = await window.pdfjsLib.getDocument({ data: bin }).promise;

      const out = [];
      for (let n = 1; n <= doc.numPages; n++) {
        const pg = await doc.getPage(n);
        const vp = pg.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext("2d");

        // Replicate the obsidian ground so any unpainted region is obvious.
        ctx.fillStyle = "#06070A";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        out.push({ page: n, w: canvas.width, h: canvas.height, png: canvas.toDataURL("image/png") });
      }
      return { total: doc.numPages, pages: out };
    },
    { b64: data, scale: SCALE },
  );

  const fs = await import("node:fs/promises");
  for (const p of pageNums.pages) {
    const buf = Buffer.from(p.png.split(",")[1], "base64");
    const file = resolve(PROOF_DIR, `page-${String(p.page).padStart(2, "0")}.png`);
    await fs.writeFile(file, buf);
  }

  console.log(`\n  PDF : ${(size / 1024).toFixed(0)} KB`);
  console.log(`  Pages: ${pageNums.total}`);
  console.log(`  Proof: ${PROOF_DIR}`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
