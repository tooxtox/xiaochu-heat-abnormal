// JIZURA lyric visibility audit — objective, per line.
//
// For every lyric line the film renders the frame twice: once with the JIZURA engine
// drawing the Japanese text, once with the engine's drawPlan stubbed out (the Chinese
// subtitle band still renders in both, so it cancels out). The pixel difference is the
// contribution the Japanese lyric actually makes to the delivered frame.
//
// A line whose contribution is tiny was swallowed — by a transition wipe that pushed the
// incoming frame off screen, by a faded ghost character, or by being drawn behind the
// subject. The report says which.
//
// node tools/jizura_visibility_audit.mjs [--samples 3] [--out export] [--prefix v15h]
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';
import { transitionAt } from '../src/transitions.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = n => argv.includes(`--${n}`);
const samples = Number(arg('samples', 3));
const width = Number(arg('width', 1920)), height = Number(arg('height', 1080));
const prefix = arg('prefix', 'vis');
const outDir = path.resolve(root, arg('out', 'export'));
const shotDir = path.join(outDir, `${prefix}-visibility`);
mkdirSync(shotDir, { recursive: true });

const readJson = p => JSON.parse(readFileSync(path.resolve(root, p), 'utf8'));
const data = {
  config: readJson('config.json'),
  features: readJson('data/audio_features.json'),
  cues: readJson('data/cues.json'),
  lyrics: readJson('data/lyrics.json'),
  shots: readJson('data/shots.json'),
  lyricDirection: { cues: [] },
  sceneLayers: { cues: [] },
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

  // Install the measurement hook: stub drawPlan so only the Japanese layer disappears.
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
      let changed = 0, strong = 0, maxd = 0;
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
        if (d > 6) changed++;
        if (d > 40) strong++;
        if (d > maxd) maxd = d;
      }
      return { changed, strong, maxd };
    };
  });

  const lines = data.lyrics.lines;
  const byId = new Map(data.jizuraDirection.lines.map(d => [d.id, d]));
  // The engine's own cut list knows exactly where each phrase starts. A blackout shows up
  // on the first frame of a phrase (the previous phrase has left, this one has not faded
  // in yet), so every cut boundary is sampled as well.
  const cutInfo = await page.evaluate(() => {
    const starts = new Set(), settled = [];
    for (const P of Object.values(window.JZ.plans || {})) {
      for (const cut of P.plan.cuts || []) {
        const start = +cut.start.toFixed(3), end = +cut.end.toFixed(3);
        if (!(end > start)) continue;
        starts.add(start);
        const inDur = Number(cut.inDur) || 0.12;
        // Read the phrase after its entrance finished, but never past the middle of the
        // cut: a cut whose entrance is longer than the cut itself never reaches full
        // opacity, and sampling at its very end lands in the handover gap instead.
        const at = Math.min(inDur + 0.06, (end - start) * 0.55);
        settled.push(+Math.min(end - 0.02, Math.max(start + 0.05, start + at)).toFixed(3));
      }
    }
    return { starts: [...starts].sort((a, b) => a - b), settled: [...new Set(settled)].sort((a, b) => a - b) };
  });
  for (const line of lines) {
    const dir = byId.get(line.id);
    if (!dir) { report.lines.push({ id: line.id, verdict: 'no-direction' }); continue; }
    const dur = Math.max(0.12, (line.end ?? line.time + 1) - line.time);
    // Body samples: where the lyric is being read (after each cut's entrance finished).
    const settledTimes = cutInfo.settled.filter(t => t > line.time + 0.02 && t < line.time + dur - 0.02);
    const sampleTimes = settledTimes.length ? settledTimes : [];
    if (!sampleTimes.length) {
      for (let k = 0; k < samples; k++) sampleTimes.push(+(line.time + dur * (k + 0.5) / samples).toFixed(3));
    }
    // Boundary samples: the eight frames either side of every phrase boundary, which is
    // where a handover gap between two phrases would hide.
    const boundaries = cutInfo.starts.filter(b => b > line.time + 0.02 && b < line.time + dur - 0.02);
    const boundaryTimes = boundaries.flatMap(b => {
      const times = [];
      for (let k = -8; k <= 8; k++) times.push(+(b + k / 60).toFixed(4));
      return times;
    });
    const measurements = [];
    for (const t of [...sampleTimes, ...boundaryTimes]) {
      const m = await page.evaluate(({ t, width, height }) => window.__measure(t, width, height), { t, width, height });
      m.t = t;
      const tr = transitionAt(data, t);
      m.transition = tr ? { type: tr.type, progress: +tr.progress.toFixed(3), duration: tr.duration } : null;
      measurements.push(m);
    }
    const body = measurements.slice(0, sampleTimes.length);
    const edges = measurements.slice(sampleTimes.length);
    const strongMin = Math.min(...body.map(m => m.strong));
    const strongMax = Math.max(...body.map(m => m.strong));
    // A phrase boundary may show a short handover gap — that is the beat between two
    // phrases, not a lost lyric. What matters is how wide the gap is: a couple of frames
    // is a breath, a tenth of a second or more reads as a hole in the song.
    const perBoundary = [];
    for (let i = 0; i < boundaries.length; i++) {
      const window = edges.slice(i * 17, (i + 1) * 17);
      let run = 0, longest = 0;
      for (const m of window) {
        if (m.changed < 200) { run++; longest = Math.max(longest, run); } else run = 0;
      }
      perBoundary.push({ at: boundaries[i], holeFrames: longest });
    }
    const holeFrames = perBoundary.length ? Math.max(...perBoundary.map(b => b.holeFrames)) : 0;
    const blackout = holeFrames >= 8;
    const boundaryChangedMin = edges.length ? Math.min(...edges.map(m => m.changed)) : Infinity;
    const boundaryMin = edges.length ? Math.min(...edges.map(m => m.strong)) : strongMin;
    const verdict = blackout ? 'missing'
      : strongMin >= 40000 ? 'strong' : strongMin >= 8000 ? 'weak' : 'missing';
    const entry = {
      id: line.id, time: +line.time.toFixed(3), dur: +dur.toFixed(3),
      text: line.text, plan: dir.plan, layout: dir.layout, layer: dir.layer || 'front',
      enter: dir.enter, exit: dir.exit, cuts: dir.cuts,
      strongMin, strongMax, boundaryMin, boundaryChangedMin, holeFrames, blackout, verdict,
      samples: body.map(m => ({ t: m.t, strong: m.strong, changed: m.changed, maxd: m.maxd, transition: m.transition })),
      boundarySamples: edges.map(m => ({ t: m.t, strong: m.strong, changed: m.changed, maxd: m.maxd, transition: m.transition })),
    };
    report.lines.push(entry);
    if (verdict !== 'strong') {
      // Keep one picture of every failure so the verdict can be eyeballed.
      const t = (edges.length ? edges.reduce((a, b) => (b.strong < a.strong ? b : a)) : body[0]).t;
      const png = await page.evaluate(async ({ t, width, height }) => {
        await window.renderAt(t, { width, height });
        return document.querySelector('#film').toDataURL('image/png').split(',')[1];
      }, { t, width, height });
      const file = path.join(shotDir, `${line.id}-t${t.toFixed(2).replace('.', 'p')}.png`);
      writeFileSync(file, Buffer.from(png, 'base64'));
      entry.shot = path.relative(root, file);
    }
    console.log(`${verdict.padEnd(8)} ${line.id} t=${entry.time.toFixed(2)} dur=${entry.dur.toFixed(2)} ${(dir.plan + '/' + dir.layout + '/' + (dir.layer || 'front')).padEnd(26)} strong=${strongMin}..${strongMax} hole=${holeFrames}f`);
  }
  if (report.errors.length) for (const e of report.errors) console.error(e);
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
const counts = report.lines.reduce((a, l) => (a[l.verdict] = (a[l.verdict] || 0) + 1, a), {});
report.counts = counts;
writeFileSync(path.join(outDir, `${prefix}-visibility.json`), JSON.stringify(report, null, 1), 'utf8');
console.log('counts:', JSON.stringify(counts));
console.log('report: ' + path.join(outDir, `${prefix}-visibility.json`));
