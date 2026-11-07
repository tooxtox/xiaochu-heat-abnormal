// Does the lyric text of a cut ever get drawn? For a time range, report every
// mainDraw call for the given layout and whether it produced a bbox.
//
// The engine delays the first characters of every phrase by `mi * stagger` seconds
// (mi is an energy-derived index), so a single sampled frame can land in a window
// where the words have not entered yet. This walks the whole line and prints the
// timing that decides it.
//
//   node tools/jizura_text_window.mjs --layout arcTop --from 224.0 --to 225.75
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, startServer } from './serve.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const layout = arg('layout', 'priceTag');
const from = Number(arg('from', 116.4));
const to = Number(arg('to', 118.2));
const step = Number(arg('step', 0.05));
const width = 1920, height = 1080;

const browserPath = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const service = await startServer(root);
const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${service.url}/?export=1&width=${width}&height=${height}&jizura=1`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderAt === 'function' && window.MV_READY === true, null, { timeout: 120000 });
  await page.evaluate(() => {
    window.__calls = [];
    const om = window.J.mainDraw;
    window.J.mainDraw = (env, it) => {
      const r = om(env, it);
      if (env.cut && env.cut.layout === window.__wantLayout) {
        window.__calls.push({
          pass: env.pass, text: it.text, size: it.size, color: it.color,
          lt: env.lt, mi: it.mi, delay: it.delay, ltI: env.lt - (it.delay || 0),
          ok: !!r, enter: env.cut.enter, exit: env.cut.exit, stagger: env.cut.stagger,
          cutStart: env.cut.start, cutDur: env.cut.dur, inDur: env.cut.inDur, outDur: env.cut.outDur,
        });
      }
      return r;
    };
  });
  const rows = [];
  for (let t = from; t <= to + 1e-9; t += step) {
    const tt = +t.toFixed(4);
    const calls = await page.evaluate(async ({ t, width, height, layout }) => {
      window.__wantLayout = layout;
      window.__calls = [];
      await window.renderAt(t, { width, height });
      return window.__calls;
    }, { t: tt, width, height, layout });
    const main = calls.find(c => c.pass === 'main');
    rows.push({
      t: tt,
      mainOk: main ? main.ok : null,
      lt: main ? +main.lt.toFixed(4) : null,
      ltI: main ? +main.ltI.toFixed(4) : null,
      delay: main ? +main.delay.toFixed(4) : null,
      mi: main ? +main.mi.toFixed(2) : null,
      text: main ? main.text.replace(/\n/g, '|') : null,
      color: main ? main.color : null,
    });
  }
  for (const r of rows) {
    console.log(`t=${r.t.toFixed(2)}  ok=${String(r.mainOk).padEnd(5)} lt=${String(r.lt).padEnd(8)} ltI=${String(r.ltI).padEnd(9)} delay=${String(r.delay).padEnd(7)} mi=${String(r.mi).padEnd(6)} ${r.text || ''} ${r.color || ''}`);
  }
} finally {
  await browser.close();
  await new Promise(r => service.server.close(r));
}
