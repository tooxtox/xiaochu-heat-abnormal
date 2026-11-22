import { replaceShotRanges } from './v16_edit.mjs';

export function applyV17Edit(data, front) {
  replaceShotRanges(data, [front]);
  data.frontEdit = { start: front.start, end: front.end };
  Object.assign(data.config.images, {
    v17Dial: 'assets/character/v17/dial.png',
    v17Profile: 'assets/character/v17/profile.png',
    v17Brace: 'assets/character/v17/brace.png',
  });
}
