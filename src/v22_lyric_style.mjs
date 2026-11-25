import { editorialShotAt } from './transitions.mjs';

export function finaleInkAt(data, time) {
  const shot = editorialShotAt(data, time);
  if (!shot?.rhythm?.beatLocked || !shot.onset || time >= data.finaleEdit.end)
    return { treat: 'none', treatP: {} };

  const { halfBeatTime, low, high, strength } = shot.onset;
  const age = Math.max(0, time - shot.start);
  const strike = Math.max(0, 1 - age / .14) ** 2;

  if (halfBeatTime != null)
    return { treat: 'neonOutline', treatP: { k: .024 + .013 * strike, fl: false } };
  if (low >= .79 || strength >= .88)
    return { treat: 'doubleOutline', treatP: { a: .042 + .023 * strike, b: .034 + .021 * strike } };
  if (high >= .45)
    return { treat: 'outline', treatP: { k: .025 + .017 * strike } };
  if (low >= .66)
    return { treat: 'gradientV', treatP: { up: false, g: false } };
  return { treat: 'outlineFill', treatP: { k: .046 + .020 * strike, c: 2 } };
}

export function drawV22FinaleLyric(J, JZ, name, ctx, data, time, lineStart, treatment = finaleInkAt(data, time)) {
  const plan = JZ.plans[name].plan;
  const cut = J.cutAt(plan, lineStart + .002);
  if (!cut) return;

  // Re-sample the same layout pose throughout the line. Only the ink follows the real clock.
  const sample = cut.start + cut.dur * .62;
  const saved = { treat: cut.treat, treatP: cut.treatP };
  const { fx, events } = plan;
  Object.assign(cut, treatment);
  plan.fx = { ...fx, motion: 0, chroma: 0, koma: 0 };
  plan.events = [];
  try {
    JZ.drawPlan(name, ctx, sample, 'front', { noPost: true, noTrans: true, noGhost: true });
  } finally {
    plan.fx = fx;
    plan.events = events;
    Object.assign(cut, saved);
  }
}
