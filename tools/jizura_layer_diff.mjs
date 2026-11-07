// Ablation diff viewer: render one frame with and without the JIZURA lyric layer and
// dump (1) the frame, (2) the frame without lyrics, (3) a false-colour diff mask.
// Shows exactly where the lyric layer lands on screen, and whether it is legible.
//
//   node tools/jizura_layer_diff.mjs --time 117.49 --out export/diag
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const time = Number(arg('time', 117.49));
const outDir = path.resolve(root, arg('out', 'export/diag'));
const width = 1920, height = 1080;
mkdirSync(outDir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 120000 });
  const result = await page.evaluate(async ({ t, width, height }) => {
    const canvas = document.querySelector('#film');
    const ctx = canvas.getContext('2d');
    await window.renderAt(t, { width, height });
    const a = ctx.getImageData(0, 0, width, height).data;
    const orig = window.JZ.drawPlan;
    window.JZ.drawPlan = () => {};
    await window.renderAt(t, { width, height });
    const b = ctx.getImageData(0, 0, width, height).data;
    window.JZ.drawPlan = orig;
    // false-colour mask: magenta = the lyric layer changed the frame
    const mask = new Uint8ClampedArray(width * height * 4);
    let changed = 0;
    let minX = width, minY = height, maxX = 0, maxY = 0;
    for (let i = 0; i < a.length; i += 4) {
      const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      const p = (i / 4);
      if (d > 8) {
        changed++;
        const x = p % width, y = (p / width) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        mask[p * 4] = 255; mask[p * 4 + 1] = 0; mask[p * 4 + 2] = 255; mask[p * 4 + 3] = 255;
      } else {
        const g = (b[i] * 0.3 + b[i + 1] * 0.6 + b[i + 2] * 0.1) * 0.35;
        mask[p * 4] = g; mask[p * 4 + 1] = g; mask[p * 4 + 2] = g; mask[p * 4 + 3] = 255;
      }
    }
    const enc = (img) => {
      const c = document.createElement('canvas');
      c.width = width; c.height = height;
      c.getContext('2d').putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    };
    return {
      changed, bbox: changed ? { minX, minY, maxX, maxY } : null,
      withPlan: enc(new ImageData(new Uint8ClampedArray(a), width, height)),
      without: enc(new ImageData(new Uint8ClampedArray(b), width, height)),
      mask: enc(new ImageData(mask, width, height)),
    };
  }, { t: time, width, height });

  const base = `layer-diff-${String(time).replace('.', 'p')}`;
  for (const [k, v] of Object.entries({ 'with': result.withPlan, 'without': result.without, 'mask': result.mask })) {
    writeFileSync(path.join(outDir, `${base}-${k}.png`), Buffer.from(v.split(',')[1], 'base64'));
  }
  console.log(JSON.stringify({ time, changed: result.changed, bbox: result.bbox, outDir, base }, null, 1));
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
