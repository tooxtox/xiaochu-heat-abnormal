// Chunk determinism: is a frame only a function of its absolute time?
//
// The renderer splits the film into chunks; every chunk is a separate process that starts
// at its own `--start` time and renders forward from there. A frame that lands on a chunk
// boundary is therefore rendered twice in two different processes, in two different
// histories. If any part of the pipeline keeps state that depends on when it was asked
// to render — a running counter, a cached "current scene", a plan built for the previous
// chunk — the stitched film would show a seam even though every chunk looks fine alone.
//
// This checks the two histories directly:
//   A  one page renders 0 … boundary in order, then the boundary frame again
//   B  a fresh page renders the boundary frame first
//   C  a fresh page renders the boundary frame again after some other frames
//
// A, B and C must agree bit for bit.
//
//   node tools/jizura_chunk_determinism.mjs [--boundary 24] [--span 2] [--fps 60]
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const boundary = Number(arg('boundary', 24));
const span = Number(arg('span', 2));
const fps = Number(arg('fps', 60));
// --no-jizura runs the same comparison without the JIZURA lyric layer, so a mismatch can
// be attributed to the lyric layer or to the film itself.
const withJizura = !process.argv.includes('--no-jizura');
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const outDir = path.resolve(root, arg('out', 'export/diag'));
mkdirSync(outDir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
const sha = buf => createHash('sha256').update(buf).digest('hex');

async function openPage() {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}${withJizura ? '&jizura=1' : ''}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 120000 });
  await page.evaluate(() => {
    // Hash the decoded pixels, not the PNG bytes: the browser's PNG encoder is not
    // byte-stable for identical pixels (two pages can compress the same picture
    // differently), so hashing data URLs measures the encoder instead of the render.
    const hex = bytes => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const fallback = bytes => {                       // FNV-1a, in case crypto.subtle is unavailable
      let h = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
      return ('00000000' + h.toString(16)).slice(-8);
    };
    window.__grab = async (t, width, height) => {
      const canvas = document.querySelector('#film');
      if (canvas.width !== width) { canvas.width = width; canvas.height = height; }
      await window.renderAt(t, { width, height });
      const data = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      if (window.crypto && crypto.subtle) {
        return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data.buffer)));
      }
      return fallback(data);
    };
  });
  return page;
}

const report = { boundary, span, fps, width, height, withJizura, cases: [], errors: [] };
try {
  // A: one page walks 0 … boundary in order, then renders the boundary frame again.
  const pageA = await openPage();
  const steps = Math.round(span * fps);
  for (let k = 0; k <= steps; k++) {
    await pageA.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t: +(k / fps).toFixed(9), width, height });
  }
  const a1 = await pageA.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t: boundary, width, height });
  const a2 = await pageA.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t: boundary, width, height });
  await pageA.close();

  // B: a fresh page renders the boundary frame first — this is a chunk's first frame.
  const pageB = await openPage();
  const b1 = await pageB.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t: boundary, width, height });
  await pageB.close();

  // C: a fresh page renders other frames first, then the boundary frame.
  const pageC = await openPage();
  for (const t of [boundary + 3.5, boundary - 1.25, boundary + 0.75]) {
    await pageC.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t, width, height });
  }
  const c1 = await pageC.evaluate(({ t, width, height }) => window.__grab(t, width, height), { t: boundary, width, height });
  await pageC.close();

  const hashes = {
    continuous: sha(Buffer.from(String(a1))),
    continuousAgain: sha(Buffer.from(String(a2))),
    chunkFirstFrame: sha(Buffer.from(String(b1))),
    freshAfterOthers: sha(Buffer.from(String(c1))),
  };
  const unique = [...new Set(Object.values(hashes))];
  report.hashes = hashes;
  report.pixelHashes = { continuous: a1, continuousAgain: a2, chunkFirstFrame: b1, freshAfterOthers: c1 };
  report.passed = unique.length === 1;
  report.note = 'One page rendered 0…span in order, a fresh page rendered the boundary frame first (as a chunk boundary frame does), and a third page rendered other frames first. The four pixel hashes (SHA-256 of the decoded RGBA) must match.';
  console.log(`boundary t=${boundary}s  ${report.passed ? 'IDENTICAL' : 'MISMATCH'}`);
  for (const [k, v] of Object.entries(hashes)) console.log(`  ${k.padEnd(16)} ${v}`);
  writeFileSync(path.join(outDir, 'chunk-determinism.json'), JSON.stringify(report, null, 1), 'utf8');
} catch (error) {
  report.errors.push(String(error && error.stack || error));
  console.error(error);
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
process.exitCode = report.passed ? 0 : 1;
