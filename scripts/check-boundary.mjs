// Keeps the engine apart from its hosts: src/core imports nothing outside src/core (and the schemas) and uses no host globals
// (SillyTavern, its scripts, jQuery, toastr); a host (src/hosts/*) and the site's demo use the core only through
// src/core/index.ts. Run by npm run build and npm test.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = process.cwd();
const rel = (p) => relative(root, p).split(sep).join('/');
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && !/\.d\.ts$/.test(f) ? [p] : []; });
// import/export statements (static, re-exports, side-effect imports) and import('...') in types or code
const specs = (src) => [
  ...[...src.matchAll(/^\s*(?:import|export)\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
  ...[...src.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
  ...[...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]),
];
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const problems = [];

for (const f of walk('src/core')) {
  const src = readFileSync(f, 'utf8');
  for (const s of specs(src)) {
    if (!s.startsWith('.')) { if (!/^node:/.test(s)) problems.push(`${rel(f)}: imports package "${s}" (the core bundles no packages)`); else problems.push(`${rel(f)}: imports "${s}" (the core runs in any JavaScript host)`); continue; }
    const target = rel(resolve(dirname(f), s));
    // the task and pack schemas (schemas/) are the engine's own contracts
    if (!target.startsWith('src/core/') && !target.startsWith('schemas/')) problems.push(`${rel(f)}: imports ${target}, outside the core`);
  }
  const body = code(src);
  for (const [re, what] of [[/\bSillyTavern\s*\./, 'the SillyTavern global'], [/['"`]\/scripts?\//, 'a SillyTavern script path'], [/\bjQuery\b|\$\(\s*['"`]/, 'jQuery'], [/\btoastr\b/, 'toastr'], [/\bgetContext\(\)/, 'getContext()']]) {
    if (re.test(body)) problems.push(`${rel(f)}: uses ${what}`);
  }
}
for (const f of [...walk('src/hosts'), ...walk('site/src')]) {
  for (const s of specs(readFileSync(f, 'utf8'))) {
    if (!s.startsWith('.')) continue;
    const target = rel(resolve(dirname(f), s));
    if (target.startsWith('src/core/') && target !== 'src/core/index' && target !== 'src/core/index.ts') problems.push(`${rel(f)}: imports ${target}; a host uses the core through src/core/index.ts`);
  }
}
// Feature modules: 战斗 (src/core/combat) and 主动敌对 (src/core/hostility). The rest of the core uses each through its
// index.ts. Only the domain layer reaches their pure parts directly (pack loading indexes the combat graph, the reducer
// replays the changes), and the prompt registry their prompt text. A module does not reach into the engine, the gate
// or the UI, and uses another module through that one's index.ts too.
const MODULES = {
  combat: { 'src/core/combat/graph': ['src/core/domain/'], 'src/core/combat/state': ['src/core/domain/'], 'src/core/combat/prompts': ['src/core/runtime/prompts.ts'] },
  hostility: { 'src/core/hostility/state': ['src/core/domain/'], 'src/core/hostility/prompts': ['src/core/runtime/prompts.ts'] },
};
for (const f of walk('src/core')) {
  const from = rel(f);
  for (const s of specs(readFileSync(f, 'utf8'))) {
    if (!s.startsWith('.')) continue;
    const target = rel(resolve(dirname(f), s)).replace(/\.ts$/, '');
    for (const [m, direct] of Object.entries(MODULES)) {
      const dir = `src/core/${m}/`;
      if (from.startsWith(dir)) {
        if (/^src\/core\/(runtime\/(engine|gate)|ui\/)/.test(target)) problems.push(`${from}: imports ${target}; the ${m} module does not reach into the engine, the gate or the UI`);
        continue;
      }
      if (!target.startsWith(dir) || target === `${dir}index`) continue;
      if (!(direct[target] || []).some((p) => from.startsWith(p))) problems.push(`${from}: imports ${target}; the core uses ${m} through ${dir}index.ts`);
    }
  }
}
if (problems.length) { console.error('Boundary problems:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('boundary ok: src/core stands alone; hosts use src/core/index.ts; combat and hostility are used through their index.ts');
