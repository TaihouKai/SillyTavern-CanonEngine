// canon-lint: structural + semantic validation of .canon.json history packs (no SillyTavern needed).
// Usage: node dist/canon-lint.mjs <pack.canon.json> [--json]
import { readFileSync } from 'node:fs';
import { validatePackText } from '../domain/pack';
import { formatTick } from '../domain/time';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('usage: node dist/canon-lint.mjs <pack.canon.json> [--json]');
  process.exit(2);
}
let failed = false;
const reports: unknown[] = [];
for (const f of files) {
  const r = validatePackText(readFileSync(f, 'utf8'));
  failed ||= !r.ok;
  const L = r.loaded;
  const report = {
    file: f,
    ok: r.ok,
    errors: r.errors,
    warnings: r.warnings,
    summary: L ? {
      pack: `${L.pack.pack_id}@${L.pack.pack_version}`, title: L.pack.title, hash: L.hash,
      coverage: `${formatTick(L.coverage.start)} – ${formatTick(L.coverage.end)}`,
      events: L.pack.events.length, entities: L.pack.entities.length, unknownTime: L.unknownTimeEvents.length,
      classification: L.pack.events.map((e) => ({ id: e.id, class: e.classification, when: e.when.label, required: e.required_description })),
    } : null,
  };
  reports.push(report);
  if (!asJson) {
    console.log(`\n${f}: ${r.ok ? 'VALID' : 'INVALID'}`);
    for (const e of r.errors) console.log(`  ERROR   ${e.path || '/'}  ${e.message}`);
    for (const w of r.warnings) console.log(`  WARNING ${w.path || '/'}  ${w.message}`);
    if (report.summary) {
      const s = report.summary;
      console.log(`  ${s.title} (${s.pack}) hash ${s.hash.slice(0, 12)}; coverage ${s.coverage}; ${s.events} events, ${s.entities} entities, ${s.unknownTime} unknown-time`);
      for (const c of s.classification) console.log(`    ${c.class.padEnd(4)} ${c.id}  [${c.when}]${c.required ? '  REQUIRED: ' + c.required : ''}`);
    }
  }
}
if (asJson) console.log(JSON.stringify(reports, null, 1));
process.exit(failed ? 1 : 0);
