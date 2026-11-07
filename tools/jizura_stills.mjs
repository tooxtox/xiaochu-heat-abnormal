// JIZURA lyric-layer QA: stills at chosen song times + the cut JIZURA actually picked for that line.
// node tools/jizura_stills.mjs --times 6.2,31.35 --prefix v15-check [--no-jizura] [--width 1920] [--height 1080] [--out export]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback; };
const flag = name => argv.includes(`--${name}`);

const times = String(arg('times', '')).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
if (!times.length) throw new Error('Usage: node tools/jizura_stills.mjs --times 6.2,31.35 [--prefix name] [--no-jizura]');
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const prefix = arg('prefix', 'jz');
const outDir = path.resolve(root, arg('out', 'export'));
const useJizura = !flag('no-jizura');
const dir = path.join(outDir, `${prefix}-stills`);
mkdirSync(dir, { recursive: true });

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
const report = { prefix, jizura: useJizura, width, height, times: [], plans: null };
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !/Failed to load resource/.test(message.text())) errors.push(`console: ${message.text()}`); });
  const url = `${service.url}/?export=1&width=${width}&height=${height}${useJizura ? '&jizura=1' : ''}`;
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  try {
    await page.waitForFunction(jizura => typeof window.renderAt === 'function' && (!jizura || window.MV_READY === true), useJizura, { timeout: 60000 });
  } catch (error) {
    console.error('page never became ready. page errors:');
    for (const e of errors) console.error('  ' + e);
    throw error;
  }
  if (useJizura) {
    report.plans = await page.evaluate(() => window.JIZURA_INFO || null);
    // The direction table decides which plan renders which line; the engine's own cut
    // list is only used to report what that plan planned for the line.
    report.direction = await page.evaluate(() => (window.MVData && window.MVData.jizuraDirection) ? window.MVData.jizuraDirection.lines.map(d => ({
      id: d.id, time: d.time, end: d.end, move: d.move, plan: d.plan, layout: d.layout,
      enter: d.enter, exit: d.exit, hold: d.hold, decor: d.decor, treat: d.treat, cam: d.cam,
      cuts: d.cuts, emphasis: d.emphasis || null, break: d.break || null, kime: !!d.kime,
      layer: d.layer || 'front', note: d.note || null,
    })) : null);
    report.cuts = await page.evaluate(() => {
      const out = {};
      for (const [name, P] of Object.entries(window.JZ.plans || {})) {
        out[name] = P.plan.cuts.map(c => ({
          i: c.index, line: c.line, start: +c.start.toFixed(3), end: +c.end.toFixed(3), text: c.text,
          layout: c.layout, enter: c.enter, hold: c.hold, exit: c.exit, bg: c.bg, cam: c.cam,
          trans: c.trans || null, treat: c.treat || null, fx: c.fx || null,
          decor: (c.decor || []).map(d => d.id || d.type || d), scheme: c.scheme,
        }));
      }
      window.__jzCuts = out;
      return out;
    });
  }
  for (const t of times) {
    const shot = await page.evaluate(async ({ t, width, height }) => {
      const canvas = document.querySelector('#film');
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      await window.renderAt(t, { width, height });
      const data = window.MVData || {};
      const line = (data.lyrics?.lines || []).find(l => t >= l.time && t < (l.end ?? Infinity)) || null;
      const scene = (data.cues?.scenes || []).filter(s => s.start <= t).at(-1) || null;
      let active = null;
      for (const [name, cuts] of Object.entries(window.__jzCuts || {})) {
        const cut = cuts.find(c => t >= c.start && t < c.end);
        if (cut) { active = { enginePlan: name, ...cut }; break; }
      }
      return {
        png: canvas.toDataURL('image/png').split(',')[1],
        line: line ? { id: line.id, time: line.time, end: line.end, text: line.text, translation: line.translation } : null,
        scene: scene ? { id: scene.id, label: scene.label, start: scene.start } : null,
        active,
      };
    }, { t, width, height });
    if (shot.active === null && useJizura) {
      shot.active = await page.evaluate(({ t }) => {
        for (const [name, cuts] of Object.entries(window.__jzCuts || {})) {
          const cut = cuts.find(c => t >= c.start && t < c.end);
          if (cut) return { enginePlan: name, ...cut };
        }
        return null;
      }, { t });
    }
    const file = path.join(dir, `${prefix}-t${t.toFixed(2).replace('.', 'p')}.png`);
    writeFileSync(file, Buffer.from(shot.png, 'base64'));
    const dirLine = report.direction ? report.direction.find(d => Math.abs(d.time - (shot.line?.time ?? -1)) < 0.001) : null;
    report.times.push({ time: t, file: path.relative(root, file), line: shot.line, scene: shot.scene, direction: dirLine, cut: shot.active });
    console.log(`t=${t.toFixed(2)}  ${shot.scene ? shot.scene.label : '(no scene)'}  ${shot.line ? shot.line.text : '(no lyric)'}  ${dirLine ? `[${dirLine.plan}/${dirLine.layout}/${dirLine.move}]` : ''}  -> ${path.basename(file)}`);
  }
  if (errors.length) report.errors = errors;
} finally {
  await browser.close();
  await new Promise(resolve => service.server.close(resolve));
}
writeFileSync(path.join(outDir, `${prefix}-stills.json`), JSON.stringify(report, null, 1), 'utf8');
console.log(`wrote ${report.times.length} stills to ${path.relative(root, dir)} and ${prefix}-stills.json`);
if (report.errors?.length) { console.error('page errors:'); for (const e of report.errors) console.error('  ' + e); process.exitCode = 1; }
