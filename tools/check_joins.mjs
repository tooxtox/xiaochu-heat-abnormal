// Compare decoded YUV pictures at copied chunk joins, before temporary parts are removed.
import { spawnSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function command(executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable}: ${result.stderr.slice(-3000)}`);
  return result.stdout;
}
function frames(file) {
  const metadata = JSON.parse(command('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=nb_frames', '-of', 'json', file]));
  const count = Number(metadata.streams[0]?.nb_frames);
  if (!Number.isInteger(count) || count < 1) throw new Error(`Frame count unavailable: ${file}`);
  return count;
}
function decodedHashes(file, requested) {
  const selected = [...new Set(requested)].sort((a, b) => a - b);
  const filter = `select=${selected.map(frame => `eq(n\\,${frame})`).join('+')}`;
  const output = command('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-map', '0:v:0', '-an', '-vf', filter, '-frames:v', String(selected.length), '-fps_mode', 'passthrough', '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-']);
  const hashes = output.split(/\r?\n/).filter(line => line && !line.startsWith('#')).map(line => line.split(',').at(-1).trim());
  if (hashes.length !== selected.length) throw new Error(`Decoded ${hashes.length}/${selected.length} requested frames in ${file}`);
  return Object.fromEntries(selected.map((frame, index) => [frame, hashes[index]]));
}

export function verifyJoins(movie, parts) {
  if (parts.length < 2) return { passed: true, joins: [], scope: 'Single video part; no joins to check.' };
  const counts = parts.map(frames), count = frames(movie), expected = counts.reduce((sum, n) => sum + n, 0);
  if (count !== expected) throw new Error(`Final has ${count} frames; parts contain ${expected}.`);
  const boundaries = []; let offset = 0;
  for (let index = 0; index < counts.length - 1; index++) { offset += counts[index]; boundaries.push(offset); }
  const actual = decodedHashes(movie, boundaries.flatMap(frame => [frame - 1, frame]));
  const edges = parts.map((part, index) => decodedHashes(part, index === 0 ? [counts[index] - 1] : index === parts.length - 1 ? [0] : [0, counts[index] - 1]));
  const joins = boundaries.map((frame, index) => {
    const previous = { frame: frame - 1, expected: edges[index][counts[index] - 1], actual: actual[frame - 1] };
    const next = { frame, expected: edges[index + 1][0], actual: actual[frame] };
    return { frame, passed: previous.expected === previous.actual && next.expected === next.actual, previous, next };
  });
  return { schemaVersion: 1, movie: path.basename(movie), passed: joins.every(join => join.passed), totalFrames: count,
    partFrames: counts, joins, method: 'Exact MD5 equality of decoded yuv420p pictures at each copied part last/first frame and corresponding final frame indices.',
    scope: 'Verifies copy-concatenation preserves chunk edge pictures and total frame count. Does not validate lyric or scene-event alignment.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const movie = process.argv[2], parts = []; let output;
  for (let index = 3; index < process.argv.length; index++) {
    if (process.argv[index] === '--part') parts.push(process.argv[++index]);
    else if (process.argv[index] === '--output') output = process.argv[++index];
    else throw new Error(`Unknown option: ${process.argv[index]}`);
  }
  if (!movie || parts.length < 2) throw new Error('node tools/check_joins.mjs MOVIE --part PART1 --part PART2 [--part PART3] [--output REPORT.json]');
  const report = verifyJoins(path.resolve(movie), parts.map(part => path.resolve(part)));
  if (output) { await mkdir(path.dirname(path.resolve(output)), { recursive: true }); await writeFile(output, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify(report));
  process.exitCode = report.passed ? 0 : 1;
}
