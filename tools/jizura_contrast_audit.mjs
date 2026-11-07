// JIZURA contrast audit — does the lyric actually separate from the picture?
//
// For every lyric line the frame is rendered twice: with the engine's plan renderer and
// with it stubbed out. The pixels that differ are the lyric's footprint. For those pixels
// we compare the rendered ink against the picture underneath it and report a WCAG-style
// contrast ratio plus the share of the glyph area that is effectively invisible.
//
// A line can look "there" and still be unreadable: near-white ink on the film's bright
// red sky measures about 2:1. This tool is how that gets caught before the render.
//
// node tools/jizura_contrast_audit.mjs [--samples 2] [--prefix v15h]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const samples = Number(arg('samples', 2));
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const prefix = arg('prefix', 'contrast');
const outDir = path.resolve(root, arg('out', 'export'));
mkdirSync(outDir, { recursive: true });

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
const report = { prefix, samples, width, height, lines: [], errors: [] };
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
    window.__contrast = async (t, width, height) => {
      const canvas = document.querySelector('#film');
      await window.renderAt(t, { width, height });
      const a = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = () => {};
      await window.renderAt(t, { width, height });
      const b = canvas.getContext('2d').getImageData(0, 0, width, height).data;
      window.JZ.drawPlan = window.__origPlan;
      let inkL = 0, bgL = 0, inkN = 0, footprint = 0, invisible = 0, faint = 0, sumRatio = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d <= 8) continue;
        footprint++;
        if (d < 24) invisible++;
        if (d < 48) faint++;
        const la = lum(a[i], a[i + 1], a[i + 2]);
        const lb = lum(b[i], b[i + 1], b[i + 2]);
        inkL += la; bgL += lb; inkN++;
        sumRatio += ratio(la, lb);
      }
      if (!inkN) return { footprint: 0, inkLum: 0, bgLum: 0, contrast: 0, invisiblePct: 0, faintPct: 0 };
      return {
        footprint,
        inkLum: +(inkL / inkN).toFixed(4),
        bgLum: +(bgL / inkN).toFixed(4),
        contrast: +(sumRatio / inkN).toFixed(2),
        invisiblePct: +(invisible * 100 / inkN).toFixed(1),
        faintPct: +(faint * 100 / inkN).toFixed(1),
      };
    };
  });

  // Sample where the lyric is actually being read: after each cut's entrance has
  // finished. Sampling the whole line at fixed fractions lands on fade-in and fade-out
  // frames, which measure the animation rather than the legibility of the words.
  const settled = await page.evaluate(() => {
    const out = {};
    for (const P of Object.values(window.JZ.plans || {})) {
      for (const cut of P.plan.cuts || []) {
        const start = +cut.start.toFixed(3), end = +cut.end.toFixed(3);
        if (!(end > start)) continue;
        const inDur = Number(cut.inDur) || 0.12;
        const t = Math.min(end - 0.02, Math.max(start + 0.02, start + inDur + 0.06));
        (out[cut.text] ||= []).push(+t.toFixed(3));
      }
    }
    for (const key of Object.keys(out)) out[key] = [...new Set(out[key])].sort((a, b) => a - b);
    return out;
  });

  const byId = new Map(data.jizuraDirection.lines.map(d => [d.id, d]));
  for (const line of data.lyrics.lines) {
    const dir = byId.get(line.id);
    if (!dir) continue;
    const dur = Math.max(0.12, (line.end ?? line.time + 1) - line.time);
    const times = [];
    const parts = String(line.text).split('/').map(p => p.trim()).filter(Boolean);
    const candidates = settled[line.text] || [];
    // Fall back to the line's own span when the engine's cut text does not match.
    if (candidates.length) {
      for (const t of candidates) if (t > line.time && t < line.time + dur) times.push(t);
    }
    if (!times.length) {
      for (let k = 0; k < samples; k++) times.push(+(line.time + dur * (k + 0.62) / samples).toFixed(3));
    }
    const measured = [];
    for (const t of times) {
      const m = await page.evaluate(({ t, width, height }) => window.__contrast(t, width, height), { t, width, height });
      m.t = t;
      measured.push(m);
    }
    const live = measured.filter(m => m.footprint > 200);
    const contrast = live.length ? Math.min(...live.map(m => m.contrast)) : 0;
    const invisible = live.length ? Math.max(...live.map(m => m.invisiblePct)) : 100;
    const verdict = contrast >= 3.2 && invisible <= 25 ? 'ok' : contrast >= 2.0 ? 'low' : 'poor';
    const entry = {
      id: line.id, time: +line.time.toFixed(3), text: line.text,
      plan: dir.plan, layout: dir.layout, layer: dir.layer || 'front',
      contrast, invisible, verdict,
      samples: measured,
    };
    report.lines.push(entry);
    console.log(`${verdict.padEnd(5)} ${line.id} {pad} {plan}/{layout}/{layer} contrast=${contrast} invisible=${invisible}%`.replace('{pad}', '').replace('{plan}', dir.plan).replace('{layout}', dir.layout).replace('{layer}', dir.layer || 'front'));
  }
  if (report.errors.length) for (const e of report.errors) console.error(e);
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
const counts = report.lines.reduce((a, l) => (a[l.verdict] = (a[l.verdict] || 0) + 1, a), {});
report.counts = counts;
writeFileSync(path.join(outDir, `${prefix}-contrast.json`), JSON.stringify(report, null, 1), 'utf8');
console.log('counts:', JSON.stringify(counts));
console.log('report: ' + path.join(outDir, `${prefix}-contrast.json`));
