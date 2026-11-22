const poses = { v16Look: 'look', v16Reach: 'reach', v16Shield: 'shield' };

export function applyV16Edit(data, cold, climax) {
  let shots = data.shots.shots;
  for (const edit of [cold, climax]) {
    const before = shots.filter(shot => shot.start < edit.start);
    const after = shots.filter(shot => shot.end > edit.end);
    // Avoid a stray frame when the new cut is a fraction of a beat after an old cut.
    if (edit.start - before.at(-1).start < 2 / 60) before.pop();
    const last = before.at(-1);
    before[before.length - 1] = { ...last, end: edit.start, duration: edit.start - last.start };
    const first = after[0];
    if (first.start < edit.end) {
      after[0] = { ...first, start: edit.end, duration: first.end - edit.end };
    }
    shots = [...before, ...edit.shots, ...after];
  }
  data.shots = { ...data.shots, shots };
  data.frameLockedEdit = true;
  const sceneStarts = new Map(climax.sceneStarts.map(scene => [scene.segment, scene.start]));
  data.cues.scenes = data.cues.scenes.map(scene => sceneStarts.has(scene.segment)
    ? { ...scene, start: sceneStarts.get(scene.segment) }
    : scene);

  for (const [key, basename] of Object.entries(poses)) {
    data.config.images[key] = `assets/character/v16/${basename}.png`;
  }
}
