import { glitchToggle } from './glitch.mjs';
import { hash2, signalWindowAt } from './signal_windows.mjs';
import { drawV22Glitch } from './v22_glitch.mjs';
import { glitchPulseAt } from './v22_rhythm.mjs';

const stages = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function stageFor(ctx, resources, width, height) {
  const saved = stages.get(resources);
  if (saved?.source.width === width && saved.source.height === height) return saved;

  const doc = ctx.canvas.ownerDocument;
  const makeCanvas = resources.makeCanvas
    ? (w, h) => resources.makeCanvas(w, h)
    : doc && ((w, h) => Object.assign(doc.createElement('canvas'), { width: w, height: h }));
  if (!makeCanvas) return null;
  const source = makeCanvas(width, height);
  const stage = {
    source,
    copy: source.getContext('2d'),
    packet: makeCanvas(160, 24).getContext('2d'),
    channelResources: { makeCanvas },
  };
  stages.set(resources, stage);
  return stage;
}

export function drawV23FirstImpact(ctx, time, resources, data, width, height) {
  if (!data.v23 || !glitchToggle.enabled || signalWindowAt(time)?.id !== 'repeat') return false;
  const pulse = glitchPulseAt(data, time);
  if (!pulse) return false;

  const { age, index, strength, tier } = pulse;
  const decay = Math.max(0, 1 - age / (.16 + .025 * tier));
  const gain = (.57 + .43 * strength) * decay ** .92;
  if (gain < .05) return false;
  const stage = stageFor(ctx, resources, width, height);
  if (!stage) return false;

  if (tier === 3 && age < .115) {
    drawV22Glitch(ctx, time, stage.channelResources, width, height, {
      ...pulse, age: age * 1.85, index: index + 1709, level: .91,
    });
  }

  // Copy once before painting delayed scan packets and their damaged chroma edges.
  stage.copy.globalCompositeOperation = 'copy';
  stage.copy.drawImage(ctx.canvas, 0, 0, width, height);
  const unit = width / 1920;
  const phase = hash2(index, 42);
  const count = tier === 3 ? 4 : tier === 2 ? 3 : 2;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < count; i++) {
    const w = Math.max(1, Math.round(width * (.17 + .24 * hash2(index, i * 7 + 1))));
    const h = Math.max(1, Math.round(height * (.018 + .041 * hash2(index, i * 7 + 2))));
    const x = Math.round((width - w) * (.06 + .88 * hash2(index, i * 7 + 3)));
    const y = Math.round((height - h) * (.14 + .68 * ((phase + i * .37) % 1)));
    const sign = (index + i) % 2 === 0 ? 1 : -1;
    const sx = clamp(x + Math.round(sign * (75 + 29 * tier) * unit * gain), 0, width - w);
    const sy = clamp(y + Math.round(sign * (13 + 19 * hash2(index, i * 7 + 4)) * unit), 0, height - h);
    const pw = 40 + Math.round(90 * hash2(index, i * 7 + 5));
    const ph = 3 + Math.round(8 * hash2(index, i * 7 + 6));

    stage.packet.globalCompositeOperation = 'copy';
    stage.packet.drawImage(stage.source, sx, sy, w, h, 0, 0, pw, ph);
    ctx.globalAlpha = Math.min(1, gain * 1.34);
    ctx.drawImage(stage.packet.canvas, 0, 0, pw, ph, x, y, w, h);
    ctx.fillStyle = sign > 0 ? '#ff5571' : '#79dcf1';
    ctx.globalAlpha = gain * .64;
    ctx.fillRect(x, y + h - Math.max(1, 2 * unit), w, Math.max(1, 2 * unit));
    ctx.fillStyle = '#11101d';
    ctx.globalAlpha = gain * .83;
    ctx.fillRect(x + w * .58, y, w * .42, Math.max(1, 3.5 * unit));
  }
  ctx.restore();
  return true;
}
