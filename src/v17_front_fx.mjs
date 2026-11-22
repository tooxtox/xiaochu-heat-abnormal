// Optical and environmental accents for the first reel. They run under the
// reading layer, in scene coordinates, and are evaluated only from song time.
import { W, H, alpha, arc, circle, clamp, fract, hash, line, path, smooth } from './scene_layers.mjs';

const MINT = '#A7EFDC', COPPER = '#EF9B64', RUST = '#C25352';
const ICE = '#B1D6E0', PALE = '#F6DDC6', DARK = '#10131D';
const TAU = Math.PI * 2;

function light(c, x, y, r, color, strength) {
  const glow = c.createRadialGradient(x, y, 1, x, y, r);
  glow.addColorStop(0, alpha(color, strength));
  glow.addColorStop(.35, alpha(color, strength * .6));
  glow.addColorStop(1, alpha(color, 0));
  c.fillStyle = glow;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function frameCorners(c, x, y, w, h, length, color, width = 2) {
  for (const dx of [-1, 1]) {
    for (const dy of [-1, 1]) {
      const x0 = x + dx * w / 2, y0 = y + dy * h / 2;
      path(c, [[x0 - dx * length, y0], [x0, y0], [x0, y0 - dy * length]], color, false, width);
    }
  }
}

function lensEdge(c, local, hit, color, side) {
  const x = side * (36 + Math.sin(local * .8) * 25 + hit * 28);
  c.save();
  c.translate(side > 0 ? 0 : W, 0);
  c.scale(side, 1);
  const glass = c.createLinearGradient(0, 0, 250, 0);
  glass.addColorStop(0, alpha(color, .12 + hit * .05));
  glass.addColorStop(.66, alpha(color, .025));
  glass.addColorStop(1, alpha(color, 0));
  path(c, [[0, 150], [164 + x, 0], [267 + x, 0], [67 + x, 1080], [0, 1080]], glass, true);
  line(c, 164 + x, 0, 0, 900, alpha(color, .24 + hit * .17), 2);
  line(c, 184 + x, 60, 112 + x, 430, alpha(color, .27), 1);
  c.restore();
}

function terminal(c, state, returned = false) {
  const { local, hit, shot, front } = state;
  const color = returned ? ICE : MINT;
  const x = shot.frontLook === 'console' ? 585 : shot.mode === 'portrait' ? 441 : 765;
  const y = shot.frontLook === 'console' ? 635 : 515;
  if (front) {
    // A pane at the lens travels faster than its reflection in the room.
    lensEdge(c, local, hit, color, returned ? -1 : 1);
    const stride = fract(local * .48), sweep = 880 + stride * 125;
    line(c, 39, sweep, 217 + stride * 128, sweep - 24, alpha(color, (.15 + hit * .24) * Math.sin(stride * Math.PI)), 2);
    return;
  }
  light(c, x, y, 315, color, .12 + hit * .10);
  c.save();
  c.translate(x, y);
  c.transform(1, -.055, -.13, 1, 0, 0);
  frameCorners(c, 0, 0, 407, 282, 27 + hit * 17, alpha(color, .42), 2.4);
  frameCorners(c, 0, 0, 474, 324, 15, alpha(color, .14));
  const scan = fract(local * (returned ? .37 : .62));
  const scanX = -204 + 408 * scan;
  const beam = c.createLinearGradient(scanX - 95, 0, scanX, 0);
  beam.addColorStop(0, alpha(color, 0));
  beam.addColorStop(1, alpha(color, .14 + hit * .15));
  c.fillStyle = beam; c.fillRect(scanX - 95, -135, 95, 270);
  line(c, scanX, -135, scanX, 135, alpha(color, .38 + hit * .28), 1.6);
  for (let i = 0; i < 9; i++) {
    const y0 = 154 + (i % 2) * 5;
    line(c, -180 + i * 45, y0, -150 + i * 45, y0, alpha(color, i / 8 < scan ? .6 : .16), 2);
  }
  c.restore();
}

function vascular(c, { local, hit, front }) {
  if (front) {
    lensEdge(c, local, hit, COPPER, 1);
    lensEdge(c, local + .7, hit * .75, RUST, -1);
    return;
  }
  light(c, 407, 794, 365, RUST, .20 + hit * .16);
  const stretch = .80 + .2 * smooth(local * .5);
  for (let branch = 0; branch < 8; branch++) {
    const fromRight = branch >= 5, x = fromRight ? 1713 : 185;
    const drift = Math.sin(branch * 7.7) * 153;
    const lean = (branch % 3 - 1) * 180;
    const y = 905 - (branch % 4) * 63;
    const rise = (220 + branch * 51) * stretch;
    const pathX = x + (fromRight ? -1 : 1) * (250 + drift);
    c.beginPath(); c.moveTo(x, y);
    c.bezierCurveTo(x + lean, y - rise * .35, pathX - lean * .7, y - rise * .7, pathX, y - rise);
    c.strokeStyle = alpha(branch % 3 === 0 ? RUST : COPPER, .23 + hit * .43);
    c.lineWidth = branch % 3 === 0 ? 4 : 1.6;
    c.stroke();
    const ripple = .25 + .75 * fract(local * .8 + hash(branch * 9.5));
    const sparkX = x * (1 - ripple) + pathX * ripple + lean * Math.sin(ripple * TAU) * .31;
    c.fillStyle = alpha(PALE, .32 + hit * .50);
    c.fillRect(sparkX - 2, y - rise * ripple, 7, 2);
  }
}

function erased(c, { local, hit, shot, front }, whisper) {
  const ink = whisper ? ICE : COPPER;
  const side = shot.id % 2 ? 1 : -1;
  if (!front) {
    // Fragile re-registrations run behind the figure along the scan's direction.
    const x = side > 0 ? 520 : 1430, y = 555 + Math.sin(local * 1.3) * 32;
    for (let i = 5; i >= 0; i--) {
      const drift = fract(local * .38 + i / 6);
      const width = 148 + drift * (whisper ? 280 : 570);
      const dx = side * drift * (whisper ? 105 : 240);
      frameCorners(c, x + dx, y + (i - 2.5) * 49, width, 62 + drift * 130, 17 + drift * 14,
        alpha(ink, Math.sin(drift * Math.PI) * (.21 + hit * .26)), i % 2 === 0 ? 2 : 1);
    }
    return;
  }
  // The erase head crosses separated strips. Other foreground accents remain
  // visible during the gaps so the monitor never becomes a blinking panel.
  const bars = whisper ? 4 : 7;
  for (let i = 0; i < bars; i++) {
    const seed = shot.id * .157 + i * 19.3;
    const q = fract(local * (whisper ? .48 : .61) + hash(seed + 3.2));
    const gain = Math.sin(q * Math.PI) * (.28 + hit * .35);
    const x = (i % 2 ? 1730 : 205) + (q - .5) * 245 * side;
    const y = 230 + hash(seed + 2.3) * 724;
    const w = 62 + hash(seed) * 310, h = 6 + hash(seed + .1) * 15;
    c.fillStyle = alpha(DARK, gain * .7);
    c.fillRect(x - w / 2, y, w, h);
    line(c, x - w / 2 + w * q, y, x + w / 2, y, alpha(ink, gain * .88), i % 2 ? 2.6 : 1.1);
    c.fillStyle = alpha(PALE, gain * .76);
    c.fillRect(x - w / 2 + w * q, y - 1, 4 + q * 9, 3);
  }
}

function crescent(c, { local, hit, front, shot }) {
  const x = shot.pose || shot.mode === 'portrait' ? 535 : 1435;
  const y = 301 + Math.sin(local * .41) * 32;
  if (!front) {
    light(c, x, y, 294, COPPER, .18 + hit * .16);
    c.save(); c.translate(x, y); c.rotate(-.33);
    const r = 146 + hit * 7;
    c.beginPath(); c.moveTo(-36, -r);
    c.bezierCurveTo(-130, -108, -127, 90, 8, 120);
    c.bezierCurveTo(74, 131, 121, 101, 145, 56);
    c.bezierCurveTo(103, 178, -45, 183, -118, 81);
    c.bezierCurveTo(-175, 3, -141, -112, -36, -r);
    c.fillStyle = alpha(COPPER, .54 + hit * .15); c.fill();
    arc(c, 0, 0, r + 22, Math.PI * (1.04 + local * .02), 1.58, alpha(PALE, .38), 1.3);
    c.restore();
    return;
  }
  // Broken vocal trace falls away from the crescent and loses its amplitude.
  for (let i = 0; i < 31; i++) {
    const q = i / 30, dx = Math.sin(i * 2.06 + local * 9) * (26 + hit * 66) * Math.sin(q * Math.PI);
    const y0 = 922 - q * 90;
    const x0 = x - 230 + i * 11;
    line(c, x0, y0, x0, y0 - dx, alpha(i % 5 === 0 ? PALE : COPPER, .24 + hit * .39), i % 5 ? 1.6 : 3);
  }
}

function cinders(c, { local, hit, front, segment }, kind) {
  const drift = kind === 'ash' ? -1 : 1;
  const color = kind === 'sand' ? PALE : COPPER;
  const count = front ? 19 : 38;
  if (!front) {
    const x = kind === 'ash' ? 1492 : 344;
    light(c, x, 879, 460, color, (kind === 'sand' ? .08 : .15) + hit * .10);
  }
  for (let i = 0; i < count; i++) {
    const seed = segment * 93 + i * 11 + (front ? 7 : 0);
    const q = fract(local * (.17 + hash(seed) * (front ? .41 : .18)) + hash(seed + 3));
    const fromLeft = i % 3 !== 0;
    const side = fromLeft ? 1 : -1;
    const x = (fromLeft ? 145 : 1789) + side * (hash(seed + .5) * (front ? 366 : 656) + q * (front ? 260 : 139));
    const y = (drift < 0 ? 1035 : 65) + drift * q * (800 + hash(seed + 5) * 315);
    const gain = Math.sin(q * Math.PI) * (front ? .32 + hit * .34 : .23 + hit * .39);
    const streak = (front ? 15 : 6) + hash(seed + 6) * (front ? 36 : 23);
    line(c, x, y, x - side * streak * .48, y - drift * streak, alpha(color, gain), i % 5 === 0 ? 3 : 1);
    if (i % 3 !== 0) continue;
    path(c, [[x, y], [x - streak * .38, y - 4], [x - streak * .66, y - drift * streak]], alpha(color, gain * .46), true);
  }
}

function orbit(c, { local, hit, front, shot, segment }) {
  const close = shot.frontLook === 'prism' || shot.mode === 'eye';
  const x = segment === 11 ? 980 : 1080, y = segment === 11 ? 440 : 372;
  const angle = -.23 + Math.sin(local * .33) * .13;
  if (front) {
    // No opaque eclipse plate: only close dust and two broken lens reflections
    // move in front of the buildings and can pass over the character.
    lensEdge(c, local, hit * .85, segment === 14 ? ICE : RUST, close ? 1 : -1);
    for (let i = 0; i < 12; i++) {
      const q = fract(local * .28 + hash(i * 40.3));
      const dx = i % 2 ? 1 : -1;
      const y0 = 830 + hash(i * 13 + 3) * 166 + q * 120;
      const x0 = x + dx * (270 + q * 750);
      line(c, x0, y0, x0 - dx * (15 + q * 69), y0 - q * 28,
        alpha(i % 4 ? COPPER : PALE, Math.sin(q * Math.PI) * (.24 + hit * .37)), i % 3 ? 1 : 2.3);
    }
    return;
  }
  const cool = segment === 14, color = cool ? ICE : COPPER;
  c.save(); c.translate(x, y); c.rotate(angle);
  for (let i = 0; i < 4; i++) {
    const wide = (close ? 358 : 395) + i * 49 + hit * 18;
    const tall = 236 + i * 24;
    const start = (i * 1.93 + local * (i % 2 ? -.26 : .42)) % TAU;
    c.beginPath(); c.ellipse(0, 0, wide, tall, 0, start, start + (i % 2 === 0 ? 1.7 : .90));
    c.strokeStyle = alpha(color, (i === 0 ? .48 : .28) + hit * .26);
    c.lineWidth = i === 0 ? 2.3 : 1.15; c.stroke();
    const theta = start + (i % 2 ? .25 : 1.1);
    const x0 = Math.cos(theta) * wide, y0 = Math.sin(theta) * tall;
    if (Math.hypot(x0, y0) < 318) continue;
    circle(c, x0, y0, 5.5, alpha(PALE, .40 + hit * .30), 1.6);
    line(c, x0 - 9, y0, x0 + 9, y0, alpha(PALE, .30), 1);
  }
  c.restore();
}

function approach(c, { local, hit, front, shot }) {
  const x = shot.frontLook === 'recoil' ? 1310 : 978;
  if (front) {
    lensEdge(c, local, hit, RUST, -1);
    const q = fract(local * .77);
    frameCorners(c, x, 531, 1720 - q * 600, 848 - q * 339, 42,
      alpha(COPPER, Math.sin(q * Math.PI) * (.19 + hit * .21)), 2.5);
    return;
  }
  for (let i = 0; i < 6; i++) {
    const q = fract(local * .42 + i / 6);
    const radius = 170 + 790 * q * q;
    arc(c, x, 483, radius, (i % 2) * Math.PI + .52, .63, alpha(COPPER, Math.sin(q * Math.PI) * (.37 + hit * .25)), 2 + 1.6 * q);
  }
}

export function drawFrontEffects(c, { t, scene, shot, data, music, plane }) {
  if (!scene || !shot || (plane !== 'back' && plane !== 'front') ||
      t < 1.52 || t >= 90.215 || scene.segment > 14) return;
  const segment = scene.segment ?? scene.id;
  const local = Math.max(0, t - scene.start);
  const event = shot.onset?.time ?? (shot.rhythm?.beatLocked ? shot.start : null);
  const accent = event == null ? 0 : Math.exp(-Math.max(0, t - event) * 8);
  // Strength comes from the source transient and the already measured onset
  // envelope. A slower scene responds without jumping between bright states.
  const onset = music?.onset ?? 0;
  const hit = clamp(onset * .39 + accent * .59);
  const state = { local, hit, front: plane === 'front', shot, segment };
  const enter = segment === 1 ? smooth((t - 1.52) / .6) : 1;
  const outro = 1 - smooth((t - 89.8) / .415);
  const sourceEnergy = music?.energy ?? data?.features?.envelope?.[Math.floor(t * 20)] ?? .5;
  c.save();
  c.globalAlpha *= enter * outro * (.72 + .28 * clamp(sourceEnergy));
  switch (segment) {
    case 1: case 2: terminal(c, state); break;
    case 3: vascular(c, state); break;
    case 4: erased(c, state, false); break;
    case 5: crescent(c, state); break;
    case 6: approach(c, state); break;
    case 7: cinders(c, state, 'ash'); break;
    case 8: erased(c, state, true); break;
    case 9: cinders(c, state, 'debris'); break;
    case 10: case 11: case 14: orbit(c, state); break;
    case 12: cinders(c, state, 'sand'); break;
    case 13: terminal(c, state, true); break;
  }
  c.restore();
}
