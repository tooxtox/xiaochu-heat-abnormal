// Render one representative frame per transition type so the new cuts can be reviewed.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { renderFrame } from '../src/film.mjs';
import { transitionAt } from '../src/transitions.mjs';

const req = createRequire(import.meta.url);
let canvasModule;
try { canvasModule = req('@napi-rs/canvas'); }
catch { canvasModule = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas, loadImage, GlobalFonts } = canvasModule;
for (const font of ['NotoSerifJP-VF.ttf', 'NotoSansJP-VF.ttf', 'consola.ttf']) {
  const file = `C:/Windows/Fonts/${font}`;
  if (existsSync(file)) GlobalFonts.registerFromPath(file);
}
const fontDir = path.join(projectRoot, 'assets/fonts');
if (existsSync(fontDir)) for (const file of await readdir(fontDir)) if (/\.(ttf|otf|ttc)$/i.test(file)) GlobalFonts.registerFromPath(path.join(fontDir, file));

const loadJSON = async (file, fallback) => {
  try { return JSON.parse(await readFile(path.resolve(projectRoot, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const data = {
  config: await loadJSON('config.json'),
  features: await loadJSON('data/audio_features.json'),
  cues: await loadJSON('data/cues.json'),
  lyrics: await loadJSON('data/lyrics.json', { lines: [] }),
  lyricDirection: await loadJSON('data/lyric_direction.json', { cues: [] }),
  shots: await loadJSON('data/shots.json', { shots: [] }),
  sceneLayers: await loadJSON('data/scene_layers.json', { themes: {} }),
};
const resources = { rigData: data.config.rigs, makeCanvas: createCanvas, gradeMap: data.config.fxAssets };
for (const [key, file] of Object.entries(data.config.images)) resources[key] = await loadImage(path.join(projectRoot, file));
const frame = createCanvas(1920, 1080), ctx = frame.getContext('2d');
await mkdir(path.join(projectRoot, 'export'), { recursive: true });

// Collect the first moment of every distinct transition type.
const seen = new Map();
for (const shot of data.shots.shots) {
  const probe = transitionAt(data, shot.start + 0.02);
  if (!probe || seen.has(probe.type)) continue;
  // Sample a third of the way into the transition so the motion is actually visible.
  const time = probe.start + probe.duration * .34;
  seen.set(probe.type, { time, tr: probe, shot });
}
const entries = [...seen.entries()];
console.log('transition types found:', entries.map(([k, v]) => `${k}@${v.time.toFixed(3)}`).join(', '));

const cols = 3, rows = Math.ceil(entries.length / cols);
const sheet = createCanvas(1440, rows * 314), sheetCtx = sheet.getContext('2d');
sheetCtx.fillStyle = '#090C13'; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
entries.forEach(([type, entry], index) => {
  const x = index % cols * 480, y = Math.floor(index / cols) * 314;
  ctx.reset();
  renderFrame(ctx, entry.time, resources, data, 1920, 1080);
  sheetCtx.drawImage(frame, x, y, 480, 270);
  sheetCtx.font = '15px Consolas'; sheetCtx.fillStyle = '#C8CCD1';
  sheetCtx.fillText(`${type.toUpperCase()} / ${entry.time.toFixed(3)} s`, x + 12, y + 290);
  sheetCtx.font = '12px Consolas'; sheetCtx.fillStyle = '#9DE4C2';
  sheetCtx.fillText(`SHOT ${entry.shot.id} / SCENE ${entry.shot.scene} / ${entry.shot.mode}`, x + 12, y + 308);
});
const outName = process.argv[2] || 'v13-transitions.png';
await writeFile(path.join(projectRoot, 'export', outName), await sheet.encode('png'));
console.log('wrote export/' + outName);
