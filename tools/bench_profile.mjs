// CPU profile of the heaviest scene to find the real hot spot.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { renderFrame } from '../src/film.mjs';

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
  config: await loadJSON('config.json'), features: await loadJSON('data/audio_features.json'),
  cues: await loadJSON('data/cues.json'), lyrics: await loadJSON('data/lyrics.json', { lines: [] }),
  lyricDirection: await loadJSON('data/lyric_direction.json', { cues: [] }),
  shots: await loadJSON('data/shots.json', { shots: [] }),
  sceneLayers: await loadJSON('data/scene_layers.json', { themes: {} }),
};
const resources = { rigData: data.config.rigs, makeCanvas: createCanvas, gradeMap: data.config.fxAssets };
for (const [key, file] of Object.entries(data.config.images)) resources[key] = await loadImage(path.join(projectRoot, file));
const frame = createCanvas(1920, 1080), ctx = frame.getContext('2d');
const time = Number(process.argv[2] || 123.8);
if(process.env.MV_NO_SCENERY) data.sceneLayers={themes:{}};
for (let i = 0; i < 40; i++) renderFrame(ctx, time + i / 60, resources, data, 1920, 1080);
console.log('profiled', time);
