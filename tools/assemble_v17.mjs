// Replace V17 picture windows while copying the original audio and the rest of V16.
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJoins } from './check_joins.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [openingArg, ...args] = process.argv.slice(2);
const usage = 'Usage: node tools/assemble_v17.mjs OPENING.mp4 [OUTPUT.mp4] [--archive ARCHIVE.mp4] [--core CORE.mp4]';
if (!openingArg || openingArg.startsWith('--')) throw new Error(usage);
const clips = new Map([['opening', path.resolve(openingArg)]]);
let outputArg;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--archive' || arg === '--core') {
    const key = arg.slice(2), value = args[++i];
    if (!value || value.startsWith('--') || clips.has(key)) throw new Error(usage);
    clips.set(key, path.resolve(value));
  } else if (!arg.startsWith('--') && !outputArg) {
    outputArg = arg;
  } else {
    throw new Error(usage);
  }
}
const output = path.resolve(outputArg || path.join(root, 'export/LAST-SIGNAL-1080p60-v17.mp4'));
if (!/\.mp4$/i.test(output)) throw new Error('Output must have an .mp4 extension.');
try { await stat(output); throw new Error(`Output already exists: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (path.parse(output).root.toLowerCase() !== path.parse(root).root.toLowerCase()) {
  throw new Error('Choose an output on the same drive as the project so the verified file can be renamed into place.');
}

const base = path.join(root, 'export/LAST-SIGNAL-1080p60-v16.mp4');
const audio = path.join(root, 'assets/audio/song.m4a');
const edits = [['opening', 119, 5608], ['archive', 8634, 9984], ['core', 12732, 13012]]
  .filter(([name]) => clips.has(name));
const boundaries = [0, ...edits.flatMap(([, from, to]) => [from, to]), 14553];
const segments = boundaries.slice(0, -1).map((from, index) => {
  const to = boundaries[index + 1];
  const edit = edits.find(([, start]) => from === start)?.[0];
  return { name: edit ? `${edit}.mp4` : `base-${index}.mp4`, from, to, edit };
});
const seconds = frame => (frame / 60).toFixed(9);

function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable}: ${result.stderr.slice(-3000)}`);
  if (result.stderr.trim()) console.error(result.stderr.trim());
  return result.stdout;
}

function videoPackets(file, frameCount) {
  const probe = JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets',
    '-show_streams', '-show_data_hash', 'sha256', '-show_entries',
    'stream=codec_name,width,height,pix_fmt,time_base,start_pts,duration_ts,avg_frame_rate:packet=pts,duration,flags,data_hash', '-of', 'json', file]));
  const video = probe.streams[0], packets = probe.packets;
  if (!video || video.codec_name !== 'h264' || video.width !== 1920 || video.height !== 1080 || video.pix_fmt !== 'yuv420p' || video.time_base !== '1/15360' || video.avg_frame_rate !== '60/1' || video.start_pts !== 0 || video.duration_ts !== frameCount * 256 || packets.length !== frameCount) {
    throw new Error(`${file}: expected ${frameCount} frames of H.264 1920×1080 at 60 fps starting at zero. Found ${JSON.stringify(video)}, ${packets?.length} packets.`);
  }
  const presentation = [...packets].sort((a, b) => a.pts - b.pts);
  if (!presentation[0].flags.includes('K') || presentation.some((packet, frame) => packet.pts !== frame * 256 || packet.duration !== 256)) {
    throw new Error(`${file}: irregular frame timestamps or missing first keyframe`);
  }
  return presentation;
}

function audioHash(file) {
  return command('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'sha256', '-']).trim();
}

function audioTiming(file) {
  return command('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_packets', '-show_streams',
    '-show_entries', 'stream=time_base:packet=pts,dts,duration', '-of', 'csv=p=0', file]);
}

const basePackets = videoPackets(base, boundaries.at(-1));
const renderedPackets = new Map(edits.map(([name, from, to]) => [name, videoPackets(clips.get(name), to - from)]));
for (const frame of boundaries.slice(1, -1)) {
  if (!basePackets[frame].flags.includes('K')) throw new Error(`V16 has no safe keyframe at frame ${frame}`);
}

const work = path.join(root, 'work/v17');
await mkdir(work, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
const temp = await mkdtemp(path.join(work, 'splice-'));
const ffmpeg = ['-hide_banner', '-nostdin', '-n', '-v', 'warning'];
command('ffmpeg', [...ffmpeg, '-i', base, '-map', '0:v:0', '-c:v', 'copy', '-avoid_negative_ts', 'disabled', '-f', 'segment',
  '-segment_format_options', 'avoid_negative_ts=disabled:movie_timescale=60000', '-segment_times', boundaries.slice(1, -1).map(seconds).join(','),
  '-segment_time_delta', '0.0001', '-reset_timestamps', '1', path.join(temp, 'base-%d.mp4')]);
const parts = segments.map(({ name }) => path.join(temp, name));
for (const { name, edit } of segments) {
  if (edit) await copyFile(clips.get(edit), path.join(temp, name));
}
const list = path.join(temp, 'list.ffconcat');
// Explicit duration prevents the MP4 container's millisecond rounding from accumulating across joins.
await writeFile(list, `ffconcat version 1.0\n${segments.map(({ name, from, to }) => `file '${name}'\nduration ${seconds(to - from)}\n`).join('')}`);
const joined = path.join(temp, 'joined.mp4');
// In-stream SPS/PPS from the concat demuxer permit an NVENC splice into the existing H.264 stream.
command('ffmpeg', [...ffmpeg, '-f', 'concat', '-safe', '0', '-i', list, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy',
  '-video_track_timescale', '15360', '-movie_timescale', '60000', '-avoid_negative_ts', 'disabled', '-movflags', '+faststart', joined]);
const finalPackets = videoPackets(joined, boundaries.at(-1));
const partsReport = segments.map(({ name, from, to, edit }) => {
  const expected = edit ? renderedPackets.get(edit) : basePackets.slice(from, to);
  let changedKeyframes = 0;
  for (const [offset, packet] of expected.entries()) {
    const actual = finalPackets[from + offset];
    if (actual.data_hash === packet.data_hash) continue;
    if (!edit || !actual.flags.includes('K') || !packet.flags.includes('K')) {
      throw new Error(`${name}: video packet at frame ${from + offset} differs from its source`);
    }
    changedKeyframes++;
  }
  return { name, version: edit ? 17 : 16, fromFrame: from, untilFrame: to, frames: to - from, changedKeyframes };
});
const expectedAudio = audioHash(audio), finalAudio = audioHash(joined);
if (expectedAudio !== finalAudio || audioTiming(audio) !== audioTiming(joined)) {
  throw new Error('AAC packet data or timing differs from source audio.');
}
console.log('Video timestamps, unedited V16 packets, and original AAC packets verified. Checking decoded pictures at joins…');
const joins = verifyJoins(joined, parts);
if (!joins.passed) throw new Error(`A decoded picture changed at a join: ${JSON.stringify(joins.joins)}`);
await rename(joined, output);
const report = output.replace(/\.mp4$/i, '.splice.qa.json');
await writeFile(report, JSON.stringify({ output: path.basename(output), fps: 60, frames: finalPackets.length,
  verifiedFrameTimestamps: true, parts: partsReport, sourceAudioPackets: { passed: true, sha256: finalAudio, timestampsUnchanged: true }, joins }, null, 2));
console.log(`Saved ${output}. Audit: ${report}.\nIntermediate files: ${temp}`);
