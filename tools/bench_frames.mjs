// Frame cost benchmark for the new scene art, with and without the glitch post pass.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { renderFrame } from '../src/film.mjs';
import { glitchToggle } from '../src/glitch.mjs';

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

const spots = [
  ['observatory', 28.5], ['data-space', 21.7], ['city', 45.2],
  ['ruins-out', 123.8], ['ruins-glitch', 190.6],
  ['memory', 93.3], ['core-glitch', 214.3], ['shutdown', 240.5],
];
const measure = (time, frames = 16) => {
  renderFrame(ctx, time, resources, data, 1920, 1080);
  const started = process.hrtime.bigint();
  for (let i = 0; i < frames; i++) renderFrame(ctx, time + i / 60, resources, data, 1920, 1080);
  return Number(process.hrtime.bigint() - started) / 1e6 / frames;
};
for (const [label, time] of spots) {
  glitchToggle.enabled = false;
  const plain = measure(time);
  glitchToggle.enabled = true;
  const glitched = measure(time);
  console.log(`${label.padEnd(13)} base ${plain.toFixed(1)} ms   with-glitch ${glitched.toFixed(1)} ms   glitch cost ${(glitched - plain).toFixed(1)} ms`);
}
