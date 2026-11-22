// Author picture cuts against measured transients of the selected AAC.
// Run with node tools/build_v16_climax.mjs. No V15 inputs are rewritten.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const file = path => new URL(`../${path}`, import.meta.url);
const json = async path => JSON.parse(await readFile(file(path), 'utf8'));
const [{ shots: oldShots }, { scenes }, audio, encodedAudio] = await Promise.all([
  json('data/shots.json'),
  json('data/cues.json'),
  json('data/rhythm_features.json'),
  readFile(file('assets/audio/song.m4a')),
]);
assert.equal(createHash('sha256').update(encodedAudio).digest('hex'), audio.source.sha256);

// [measured onset time, framing, optional character pose]. Full beats carry
// the main cuts; intermediate cuts need a measured spectral transient
// close to the tracked half-pulse.
const montage = [
  // Borrowed honour. Open wide, then drive the pace through foreground details.
  { parent: 52, level: .78, rows: [
    [199.47, 'world'],
    [200.12, 'portrait', 'v16Look'],
    [200.46, 'hand'],
    [200.80, 'world'],
    [201.44, 'portrait'],
    [201.78, 'eye'],
    [202.09, 'abstract'],
    [202.43, 'world'],
    [203.09, 'portrait', 'v16Look'],
    [203.25, 'eye'],
    [203.42, 'hand'],
    [204.07, 'abstract'],
    [204.40, 'eye'],
  ] },
  // Clear eyes. Keep the double-pulse cadence so the softer passage can breathe.
  { parent: 53, level: .34, rows: [
    [204.73, 'portrait', 'v16Look'],
    [205.38, 'world'],
    [206.03, 'eye'],
    [206.69, 'portrait', 'v16Reach'],
    [207.35, 'world'],
    [208.00, 'portrait', 'v16Look'],
    [208.66, 'wide'],
    [209.31, 'eye'],
  ] },
  { parent: 54, level: .45, rows: [
    [209.97, 'hand'],
    [210.29, 'portrait', 'v16Reach'],
    [210.95, 'eye'],
    [211.29, 'wide'],
    [211.62, 'portrait', 'v16Reach'],
    [211.94, 'hand'],
    [212.27, 'portrait', 'v16Look'],
  ] },
  // Heat abnormality. Insert two short accents, then hold the shield pose.
  { parent: 55, level: 1, rows: [
    [212.59, 'abstract'],
    [212.92, 'portrait', 'v16Shield'],
    [213.25, 'hand'],
    [213.41, 'eye'],
    [213.58, 'world'],
    [213.91, 'portrait', 'v16Shield'],
    [214.06, 'abstract'],
    [214.23, 'world'],
    [214.56, 'portrait', 'v16Shield'],
  ] },
  // Refusal. Short inserts ride the stronger subdivisions of repeated lines.
  { parent: 56, level: 1, rows: [
    [215.21, 'abstract'],
    [215.55, 'hand'],
    [215.88, 'world'],
    [216.21, 'portrait', 'v16Look'],
    [216.53, 'abstract'],
    [216.86, 'portrait', 'v16Shield'],
    [217.03, 'eye'],
    [217.17, 'world'],
    [217.51, 'portrait', 'v16Reach'],
    [217.85, 'abstract'],
    [218.17, 'hand'],
    [218.49, 'portrait', 'v16Shield'],
    [218.83, 'eye'],
    [219.15, 'world'],
    [219.48, 'portrait', 'v16Look'],
    [219.81, 'abstract'],
    [220.14, 'eye'],
  ] },
  // The final thump of the reprise breaks back into the city.
  { parent: 57, level: .88, rows: [
    [220.61, 'world'],
    [221.44, 'portrait', 'v16Shield'],
    [221.78, 'eye'],
    [222.11, 'abstract'],
    [222.44, 'portrait', 'v16Look'],
    [222.76, 'hand'],
  ] },
  { parent: 58, level: .94, rows: [
    [223.08, 'world'],
    [223.41, 'portrait', 'v16Reach'],
    [223.74, 'abstract'],
    [223.90, 'eye'],
    [224.07, 'hand'],
    [224.41, 'world'],
    [224.73, 'portrait', 'v16Shield'],
    [225.05, 'eye'],
    [225.38, 'portrait', 'v16Look'],
    [225.71, 'hand'],
  ] },
  { parent: 59, level: .55, rows: [[225.85, 'abstract']] },
];

const fps = 60;
const round = (n, places = 6) => +n.toFixed(places);
const onsetByCentisecond = new Map(audio.onsets.map(onset => [Math.round(onset.time * 100), onset]));
function evidence(time) {
  const event = onsetByCentisecond.get(Math.round(time * 100));
  assert(event?.measured && event.time === time, `Missing measured onset at ${time}`);
  const frame = Math.round(time * fps);
  const nearestBeat = audio.beats.reduce((nearest, beat) =>
    Math.abs(beat.time - time) < Math.abs(nearest.time - time) ? beat : nearest);
  const index = audio.beats.findIndex(beat => beat.time > time);
  const before = audio.beats[index - 1], after = audio.beats[index];
  const phase = (time - before.time) / (after.time - before.time);
  const midpointError = Math.abs(time - (before.time + after.time) / 2);
  const beatDistance = Math.abs(time - nearestBeat.time);
  const pulse = beatDistance <= .023;
  assert(pulse || midpointError <= .029, `Onset ${time} is outside the tracked pulse or subdivision`);
  const hit = audio.hits.find(hit => Math.abs(hit.time - time) <= .023 && hit.strength >= .45);
  assert(hit || Math.max(event.low, event.high, event.strength) >= .35, `Weak cut evidence at ${time}`);
  return {
    time, frame,
    kind: pulse ? 'tracked-pulse-with-measured-onset' : 'half-pulse-with-measured-onset',
    strength: event.strength, low: event.low, high: event.high,
    beatId: nearestBeat.id, beatTime: nearestBeat.time,
    phaseErrorSeconds: round(pulse ? beatDistance : midpointError),
    phase: round(phase), lowHitTime: hit?.time ?? null,
  };
}

const parents = new Map(oldShots.map(shot => {
  const baseShot = shot.baseShot || shot;
  return [baseShot.id, baseShot];
}));
const authored = montage.flatMap(({ parent, rows, level }) =>
  rows.map(([time, mode, pose]) => ({ mode, pose, level, onset: evidence(time), baseShot: parents.get(parent) })));
const terminalOnset = evidence(226.04);
const start = authored[0].onset.frame / fps;
const end = terminalOnset.frame / fps;
const modeVariants = { world: 0, portrait: 1, hand: 2, eye: 2, wide: 0, abstract: 0 };
const shots = authored.map(({ mode, pose, level, onset, baseShot }, index) => {
  const startTime = onset.frame / fps;
  const endTime = (authored[index + 1]?.onset.frame ?? terminalOnset.frame) / fps;
  return {
    ...baseShot, id: 2100 + index, start: startTime, end: endTime,
    duration: round(endTime - startTime, 9), mode, variant: modeVariants[mode],
    ...(pose ? { pose } : {}),
    timing: 'v16-percussion-locked', baseShot, onset,
    rhythm: { kind: 'climax', cut: 'hard', level, index, from: start, to: end, beatLocked: true },
  };
});

const sceneStarts = [];
for (const shot of shots) {
  if (sceneStarts.at(-1)?.segment === shot.segment) continue;
  const cue = scenes.find(cue => cue.segment === shot.segment);
  assert.equal(cue.id, shot.scene);
  assert(Math.abs(shot.start - cue.start) < .045, `Scene ${cue.segment} would move more than 45 ms`);
  sceneStarts.push({ segment: cue.segment, originalStart: cue.start, start: shot.start });
}
const holds = shots.map(shot => Math.round(shot.duration * fps));
const oldCount = oldShots.filter(shot => shot.start < end && shot.end > start).length;
const cutErrors = [...shots.map(shot => shot.onset), terminalOnset].map(onset =>
  Math.abs(onset.time - onset.frame / fps));
assert.equal(shots[0].start, start);
assert.equal(shots.at(-1).end, end);
assert(shots.every((shot, i) => !i || shot.start === shots[i - 1].end));
assert(shots.every((shot, i) => !i || shot.mode !== shots[i - 1].mode), 'Consecutive cuts should change the framing');
assert(holds.every(frames => frames >= 8 && frames <= 50), 'Keep every hold between 8 and 50 frames');
assert(Math.max(...cutErrors) <= .5 / fps + 1e-12);
assert(shots.length >= oldCount * 1.55, 'Climax must increase cut density by at least 55%');
const summary = {
  oldCount, newCount: shots.length, frameRate: fps,
  measuredPulseCuts: shots.filter(shot => shot.onset.kind.startsWith('tracked')).length,
  measuredHalfPulseCuts: shots.filter(shot => shot.onset.kind.startsWith('half')).length,
  lowHitConfirmedCuts: shots.filter(shot => shot.onset.lowHitTime != null).length,
  maxFrameQuantizationErrorMs: round(Math.max(...cutErrors) * 1000, 3),
  meanHoldFrames: round(holds.reduce((sum, frames) => sum + frames, 0) / holds.length, 2),
  shortestHoldFrames: Math.min(...holds), longestHoldFrames: Math.max(...holds),
  audioSha256: audio.source.sha256,
};

const output = { start, end, sceneStarts, terminalOnset, summary, shots };
await writeFile(file('data/v16_climax_shots.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ start, end, ...summary }, null, 2));
