// Cost split for the heavy scenery functions.
import { createRequire } from 'node:module';
import path from 'node:path';

const req = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = req('@napi-rs/canvas'); }
catch { canvasModule = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas } = canvasModule;
const { ruinedWorld, architecture, citySkyline } = await import('../src/cinema.mjs');
const { streetGround, streetProps, cityRow, drawBuilding } = await import('../src/scene_layers.mjs');
const { palette } = await import('../src/palette.mjs');

const canvas = createCanvas(1920, 1080), ctx = canvas.getContext('2d');
const bench = (label, fn, n = 12) => {
  fn(0);
  const started = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i / 60);
  console.log(label.padEnd(24), (Number(process.hrtime.bigint() - started) / 1e6 / n).toFixed(1), 'ms');
};

bench('ruinedWorld', t => ruinedWorld(ctx, t, palette.orange, .5, 20));
bench('  citySkyline(.52)', t => citySkyline(ctx, t, palette.red, .5, { rim: '#FF6A45', skyLow: '#8A271E', base: 646, scale: .52, x0: -60, x1: 1980, ruin: .4 }));
bench('  cityRow', t => cityRow(ctx, t, { seed: 21, step: 158, baseY: 772, scroll: 3.2, depth: .42, w: [40, 96], h: [110, 300], fill: '#0B1218', rim: '#FF8A63', lit: .14, x0: -260, x1: 2180 }));
bench('  streetGround', t => streetGround(ctx, t, { horizon: 636, vanishX: 960, color: '#102027', deep: '#070C11', rim: palette.orange, seam: palette.orange, reflect: .24, speed: .03 }));
bench('  streetProps', t => streetProps(ctx, t, { horizon: 636, vanishX: 960, rim: palette.orange, pole: '#050A0F' }));
bench('architecture', t => architecture(ctx, t, palette.mint));
bench('  one building', t => drawBuilding(ctx, t, { seed: 7, x: 400, baseY: 760, w: 110, h: 420, fill: '#04070B', rim: palette.mint, lit: .3 }));
