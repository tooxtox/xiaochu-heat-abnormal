// Privacy / secret scan before publishing the project to a public repository.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SKIP_DIRS = new Set(['.git', 'node_modules', 'export', 'work', '__pycache__']);
const PATTERNS = [
  ['absolute-user-path', /[A-Za-z]:[\\/]Users[\\/][^\\/"'\s]+/g],
  ['unix-home-path', /\/home\/[A-Za-z0-9._-]+/g],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  ['github-token', /gh[pousr]_[A-Za-z0-9]{16,}/g],
  ['openai-key', /sk-[A-Za-z0-9_-]{20,}/g],
  ['aws-key', /AKIA[0-9A-Z]{16}/g],
  ['generic-secret-assignment', /(?:api[_-]?key|secret|passwd|password|token|access[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/gi],
  ['bearer-header', /authorization\s*:\s*bearer\s+\S{12,}/gi],
  ['phone-cn', /(?<!\d)1[3-9]\d{9}(?!\d)/g],
  ['id-cn', /(?<!\d)\d{17}[\dXx](?!\d)/g],
];

const hits = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full);
      continue;
    }
    if (/\.(png|jpg|jpeg|gif|webp|mp4|m4a|ttf|otf|woff2?|mp3|wav)$/i.test(entry)) continue;
    if (st.size > 4 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(full, 'utf8'); } catch { continue; }
    const rel = path.relative(root, full);
    for (const [name, re] of PATTERNS) {
      const found = [...text.matchAll(re)];
      for (const match of found) {
        const line = text.slice(0, match.index).split('\n').length;
        hits.push({ file: rel, line, kind: name, sample: match[0].slice(0, 70) });
      }
    }
  }
};
walk(root);

const byKind = new Map();
for (const hit of hits) {
  if (!byKind.has(hit.kind)) byKind.set(hit.kind, []);
  byKind.get(hit.kind).push(hit);
}
console.log(`scanned tree (export/ work/ node_modules/ skipped) — ${hits.length} hits`);
for (const [kind, list] of byKind) {
  console.log(`\n== ${kind} (${list.length})`);
  const files = [...new Set(list.map(h => `${h.file}:${h.line}`))];
  files.slice(0, 14).forEach(f => console.log('   ' + f));
  if (files.length > 14) console.log(`   … +${files.length - 14} more`);
  console.log('   sample:', JSON.stringify(list[0].sample));
}
