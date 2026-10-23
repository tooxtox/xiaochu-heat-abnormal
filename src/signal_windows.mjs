// 全片共用的「信号损坏」时间窗：循环歌词为中量，两处高潮保留原强度。
// 崩坏后期（src/glitch.mjs）与歌词排版（src/lyric_art.mjs / src/lyric_motifs.mjs）
// 共用这一张表：任何损坏类效果都不允许出现在授权区间之外。
//
//   LYRIC LOOP —— 七组实际重复歌词，优先于高潮窗口，保留文字可读性。
//   REPEAT / 1:08–1:30  —— 第一处高潮（FAREWELL → RETURN → DISTANT STAR）
//   CLIMAX / 3:09–3:51  —— 第二处高潮（CELLS → CORE / HEAT ABNORMAL → BLACK STAR）
//
// 纯时间求值：不读前一帧、不用 Math.random、不看系统时钟。

const lyricLoop = (id, from, to, envelope = {}) => Object.freeze({
  id, from, to, kind: 'medium', floor: .36, corrupt: .32,
  strength: .60, maxLevel: .60, maxTier: 3, ceiling: .50,
  label: 'LYRIC LOOP / MEDIUM', ...envelope,
});

export const SIGNAL_WINDOWS = Object.freeze([
  lyricLoop('lyric-loop-1', 29.727875, 33.713875),
  lyricLoop('lyric-loop-2', 40.296875, 44.175875),
  lyricLoop('lyric-loop-3', 52.141875, 56.055875),
  lyricLoop('lyric-loop-4', 62.452875, 66.470875),
  lyricLoop('lyric-loop-5', 118.062875, 121.454875),
  lyricLoop('lyric-loop-6', 128.580875, 132.701875),
  // 已处于高潮内，沿用高潮外缘包络，避免强度切换时短暂掉到零。
  lyricLoop('lyric-loop-7', 225.871875, 229.768875, { envelopeFrom: 189, envelopeTo: 231.69 }),
  Object.freeze({ id: 'repeat', from: 68.0, to: 90.0, floor: .52, corrupt: .42, label: 'REPEAT / 1:08-1:30' }),
  Object.freeze({ id: 'climax', from: 189.0, to: 231.69, floor: .34, corrupt: .88, label: 'CLIMAX / 3:09-3:51' }),
]);

// t 落在哪个授权窗口内；不在窗口内返回 null。
export function signalWindowAt(t) {
  if (!Number.isFinite(t)) return null;
  for (const w of SIGNAL_WINDOWS) if (t >= w.from && t < w.to) return w;
  return null;
}

// 授权窗口的底噪强度；窗口外恒为 0。
export function signalFloor(t) {
  const w = signalWindowAt(t);
  return w ? w.floor : 0;
}

// 歌词排版的损坏强度；窗口外恒为 0。
export function signalCorrupt(t) {
  const w = signalWindowAt(t);
  return w ? w.corrupt : 0;
}

// 确定性哈希：同一 (a,b) 永远得到同一个值。
// 用整数雪崩混合而不是 sin 取小数：sin 版本对连续索引高度相关，
// 相邻字会整片落在同一个状态上（整段字同时变红），必须避免。
export const fract = n => n - Math.floor(n);
export function hash2(a, b) {
  let h = (Math.floor(a) | 0) ^ Math.imul(Math.floor(b) | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 把时间量化到固定帧率，用于制造「逐格跳进」的卡顿节奏。
export const quantTime = (t, hz = 15) => Math.floor(t * hz) / hz;
