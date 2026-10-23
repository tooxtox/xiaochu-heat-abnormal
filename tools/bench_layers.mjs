// Per-layer render cost profiler for the scene layer stack.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { drawLayer } from '../src/scene_layers.mjs';

const req = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = req('@napi-rs/canvas'); }
catch { canvasModule = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas } = canvasModule;
const table = JSON.parse(await readFile(path.join(projectRoot, 'data/scene_layers.json'), 'utf8')).themes;
const canvas = createCanvas(1920, 1080), ctx = canvas.getContext('2d');

const themes = process.argv[2] ? [process.argv[2]] : Object.keys(table);
const time = process.argv[3] ? Number(process.argv[3]) : 190.6;
const frames = 16;
for (const theme of themes) {
  console.log(`--- theme ${theme} @ ${time}s ---`);
  for (const layer of table[theme].layers) {
    drawLayer(ctx, time, layer, { travel: 0 });
    const started = process.hrtime.bigint();
    for (let i = 0; i < frames; i++) drawLayer(ctx, time + i / 60, layer, { travel: 0 });
    const ms = Number(process.hrtime.bigint() - started) / 1e6 / frames;
    if (ms > 0.6) console.log(`  ${layer.kind.padEnd(12)} ${ms.toFixed(1)} ms`);
  }
}
