// Validate every JIZURA part key used by data/jizura_direction.json against the live registry.
// node tools/validate_jizura_direction.mjs
// The direction table names engine parts by key; a typo there silently disables an effect,
// so this check runs before every JIZURA render.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const engine = path.join(root, 'jizura', 'app', 'jizura_engine.js');

const ctxStub = new Proxy({}, { get: (t, k) => {
  if (k === 'canvas') return { width: 1920, height: 1080 };
  if (k === 'measureText') return () => ({ width: 100, actualBoundingBoxAscent: 80, actualBoundingBoxDescent: 20 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
  return () => undefined;
} });
globalThis.window = globalThis; globalThis.self = globalThis;
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {}, appendChild() {}, setAttribute() {} }),
  createElementNS: () => ({ width: 0, height: 0, getContext: () => ctxStub, style: {} }),
  body: { appendChild() {} }, head: { appendChild() {} }, documentElement: { style: {} },
  fonts: { load: async () => [], ready: Promise.resolve(), check: () => true },
  addEventListener() {}, removeEventListener() {},
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', language: 'ja-JP' }, configurable: true }); } catch {}

new Function(fs.readFileSync(engine, 'utf8'))();
const J = globalThis.J;
const dir = JSON.parse(fs.readFileSync(path.join(root, 'data', 'jizura_direction.json'), 'utf8'));

const groups = { layout: 'layout', enter: 'enter', exit: 'exit', hold: 'hold', decor: 'decor', treat: 'treat', cam: 'cam', trans: 'trans' };
const bad = [];
const check = (group, key, where) => {
  if (!key || key === 'none') return;
  const g = groups[group];
  if (!J.order(g).includes(key)) bad.push(`${group}.${key}  (${where})`);
};

for (const [name, plan] of Object.entries(dir.plans)) {
  if (!J.STYLES[plan.style]) bad.push(`style ${plan.style} (plan ${name})`);
  const st = J.STYLES[plan.style];
  if (st) for (const i of plan.schemes) if (!st.schemes[i]) bad.push(`scheme ${plan.style}[${i}] (plan ${name})`);
}
for (const line of dir.lines) {
  const where = `L${String(line.index + 1).padStart(3, '0')} ${line.move}`;
  check('layout', line.layout, where); check('enter', line.enter, where); check('exit', line.exit, where);
  check('hold', line.hold, where); check('treat', line.treat, where); check('cam', line.cam, where);
  check('trans', line.trans, where);
  for (const d of line.decor || []) check('decor', d, where);
  if (line.cutTech) for (const [k, tech] of Object.entries(line.cutTech)) {
    for (const [field, value] of Object.entries(tech)) {
      if (field === 'decor') { for (const d of value || []) check('decor', d, `${where} cut${k}`); continue; }
      check(field, value, `${where} cut${k}`);
    }
  }
  if (line.break && line.cuts !== line.break.split('/').length) bad.push(`cuts ${line.cuts} != parts ${line.break.split('/').length} ({where})`);
  if (!dir.plans[line.plan]) bad.push(`plan ${line.plan} (${where})`);
  if (line.family && !(dir.polarities || {})[line.family]) bad.push(`family ${line.family} has no polarities (${where})`);
}
for (const [family, pair] of Object.entries(dir.polarities || {})) {
  if (pair.length !== 2) bad.push(`polarity pair for ${family} is not a pair`);
  for (const name of pair) if (!dir.plans[name]) bad.push(`polarity ${family} -> unknown plan ${name}`);
}
for (const [name, move] of Object.entries(dir.moves)) if (!dir.plans[move.plan]) bad.push(`move ${name} -> unknown plan ${move.plan}`);

if (bad.length) { console.log('INVALID KEYS:'); for (const b of [...new Set(bad)]) console.log('  ' + b); process.exitCode = 1; }
else console.log(`all part keys valid: ${dir.lines.length} lines, ${Object.keys(dir.moves).length} moves, ${Object.keys(dir.plans).length} plans`);
