// Compares two prompt logs written by the unit tests (PROMPT_LOG=<dir> npx vitest run): every request the engine
// sent a model, per test. Random ids are masked and each test's requests compared as a set (parallel calls may come
// in either order). Usage: node scripts/prompt-log-compare.mjs <before-dir> <after-dir>
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const [a, b] = process.argv.slice(2);
const mask = (s) => s.replace(/\b([a-z]+)_[0-9a-f]{8,24}\b/g, '$1_ID').replace(/\b(rt\.[^\s\]"\\]*\.)[0-9a-f]{6}\b/g, '$1HEX');
const load = (dir) => {
  const out = new Map();
  for (const f of readdirSync(dir)) for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line), key = `${f} :: ${r.test}`;
    const text = mask(JSON.stringify({ task: r.task, payload: r.payload }));
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(text);
  }
  for (const v of out.values()) v.sort();
  return out;
};
if (!existsSync(a) || !existsSync(b)) { console.error('usage: prompt-log-compare <before> <after>'); process.exit(2); }
const A = load(a), B = load(b);
let diff = 0, n = 0;
for (const k of new Set([...A.keys(), ...B.keys()])) {
  const x = A.get(k) || [], y = B.get(k) || [];
  n += x.length;
  const h = (v) => createHash('sha256').update(v.join('\n')).digest('hex');
  if (h(x) === h(y)) continue;
  diff++;
  console.log(`DIFFERENT  ${k}  (${x.length} → ${y.length} requests)`);
  const ys = new Set(y);
  const first = x.find((t) => !ys.has(t));
  if (first) {
    const other = y.find((t) => !new Set(x).has(t)) || '';
    let i = 0; while (i < first.length && first[i] === other[i]) i++;
    console.log('  before: …' + first.slice(Math.max(0, i - 120), i + 200));
    console.log('  after:  …' + other.slice(Math.max(0, i - 120), i + 200));
  }
}
console.log(`${A.size} tests, ${n} requests compared; ${diff} tests differ`);
process.exit(diff ? 1 : 0);
