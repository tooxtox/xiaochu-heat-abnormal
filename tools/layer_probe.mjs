// Isolated layer probe: render one layer kind on a blank canvas to debug the stack.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { drawLayer } from '../src/scene_layers.mjs';

const req = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = req('@napi-rs/canvas'); }
catch { canvasModule = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas } = canvasModule;
const table = JSON.parse(await readFile(path.join(projectRoot, 'data/scene_layers.json'), 'utf8')).themes;
const theme = process.argv[2] || '9';
const kind = process.argv[3] || 'skyline';
const time = Number(process.argv[4] || 45);
const canvas = createCanvas(1920, 1080), ctx = canvas.getContext('2d');
ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, 1920, 1080);
for (const layer of table[theme].layers) {
  if (kind !== 'all' && layer.kind !== kind) continue;
  console.log('layer', layer.kind, JSON.stringify(layer.opts));
  drawLayer(ctx, time, layer, { travel: 0 });
}
await writeFile(path.join(projectRoot, `export/layer-${theme}-${kind}.png`), await canvas.encode('png'));
console.log('wrote export/layer-' + theme + '-' + kind + '.png');
