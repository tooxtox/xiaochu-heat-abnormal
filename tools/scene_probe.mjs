// Render one full-resolution frame per scene theme so the environment art can be reviewed.
// Usage: node tools/scene_probe.mjs [--prefix v12] [--time 101.5] [--theme 7]
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { renderFrame, sceneAt } from '../src/film.mjs';

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

const option = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
  return process.argv[i + 1];
};
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

const prefix = option('prefix', 'probe');
// Pick the longest wide/portrait shot of every scene theme so the probe always lands on
// the environment art instead of an eye or hand insert.
const shots = (data.shots.shots || []).filter(s => s.mode === 'wide' || s.mode === 'portrait' || s.mode === 'world');
const themeTimes = {};
for (const shot of shots) {
  const theme = shot.scene;
  const duration = (shot.end ?? 0) - shot.start;
  if (!themeTimes[theme] || duration > themeTimes[theme].duration) {
    themeTimes[theme] = { time: shot.start + duration * .55, duration, intent: shot.intent, mode: shot.mode };
  }
}
const wanted = option('theme', null);
const custom = option('time', null);
const list = wanted ? [Number(wanted)] : Object.keys(themeTimes).map(Number);
for (const theme of list) {
  const pick = themeTimes[theme];
  const time = custom != null ? Number(custom) : pick.time;
  const scene = sceneAt(time, data);
  ctx.reset();
  renderFrame(ctx, time, resources, data, 1920, 1080);
  const name = `${prefix}-t${String(theme).padStart(2, '0')}-${String(scene.label).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`;
  await writeFile(path.join(projectRoot, 'export', name), await frame.encode('png'));
  console.log(`theme ${theme} -> ${scene.label} @ ${time}s -> export/${name}`);
}
