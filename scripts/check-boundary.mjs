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
if (problems.length) { console.error('Boundary problems:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log('boundary ok: src/core stands alone; hosts use src/core/index.ts');
