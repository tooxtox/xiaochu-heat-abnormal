// How large is the lyric layer's frame-history dependence?
//
// The chunk renderer gives every chunk its own process, so a chunk's first frame is
// rendered "fresh". If the lyric layer kept state between frames, that frame would not
// match a continuous render. This renders the same time twice under two histories and
// reports how many pixels differ, how much, and where.
//
//   node tools/jizura_state_leak.mjs --time 24 --history 2
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const time = Number(arg('time', 24));
const history = Number(arg('history', 2));
const fps = Number(arg('fps', 60));
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const outDir = path.resolve(root, arg('out', 'export/diag'));
mkdirSync(outDir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });

async function openPage() {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 120000 });
  return page;
}

try {
  // A: the time is the very first frame this page renders.
  const pageA = await openPage();
  const a = await pageA.evaluate(async ({ t, width, height }) => {
    const canvas = document.querySelector('#film');
    const grab = async () => {
      await window.renderAt(t, { width, height });
      return { png: canvas.toDataURL('image/png').split(',')[1], raw: canvas.getContext('2d').getImageData(0, 0, width, height).data };
    };
    const first = await grab();
    const second = await grab();
    return first;
  }, { t: time, width, height });
  await pageA.close();

  // B: the same time, but after the page has rendered a run of earlier frames.
  const pageB = await openPage();
  const b = await pageB.evaluate(async ({ t, width, height, history, fps }) => {
    const canvas = document.querySelector('#film');
    const steps = Math.round(history * fps);
    for (let k = 0; k <= steps; k++) {
      await window.renderAt(+(k / fps).toFixed(9), { width, height });
    }
    await window.renderAt(t, { width, height });
    return { png: canvas.toDataURL('image/png').split(',')[1], raw: canvas.getContext('2d').getImageData(0, 0, width, height).data };
  }, { t: time, width, height, history, fps });
  await pageB.close();

  let changed = 0, changedAlpha = 0, maxDelta = 0, sumDelta = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  for (let i = 0; i < a.raw.length; i += 4) {
    const d = Math.max(Math.abs(a.raw[i] - b.raw[i]), Math.abs(a.raw[i + 1] - b.raw[i + 1]), Math.abs(a.raw[i + 2] - b.raw[i + 2]));
    if (Math.abs(a.raw[i + 3] - b.raw[i + 3]) > 0) changedAlpha++;
    if (d > 2) {
      changed++;
      sumDelta += d;
      if (d > maxDelta) maxDelta = d;
      const p = i / 4, x = p % width, y = (p / width) | 0;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  const total = width * height;
  const report = {
    time, history, fps, width, height,
    pngBytesEqual: a.png === b.png,
    pngLengths: [a.png.length, b.png.length],
    changedPixels: changed,
    changedAlpha,
    changedPct: +(changed * 100 / total).toFixed(4),
    maxChannelDelta: maxDelta,
    meanDeltaOnChanged: changed ? +(sumDelta / changed).toFixed(1) : 0,
    bbox: changed ? { minX, minY, maxX, maxY } : null,
  };
  console.log(JSON.stringify(report, null, 1));
  writeFileSync(path.join(outDir, `state-leak-${String(time).replace('.', 'p')}.json`), JSON.stringify(report, null, 1), 'utf8');
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
