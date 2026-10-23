// Compose the per-theme stills into one labelled scene overview sheet.
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './serve.mjs';

const req = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = req('@napi-rs/canvas'); }
catch { canvasModule = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas, loadImage } = canvasModule;

const THEMES = [
  ['01 INIT', 'v12init-t01-init.png'],
  ['02 DEAD VARIABLES', 'v13-t02-dead-variables.png'],
  ['03 FEAR / VASCULAR CURRENT', 'v13-t03-fear-vascular-current.png'],
  ['04 ERASE / PERSIST', 'v13-t04-whisper-anomaly.png'],
  ['05 BLACK STAR', 'v13-t05-eyes-distant-star.png'],
  ['06 THE FALL', 'v13-t06-cells-return-to-sea.png'],
  ['07 LAST MEMORY', 'v13-t07-interlude-small-memory.png'],
  ['08 CORE / HEAT ABNORMAL', 'v13-t08-core-heat-abnormal.png'],
  ['09 REALITY ERROR', 'v13-t09-approach-i.png'],
  ['10 THE LAST MESSAGE', 'v13-t10-interlude-signal-study.png'],
  ['11 SHUTDOWN', 'v13-t11-shutdown.png'],
];
const cols = 3, rows = Math.ceil(THEMES.length / cols);
const cw = 620, imgH = 349, ch = imgH + 62;
const sheet = createCanvas(cols * cw, rows * ch + 74), ctx = sheet.getContext('2d');
ctx.fillStyle = '#090C13'; ctx.fillRect(0, 0, sheet.width, sheet.height);
for (let i = 0; i < THEMES.length; i++) {
  const [label, file] = THEMES[i];
  const image = await loadImage(path.join(projectRoot, 'export', file));
  const x = i % cols * cw, y = Math.floor(i / cols) * ch;
  ctx.drawImage(image, x, y, cw, imgH);
  ctx.fillStyle = '#9DE4C2'; ctx.font = '17px Consolas';
  ctx.fillText(label, x + 14, y + imgH + 26);
  ctx.fillStyle = '#C8CCD1'; ctx.font = '13px Consolas';
  ctx.fillText(file, x + 14, y + imgH + 46);
}
ctx.fillStyle = '#9DE4C2'; ctx.font = '34px Consolas';
ctx.fillText('LAST SIGNAL / V13 SCENE OVERVIEW', 26, 44);
ctx.fillStyle = '#C8CCD1'; ctx.font = '16px Consolas';
ctx.fillText('11 THEMES / 1920 x 1080 SOURCE FRAMES / V12 BASELINE PAIRS: export/base-t*.png', 26, 66);
const outName = process.argv[2] || 'v13-scene-overview.png';
await writeFile(path.join(projectRoot, 'export', outName), await sheet.encode('png'));
console.log('wrote export/' + outName);
