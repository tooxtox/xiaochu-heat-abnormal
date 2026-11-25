import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const file = path => new URL(`../${path}`, import.meta.url);
const json = async path => JSON.parse(await readFile(file(path), 'utf8'));
const [audio, finale, song] = await Promise.all([
  json('data/rhythm_features.json'), json('data/v20_finale_shots.json'),
  readFile(file('assets/audio/song.m4a')),
]);
const audioSha256 = createHash('sha256').update(song).digest('hex');
assert.equal(audioSha256, audio.source.sha256);
assert.equal(audioSha256, finale.summary.audioSha256);

const frameRate = audio.frameRate;
const fromFrame = frame => frame / frameRate;
const toFrame = time => Math.round(time * frameRate);
const byOnset = new Map(audio.onsets.filter(onset => onset.measured).map(onset => [onset.time, onset]));
const stopped = time => audio.stops.some(stop => time >= stop.from && time <= stop.to);
const within = (window, time) => time >= window.from && time < window.to && !stopped(time);
const score = onset => .62 * onset.strength + .29 * onset.low + .09 * onset.high;
const sortedByImpact = list => [...list].sort((a, b) => score(b) - score(a) || a.time - b.time);
const quantile = (sorted, q) => score(sorted[Math.floor((sorted.length - 1) * q)]);

// The six broad passages share a ~330 ms percussion pulse. Levels reflect arrangement
// density and section role rather than treating every quiet instance of the pulse alike.
const settings = [
  ['alarm', .83], ['burning-city', .88], ['first-impact', .93],
  ['second-rush', .85], ['final-rise', .94], ['collapse', 1],
];
const windows = audio.percussionEvidence.map((scope, i) => ({
  id: settings[i][0], from: scope.from, to: scope.to, level: settings[i][1],
}));
windows.at(-1).to = finale.end;
// The signal study acquires another full percussion layer after the measured 145.63
// energy rise. It drops out at 166.36; leave the adjacent isolated telemetry quiet.
windows.splice(4, 0, { id: 'server-pulse', from: 145.70, to: 166.62, level: .43 });
assert(windows.every((w, i) => w.from < w.to && (!i || windows[i - 1].to <= w.from)));

function spacedPeaks(sorted, scoreFloor, spacing, first) {
  const peaks = first ? [first] : [];
  for (const onset of sorted) {
    if (score(onset) < scoreFloor) break;
    if (peaks.every(peak => Math.abs(onset.time - peak.time) >= spacing)) peaks.push(onset);
  }
  return peaks;
}

const halfOnsets = new Set(finale.shots.filter(shot => shot.onset.halfBeatTime != null)
  .map(shot => shot.onset.time));
const halfGrid = audio.subdivisions.filter(subdivision => subdivision.division === 2);
const pulses = [];
const stats = [];
for (const window of windows) {
  const measured = onset => onset && within(window, onset.time) && within(window, fromFrame(onset.frame60));
  const primary = audio.beats.filter(beat => beat.onsetDistance <= .025)
    .map(beat => byOnset.get(beat.nearestOnsetTime)).filter(measured);
  assert(primary.length > 45, `Insufficient tracked pulse evidence in ${window.id}`);
  const ranked = sortedByImpact(primary);
  const accentFloor = quantile(ranked, .43);
  const peaks = spacedPeaks(ranked, quantile(ranked, .22), .59, primary[0]);
  const peakFrames = new Set(peaks.map(onset => onset.frame60));
  const output = new Map();

  for (const onset of primary) {
    const { frame60: frame, strength } = onset;
    const tier = peakFrames.has(frame) ? 3 : score(onset) >= accentFloor ? 2 : 1;
    output.set(frame, { time: fromFrame(frame), frame, strength, tier, kind: 'beat', onsetTime: onset.time });
  }

  const keepHalf = onset => halfOnsets.has(onset.time) ||
    (window.level > .8 && onset.strength >= .69 && score(onset) >= accentFloor &&
      (onset.low >= .59 || onset.high >= .73));
  for (const grid of halfGrid) {
    if (!within(window, grid.time)) continue;
    const onset = audio.onsets.filter(onset => Math.abs(onset.time - grid.time) <= .026 && measured(onset) &&
      keepHalf(onset)).sort((a, b) => Number(halfOnsets.has(b.time)) - Number(halfOnsets.has(a.time)) ||
      Math.abs(a.time - grid.time) - Math.abs(b.time - grid.time))[0];
    if (!onset || primary.some(beat => Math.abs(beat.frame60 - onset.frame60) < 7)) continue;
    const { frame60: frame, strength } = onset;
    output.set(frame, { time: fromFrame(frame), frame, strength,
      tier: score(onset) >= accentFloor ? 2 : 1, kind: 'half', onsetTime: onset.time });
  }
  const entries = [...output.values()];
  pulses.push(...entries);
  stats.push({ id: window.id, beats: primary.length, halfBeats: entries.length - primary.length,
    peaks: peaks.length });
}

pulses.sort((a, b) => a.frame - b.frame);
assert(pulses.every((pulse, i) => pulse.frame === toFrame(pulse.onsetTime) &&
  byOnset.has(pulse.onsetTime) && !stopped(pulse.time) && !stopped(pulse.onsetTime) &&
  windows.filter(window => within(window, pulse.time)).length === 1 &&
  (!i || pulse.frame > pulses[i - 1].frame)));
const missing = [...halfOnsets].filter(time => !pulses.some(pulse => pulse.onsetTime === time && pulse.kind === 'half'));
assert.equal(missing.length, 0, `Missing established finale half-beats: ${missing.join(', ')}`);

const summary = JSON.stringify({ frameRate, audioSha256, windows, summary: stats }, null, 2);
const events = pulses.map(pulse => '    ' + JSON.stringify(pulse));
await writeFile(file('data/v22_rhythm.json'), summary.slice(0, -2) + ',\n  "pulses": [\n' +
  events.join(',\n') + '\n  ]\n}\n');
console.table(stats);
