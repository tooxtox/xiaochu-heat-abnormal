// Narrative scenery and insert shots, evaluated directly from song time.
// The environment art lives here and in scene_layers.mjs; nothing in this file
// depends on frame history or wall-clock time.
import { palette } from './palette.mjs';
import { drawGradedImage } from './character_fx.mjs';
import {
  drawBuilding, cityRow, cityDistrict, cityGround, elevatedRoad, streetGround, streetProps, depthHaze, volumeBeam, dustMotes,
  lightPool, contactShadow, foregroundSweep, floatingRubble, mixHex, citySky,
} from './scene_layers.mjs';
export { citySky };

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const fract = x => x - Math.floor(x);
const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
function path(c, points, color, fill = false, w = 1) {
  c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  if (fill) { c.closePath(); c.fillStyle = color; c.fill(); }
  else { c.strokeStyle = color; c.lineWidth = w; c.stroke(); }
}
function line(c, x, y, X, Y, color, w = 1) { path(c, [[x, y], [X, Y]], color, false, w); }
function circle(c, x, y, r, color, w = 1) { c.beginPath(); c.arc(x, y, Math.max(.01, r), 0, TAU); c.strokeStyle = color; c.lineWidth = w; c.stroke(); }
function label(c, s, x, y, size = 18, color = palette.mint) { c.font = `${size}px ${/[^\x00-\x7F]/.test(s) ? '"Noto Serif JP",serif' : 'Consolas,monospace'}`; c.fillStyle = color; c.fillText(s, x, y); }
// #RRGGBB -> rgba()，用于天空、辉光与轮廓光的透明度控制。
function alpha(hex, a) { const h = String(hex).replace('#', ''); const n = h.length === 3 ? h.split('').map(x => x + x).join('') : h; const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16); return `rgba(${r},${g},${b},${a})`; }
function starfield(c, t, n = 180) { for (let i = 0; i < n; i++) { c.globalAlpha = .15 + hash(i + 33) * .42; c.fillStyle = '#C8CCD1'; c.fillRect(fract(hash(i * 4 + 2) + t * .0005) * 1920, (hash(i * 7 + 3) * 720 + t * .35) % 720, hash(i) > .95 ? 2 : 1, 1); } c.globalAlpha = 1; }
function arc(c, x, y, r, start, length, color, width = 1) { c.beginPath(); c.arc(x, y, r, start, start + length); c.strokeStyle = color; c.lineWidth = width; c.stroke(); }

export function spaceBody(c, t, x, y, r, color, black = false) {
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * .05) * .09);
  c.fillStyle = black ? palette.black : '#172E34'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); circle(c, 0, 0, r, color, black ? 2 : 1);
  c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip(); c.globalAlpha = .23;
  for (let j = 0; j < 9; j++) { const q = fract(j / 9 + t * .009), xx = Math.sin(q * Math.PI - Math.PI / 2) * r; c.beginPath(); c.ellipse(xx, 0, Math.max(.01, r * .12 * Math.sin(q * Math.PI)), r, 0, 0, TAU); c.strokeStyle = color; c.lineWidth = .7; c.stroke(); }
  for (let j = 0; j < 5; j++) { c.beginPath(); c.ellipse(0, (j - 2) * r * .31, r, r * .1, 0, 0, TAU); c.stroke(); } c.restore();
  c.globalAlpha = .55; arc(c, 0, 0, r + 16, t * .12, Math.PI * .76, color, 1.4); arc(c, 0, 0, r + 23, -t * .08, Math.PI * .22, color, .7); c.restore();
}

// 城市天际线：三层剪影 + 轮廓光 + 窗火 + 崩塌。楼体几乎全黑，只留朝中心的一道边光。
// 每栋楼由 scene_layers 的 drawBuilding 生成：退台体块、屋顶杂件、窗格与裂缝，
// 因此剪影永远不会退化成一根矩形。
export function citySkyline(c, t, color, collapse = 0, opts = {}) {
  const rim = opts.rim || color;
  const base = opts.base ?? 748, ruin = opts.ruin ?? collapse;
  const x0 = opts.x0 ?? 0, x1 = opts.x1 ?? 1920, scale = opts.scale ?? 1;
  const skyLow = opts.skyLow || color;
  const layers = [
    { step: 132, w: [26, 62], h: [110, 330], fill: alpha(skyLow, .30), scroll: 3.4, lit: .10, base: 0, ruin: .3 },
    { step: 172, w: [40, 90], h: [180, 430], fill: '#0A121A', scroll: 5.6, lit: .22, base: 24, ruin: .7 },
    { step: 220, w: [58, 118], h: [250, 580], fill: '#03060A', scroll: 8.8, lit: .38, base: 50, ruin: 1 },
  ];
  layers.forEach((L, li) => {
    const count = Math.ceil((x1 - x0) / L.step) + 2;
    for (let i = -1; i < count; i++) {
      const seed = i + li * 91;
      const x = x0 + i * L.step + li * 37 - (t * L.scroll) % L.step + hash(seed * 2.3) * 26;
      const w = (L.w[0] + hash(seed * 3.1) * (L.w[1] - L.w[0])) * scale;
      const h = (L.h[0] + hash(seed * 5.7) * (L.h[1] - L.h[0])) * scale;
      drawBuilding(c, t, {
        seed, x, baseY: base + L.base * scale, w, h,
        fill: L.fill, rim, ruin: ruin * L.ruin, lit: L.lit,
        lightDir: x < 960 ? 1 : -1,
        windows: li > 0,
      });
    }
  });
  // 地面废墟剪影
  c.save(); c.fillStyle = '#02040788'; c.beginPath(); c.moveTo(x0, base + 70 * scale);
  for (let x = x0; x <= x1; x += 96) c.lineTo(x, base + (44 + hash(x * .37) * 34) * scale);
  c.lineTo(x1, base + 70 * scale); c.closePath(); c.fill(); c.restore();
  // 上升的火星
  if (ruin > .02) {
    c.save();
    for (let i = 0; i < 70; i++) {
      const q = fract(hash(i * 3.7) + t * (.08 + hash(i) * .14)), x = x0 + hash(i * 7.1) * (x1 - x0), y = base + 40 * scale - q * q * 620 * scale;
      c.globalAlpha = Math.sin(q * Math.PI) * ruin * .85; c.fillStyle = i % 3 ? '#FF8A5A' : '#FFD2A0';
      c.fillRect(x, y, 2.2, 2.2 + hash(i) * 3.4);
    }
    c.restore();
  }
}

// 观测站外壳：巨大的落地窗、窗框的厚度、室内地板与反光、两侧墙板。
// 顶部桁架、机柜、光柱与前景控制台由 scene_layers 的层表提供，形成真正的空间层次。
export function architecture(c, t, color, dim = 0) {
  c.save();
  const g = c.createLinearGradient(0, 0, 0, 1080);
  g.addColorStop(0, '#14292F'); g.addColorStop(.62, '#0C171D'); g.addColorStop(1, palette.black);
  c.fillStyle = g; c.fillRect(0, 0, 1920, 1080);

  // 窗外的城市：天空、星场、轨道天体，再压上三层天际线。
  c.save(); c.beginPath(); c.rect(210, 125, 1500, 520); c.clip();
  citySky(c, t, { skyTop: '#070E16', skyMid: '#12242E', skyLow: '#27454B', rim: color, base: 646, top: 125, bottom: 650 });
  c.save(); c.translate(Math.sin(t * .075) * 22, Math.cos(t * .063) * 9); starfield(c, t); spaceBody(c, t, 1120 + Math.sin(t * .036) * 95, 330, 118, color, false); c.restore();
  cityDistrict(c, t, { seed: 311, step: 128, baseY: 606, scroll: 2.4, depth: .5, w: [40, 92], h: [90, 250], fill: '#08141A', rim: color, lit: .2, x0: 200, x1: 1720, styles: ['tower', 'block', 'block', 'shed', 'tower'] });
  cityGround(c, t, { horizon: 606, vanishX: 940, color: '#0E2027', near: '#163038', deep: '#070E12', rim: color, seam: color, haze: '#14292F' });
  // 两道来自城市上空的探照灯：锥体始终留在玻璃之后。
  for (let k = 0; k < 2; k++) {
    const x = 620 + k * 680 + Math.sin(t * .16 + k) * 25, dx = Math.sin(t * .23 + k * 2.7) * 430;
    c.save(); c.globalAlpha = .075; path(c, [[x, 639], [x + dx - 130, 140], [x + dx + 130, 140]], color, true);
    c.globalAlpha = .22; line(c, x, 639, x + dx, 140, color, 1); c.restore();
  }
  c.save(); c.globalAlpha = .035; for (let i = 0; i < 3; i++) { const x = fract(t * .022 + i / 3) * 2200 - 350; path(c, [[x, 125], [x + 180, 125], [x - 190, 645], [x - 370, 645]], palette.paper, true); } c.restore();
  c.restore();

  // 窗框：厚框 + 竖挺 + 横档，带受光的高光边。
  c.save();
  c.fillStyle = '#1B333A'; c.fillRect(200, 116, 1520, 18); c.fillRect(200, 636, 1520, 20);
  c.fillStyle = '#25424A'; c.fillRect(200, 116, 1520, 4); c.fillRect(200, 636, 1520, 3);
  for (let i = 0; i <= 6; i++) {
    const x = 210 + i * 250;
    c.fillStyle = '#1B333A'; c.fillRect(x - 7, 125, 14, 525);
    c.fillStyle = alpha(color, .16); c.fillRect(x + 5, 125, 2, 525);
  }
  c.fillStyle = '#1B333A'; c.fillRect(200, 372, 1520, 12);
  c.fillStyle = alpha(color, .12); c.fillRect(200, 372, 1520, 2);
  c.restore();

  // 两侧墙板与落地设备：给房间以体量，而不是一张贴图。
  c.save();
  for (const side of [0, 1]) {
    c.save(); if (side) { c.translate(1920, 0); c.scale(-1, 1); }
    c.fillStyle = '#0E1D23'; c.beginPath();
    c.moveTo(0, 0); c.lineTo(196, 112); c.lineTo(196, 900); c.lineTo(0, 1080); c.closePath(); c.fill();
    c.strokeStyle = alpha(color, .1); c.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(0, 120 + i * 190); c.lineTo(196, 132 + i * 178); c.stroke(); }
    // 墙上的配电箱与指示灯
    for (let i = 0; i < 3; i++) {
      const bx = 34 + i * 54, by = 250 + i * 150;
      c.fillStyle = '#0A171C'; c.fillRect(bx, by, 40, 58);
      c.strokeStyle = alpha(color, .22); c.lineWidth = 1; c.strokeRect(bx, by, 40, 58);
      for (let k = 0; k < 3; k++) {
        c.fillStyle = alpha(k === 2 ? palette.orange : color, .25 + .5 * Math.abs(Math.sin(t * (1.1 + k * .4) + i)));
        c.fillRect(bx + 6, by + 8 + k * 13, 5, 4);
      }
    }
    c.restore();
  }
  c.restore();

  // 地面：透视接缝 + 冷光反射，让房间有纵深。
  c.save();
  const floor = c.createLinearGradient(0, 650, 0, 1080);
  floor.addColorStop(0, '#132429'); floor.addColorStop(1, '#070D12');
  c.fillStyle = floor; c.fillRect(0, 650, 1920, 430);
  c.strokeStyle = '#1B3035'; c.lineWidth = 1.3;
  for (let i = 0; i < 12; i++) { const x = i * 240 - 180; c.beginPath(); c.moveTo(960 + (x - 960) * .12, 655); c.lineTo(x, 1080); c.stroke(); }
  for (let j = 0; j < 9; j++) { const z = fract(j / 9 + t * .026); const y = 650 + z * z * 430; c.globalAlpha = .7; c.beginPath(); c.moveTo(0, y); c.lineTo(1920, y); c.stroke(); }
  c.globalAlpha = 1;
  // 窗光在地面上的倒影：被窗格切成一条条竖带，而不是一团团光斑。
  c.globalAlpha = .13; c.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const x = 250 + i * 205 + Math.sin(t * .12 + i) * 8;
    const w = 96 - i * 4;
    const grd = c.createLinearGradient(0, 655, 0, 1010);
    grd.addColorStop(0, alpha(color, .8));
    grd.addColorStop(1, alpha(color, 0));
    c.fillStyle = grd;
    c.beginPath();
    c.moveTo(x, 655); c.lineTo(x + w, 655); c.lineTo(x + w * 1.5, 1010); c.lineTo(x + w * .5, 1010);
    c.closePath(); c.fill();
  }
  c.restore();

  // 顶棚的暗面与一道采光缝
  c.save();
  c.fillStyle = '#0A1418'; c.beginPath(); c.moveTo(0, 0); c.lineTo(1920, 0); c.lineTo(1920, 96); c.lineTo(0, 132); c.closePath(); c.fill();
  c.globalAlpha = .16; c.fillStyle = palette.paper;
  c.beginPath(); c.moveTo(600, 0); c.lineTo(1180, 0); c.lineTo(1120, 96); c.lineTo(660, 112); c.closePath(); c.fill();
  c.restore();

  // 前景栏杆：最快的层，制造"隔着东西看"的纵深。
  c.save();
  const near = Math.sin(t * .13) * 14;
  c.fillStyle = '#16272E'; c.fillRect(0, 996 + near * .18, 1920, 16);
  c.fillStyle = alpha(color, .22); c.fillRect(0, 996 + near * .18, 1920, 1.6);
  for (let i = 0; i < 4; i++) { const x = i * 610 - 80 + near; c.fillStyle = '#0E1C22'; c.fillRect(x, 1000, 20, 80); }
  c.restore();

  if (dim > 0) { c.fillStyle = `rgba(9,12,19,${clamp(dim, 0, .95)})`; c.fillRect(0, 0, 1920, 1080); }
  c.restore();
}

// 废墟世界：楼体有体量与尺度参照物，街道有材质，尘霾分层，前景有遮挡。
export function ruinedWorld(c, t, color, collapse = 0, local = 0, opts = {}) {
  c.save();
  const destruction = clamp(collapse);
  const g = c.createLinearGradient(0, 0, 0, 1080);
  g.addColorStop(0, opts.skyTop || '#150609');
  g.addColorStop(.40, opts.sky || '#3C1115');
  g.addColorStop(.72, opts.glow || '#8A271E');
  g.addColorStop(1, palette.black);
  c.fillStyle = g; c.fillRect(0, 0, 1920, 1080);
  const gl = c.createRadialGradient(960, 700, 20, 960, 700, 1150);
  const halo = opts.halo || '#FF6A45';
  gl.addColorStop(0, alpha(halo, .40)); gl.addColorStop(.42, alpha(halo, .12)); gl.addColorStop(1, alpha(halo, 0));
  c.globalCompositeOperation = 'lighter'; c.fillStyle = gl; c.fillRect(0, 0, 1920, 1080); c.globalCompositeOperation = 'source-over';
  starfield(c, t, 90);
  // 远景天际线：与近处废墟同一套剪影语言，城市因此是一体的。
  cityDistrict(c, t, { seed: 419, step: 140, baseY: 636, scroll: 3.0, depth: .52, w: [44, 100], h: [100, 280], fill: '#0A1015', rim: halo, lit: .16, x0: -80, x1: 2000, ruin: destruction * .6, styles: ['tower', 'block', 'shed', 'block', 'spire'] });

  const cam = Math.sin(t * .065) * .35, advance = 1 + smooth(local / 26) * .27, vx = 960 + Math.sin(local * .2) * 42;
  // 尘带分层：三条不同速度的雾，落在楼体之前。
  c.save(); c.globalAlpha = .085;
  for (let i = 0; i < 6; i++) { const y = 380 + i * 42, xx = fract(t * (.008 + i * .004) + i * .19) * 2500 - 300; path(c, [[xx - 500, y], [xx + 440, y - 28], [xx + 700, y + 15], [xx - 650, y + 48]], color, true); }
  c.restore();

  // 三层近景楼体：远层更亮更雾，近层几乎全黑，明度差就是纵深。
  for (let layer = 0; layer < 3; layer++) for (let i = 0; i < 10; i++) {
    const depth = 3.3 - layer * .8, sc = 260 / depth * advance, wx = (i - 6.5) * 1.12 + hash(i + layer * 50) * .15;
    const x = vx + (wx - cam * (layer + 1)) * sc, y = 570 + 240 / depth;
    const w = (.35 + hash(i + 4) * .38) * sc, h = (.6 + hash(i + layer * 30) * 2.2) * sc;
    const fall = smooth((destruction - hash(i + layer * 70) * .65) / .5), drift = (hash(i + 4) - .5) * fall * 140;
    c.save(); c.translate(x + drift, y + fall * fall * 220); c.rotate(fall * (hash(i) - .5) * .55);
    const front = ['#263A42', '#101E25', '#04080B'][layer], side = ['#31464E', '#152930', '#081116'][layer];
    path(c, [[0, 0], [w, 0], [w, -h], [0, -h]], front, true);
    path(c, [[w, 0], [w + 14, -8], [w + 14, -h - 8], [w, -h]], side, true);
    path(c, [[0, -h], [w, -h], [w + 14, -h - 8], [14, -h - 8]], side, true);
    c.globalAlpha = 1 - fall * .6; line(c, 0, -h, w, -h, color, .7); c.globalAlpha = 1;
    c.strokeStyle = alpha(color, .62); c.lineWidth = 1.5; c.beginPath(); c.moveTo(w, -h); c.lineTo(w + 14, -h - 8); c.lineTo(w + 14, -8); c.stroke();
    if (i % 3 === 0) { line(c, w * .5, -h, w * .5, -h - 28, color, .6); line(c, w * .3, -h - 16, w * .7, -h - 16, color, .6); }
    const floors = Math.floor(h / 24);
    for (let row = 0; row < floors; row++) for (let col = 0; col < 3; col++) {
      const light = hash(i * 31 + row * 7 + col), alive = 1 - smooth((destruction - light * .82) / .16);
      if (light > .3 && alive > .001) { c.globalAlpha = (.14 + hash(row + i) * .42) * alive; c.fillStyle = color; c.fillRect(5 + col * w / 3, -h + 14 + row * 24, Math.max(2, w / 9), 3); }
    }
    c.globalAlpha = 1;
    if (fall > .12) { c.strokeStyle = alpha('#FF6A4A', fall * .85); c.lineWidth = 1.8; c.beginPath(); const cx = w * (.25 + hash(i * 7) * .5); c.moveTo(cx, -h * .1); c.lineTo(cx + (hash(i * 11) - .5) * w * .4, -h * .55); c.lineTo(cx + (hash(i * 13) - .5) * w * .6, -h * .92); c.stroke(); }
    if (fall > .03) for (let j = 0; j < 4; j++) { const yy = -h + j * h * .25; line(c, 0, yy, w, yy + Math.sin(i + j) * 9, palette.black, 2); }
    c.restore();
  }

  // 街道：透视路面 + 反光 + 尺度物（路灯、车辆、人形剪影）。
  cityGround(c, t, { horizon: 636, vanishX: vx, color: '#15242B', near: '#1C2E36', deep: '#070C11', rim: color, seam: color, haze: '#3C1115' });
  streetProps(c, t, { horizon: 636, vanishX: vx, rim: color, pole: '#050A0F' });

  // 崩塌中的地面裂缝与飞散碎片
  if (destruction > 0) {
    for (let j = 0; j < 8; j++) { const x = 580 + hash(j) * 740, y = 700 + j * 42; path(c, [[vx, 640], [x, y], [x + (hash(j + 20) - .5) * 180, 1080]], palette.black, false, 2 + destruction * 7); }
    for (let i = 0; i < 76; i++) {
      const phase = fract(local * (.045 + hash(i) * .025) + hash(i * 13)), z = .15 + phase * phase * .85, spread = (hash(i + 40) - .5) * 2500;
      const x = vx + spread * z + (hash(i) - .5) * destruction * 250, y = 280 + phase * phase * 850, sz = (2 + hash(i + 32) * 17) * z;
      c.save(); c.globalAlpha = Math.sin(phase * Math.PI) * smooth(destruction * 3) * .8; c.translate(x, y); c.rotate(local * (hash(i + 6) - .5) * 2 + hash(i) * TAU); path(c, [[-sz, -sz * .6], [sz, 0], [sz * .4, sz]], i % 4 ? palette.black : color, true); c.restore();
    }
  }
  // 下坠的近景线缆与悬挂碎片
  const sway = Math.sin(local * .8) * 7 + destruction * 46;
  c.strokeStyle = '#070E14'; c.lineWidth = 5; c.beginPath(); c.moveTo(-40, 90); c.bezierCurveTo(520, 420 + sway, 1070, 40 + sway, 1970, 185); c.stroke();
  c.lineWidth = 3; c.beginPath(); c.moveTo(-40, 145); c.bezierCurveTo(620, 390 + sway * .65, 1440, 300 - sway, 1970, 150); c.stroke();
  for (let i = 0; i < 5; i++) { const x = 130 + i * 420 + Math.sin(local * .5 + i) * 12, y = 170 + Math.sin(i) * 65; line(c, x, y, x + Math.sin(local * .7 + i) * 25, y + 80 + hash(i) * 100, '#070E14', 3); if (destruction > .2) { c.save(); c.globalAlpha = smooth((destruction - .2) / .5); line(c, x + 20, y + 210, x + 35 + Math.sin(local + i) * 18, y + 260 + destruction * 80, color, 1); c.restore(); } }
  c.restore();
}

export function eyeInsert(c, t, resources, scene, shot, color) {
  const im = resources.eyes || resources.fear; if (!im) return;
  const p = clamp((t - shot.start) / (shot.end - shot.start)), q = smooth(p); c.save(); c.fillStyle = palette.black; c.fillRect(0, 0, 1920, 1080);
  const crop = shot.id % 3 === 1 ? [45, 255, 1080, 607] : shot.id % 3 === 2 ? [590, 155, 1080, 607] : [0, 0, 1672, 941];
  const [sx, sy, sw, sh] = crop, direction = shot.id % 2 ? 1 : -1, z = 1.12 + q * .18;
  c.translate(960 + direction * (q - .5) * 155 + Math.sin(t * .7) * 4, 540 + (q - .5) * 46); c.scale(z, z);
  drawGradedImage(c, resources, resources.eyes ? 'eyes' : 'fear', [sx, sy, sw, sh, -960, -540, 1920, 1080]);
  if (scene.id >= 5) for (const [ix, iy] of [[447, 590], [1236, 468]]) {
    if (ix < sx || ix > sx + sw) continue; const x = (ix - sx) / sw * 1920 - 960, y = (iy - sy) / sh * 1080 - 540, r = 32 * 1672 / sw, grow = (scene.id >= 8 ? 1.3 : .9) * (1 + .16 * Math.sin(q * Math.PI));
    c.save(); c.beginPath(); c.ellipse(x, y, r * 2.5, r * 2.5, 0, 0, TAU); c.clip(); c.fillStyle = '#090C13CC'; c.beginPath(); c.arc(x, y, r * grow, 0, TAU); c.fill();
    c.globalAlpha = .72; circle(c, x, y, r * grow + 10, color, 1); arc(c, x, y, r * grow + 21, t * .4, Math.PI * .8, color, 1); arc(c, x, y, r * grow + 28, -t * .28, Math.PI * .35, color, .6);
    for (let i = 0; i < 17; i++) { const a = hash(i) * TAU + t * .35, rad = r * (.3 + fract(hash(i + 10) - t * .15) * 1.5); c.globalAlpha = .2 + hash(i + 20) * .55; c.fillStyle = color; c.fillRect(x + Math.cos(a) * rad, y + Math.sin(a) * rad * .7, 1.5, 1.5); }
    c.globalAlpha = .7; c.translate(x, y); c.rotate(t * .18); line(c, -r * 2, 0, r * 2, 0, color, .8); c.restore();
  }
  c.restore();
  // The shutter slides into a tighter crop across the shot, while the centre stays readable.
  resources.drawLyricBack?.(c);
  const matte = 28 + q * 45; c.fillStyle = palette.black; c.fillRect(0, 0, 1920, matte); c.fillRect(0, 1080 - matte, 1920, matte);
  const g = c.createLinearGradient(0, 0, 0, 1080); g.addColorStop(0, '#090C1380'); g.addColorStop(.2, '#090C1300'); g.addColorStop(.72, '#090C1300'); g.addColorStop(1, '#090C13B0'); c.fillStyle = g; c.fillRect(0, 0, 1920, 1080);
  c.save(); c.globalAlpha = .24; const sweep = fract(p * .8 + .1) * 1920; line(c, sweep, matte + 25, sweep, 1080 - matte - 25, color, .8); line(c, 90, 945, 90 + q * 500, 945, color, 1.5); c.restore();
  if (!resources.lyricActive) label(c, scene.id >= 8 ? '瞳の奥で、世界がほどける。' : '観測記録 / OPTICAL MEMORY', 92, 990, 26, scene.id >= 8 ? palette.paper : palette.mint);
}

export function handInsert(c, t, resources, scene, shot, color, flower) {
  c.save(); const memory = scene.id === 7; c.fillStyle = memory ? palette.paper : palette.black; c.fillRect(0, 0, 1920, 1080); const p = clamp((t - shot.start) / (shot.end - shot.start)), q = smooth(p);
  if (!memory) {
    starfield(c, t, 120);
    for (let j = 0; j < 5; j++) { const phase = fract(j / 5 + t * .085); c.globalAlpha = Math.sin(phase * Math.PI) * .24; circle(c, 715, 430, 65 + phase * 300, color, 1); }
    c.globalAlpha = 1;
    // 失重的背景：远处漂浮的建筑碎片，让"手"有一个空间而不是纯黑。
    floatingRubble(c, t, { count: 9, seed: 17, fill: '#0A1116', rim: color, x0: 60, x1: 1860, y0: 120, y1: 940, opacity: .55 });
  }
  resources.drawLyricBack?.(c);
  c.save(); c.translate(1010 + q * 110, 655 - q * 95); c.rotate(-.055 + q * .09 + Math.sin(t * .8) * .008); c.scale(.94 + q * .11, .94 + q * .11);
  const hand = resources.hand; if (hand) drawGradedImage(c, resources, 'hand', [-760, -430, 1550, 1033]); else if (resources.full) c.drawImage(resources.full, 300, 390, 170, 210, -600, -200, 900, 1112);
  if (scene.id === 7 || scene.id === 10) {
    const release = scene.id === 10 ? smooth((p - .12) / .78) : smooth((p - .32) / .68), fx = -320 + release * 180, fy = -300 - release * 260;
    flower(c, fx, fy, (scene.id === 7 ? 130 : 85) * (1 - release * .25), t + q * 8, memory ? palette.teal : palette.mint, .9 * (1 - release * .6));
    for (let i = 0; i < 36; i++) {
      const seed = hash(i), phase = fract(p * .8 + seed), a = seed * TAU + p * 1.5, r = 50 + hash(i + 7) * 90 + release * 200, x = -320 + Math.cos(a) * r + release * (160 + hash(i + 8) * 180), y = -300 + Math.sin(a) * r * .65 - release * (120 + hash(i + 13) * 380);
      c.save(); c.translate(x, y); c.rotate(a + p * 3); c.globalAlpha = Math.sin(phase * Math.PI) * (.25 + release * .4); path(c, [[-2, -6], [4, 0], [-2, 7], [-5, 0]], memory ? palette.teal : palette.mint, true); c.restore();
    }
  } else {
    const acquire = smooth(p / .38), r = 90 + Math.sin(t * 1.6) * 5; circle(c, -300, -280, r, color, 2); arc(c, -300, -280, r + 22, t * .7, Math.PI * 1.3, color, 2);
    c.save(); c.globalAlpha = .65; line(c, -500 + acquire * 70, -280, -100 - acquire * 70, -280, color, 1); line(c, -300, -450 + acquire * 65, -300, -110 - acquire * 65, color, 1);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU - t * .4; line(c, -300 + Math.cos(a) * 145, -280 + Math.sin(a) * 145, -300 + Math.cos(a) * 164, -280 + Math.sin(a) * 164, color, 1.2); } c.restore();
    for (let i = 0; i < 16; i++) { const f = fract(t * .2 + i / 16), x = -760 + f * 460, y = -460 + f * 180 + Math.sin(f * Math.PI) * 90; c.save(); c.globalAlpha = Math.sin(f * Math.PI) * .65; c.fillStyle = color; c.fillRect(x, y, 3, 3); line(c, x - 12, y - 7, x, y, color, .6); c.restore(); }
    label(c, scene.id === 4 ? 'DELETE / RETRY' : 'UNANSWERED SIGNAL', -470, -470, 20, color);
  }
  c.restore();
  if (!resources.lyricActive) { label(c, scene.id === 10 ? '最後の記憶を、手放す。' : scene.id === 7 ? '保存された、小さな花。' : '触れても、応答はない。', 100, 225, 34, memory ? palette.teal : palette.paper); label(c, `RECORD ${String(shot.id).padStart(3, '0')} / HAND STUDY`, 105, 272, 13, memory ? palette.teal : color); }
  c.restore();
}
