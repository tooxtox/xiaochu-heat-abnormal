// Curate the first act against the selected recording, without moving lyric or scene cues.
// Run from the project with node tools/build_v17_front.mjs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const file = path => new URL(`../${path}`, import.meta.url);
const json = async path => JSON.parse(await readFile(file(path), 'utf8'));
const [{ shots: oldShots }, audio, song] = await Promise.all([
  json('data/shots.json'),
  json('data/rhythm_features.json'),
  readFile(file('assets/audio/song.m4a')),
]);
assert.equal(createHash('sha256').update(song).digest('hex'), audio.source.sha256);

// Each section begins at its established narrative camera boundary. The interior
// targets describe where to search the recording for an accent, not fixed timecodes.
// [target in seconds (null = opening boundary), framing, scene treatment, portrait]
const edit = [
  [2, .28, [[null, 'world'], [4.42, 'portrait', 'console', 'v17Dial'], [6.53, 'wide']]],
  [3, .34, [[null, 'world'], [9.76, 'portrait', 'turn', 'v17Profile'], [11.57, 'eye']]],
  [4, .33, [[null, 'hand', 'reach'], [14.88, 'portrait', 'console', 'v17Dial'], [16.64, 'abstract', 'prism']]],
  [5, .34, [[null, 'portrait', 'turn', 'v17Profile'], [20.51, 'world'], [22.62, 'portrait', 'recoil', 'v17Brace']]],

  // Temperature alarm, then the first deletion loop.
  [6, .49, [[null, 'eye'], [25.13, 'portrait', 'recoil', 'v17Brace'], [26.13, 'abstract', 'prism']]],
  [7, .51, [[null, 'world'], [27.89, 'hand', 'reach'], [28.87, 'portrait', 'turn', 'v16Look']]],
  [8, .59, [[null, 'abstract', 'prism'], [30.44, 'portrait', 'recoil', 'v17Brace'],
    [31.16, 'eye'], [31.89, 'wide'], [32.65, 'portrait', 'console', 'v17Dial'],
    [33.52, 'abstract', 'prism'], [34.23, 'hand', 'reach']]],
  [9, .44, [[null, 'portrait', 'turn', 'v17Profile'], [35.93, 'wide', 'falling'], [36.84, 'eye']]],
  [10, .48, [[null, 'world'], [38.51, 'portrait', 'turn', 'v16Look'], [39.51, 'hand', 'reach']]],
  [11, .60, [[null, 'abstract', 'prism'], [40.96, 'portrait', 'recoil', 'v17Brace'], [41.63, 'eye']]],
  [12, .58, [[null, 'portrait', 'turn', 'v17Profile'], [42.97, 'world'], [43.66, 'hand', 'reach'],
    [44.44, 'portrait', 'recoil', 'v17Brace'], [45.10, 'wide', 'falling'], [45.84, 'eye']]],

  // A geographic wide shot gives the ground and the fall enough screen time.
  [13, .54, [[null, 'world', 'falling'], [47.48, 'portrait', 'recoil', 'v17Brace'], [48.43, 'abstract', 'prism']]],
  [14, .47, [[null, 'hand', 'reach'], [50.25, 'portrait', 'turn', 'v16Look'], [51.23, 'wide']]],
  [15, .58, [[null, 'eye'], [52.81, 'wide'], [53.47, 'portrait', 'console', 'v17Dial']]],
  [16, .55, [[null, 'abstract'], [54.85, 'eye'], [55.46, 'portrait', 'recoil', 'v17Brace'], [56.37, 'hand', 'reach']]],
  [17, .49, [[null, 'world'], [58.13, 'portrait', 'turn', 'v17Profile'], [59.02, 'hand', 'reach']]],
  [18, .53, [[null, 'wide', 'falling'], [60.63, 'portrait', 'recoil', 'v17Brace'], [61.51, 'world']]],

  // Establish the black star wide before matching the orbit to the eye.
  [19, .60, [[null, 'wide'], [63.18, 'portrait', 'turn', 'v17Profile'], [63.93, 'abstract', 'prism']]],
  [20, .56, [[null, 'portrait', 'turn', 'v16Look'], [65.29, 'eye'], [65.91, 'world']]],
  [21, .53, [[null, 'eye'], [67.47, 'portrait', 'turn', 'v17Profile'], [68.42, 'hand', 'reach']]],
  [22, .65, [[null, 'portrait', 'recoil', 'v17Brace'], [69.85, 'world', 'falling'],
    [70.55, 'abstract'], [71.02, 'eye'], [71.48, 'hand', 'reach']]],
  [23, .65, [[null, 'abstract', 'prism'], [72.42, 'portrait', 'turn', 'v16Look'],
    [73.18, 'eye'], [73.76, 'wide', 'falling']]],
  [24, .56, [[null, 'world', 'falling'], [75.20, 'portrait', 'recoil', 'v17Brace'],
    [76.25, 'abstract', 'prism'], [77.27, 'world'], [78.27, 'portrait', 'turn', 'v17Profile'], [79.10, 'hand']]],

  // Reunite the corridor, hand and eye motifs, then leave room for the first memory.
  [25, .52, [[null, 'portrait', 'console', 'v17Dial'], [80.14, 'eye'], [80.89, 'wide'],
    [81.54, 'hand', 'reach'], [82.2, 'portrait', 'turn', 'v17Profile'],
    [82.86, 'world'], [83.5, 'abstract', 'prism'], [84.17, 'eye']]],
  [26, .54, [[null, 'world'], [85.35, 'portrait', 'turn', 'v17Profile'], [86.05, 'eye'], [86.71, 'hand', 'reach']]],
  [27, .39, [[null, 'wide'], [87.98, 'abstract', 'prism'], [88.67, 'portrait', 'turn', 'v16Look'], [89.44, 'eye']]],
];

const fps = 60;
const minHold = 18 / fps;
const baseShotsById = new Map(oldShots.map(shot => {
  const original = shot.baseShot || shot;
  return [original.id, original];
}));
const start = baseShotsById.get(edit[0][0]).start;
const end = baseShotsById.get(edit.at(-1)[0]).end;
const variants = { abstract: 0, eye: 2, hand: 2, portrait: 1, wide: 0, world: 0 };

function candidateFor(event, target) {
  const beat = audio.beats.reduce((nearest, item) =>
    Math.abs(item.time - event.time) < Math.abs(nearest.time - event.time) ? item : nearest);
  const subdivision = audio.subdivisions.find(item =>
    item.part === 2 && Math.abs(item.time - event.time) <= .025);
  const hit = audio.hits.find(item => Math.abs(item.time - event.time) <= .022 && item.strength >= .5);
  const pulse = Math.abs(beat.time - event.time) <= .024;
  return {
    ...event, kind: pulse ? 'tracked-beat-with-onset' : subdivision ? 'half-beat-with-onset' : 'spectral-onset',
    beatTime: pulse ? beat.time : null, halfBeatTime: subdivision?.time ?? null, hitTime: hit?.time ?? null,
    score: event.strength * .32 + (hit ? .22 : 0) + (pulse ? .26 : subdivision ? .16 : 0) - 1.9 * Math.abs(target - event.time),
  };
}

function findAccent(target, from, until) {
  const events = audio.onsets.filter(event => event.measured && event.time >= from && event.time <= until
    && Math.abs(event.time - target) <= .19 && Math.max(event.strength, event.low, event.high) >= .32);
  assert(events.length, `No measured accent at ${target}: ${from} to ${until}`);
  const selected = events.map(event => candidateFor(event, target)).sort((a,b) => b.score - a.score)[0];
  const { score, ...evidence } = selected;
  return evidence;
}

const shots = [];
for (const [baseId, level, rows] of edit) {
  const baseShot = baseShotsById.get(baseId);
  let previous = baseShot.start - minHold;
  const authored = rows.map(([target, mode, frontLook, pose], index) => {
    const until = baseShot.end - (rows.length - index) * minHold - .5 / fps;
    const onset = target == null ? null : findAccent(target, previous + minHold + .5 / fps, until);
    const cut = onset ? onset.frame60 / fps : baseShot.start;
    previous = cut;
    return { cut, mode, frontLook, pose, onset };
  });
  authored.forEach(({ cut, mode, frontLook, pose, onset }, index) => {
    const out = authored[index + 1]?.cut ?? baseShot.end;
    const id = 3000 + shots.length;
    const snap = onset && level >= .46 && (frontLook === 'prism' || frontLook === 'falling') && index % 2 === 1;
    shots.push({
      ...baseShot, id, start: cut, end: out, duration: +(out - cut).toFixed(9), mode, variant: variants[mode],
      ...(frontLook ? { frontLook } : {}), ...(pose ? { pose } : {}),
      timing: onset ? 'v17-measured-onset' : 'retained-lyric-camera-boundary', baseShot,
      ...(onset ? { onset, rhythm: { kind: 'front', level, index, from: start, to: end, cut: snap ? 'snap' : 'hard', beatLocked: true } } : {}),
    });
  });
}

assert.equal(shots[0].start, start);
assert.equal(shots.at(-1).end, end);
assert(shots.every((shot, index) => index === 0 || shot.start === shots[index - 1].end), 'First-act edit has a gap or overlap');
assert(shots.every(shot => shot.end - shot.start >= minHold - 1e-9), 'Hold is shorter than 18 frames');
const cuts = shots.filter(shot => shot.onset);
const before = oldShots.filter(shot => shot.start < end && shot.end > start).length;
const summary = {
  previousShots: before, newShots: shots.length, frameRate: fps,
  measuredNewCuts: cuts.length,
  trackedBeatCuts: cuts.filter(shot => shot.onset.beatTime != null).length,
  halfBeatCuts: cuts.filter(shot => shot.onset.kind === 'half-beat-with-onset').length,
  maxFrameQuantizationErrorMs: +(1000 * Math.max(...cuts.map(shot => Math.abs(shot.start - shot.onset.time)))).toFixed(3),
  audioSha256: audio.source.sha256,
};
await writeFile(file('data/v17_front_shots.json'), JSON.stringify({ start, end, summary, shots }, null, 2) + '\n');
console.log(JSON.stringify({ start, end, ...summary }, null, 2));
