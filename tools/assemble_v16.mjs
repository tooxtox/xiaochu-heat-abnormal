// Reuse the encoded V15 pictures outside V16's two edited windows.
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyJoins } from './check_joins.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const [coldClip, climaxClip, outputArg] = process.argv.slice(2);
if (!coldClip || !climaxClip) {
  throw new Error('Usage: node tools/assemble_v16.mjs COLD.mp4 CLIMAX.mp4 [OUTPUT.mp4]');
}
const output = path.resolve(outputArg || path.join(root, 'export/LAST-SIGNAL-1080p60-v16.mp4'));
try { await stat(output); throw new Error(`Output already exists: ${output}`); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const fsRoot = path.parse(root).root;
if (path.parse(output).root.toLowerCase() !== fsRoot.toLowerCase()) {
  throw new Error('Choose an output on the same drive as the project so the validated file can be renamed into place.');
}
const base = path.join(root, 'export/LAST-SIGNAL-1080p60-v15.mp4');
const sourceAudio = path.join(root, 'assets/audio/song.m4a');
const boundaries = [0, 7844, 10330, 11772, 13668, 14553];
const lengthOf = index => boundaries[index + 1] - boundaries[index];
const seconds = frame => (frame / 60).toFixed(9);

function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable}: ${result.stderr.slice(-3000)}`);
  if (result.stderr.trim()) console.error(result.stderr.trim());
  return result.stdout;
}
function videoPackets(file, frameCount) {
  const result = JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_packets', '-show_streams', '-show_data_hash', 'sha256', '-show_entries', 'stream=codec_name,width,height,pix_fmt,time_base,start_pts,duration_ts,avg_frame_rate:packet=pts,duration,flags,data_hash', '-of', 'json', file]));
  const video = result.streams[0], packets = result.packets;
  if (!video || video.codec_name !== 'h264' || video.width !== 1920 || video.height !== 1080 || video.pix_fmt !== 'yuv420p' || video.time_base !== '1/15360' || video.avg_frame_rate !== '60/1' || video.start_pts !== 0 || video.duration_ts !== frameCount * 256 || packets.length !== frameCount) {
    throw new Error(`${file}: expected ${frameCount} frames of H.264 1920×1080 at 60 fps, starting at 0. Found ${JSON.stringify(video)}, ${packets?.length} packets.`);
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

const work = path.join(root, 'work/v16');
await mkdir(work, { recursive: true });
await mkdir(path.dirname(output), { recursive: true });
const temp = await mkdtemp(path.join(work, 'splice-'));
const basePackets = videoPackets(base, boundaries.at(-1));
const edits = new Map([[1, videoPackets(coldClip, lengthOf(1))], [3, videoPackets(climaxClip, lengthOf(3))]]);
const baseParts = path.join(temp, 'base-%d.mp4');
const ffmpeg = ['-hide_banner', '-nostdin', '-n', '-v', 'warning'];
command('ffmpeg', [...ffmpeg, '-i', base, '-map', '0:v:0', '-c:v', 'copy', '-avoid_negative_ts', 'disabled', '-f', 'segment',
  '-segment_format_options', 'avoid_negative_ts=disabled', '-segment_times', boundaries.slice(1, -1).map(seconds).join(','),
  '-segment_time_delta', '0.0001', '-reset_timestamps', '1', baseParts]);

const names = ['base-0.mp4', 'cold.mp4', 'base-2.mp4', 'climax.mp4', 'base-4.mp4'];
const parts = names.map(name => path.join(temp, name));
await copyFile(coldClip, parts[1]);
await copyFile(climaxClip, parts[3]);
const list = path.join(temp, 'list.ffconcat');
// Explicit duration prevents the MP4 container's millisecond rounding from accumulating across joins.
await writeFile(list, `ffconcat version 1.0\n${names.map((name, i) => `file '${name}'\nduration ${seconds(lengthOf(i))}\n`).join('')}`);
const joined = path.join(temp, 'joined.mp4');
command('ffmpeg', [...ffmpeg, '-f', 'concat', '-safe', '0', '-i', list, '-i', sourceAudio, '-map', '0:v:0', '-map', '1:a:0', '-c', 'copy',
  '-video_track_timescale', '15360', '-avoid_negative_ts', 'disabled', '-movflags', '+faststart', joined]);
const finalPackets = videoPackets(joined, boundaries.at(-1));
const partsReport = names.map((name, part) => {
  const from = boundaries[part], to = boundaries[part + 1];
  const expected = edits.get(part) || basePackets.slice(from, to);
  let changedKeyframes = 0;
  for (const [offset, packet] of expected.entries()) {
    const actual = finalPackets[from + offset];
    if (actual.data_hash === packet.data_hash) continue;
    // The concat demuxer can repeat H.264 parameter sets on keyframes when changing encoders.
    if (!edits.has(part) || !actual.flags.includes('K') || !packet.flags.includes('K')) {
      throw new Error(`${name}: video packet at frame ${from + offset} differs from its source`);
    }
    changedKeyframes++;
  }
  return { name, version: edits.has(part) ? 16 : 15, fromFrame: from, untilFrame: to, frames: to - from, changedKeyframes };
});
const expectedAudio = audioHash(sourceAudio), finalAudio = audioHash(joined);
if (expectedAudio !== finalAudio || audioTiming(sourceAudio) !== audioTiming(joined)) {
  throw new Error('AAC packet data or timing differs from source audio.');
}
console.log('Video packet timestamps, V15 picture packets and original AAC packets verified. Checking decoded pictures at joins…');
const joins = verifyJoins(joined, parts);
if (!joins.passed) throw new Error(`A decoded picture changed at a join: ${JSON.stringify(joins.joins)}`);
await rename(joined, output);
const report = output.replace(/\.mp4$/i, '.splice.qa.json');
await writeFile(report, JSON.stringify({ output: path.basename(output), fps: 60, frames: finalPackets.length,
  verifiedFrameTimestamps: true, parts: partsReport, sourceAudioPackets: { passed: true, sha256: finalAudio, timestampsUnchanged: true }, joins }, null, 2));
console.log(`Saved ${output}. Audit: ${report}.\nIntermediate files: ${temp}`);
