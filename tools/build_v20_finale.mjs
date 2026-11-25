import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const file = path => new URL(`../${path}`, import.meta.url);
const json = async name => JSON.parse(await readFile(file(`data/${name}.json`), 'utf8'));
const [audio, previous, song] = await Promise.all([
  json('rhythm_features'), json('v18_shots'), readFile(file('assets/audio/song.m4a')),
]);
assert.equal(createHash('sha256').update(song).digest('hex'), audio.source.sha256);

const fps = audio.frameRate;
const frame = time => Math.round(time * fps);
const fixed = value => Number(value.toFixed(9));
const halfBeats = audio.subdivisions.filter(event => event.division === 2);
const onsets = new Map(audio.onsets.filter(event => event.measured).map(event => [event.time, event]));
const noMusic = time => audio.stops.some(stop => time >= stop.from && time <= stop.to);
const measured = (events, time, distance) => events.find(event => Math.abs(event.time - time) <= distance);

// Rays of the eclipse reach progressively denser districts, then fill the plaza before the last signal.
// f: black-star focus, c: current district, r: reactor. Second letters describe the framing.
// Keep the established core cuts and use the uncovered pulse accents where the framing holds too long.
const phrases = [
  { segment: 24, id: 5, label: 'SWALLOW / RED CLOUD', state: 'VOID', color: '#F24855', level: .64,
    takes: 'fw cp ca ce fa cw ch fw cp fa ce ca fw cp cw fa' },
  { segment: 25, id: 6, label: 'BORROWED HONOUR', state: 'WARNING', color: '#EB654B', level: .69,
    takes: 'cw cp fa ce ca fw ch cp fa cw ce fw cp ch ca fa' },
  { segment: 26, id: 5, label: 'YOUR CLEAR EYES / BLACK STAR', state: 'VOID', color: '#FF5260', level: .75,
    takes: 'ce fw cp fa cw ce fa ch fw cp ce fa cw cp fw fa' },
  { segment: 27, id: 9, label: 'HANDS / IMPOSSIBLE DREAM', state: 'CORRUPTED', color: '#EF4152', level: .83,
    takes: 'ch fw cp ca fs ce ch ra' },
  { segment: 28, id: 8, label: 'CORE / HEAT ABNORMAL', state: 'CRITICAL', color: '#EC3D4C', level: 1,
    keepTiming: true, add: [214.89], takes: 'ra rp rw re rw rp ra rw rp ra' },
  { segment: 29, id: 9, label: 'REALITY / REFUSAL', state: 'CORRUPTED', color: '#F04754', level: 1,
    keepTiming: true, add: [220.44], takes: 'fa ch cw cp fa cp ce fw cp ca ch rp ce fs cp fa ce fw' },
  { segment: 30, id: 6, label: 'BROKEN VOICE / REPRISE', state: 'CRITICAL', color: '#F35F51', level: .96,
    keepTiming: true, add: [220.78, 221.13], takes: 'cw fa cw cp ce ca cp ch fw cp fa ce ch cw cp ce fw ch' },
  { segment: 31, id: 9, label: 'APPROACH II / ECLIPSE', state: 'CORRUPTED', color: '#FF4151', level: .93,
    takes: 'fa fs cp fa ce cw fa cp fs ch fa ce' },
  { segment: 32, id: 5, label: 'ARRIVAL / BLACK STAR', state: 'VOID', color: '#FF3E4D', level: .99,
    takes: 'fw fa cp fs ce fa' },
];

const modes = { a: 'abstract', w: 'world', s: 'wide', p: 'portrait', e: 'eye', h: 'hand' };
const portraits = ['v16Look', 'v16Reach', 'v17Profile', 'v16Shield'];
const sceneStarts = [];
const shots = [];
const sections = [];

function evidence(time) {
  const onset = onsets.get(time);
  assert(onset && !noMusic(time), `No active measured onset near ${time}s`);
  const beat = measured(audio.beats, time, .025);
  const half = beat ? null : measured(halfBeats, time, .026);
  const lowHit = measured(audio.hits, time, .024);
  return {
    time, frame60: frame(time), strength: onset.strength, low: onset.low, high: onset.high,
    kind: beat ? 'tracked-beat-with-onset' : half ? 'half-beat-with-onset' : 'spectral-onset',
    beatTime: beat?.time ?? null, halfBeatTime: half?.time ?? null, lowHitTime: lowHit?.time ?? null,
  };
}

for (const phrase of phrases) {
  const { segment, id, label, state, color, level } = phrase;
  const old = previous.shots.filter(shot => shot.segment === segment);
  const start = old[0].start;
  const end = old.at(-1).end;
  const beatOnsets = audio.beats.filter(beat => beat.frame60 >= frame(start) && beat.frame60 < frame(end))
    .map(beat => beat.nearestOnsetTime);
  const onsetsInPhrase = phrase.keepTiming ? [...old.map(shot => shot.onset.time), ...(phrase.add ?? [])] : beatOnsets;
  const entries = new Map([old[0].onset, ...onsetsInPhrase.map(evidence)]
    .filter(onset => onset.frame60 > frame(start) + 7 || onset.time === old[0].onset.time)
    .map(onset => [onset.frame60, onset]));
  const cuts = [...entries.values()].sort((a, b) => a.frame60 - b.frame60);
  const takes = phrase.takes.split(' ');
  assert.equal(cuts.length, takes.length, `Shot count in segment ${segment}`);
  sceneStarts.push({ segment, start, id, label, state, color, onset: cuts[0] });
  let portrait = segment % portraits.length;

  cuts.forEach((onset, i) => {
    const [subject, framing] = takes[i];
    const start = onset.frame60 / fps;
    const finish = (cuts[i + 1]?.frame60 ?? frame(end)) / fps;
    const mode = modes[framing];
    const starFocus = subject === 'f';
    const visualScene = starFocus ? 5 : subject === 'r' ? 8 : id === 5 ? 9 : id;
    const pose = mode === 'portrait' ? (subject === 'r' ? 'v16Shield' : portraits[portrait++ % portraits.length]) : undefined;
    assert(mode && frame(finish) - frame(start) >= 8, `Invalid shot in segment ${segment} at ${start}s`);
    shots.push({
      id: 4000 + shots.length, scene: id, visualScene, segment, start, end: finish, mode,
      variant: mode === 'portrait' ? 1 : mode === 'eye' || mode === 'hand' ? 2 : 0,
      expression: segment === 24 ? 'sad' : 'fear', intent: label,
      ...(pose ? { pose } : {}), ...(starFocus ? { starFocus: true } : {}),
      timing: 'v20-recorded-onset', duration: fixed(finish - start), musicPacing: 'accent', onset,
      rhythm: { kind: 'climax', level, index: shots.length, from: start, to: finish, cut: 'hard', beatLocked: true },
    });
  });
  sections.push({ segment, start, end, fromShots: old.length, toShots: cuts.length,
    meanHoldSeconds: fixed((end - start) / cuts.length) });
}

const start = shots[0].start;
const end = shots.at(-1).end;
const signal = previous.shots.find(shot => shot.segment === 33);
const starShots = shots.filter(shot => shot.starFocus);
assert.equal(end, signal.start);
assert(shots.every((shot, i) => !i || shot.start === shots[i - 1].end), 'Gap or overlap in the finale');
const longHolds = shots.filter(shot => shot.duration > .5);
assert.equal(longHolds.length, 0, `Finale holds over 500ms: ${longHolds.map(shot => shot.start).join(', ')}`);
assert(shots.every(shot => shot.scene !== 7 && shot.visualScene !== 7));
assert(shots.every(shot => !noMusic(shot.start) && Math.abs(shot.start - shot.onset.time) <= .5 / fps + 1e-12));

const summary = {
  audioSha256: audio.source.sha256, frameRate: fps, visualEditRange: { start, end },
  previousShots: sections.reduce((sum, part) => sum + part.fromShots, 0), newShots: shots.length,
  measuredCuts: shots.length, trackedBeatCuts: shots.filter(shot => shot.onset.beatTime != null).length,
  halfBeatCuts: shots.filter(shot => shot.onset.halfBeatTime != null).length,
  maxHoldSeconds: Math.max(...shots.map(shot => shot.duration)),
  starShots: starShots.length,
  starScreenSeconds: fixed(starShots.reduce((sum, shot) => sum + shot.duration, 0)),
  maxFrameQuantizationErrorMs: fixed(1000 * Math.max(...shots.map(shot => Math.abs(shot.start - shot.onset.time)))),
  signal: { start: signal.start, onset: signal.onset }, sections,
};
await writeFile(file('data/v20_finale_shots.json'), JSON.stringify({ start, end, shots, sceneStarts, summary }, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
