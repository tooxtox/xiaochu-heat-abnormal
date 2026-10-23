// Deterministic Canvas2D -> raw RGBA -> ffmpeg; browser fallback uses the same renderAt clock.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { projectRoot, startServer } from './serve.mjs';
import { verifyJoins } from './check_joins.mjs';

const defaults = { root: projectRoot, width: 1920, height: 1080, fps: 60, start: 0, engine: 'native', preset: 'fast', crf: 18, 'chunk-duration': 60, jobs: 1, 'encoder-threads': 4 };
const options = { ...defaults };
const booleanOptions = new Set(['silent', 'self-test', 'help']);
const allowedOptions = new Set([...Object.keys(defaults), ...booleanOptions, 'duration', 'output', 'audio', 'browser', 'modules', 'renderer', 'lyrics', 'lyric-direction']);
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i].replace(/^--/, '');
  if (!process.argv[i].startsWith('--')) throw new Error(`Expected --option, got ${process.argv[i]}`);
  if (!allowedOptions.has(name)) throw new Error(`Unknown option --${name}`);
  if (booleanOptions.has(name)) options[name] = true;
  else {
    if (!process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${name}`);
    options[name] = process.argv[++i];
  }
}
if (options.help) {
  console.log('node tools/render.mjs [--output export/movie.mp4] [--start 0] [--duration 20] [--fps 60] [--width 1920] [--height 1080] [--jobs 1-8] [--encoder-threads 1-16] [--audio assets/audio/song.m4a] [--lyrics PATH] [--lyric-direction PATH] [--silent] [--engine native|browser] [--browser PATH] [--preset fast] [--crf 18] [--chunk-duration 60] [--self-test]');
  process.exit(0);
}
for (const name of ['width', 'height', 'fps', 'start', 'crf']) options[name] = Number(options[name]);
options.start = +options.start.toFixed(9);
options['chunk-duration'] = Number(options['chunk-duration']);
options.jobs = Number(options.jobs);
options['encoder-threads'] = Number(options['encoder-threads']);
if (!Number.isInteger(options['encoder-threads']) || options['encoder-threads'] < 1 || options['encoder-threads'] > 16) throw new Error('--encoder-threads must be an integer between 1 and 16.');
if(!Number.isInteger(options.jobs)||options.jobs<1||options.jobs>8)throw new Error('--jobs must be an integer between 1 and 8.');
if (!Number.isFinite(options['chunk-duration']) || options['chunk-duration'] < 0) throw new Error('--chunk-duration must be nonnegative.');
if (![options.width, options.height, options.fps].every(n => Number.isFinite(n) && n > 0) || !Number.isInteger(options.width) || !Number.isInteger(options.height) || options.width % 2 || options.height % 2 || options.fps > 120 || options.start < 0 || !Number.isFinite(options.start)) throw new Error('Use positive even dimensions, fps <=120, and start >=0.');
if (!['native', 'browser'].includes(options.engine)) throw new Error('--engine must be native or browser');
options.root = path.resolve(options.root);
const bundledModules = process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules');
function dependency(name) {
  try { return createRequire(import.meta.url)(name); }
  catch { return createRequire(path.join(options.modules || bundledModules, 'package.json'))(name); }
}
function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable} failed: ${result.stderr.slice(-3000)}`);
  return result.stdout;
}
function probe(file) { return JSON.parse(command('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file])); }
async function readJSON(file, fallback) {
  try { return JSON.parse(await readFile(path.resolve(options.root, file), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
function hash(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function finishFlash(qa) {
  const transitions = qa.flashHeuristic.transitions;
  transitions.sort((a, b) => a.time - b.time);
  let right = 0;
  for (let i = 0; i < transitions.length; i++) {
    while (right < transitions.length && transitions[right].time <= transitions[i].time + 1) right++;
    if (right - i >= 6 && (!qa.flashHeuristic.flaggedWindows.length || transitions[i].time - qa.flashHeuristic.flaggedWindows.at(-1).start >= 1)) qa.flashHeuristic.flaggedWindows.push({ start: transitions[i].time, end: +(transitions[i].time + 1).toFixed(4), transitions: right - i });
  }
  qa.flashHeuristic.passedHeuristic = qa.flashHeuristic.flaggedWindows.length === 0;
}

if (options['self-test']) {
  const { createCanvas } = dependency('@napi-rs/canvas');
  const canvas = createCanvas(16, 8), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 16, 8);
  if (canvas.data().length !== 16 * 8 * 4 || canvas.data()[0] !== 255 || canvas.data()[1] !== 0) throw new Error('RGBA canvas test failed');
  command('ffmpeg', ['-version']); command('ffprobe', ['-version']);
  console.log('Native RGBA canvas, ffmpeg and ffprobe self-checks passed. Full exports also check render determinism, frame count, audio and dimensions.');
  process.exit(0);
}

const lyricFiles = { lyrics: options.lyrics || 'data/lyrics.json', lyricDirection: options['lyric-direction'] || 'data/lyric_direction.json' };
const data = { config: await readJSON('config.json', {}), features: await readJSON('data/audio_features.json', null), cues: await readJSON('data/cues.json', { scenes: [] }), lyrics: await readJSON(lyricFiles.lyrics, options.lyrics ? undefined : { lines: [] }), lyricDirection: await readJSON(lyricFiles.lyricDirection, options['lyric-direction'] ? undefined : { cues: [] }), shots: await readJSON('data/shots.json', { shots: [] }), sceneLayers: await readJSON('data/scene_layers.json', { themes: {} }) };
data.audio = data.features; data.audioFeatures = data.features;
let audioPath = path.resolve(options.root, options.audio || data.config.audio || 'assets/audio/song.m4a');
const withAudio = !options.silent && existsSync(audioPath);
if (!options.silent && !existsSync(audioPath)) throw new Error(`Audio not found: ${audioPath}. Supply --audio PATH or use --silent for a silent preview.`);
let sourceDuration = withAudio ? Number(probe(audioPath).format.duration) : Number(data.config.duration || data.features?.duration || 242.538333);
const duration = options.duration === undefined ? sourceDuration - options.start : Number(options.duration);
if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duration must be positive; start must fall within the source.');
const count = Math.ceil(duration * options.fps), encodedDuration = count / options.fps;
const output = path.resolve(options.root, options.output || 'export/xiaochu-heat-abnormal.mp4');
await mkdir(path.dirname(output), { recursive: true });
const qa = { schemaVersion: 1, output: path.basename(output), engine: options.engine, start: options.start, requestedDuration: duration, encodedDuration, width: options.width, height: options.height, fps: options.fps, expectedFrames: count, withAudio, checks: {}, flashHeuristic: { certification: false, note: 'Low-resolution luminance/red transition screening only. This is not a photosensitive-epilepsy safety certification.', threshold: 'At least 6 large-area contrast transitions inside a sliding 1-second window.', sampledFrames: 0, transitions: [], flaggedWindows: [] } };
qa.lyricInputs = Object.fromEntries(Object.entries(lyricFiles).map(([key, file]) => [key, path.resolve(options.root, file)]));
if (options['chunk-duration'] > 0 && count > Math.max(1, Math.floor(options['chunk-duration'] * options.fps))) {
  // ponytail: reset native/ffmpeg allocations every60s; use copied video chunks and one final audio mux.
  const workBase = path.resolve(options.root, 'work');
  await mkdir(workBase, { recursive: true });
  const temp = await mkdtemp(path.join(workBase, 'render-'));
  const chunkFrames = Math.max(1, Math.floor(options['chunk-duration'] * options.fps)), segments = [];
  try {
    const chunkCount=Math.ceil(count/chunkFrames);let nextChunk=0;
    async function renderPart(index){
      const offset=index*chunkFrames;
      const frames = Math.min(chunkFrames, count - offset), name = `part-${String(index).padStart(4, '0')}.mp4`, part = path.join(temp, name);
      const args = [fileURLToPath(import.meta.url), '--root', options.root, '--start', String(+(options.start + offset / options.fps).toFixed(9)), '--duration', String((frames - 1e-6) / options.fps), '--chunk-duration', '0', '--silent', '--output', part];
      for (const key of ['width', 'height', 'fps', 'engine', 'preset', 'crf', 'encoder-threads', 'modules', 'renderer', 'browser', 'lyrics', 'lyric-direction']) if (options[key] !== undefined) args.push(`--${key}`, String(options[key]));
      console.log(`Rendering chunk ${index + 1}/${chunkCount}, frames ${offset}…${offset + frames - 1}.`);
      await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform === 'win32' });
        let errors = '';
        child.stdout.on('data', chunk => process.stdout.write(chunk));
        child.stderr.on('data', chunk => { errors = (errors + chunk).slice(-6000); });
        child.on('error', reject);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`Chunk failed (${code}): ${errors}. Validated chunks retained at ${temp}`)));
      });
      const report = JSON.parse(await readFile(part.replace(/\.mp4$/i, '.qa.json'), 'utf8'));
      if (!report.checks.encoding.passed || report.checks.encoding.frames !== frames) throw new Error('Chunk frame verification failed.');
      segments[index]={ name, start: options.start + offset / options.fps, frames, report };
    }
    const results=await Promise.allSettled(Array.from({length:Math.min(options.jobs,chunkCount)},async()=>{while(nextChunk<chunkCount){const index=nextChunk++;await renderPart(index)}}));
    const failed=results.filter(r=>r.status==='rejected');if(failed.length)throw new AggregateError(failed.map(r=>r.reason),'One or more render workers failed.');
    const list = path.join(temp, 'concat.txt');
    await writeFile(list, segments.map(segment => `file '${segment.name}'`).join('\n'));
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-f', 'concat', '-safe', '0', '-i', list];
    if (withAudio) args.push('-ss', String(options.start), '-i', audioPath);
    args.push('-map', '0:v:0', '-c:v', 'copy');
    if (withAudio) args.push('-map', '1:a:0', '-c:a', options.start === 0 ? 'copy' : 'aac', ...(options.start === 0 ? [] : ['-b:a', '320k']));
    args.push('-t', String(encodedDuration), '-movflags', '+faststart', output);
    command('ffmpeg', args);
    const metadata = probe(output), video = metadata.streams.find(stream => stream.codec_type === 'video'), audio = metadata.streams.find(stream => stream.codec_type === 'audio');
    const actualFrames = Number(video.nb_frames), frameRate = video.avg_frame_rate.split('/').map(Number).reduce((a, b) => a / b);
    qa.segments = segments.map(({ name, start, frames }) => ({ name, start, frames }));
    qa.checks.determinism = { passed: segments.every(segment => segment.report.checks.determinism.passed), samples: segments.flatMap(segment => segment.report.checks.determinism.samples) };
    qa.checks.firstFrameRetention = { passed: segments.every(segment => segment.report.checks.firstFrameRetention.passed), chunks: segments.map(segment => ({ start: segment.start, ...segment.report.checks.firstFrameRetention })) };
    qa.checks.encoding = { passed: video.width === options.width && video.height === options.height && Math.abs(frameRate - options.fps) < .001 && actualFrames === count && (!withAudio || !!audio), codec: video.codec_name, pixelFormat: video.pix_fmt, width: video.width, height: video.height, fps: frameRate, frames: actualFrames, audioCodec: audio?.codec_name || null, duration: +metadata.format.duration };
    console.log('Checking decoded picture hashes at each copied video join…');
    qa.checks.joinFrames = verifyJoins(output, segments.map(segment => path.join(temp, segment.name)));
    if (withAudio && options.start === 0 && duration >= sourceDuration - 1 / options.fps) {
      const packetHash = file => command('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', '-']).trim();
      const sourceHash = packetHash(audioPath), outputHash = packetHash(output);
      qa.checks.sourceAudioPackets = { passed: sourceHash === outputHash, sourceHash, outputHash };
    }
    qa.flashHeuristic.transitions = segments.flatMap(segment => segment.report.flashHeuristic.transitions);
    qa.flashHeuristic.sampledFrames = segments.reduce((sum, segment) => sum + segment.report.flashHeuristic.sampledFrames, 0);
    qa.flashHeuristic.note += ' Individual chunk seam transitions are excluded; use check_flash.py for screening every encoded frame.';
    finishFlash(qa);
    await writeFile(output.replace(/\.mp4$/i, '') + '.qa.json', JSON.stringify(qa, null, 2));
    if (!qa.checks.encoding.passed || !qa.checks.determinism.passed || !qa.checks.firstFrameRetention.passed || !qa.checks.joinFrames.passed || qa.checks.sourceAudioPackets?.passed === false) throw new Error('Final chunked export verification failed.');
    if (!path.resolve(temp).startsWith(workBase + path.sep)) throw new Error('Temporary cleanup path escaped work directory.');
    await rm(temp, { recursive: true, force: true });
    console.log(`Saved ${output}: ${actualFrames} exact frames, ${frameRate}fps, one final audio mux, ${segments.length} bounded chunks.`);
  } catch (error) {
    qa.error = error.stack || error.message;
    qa.retainedWorkDirectory = temp;
    await writeFile(output.replace(/\.mp4$/i, '') + '.qa.json', JSON.stringify(qa, null, 2));
    throw error;
  }
  process.exit(0);
}
let renderer, cleanup = async () => {}, encoder, encoderError = '', processError, encoderExit;
try {
  if (options.engine === 'native') {
    const canvasModule = dependency('@napi-rs/canvas');
    const { createCanvas, loadImage, GlobalFonts } = canvasModule;
    globalThis.Path2D ??= canvasModule.Path2D;
    globalThis.ImageData ??= canvasModule.ImageData;
    for (const font of ['msyh.ttc', 'simsun.ttc', 'simhei.ttf', 'NotoSerifJP-VF.ttf', 'NotoSansJP-VF.ttf', 'consola.ttf']) {
      const fontPath = `C:/Windows/Fonts/${font}`;
      if (existsSync(fontPath)) GlobalFonts.registerFromPath(fontPath);
    }
    const fontDir = path.join(options.root, 'assets/fonts');
    if (existsSync(fontDir)) for (const file of await readdir(fontDir)) if (/\.(ttf|otf|ttc)$/i.test(file)) GlobalFonts.registerFromPath(path.join(fontDir, file));
    const manifest = await readJSON('assets/character/manifest.json', {});
    const imagePaths = data.config.images || manifest.images || Object.fromEntries(['full', 'calm', 'fear', 'sad', 'peace'].map(name => [name, `assets/character/xiaochu-${name}.png`]));
    const resources = { images: {}, rigData: data.config.rigs, makeCanvas: createCanvas, gradeMap: data.config.fxAssets };
    for (const [name, file] of Object.entries(imagePaths)) {
      const actual = typeof file === 'string' ? file : file.path;
      if (!actual) continue;
      const fullPath = path.resolve(options.root, actual);
      if (!existsSync(fullPath)) { if (name === 'full') throw new Error(`Character asset missing: ${fullPath}`); continue; }
      resources[name] = resources.images[name] = await loadImage(fullPath);
    }
    const { renderFrame } = await import(pathToFileURL(path.join(options.root, options.renderer || 'src/film.mjs')).href);
    if (typeof renderFrame !== 'function') throw new Error('src/film.mjs must export renderFrame(ctx,t,resources,data,width,height).');
    const canvas = createCanvas(options.width, options.height), ctx = canvas.getContext('2d');
    const sample = createCanvas(64, 36), sampleCtx = sample.getContext('2d');
    renderer = async t => {
      ctx.reset(); sampleCtx.reset();
      await renderFrame(ctx, t, resources, data, options.width, options.height);
      sampleCtx.drawImage(canvas, 0, 0, 64, 36);
      // Native data() shares mutable pixel storage. Held QA/first frames must own their bytes.
      return { buffer: Buffer.from(canvas.data()), sample: sampleCtx.getImageData(0, 0, 64, 36).data };
    };
  } else {
    const { chromium } = dependency('playwright');
    const service = await startServer(options.root);
    const browserPath = options.browser || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
    const browser = await chromium.launch({ headless: true, ...(browserPath ? { executablePath: browserPath } : {}) });
    cleanup = async () => { await browser.close(); await new Promise(resolve => service.server.close(resolve)); };
    const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.goto(`${service.url}/?export=1&width=${options.width}&height=${options.height}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => typeof window.renderAt === 'function' && document.querySelector('#film'));
    await page.evaluate(async ({ lyrics, lyricDirection }) => { Object.assign(window.MVData, { lyrics, lyricDirection }); await document.fonts.ready; window.__renderSample = document.createElement('canvas'); window.__renderSample.width = 64; window.__renderSample.height = 36; }, { lyrics: data.lyrics, lyricDirection: data.lyricDirection });
    renderer = async t => {
      const frame = await page.evaluate(async ({ t, width, height }) => {
        const canvas = document.querySelector('#film');
        if (canvas.width !== width) canvas.width = width;
        if (canvas.height !== height) canvas.height = height;
        await window.renderAt(t, { width, height });
        const sample = window.__renderSample.getContext('2d'); sample.drawImage(canvas, 0, 0, 64, 36);
        return { png: canvas.toDataURL('image/png').split(',')[1], sample: Array.from(sample.getImageData(0, 0, 64, 36).data), width: canvas.width, height: canvas.height };
      }, { t, width: options.width, height: options.height });
      if (frame.width !== options.width || frame.height !== options.height) throw new Error('renderAt changed requested export dimensions.');
      if (browserErrors.length) throw new Error(browserErrors.join('\n'));
      return { buffer: Buffer.from(frame.png, 'base64'), sample: frame.sample };
    };
  }
  // 浏览器里一块"刚创建"的画布走的是冷光栅化路径，与后续复用时存在亚像素差别；
  // 这与时间无关，正式导出时每帧前面也都有别的帧。先热身一次再比较，
  // 让确定性检查测的是"同一时刻重复渲染是否一致"，而不是冷启动差异。
  const warm = async time => { if (options.engine === 'browser') await renderer(time); };
  await warm(options.start);
  const first = await renderer(options.start), firstHash = hash(first.buffer), repeated = await renderer(options.start);
  const samples = [{ passed: firstHash === hash(repeated.buffer), sha256: firstHash, time: options.start }];
  for (const offset of [.37, .83]) {
    const time = options.start + duration * offset;
    await warm(time);
    const a = await renderer(time), b = await renderer(time);
    samples.push({ time: +time.toFixed(6), passed: hash(a.buffer) === hash(b.buffer), sha256: hash(a.buffer) });
  }
  qa.checks.determinism = { passed: samples.every(sample => sample.passed), samples };
  qa.checks.firstFrameRetention = { passed: hash(first.buffer) === firstHash, beforeSha256: firstHash, afterSha256: hash(first.buffer) };
  if (!qa.checks.firstFrameRetention.passed) throw new Error('Held first-frame pixels changed after later QA renders.');
  if (!qa.checks.determinism.passed) throw new Error('Same-time rendering produced different pixels. Remove wall-clock/random state.');
  const input = options.engine === 'native' ? ['-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${options.width}x${options.height}`, '-framerate', String(options.fps)] : ['-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(options.fps)];
  const args = ['-hide_banner', '-loglevel', 'warning', '-nostdin', '-y', ...input, '-i', 'pipe:0'];
  if (withAudio) args.push('-ss', String(options.start), '-i', audioPath);
  args.push('-map', '0:v:0');
  if (withAudio) args.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '320k');
  args.push('-c:v', 'libx264', '-preset', options.preset, '-crf', String(options.crf), '-pix_fmt', 'yuv420p', '-frames:v', String(count), '-t', String(encodedDuration), '-movflags', '+faststart', output);
  // Windows console Ctrl-C from another preview session must not stop this encoder.
  // 限定每个编码进程的线程与内存，给多段画面渲染保留资源。
  args.splice(args.length - 1, 0, '-threads', String(options['encoder-threads']));
  encoder = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true, detached: process.platform === 'win32' });
  encoder.stderr.on('data', chunk => { encoderError = (encoderError + chunk).slice(-6000); });
  encoder.on('error', error => { processError = error; });
  encoder.stdin.on('error', error => { processError = error; });
  const complete = new Promise(resolve => encoder.on('close', (code, signal) => { encoderExit = { code, signal }; resolve(code); }));
  let previousSample, lastProgress = Date.now();
  for (let index = 0; index < count; index++) {
    if (processError) throw processError;
    const time = +(options.start + index / options.fps).toFixed(9);
    const frame = index === 0 ? first : await renderer(time);
    if (previousSample) {
      let changed = 0, changedRed = 0;
      for (let p = 0; p < frame.sample.length; p += 4) {
        const a = frame.sample, b = previousSample;
        const oldLuma = .2126 * b[p] + .7152 * b[p + 1] + .0722 * b[p + 2], luma = .2126 * a[p] + .7152 * a[p + 1] + .0722 * a[p + 2];
        if (Math.abs(luma - oldLuma) > 51 && Math.max(luma, oldLuma) > 80) changed++;
        const oldRed = Math.max(0, b[p] - (b[p + 1] + b[p + 2]) / 2), red = Math.max(0, a[p] - (a[p + 1] + a[p + 2]) / 2);
        if (Math.abs(red - oldRed) > 65) changedRed++;
      }
      if (changed / 2304 > .25 || changedRed / 2304 > .25) qa.flashHeuristic.transitions.push({ time: +time.toFixed(4), area: +(changed / 2304).toFixed(3), redArea: +(changedRed / 2304).toFixed(3) });
    }
    previousSample = frame.sample;
    qa.flashHeuristic.sampledFrames++;
    if (!encoder.stdin.write(frame.buffer)) await once(encoder.stdin, 'drain');
    if (Date.now() - lastProgress > 10000 || index === count - 1) { console.log(`Rendered ${index + 1}/${count} frames (${(100 * (index + 1) / count).toFixed(1)}%).`); lastProgress = Date.now(); }
  }
  encoder.stdin.end();
  const exitCode = await complete;
  qa.encoderExit = encoderExit;
  if (encoderError) qa.encoderMessages = encoderError;
  if (processError || exitCode !== 0) throw new Error(`ffmpeg failed (${exitCode}): ${processError?.message || encoderError}`);
  const metadata = probe(output), video = metadata.streams.find(s => s.codec_type === 'video'), audio = metadata.streams.find(s => s.codec_type === 'audio');
  const actualFrames = Number(video.nb_frames), frameRate = video.avg_frame_rate.split('/').map(Number).reduce((a, b) => a / b);
  qa.checks.encoding = { passed: video.width === options.width && video.height === options.height && Math.abs(frameRate - options.fps) < .001 && actualFrames === count && (!withAudio || !!audio), codec: video.codec_name, pixelFormat: video.pix_fmt, width: video.width, height: video.height, fps: frameRate, frames: actualFrames, audioCodec: audio?.codec_name || null, duration: +metadata.format.duration };
  finishFlash(qa);
  await writeFile(output.replace(/\.mp4$/i, '') + '.qa.json', JSON.stringify(qa, null, 2));
  if (!qa.checks.encoding.passed) throw new Error('Encoded media QA failed; inspect the .qa.json sidecar.');
  console.log(`Saved ${output}. QA: ${actualFrames} frames, ${video.width}x${video.height}, ${frameRate} fps, audio=${!!audio}; flash-screening windows=${qa.flashHeuristic.flaggedWindows.length} (not a safety certification).`);
} catch (error) {
  if (encoder && encoder.exitCode === null) encoder.kill();
  qa.error = error.stack || error.message;
  qa.encoderExit = encoderExit || { code: encoder?.exitCode, signal: encoder?.signalCode };
  qa.encoderMessages = encoderError;
  await writeFile(output.replace(/\.mp4$/i, '') + '.qa.json', JSON.stringify(qa, null, 2)).catch(() => {});
  throw error;
} finally {
  await cleanup();
}
