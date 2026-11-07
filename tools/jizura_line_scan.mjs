// Dense contribution scan for one lyric line: how much of the frame does the Japanese
// lyric layer actually contribute, frame by frame?
//
// This is the tool that tells a real blackout apart from a sampling artefact. The
// per-line audit samples at a few points; when one of them lands in the handover gap
// between two phrases it reports the line as missing even though the line is on screen
// for almost its whole length. This scans every frame of the line instead.
//
//   node tools/jizura_line_scan.mjs --id L100 --from 199.4 --to 202.4
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const id = arg('id', 'L100');
const from = Number(arg('from', 199.4));
const to = Number(arg('to', 202.4));
const step = Number(arg('step', 1 / 60));
const width = 1920, height = 1080;
const outDir = path.resolve(root, 'export/diag');
mkdirSync(outDir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.__origPlan = window.JZ.drawPlan;
    window.__measure = async (t, width, height) => {
      const canvas = document.querySelector('#film');
      await window.renderAt(t, { width, height });
      const a = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = () => {};
      await window.renderAt(t, { width, height });
      const b = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = window.__origPlan;
      let changed = 0, strong = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 6) changed++;
        if (d > 40) strong++;
      }
      return { changed, strong };
    };
  });
  const rows = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const tt = +t.toFixed(4);
    const m = await page.evaluate(({ t, width, height }) => window.__measure(t, width, height), { t: tt, width, height });
    rows.push({ t: tt, ...m });
  }
  const zeros = rows.filter(r => r.changed < 200);
  let longest = 0, run = 0;
  for (const r of rows) { if (r.changed < 200) { run++; longest = Math.max(longest, run); } else run = 0; }
  console.log(`${id}  ${from}..${to}  samples=${rows.length}  longest gap without any lyric = ${longest} frames`);
  console.log('  frames with almost no lyric contribution (changed<200):');
  for (const z of zeros) console.log(`    t=${z.t.toFixed(4)}  changed=${z.changed}  strong=${z.strong}`);
  if (!zeros.length) console.log('    (none)');
  console.log('  profile:');
  console.log('   ' + rows.map(r => `${r.t.toFixed(2)}:${r.changed}`).join(' '));
  writeFileSync(path.join(outDir, `line-scan-${id}.json`), JSON.stringify({ id, from, to, step, longestGapFrames: longest, rows }, null, 1), 'utf8');
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
