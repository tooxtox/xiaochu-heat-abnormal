// Which ink polarity should a line use?
//
// A lyric can be drawn two ways inside the same layout and motion: light ink on a dark
// plate (polarity A) or dark ink on a paper plate (polarity B). Which one reads depends on
// what the film is doing behind it — paper-white text on the burning red sky is about
// 1.4:1 and effectively invisible, and dark ink on a dark room is just as bad.
//
// So this tool does not guess from a hand-written list. It renders every line twice, once
// per polarity, measures the real contrast against the real picture, and keeps the
// polarity that actually wins. The result feeds data/jizura_variants.json, which the
// director table reads.
//
//   node tools/jizura_variant_probe.mjs [--samples 3] [--margin 0.6]
//
// The measurement is the same as tools/jizura_contrast_audit.mjs: the frame is rendered
// with the lyric layer and with the engine's plan renderer stubbed out, and the differing
// pixels give the lyric's footprint. Their ink and the picture underneath give the ratio.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const samples = Number(arg('samples', 3));
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
// How much better the other polarity has to be before the art direction is overridden.
const margin = Number(arg('margin', 0.6));
const outFile = path.resolve(root, arg('out', 'data/jizura_variants.json'));

const readJson = p => JSON.parse(readFileSync(path.resolve(root, p), 'utf8'));
const data = {
  config: readJson('config.json'),
  features: readJson('data/audio_features.json'),
  cues: readJson('data/cues.json'),
  lyrics: readJson('data/lyrics.json'),
  shots: readJson('data/shots.json'),
  jizuraDirection: readJson('data/jizura_direction.json'),
};

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
const report = { samples, margin, width, height, lines: [], errors: [] };
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', e => report.errors.push('pageerror: ' + e.message));
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 60000 });

  await page.evaluate(() => {
    window.__origPlan = window.JZ.drawPlan;
    const srgb = v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
    const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    // Measure one frame: ink of the lyric layer against the picture underneath it.
    window.__measure = async (t, width, height) => {
      const canvas = document.querySelector('#film');
      await window.renderAt(t, { width, height });
      const a = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = () => {};
      await window.renderAt(t, { width, height });
      const b = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = window.__origPlan;
      let inkL = 0, bgL = 0, inkN = 0, invisible = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d <= 8) continue;
        if (d < 24) invisible++;
        inkL += lum(a[i], a[i + 1], a[i + 2]);
        bgL += lum(b[i], b[i + 1], b[i + 2]);
        inkN++;
      }
      if (!inkN) return { contrast: 0, bgLum: 0, inkLum: 0, invisiblePct: 100, footprint: 0 };
      let sum = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d <= 8) continue;
        sum += ratio(lum(a[i], a[i + 1], a[i + 2]), lum(b[i], b[i + 1], b[i + 2]));
      }
      return {
        contrast: +(sum / inkN).toFixed(2),
        bgLum: +(bgL / inkN).toFixed(4),
        inkLum: +(inkL / inkN).toFixed(4),
        invisiblePct: +(invisible * 100 / inkN).toFixed(1),
        footprint: inkN,
      };
    };
    window.__setProbe = map => { window.__MZ_PLAN_PROBE = map || null; };
  });

  const byId = new Map(data.jizuraDirection.lines.map(d => [d.id, d]));
  // The direction table carries the two polarities of every family, so the probe never
  // has to guess the candidate pair and stays stable across rebuilds.
  const polarities = data.jizuraDirection.polarities || {};
  const onlyFamilies = String(arg('families', '')).split(',').map(s => s.trim()).filter(Boolean);
  const onlyLines = String(arg('lines', '')).split(',').map(s => s.trim()).filter(Boolean);
  for (const line of data.lyrics.lines) {
    const dir = byId.get(line.id);
    if (!dir) continue;
    const family = dir.family || dir.plan;
    if (onlyFamilies.length && !onlyFamilies.includes(family)) continue;
    if (onlyLines.length && !onlyLines.includes(line.id)) continue;
    const pair = polarities[family] || [family, family + 'Alt'];
    const uniq = [...new Set(pair)];
    const dur = Math.max(0.12, (line.end ?? line.time + 1) - line.time);
    const times = [];
    for (let k = 0; k < samples; k++) times.push(+(line.time + dur * (k + 0.62) / samples).toFixed(3));

    const measured = {};
    for (const cand of uniq) {
      await page.evaluate(({ id, plan }) => { window.__setProbe({ [id]: plan }); }, { id: line.id, plan: cand });
      const parts = [];
      for (const t of times) {
        const m = await page.evaluate(({ t, width, height }) => window.__measure(t, width, height), { t, width, height });
        m.t = t;
        parts.push(m);
      }
      const live = parts.filter(m => m.footprint > 200);
      measured[cand] = {
        contrast: live.length ? Math.min(...live.map(m => m.contrast)) : 0,
        bgLum: live.length ? +(live.reduce((s, m) => s + m.bgLum, 0) / live.length).toFixed(4) : 0,
        invisible: live.length ? Math.max(...live.map(m => m.invisiblePct)) : 100,
        samples: parts,
      };
    }
    await page.evaluate(() => { window.__setProbe(null); });

    const base = measured[pair[0]] || { contrast: 0 };
    const alt = measured[pair[1]] || null;
    let chosen = pair[0];
    let reason = 'base';
    if (alt && alt.contrast > base.contrast + margin) { chosen = pair[1]; reason = 'the other polarity reads better'; }
    else if (alt && base.contrast > alt.contrast + margin) { reason = 'base reads better'; }
    else if (alt) { reason = 'both read about the same'; }
    const entry = {
      id: line.id, family, plan: chosen, reason,
      base: { contrast: base.contrast, bgLum: base.bgLum, invisible: base.invisible },
      alt: alt ? { contrast: alt.contrast, bgLum: alt.bgLum, invisible: alt.invisible } : null,
    };
    report.lines.push(entry);
    const flag = chosen === pair[0] ? '       ' : '-> ALT ';
    console.log(`${line.id} ${family.padEnd(6)} base=${String(base.contrast).padEnd(6)} alt=${String(alt ? alt.contrast : '-').padEnd(6)} ${flag}  ${reason}`);
  }
  if (report.errors.length) for (const e of report.errors) console.error(e);
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
const switched = report.lines.filter(l => l.plan !== l.family);
report.switched = switched.length;
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 1), 'utf8');
console.log(`wrote ${outFile}: ${report.lines.length} lines, ${switched.length} switched to the other polarity`);
for (const l of switched) console.log(`  ${l.id} ${l.family} -> ${l.plan}  base=${l.base.contrast} alt=${l.alt ? l.alt.contrast : '-'}`);
