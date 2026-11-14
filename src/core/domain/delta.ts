// Fact changes: canonical effects, outcomes and record deltas. add/remove change a fact by what joins or leaves it
// (see Effect); the reducer applies them to the fact as it stands at the record's time.
import type { Effect, FactDelta, FactValue, Id, Outcome } from './types';
import { normalizeValue, valuesEqual } from './pack';

/** The fact an effect writes. */
export const effectTarget = (ef: Effect): { entity_id: Id; predicate: Id } =>
  ef.op === 'set' ? { entity_id: ef.fact.entity_id, predicate: ef.fact.predicate } : { entity_id: ef.entity_id, predicate: ef.predicate };

export function effectToDelta(e: Effect): FactDelta {
  const until = e.op !== 'unset' && e.until && e.until !== 'lasting' ? { until: e.until } : {};
  if (e.op === 'set') return { op: 'set', entity_id: e.fact.entity_id, predicate: e.fact.predicate, value: e.fact.value, ...until };
  if (e.op === 'unset') return { op: 'unset', entity_id: e.entity_id, predicate: e.predicate };
  return { op: e.op, entity_id: e.entity_id, predicate: e.predicate, value: e.value, ...until };
}

export const outcomeDelta = (o: Outcome): FactDelta => ({ op: o.op || 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value });

const items = (v: FactValue): FactValue[] => (Array.isArray(v) ? v : [v]);

/** Whether a delta brings about an outcome: the same value set, or (add/remove) at least the outcome's ids moved. */
export function deltaMeets(d: FactDelta, o: Outcome): boolean {
  if (d.entity_id !== o.entity_id || d.predicate !== o.predicate || d.op !== (o.op || 'set')) return false;
  if (d.op === 'set') return valuesEqual(d.value, o.value);
  const got = items(d.value);
  return items(o.value).every((w) => got.some((g) => valuesEqual(g, w)));
}

/** A delta applied to the value a fact has (unknown: undefined). Returns the new value, or undefined when the fact
 *  ends up unknown; `same` when it changes nothing. */
export function applyChange(cur: FactValue | undefined, d: FactDelta): { value: FactValue | undefined } | 'same' {
  if (d.op === 'set') return { value: d.value };
  if (d.op === 'unset') return { value: undefined };
  if (d.op === 'remove' && cur === undefined) return 'same';
  if (Array.isArray(cur) || (cur === undefined && Array.isArray(d.value))) {
    const list: string[] = Array.isArray(cur) ? cur : [];
    const moved = items(d.value).map(String);
    const next = d.op === 'add' ? [...list, ...moved.filter((x) => !list.includes(x))] : list.filter((c) => !moved.includes(c));
    return valuesEqual(next, list) && cur !== undefined ? 'same' : { value: normalizeValue(next) };
  }
  // a single value: add fills it when vacant; remove empties it when it holds that value
  if (d.op === 'add') return cur === undefined ? { value: d.value } : 'same';
  return cur !== undefined && valuesEqual(cur, d.value) ? { value: undefined } : 'same';
}

/** A delta as text: X.members +[a, b] / −[c]; X.p=v; X.p unset. */
export function deltaText(d: FactDelta, name: (id: Id) => string = (x) => x): string {
  const who = `${name(d.entity_id)}.${d.predicate}`;
  if (d.op === 'unset') return `${who} unset`;
  const show = (v: FactValue) => (Array.isArray(v) ? `[${v.map((x) => name(String(x))).join(', ')}]` : typeof v === 'string' ? name(v) : JSON.stringify(v));
  if (d.op === 'set') return `${who}=${show(d.value)}`;
  return `${who} ${d.op === 'add' ? '+' : '−'}${show(d.value)}`;
}

/** The deltas with every outcome they do not bring about yet added. */
export function withOutcomes(deltas: FactDelta[], outcomes: Outcome[]): FactDelta[] {
  for (const o of outcomes) if (!deltas.some((d) => deltaMeets(d, o))) deltas.push(outcomeDelta(o));
  return deltas;
}
