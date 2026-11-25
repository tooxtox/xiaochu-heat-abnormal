export const DIVE_START = 229.63333333333333;
export const IMPACT_BEAT = 13876 / 60;
export const DIVE_END = 231.6;

export function impactAge(time) {
  return time - IMPACT_BEAT;
}

export function drawImpactExposure(ctx, time) {
  const age = impactAge(time) + 1e-8;
  if (age < 0) return;
  const glow = ctx.createRadialGradient(960, 625, 12, 960, 625, 1090);
  glow.addColorStop(0, '#fff2da');
  glow.addColorStop(.17, '#ff4840');
  glow.addColorStop(.47, '#f60a1d');
  glow.addColorStop(1, '#ab001e00');
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = .83 * Math.exp(-age * 6);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.globalAlpha = .48 * Math.exp(-age * 42);
  ctx.fillStyle = '#ff202e';
  ctx.fillRect(0, 0, 1920, 1080);
  ctx.restore();
}
