// A/B the two ink polarities of one line and write both frames side by side.
//
// The probe measures contrast, but a thin outline on a near-white background can score
// "fine" while being unreadable to the eye. This renders the same line in both
// polarities so the choice can be made by looking.
//
//   node tools/jizura_ab_variants.mjs --lines L116:225.05,L063:80.0 --prefix v15ab
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const prefix = arg('prefix', 'v15ab');
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const outDir = path.resolve(root, arg('out', 'export'));
const dir = path.join(outDir, `${prefix}-ab`);
mkdirSync(dir, { recursive: true });

const readJson = p => JSON.parse(readFileSync(path.resolve(root, p), 'utf8'));
const direction = readJson('data/jizura_direction.json');
const polarities = direction.polarities || {};
const byId = new Map(direction.lines.map(d => [d.id, d]));

const specs = String(arg('lines', '')).split(',').map(s => s.trim()).filter(Boolean).map(spec => {
  const [id, t] = spec.split(':');
  return { id, t: Number(t), dir: byId.get(id) };
});

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 120000 });
  await page.evaluate(() => { window.__setProbe = map => { window.__MZ_PLAN_PROBE = map || null; }; });
  for (const spec of specs) {
    const family = spec.dir.family;
    const pair = polarities[family] || [family, family + 'Alt'];
    for (const plan of pair) {
      await page.evaluate(({ id, plan }) => window.__setProbe({ [id]: plan }), { id: spec.id, plan });
      const png = await page.evaluate(async ({ t, width, height }) => {
        const canvas = document.querySelector('#film');
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        await window.renderAt(t, { width, height });
        return canvas.toDataURL('image/png').split(',')[1];
      }, { t: spec.t, width, height });
      const file = path.join(dir, `${spec.id}-t${spec.t.toFixed(2).replace('.', 'p')}-${plan}.png`);
      writeFileSync(file, Buffer.from(png, 'base64'));
      console.log(`${spec.id} t=${spec.t} ${plan.padEnd(10)} -> ${path.basename(file)}`);
    }
    await page.evaluate(() => window.__setProbe(null));
  }
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
console.log('wrote ' + dir);
