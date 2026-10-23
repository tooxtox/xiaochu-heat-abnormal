// Compare actual encoded pictures around chunk starts with direct same-time renders.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { renderFrame } from '../src/film.mjs';

const positional = [], overrides = {};
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--lyrics' || arg === '--lyric-direction') {
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
    overrides[arg] = process.argv[++i];
  } else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
  else positional.push(arg);
}
const movie = path.resolve(projectRoot, positional[0] || 'export/LAST-SIGNAL-1080p60-v3.mp4');
const output = path.resolve(projectRoot, positional[1] || 'export/v3-chunk-picture-qa.json');
const req = createRequire(import.meta.url);
let native;
try { native = req('@napi-rs/canvas'); }
catch { native = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas, loadImage, GlobalFonts } = native;
globalThis.Path2D ??= native.Path2D;
globalThis.ImageData ??= native.ImageData;
for (const name of ['msyh.ttc', 'simsun.ttc', 'simhei.ttf', 'NotoSerifJP-VF.ttf', 'NotoSansJP-VF.ttf', 'consola.ttf']) {
  const file = `C:/Windows/Fonts/${name}`;
  if (existsSync(file)) GlobalFonts.registerFromPath(file);
}
for (const name of await readdir(path.join(projectRoot, 'assets/fonts'))) {
  if (/\.(ttf|otf|ttc)$/i.test(name)) GlobalFonts.registerFromPath(path.join(projectRoot, 'assets/fonts', name));
}
const json = async (file, fallback) => {
  try { return JSON.parse(await readFile(path.resolve(projectRoot, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
};
const lyricFiles = { lyrics: overrides['--lyrics'] || 'data/lyrics.json', lyricDirection: overrides['--lyric-direction'] || 'data/lyric_direction.json' };
const data = { config: await json('config.json'), features: await json('data/audio_features.json'), cues: await json('data/cues.json'), lyrics: await json(lyricFiles.lyrics, overrides['--lyrics'] ? undefined : { lines: [] }), lyricDirection: await json(lyricFiles.lyricDirection, overrides['--lyric-direction'] ? undefined : { cues: [] }), shots: await json('data/shots.json') };
data.audio = data.audioFeatures = data.features;
const resources = { images: {}, rigData: data.config.rigs, makeCanvas: createCanvas, gradeMap: data.config.fxAssets };
for (const [key, file] of Object.entries(data.config.images)) resources[key] = resources.images[key] = await loadImage(path.join(projectRoot, file));
const report = JSON.parse(await readFile(movie.replace(/\.mp4$/i, '.qa.json'), 'utf8'));
const fps = report.fps, count = report.expectedFrames;
const starts = (report.segments || [{ start: report.start }]).map(s => Math.round((s.start - report.start) * fps));
const frames = [...new Set([...starts.flatMap(frame => [frame - 1, frame, frame + 1]), count - 1].filter(frame => frame >= 0 && frame < count))].sort((a, b) => a - b);
const canvas = createCanvas(report.width, report.height), ctx = canvas.getContext('2d');
function ffmpeg(args, input) {
  const result = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', ...args], { input, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr.toString());
  if (result.stdout.length !== 160 * 90 * 3) throw new Error('Unexpected sampled RGB picture size.');
  return result.stdout;
}
const samples = [];
for (const frame of frames) {
  const time = +(report.start + frame / fps).toFixed(9);
  ctx.reset();
  renderFrame(ctx, time, resources, data, canvas.width, canvas.height);
  const expected = ffmpeg(['-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${canvas.width}x${canvas.height}`, '-i', 'pipe:0', '-frames:v', '1', '-vf', 'scale=160:90:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], Buffer.from(canvas.data()));
  const actual = ffmpeg(['-ss', String(frame / fps), '-i', movie, '-frames:v', '1', '-vf', 'scale=160:90:flags=area', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
  let difference = 0, expectedSum = 0, actualSum = 0;
  for (let p = 0; p < expected.length; p++) { difference += Math.abs(expected[p] - actual[p]); expectedSum += expected[p]; actualSum += actual[p]; }
  const mae = difference / expected.length;
  samples.push({ frame, time, isChunkStart: starts.includes(frame), meanAbsoluteRgbError: +mae.toFixed(6), expectedRgbMean: +(expectedSum / expected.length).toFixed(6), actualRgbMean: +(actualSum / actual.length).toFixed(6), passed: mae < 6 });
}
const result = { schemaVersion: 1, movie: path.basename(movie), method: 'Decode each chunk first frame and its immediate neighbors, plus the final frame. Compare with direct same-time 1080p render using identical FFmpeg area downsampling to 160x90 RGB.', threshold: 'Mean absolute RGB error < 6 / 255, allowing H.264 and YUV420 conversion differences.', samples, passed: samples.every(s => s.passed), limitations: ['Checks these sampled pictures only; does not prove every encoded picture matches its intended source.', 'Audio, lyric and vocal alignment are outside this test.'] };
result.lyricInputs = Object.fromEntries(Object.entries(lyricFiles).map(([key, file]) => [key, path.resolve(projectRoot, file)]));
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ samples: samples.length, passed: result.passed, maxMeanAbsoluteRgbError: Math.max(...samples.map(s => s.meanAbsoluteRgbError)), output }));
if (!result.passed) process.exitCode = 1;
