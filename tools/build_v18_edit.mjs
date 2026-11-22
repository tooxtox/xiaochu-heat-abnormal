// Re-cut the V17 picture against the selected AAC's measured percussion and spectral evidence.
// JIZURA reading cameras and lyric times continue to use the untouched V17 timeline.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { applyV16Edit } from '../src/v16_edit.mjs';
import { applyV17Edit } from '../src/v17_edit.mjs';

const file = name => new URL(`../${name}`, import.meta.url);
const json = async name => JSON.parse(await readFile(file(`data/${name}.json`), 'utf8'));
const [audio, base, cues, cold, climax, front, source] = await Promise.all([
  json('rhythm_features'), json('shots'), json('cues'), json('v16_cold_shots'),
  json('v16_climax_shots'), json('v17_front_shots'), readFile(file('assets/audio/song.m4a')),
]);
assert.equal(createHash('sha256').update(source).digest('hex'), audio.source.sha256);

const film = { shots: base, cues, config: { duration: cues.duration, images: {} } };
applyV16Edit(film, cold, climax);
applyV17Edit(film, front);
const v17 = film.shots.shots;
const shotsById = new Map(v17.map(shot => [shot.id, shot]));
const fps = 60;
const round = (value, digits = 6) => +value.toFixed(digits);

// Each row is [scene segment, pace, measured entry transient, retained picture takes].
// A take may name a new accent target; all other takes search near their V17 cut.
// Sustained musical phrases deliberately skip pulses, and all six detected rests hold their picture.
const phrases = [
  [1, 'held', null, [1]],
  [2, 'held', 2.75, [3000, 3001, 3004, 3006, 3008, 3011]],
  [3, 'flow', 24.39, [3012, 3013, 3015, 3017]],
  [4, 'accent', 29.64, [3018, 3019, 3020, 3022, 3023, 3024]],
  [5, 'flow', 34.89, [3025, 3026, 3027, 3029, 3030]],
  [6, 'accent', 40.31, [3031, 3032, 3034, 3035, 3036, 3037, 3038]],
  [7, 'accent', 46.68, [3040, 3041, 3042, 3043, 3044]],
  [8, 'accent', 52.26, [3046, 3047, 3048, 3049, 3051, 3052]],
  [9, 'flow', 57.19, [3053, 3054, 3055, 3056, 3057, 3058]],
  [10, 'flow', 62.43, [3059, 3060, 3061, 3062, 3063, 3064, 3066]],
  [11, 'accent', 68.97, [3068, 3069, 3070, 3071, 3073, 3074, 3075, 3076]],
  [12, 'flow', 74.23, [3077, 3078, 3079, 3080, 3081]],
  [13, 'flow', 79.46, [3083, 3084, 3086, 3087, 3089]],
  [14, 'flow', 84.72, [3091, 3092, 3093, 3096, 3098]],

  [15, 'held', 90.31, [28, [29, 97.52], [31, 105.38]]],
  [16, 'flow', 112.91, [32]],
  [17, 'flow', 115.55, [33]],
  [18, 'accent', 118.16, [1053, 1055, 1056, 1057]],
  [19, 'flow', 123.41, [36, 37]],
  [20, 'accent', 128.66, [1058, 1059, 1060, 1062, 1063, 40]],
  [21, 'held', 134.65, [2000, [2001, 137.84], [2003, 139.97], [2004, 143.09],
    2006, 2007, 2009, 2010, 2011, 2012, [2015, 164.07]]],
  [22, 'held', 168.01, [46, [48, 175.23], [49, 183.10]]],
  [23, 'flow', 188.98, [1064, 1065]],
  [24, 'held', 194.23, [1067, [1068, 196.86]]],
  [25, 'accent', 199.47, [2100, 2101, 2103, 2104, 2106, 2107, 2108, 2110, 2111]],
  [26, 'held', 204.73, [2113, 2116, 2119]],
  [27, 'held', 209.97, [2121, [2125, 211.29]]],
  [28, 'accent', 212.59, null],
  [29, 'accent', 215.21, null],
  [30, 'accent', 220.61, null],
  [31, 'accent', 225.85, [2170, 1113, 1114, 1115, 1116, 1118]],
  [32, 'flow', 229.64, [1119, 1120]],
  [33, 'held', 231.60, [62]],
  [34, 'held', 238.16, [63]],
];

const actualOnsets = new Map(audio.onsets.filter(onset => onset.measured).map(onset => [onset.time, onset]));
const near = (items, time) => items.reduce((best, item) =>
  best === null || Math.abs(item.time - time) < Math.abs(best.time - time) ? item : best, null);

function evidence(time) {
  const onset = actualOnsets.get(time);
  assert(onset, `No measured onset at ${time}s`);
  const beat = near(audio.beats, time);
  const half = near(audio.subdivisions.filter(item => item.part === 2), time);
  const hit = near(audio.hits, time);
  const pulseError = Math.abs(beat.time - time);
  const halfError = Math.abs(half.time - time);
  return {
    time, frame60: Math.round(time * fps), strength: onset.strength, low: onset.low, high: onset.high,
    kind: pulseError <= .025 ? 'tracked-beat-with-onset' :
      halfError <= .026 ? 'half-beat-with-onset' : 'spectral-onset',
    beatTime: pulseError <= .025 ? beat.time : null,
    halfBeatTime: halfError <= .026 ? half.time : null,
    lowHitTime: Math.abs(hit.time - time) <= .024 ? hit.time : null,
  };
}

const evidenceByTime = new Map([...actualOnsets.keys()].map(time => [time, evidence(time)]));
const inRest = time => audio.stops.some(stop => time >= stop.from && time <= stop.to);
function selectAccent(shot, target, from, until, pacing) {
  const authored = shot.onset?.time;
  const usable = event => event.time >= from && event.time <= until && !inRest(event.time);
  const verified = evidenceByTime.get(authored);
  if (target == null && verified && usable(verified)) return verified;
  const planned = target == null ? null : evidenceByTime.get(target);
  if (planned && usable(planned)) return planned;

  const wish = target ?? shot.start;
  const candidates = [...evidenceByTime.values()].filter(event =>
    usable(event) && Math.abs(event.time - wish) <= .29 &&
    (event.kind !== 'spectral-onset' || Math.max(event.strength, event.low, event.high) >= .38));
  const score = event =>
    (event.beatTime != null ? .46 : event.halfBeatTime != null && pacing === 'accent' ? .28 : .02) +
    .21 * event.strength + .21 * event.low + (event.lowHitTime == null ? 0 : .17) -
    Math.abs(event.time - wish) * 2.1;
  assert(candidates.length, `No BGM accent for shot ${shot.id} near ${wish}s`);
  return candidates.sort((a, b) => score(b) - score(a))[0];
}

const sceneStarts = [];
const shots = [];
const sectionReport = [];
for (let i = 0; i < phrases.length; i++) {
  const [segment, pacing, entry, edit] = phrases[i];
  const originalScene = film.cues.scenes[i];
  assert.equal(segment, originalScene.segment);
  const old = v17.filter(shot => shot.segment === segment && shot.start >= originalScene.start - .000001);
  const takes = (edit ?? old.map(shot => shot.id)).map(take => {
    const [id, target] = Array.isArray(take) ? take : [take, null];
    const shot = shotsById.get(id);
    assert(shot?.segment === segment, `Shot ${id} does not belong to segment ${segment}`);
    return {shot, target};
  });
  const entryEvidence = entry == null ? null : evidenceByTime.get(entry);
  const start = entryEvidence ? entryEvidence.frame60 / fps : 0;
  const nextEntry = phrases[i + 1]?.[2];
  const end = nextEntry == null ? cues.duration : evidenceByTime.get(nextEntry).frame60 / fps;
  const minFrames = pacing === 'held' ? (segment === 27 ? 54 : 78) : pacing === 'flow' ? 19 : 8;
  assert(start < end && !inRest(start), `Visual scene starts inside a rest: ${segment} at ${start}`);
  if (start !== originalScene.start) sceneStarts.push({ segment, start, originalStart: originalScene.start, onset: entryEvidence });

  const cuts = [start], findings = [entryEvidence];
  for (let j = 1; j < takes.length; j++) {
    const {shot, target} = takes[j];
    const accent = selectAccent(shot, target, cuts.at(-1) + (minFrames - .49) / fps,
      end - ((takes.length - j) * minFrames - .49) / fps, pacing);
    cuts.push(accent.frame60 / fps);
    findings.push(accent);
  }

  takes.forEach(({shot}, j) => {
    const start = cuts[j], end = cuts[j + 1] ?? (nextEntry == null ? cues.duration : evidenceByTime.get(nextEntry).frame60 / fps);
    const onset = findings[j];
    const { rhythm, onset: previousOnset, baseShot, ...look } = shot;
    const measured = pacing === 'accent' && onset;
    shots.push({
      ...look, start, end, duration: round(end - start, 9), musicPacing: pacing,
      timing: onset ? 'v18-recorded-onset' : 'v18-held-opening-before-music',
      ...(baseShot && pacing !== 'held' ? { baseShot } : {}),
      ...(onset ? { onset } : {}),
      ...(measured ? {
        rhythm: {
          kind: rhythm?.kind ?? (segment >= 25 ? 'climax' : 'front'),
          level: rhythm?.level ?? .58, index: rhythm?.index ?? j,
          from: start, to: end, cut: rhythm?.cut === 'snap' ? 'snap' : 'hard', beatLocked: true,
        },
      } : {}),
    });
  });
  sectionReport.push({
    segment, start, end, pacing, fromShots: old.length, toShots: takes.length,
    meanHoldSeconds: round((end - start) / takes.length, 3),
  });
}

assert.equal(shots[0].start, 0);
assert.equal(shots.at(-1).end, cues.duration);
assert.equal(new Set(shots.map(shot => shot.id)).size, shots.length);
assert(shots.every((shot, i) => !i || shot.start === shots[i - 1].end), 'Gap or overlap');
const measuredCuts = shots.slice(1);
assert(measuredCuts.every(shot => shot.onset && Math.abs(shot.start - shot.onset.time) <= 0.5 / fps + 1e-12));
assert(measuredCuts.every(shot => !inRest(shot.start)), 'A visual cut interrupts a measured rest');

const summary = {
  audioSha256: audio.source.sha256,
  frameRate: fps, visualEditRange: { start: 0, end: cues.duration },
  previousShots: v17.length, newShots: shots.length, measuredCuts: measuredCuts.length,
  trackedBeatCuts: measuredCuts.filter(shot => shot.onset.beatTime != null).length,
  halfBeatCuts: measuredCuts.filter(shot => shot.onset.kind === 'half-beat-with-onset').length,
  strongLowHitCuts: measuredCuts.filter(shot => shot.onset.lowHitTime != null).length,
  measuredRestsHeld: audio.stops.length,
  maxFrameQuantizationErrorMs: round(1000 * Math.max(...measuredCuts.map(shot => Math.abs(shot.start - shot.onset.time))), 3),
  sections: sectionReport,
};
await writeFile(file('data/v18_shots.json'), JSON.stringify({ shots, sceneStarts, summary }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
