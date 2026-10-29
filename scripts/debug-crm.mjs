// Diagnostic : compare l'état interne du héros à deux instants de la couture.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const url = pathToFileURL(path.resolve('out/crm/crm.html')).href + '?render';
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
await page.goto(url);
await page.waitForFunction(() => window.VIDEO && typeof window.seek === 'function');

const probe = async (t) => page.evaluate((tt) => {
  window.seek(tt);
  const h = document.getElementById('hero');
  const cam = document.getElementById('cam');
  const r = h.getBoundingClientRect();
  return {
    t: tt,
    transform: h.style.transform,
    rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
    cam: cam.style.transform,
    s1: document.getElementById('s1').style.transform + ' | op=' + document.getElementById('s1').style.opacity,
  };
}, t);

for (const t of [0, 0.04, 24.99, 24.95, 12.4]) {
  console.log(JSON.stringify(await probe(t)));
}
await browser.close();
