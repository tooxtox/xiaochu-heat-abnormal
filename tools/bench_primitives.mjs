// Measure the cost of the canvas primitives the new scene art leans on.
import { createRequire } from 'node:module';
import path from 'node:path';

const req = createRequire(import.meta.url);
let cm;
try { cm = req('@napi-rs/canvas'); }
catch { cm = createRequire(path.join(process.env.CODEX_NODE_MODULES || path.join(process.cwd(), 'node_modules'), 'package.json'))('@napi-rs/canvas'); }
const { createCanvas } = cm;
const canvas = createCanvas(1920, 1080), ctx = canvas.getContext('2d');
const bench = (label, fn, n = 30) => {
  fn(0);
  const started = process.hrtime.bigint();
  for (let i = 0; i < n; i++) fn(i);
  console.log(label.padEnd(36), (Number(process.hrtime.bigint() - started) / 1e6 / n).toFixed(2), 'ms');
};

bench('linear gradient fullscreen', () => {
  const g = ctx.createLinearGradient(0, 0, 0, 1080);
  g.addColorStop(0, '#123'); g.addColorStop(1, '#ABC');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
});
bench('radial gradient fullscreen lighter', () => {
  const g = ctx.createRadialGradient(960, 700, 20, 960, 700, 1150);
  g.addColorStop(0, 'rgba(255,100,80,.5)'); g.addColorStop(1, 'rgba(255,100,80,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
  ctx.globalCompositeOperation = 'source-over';
});
bench('drawImage fullscreen blit', () => { ctx.drawImage(canvas, 0, 0); });
bench('1000 small fillRect', () => {
  for (let i = 0; i < 1000; i++) { ctx.fillStyle = 'rgba(200,220,180,.4)'; ctx.fillRect(i % 1900, (i * 7) % 1080, 4, 3); }
});
bench('6000 small fillRect', () => {
  for (let i = 0; i < 6000; i++) { ctx.fillStyle = 'rgba(200,220,180,.4)'; ctx.fillRect(i % 1900, (i * 7) % 1080, 4, 3); }
});
bench('40 radial gradients small', () => {
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(i * 20, 500, 2, i * 20, 500, 60);
    g.addColorStop(0, 'rgba(255,200,120,.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(i * 20, 500, 60, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
});
