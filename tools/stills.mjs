// Regenerate review contact sheet and three representative full-resolution frames.
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
const lyricsFile = option('lyrics', 'data/lyrics.json'), directionFile = option('lyric-direction', 'data/lyric_direction.json');
const data = { config: await loadJSON('config.json'), features: await loadJSON('data/audio_features.json'), cues: await loadJSON('data/cues.json'), lyrics: await loadJSON(lyricsFile, process.argv.includes('--lyrics') ? undefined : { lines: [] }), lyricDirection: await loadJSON(directionFile, process.argv.includes('--lyric-direction') ? undefined : { cues: [] }), shots: await loadJSON('data/shots.json', { shots: [] }), sceneLayers: await loadJSON('data/scene_layers.json', { themes: {} }) };
const resources = { rigData: data.config.rigs, makeCanvas: createCanvas, gradeMap: data.config.fxAssets };
for (const [key, file] of Object.entries(data.config.images)) resources[key] = await loadImage(path.join(projectRoot, file));
const frame = createCanvas(1920, 1080), ctx = frame.getContext('2d');
await mkdir(path.join(projectRoot, 'export'), { recursive: true });
if (process.argv.includes('--shots')) {
  const prefixIndex = process.argv.indexOf('--prefix'), prefix = prefixIndex >= 0 ? process.argv[prefixIndex + 1] : 'v2';
  if (!prefix || !/^[a-z0-9_-]+$/i.test(prefix)) throw new Error('--prefix must contain only letters, digits, underscores or hyphens.');
  const shots = data.shots.shots || [], timing = [], fps = data.config.fps || 60;
  if (!shots.length) throw new Error('No shots found in data/shots.json.');
  for (let offset = 0; offset < shots.length; offset += 12) {
    const page = createCanvas(1440, 1256), pageCtx = page.getContext('2d');
    pageCtx.fillStyle = '#090C13'; pageCtx.fillRect(0, 0, page.width, page.height);
    for (let local = 0; local < Math.min(12, shots.length - offset); local++) {
      const shot = shots[offset + local], end = shot.end ?? shots[offset + local + 1]?.start ?? data.config.duration;
      const captureFrame = Math.round((shot.start + end) / 2 * fps), time = +(captureFrame / fps).toFixed(9);
      const x = local % 3 * 480, y = Math.floor(local / 3) * 314;
      ctx.reset(); renderFrame(ctx, time, resources, data, 1920, 1080);
      pageCtx.drawImage(frame, x, y, 480, 270);
      pageCtx.font = '15px Consolas'; pageCtx.fillStyle = '#C8CCD1';
      pageCtx.fillText(`${String(shot.id).padStart(2, '0')} / ${shot.mode || 'SHOT'} / SCENE ${shot.scene}`, x + 12, y + 290);
      pageCtx.font = '12px Consolas'; pageCtx.fillStyle = '#9DE4C2';
      pageCtx.fillText(`${shot.start.toFixed(3)}–${end.toFixed(3)} s / FRAME ${captureFrame} / ${time.toFixed(6)} s`, x + 12, y + 308);
      timing.push({ id: shot.id, scene: shot.scene, mode: shot.mode, intent: shot.intent, start: shot.start, end, captureFrame, captureTime: time });
    }
    await writeFile(path.join(projectRoot, `export/${prefix}-shots-${String(offset / 12 + 1).padStart(2, '0')}.png`), await page.encode('png'));
  }
  for (const time of [15, 43, 180]) {
    ctx.reset(); renderFrame(ctx, time, resources, data, 1920, 1080);
    await writeFile(path.join(projectRoot, `export/${prefix}-detail-${String(time).padStart(3, '0')}.png`), await frame.encode('png'));
  }
  await writeFile(path.join(projectRoot, `export/${prefix}-shot-timing.json`), JSON.stringify({ fps, timingStatus: data.shots.timingStatus, sampleMethod: 'Nearest global frame to each shot midpoint.', shots: timing }, null, 2));
  console.log(`Saved ${shots.length} shot midpoints in ${Math.ceil(shots.length / 12)} contact sheets,3 detail stills and timing JSON with prefix ${prefix}.`);
  process.exit(0);
}
const sheet = createCanvas(1440, 1256), grid = sheet.getContext('2d');
grid.fillStyle = '#090C13'; grid.fillRect(0, 0, sheet.width, sheet.height);
const times = [8, 34, 56, 77, 101, 124, 154, 178, 204, 229, 240];
for (let index = 0; index < times.length; index++) {
  const time = times[index], scene = sceneAt(time, data), x = index % 3 * 480, y = Math.floor(index / 3) * 314;
  renderFrame(ctx, time, resources, data, 1920, 1080);
  grid.drawImage(frame, x, y, 480, 270);
  grid.font = '16px Consolas'; grid.fillStyle = '#C8CCD1';
  grid.fillText(`${String(scene.id).padStart(2, '0')} / ${scene.label}`, x + 12, y + 290);
  grid.font = '12px Consolas'; grid.fillStyle = '#9DE4C2';
  grid.fillText(`${Math.floor(time / 60)}:${String(time % 60).padStart(2, '0')} / ${scene.state}`, x + 12, y + 308);
  if ([1, 7, 8].includes(scene.id)) await writeFile(path.join(projectRoot, `export/scene${String(scene.id).padStart(2, '0')}.png`), await frame.encode('png'));
}
grid.fillStyle = '#9DE4C2'; grid.font = '36px Consolas'; grid.fillText('LAST SIGNAL', 992, 1035);
grid.fillStyle = '#C8CCD1'; grid.font = '18px Consolas'; grid.fillText('11 SCENES / 04:02.54', 992, 1080);
grid.fillText('1920 x 1080 / 60 FPS', 992, 1112);
grid.font = '14px Consolas'; grid.fillText('AUDIO: N25 x KAITO / 2DMV', 992, 1160);
await writeFile(path.join(projectRoot, 'export/storyboard.png'), await sheet.encode('png'));
for (const [time, name] of [[4, 'scene01-seated'], [222, 'scene10-seated']]) {
  renderFrame(ctx, time, resources, data, 1920, 1080);
  await writeFile(path.join(projectRoot, `export/${name}.png`), await frame.encode('png'));
}
const boundaries = createCanvas(1440, data.cues.scenes.length * 314), boundaryCtx = boundaries.getContext('2d');
boundaryCtx.fillStyle = '#090C13'; boundaryCtx.fillRect(0, 0, boundaries.width, boundaries.height);
for (let index = 0; index < data.cues.scenes.length; index++) {
  const scene = data.cues.scenes[index], end = data.cues.scenes[index + 1]?.start ?? data.config.duration;
  const samples = [[scene.start + 1 / 60, 'FIRST'], [(scene.start + end) / 2, 'EVENT / MIDPOINT'], [end - 1 / 60, 'LAST']];
  for (let column = 0; column < samples.length; column++) {
    const [time, label] = samples[column], x = column * 480, y = index * 314;
    renderFrame(ctx, time, resources, data, 1920, 1080);
    boundaryCtx.drawImage(frame, x, y, 480, 270);
    boundaryCtx.fillStyle = '#C8CCD1'; boundaryCtx.font = '15px Consolas';
    boundaryCtx.fillText(`${String(scene.id).padStart(2, '0')} / ${scene.label}`, x + 12, y + 290);
    boundaryCtx.fillStyle = '#9DE4C2'; boundaryCtx.font = '12px Consolas';
    boundaryCtx.fillText(`${label} / ${time.toFixed(6)} s`, x + 12, y + 308);
  }
}
await writeFile(path.join(projectRoot, 'export/scene-boundaries.png'), await boundaries.encode('png'));
console.log('Wrote storyboard,33-frame scene-boundaries sheet,3 key stills and2 seated stills.');
