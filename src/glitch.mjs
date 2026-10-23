// 崩坏 / DECONSTRUCTION PASS
// Pure-time image degradation. Every parameter is a function of song time, so the
// same frame always re-renders identically: no frame history, no Math.random, no clock.
// Both engines (native @napi-rs/canvas and the browser preview) expose makeCanvas,
// so all compositing is done with portable Canvas2D operators.

import { signalWindowAt } from './signal_windows.mjs';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, t) => a + (b - a) * t;
const fract = x => x - Math.floor(x);
const hash = n => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

// 崩坏总开关：预览页可以单独关闭，用来看崩坏前后的对照。
export const glitchToggle = { enabled: true };

// 崩坏强度按场景分配，由共用时间表限定；循环歌词另设中量上限。
// 重复段（ERASE / PERSIST）与副歌保留可读性，高潮段（CORE / REALITY）彻底失序。
const ZONE = { 1: 0, 2: 0, 3: .22, 4: .78, 5: .58, 6: .46, 7: 0, 8: 1, 9: .95, 10: 0, 11: 0 };
// 同场景内的个别段落需要额外加权。
const LABEL_BOOST = { 'ARRIVAL / BLACK STAR': .30, 'BLACK STAR II': .12 };

function zoneLevel(scene) {
  return clamp((ZONE[scene.id] ?? 0) + (LABEL_BOOST[scene.label] ?? 0));
}

// 场景底噪强度在切点附近与相邻场景交叉淡化：既不跳变，也不会把崩坏压到零。
// 之前这里直接取当前场景的强度，切点处 level 会整段塌掉。
function sceneLevelAt(scenes, index, t, blend = .30) {
  const cur = zoneLevel(scenes[index]);
  const start = scenes[index].start;
  const end = scenes[index + 1]?.start ?? Infinity;
  let level = cur;
  if (index > 0 && t - start < blend) {
    // 切点前 blend 秒内从上一场过渡过来，切点处正好是一半。
    level = mix(zoneLevel(scenes[index - 1]), cur, smooth((t - start + blend) / (2 * blend)));
  }
  if (index + 1 < scenes.length && end - t < blend) {
    const q = smooth((end - t + blend) / (2 * blend));
    level = mix(level, zoneLevel(scenes[index + 1]), 1 - q);
  }
  return level;
}

// 段落内的打击点表：由真实鼓点（onsets）派生，分 4 级强度。
// 降级规则限制密集闪烁，让崩坏落在节奏上而不是变成连续噪声。
// 极端打击单独占位，不会被中间层挤掉，否则高潮段将永远等不到最烈的一下。
function buildMarks(events, start, end, level) {
  const marks = [];
  let lastMid = -99, lastHeavy = -99, lastExtreme = -99;
  for (const e of events) {
    if (e < start) continue;
    if (e >= end) break;
    const h = hash(e * 91.7 + 3.1), h2 = hash(e * 31.3 + 57.1), h3 = hash(e * 7.77 + 11.9);
    let tier = 1;
    if (h > .36) tier = 2;
    if (level >= .45 && h2 > .56) tier = 3;
    if (level >= .55 && h3 > .78) tier = 4;
    if (tier >= 4) {
      if (e - lastExtreme < .90) tier = 3;
      else { lastExtreme = e; lastHeavy = e; lastMid = e; }
    } else if (tier >= 3) {
      if (e - lastHeavy < .48) tier = 2;
      else { lastHeavy = e; lastMid = e; }
    } else if (tier >= 2) {
      if (e - lastMid < .20) tier = 1;
      else lastMid = e;
    }
    marks.push({ t: e, tier, h, h2, h3 });
  }
  return marks;
}

function activeMark(marks, t) {
  let found = null;
  for (const m of marks) { if (m.t <= t) found = m; else break; }
  return found;
}

// 崩坏参数表：只依赖歌曲时间与已有数据，任何时刻都能独立求值。
export function glitchAt(data, t) {
  if (!glitchToggle.enabled) return null;
  // 授权时间闸门：实际循环歌词使用中量档，其余按两处高潮窗口运行。
  const window = signalWindowAt(t);
  if (!window) return null;
  const scenes = data.cues?.scenes || [];
  if (!scenes.length) return null;
  let index = 0;
  for (let i = 0; i < scenes.length; i++) { if (scenes[i].start <= t) index = i; else break; }
  const scene = scenes[index];
  const end = scenes[index + 1]?.start ?? (data.config?.duration ?? 243);
  // 场景底噪：切点附近与相邻场景交叉淡化，避免强度整段跳变。
  const strength = window.strength ?? 1;
  const level = Math.min(Math.max(sceneLevelAt(scenes, index, t), window.floor), window.maxLevel ?? 1);
  if (level < .12) return null;
  const span = Math.max(.01, end - scene.start);
  const local = t - scene.start;
  // 场景自身的进出包络 + 窗口边缘的短淡入淡出，避免硬切造成亮度突变。
  // 包络只降到 62%，不再归零：否则每逢切点都会出现约一秒
  // 「特效消失、画面恢复彩色」的空洞，授权窗口看起来是断的。
  const sceneEnv = smooth(local / .45) * smooth((span - local) / .30);
  const env = (.62 + .38 * sceneEnv)
    * smooth((t - (window.envelopeFrom ?? window.from)) / .4)
    * smooth(((window.envelopeTo ?? window.to) - t) / .4);
  if (env <= .002) return null;

  const events = data.shots?.loopOnsets || data.features?.onsetTimes || [];
  const marks = buildMarks(events, scene.start, end, level);
  const mark = activeMark(marks, t);
  const age = mark ? t - mark.t : 99;
  const tier = Math.min(mark ? mark.tier : 0, window.maxTier ?? 4);
  // 打击包络：等级越高衰减越快，只有极端打击才长时间留痕。
  const decay = tier >= 4 ? 30 : tier >= 3 ? 13 : tier >= 2 ? 17 : 26;
  const drive = tier >= 4 ? 1 : tier >= 3 ? .85 : tier >= 2 ? .40 : tier >= 1 ? .18 : 0;
  const pulse = tier ? Math.exp(-age * decay) : 0;
  const heavyPulse = tier >= 3 ? Math.exp(-age * 14) * strength : 0;
  // 切点处损坏反而更烈：让场景切换读作"信号在此刻被扯断"，而不是"短暂喘息"。
  const cutBoost = 1 + .18 * Math.exp(-Math.min(local, span - local) * 7);
  const base = level * env * cutBoost * strength;
  // 强度是段落底噪乘以打击包络：底噪负责"持续崩坏"，打击负责"爆点"。
  const intensity = clamp(base * (.72 + .95 * drive * pulse), 0, window.ceiling ?? 1);
  const seed = mark ? mark.t : t;

  // 颜色类效果一律挂在打击上，绝不常驻：大部分时间画面保留原本颜色，
  // 只有鼓点上炸开的那一瞬才掉色或错位。
  const colorPulse = tier >= 3 ? Math.exp(-age * 6) : 0;
  // RGB 分离只留给极端打击，并且再抽一道闸：全片加起来只分离几秒。
  const splitGate = tier >= 4 && hash(mark.t * 7.91 + 2.3) < .60;
  // 单独重绘人物只留给高潮；循环段用整帧描线/黑白叠加，保留原有基础调色。
  let character = null;
  if (strength === 1 && tier >= 3 && age < 1.05) {
    const pick = hash(mark.t * 5.31 + 17.7), kind = hash(mark.t * 11.7 + 3.3), hold = .42 + hash(mark.t * 3.9 + 9.1) * .55;
    if (pick < .26 && age < hold) {
      // 线稿 / 黑白 / 灰度三选一：ink 是描线稿，mono 是单色版，mix 降一档就是灰度过渡。
      const style = kind < .38 ? 'ink' : 'mono';
      character = {style, mix: style === 'ink' ? 1 : kind < .74 ? 1 : .62};
    }
  }

  // 高潮的空间破坏只在鼓击上炸开，约 0.2 秒后让原画面重新站稳。
  // 中量循环不进入这一支：原来的强度、人物调色与渲染路径逐项保留。
  const climax = window.id === 'climax';
  const destructive = strength === 1 && (climax || window.id === 'repeat');
  const attack = climax ? .84 + .16 * smooth((t - 204) / 10) : .58;
  const hit = destructive && (tier >= 3 || (climax && tier === 2 && hash(seed * 13.1) > .80));
  const impact = hit ? env * attack * (tier >= 4 ? 1 : tier >= 3 ? .88 : .52) : 0;
  const spatial = destructive ? {
    shutter: impact * (1 - smooth(age / .16)),
    fragments: tier >= 3 ? impact * (1 - smooth(age / .23)) : 0,
    zoomEcho: impact * (1 - smooth(age / .19)),
  } : {};

  return {
    level, env, intensity, tier, age, seed, strength, windowId: window.id, scene: scene.id, label: scene.label, character,
    ...spatial,
    // RGB 分离：只在极端打击上短暂出现，以红为主
    split: splitGate ? (2 + 22 * intensity) * (.55 + .45 * hash(seed * 3.13 + .7)) * colorPulse : 0,
    // 颤抖
    shake: 1 + 15 * intensity,
    roll: (.0016 + .0085 * intensity) * (hash(seed * 8.3) > .5 ? 1 : -1),
    // 黑白：只在打击瞬间抽掉颜色
    mono: clamp(heavyPulse * .55),
    // 描线闪白
    outline: clamp(heavyPulse),
    // 黑白色块
    blocks: tier >= 2 ? Math.round((2 + 6 * level) * strength * (1 - smooth((age - .03) / .24))) : 0,
    // 行位移撕裂
    tear: tier >= 2 ? Math.round((3 + 8 * level) * strength * (1 - smooth((age - .02) / .17))) : 0,
    // 同步滚动条
    rollBand: tier >= 3 ? strength * (1 - smooth((age - .02) / .38)) : 0,
    // 数据块 / datamosh
    mosh: tier >= 3 ? Math.round((3 + 6 * level) * strength * (1 - smooth((age - .02) / .30))) : 0,
    // 像素化
    pixelate: tier >= 4 ? (1 - smooth((age - .01) / .08)) : 0,
    // 局部负片
    negative: tier >= 4 ? Math.round((1 + 1.5 * level) * (1 - smooth((age - .01) / .11))) : 0,
    // 噪点与重影：底噪权重压低，避免整段泛灰
    noise: clamp(base * .22 + heavyPulse * .55),
    echo: clamp(base * .26 + heavyPulse * .45),
  };
}

export function glitchLevel(data, t) {
  const g = glitchAt(data, t);
  return g ? g.intensity : 0;
}

// ---------------------------------------------------------------------------
// Canvas helpers
// ---------------------------------------------------------------------------

function canvasFor(resources, c, key, width, height) {
  resources.glitchCanvases ??= new Map();
  let canvas = resources.glitchCanvases.get(key);
  if (!canvas) {
    if (resources.makeCanvas) canvas = resources.makeCanvas(width, height);
    else {
      const doc = c.canvas && c.canvas.ownerDocument;
      canvas = doc ? doc.createElement('canvas') : null;
    }
    if (!canvas) return null;
    resources.glitchCanvases.set(key, canvas);
  }
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
}

function prepare(ctx, width, height) {
  if (ctx.reset) ctx.reset();
  else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function composite(ctx, mode) { ctx.globalCompositeOperation = mode; }

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

export function applyGlitch(c, t, data, resources, width, height) {
  const g = resources.glitch ?? glitchAt(data, t);
  if (!g || g.intensity < .008) return false;
  const source = canvasFor(resources, c, 'source', width, height);
  if (!source) return false;
  const scratch = canvasFor(resources, c, 'scratch', width, height);
  const split = canvasFor(resources, c, 'split', width, height);
  const output = canvasFor(resources, c, 'output', width, height);
  if (!scratch || !split || !output) return false;

  const s = source.getContext('2d'), k = scratch.getContext('2d'), p = split.getContext('2d'), o = output.getContext('2d');
  const unit = width / 1920;
  const strength = g.strength ?? 1;

  // 0. 原始帧：source 保持干净，作为所有位移采样的来源。
  prepare(s, width, height);
  s.drawImage(c.canvas, 0, 0, width, height);

  // 1. 几何崩坏：在 output 上叠加，采样始终来自干净的 source。
  prepare(o, width, height);
  o.drawImage(source, 0, 0);

  if (g.tear > 0) {
    // 行位移撕裂：逐条横向错切。
    for (let i = 0; i < g.tear; i++) {
      const y = Math.floor(hash(g.seed * 11.3 + i * 7.7) * height);
      const band = Math.max(2, Math.floor(hash(g.seed * 5.1 + i * 3.3) * height * .03) + 3);
      const dx = (hash(g.seed * 2.9 + i * 13.1) - .5) * 280 * unit * strength;
      if (y + band > height) continue;
      o.save();
      o.beginPath(); o.rect(0, y, width, band); o.clip();
      o.drawImage(source, 0, y, width, band, dx, y, width, band);
      o.restore();
    }
  }

  if (g.rollBand > 0) {
    // 同步滚动条：一块内容竖向绕回。
    const band = Math.max(8, Math.floor(height * .11 * strength));
    const y = Math.floor(hash(g.seed * 2.3) * (height - band));
    const shift = Math.floor(hash(g.seed * 3.1) * band);
    const srcY = (y + shift) % Math.max(1, height - band);
    o.save();
    o.beginPath(); o.rect(0, y, width, band); o.clip();
    o.drawImage(source, 0, srcY, width, band, 0, y, width, band);
    o.restore();
    o.save();
    o.globalAlpha = .32 * g.rollBand;
    o.strokeStyle = '#E9EDE5'; o.lineWidth = Math.max(1, unit);
    o.beginPath(); o.moveTo(0, y + .5); o.lineTo(width, y + .5); o.stroke();
    o.restore();
  }

  if (g.mosh > 0) {
    // 数据块：局部低分辨率重采样，模拟 datamosh。保留部分原画面，避免构图被完全吃掉。
    for (let i = 0; i < g.mosh; i++) {
      const bw = width * (.05 + hash(g.seed * 1.7 + i * 1.9) * .10);
      const bh = height * (.04 + hash(g.seed * 2.9 + i * 1.3) * .10);
      const x = hash(g.seed * 3.3 + i * 7.1) * width - bw * .5;
      const y = hash(g.seed * 4.7 + i * 5.3) * height - bh * .5;
      const sx = hash(g.seed * 5.9 + i * 2.7) * (width - bw * .4);
      const sy = hash(g.seed * 6.1 + i * 3.1) * (height - bh * .4);
      o.save();
      o.beginPath(); o.rect(x, y, bw, bh); o.clip();
      o.globalAlpha = .72 * strength;
      o.drawImage(source, sx, sy, bw * .30, bh * .30, x, y, bw, bh);
      o.restore();
    }
  }

  if (g.pixelate > 0) {
    // 像素化：整帧降到极低分辨率再放大。
    const small = Math.max(6, Math.round(width / 150));
    const smallH = Math.max(4, Math.round(small * height / width));
    prepare(k, width, height);
    k.drawImage(source, 0, 0, width, height, 0, 0, small, smallH);
    prepare(o, width, height);
    o.imageSmoothingEnabled = false;
    o.drawImage(scratch, 0, 0, small, smallH, 0, 0, width, height);
    o.imageSmoothingEnabled = true;
  }

  // 2. 黑白色块：硬边信号条与空心框，不做大面积实心白块，以免看起来像坏图。
  if (g.blocks > 0) {
    for (let i = 0; i < g.blocks; i++) {
      const kind = hash(g.seed * 43.7 + i * 3.7);
      const pick = hash(g.seed * 53.1 + i * 7.7);
      const color = pick > .86 ? '#FFFFFF' : pick > .46 ? '#000000' : pick > .24 ? '#D93B4A' : '#9DE4C2';
      const rx = hash(g.seed * 59.3 + i * 11.3), ry = hash(g.seed * 61.7 + i * 13.7);
      o.save();
      o.globalAlpha = (color === '#FFFFFF' ? .88 : .8) * strength;
      o.fillStyle = color;
      o.strokeStyle = color;
      if (kind < .46) {
        // 横向信号条
        const w = width * (.06 + rx * .42), h = Math.max(2, height * (.004 + ry * .016));
        o.fillRect(rx * (width - w), ry * height, w, h);
      } else if (kind < .70) {
        // 纵向信号条
        const w = Math.max(2, width * (.003 + rx * .011)), h = height * (.12 + ry * .42);
        o.fillRect(rx * width, ry * (height - h), w, h);
      } else {
        // 空心框：保留画面内容，只留下崩坏边界
        const w = width * (.10 + rx * .26), h = height * (.07 + ry * .22);
        o.lineWidth = Math.max(1, 2.4 * unit);
        o.strokeRect(rx * (width - w), ry * (height - h), w, h);
      }
      o.restore();
    }
  }

  // 3. 黑白：'color' 混合把画面的色相与饱和度替换为中性灰，
  //    只保留源图像的明度，所以不破坏亮度结构。
  if (g.mono > .01) {
    o.save();
    composite(o, 'color');
    o.globalAlpha = clamp(g.mono);
    o.fillStyle = '#808080';
    o.fillRect(0, 0, width, height);
    o.restore();
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  // 4. 描线闪白：先求水平与垂直边缘差，再把差值映射成白线叠加。
  if (g.outline > .01) {
    prepare(k, width, height);
    k.drawImage(output, 0, 0);
    composite(k, 'difference');
    k.drawImage(output, 2 * unit, 0);
    prepare(p, width, height);
    p.drawImage(output, 0, 0);
    composite(p, 'difference');
    p.drawImage(output, 0, 2 * unit);
    composite(k, 'lighter');
    k.drawImage(split, 0, 0);
    // 自乘一次做对比增强：弱边缘（衣料纹样）被压掉，只剩真正的轮廓线。
    prepare(p, width, height);
    p.drawImage(scratch, 0, 0);
    composite(k, 'multiply');
    k.drawImage(split, 0, 0);
    // 用 'color' 混合把边缘差值换成中性灰：暗处保持暗，亮处接近白。
    // 这里不使用 'luminosity'：该混合在部分渲染器上会整片返回白色。
    composite(k, 'color');
    k.fillStyle = '#808080';
    k.fillRect(0, 0, width, height);
    o.save();
    composite(o, 'lighter');
    o.globalAlpha = clamp(g.outline) * .95;
    o.drawImage(scratch, 0, 0);
    o.restore();
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  // 5. RGB 分离：红通道右移（主角）、蓝通道左移（只留一丝冷边）后叠加在原帧上。
  //    原帧保持锐利与白平衡，只在边缘拉出错位，不会变成三重彩虹。
  if (g.split > 2.2) {
    const dx = g.split * unit, dy = g.split * .30 * unit;
    prepare(k, width, height);
    k.drawImage(output, 0, 0);
    composite(k, 'multiply');
    k.fillStyle = '#FF0000';
    k.fillRect(0, 0, width, height);
    prepare(p, width, height);
    composite(p, 'lighter');
    p.drawImage(scratch, dx, dy);

    prepare(k, width, height);
    k.drawImage(output, 0, 0);
    composite(k, 'multiply');
    k.fillStyle = '#0000FF';
    k.fillRect(0, 0, width, height);
    p.save();
    composite(p, 'lighter');
    p.globalAlpha = .26;
    p.drawImage(scratch, -dx * .72, -dy * .72);
    p.restore();

    o.save();
    composite(o, 'lighter');
    o.globalAlpha = clamp(.24 + g.split * .016);
    o.drawImage(split, 0, 0);
    o.restore();
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  // 6. 局部负片：小面积方块反相，只在高潮的极端打击上出现。
  if (g.negative > 0) {
    for (let i = 0; i < g.negative; i++) {
      const bw = width * (.05 + hash(g.seed * 23.3 + i * 3.7) * .09);
      const bh = height * (.04 + hash(g.seed * 29.1 + i * 5.1) * .09);
      const x = hash(g.seed * 31.7 + i * 7.9) * (width - bw);
      const y = hash(g.seed * 37.9 + i * 9.7) * (height - bh);
      o.save();
      composite(o, 'difference');
      o.globalAlpha = .72;
      o.fillStyle = '#FFFFFF';
      o.fillRect(x, y, bw, bh);
      o.restore();
      o.globalAlpha = 1;
      o.globalCompositeOperation = 'source-over';
    }
  }

  // 高潮冲击：斜向快门把同一帧切成相反方向的薄片，而非持续抖动整张画。
  if (g.shutter > .015) {
    const count = g.tier >= 4 ? 7 : 4;
    const slope = (hash(g.seed * 17.9) - .5) * height * .32;
    for (let i = 0; i < count; i++) {
      const y = height * (i + .6) / (count + .7);
      const band = height * (.022 + .024 * hash(g.seed * 4.3 + i));
      const dx = (i % 2 ? 1 : -1) * width * (.025 + .045 * hash(g.seed * 8.7 + i)) * g.shutter;
      o.save();
      o.beginPath(); o.moveTo(0, y); o.lineTo(width, y + slope); o.lineTo(width, y + slope + band); o.lineTo(0, y + band); o.closePath(); o.clip();
      o.drawImage(source, dx, (i % 2 ? -1 : 1) * band * g.shutter * .36);
      o.restore();
      o.save(); o.globalAlpha = .52 * g.shutter; o.strokeStyle = i % 3 ? '#D93B4A' : '#9DE4C2'; o.lineWidth = Math.max(1, 1.7 * unit);
      o.beginPath(); o.moveTo(0, y); o.lineTo(width, y + slope); o.stroke(); o.restore();
    }
  }

  // 同时刻的放大回声：放射性扩散表现冲击速度，不依赖上一帧的残留。
  if (g.zoomEcho > .02) {
    const cx = width * (.4 + .2 * hash(g.seed * 9.7)), cy = height * (.35 + .3 * hash(g.seed * 6.3));
    for (let i = 1; i <= 2; i++) {
      const scale = 1 + (.035 + i * .033) * g.zoomEcho;
      o.save(); o.globalAlpha = g.zoomEcho * (i === 1 ? .15 : .08);
      o.translate(cx, cy); o.scale(scale, scale); o.translate(-cx, -cy); o.drawImage(source, 0, 0); o.restore();
    }
  }

  // 三角图像碎片向外炸开，红色裂边只占局部；爆点之间恢复清晰构图。
  if (g.fragments > .02) {
    const count = g.tier >= 4 ? 6 : 3;
    for (let i = 0; i < count; i++) {
      const x = width * (.10 + .8 * hash(g.seed * 19.3 + i * 3.7));
      const y = height * (.10 + .8 * hash(g.seed * 23.7 + i * 5.1));
      const bw = width * (.045 + .065 * hash(g.seed * 29.3 + i));
      const bh = height * (.07 + .15 * hash(g.seed * 31.1 + i));
      const direction = x < width / 2 ? -1 : 1;
      const dx = direction * width * (.018 + .027 * hash(g.seed * 37.7 + i)) * g.fragments;
      const dy = (y / height - .5) * height * .11 * g.fragments;
      o.save(); o.translate(dx, dy);
      o.beginPath(); o.moveTo(x - bw * .5, y + bh * .5); o.lineTo(x + bw * .5, y - bh * .5); o.lineTo(x + bw * .6, y + bh * .4); o.closePath(); o.clip();
      o.globalAlpha = .9 * g.fragments; o.drawImage(source, 0, 0);
      o.strokeStyle = i % 3 ? '#D93B4A' : '#E9EDE5'; o.lineWidth = Math.max(1, 2 * unit); o.stroke(); o.restore();
    }
  }

  // 7. 重影：整帧偏移叠加，制造信号残留。
  if (g.echo > .05) {
    o.save();
    composite(o, 'lighter');
    o.globalAlpha = clamp(g.echo) * .32;
    o.drawImage(source, (hash(g.seed * 41.3) - .5) * 26 * unit, (hash(g.seed * 43.7) - .5) * 16 * unit);
    o.restore();
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
  }

  // 8. 噪点雪花。
  if (g.noise > .03) {
    const count = Math.round(g.noise * 110);
    o.save();
    for (let i = 0; i < count; i++) {
      const x = hash(g.seed * 53.1 + i * 1.7) * width;
      const y = hash(g.seed * 59.3 + i * 2.9) * height;
      const size = hash(g.seed * 61.7 + i * 3.3) > .82 ? 3 : 1;
      const pick = hash(g.seed * 67.1 + i * 5.1);
      o.fillStyle = pick > .72 ? '#D93B4A' : pick > .4 ? '#9DE4C2' : '#FFFFFF';
      o.globalAlpha = .25 + hash(g.seed * 71.3 + i * 7.7) * .6;
      o.fillRect(x, y, size * unit, size * unit);
    }
    o.restore();
    o.globalAlpha = 1;
  }

  // 9. 颤抖：整帧位移与轻微旋转，冲击时给出更大的偏移。
  const swing = Math.sin(t * 47.3) * .55 + Math.sin(t * 31.1) * .45;
  const swingY = Math.sin(t * 39.7) * .5 + Math.sin(t * 23.3) * .5;
  const ox = swing * g.shake * unit;
  const oy = swingY * g.shake * unit * .7;
  const zoom = 1 + .006 * g.intensity;

  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, width, height);
  c.translate(width / 2 + ox, height / 2 + oy);
  c.rotate(g.roll * unit);
  c.scale(zoom, zoom);
  c.translate(-width / 2, -height / 2);
  c.drawImage(output, 0, 0);
  c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  return true;
}
