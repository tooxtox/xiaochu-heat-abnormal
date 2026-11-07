// Which lyric lines are swallowed by a scene transition?
//
// A lyric on the back plane is drawn into the scene canvas, so it lives inside the
// frame that a transition is still revealing. A line that starts on a cut can spend its
// whole life inside a transition and never be seen. This tool measures, for every line,
// how much of its span falls inside a transition while the line is on the incoming side.
//
// The result feeds the director table: a line that would be swallowed is moved to the
// front plane, which is composited after the transition and is therefore always visible.
//
// node tools/jizura_plane_audit.mjs [--out data/jizura_planes.json]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { projectRoot } from './serve.mjs';
import { transitionAt } from '../src/transitions.mjs';

const root = projectRoot;
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const limit = Number(arg('limit', 0.35));

const readJson = p => JSON.parse(readFileSync(path.resolve(root, p), 'utf8'));
const data = {
  config: readJson('config.json'),
  features: readJson('data/audio_features.json'),
  cues: readJson('data/cues.json'),
  lyrics: readJson('data/lyrics.json'),
  shots: readJson('data/shots.json'),
  lyricDirection: { cues: [] },
  sceneLayers: { cues: [] },
  jizuraDirection: readJson('data/jizura_direction.json'),
};

const out = { version: 'v15', limit, generatedBy: 'tools/jizura_plane_audit.mjs', lines: [] };
const promote = [];
const needsMove = [];
for (const line of data.lyrics.lines) {
  const dir = data.jizuraDirection.lines.find(d => d.id === line.id);
  if (!dir) continue;
  const start = line.time;
  const end = line.end ?? line.time;
  const span = Math.max(1e-6, end - start);
  let hidden = 0;
  const transitions = [];
  const seen = new Set();
  // Sample the line at frame rate; a transition that is already running when the line
  // starts hides the line, because the line then lives in the incoming frame.
  const steps = Math.max(2, Math.ceil(span * 60));
  for (let k = 0; k <= steps; k++) {
    const t = start + span * (k / steps);
    const tr = transitionAt(data, t);
    if (!tr) continue;
    // The line is hidden only while it is on the incoming side of the wipe.
    if (t >= tr.start) {
      hidden += span / steps;
      // Compare rounded starts: the raw float start drifts by a frame between samples,
      // so an exact comparison would append the same transition once per frame.
      const key = `${tr.type}@${tr.start.toFixed(3)}`;
      if (!seen.has(key) && transitions.length < 6) {
        seen.add(key);
        transitions.push({ type: tr.type, start: +tr.start.toFixed(3), duration: +tr.duration.toFixed(3), progress: +tr.progress.toFixed(3) });
      }
    }
  }
  const ratio = hidden / span;
  // The candidate set depends only on the timing and the film's transitions, not on the
  // layer the line currently sits on. That keeps the audit idempotent: promoting a line
  // to the front does not remove it from the candidate list, so the director table stays
  // stable across rebuilds.
  const candidate = ratio >= limit;
  if (candidate) promote.push(line.id);
  if (candidate && dir.layer === 'behind') needsMove.push(line.id);
  out.lines.push({
    id: line.id, time: +start.toFixed(3), dur: +span.toFixed(3),
    layer: dir.layer || 'front', hiddenRatio: +ratio.toFixed(3), candidate, promote: candidate,
    transitions,
  });
}
out.promote = promote;
out.needsMove = needsMove;
const file = path.resolve(root, arg('out', 'data/jizura_planes.json'));
writeFileSync(file, JSON.stringify(out, null, 1), 'utf8');
console.log(`wrote ${file}: ${out.lines.length} lines, ${promote.length} swallowed by a transition, ${needsMove.length} still on the back plane`);
for (const id of needsMove) console.log('  front  ' + id);
