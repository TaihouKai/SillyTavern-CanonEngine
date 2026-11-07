// Rewrites a history pack's whole-list changes as who joins and who leaves: every event effect and outcome that sets
// an entity set (an organization's members) becomes "add"/"remove" of the difference from the set as it stood before
// that event (initial state, then the events in time order). With --slot <predicate> (repeatable; default: leader),
// a single-value fact handed over by events becomes "remove" of the previous value and "add" of the new one, so a
// value play put there (a leader the Persona made) is kept.
// Usage: node scripts/members-to-changes.mjs <pack.json> [--out <file>] [--slot leader]
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
if (!file) { console.error('usage: node scripts/members-to-changes.mjs <pack.json> [--out <file>] [--slot <predicate>]'); process.exit(2); }
const opt = (k) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : null; };
const slots = new Set(args.flatMap((a, i) => (a === '--slot' ? [args[i + 1]] : [])));
if (!slots.size) slots.add('leader');
const out = opt('--out') || file;

const text = readFileSync(file, 'utf8');
const pack = JSON.parse(text);
const indent = (/^\{\r?\n( +)/.exec(text) || [, '  '])[1].length; // keep the file's own indentation
const sets = new Set(pack.predicates.filter((p) => p.value_type === 'entity_set').map((p) => p.id));
const isSlot = (p) => slots.has(p) && pack.predicates.some((x) => x.id === p && x.value_type === 'entity_ref');
const key = (e, p) => `${e}|${p}`;
const value = new Map();
for (const f of pack.initial_state.facts) value.set(key(f.fact.entity_id, f.fact.predicate), f.fact.value);

const tick = (t) => (t ? t.day * 1440 + t.minute : Infinity);
const order = pack.events.map((ev, i) => ({ ev, i })).sort((a, b) => tick(a.ev.when.earliest) - tick(b.ev.when.earliest) || a.i - b.i);
let changed = 0;
for (const { ev } of order) {
  const fx = [];
  const outcomeChanges = new Map(); // key -> {add, remove} for outcomes
  for (const ef of ev.canonical_effects) {
    const e = ef.op === 'set' ? ef.fact.entity_id : ef.entity_id;
    const p = ef.op === 'set' ? ef.fact.predicate : ef.predicate;
    const k = key(e, p);
    const before = value.get(k);
    if (sets.has(p) && (ef.op === 'set' || ef.op === 'unset')) {
      const had = Array.isArray(before) ? before : [];
      const now = ef.op === 'set' ? ef.fact.value : [];
      const add = now.filter((x) => !had.includes(x)), remove = had.filter((x) => !now.includes(x));
      if (add.length) fx.push({ op: 'add', entity_id: e, predicate: p, value: add });
      if (remove.length) fx.push({ op: 'remove', entity_id: e, predicate: p, value: remove });
      outcomeChanges.set(k, { add, remove });
      value.set(k, now);
      changed++;
      continue;
    }
    if (isSlot(p) && (ef.op === 'set' || ef.op === 'unset')) {
      if (typeof before === 'string' && !(ef.op === 'set' && ef.fact.value === before)) fx.push({ op: 'remove', entity_id: e, predicate: p, value: before });
      if (ef.op === 'set' && ef.fact.value !== before) fx.push({ op: 'add', entity_id: e, predicate: p, value: ef.fact.value });
      value.set(k, ef.op === 'set' ? ef.fact.value : undefined);
      changed++;
      continue;
    }
    if (ef.op === 'set') value.set(k, ef.fact.value);
    else if (ef.op === 'unset') value.delete(k);
    else if (sets.has(p)) {
      const had = Array.isArray(before) ? before : [];
      value.set(k, ef.op === 'add' ? [...had, ...ef.value.filter((x) => !had.includes(x))] : had.filter((x) => !ef.value.includes(x)));
    }
    fx.push(ef);
  }
  ev.canonical_effects = fx;
  // outcomes: a whole list becomes the ids that join (and, as a separate outcome, those that leave)
  ev.outcomes = ev.outcomes.flatMap((o) => {
    if (o.op || !(sets.has(o.predicate) || isSlot(o.predicate))) return [o];
    if (isSlot(o.predicate)) return [{ op: 'add', entity_id: o.entity_id, predicate: o.predicate, value: o.value }];
    const c = outcomeChanges.get(key(o.entity_id, o.predicate));
    if (!c) return [];
    return [...(c.add.length ? [{ op: 'add', entity_id: o.entity_id, predicate: o.predicate, value: c.add }] : []), ...(c.remove.length ? [{ op: 'remove', entity_id: o.entity_id, predicate: o.predicate, value: c.remove }] : [])];
  });
}
const nl = String.fromCharCode(10);
writeFileSync(out, JSON.stringify(pack, null, indent) + (text.endsWith(nl) ? nl : ''));
console.log(`${file}: ${changed} effects rewritten as add/remove -> ${out}`);
