export function applyV18Edit(data, edit) {
  data.v18 = true;
  data.readingShots = data.shots.shots;
  data.shots = { ...data.shots, shots: edit.shots };
  const starts = new Map((edit.sceneStarts || []).map(scene => [scene.segment, scene.start]));
  data.cues.scenes = data.cues.scenes.map(scene => starts.has(scene.segment)
    ? { ...scene, start: starts.get(scene.segment) }
    : scene);
  data.frontEdit = {
    start: starts.get(2) ?? data.frontEdit.start,
    end: starts.get(15) ?? data.frontEdit.end,
  };
}
