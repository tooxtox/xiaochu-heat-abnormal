import { editorialShotAt } from './transitions.mjs';
import { finaleVisual } from './v20_edit.mjs';

const BASE = [0, 0, 1, 1, 0];

function framing(data, shot, time) {
  const visual = finaleVisual(data, time, shot);
  if (visual === null) return BASE;
  if (shot.mode === 'eye') return [-46, 112, .82, .88, 0];
  if (shot.mode === 'hand') return [-108, -96, .83, .87, -.025];
  if (shot.mode === 'portrait') {
    const right = visual !== 8 && (visual === 5 || shot.pose === 'v17Profile');
    return [right ? 204 : -204, -16, .74, .91, right ? .035 : -.035];
  }
  if (visual === 8) return [0, -18, .88, 1.03, 0];
  if (shot.starFocus) return [0, 32, 1.02, .80, -.095];
  if (shot.mode === 'abstract') return [-34, -39, .93, .96, .055];
  return [25, 39, .97, .87, -.048];
}

export function finaleLyricFraming(data, time, lineStart) {
  const end = data.finaleEdit.end;
  if (time >= end) return { x: 0, y: 0, sx: 1, sy: 1, shear: 0 };
  const shot = editorialShotAt(data, time);
  const previousTime = shot.start - 1 / 60;
  const previous = previousTime < lineStart || previousTime < data.finaleEdit.start
    ? BASE
    : framing(data, editorialShotAt(data, previousTime), previousTime);
  const target = framing(data, shot, time);
  const age = Math.max(0, time - shot.start);
  const blend = 1 - (1 - Math.min(1, age / .115)) ** 3;
  const tail = Math.min(1, (end - time) / .16);
  const strike = Math.exp(-age * 26) * (shot.rhythm?.level ?? 0) * tail;
  const [x, y, sx, sy, shear] = BASE.map((neutral, index) =>
    neutral + ((1 - blend) * previous[index] + blend * target[index] - neutral) * tail);
  return { x, y: y - 7 * strike, sx: sx * (1 + .027 * strike), sy, shear };
}
