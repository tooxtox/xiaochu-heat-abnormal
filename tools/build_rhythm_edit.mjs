// Rebuild the rapid montage from each stored shot's original semantic parent.
// Usage: node tools/build_rhythm_edit.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { SIGNAL_WINDOWS } from '../src/signal_windows.mjs';

const root = new URL('../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const current = await read('data/shots.json');
const parents = new Map(current.shots.map(s => [(s.baseShot || s).id, s.baseShot || s]));
const baseline = { ...current, shots: [...parents.values()].sort((a, b) => a.start - b.start) };
const features = await read('data/audio_features.json');
assert.equal(baseline.shots.length, 63, 'Rebuild from the 63 original semantic parents.');
const loops = SIGNAL_WINDOWS.filter(w => w.kind === 'medium');
const ranges = [
  ...loops.map(w => ({ from: w.from, to: w.to, kind: 'loop', level: w.from > 200 ? .55 : .50 })),
  { from: 68, to: 90, kind: 'rush', level: .78 },
  { from: 189, to: 199.447875, kind: 'rush', level: .70 },
  { from: 199.447875, to: 225.871875, kind: 'climax', level: 1 },
  { from: 229.768875, to: 231.69, kind: 'climax', level: 1 },
];
const bursts = [[70.60, 72.0], [86.95, 88.60], [214.80, 215.50], [219.20, 220.55], [223, 224.30]];
const activeAt = t => ranges.find(w => t >= w.from && t < w.to);
const inBurst = t => bursts.some(([a, b]) => t >= a && t < b);
const frameTime = t => Math.round(t * 60) / 60;
const strong = new Set(baseline.loopOnsets.map(t => Math.round(t * 1e6)));
const candidates = features.onsetTimes.map(t => ({
  time: frameTime(t), measured: t,
  strong: strong.has(Math.round(t * 1e6)),
  strength: features.onsets[Math.round(t * features.featureRate)] || 0,
}));

function cadence(t, range, sequence) {
  if (inBurst(t)) return .3263;
  if (range.kind === 'loop') return sequence % 4 === 3 ? 1.3052 : .6526;
  if (t < 79.513875) return 1.3052;
  if (t < 90) return .6526;
  if (t < 199.447875) return 2.6104 - 1.3052 * (t - 189) / (199.447875 - 189);
  if (t < 204.731875) return .6526;
  if (t < 209.982875) return 1.3052;
  return .6526;
}

const edited = [], cutSources = [], modeCounts = {}, shortRuns = [];
let nextId = 1000, rapidIndex = 0, consecutiveShort = 0;
for (const parent of baseline.shots) {
  const cuts = [];
  let cursor = parent.start;
  let run = consecutiveShort;
  while (cursor < parent.end - .60) {
    const range = activeAt(cursor + 1e-7) || ranges
      .filter(w => w.from > cursor && w.from < parent.end)
      .sort((a, b) => a.from - b.from)[0];
    if (!range) break;
    const origin = Math.max(cursor, range.from);
    let target = cadence(origin, range, cuts.length);
    // Four brief shots form a burst; a longer hold makes the next acceleration read.
    if (run >= 4) target = 1.3052;
    const approachingBurst = bursts.find(([a]) => a > origin && a < origin + target && a < parent.end - .30);
    if (approachingBurst && run < 4) target = Math.max(.30, approachingBurst[0] - origin);
    const desired = origin + target;
    const allowed = candidates.filter(c => c.time >= cursor + .30 - 1e-8 &&
      c.time <= parent.end - .30 + 1e-8 && c.time > range.from && c.time <= range.to - .30 + 1e-8 &&
      Math.abs(c.time - desired) <= Math.max(.13, target * .28) &&
      (run < 4 || c.time - cursor >= 1));
    if (!allowed.length) break;
    // A salient real onset may win over the nearest weak one, never over the audio.
    allowed.sort((a, b) =>
      (Math.abs(a.time - desired) / target - .25 * Number(a.strong) - .08 * a.strength) -
      (Math.abs(b.time - desired) / target - .25 * Number(b.strong) - .08 * b.strength));
    const chosen = allowed[0];
    const dt = chosen.time - cursor;
    run = dt <= .45 + 1e-8 ? run + 1 : 0;
    cuts.push(chosen);
    cursor = chosen.time;
  }
  if (!cuts.length) {
    edited.push(parent);
    consecutiveShort = 0;
    continue;
  }
  const edges = [parent.start, ...cuts.map(c => c.time), parent.end];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i], end = edges[i + 1], duration = end - start;
    const range = activeAt((start + end) / 2) || ranges
      .filter(w => w.from < end && w.to > start)[0] || activeAt(start - .001);
    assert(range, `Unrelated child at ${start}.`);
    const quietEdge = !activeAt(start + 1e-7) || !activeAt(end - 1e-7);
    const modes = range.kind === 'loop' ? ['abstract', 'portrait', 'eye', 'wide', 'portrait', 'abstract', 'wide', 'eye'] :
      ['world', 'portrait', 'eye', 'abstract', 'hand', 'portrait', 'world', 'abstract', 'eye', 'hand'];
    let mode = quietEdge || (duration >= 1.2 && i % 3 === 0) ? parent.mode : modes[(rapidIndex + parent.id) % modes.length];
    const previous = edited.at(-1)?.mode;
    if (!quietEdge && mode === previous) mode = modes[(modes.indexOf(mode) + 1) % modes.length];
    const rhythm = { kind: range.kind, level: range.level, index: i, cut: rapidIndex % 7 === 4 ? 'snap' : 'hard', from: range.from, to: range.to };
    const shot = {
      ...parent, id: nextId++, start, end, duration: Math.round(duration * 1e9) / 1e9,
      mode, variant: ({ wide: 0, world: 0, portrait: 1, eye: 2, hand: 2, abstract: 0 })[mode],
      timing: 'measured-onset-rhythm-edit', baseShot: structuredClone(parent), rhythm,
    };
    edited.push(shot);
    modeCounts[mode] = (modeCounts[mode] || 0) + 1;
    rapidIndex++;
    if (i > 0) cutSources.push({ time: start, measuredOnset: cuts[i - 1].measured,
      strength: cuts[i - 1].strength, strongLoopOnset: cuts[i - 1].strong, parentId: parent.id });
    consecutiveShort = duration <= .45 + 1e-8 ? consecutiveShort + 1 : 0;
    shortRuns.push(consecutiveShort);
  }
}

// The same script is the retained regression check: source timing, quiet holds and coverage.
assert.equal(edited[0].start, 0);
assert.equal(edited.at(-1).end, baseline.duration);
assert(edited.every((s, i) => !i || s.start === edited[i - 1].end), 'No gaps or overlaps.');
assert(edited.every(s => s.end - s.start >= .30 - 1e-8), 'No accidental tiny tail shot.');
assert.equal(new Set(edited.map(s => s.id)).size, edited.length);
for (const s of edited.filter(s => s.rhythm)) {
  const visible = Math.min(s.end, s.rhythm.to) - Math.max(s.start, s.rhythm.from);
  assert(visible <= 0 || visible >= .30 - 1e-8, 'A profile edge truncated a rapid insert below 0.30 seconds.');
}
for (const parent of baseline.shots) {
  assert(edited.some(s => s.start === parent.start), `Original boundary ${parent.start} was moved.`);
  const children = edited.filter(s => s.baseShot?.id === parent.id);
  if (children.length) {
    children.forEach((s, i) => { assert.deepEqual(s.baseShot, parent); assert.equal(s.rhythm.index, i); assert(s.id >= 1000); });
  } else assert.deepEqual(edited.find(s => s.id === parent.id), parent);
}
for (const cut of cutSources) {
  assert(activeAt(cut.time), 'New cut outside the requested rapid montage.');
  assert(Math.abs(cut.time - cut.measuredOnset) <= 1 / 120 + 1e-9, 'Cut drifted from its measured onset.');
  assert(Math.abs(cut.time * 60 - Math.round(cut.time * 60)) < 1e-7, 'New cut is not on the 60 fps clock.');
}
let quietFrames = 0;
for (let f = 0; f / 60 < baseline.duration; f++) {
  const t = f / 60;
  if (activeAt(t)) continue;
  const old = baseline.shots.find(s => t >= s.start && t < s.end);
  const now = edited.find(s => t >= s.start && t < s.end);
  assert.equal(now.baseShot?.id || now.id, old.id, 'Quiet section crossed a narrative boundary.');
  assert.equal(now.mode, old.mode, `Quiet framing changed at ${t}.`);
  quietFrames++;
}
const rapidPairs = edited.slice(1).map((s, i) => [edited[i], s]).filter(([a, b]) => a.rhythm && b.rhythm);
const changedModeRatio = rapidPairs.filter(([a, b]) => a.mode !== b.mode).length / rapidPairs.length;
assert(changedModeRatio > .80, `Rapid framing only changes on ${changedModeRatio} of cuts.`);
assert(Math.max(...shortRuns) <= 4, 'More than four brief shots in a row.');
for (let i = 2; i < edited.length; i++) {
  const [a, b, c] = edited.slice(i - 2, i + 1);
  if (a.rhythm && b.rhythm && c.rhythm) assert(a.mode !== b.mode || b.mode !== c.mode, 'Three identical rapid modes in a row.');
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
const rangeReport = ranges.map(r => {
  const selected = edited.filter(s => s.start < r.to && s.end > r.from);
  const holds = selected.map(s => Math.min(s.end, r.to) - Math.max(s.start, r.from));
  return { ...r, shots: selected.length, newCuts: cutSources.filter(c => c.time > r.from && c.time < r.to).length,
    meanVisibleHold: mean(holds), minVisibleHold: Math.min(...holds), maxVisibleHold: Math.max(...holds) };
});
const report = {
  passed: true, baselineShotCount: baseline.shots.length, shotCount: edited.length,
  addedOnsetCuts: cutSources.length, fastChildShotCount: edited.filter(s => s.rhythm).length,
  frameRate: 60, minimumShotSeconds: Math.min(...edited.map(s => s.end - s.start)),
  maximumShotSeconds: Math.max(...edited.map(s => s.end - s.start)),
  strongOnsetCuts: cutSources.filter(c => c.strongLoopOnset).length,
  maxMeasuredOnsetErrorSeconds: Math.max(...cutSources.map(c => Math.abs(c.time - c.measuredOnset))),
  changedModeRatio, maxConsecutiveShortShots: Math.max(...shortRuns), quietFramesChecked: quietFrames,
  cutKinds: Object.fromEntries(['hard', 'snap'].map(k => [k, edited.filter(s => s.rhythm?.cut === k).length])),
  ranges: rangeReport, cuts: cutSources,
};
const output = {
  ...baseline,
  method: {
    ...baseline.method,
    selection: 'Original lyric narrative boundaries preserved; rapid montages cut on measured audio onset candidates, with salience preference and short burst / longer hold contrast.',
    baselineShotCount: baseline.shots.length,
    minimumShotSeconds: report.minimumShotSeconds, maximumShotSeconds: report.maximumShotSeconds,
    rhythmEdit: { frameRate: 60, addedOnsetCuts: cutSources.length, source: 'audio_features.onsetTimes',
      strongPreferenceSource: 'original shots.loopOnsets', candidatePeriodSeconds: .6526,
      periodVerified: false, fixedBeatGridUsed: false, rangeCadence: rangeReport },
  },
  summary: {
    shots: edited.length, baselineShots: baseline.shots.length, addedMeasuredOnsetCuts: cutSources.length,
    fastChildShots: report.fastChildShotCount, unchangedOriginalShots: edited.filter(s => !s.rhythm).length,
    originalNarrativeBoundaries: baseline.shots.length,
    modeCounts: Object.fromEntries([...new Set(edited.map(s => s.mode))].map(mode => [mode, edited.filter(s => s.mode === mode).length])),
  },
  shots: edited,
};
await writeFile(new URL('data/shots.json', root), JSON.stringify(output, null, 2) + '\n');
await writeFile(new URL('work/v11-rhythm-edl-report.json', root), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, cuts: undefined }, null, 2));
