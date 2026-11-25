import { editorialShotAt } from './transitions.mjs';
import { finaleVisual } from './v20_edit.mjs';

const ink = {
  plain: { treat: 'none', treatP: {} },
  outline: { treat: 'outline', treatP: { k: .036 } },
  solid: { treat: 'outlineFill', treatP: { k: .068, c: 2 } },
  double: { treat: 'doubleOutline', treatP: { a: .065, b: .045 } },
  warm: { treat: 'gradientV', treatP: { up: false, g: false } },
  neon: { treat: 'neonOutline', treatP: { k: .034, fl: false } },
  printed: { treat: 'hatch', treatP: { v: 'duo' } },
};

// The finale's colour world follows the picture, not the lyric sheet: every visual
// world the camera travels through owns one JIZURA style, so the line changes as
// the cut moves from the black star to the reactor to the corrupted sea.
const WORLD_PLAN = { 5: 'dark', 6: 'red', 8: 'mono', 9: 'sea' };

// Treatments the director asked for by name. They carry the scene's meaning, so the
// per-shot ink never overwrites them.
const DIRECTED = new Set(['glitchSplit', 'glow', 'neonOutline']);

const palettes = new WeakMap();
const centered = [0, 0];

function preferences(shot) {
  if (shot.onset?.halfBeatTime != null) return ['neon', 'double', 'solid'];
  if (shot.starFocus) return ['warm', 'neon', 'double'];
  if (shot.mode === 'eye') return ['solid', 'double', 'warm'];
  if (shot.mode === 'portrait') return ['outline', 'solid', 'neon'];
  if (shot.mode === 'hand') return ['neon', 'outline', 'warm'];
  if ((shot.visualScene ?? shot.scene) === 8) return ['double', 'solid', 'warm'];
  if (shot.mode === 'abstract') return ['printed', 'outline', 'neon'];
  return ['warm', 'solid', 'outline'];
}

export function finaleShotPlanAt(data, time, basePlan) {
  const shot = editorialShotAt(data, time);
  if (!shot) return basePlan;
  const world = shot.visualScene ?? shot.scene;
  return WORLD_PLAN[world] ?? basePlan;
}

export function finaleShotInkAt(data, time) {
  const shot = editorialShotAt(data, time);
  if (!shot || finaleVisual(data, time, shot) === null) return ink.plain;
  const shots = data.shots.shots;
  let treatments = palettes.get(shots);
  if (!treatments) {
    treatments = new Map();
    let previous;
    for (const clip of shots) {
      if (finaleVisual(data, clip.start, clip) === null) continue;
      // Consecutive cuts read distinctly even when both show the same subject.
      const order = preferences(clip);
      previous = order.find(style => style !== previous) ?? order[0] ?? 'plain';
      treatments.set(clip.id, ink[previous]);
    }
    palettes.set(shots, treatments);
  }
  return treatments.get(shot.id) ?? ink.plain;
}

export function finaleShotAnchorAt(data, time, layout) {
  const shot = editorialShotAt(data, time);
  if (!shot) return centered;
  const visual = finaleVisual(data, time, shot);
  if (visual === null) return centered;

  let x = 0, y = 0;
  if (shot.mode === 'portrait') {
    const actorLeft = visual !== 8 && (visual === 5 || shot.pose === 'v17Profile');
    x = actorLeft ? 152 : -152;
    y = -22;
  } else if (shot.mode === 'eye') {
    y = 82;
  } else if (shot.mode === 'hand') {
    x = -116;
    y = -74;
  } else if (shot.starFocus) {
    y = 58;
  } else if (visual === 8) {
    x = shot.mode === 'world' ? 82 : 0;
    y = shot.mode === 'world' ? 10 : -32;
  } else if (shot.mode === 'abstract') {
    x = -60;
    y = -24;
  }

  if (layout === 'lowerThird') return [Math.max(0, Math.min(64, x)), Math.min(-8, y)];
  if (layout === 'huge') return [x * .3, y * .4];
  if (layout === 'perspective') return [x * .65, y * .55];
  return [x, y];
}

// Draw a finale line with the engine's own motion, enter / exit, decor and camera,
// then re-ink the cuts that are on screen during this shot. The ink is constant
// inside one shot and changes with the cut, so the lyric style tracks the camera
// while every JIZURA effect stays alive.
export function drawV23FinaleLyric(J, JZ, name, ctx, data, time) {
  const built = JZ.plans[name];
  if (!built) return;
  const plan = built.plan;
  const shot = editorialShotAt(data, time);
  const style = finaleShotInkAt(data, time);
  const from = shot ? shot.start : 0;
  const to = shot ? shot.end : Infinity;

  const touched = [];
  let cut = J.cutAt(plan, from);
  while (cut && cut.start < to) {
    if (!DIRECTED.has(cut.treat)) {
      touched.push({ cut, treat: cut.treat, treatP: cut.treatP });
      cut.treat = style.treat;
      cut.treatP = style.treatP;
    }
    cut = plan.cuts[cut.index + 1] || null;
  }
  try {
    JZ.drawPlan(name, ctx, time, 'front', { noPost: true });
  } finally {
    for (const entry of touched) {
      entry.cut.treat = entry.treat;
      entry.cut.treatP = entry.treatP;
    }
  }
}
