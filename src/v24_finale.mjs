const HANDS_LINE = 'L104';
const FPS = 60;
const DEFAULT_FAST_FRAME = 12599;

export function applyV24Finale(data) {
  const { start, end } = data.finaleEdit;
  const hands = data.lyrics?.lines?.find(line => line.id === HANDS_LINE)?.time;
  const fastFrom = (Number.isFinite(hands) ? Math.ceil(hands * FPS - 1e-8) : DEFAULT_FAST_FRAME) / FPS;
  const shots = data.shots.shots;
  const leadIn = shots.filter(shot => shot.start >= start && shot.segment < 27);
  const fast = shots.filter(shot => shot.segment >= 27 && shot.start < end);
  const held = [];
  let count = 0, segment;
  for (const shot of leadIn) {
    if (shot.segment !== segment) {
      segment = shot.segment;
      count = 0;
    }
    if (count++ % 4 === 0) held.push(shot);
  }
  const selected = [...held, ...fast.map((shot, i) => i === 0 ? { ...shot, start: fastFrom } : shot)];
  const edit = selected.map((shot, index) => {
    const to = selected[index + 1]?.start ?? end;
    const slow = shot.start < fastFrom;
    return { ...shot, end: to, duration: to - shot.start,
      musicPacing: slow ? 'flow' : shot.musicPacing,
      rhythm: { ...shot.rhythm, level: slow ? .22 : shot.rhythm.level,
        index, from: shot.start, to } };
  });
  data.v24 = true;
  data.finaleEdit.fastFrom = fastFrom;
  data.shots.shots = [...shots.filter(shot => shot.start < start), ...edit,
    ...shots.filter(shot => shot.start >= end)];
}

export function v24GlitchAt(data, time, pulse) {
  const edit = data.v24 && data.finaleEdit;
  if (!edit || time < edit.start || time >= edit.end) return pulse;
  const section = time < edit.fastFrom
    ? .40 + .18 * (time - edit.start) / (edit.fastFrom - edit.start)
    : .97 + 1.18 * Math.min(1, (time - edit.fastFrom) / (edit.end - edit.fastFrom));
  return { ...pulse, intensity: section * (.82 + .18 * pulse.strength) };
}
