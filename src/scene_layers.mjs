// Shared scenery layer toolkit for 《熱異常 / LAST SIGNAL》.
// Every export is a pure function of song time: no frame history, no Math.random,
// no external textures. Layers are composed from data/scene_layers.json so the
// environment art of a scene is described by data instead of hard-coded branches.
import { palette } from './palette.mjs';

export const W = 1920;
export const H = 1080;
const TAU = Math.PI * 2;

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const fract = (x) => x - Math.floor(x);
export const mix = (a, b, t) => a + (b - a) * t;
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const hash = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// #RRGGBB -> rgba(). Scene colours must stay semantic, so transparency is applied here
// instead of by inventing new hues.
// The strings are memoised: a city skyline builds thousands of alpha colours per frame and
// re-parsing them in the rasteriser is the single most expensive thing in the scene art.
const alphaCache = new Map();
export function alpha(hex, a) {
  if (typeof hex !== 'string') return hex;
  if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
  const q = Math.round(clamp(a, 0, 1) * 50) / 50;
  const key = hex + '|' + q;
  let value = alphaCache.get(key);
  if (value === undefined) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    value = `rgba(${r},${g},${b},${q})`;
    alphaCache.set(key, value);
  }
  return value;
}
export function mixHex(a, b, t) {
  const pa = String(a).replace('#', ''), pb = String(b).replace('#', '');
  const na = pa.length === 3 ? pa.split('').map(x => x + x).join('') : pa;
  const nb = pb.length === 3 ? pb.split('').map(x => x + x).join('') : pb;
  const ch = (s, i) => parseInt(s.slice(i * 2, i * 2 + 2), 16);
  const r = Math.round(mix(ch(na, 0), ch(nb, 0), t));
  const g = Math.round(mix(ch(na, 1), ch(nb, 1), t));
  const bl = Math.round(mix(ch(na, 2), ch(nb, 2), t));
  return `#${[r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

export function path(c, points, color, fill = false, w = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  if (fill) { c.closePath(); c.fillStyle = color; c.fill(); }
  else { c.strokeStyle = color; c.lineWidth = w; c.stroke(); }
}
export function line(c, x, y, X, Y, color, w = 1) { path(c, [[x, y], [X, Y]], color, false, w); }
export function circle(c, x, y, r, color, w = 1) {
  c.beginPath(); c.arc(x, y, Math.max(.01, r), 0, TAU);
  c.strokeStyle = color; c.lineWidth = w; c.stroke();
}
export function arc(c, x, y, r, start, length, color, w = 1) {
  c.beginPath(); c.arc(x, y, Math.max(.01, r), start, start + length);
  c.strokeStyle = color; c.lineWidth = w; c.stroke();
}

// ─────────────────────────────────────────────────────────────── atmospheric depth
// Air perspective is the cheapest way to separate a silhouette from a background:
// the further a layer sits, the closer its value gets to the sky colour.
// The city sky: brightest at the horizon, darkest overhead. The contrast of the
// whole skyline comes from "bright sky / dark mass", never from brightening the
// buildings themselves.
export function citySky(c, t, opts = {}) {
  const skyTop = opts.skyTop || '#06090F', skyMid = opts.skyMid || '#2A1A18', skyLow = opts.skyLow || '#6E2A1E', rim = opts.rim || '#FF8A5A';
  const base = opts.base ?? 748, top = opts.top ?? 0, bottom = opts.bottom ?? base;
  c.save();
  // 最亮的一带必须落在地平线上：剪影要靠"亮天空 / 暗楼体"读出来，
  // 而不是把楼体本身调亮。
  const sky = c.createLinearGradient(0, top, 0, bottom);
  sky.addColorStop(0, skyTop); sky.addColorStop(.42, skyMid); sky.addColorStop(.86, skyLow); sky.addColorStop(1, skyLow);
  c.fillStyle = sky; c.fillRect(0, top, W, bottom - top);
  const glowX = opts.glowX ?? 960;
  const glow = c.createRadialGradient(glowX, base - 8, 20, glowX, base - 8, 1250);
  glow.addColorStop(0, alpha(rim, .55)); glow.addColorStop(.35, alpha(rim, .18)); glow.addColorStop(1, alpha(rim, 0));
  c.globalCompositeOperation = 'lighter'; c.fillStyle = glow; c.fillRect(0, top, W, bottom - top);
  // 地平线下方的一层余烬辉光，避免楼体根部糊进地面。
  const ground = c.createLinearGradient(0, base - 40, 0, base + 90);
  ground.addColorStop(0, alpha(rim, .22)); ground.addColorStop(1, alpha(rim, 0));
  c.globalCompositeOperation = 'lighter'; c.fillStyle = ground; c.fillRect(0, base - 40, W, 130);
  c.restore();
}

// Air perspective is the cheapest way to separate a silhouette from a background:
// the further a layer sits, the closer its value gets to the sky colour.
export function depthHaze(c, t, opts = {}) {
  const y0 = opts.y0 ?? 430, y1 = opts.y1 ?? 1080;
  const color = opts.color ?? '#2A1A18';
  const strength = opts.strength ?? .42;
  const bands = opts.bands ?? 3;
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, alpha(color, 0));
  g.addColorStop(.55, alpha(color, strength * .55));
  g.addColorStop(1, alpha(color, strength));
  c.save(); c.fillStyle = g; c.fillRect(0, y0, W, y1 - y0); c.restore();
  // Soft strata: wide, very low contrast bands that drift at their own speed.
  c.save();
  for (let i = 0; i < bands; i++) {
    const y = y0 + (y1 - y0) * (.18 + i * .27) + Math.sin(t * (.05 + i * .017) + i) * 9;
    const drift = fract(t * (.006 + i * .004) + hash(i * 3.3));
    const x = -400 + drift * 2600;
    c.globalAlpha = strength * (.22 - i * .04);
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(x - 620, y + 34);
    c.lineTo(x + 520, y - 26);
    c.lineTo(x + 880, y + 20);
    c.lineTo(x - 300, y + 70);
    c.closePath(); c.fill();
  }
  c.restore();
}

// ───────────────────────────────────────────────────────────── building silhouettes
// A city block must never read as a rectangle. Each mass is a stack of setbacks
// with roof clutter, window grids, a rim light and optional damage.
export function drawBuilding(c, t, opts = {}) {
  const seed = opts.seed ?? 1;
  const x = opts.x ?? 0, baseY = opts.baseY ?? 1080;
  const w = opts.w ?? 120, h = opts.h ?? 320;
  const fill = opts.fill ?? '#04070B';
  const rim = opts.rim ?? palette.mint;
  const ruin = opts.ruin ?? 0;
  const lit = opts.lit ?? .34;
  const tilt = (opts.tilt ?? 0) + ruin * (hash(seed * 7.3) - .5) * .5;
  const fall = ruin * Math.max(0, Math.sin(seed * 9.1 + 1.3));
  const tiers = opts.tiers ?? (2 + Math.floor(hash(seed * 1.3) * 2));
  const lightDir = opts.lightDir ?? 1; // which side carries the rim light

  c.save();
  c.translate(x, baseY);
  c.rotate(tilt);
  c.globalAlpha = opts.opacity ?? 1;

  // Tier stack: bottom mass first, then narrower setbacks above it.
  const stack = [];
  let tw = w, remaining = h;
  for (let i = 0; i < tiers; i++) {
    const share = i === 0 ? (.44 + hash(seed * 3.7) * .26) : (.30 + hash(seed * (i + 2.9)) * .26);
    const th = Math.max(18, remaining * share);
    const ox = (hash(seed * (i + 5.1)) - .5) * w * .26 * (i ? 1 : 0);
    stack.push({ x: ox, w: tw, h: th });
    remaining -= th;
    tw *= (.46 + hash(seed * (i + 7.7)) * .26);
  }
  let topY = 0;
  stack.forEach((tier, i) => {
    const y = -topY - tier.h;
    topY += tier.h;
    c.fillStyle = fill;
    c.fillRect(tier.x - tier.w / 2, y, tier.w, tier.h + 2);
    // A slightly lighter side wall gives the mass a corner instead of a flat plane.
    c.fillStyle = opts.side ?? alpha(rim, .10);
    const sw = Math.min(tier.w * .22, 26);
    c.fillRect(tier.x + (lightDir > 0 ? tier.w / 2 - sw : -tier.w / 2), y, sw, tier.h + 2);
    // 竖排招牌：在远处的楼体上也能读出来，给天际线打散节奏
    if (opts.style !== 'shed' && hash(seed * 71.3) > .58) {
      const sy = -tier.h + tier.h * (.10 + hash(seed * 73.1) * .3);
      const sh = tier.h * (.16 + hash(seed * 79.7) * .30);
      const sw = Math.max(3, tier.w * .07);
      const sx = tier.x + (lightDir > 0 ? tier.w * .16 : -tier.w * .16);
      c.fillStyle = alpha(rim, .40 + .22 * Math.abs(Math.sin(t * 1.3 + seed)));
      c.fillRect(sx, sy, sw, sh);
      c.fillStyle = alpha('#000000', .45);
      for (let k = 0; k < 4; k++) c.fillRect(sx, sy + k * sh / 4 + 3, sw, 2);
    }
    // Rim light along the lit vertical edge and the roof line.
    const rx = lightDir > 0 ? tier.x + tier.w / 2 - 2 : tier.x - tier.w / 2;
    c.fillStyle = alpha(rim, .66 + .28 * (1 - i / tiers));
    c.fillRect(rx, y, 2.6, tier.h);
    c.fillRect(tier.x - tier.w / 2, y, tier.w, 1.8);
    // Window grid: sparse, uneven, and lit only on some cells.
    if (opts.windows !== false && tier.h > 34) {
      const cols = Math.max(2, Math.floor(tier.w / 24));
      const rows = Math.max(2, Math.floor(tier.h / 34));
      const cw = tier.w / cols, chh = tier.h / rows;
      for (let cx = 0; cx < cols; cx++) for (let cy = 0; cy < rows; cy++) {
        const k = hash(seed * 11.3 + cx * 3.7 + cy * 5.1 + i * 2.3);
        if (k > lit) continue;
        const flick = hash(seed + cx + cy) > .86 ? (.4 + .6 * Math.abs(Math.sin(t * (1.4 + k * 3) + k * 9))) : 1;
        c.fillStyle = alpha(rim, (.30 + k * .55) * flick);
        c.fillRect(tier.x - tier.w / 2 + cx * cw + cw * .18, y + cy * chh + chh * .22, Math.max(1.6, cw * .5), Math.max(1.4, chh * .32));
      }
    }
    if (ruin > .12) {
      // Structural cracks leak light out of the broken mass.
      c.strokeStyle = alpha('#FF6A4A', ruin * .8); c.lineWidth = 1.5;
      c.beginPath();
      const cx = tier.x + (hash(seed * 13.7 + i) - .5) * tier.w * .6;
      c.moveTo(cx, y + tier.h * .08);
      c.lineTo(cx + (hash(seed * 17.3) - .5) * tier.w * .4, y + tier.h * .5);
      c.lineTo(cx + (hash(seed * 19.9) - .5) * tier.w * .7, y + tier.h * .92);
      c.stroke();
    }
  });

  // Roof clutter on the top tier — this is what kills the "flat rectangle" read.
  if (opts.roof !== false) {
    const top = stack[stack.length - 1];
    const ry = -topY;
    const props = 1 + Math.floor(hash(seed * 23.7) * 3);
    for (let i = 0; i < props; i++) {
      const kind = hash(seed * 29.1 + i * 3.3);
      const px = top.x + (hash(seed * 31.7 + i) - .5) * top.w * .72;
      if (kind < .34) {
        // Antenna mast with a beacon.
        const mh = 26 + hash(seed * 37.3 + i) * 58;
        c.strokeStyle = alpha(rim, .34); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(px, ry); c.lineTo(px + (hash(seed * 41.1) - .5) * 8, ry - mh); c.stroke();
        line(c, px - 7, ry - mh * .45, px + 7, ry - mh * .45, alpha(rim, .22), .8);
        c.fillStyle = alpha('#FF6A4A', .5 + .5 * Math.abs(Math.sin(t * 1.7 + seed + i)));
        c.fillRect(px - 1.8, ry - mh - 2.4, 3.4, 3.4);
      } else if (kind < .62) {
        // Water tank on legs.
        const tw2 = 12 + hash(seed * 43.9 + i) * 16, th2 = 14 + hash(seed * 47.3 + i) * 12;
        c.strokeStyle = alpha(rim, .26); c.lineWidth = 1.2;
        c.strokeRect(px - tw2 / 2, ry - th2, tw2, th2);
        line(c, px - tw2 / 2, ry, px - tw2 / 2, ry + 8, alpha(rim, .22), 1);
        line(c, px + tw2 / 2, ry, px + tw2 / 2, ry + 8, alpha(rim, .22), 1);
      } else if (kind < .84) {
        // Stair penthouse.
        const bw = top.w * (.24 + hash(seed * 53.1 + i) * .2), bh = 10 + hash(seed * 59.3 + i) * 14;
        c.fillStyle = fill; c.fillRect(px - bw / 2, ry - bh, bw, bh);
        c.fillStyle = alpha(rim, .34); c.fillRect(px - bw / 2, ry - bh, bw, 1.4);
      } else {
        // 楼顶招牌：远看也要读得出来的亮块，给天际线打散节奏
        const bw = top.w * (.5 + hash(seed * 61.7 + i) * .3), bh = 8 + hash(seed * 67.1 + i) * 10;
        c.strokeStyle = alpha(rim, .42); c.lineWidth = 1.1; c.strokeRect(px - bw / 2, ry - bh - 12, bw, bh);
        c.fillStyle = alpha(rim, .3 + .22 * Math.abs(Math.sin(t * .9 + i)));
        c.fillRect(px - bw / 2, ry - bh - 12, bw, bh);
        line(c, px - bw / 2 + 3, ry, px - bw / 2 + 3, ry - bh - 12, alpha(rim, .3), 1);
        line(c, px + bw / 2 - 3, ry, px + bw / 2 - 3, ry - bh - 12, alpha(rim, .3), 1);
      }
    }
  }
  if (fall > .01) {
    c.fillStyle = alpha('#000000', .5);
    c.fillRect(-w / 2, -h, w, h);
  }
  // 业态差异：玻璃塔、住宅楼、厂房、地标尖塔各有自己的表面语言，
  // 这样一排楼不会看起来是同一个矩形复制出来的。
  const style = opts.style || 'block';
  if (style === 'tower') {
    // 玻璃幕墙：竖向分格 + 横向楼层带 + 少量竖排亮窗
    const main = stack[0];
    c.save();
    c.beginPath(); c.rect(main.x - main.w / 2, -main.h, main.w, main.h); c.clip();
    c.globalAlpha = .5;
    c.strokeStyle = alpha(rim, .30); c.lineWidth = 1;
    for (let x = main.x - main.w / 2; x < main.x + main.w / 2; x += 7) line(c, x, -main.h, x, 0, alpha(rim, .26), 1);
    for (let y = -main.h + 12; y < 0; y += 26) line(c, main.x - main.w / 2, y, main.x + main.w / 2, y, alpha(rim, .18), 1);
    c.globalAlpha = 1;
    for (let i = 0; i < 5; i++) {
      const bx = main.x - main.w / 2 + hash(seed * 21.3 + i) * main.w * .8;
      c.fillStyle = alpha(rim, .18 + hash(seed * 7.7 + i) * .35);
      c.fillRect(bx, -main.h + hash(seed * 9.1 + i) * main.h * .7, Math.max(2, main.w * .05), Math.max(10, main.h * .22));
    }
    c.restore();
  } else if (style === 'shed') {
    // 厂房：波纹板、宽门、烟囱
    const main = stack[0];
    c.save();
    c.beginPath(); c.rect(main.x - main.w / 2, -main.h, main.w, main.h); c.clip();
    c.globalAlpha = .38; c.strokeStyle = alpha(rim, .22); c.lineWidth = 1;
    for (let x = main.x - main.w / 2; x < main.x + main.w / 2; x += 5) line(c, x, -main.h, x, 0, alpha(rim, .2), 1);
    c.restore();
    c.fillStyle = alpha('#000000', .55);
    c.fillRect(main.x - main.w * .22, -main.h * .26, main.w * .44, main.h * .26);
    c.strokeStyle = alpha(rim, .3); c.lineWidth = 1.2;
    c.strokeRect(main.x - main.w * .22, -main.h * .26, main.w * .44, main.h * .26);
    for (let i = 0; i < 2; i++) {
      const cx = main.x + (i ? .3 : -.3) * main.w;
      const ch = 24 + hash(seed * 13.9 + i) * 42;
      c.fillStyle = alpha('#000000', .6); c.fillRect(cx - 5, -main.h - ch, 10, ch);
      c.fillStyle = alpha(rim, .28); c.fillRect(cx - 5, -main.h - ch, 10, 2);
    }
  } else if (style === 'spire') {
    // 地标尖塔：收分塔身 + 桅杆 + 航空障碍灯
    const main = stack[0];
    c.fillStyle = fill;
    c.beginPath();
    c.moveTo(main.x - main.w / 2, 0);
    c.lineTo(main.x - main.w * .22, -main.h);
    c.lineTo(main.x + main.w * .22, -main.h);
    c.lineTo(main.x + main.w / 2, 0);
    c.closePath(); c.fill();
    c.strokeStyle = alpha(rim, .55); c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(main.x - main.w * .22, -main.h); c.lineTo(main.x + main.w * .22, -main.h); c.stroke();
    const mast = 40 + hash(seed * 17.7) * 60;
    c.strokeStyle = alpha(rim, .5); c.lineWidth = 1.8;
    c.beginPath(); c.moveTo(main.x, -main.h); c.lineTo(main.x, -main.h - mast); c.stroke();
    c.fillStyle = alpha('#FF6A4A', .45 + .55 * Math.abs(Math.sin(t * 1.9 + seed)));
    c.fillRect(main.x - 3, -main.h - mast - 5, 6, 6);
  } else {
    // 住宅楼：密集小窗 + 每三层一道阳台线
    const main = stack[0];
    c.save();
    c.beginPath(); c.rect(main.x - main.w / 2, -main.h, main.w, main.h); c.clip();
    c.globalAlpha = .45; c.strokeStyle = alpha(rim, .2); c.lineWidth = 1;
    for (let y = -main.h + 30; y < 0; y += 34) line(c, main.x - main.w / 2, y, main.x + main.w / 2, y, alpha(rim, .22), 1);
    c.restore();
  }
  c.restore();
}

// A scrolling row of buildings. `depth` shifts value and detail, so three calls
// with different depth read as three different distances.
export function cityRow(c, t, opts = {}) {
  const step = opts.step ?? 150;
  const x0 = opts.x0 ?? -260, x1 = opts.x1 ?? W + 260;
  const baseY = opts.baseY ?? 760;
  const scroll = opts.scroll ?? 4;
  const depth = opts.depth ?? 1;
  const count = Math.ceil((x1 - x0) / step) + 2;
  const offset = (t * scroll) % step;
  for (let i = -1; i < count; i++) {
    const seed = (opts.seed ?? 1) + i * 17 + (opts.seedOffset ?? 0);
    const x = x0 + i * step - offset + hash(seed * 2.1) * 34;
    const w = (opts.w ?? [46, 118])[0] + hash(seed * 3.3) * ((opts.w ?? [46, 118])[1] - (opts.w ?? [46, 118])[0]);
    const h = (opts.h ?? [140, 420])[0] + hash(seed * 5.9) * ((opts.h ?? [140, 420])[1] - (opts.h ?? [140, 420])[0]);
    drawBuilding(c, t, {
      seed, x, baseY, w, h,
      fill: opts.fill ?? '#04070B',
      side: opts.side,
      rim: opts.rim ?? palette.mint,
      ruin: (opts.ruin ?? 0) * (depth > .6 ? 1 : .3),
      lit: (opts.lit ?? .32) * depth,
      opacity: opts.opacity ?? 1,
      lightDir: opts.lightDir ?? (x < W / 2 ? 1 : -1),
      windows: opts.windows,
    });
  }
}

// ─────────────────────────────────────────────────────────────── street level
// The street is what gives a city its scale. Without lamp posts, vehicles and
// figures, buildings read as a wallpaper.
export function streetGround(c, t, opts = {}) {
  const horizon = opts.horizon ?? 640;
  const vanishX = opts.vanishX ?? 960;
  const color = opts.color ?? '#16262C';
  const reflect = opts.reflect ?? .3;
  const yEnd = opts.yEnd ?? H;
  c.save();
  const g = c.createLinearGradient(0, horizon, 0, yEnd);
  g.addColorStop(0, alpha(opts.skyLow ?? color, .1));
  g.addColorStop(.25, color);
  g.addColorStop(1, opts.deep ?? '#070C11');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(vanishX - 70, horizon); c.lineTo(vanishX + 70, horizon);
  c.lineTo(W + 300, yEnd); c.lineTo(-300, yEnd); c.closePath(); c.fill();
  // Perspective seams accelerating towards the camera.
  c.globalAlpha = .34;
  for (let i = -8; i <= 8; i++) {
    const x = vanishX + i * 62;
    line(c, vanishX + i * 9, horizon, x + i * 46, yEnd, opts.seam ?? palette.mint, 1);
  }
  // Longitudinal seams.
  for (let j = 0; j < 14; j++) {
    const z = fract(j / 14 + t * (opts.speed ?? .02));
    const y = horizon + Math.pow(z, 2.2) * (yEnd - horizon);
    c.globalAlpha = .16 * (1 - z);
    line(c, 0, y, W, y, opts.seam ?? palette.mint, .8);
  }
  // Wet reflection: vertical streaks under the brightest sources.
  if (reflect > 0) {
    c.globalAlpha = reflect;
    for (let i = 0; i < 9; i++) {
      const x = vanishX + (hash(i * 4.7) - .5) * 1500;
      const h = 40 + hash(i * 8.1) * 180;
      const w = 3 + hash(i * 9.3) * 12;
      const grd = c.createLinearGradient(0, horizon, 0, horizon + h * 2.4);
      grd.addColorStop(0, alpha(opts.rim ?? palette.mint, .5));
      grd.addColorStop(1, alpha(opts.rim ?? palette.mint, 0));
      c.fillStyle = grd;
      c.fillRect(x, horizon, w, h * 2.4);
    }
  }
  c.restore();
}

// Street furniture and traffic: lamp posts, light pools, vehicles and figures.
export function streetProps(c, t, opts = {}) {
  const horizon = opts.horizon ?? 640;
  const vanishX = opts.vanishX ?? 960;
  const color = opts.rim ?? palette.mint;
  const yEnd = opts.yEnd ?? H;
  c.save();
  // Lamp posts marching towards the vanishing point.
  for (let i = 0; i < 8; i++) {
    const z = fract(i / 8 + t * .012);
    const scale = .12 + z * 1.05;
    const side = i % 2 ? 1 : -1;
    const x = vanishX + side * (150 + 520 * scale);
    const y = horizon + z * z * (yEnd - horizon) * .78;
    const h = 120 * scale + 18;
    const pole = opts.pole ?? '#0A1218';
    c.strokeStyle = pole; c.lineWidth = Math.max(1, 3 * scale);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.lineTo(x + 14 * scale, y - h); c.stroke();
    const lampY = y - h + 2 * scale;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x + 14 * scale, lampY, 1, x + 14 * scale, lampY, 60 * scale);
    g.addColorStop(0, alpha(color, .5)); g.addColorStop(1, alpha(color, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x + 14 * scale, lampY, 60 * scale, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = alpha(color, .85); c.fillRect(x + 10 * scale, lampY - 2 * scale, 8 * scale, 3 * scale);
    // Pool of light on the road under the lamp.
    c.globalAlpha = .16;
    c.fillStyle = color;
    c.beginPath(); c.ellipse(x + 14 * scale, y + 6 * scale, 46 * scale, 12 * scale, 0, 0, TAU); c.fill();
    c.globalAlpha = 1;
  }
  // Traffic: paired headlights receding, plus tail lights.
  for (let i = 0; i < 6; i++) {
    const z = fract(i / 6 + t * .05);
    const side = i % 2 ? 1 : -1;
    const x = vanishX + side * (110 + 430 * z) - 30 * side;
    const y = horizon + z * z * (yEnd - horizon) * .82;
    const s = .1 + z * .8;
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const lx = x + (k ? 9 : -9) * s;
      const g = c.createRadialGradient(lx, y, .5, lx, y, 34 * s);
      g.addColorStop(0, alpha(opts.headlight ?? '#FFD9A0', .55));
      g.addColorStop(1, alpha(opts.headlight ?? '#FFD9A0', 0));
      c.fillStyle = g; c.beginPath(); c.arc(lx, y, 34 * s, 0, TAU); c.fill();
    }
    c.restore();
  }
  // Human silhouettes for scale — small, dark, unmistakably people.
  if (opts.figures !== false) {
    for (let i = 0; i < 7; i++) {
      const z = fract(i / 7 + t * .006 + .13);
      const x = vanishX + (hash(i * 6.1) - .5) * (200 + 900 * z);
      const y = horizon + z * z * (yEnd - horizon) * .74;
      const h = 26 + 74 * z;
      c.fillStyle = alpha('#04070B', .82);
      c.fillRect(x - h * .07, y - h, h * .14, h);
      c.beginPath(); c.arc(x, y - h - h * .07, h * .085, 0, TAU); c.fill();
    }
  }
  c.restore();
}

// ──────────────────────────────────────────────────────────────── light and air
// A volumetric cone needs at least three stacked layers, otherwise it reads as
// a translucent polygon.
export function volumeBeam(c, t, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 120;
  const angle = opts.angle ?? 0;
  const spread = opts.spread ?? 260;
  const length = opts.length ?? 980;
  const color = opts.color ?? palette.mint;
  const strength = opts.strength ?? .18;
  const dust = opts.dust ?? true;
  c.save();
  c.translate(x, y); c.rotate(angle);
  const layers = [
    { s: 1.00, a: strength * .40, w: 1.0 },
    { s: 0.66, a: strength * .55, w: 0.8 },
    { s: 0.30, a: strength * .75, w: 0.6 },
  ];
  c.globalCompositeOperation = 'lighter';
  for (const layer of layers) {
    const half = spread * layer.w;
    const g = c.createLinearGradient(0, 0, 0, length);
    g.addColorStop(0, alpha(color, layer.a));
    g.addColorStop(.55, alpha(color, layer.a * .45));
    g.addColorStop(1, alpha(color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-half * .12, 0); c.lineTo(half * .12, 0);
    c.lineTo(half, length); c.lineTo(-half, length);
    c.closePath(); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  if (dust) {
    // Motes only live inside the cone, which is what sells the volume.
    for (let i = 0; i < 40; i++) {
      const seed = hash(i * 3.7 + x);
      const p = fract(seed + t * (.012 + seed * .02));
      const yy = p * length;
      const spreadNow = spread * (.1 + p * .9);
      const xx = (hash(i * 5.1) - .5) * 2 * spreadNow;
      const sz = .7 + hash(i * 7.3) * 1.9;
      c.globalAlpha = Math.sin(p * Math.PI) * .5 * strength * 2.4;
      c.fillStyle = color;
      c.fillRect(xx, yy, sz, sz);
    }
  }
  c.restore();
}

// Suspended dust with three parallax speeds.
export function dustMotes(c, t, opts = {}) {
  const count = opts.count ?? 60;
  const color = opts.color ?? palette.paper;
  const area = opts.area ?? [0, 0, W, H];
  const speed = opts.speed ?? 1;
  c.save();
  for (let i = 0; i < count; i++) {
    const tier = i % 3;
    const depth = .35 + tier * .33;
    const seed = hash(i * 11.3);
    const x = area[0] + fract(seed * 1.7 + t * (.006 + tier * .012) * speed) * area[2];
    const y = area[1] + fract(hash(i * 13.7) + t * (.012 + tier * .02) * speed + tier * .3) * area[3];
    const sz = (.6 + seed * 1.5) * depth * 2.2;
    c.globalAlpha = (.10 + hash(i * 17.3) * .34) * depth;
    c.fillStyle = color;
    c.fillRect(x, y, sz, sz);
  }
  c.restore();
}

// A soft pool of light on the ground, used to seat characters and props.
export function lightPool(c, t, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 1000;
  const rx = opts.rx ?? 320, ry = opts.ry ?? 62;
  const color = opts.color ?? palette.mint;
  const strength = opts.strength ?? .3;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
  g.addColorStop(0, alpha(color, strength));
  g.addColorStop(.45, alpha(color, strength * .35));
  g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  c.restore();
}

// Contact shadow so the character is standing on something.
export function contactShadow(c, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 1040;
  const rx = opts.rx ?? 180, ry = opts.ry ?? 26;
  const strength = opts.strength ?? .5;
  c.save();
  const g = c.createRadialGradient(x, y, 1, x, y, Math.max(rx, ry));
  g.addColorStop(0, alpha('#04070B', strength));
  g.addColorStop(.6, alpha('#04070B', strength * .45));
  g.addColorStop(1, alpha('#04070B', 0));
  c.fillStyle = g;
  c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  c.restore();
}

// ────────────────────────────────────────────────────────────── foreground layer
// Fast, dark, out-of-focus shapes crossing the lens. Cheapest depth separator
// there is. They read as glass and debris slivers, not as flat black triangles,
// so they never look like drawing errors.
export function foregroundSweep(c, t, opts = {}) {
  const count = opts.count ?? 5;
  const color = opts.color ?? '#04070B';
  const speed = opts.speed ?? .18;
  const scale = opts.scale ?? 1;
  const edge = opts.edge ?? '#1B2A33';
  c.save();
  for (let i = 0; i < count; i++) {
    const seed = hash(i * 19.1 + (opts.seed ?? 0));
    const p = fract(seed + t * speed * (.7 + seed * .6));
    const x = -320 + p * (W + 640);
    const y = (opts.y ?? 520) + (hash(i * 23.3) - .5) * (opts.spreadY ?? 620);
    const len = (120 + hash(i * 29.7) * 260) * scale;
    const wid = (3 + hash(i * 33.1) * 11) * scale;
    const tilt = (hash(i * 37.3) - .5) * .7;
    const alpha = (opts.opacity ?? .82) * Math.sin(p * Math.PI) * .9 + .05;
    c.save();
    c.translate(x, y);
    c.rotate(tilt);
    // Two passes: a soft wide pass and a thin sharp pass give depth-of-field.
    c.globalAlpha = alpha * .45;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-len * .5, -wid * 2.2); c.lineTo(len * .5, -wid * .9);
    c.lineTo(len * .55, wid * 1.1); c.lineTo(-len * .45, wid * 2.4);
    c.closePath(); c.fill();
    c.globalAlpha = alpha;
    c.fillStyle = color;
    c.beginPath();
    c.moveTo(-len * .5, -wid * .6); c.lineTo(len * .5, -wid * .25);
    c.lineTo(len * .52, wid * .3); c.lineTo(-len * .48, wid * .7);
    c.closePath(); c.fill();
    // A single catchlight along the leading edge.
    c.globalAlpha = alpha * .5;
    c.strokeStyle = edge; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-len * .5, -wid * .6); c.lineTo(len * .5, -wid * .25); c.stroke();
    c.restore();
  }
  c.restore();
}

// A near cable or railing that drifts faster than the background.
export function nearCable(c, t, opts = {}) {
  const y = opts.y ?? 150;
  const color = opts.color ?? '#05090E';
  const width = opts.width ?? 7;
  const sway = Math.sin(t * (opts.speed ?? .11)) * (opts.sway ?? 22);
  c.save();
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-60, y);
  c.bezierCurveTo(W * .3, y + 90 + sway, W * .7, y - 70 - sway, W + 60, y + 40 + sway * .5);
  c.stroke();
  if (opts.hairline !== false) {
    c.strokeStyle = alpha(opts.rim ?? palette.mint, .22); c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-60, y - width * .4);
    c.bezierCurveTo(W * .3, y + 90 + sway - width * .4, W * .7, y - 70 - sway - width * .4, W + 60, y + 40 + sway * .5 - width * .4);
    c.stroke();
  }
  c.restore();
}

// ──────────────────────────────────────────────────────────────── data space
// An infinite corridor with a real perspective: walls, ceiling ribs and floor
// all converge on one vanishing point.
export function dataCorridor(c, t, opts = {}) {
  const vx = opts.vanishX ?? 960, vy = opts.vanishY ?? 540;
  const color = opts.color ?? palette.mint;
  const depth = opts.depth ?? 16;
  const speed = opts.speed ?? .09;
  const halfWidth = opts.halfWidth ?? 900;
  const halfHeight = opts.halfHeight ?? 560;
  c.save();
  // Corridor shell: the far end glows so the space has a destination.
  const g = c.createRadialGradient(vx, vy, 10, vx, vy, 1500);
  g.addColorStop(0, alpha(color, .30));
  g.addColorStop(.22, alpha(color, .12));
  g.addColorStop(.60, alpha(color, .035));
  g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.save(); c.globalCompositeOperation = 'lighter';
  const core = c.createRadialGradient(vx, vy, 2, vx, vy, 190);
  core.addColorStop(0, alpha(color, .38)); core.addColorStop(1, alpha(color, 0));
  c.fillStyle = core; c.beginPath(); c.arc(vx, vy, 190, 0, TAU); c.fill();
  c.restore();
  // Ribs marching into the distance.
  for (let i = 0; i < depth; i++) {
    const z = fract(i / depth + t * speed);
    const k = Math.pow(z, 2.1);
    const scale = mix(1, .06, k);
    const w = halfWidth * scale, h = halfHeight * scale;
    c.globalAlpha = Math.sin(z * Math.PI) * .72 + .1;
    c.strokeStyle = color;
    c.lineWidth = Math.max(.7, 2.8 * scale);
    c.strokeRect(vx - w, vy - h, w * 2, h * 2);
    // Corner brackets make each rib read as a structural frame, not a wire box.
    c.globalAlpha *= .85;
    const bl = 90 * scale;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const px = vx + sx * w, py = vy + sy * h;
      c.beginPath();
      c.moveTo(px - sx * bl, py); c.lineTo(px, py); c.lineTo(px, py - sy * bl);
      c.stroke();
    }
    // Data packets travelling along the frame.
    if (i % 2 === 0) {
      const q = fract(t * .6 + i * .37);
      const px = vx - w + q * w * 2, py = vy - h;
      c.globalAlpha = Math.sin(q * Math.PI) * .8;
      c.fillStyle = color;
      c.fillRect(px - 3, py - 2, 6, 4);
    }
  }
  // Longitudinal rails converging on the vanishing point, plus floor and ceiling grids.
  c.globalAlpha = .42;
  for (const [x0, y0] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    c.beginPath();
    c.moveTo(vx + x0 * halfWidth, vy + y0 * halfHeight);
    c.lineTo(vx, vy);
    c.stroke();
  }
  for (const dir of [-1, 1]) {
    c.globalAlpha = .18;
    for (let i = -4; i <= 4; i++) {
      if (i === 0) continue;
      c.beginPath();
      c.moveTo(vx + i * (halfWidth / 4.4), vy + dir * halfHeight);
      c.lineTo(vx, vy);
      c.stroke();
    }
  }
  c.restore();
}

// Suspended terminal window with thickness, an edge highlight and a shadow.
export function floatingPanel(c, t, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 540;
  const w = opts.w ?? 320, h = opts.h ?? 180;
  const color = opts.color ?? palette.mint;
  const seed = opts.seed ?? 1;
  const depth = opts.depth ?? 1;
  c.save();
  c.globalAlpha = (opts.opacity ?? 1) * depth;
  // Backlight so the panel reads as a lit object inside the space.
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 4, x, y, Math.max(w, h) * .9);
  g.addColorStop(0, alpha(color, .16)); g.addColorStop(1, alpha(color, 0));
  c.fillStyle = g; c.fillRect(x - w, y - h, w * 2, h * 2); c.restore();
  // Cast shadow: the panel has to sit in space, not on top of it.
  c.fillStyle = alpha('#04070B', .55);
  c.fillRect(x - w / 2 + 14, y - h / 2 + 18, w, h);
  c.fillStyle = alpha('#08131A', .95);
  c.fillRect(x - w / 2, y - h / 2, w, h);
  // Thickness: a side face and a bottom face.
  c.fillStyle = alpha(color, .14);
  c.beginPath();
  c.moveTo(x + w / 2, y - h / 2); c.lineTo(x + w / 2 + 12 * depth, y - h / 2 + 10 * depth);
  c.lineTo(x + w / 2 + 12 * depth, y + h / 2 + 10 * depth); c.lineTo(x + w / 2, y + h / 2);
  c.closePath(); c.fill();
  c.strokeStyle = alpha(color, .8); c.lineWidth = 1.6;
  c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = alpha(color, .75); c.fillRect(x - w / 2, y - h / 2, w, 22 * depth);
  // Content rows.
  const rows = 4 + Math.floor(hash(seed * 3.3) * 3);
  for (let i = 0; i < rows; i++) {
    const rw = w * (.2 + hash(seed * 5.1 + i) * .62);
    c.fillStyle = alpha(color, .2 + hash(seed * 7.7 + i) * .42);
    c.fillRect(x - w / 2 + 14, y - h / 2 + 40 * depth + i * 18 * depth, rw, 5 * depth);
  }
  // Blinking status cell.
  c.fillStyle = alpha(color, .6 + .4 * Math.abs(Math.sin(t * (1.6 + hash(seed) * 2) + seed)));
  c.fillRect(x + w / 2 - 18, y - h / 2 + 7, 6, 6);
  c.restore();
}

// A giant broken digital clock: seven-segment tubes with missing segments,
// a stalled readout, scan lines and a crack running through the glass.
const SEGMENT_MAP = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg',
  6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '-': 'g', ':': '',
};
export function brokenClock(c, t, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 520;
  const digitW = opts.digitW ?? 92, digitH = opts.digitH ?? 168;
  const color = opts.color ?? palette.white;
  const hour = String(opts.hour ?? 4).padStart(2, '0');
  const minute = String(opts.minute ?? 37).padStart(2, '0');
  const second = String(opts.frozenSecond ?? 12).padStart(2, '0');
  const digits = [...hour, ':', ...minute, ':', ...second];
  const gap = digitW * .38;
  const totalW = digits.length * digitW + (digits.length - 1) * gap;
  c.save();
  c.globalAlpha = opts.opacity ?? .42;
  // Housing.
  c.fillStyle = alpha('#04070B', .55);
  c.fillRect(x - totalW / 2 - 34, y - digitH / 2 - 40, totalW + 68, digitH + 80);
  c.strokeStyle = alpha(color, .3); c.lineWidth = 2;
  c.strokeRect(x - totalW / 2 - 34, y - digitH / 2 - 40, totalW + 68, digitH + 80);
  let cursor = x - totalW / 2;
  digits.forEach((ch, index) => {
    const isSeparator = ch === ':';
    if (isSeparator) {
      c.fillStyle = alpha(color, .8);
      c.fillRect(cursor + digitW * .42, y - digitH * .26, digitW * .16, digitW * .16);
      c.fillRect(cursor + digitW * .42, y + digitH * .12, digitW * .16, digitW * .16);
      cursor += digitW + gap;
      return;
    }
    const lit = SEGMENT_MAP[ch] || '';
    // A few segments are simply gone: the clock is broken, not merely old.
    const broken = hash(index * 7.3 + 3) > .74 ? 'eg' : '';
    const width = digitW, height = digitH, th = digitW * .17;
    const seg = (name, points) => {
      const on = lit.includes(name) && !broken.includes(name);
      const flicker = on && hash(index * 11.7 + name.charCodeAt(0)) > .82 ? (.35 + .65 * Math.abs(Math.sin(t * 3.1 + index))) : 1;
      c.globalAlpha = (opts.opacity ?? .42) * (on ? flicker : .06);
      c.fillStyle = on ? color : alpha(color, .35);
      c.beginPath(); points.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py));
      c.closePath(); c.fill();
    };
    const x0 = cursor, y0 = y - height / 2, x1 = cursor + width, y1 = y + height / 2;
    seg('a', [[x0 + th, y0], [x1 - th, y0], [x1 - th * 1.8, y0 + th * .6], [x1 - th * 1.8, y0 + th * .4], [x0 + th, y0]]);
    seg('b', [[x1, y0 + th * .6], [x1 - th * .6, y0 + th * 1.4], [x1 - th * .4, y0 + th * 1.8], [x1, y1 * 0 + y0 + height / 2 - th * .6], [x1, y0 + th * .6]]);
    seg('c', [[x1, y + th * .6], [x1 - th * .4, y + th * 1.8], [x1 - th * .6, y + height / 2 - th * .6], [x1, y + height / 2 - th * .6], [x1, y + th * .6]]);
    seg('d', [[x0 + th, y1], [x1 - th * 1.8, y1 - th * .4], [x1 - th * 1.8, y1 - th * .6], [x0 + th, y1]]);
    seg('e', [[x0, y + th * .6], [x0 + th * .6, y + th * 1.8], [x0 + th * .4, y + height / 2 - th * .6], [x0, y + height / 2 - th * .6], [x0, y + th * .6]]);
    seg('f', [[x0, y0 + th * .6], [x0 + th * .4, y0 + th * 1.8], [x0 + th * .6, y0 + height / 2 - th * .6], [x0, y0 + height / 2 - th * .6], [x0, y0 + th * .6]]);
    seg('g', [[x0 + th, y], [x1 - th * 1.8, y - th * .4], [x1 - th * 1.8, y + th * .4], [x0 + th, y + th * .6]]);
    cursor += width + gap;
  });
  // Scan lines and a crack through the glass.
  c.globalAlpha = (opts.opacity ?? .42) * .5;
  c.fillStyle = '#04070B';
  for (let yy = y - digitH / 2 - 30; yy < y + digitH / 2 + 30; yy += 5) c.fillRect(x - totalW / 2 - 30, yy, totalW + 60, 1.4);
  c.globalAlpha = (opts.opacity ?? .42) * .8;
  c.strokeStyle = alpha('#D93B4A', .9); c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x - totalW * .38, y - digitH / 2 - 40);
  c.lineTo(x - totalW * .12, y - digitH * .1);
  c.lineTo(x + totalW * .04, y + digitH * .22);
  c.lineTo(x + totalW * .26, y + digitH / 2 + 40);
  c.stroke();
  c.restore();
}

// ──────────────────────────────────────────────────────── laboratory / facility
// Server and monitor racks give the observatory real interior volume.
// They must read against a dark room: a lit bezel, a backlight and individual
// status LEDs do that work, not a slightly different black rectangle.
export function rackWall(c, t, opts = {}) {
  const x = opts.x ?? 0, y = opts.y ?? 0;
  const cols = opts.cols ?? 4, rows = opts.rows ?? 2;
  const cw = opts.cw ?? 150, chh = opts.chh ?? 300;
  const color = opts.color ?? palette.mint;
  c.save();
  for (let cx = 0; cx < cols; cx++) for (let row = 0; row < rows; row++) {
    const rx = x + cx * cw, ry = y + row * chh;
    const seed = cx * 7 + row * 13;
    const w = cw - 8, h = chh - 8;
    // Backlight: the rack is a light source in a dark room.
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(rx + w / 2, ry + h / 2, 4, rx + w / 2, ry + h / 2, w * 1.5);
    g.addColorStop(0, alpha(color, .16)); g.addColorStop(1, alpha(color, 0));
    c.fillStyle = g; c.fillRect(rx - w, ry - h * .5, w * 3, h * 2); c.restore();
    // Casing.
    c.fillStyle = '#0A141A'; c.fillRect(rx, ry, w, h);
    c.strokeStyle = alpha(color, .55); c.lineWidth = 1.6; c.strokeRect(rx, ry, w, h);
    c.fillStyle = alpha(color, .30); c.fillRect(rx, ry, w, 3);
    // Blade servers: slot lines with individual status LEDs.
    const slots = 9 + Math.floor(hash(seed * 3.1) * 5);
    for (let i = 0; i < slots; i++) {
      const sy = ry + 16 + i * ((h - 34) / slots);
      const sh = (h - 34) / slots - 4;
      c.fillStyle = '#0E1D24'; c.fillRect(rx + 9, sy, w - 18, sh);
      c.fillStyle = alpha(color, .26 + hash(seed * 5.3 + i) * .42);
      c.fillRect(rx + 13, sy + 3, (w - 40) * (.3 + hash(seed * 7.7 + i) * .5), Math.max(2, sh * .26));
      const lit = hash(seed * 11.3 + i);
      if (lit > .42) {
        c.fillStyle = alpha(lit > .84 ? '#D93B4A' : color, .45 + .55 * Math.abs(Math.sin(t * (1.2 + lit * 4) + i)));
        c.fillRect(rx + w - 24, sy + 3, 4, 4);
      }
      if (lit > .88) {
        c.fillStyle = alpha('#D93B4A', .5); c.fillRect(rx + w - 34, sy + 3, 6, 4);
      }
    }
    // Vent grille along the bottom.
    c.globalAlpha = .4;
    for (let i = 0; i < 14; i++) { c.fillStyle = color; c.fillRect(rx + 12 + i * ((w - 24) / 14), ry + h - 14, Math.max(2, (w - 24) / 22), 7); }
    c.globalAlpha = 1;
  }
  c.restore();
}

// A bank of monitors where every screen shows different content.
export function monitorWall(c, t, opts = {}) {
  const x = opts.x ?? 0, y = opts.y ?? 0;
  const cols = opts.cols ?? 3, rows = opts.rows ?? 2;
  const cw = opts.cw ?? 220, chh = opts.chh ?? 140;
  const color = opts.color ?? palette.mint;
  c.save();
  for (let cx = 0; cx < cols; cx++) for (let row = 0; row < rows; row++) {
    const rx = x + cx * cw, ry = y + row * chh;
    const seed = cx * 17 + row * 29;
    const kind = Math.floor(hash(seed * 3.7) * 4);
    const bad = hash(seed * 5.9) > .74;
    const w = cw - 6, h = chh - 6;
    // Screen backlight bleeds into the room.
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(rx + w / 2, ry + h / 2, 3, rx + w / 2, ry + h / 2, w * 1.3);
    g.addColorStop(0, alpha(bad ? '#D93B4A' : color, .20)); g.addColorStop(1, alpha(color, 0));
    c.fillStyle = g; c.fillRect(rx - w * .7, ry - h * .7, w * 2.4, h * 2.4); c.restore();
    // Bezel and glass.
    c.fillStyle = '#060D12'; c.fillRect(rx, ry, w, h);
    c.strokeStyle = alpha(color, bad ? .78 : .6); c.lineWidth = 1.8; c.strokeRect(rx, ry, w, h);
    const inner = { x: rx + 8, y: ry + 8, w: w - 16, h: h - 16 };
    c.save(); c.beginPath(); c.rect(inner.x, inner.y, inner.w, inner.h); c.clip();
    c.fillStyle = alpha(bad ? '#2A0810' : '#071419', .92); c.fillRect(inner.x, inner.y, inner.w, inner.h);
    if (kind === 0) {
      // Trace scope.
      c.strokeStyle = alpha(color, .95); c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i <= 60; i++) {
        const px = inner.x + i / 60 * inner.w;
        const py = inner.y + inner.h * .5 + Math.sin(i * .35 + t * 2.2 + seed) * inner.h * .3 * (bad ? 1.8 : 1);
        i ? c.lineTo(px, py) : c.moveTo(px, py);
      }
      c.stroke();
    } else if (kind === 1) {
      // Bar readout.
      for (let i = 0; i < 12; i++) {
        const bh = (inner.h - 12) * (.15 + hash(seed * 7.3 + i) * .85);
        c.fillStyle = alpha(color, .3 + hash(seed * 11.1 + i) * .6);
        c.fillRect(inner.x + 5 + i * (inner.w / 12), inner.y + inner.h - bh, inner.w / 12 - 3, bh);
      }
    } else if (kind === 2) {
      // Text rows.
      for (let i = 0; i < 7; i++) {
        const rw = inner.w * (.25 + hash(seed * 13.7 + i) * .7);
        c.fillStyle = alpha(color, .28 + hash(seed * 17.3 + i) * .55);
        c.fillRect(inner.x + 4, inner.y + 6 + i * (inner.h / 8), rw, 3.6);
      }
    } else {
      // Radar sweep.
      const a = t * (bad ? 2.4 : .8) + seed;
      c.strokeStyle = alpha(color, .5); c.lineWidth = 1;
      for (let r = 8; r < inner.w * .7; r += 12) { c.beginPath(); c.arc(inner.x + inner.w / 2, inner.y + inner.h / 2, r, 0, TAU); c.stroke(); }
      c.strokeStyle = alpha(color, .95); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(inner.x + inner.w / 2, inner.y + inner.h / 2);
      c.lineTo(inner.x + inner.w / 2 + Math.cos(a) * inner.w, inner.y + inner.h / 2 + Math.sin(a) * inner.h); c.stroke();
    }
    if (bad) {
      // Rolling bar: a broken scan line across a failing screen.
      const sy = inner.y + fract(t * .27 + seed) * inner.h;
      c.fillStyle = alpha('#D93B4A', .45); c.fillRect(inner.x, sy, inner.w, 3);
    }
    // Scanline texture over every screen.
    c.globalAlpha = .12; c.fillStyle = '#000000';
    for (let y2 = inner.y; y2 < inner.y + inner.h; y2 += 4) c.fillRect(inner.x, y2, inner.w, 1);
    c.restore();
    // Glass reflection.
    c.fillStyle = alpha(palette.paper, .07);
    c.beginPath(); c.moveTo(rx, ry); c.lineTo(rx + cw * .4, ry); c.lineTo(rx, ry + chh * .5); c.closePath(); c.fill();
  }
  c.restore();
}

// Truss: two chords and diagonal web members, with visible node plates.
export function truss(c, t, opts = {}) {
  const x0 = opts.x0 ?? 0, x1 = opts.x1 ?? W;
  const yTop = opts.yTop ?? 40, yBottom = opts.yBottom ?? 130;
  const bays = opts.bays ?? 12;
  const color = opts.color ?? '#1D353B';
  const rim = opts.rim ?? palette.mint;
  c.save();
  c.strokeStyle = color; c.lineWidth = opts.width ?? 7;
  c.beginPath(); c.moveTo(x0, yTop); c.lineTo(x1, yTop); c.moveTo(x0, yBottom); c.lineTo(x1, yBottom); c.stroke();
  c.lineWidth = opts.web ?? 3.4;
  for (let i = 0; i < bays; i++) {
    const a = mix(x0, x1, i / bays), b = mix(x0, x1, (i + 1) / bays);
    c.beginPath();
    if (i % 2) { c.moveTo(a, yTop); c.lineTo(b, yBottom); }
    else { c.moveTo(a, yBottom); c.lineTo(b, yTop); }
    c.stroke();
    // Node plates.
    c.fillStyle = alpha(color, 1);
    c.fillRect(b - 3, yTop - 3, 6, 6);
    c.fillRect(b - 3, yBottom - 3, 6, 6);
  }
  c.strokeStyle = alpha(rim, .18); c.lineWidth = 1;
  c.beginPath(); c.moveTo(x0, yTop - opts.width * .4); c.lineTo(x1, yTop - opts.width * .4); c.stroke();
  c.restore();
}

// A foreground console lip: the desk the character is sitting at.
export function consoleLip(c, t, opts = {}) {
  const y = opts.y ?? 980;
  const color = opts.color ?? '#0C171D';
  const rim = opts.rim ?? palette.mint;
  c.save();
  path(c, [[-60, y + 130], [W + 60, y + 130], [W + 60, y + 30], [W * .74, y - 26], [W * .26, y - 26], [-60, y + 30]], color, true);
  path(c, [[-60, y + 30], [W * .26, y - 26], [W * .74, y - 26], [W + 60, y + 30], [W + 60, y + 48], [W * .74, y - 8], [W * .26, y - 8], [-60, y + 48]], '#16272E', true);
  c.strokeStyle = alpha(rim, .3); c.lineWidth = 1.4;
  c.beginPath(); c.moveTo(-60, y + 30); c.lineTo(W * .26, y - 26); c.lineTo(W * .74, y - 26); c.lineTo(W + 60, y + 30); c.stroke();
  c.restore();
}

// ──────────────────────────────────────────────────────────── sky and ruins
// An enormous red sun with torn cloud bands crossing it.
export function redSun(c, t, opts = {}) {
  const x = opts.x ?? 960, y = opts.y ?? 380, r = opts.r ?? 420;
  const color = opts.color ?? '#D93B4A';
  const halo = opts.halo ?? '#FF7A4A';
  c.save();
  c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, r * .1, x, y, r * 2.1);
  g.addColorStop(0, alpha(halo, .55)); g.addColorStop(.32, alpha(halo, .18)); g.addColorStop(1, alpha(halo, 0));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 2.1, 0, TAU); c.fill();
  c.globalCompositeOperation = 'source-over';
  const body = c.createRadialGradient(x, y - r * .2, r * .1, x, y, r);
  body.addColorStop(0, alpha(mixHex(color, '#FFD2A0', .45), .95));
  body.addColorStop(.62, alpha(color, .92));
  body.addColorStop(1, alpha(mixHex(color, '#3C1115', .55), .9));
  c.fillStyle = body; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  // Dark striations across the disc.
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  for (let i = 0; i < 9; i++) {
    const yy = y - r + i * r / 4.2 + Math.sin(t * .12 + i) * 4;
    c.fillStyle = alpha('#2A0B10', .10 + hash(i * 3.3) * .12);
    c.fillRect(x - r, yy, r * 2, 5 + hash(i * 5.7) * 13);
  }
  c.restore();
  c.restore();
}

// Cloud bands torn into strips, drifting at their own speed.
export function tornClouds(c, t, opts = {}) {
  const y = opts.y ?? 300;
  const count = opts.count ?? 9;
  const color = opts.color ?? '#2A0C12';
  const width = opts.width ?? 1700;
  c.save();
  for (let i = 0; i < count; i++) {
    const seed = hash(i * 13.1);
    const yy = y + (i - count / 2) * (opts.gap ?? 46) + Math.sin(t * .09 + i) * 5;
    const drift = fract(seed + t * (.004 + seed * .01));
    const x = -width + drift * (W + width * 2);
    const h = 8 + seed * 26;
    c.globalAlpha = .3 + seed * .4;
    c.fillStyle = color;
    // Torn ends: the strip is not a clean rectangle.
    c.beginPath();
    c.moveTo(x, yy);
    c.lineTo(x + width * (.5 + seed * .5), yy - h * .5);
    c.lineTo(x + width, yy + h * .2);
    c.lineTo(x + width * (.8 + seed * .2), yy + h);
    c.lineTo(x + width * .3, yy + h * .7);
    c.closePath(); c.fill();
  }
  c.restore();
}

// Zero-gravity debris: building chunks and street slabs drifting slowly.
export function floatingRubble(c, t, opts = {}) {
  const count = opts.count ?? 12;
  const color = opts.fill ?? '#0A1116';
  const rim = opts.rim ?? palette.mint;
  c.save();
  for (let i = 0; i < count; i++) {
    const seed = hash(i * 7.7 + (opts.seed ?? 0));
    const depth = .25 + (i % 3) * .37;
    const x = opts.x0 + fract(seed * 1.3 + t * (.006 + depth * .01)) * (opts.x1 - opts.x0);
    const y = opts.y0 + fract(hash(i * 11.9) + t * (.004 + depth * .008)) * (opts.y1 - opts.y0);
    const s = (26 + seed * 120) * depth;
    c.save();
    c.translate(x, y);
    c.rotate(seed * TAU + t * (.05 + depth * .1));
    c.globalAlpha = (.45 + depth * .55) * (opts.opacity ?? 1);
    c.fillStyle = color;
    c.fillRect(-s * .5, -s * .16, s, s * .32);
    c.fillStyle = alpha(rim, .22);
    c.fillRect(-s * .5, -s * .16, s, 1.6);
    // A fragment of road with a lane marking still attached.
    if (i % 4 === 0) {
      c.fillStyle = alpha('#ED8B50', .3);
      c.fillRect(-s * .3, -s * .03, s * .22, 1.6);
    }
    c.restore();
  }
  c.restore();
}

// ─────────────────────────────────────────────────────── information space
// Designed, not random: every element shares a grid, a type scale and a colour rule.
export function warningBar(c, t, opts = {}) {
  const x = opts.x ?? 120, y = opts.y ?? 180;
  const w = opts.w ?? 520, h = opts.h ?? 46;
  const color = opts.color ?? palette.orange;
  const text = opts.text ?? 'THERMAL EXCEEDED';
  c.save();
  c.globalAlpha = opts.opacity ?? .9;
  c.fillStyle = alpha(color, .14); c.fillRect(x, y, w, h);
  c.fillStyle = color; c.fillRect(x, y, 5, h);
  // Hazard chevrons on the right edge.
  for (let i = 0; i < 8; i++) {
    c.fillStyle = alpha(color, i % 2 ? .5 : .16);
    c.beginPath();
    c.moveTo(x + w - 74 + i * 9, y); c.lineTo(x + w - 66 + i * 9, y);
    c.lineTo(x + w - 74 + i * 9, y + h); c.lineTo(x + w - 82 + i * 9, y + h);
    c.closePath(); c.fill();
  }
  c.fillStyle = color;
  c.font = `600 ${Math.round(h * .42)}px Consolas, monospace`;
  c.textBaseline = 'middle';
  c.fillText(text, x + 18, y + h * .54);
  c.textBaseline = 'alphabetic';
  c.restore();
}

// A scrolling error ticker that reads as a designed strip, not random digits.
export function errorTicker(c, t, opts = {}) {
  const x = opts.x ?? 0, y = opts.y ?? 0, w = opts.w ?? W;
  const h = opts.h ?? 26;
  const color = opts.color ?? palette.white;
  const speed = opts.speed ?? 34;
  const strings = opts.strings ?? ['THERMAL FAILURE', 'PACKET LOSS 0x2F', 'CHECKSUM MISMATCH', 'RELAY OFFLINE', 'DEAD VARIABLE', 'SIGNAL LOST'];
  c.save();
  c.globalAlpha = opts.opacity ?? .55;
  c.fillStyle = alpha('#04070B', .5); c.fillRect(x, y, w, h);
  c.fillStyle = alpha(color, .35); c.fillRect(x, y, w, 1);
  const total = strings.join('   ///   ');
  const offset = (t * speed) % (total.length * 9);
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = color;
  c.font = `${Math.round(h * .58)}px Consolas, monospace`;
  c.textBaseline = 'middle';
  const scroll = strings.map(s => `${s}   ///   `).join('');
  const full = scroll + scroll;
  c.fillText(full, x - offset, y + h * .56);
  c.textBaseline = 'alphabetic';
  c.restore();
}

// Instrument chart: grid, axis ticks and a live curve.
export function instrumentTrace(c, t, opts = {}) {
  const x = opts.x ?? 120, y = opts.y ?? 700, w = opts.w ?? 520, h = opts.h ?? 160;
  const color = opts.color ?? palette.mint;
  c.save();
  c.globalAlpha = opts.opacity ?? .7;
  c.strokeStyle = alpha(color, .22); c.lineWidth = 1;
  for (let i = 0; i <= 8; i++) { const px = x + i / 8 * w; line(c, px, y, px, y + h, alpha(color, .18), .8); }
  for (let i = 0; i <= 4; i++) { const py = y + i / 4 * h; line(c, x, py, x + w, py, alpha(color, .18), .8); }
  c.strokeStyle = color; c.lineWidth = 1.5;
  c.beginPath();
  for (let i = 0; i <= 120; i++) {
    const px = x + i / 120 * w;
    const q = i / 120;
    const py = y + h * (.5 - Math.sin(q * 9 + t * 2.4) * .22 * (opts.volatility ?? 1) - q * (opts.drift ?? .12));
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.stroke();
  c.fillStyle = alpha(color, .8);
  const tipX = x + w, tipY = y + h * (.5 - Math.sin(9 + t * 2.4) * .22 * (opts.volatility ?? 1) - (opts.drift ?? .12));
  c.fillRect(tipX - 4, tipY - 4, 8, 8);
  c.restore();
}

// Split screen: several synchronised views inside one frame.
export function splitPanels(c, t, opts = {}) {
  const x = opts.x ?? 120, y = opts.y ?? 120, w = opts.w ?? 520, h = opts.h ?? 300;
  const cols = opts.cols ?? 2, rows = opts.rows ?? 2;
  const color = opts.color ?? palette.mint;
  const pw = w / cols, ph = h / rows;
  c.save();
  for (let cx = 0; cx < cols; cx++) for (let ry = 0; ry < rows; ry++) {
    const px = x + cx * pw, py = y + ry * ph;
    const seed = cx * 11 + ry * 23;
    c.save();
    c.beginPath(); c.rect(px + 3, py + 3, pw - 8, ph - 8); c.clip();
    c.fillStyle = alpha('#050A0E', .82); c.fillRect(px, py, pw, ph);
    const kind = Math.floor(hash(seed * 5.1) * 3);
    if (kind === 0) {
      for (let i = 0; i < 6; i++) {
        c.fillStyle = alpha(color, .12 + hash(seed + i) * .28);
        c.fillRect(px + 12, py + 14 + i * (ph / 7), (pw - 26) * (.3 + hash(seed * 3 + i) * .6), 3.4);
      }
    } else if (kind === 1) {
      c.strokeStyle = alpha(color, .6); c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i <= 40; i++) {
        const qx = px + i / 40 * pw, qy = py + ph * .5 + Math.sin(i * .4 + t * 1.6 + seed) * ph * .28;
        i ? c.lineTo(qx, qy) : c.moveTo(qx, qy);
      }
      c.stroke();
    } else {
      c.fillStyle = alpha(color, .3);
      c.beginPath(); c.arc(px + pw / 2, py + ph / 2, Math.min(pw, ph) * (.22 + .08 * Math.sin(t + seed)), 0, TAU); c.fill();
    }
    c.restore();
    c.strokeStyle = alpha(color, .45); c.lineWidth = 1.1;
    c.strokeRect(px + 3, py + 3, pw - 8, ph - 8);
    c.fillStyle = alpha(color, .7);
    c.font = '11px Consolas, monospace';
    c.fillText(`CH-${String(seed % 9 + 1).padStart(2, '0')}`, px + 10, py + 18);
  }
  c.restore();
}

// ───────────────────────────────────────────────────────────────── music state
// Scene art has to react to the song, but only through the same deterministic
// feature track the rest of the film already uses.
export function musicState(data, t) {
  const f = data?.features || {};
  const rate = f.featureRate || 20;
  const idx = clamp(Math.floor(t * rate), 0, (f.envelope?.length || 1) - 1);
  const envelope = f.envelope?.[idx] ?? 0;
  const low = f.low?.[idx] ?? 0;
  const high = f.high?.[idx] ?? 0;
  const onsets = f.onsetTimes || [];
  let lo = 0, hi = onsets.length;
  while (lo < hi) { const m = (lo + hi) >>> 1; if (onsets[m] <= t) lo = m + 1; else hi = m; }
  const last = onsets[lo - 1];
  const age = last == null ? 99 : t - last;
  const onset = age >= 0 && age < .3 ? Math.exp(-age * 12) : 0;
  return {
    envelope, low, high, onset,
    onsetIndex: lo,
    energy: clamp(envelope * 1.6),
    bar: fract(t / 2.0),
    beat: fract(t / .5),
    // A 0..1 rise across the whole track: used for slow corruption creep.
    drift: clamp(t / (data?.config?.duration || 242)),
  };
}

// ─────────────────────────────────────────────────────────── layer composition
// data/scene_layers.json describes the environment stack of each scene theme.
// The composer draws them back to front and applies the per-layer parallax.

// 城市地面：一整片可读的地平面，而不是一条看不见的深色楔形。
// 路缘、透视砖缝、积水倒影、废弃车辆、瓦砾、地面雾带——城市因此有了地。
export function cityGround(c, t, opts = {}) {
  const horizon = opts.horizon ?? 700;
  const vanishX = opts.vanishX ?? 960;
  const color = opts.color ?? '#1A0E16';
  const deep = opts.deep ?? '#08040A';
  const rim = opts.rim ?? palette.mint;
  const seam = opts.seam ?? rim;
  const yEnd = opts.yEnd ?? H;
  c.save();
  // 地平面：从地平线到画面下缘铺满整个宽度。
  const g = c.createLinearGradient(0, horizon, 0, yEnd);
  g.addColorStop(0, alpha(opts.near ?? color, .95));
  g.addColorStop(.34, color);
  g.addColorStop(1, deep);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, horizon); c.lineTo(W, horizon); c.lineTo(W, yEnd); c.lineTo(0, yEnd); c.closePath(); c.fill();
  // 地平线处的高光：地面与远景之间的接缝
  c.fillStyle = alpha(rim, .30); c.fillRect(0, horizon - 2, W, 2.4);
  // 透视砖缝：稀疏、越近越淡，不能变成坐标纸
  c.globalAlpha = .22; c.strokeStyle = seam; c.lineWidth = 1;
  for (let i = -7; i <= 7; i++) {
    const x = vanishX + i * 250;
    c.beginPath(); c.moveTo(vanishX + i * 9, horizon); c.lineTo(x, yEnd); c.stroke();
  }
  // 横向分缝：断续的，而不是一条贯通全幅的直线
  for (let j = 1; j < 7; j++) {
    const z = j / 7, y = horizon + Math.pow(z, 2.1) * (yEnd - horizon);
    c.globalAlpha = .13 * (1 - z * .5);
    for (let k = 0; k < 5; k++) {
      const x0 = hash(j * 7.3 + k * 3.1) * W, w = 90 + hash(j * 5.7 + k) * 260;
      c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + w, y); c.stroke();
    }
  }
  // 路缘：一条明确的地平面边界
  c.globalAlpha = .26; c.strokeStyle = seam; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, horizon + 3); c.lineTo(W, horizon + 3); c.stroke();
  // 积水：把天空色反在地上，城市与天空因此连成一体
  c.globalAlpha = .30;
  for (let i = 0; i < 9; i++) {
    const x = hash(i * 4.7) * W, w = 60 + hash(i * 8.1) * 240, h = 8 + hash(i * 9.3) * 26;
    const y = horizon + 30 + hash(i * 3.3) * (yEnd - horizon - 60);
    const pg = c.createLinearGradient(0, y, 0, y + h);
    pg.addColorStop(0, alpha(rim, .5)); pg.addColorStop(1, alpha(rim, 0));
    c.fillStyle = pg;
    c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); c.fill();
  }
  // 废弃车辆：给地面一个可信的尺度
  for (let i = 0; i < 5; i++) {
    const z = hash(i * 7.7);
    const x = hash(i * 11.3) * W, y = horizon + 60 + z * (yEnd - horizon - 120);
    const s = .5 + z * 1.5;
    c.globalAlpha = .88;
    c.fillStyle = alpha('#04070B', .92);
    // 车体 + 收窄的车顶 + 轮子：像一辆废弃的车，而不是一个箱子
    c.beginPath();
    c.moveTo(x - 44 * s, y + 14 * s); c.lineTo(x + 44 * s, y + 14 * s);
    c.lineTo(x + 42 * s, y - 8 * s); c.lineTo(x + 24 * s, y - 10 * s);
    c.lineTo(x + 16 * s, y - 26 * s); c.lineTo(x - 16 * s, y - 26 * s);
    c.lineTo(x - 26 * s, y - 10 * s); c.lineTo(x - 42 * s, y - 8 * s);
    c.closePath(); c.fill();
    c.fillStyle = alpha('#000000', .95);
    c.beginPath(); c.ellipse(x - 26 * s, y + 15 * s, 9 * s, 5 * s, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(x + 26 * s, y + 15 * s, 9 * s, 5 * s, 0, 0, TAU); c.fill();
    c.fillStyle = alpha(rim, .26); c.fillRect(x - 42 * s, y - 9 * s, 84 * s, 1.4);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const lx = x + (k ? 32 : -32) * s;
      const lg = c.createRadialGradient(lx, y, .5, lx, y, 26 * s);
      lg.addColorStop(0, alpha(rim, .35)); lg.addColorStop(1, alpha(rim, 0));
      c.fillStyle = lg; c.beginPath(); c.arc(lx, y, 26 * s, 0, TAU); c.fill();
    }
    c.restore();
  }
  // 瓦砾
  c.globalAlpha = .8;
  for (let i = 0; i < 40; i++) {
    const x = hash(i * 13.1) * W, y = horizon + 40 + hash(i * 17.3) * (yEnd - horizon - 60);
    const s = 2 + hash(i * 19.7) * 9;
    c.fillStyle = alpha('#04070B', .8);
    c.save(); c.translate(x, y); c.rotate(hash(i * 23.1) * TAU);
    c.fillRect(-s, -s * .3, s * 2, s * .6); c.restore();
  }
  // 地面雾带：楼脚与地面之间要有空气
  c.globalAlpha = 1;
  const haze = c.createLinearGradient(0, horizon - 26, 0, horizon + 60);
  haze.addColorStop(0, alpha(opts.haze ?? color, .5)); haze.addColorStop(1, alpha(opts.haze ?? color, 0));
  c.fillStyle = haze; c.fillRect(0, horizon - 26, W, 86);
  c.restore();
}

// 高架桥：横穿画面的结构物，城市因此有了"层"而不只是楼。
export function elevatedRoad(c, t, opts = {}) {
  const y = opts.y ?? 470;
  const color = opts.color ?? '#04070B';
  const rim = opts.rim ?? palette.mint;
  const speed = opts.speed ?? 26;
  c.save();
  const deck = opts.deck ?? 46;
  c.save();
  c.globalAlpha = .92;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(-40, y); c.lineTo(W + 40, y - 54); c.lineTo(W + 40, y - 54 + deck * .55); c.lineTo(-40, y + deck * .55);
  c.closePath(); c.fill();
  // 桥面下的桁架：结构感而不是一块黑板
  c.globalAlpha = .55; c.strokeStyle = alpha(rim, .3); c.lineWidth = 1.2;
  for (let x = -40; x < W + 40; x += 56) {
    const yy = y - 54 * (x / W);
    c.beginPath(); c.moveTo(x, yy + deck * .55); c.lineTo(x + 28, yy + deck * .55 + 16); c.stroke();
  }
  c.globalAlpha = 1;
  c.fillStyle = alpha(rim, .42); c.fillRect(-40, y - 2, W + 80, 2.4);
  c.fillStyle = alpha(rim, .14); c.fillRect(-40, y + deck * .55 - 2, W + 80, 2);
  c.restore();
  // 桥墩
  for (let i = 0; i < 7; i++) {
    const x = 90 + i * 285, top = y - 54 * (x / W) + deck;
    c.fillStyle = color; c.fillRect(x, top, 26, H - top);
    c.fillStyle = alpha(rim, .16); c.fillRect(x, top, 2.4, H - top);
  }
  // 桥上的车灯
  for (let i = 0; i < 8; i++) {
    const p = fract(hash(i * 5.3) + t * speed / W);
    const x = p * (W + 200) - 100;
    const yy = y - 54 * (x / W) + 12;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(x, yy, .5, x, yy, 22);
    g.addColorStop(0, alpha(i % 3 ? rim : '#FFD2A0', .6)); g.addColorStop(1, alpha(rim, 0));
    c.fillStyle = g; c.beginPath(); c.arc(x, yy, 22, 0, TAU); c.fill();
    c.restore();
  }
  c.restore();
}

// 混合业态的天际线：一排楼里同时出现玻璃塔、住宅楼、厂房与地标尖塔。
export function cityDistrict(c, t, opts = {}) {
  const step = opts.step ?? 160;
  const x0 = opts.x0 ?? -280, x1 = opts.x1 ?? W + 280;
  const baseY = opts.baseY ?? 700;
  const scroll = opts.scroll ?? 4;
  const depth = opts.depth ?? 1;
  const count = Math.ceil((x1 - x0) / step) + 2;
  const offset = (t * scroll) % step;
  const styles = opts.styles ?? ['tower', 'block', 'block', 'shed', 'tower', 'spire', 'block'];
  for (let i = -1; i < count; i++) {
    const seed = (opts.seed ?? 1) + i * 17 + (opts.seedOffset ?? 0);
    const x = x0 + i * step - offset + hash(seed * 2.1) * 30;
    const style = styles[Math.floor(hash(seed * 6.3) * styles.length)];
    const tall = style === 'tower' || style === 'spire';
    const w = (tall ? .55 : .95) * ((opts.w ?? [46, 118])[0] + hash(seed * 3.3) * ((opts.w ?? [46, 118])[1] - (opts.w ?? [46, 118])[0]));
    const h = (tall ? 1.55 : .85) * ((opts.h ?? [140, 420])[0] + hash(seed * 5.9) * ((opts.h ?? [140, 420])[1] - (opts.h ?? [140, 420])[0]));
    drawBuilding(c, t, {
      seed, x, baseY, w, h, style,
      fill: opts.fill ?? '#04070B',
      rim: opts.rim ?? palette.mint,
      ruin: (opts.ruin ?? 0) * depth,
      lit: (opts.lit ?? .32) * depth,
      opacity: opts.opacity ?? 1,
      lightDir: x < W / 2 ? 1 : -1,
      windows: opts.windows,
    });
  }
}

const LAYER_DISPATCH = {
  sky: (c, t, o) => citySky(c, t, o),
  ground: (c, t, o) => cityGround(c, t, o),
  district: (c, t, o) => cityDistrict(c, t, o),
  elevated: (c, t, o) => elevatedRoad(c, t, o),
  haze: (c, t, o, ctx) => depthHaze(c, t, o),
  stars: (c, t, o) => {
    const n = o.count ?? 160;
    c.save();
    for (let i = 0; i < n; i++) {
      c.globalAlpha = .12 + hash(i + 33) * .4;
      c.fillStyle = o.color ?? palette.white;
      c.fillRect(fract(hash(i * 4 + 2) + t * .0005) * W, (hash(i * 7 + 3) * 700 + t * .3) % 700, hash(i) > .95 ? 2 : 1, 1);
    }
    c.restore();
  },
  skyline: (c, t, o) => cityRow(c, t, o),
  street: (c, t, o) => streetGround(c, t, o),
  props: (c, t, o) => streetProps(c, t, o),
  beam: (c, t, o) => volumeBeam(c, t, o),
  dust: (c, t, o) => dustMotes(c, t, o),
  pool: (c, t, o) => lightPool(c, t, o),
  sun: (c, t, o) => redSun(c, t, o),
  clouds: (c, t, o) => tornClouds(c, t, o),
  rubble: (c, t, o) => floatingRubble(c, t, o),
  corridor: (c, t, o) => dataCorridor(c, t, o),
  panels: (c, t, o) => {
    const n = o.count ?? 5;
    for (let i = 0; i < n; i++) {
      const seed = i * 7 + (o.seed ?? 0);
      const z = fract(seed * .37 + t * (o.speed ?? .04));
      const depth = mix(.35, 1, z);
      floatingPanel(c, t, {
        x: mix(o.x0 ?? 120, o.x1 ?? 1800, hash(seed * 3.1)),
        y: mix(o.y0 ?? 160, o.y1 ?? 900, hash(seed * 5.7)),
        w: (o.w ?? 300) * depth, h: (o.h ?? 170) * depth,
        color: o.color, seed, depth, opacity: o.opacity,
      });
    }
  },
  clock: (c, t, o) => brokenClock(c, t, o),
  racks: (c, t, o) => rackWall(c, t, o),
  monitors: (c, t, o) => monitorWall(c, t, o),
  truss: (c, t, o) => truss(c, t, o),
  console: (c, t, o) => consoleLip(c, t, o),
  occluder: (c, t, o) => foregroundSweep(c, t, o),
  cable: (c, t, o) => nearCable(c, t, o),
  ticker: (c, t, o) => errorTicker(c, t, o),
  banner: (c, t, o) => warningBar(c, t, o),
  trace: (c, t, o) => instrumentTrace(c, t, o),
  split: (c, t, o) => splitPanels(c, t, o),
  shadow: (c, t, o) => contactShadow(c, o),
};

// Draw one layer with its parallax offset applied.
export function drawLayer(c, t, layer, ctx = {}) {
  // Scene-specific layers extend the built-in set; they never replace it.
  const fn = { ...LAYER_DISPATCH, ...(ctx.dispatch || {}) }[layer.kind];
  if (!fn) return;
  const parallax = layer.parallax ?? 0;
  c.save();
  if (parallax) {
    // Parallax comes from the scene's own travel, so a dolly through a scene
    // separates the layers instead of sliding them all at one speed.
    const travel = ctx.travel ?? 0;
    c.translate(-travel * parallax, 0);
  }
  if (layer.opacity != null) c.globalAlpha *= layer.opacity;
  fn(c, t, { ...(layer.opts || {}), ...(ctx.overrides?.[layer.kind] || {}) }, ctx);
  c.restore();
}

// Draw the environment stack of a theme. `zone` splits the stack into the part
// drawn behind the subject and the part drawn in front of it.
export function composeLayers(c, t, table, theme, ctx = {}) {
  const entry = table?.[String(theme)];
  if (!entry) return;
  for (const layer of entry.layers || []) {
    if ((layer.zone || 'back') !== 'back') continue;
    drawLayer(c, t, { ...layer, opts: { ...(layer.opts || {}), ...(ctx.overrides?.[layer.kind] || {}) } }, ctx);
  }
}

// Draw the foreground zone: occluders, near cables, foreground consoles.
export function composeForeground(c, t, table, theme, ctx = {}) {
  const entry = table?.[String(theme)];
  if (!entry) return;
  for (const layer of entry.layers || []) {
    if (layer.zone !== 'front') continue;
    drawLayer(c, t, { ...layer, opts: { ...(layer.opts || {}), ...(ctx.overrides?.[layer.kind] || {}) } }, ctx);
  }
}

// Read the layer table once; the file is optional so the film still runs without it.
export function layerTableFrom(json) {
  if (!json) return {};
  if (json.themes) return json.themes;
  return json;
}
