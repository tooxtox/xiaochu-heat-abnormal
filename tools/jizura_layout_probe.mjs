// Layout probe: render the same lyric line with several candidate JIZURA layouts and
// compare the stills side by side.
//   node tools/jizura_layout_probe.mjs --time 24.5 --layouts corners,lowerThird,edgeFrame,diag --prefix probe24
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const time = Number(arg('time', '24.5'));
const layouts = String(arg('layouts', 'corners,lowerThird,edgeFrame,diag,condensed,perspective')).split(',').map(s => s.trim()).filter(Boolean);
const prefix = arg('prefix', 'probe');
const width = Number(arg('width', 1280)), height = Number(arg('height', 720));
const outDir = path.resolve(root, 'export');
const dir = path.join(outDir, `${prefix}-layouts`);
mkdirSync(dir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  page.on('pageerror', e => console.log('[pageerror] ' + e.message));
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.MV_READY === true, null, { timeout: 90000 });

  const results = [];
  for (const layout of layouts) {
    const shot = await page.evaluate(async ({ time, layout, width, height }) => {
      const canvas = document.querySelector('#film');
      canvas.width = width; canvas.height = height;
      // Find the plan the layer would use for this moment and the live cut inside it.
      const dir = window.MVData.jizuraDirection;
      const line = window.MVData.lyrics.lines.find(l => time >= l.time && time < (l.end ?? Infinity));
      const entry = dir.lines.find(d => d.id === line?.id);
      const planName = entry ? entry.plan : 'dark';
      const built = window.JZ.plans[planName];
      const cut = built.plan.cuts.find(c => time >= c.start && time < c.end);
      if (!cut) return { error: `no cut at ${time}` };
      const saved = { layout: cut.layout, params: cut.params };
      if (window.J.LAYOUTS[layout]) {
        cut.layout = layout;
        cut.params = window.J.LAYOUTS[layout].plan(
          window.J.rng(window.J.h(cut.seed, 91)),
          { text: cut.text, n: [...cut.text.replace(/\s+/g, '')].length, W: built.plan.W, H: built.plan.H, dur: cut.dur },
          built.plan.style);
      }
      await window.renderAt(time, { width, height });
      const png = canvas.toDataURL('image/png').split(',')[1];
      cut.layout = saved.layout; cut.params = saved.params;
      return { png, plan: planName, cutText: cut.text, from: saved.layout, used: window.J.LAYOUTS[layout] ? layout : saved.layout };
    }, { time, layout, width, height });
    if (shot.error) { console.log(`${layout}: ${shot.error}`); continue; }
    const file = path.join(dir, `${prefix}-${layout}.png`);
    writeFileSync(file, Buffer.from(shot.png, 'base64'));
    results.push({ layout: shot.used, file: path.relative(root, file), text: shot.cutText });
    console.log(`${shot.used.padEnd(14)} ${shot.cutText}  -> ${path.basename(file)}`);
  }
  writeFileSync(path.join(outDir, `${prefix}-layouts.json`), JSON.stringify({ time, results }, null, 1), 'utf8');
  console.log(`wrote ${results.length} layout stills to ${path.relative(root, dir)}`);
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
