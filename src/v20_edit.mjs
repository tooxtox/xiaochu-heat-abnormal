export function applyV20Edit(data, edit) {
  const shots = data.shots.shots;
  data.shots = { ...data.shots, shots: [
    ...shots.filter(shot => shot.end <= edit.start),
    ...edit.shots,
    ...shots.filter(shot => shot.start >= edit.end),
  ] };
  data.frameLockedEdit = true;
  data.finaleEdit = { start: edit.start, end: edit.end };
  const cues = new Map(edit.sceneStarts.map(cue => [cue.segment, cue]));
  data.cues.scenes = data.cues.scenes.map(cue => cues.has(cue.segment)
    ? { ...cue, ...cues.get(cue.segment) }
    : cue);
}

export function finaleVisual(data, time, shot) {
  const edit = data.finaleEdit;
  const frameTime = time + 1e-8;
  return edit && frameTime >= edit.start && frameTime < edit.end ? (shot.visualScene ?? shot.scene ?? null) : null;
}
