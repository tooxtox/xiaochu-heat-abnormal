import { glitchToggle } from './glitch.mjs';

const CHANNELS = ['#ff0000', '#00ff00', '#0000ff'];
const caches = new WeakMap();
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function random(seed) {
  const n = Math.sin(seed * 91.317 + 47.72) * 18459.4723;
  return n - Math.floor(n);
}

function localRegions(index, tier, dense, width, height) {
  const regions = [];
  const kinds = tier === 3 ? ['rgb', 'mono', 'rgb', 'sync', 'sync']
    : tier === 2 ? ['rgb', 'mono', 'sync', 'sync']
    : ['rgb', 'mono', 'sync'];
  if (dense) kinds.push('rgb', 'mono', 'sync', 'sync');
  const phase = random(index * 13.73);
  for (const [i, kind] of kinds.entries()) {
    const seed = index * 73.1 + i * 37.51;
    const primary = i < 2;
    const size = kind === 'sync' ? [.14, .18, .016, .034]
      : primary ? [.25, .21, .09, kind === 'mono' ? .10 : .065]
      : [.15, .19, .048, .052];
    const [minWidth, extraWidth, minHeight, extraHeight] = size;
    const w = Math.max(1, Math.round((minWidth + extraWidth * random(seed + 1)) * width));
    const h = Math.max(1, Math.round((minHeight + extraHeight * random(seed + 2)) * height));
    const row = (phase + i * .381966 + (random(seed + 3) - .5) * .13) % 1;
    const x = Math.round((width - w) * (.075 + .85 * random(seed + 4)));
    const y = Math.round((height - h) * (.075 + .84 * ((row + 1) % 1)));
    const side = random(seed + 5) < .5 ? -1 : 1;
    const polarity = (index + i) % 2 ? -1 : 1;
    const direction = side * (.58 + .42 * random(seed + 6));
    const dropouts = Array.from({ length: kind === 'sync' ? tier + 3 : 3 }, (_, n) => {
      const key = seed + 61.07 * (n + 1);
      const left = random(key + 1) * .74;
      return {
        x: Math.round(left * w),
        y: Math.round(random(key + 2) * h),
        w: Math.max(1, Math.round((.06 + random(key + 3) * Math.min(.27, 1 - left)) * w)),
        line: random(key + 4) < .46,
        jump: (random(key + 5) - .5) * 2,
      };
    });
    regions.push({ kind, x, y, w, h, direction, polarity, dropouts });
  }
  return regions;
}

function getState(c, resources, width, height, index, tier, dense) {
  let state = caches.get(resources);
  if (!state || state.width !== width || state.height !== height) {
    const doc = c.canvas.ownerDocument;
    const makeCanvas = resources.makeCanvas
      ? (w, h) => resources.makeCanvas(w, h)
      : doc && ((w, h) => Object.assign(doc.createElement('canvas'), { width: w, height: h }));
    if (!makeCanvas) return null;
    const source = makeCanvas(width, height);
    const tileWidth = Math.ceil(width * .47), tileHeight = Math.ceil(height * .17);
    state = {
      width, height, source, snapshot: source.getContext('2d'),
      channel: makeCanvas(tileWidth, tileHeight).getContext('2d'),
      mixed: makeCanvas(tileWidth, tileHeight).getContext('2d'),
    };
    caches.set(resources, state);
  }
  if (state.index !== index || state.tier !== tier || state.dense !== dense) {
    state.index = index;
    state.tier = tier;
    state.dense = dense;
    state.regions = localRegions(index, tier, dense, width, height);
  }
  state.snapshot.globalCompositeOperation = 'copy';
  state.snapshot.drawImage(c.canvas, 0, 0, width, height);
  return state;
}

function sampleRegion(c, state, region, dx, dy, x, y) {
  const { w, h } = region;
  const sx = clamp(Math.round(region.x + dx), 0, state.width - w);
  const sy = clamp(Math.round(region.y + dy), 0, state.height - h);
  c.drawImage(state.source, sx, sy, w, h, x, y, w, h);
}

function chromaticPatch(c, state, region, offset, power, unit) {
  const { channel, mixed } = state;
  const { x, y, w, h, direction, polarity } = region;
  const distance = (8 + 46 * power) * unit * direction;
  const rowDrift = (2 + 10 * power) * unit * polarity;
  mixed.clearRect(0, 0, w, h);
  for (const [i, color] of CHANNELS.entries()) {
    const shift = i - 1;
    channel.globalCompositeOperation = 'copy';
    sampleRegion(channel, state, region, offset + shift * distance, shift * rowDrift, 0, 0);
    channel.globalCompositeOperation = 'multiply';
    channel.fillStyle = color;
    channel.fillRect(0, 0, w, h);
    mixed.globalCompositeOperation = i === 0 ? 'source-over' : 'lighter';
    mixed.drawImage(channel.canvas, 0, 0, w, h, 0, 0, w, h);
  }
  c.globalAlpha = clamp(power * 1.45);
  c.drawImage(mixed.canvas, 0, 0, w, h, x, y, w, h);
}

function monochromePatch(c, state, region, offset, power, stretch, unit) {
  const { x, y, w, h, direction } = region;
  c.globalAlpha = clamp(power * 1.23);
  sampleRegion(c, state, region, offset * .8, direction * stretch * 9 * unit, x, y);
  c.globalCompositeOperation = 'color';
  c.globalAlpha = clamp(power * 1.63);
  c.fillStyle = '#808080';
  c.fillRect(x, y, w, h);
  c.globalCompositeOperation = 'source-over';
}

function drawDropouts(c, state, region, power, offset, ink, unit) {
  const { x, y, w, h, kind, dropouts } = region;
  for (const [i, row] of dropouts.entries()) {
    const width = Math.min(w - row.x, row.w);
    if (width < 1) continue;
    const lineHeight = Math.max(1, Math.round((row.line ? 1.4 : 3 + power * 8) * unit));
    const height = Math.min(lineHeight, h - row.y);
    if (height < 1) continue;
    const dx = x + row.x, dy = y + row.y;
    c.globalAlpha = clamp(power * (row.line ? .48 : 1.09));
    if (row.line || i % 4 === 1) {
      c.fillStyle = row.line ? ink : '#0a0b11';
      c.fillRect(dx, dy, width, height);
      continue;
    }
    const sx = clamp(Math.round(dx + offset * (1.15 + row.jump)), 0, state.width - width);
    const sy = clamp(dy + Math.round(row.jump * 10 * unit), 0, state.height - height);
    const readHeight = kind === 'sync' ? Math.max(1, Math.ceil(height * .38)) : height;
    c.drawImage(state.source, sx, sy, width, readHeight, dx, dy, width, height);
  }
}

export function drawV22Glitch(c, time, resources, width, height, pulse) {
  if (!glitchToggle.enabled || !pulse || !Number.isFinite(pulse.age) || pulse.age < -1e-8) return false;
  const tier = pulse.tier ?? 2;
  const age = Math.max(0, pulse.age);
  const intensity = pulse.intensity ?? 1;
  const dense = intensity > 1.25;
  const tail = 1 - clamp(age / (.148 + .046 * tier));
  const power = (.49 + .51 * clamp(pulse.strength ?? .7))
    * (.38 + .62 * clamp(pulse.level ?? .7)) * tail ** .88 * intensity;
  if (power < .05) return false;
  const index = pulse.index ?? Math.round((time - age) * 60);
  const state = getState(c, resources, width, height, index, tier, dense);
  if (!state) return false;
  const unit = width / 1920;
  const stretch = power * (.85 + .15 * clamp(age / .045));
  const cool = pulse.cold || [2, 3, 4].includes(pulse.scene);
  const ink = cool ? '#85deec' : '#ff756e';
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  for (const region of state.regions) {
    const { kind, x, y, direction } = region;
    const offset = direction * (19 + tier * 22) * stretch * unit;
    if (kind === 'rgb') chromaticPatch(c, state, region, offset, power, unit);
    else if (kind === 'mono') monochromePatch(c, state, region, offset, power, stretch, unit);
    else {
      c.globalAlpha = clamp(power * 1.34);
      sampleRegion(c, state, region, offset * 1.15, 0, x, y);
    }
    drawDropouts(c, state, region, power, offset, ink, unit);
  }
  c.restore();
  return true;
}
