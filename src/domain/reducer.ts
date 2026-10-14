// Pure history replay: baseline + ordered validated ledger records -> world state.
// Occurrences are kept separate from fluent state; a later reversal never erases an occurrence.
import type { Condition, FactDelta, FactValue, Id, LedgerRecord, Occurrence, RuntimeEntity, StoryTime, Tri } from './types';
import { UNKNOWN } from './types';
import type { LoadedPack } from './pack';
import { normalizeValue, valuesEqual } from './pack';

export interface Transition {
  tick: number;
  tickHi: number;
  seq: number;
  op: 'set' | 'unset';
  value?: FactValue;
  recordId: string;
  kind: LedgerRecord['kind'];
}

export interface OccurrenceEntry extends Occurrence {
  recordId: string;
  seq: number;
  commitId: string;
  kind: LedgerRecord['kind'];
  sourceMessageIds: string[];
}

export interface Disposition {
  disposition: 'occurred' | 'diverged' | 'omitted';
  recordId: string;
  occurrenceId?: string;
  tick: number;
  reason?: string;
  seq: number;
}

export interface WorldState {
  packHash: string;
  facts: Map<string, Transition[]>;
  occurrences: Map<string, OccurrenceEntry>;
  dispositions: Map<Id, Disposition>;
  declines: Map<Id, string>;
  runtimeEntities: Map<Id, RuntimeEntity & { recordId: string }>;
  enactedSteps: Map<string, string>;
  clock: StoryTime;
  records: LedgerRecord[];
  recordById: Map<string, LedgerRecord>;
  lastSeq: number;
}

export const factKey = (entity: Id, predicate: Id) => `${entity}|${predicate}`;
export const splitKey = (k: string) => { const i = k.indexOf('|'); return { entity_id: k.slice(0, i), predicate: k.slice(i + 1) }; };

export function emptyState(pack: LoadedPack): WorldState {
  return {
    packHash: pack.hash,
    facts: new Map(),
    occurrences: new Map(),
    dispositions: new Map(),
    declines: new Map(),
    runtimeEntities: new Map(),
    enactedSteps: new Map(),
    clock: { lo: pack.coverage.start, hi: pack.coverage.start, precision: 'minute' },
    records: [],
    recordById: new Map(),
    lastSeq: 0,
  };
}

/** Apply one record. Idempotent: re-applying the same recordId is a no-op (P16). */
export function applyRecord(state: WorldState, rec: LedgerRecord): void {
  if (state.recordById.has(rec.recordId)) return;
  state.recordById.set(rec.recordId, rec);
  state.records.push(rec);
  state.lastSeq = Math.max(state.lastSeq, rec.sequence);
  const tick = rec.storyTime.lo;
  for (const d of rec.factsSetOrUnset) applyDelta(state, d, rec, tick);
  for (const occ of rec.occurrences || []) {
    if (state.occurrences.has(occ.occurrenceId)) continue;
    state.occurrences.set(occ.occurrenceId, {
      ...occ,
      recordId: rec.recordId,
      seq: rec.sequence,
      commitId: rec.commitId,
      kind: rec.kind,
      sourceMessageIds: rec.sourceRefs.map((s) => s.messageId),
    });
  }
  if (rec.packEventId && rec.disposition && !state.dispositions.has(rec.packEventId)) {
    state.dispositions.set(rec.packEventId, {
      disposition: rec.disposition,
      recordId: rec.recordId,
      occurrenceId: rec.eventOccurrenceIds[0],
      tick,
      reason: rec.dispositionReason,
      seq: rec.sequence,
    });
  }
  if (rec.kind === 'participation_decline' && rec.declinedEventId) state.declines.set(rec.declinedEventId, rec.recordId);
  for (const re of rec.runtimeEntities || []) if (!state.runtimeEntities.has(re.id)) state.runtimeEntities.set(re.id, { ...re, recordId: rec.recordId });
  for (const s of rec.enactedStepIds || []) if (!state.enactedSteps.has(s)) state.enactedSteps.set(s, rec.recordId);
  // The committed clock moves only through time-advance/bootstrap records and never backwards;
  // flashbacks change scene framing, not the world clock.
  if ((rec.kind === 'time_advance' || rec.kind === 'initial_bootstrap') && rec.storyTime.lo >= state.clock.lo) {
    state.clock = { ...rec.storyTime };
  }
}

function applyDelta(state: WorldState, d: FactDelta, rec: LedgerRecord, tick: number) {
  const k = factKey(d.entity_id, d.predicate);
  const list = state.facts.get(k) || [];
  list.push({
    tick,
    tickHi: rec.storyTime.hi,
    seq: rec.sequence,
    op: d.op,
    value: d.op === 'set' ? normalizeValue(d.value) : undefined,
    recordId: rec.recordId,
    kind: rec.kind,
  });
  // keep ordered by (tick, seq)
  list.sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  state.facts.set(k, list);
}

export function reduce(pack: LoadedPack, records: LedgerRecord[]): WorldState {
  const s = emptyState(pack);
  const ordered = [...records].sort((a, b) => a.sequence - b.sequence);
  for (const r of ordered) applyRecord(s, r);
  return s;
}

export interface Checkpoint { tick: number; seq?: number }

export interface FactAt {
  known: boolean;
  value?: FactValue;
  validFrom?: number;
  supportRecordId?: string;
  /** Transitions whose uncertain time overlaps the checkpoint (reported, never silently resolved). */
  uncertain: Transition[];
}

/** Value of a fact at a checkpoint (tick, optional sequence bound). */
export function factAt(state: WorldState, entity: Id, predicate: Id, cp?: Checkpoint): FactAt {
  const list = state.facts.get(factKey(entity, predicate)) || [];
  let cur: Transition | undefined;
  const uncertain: Transition[] = [];
  for (const t of list) {
    if (cp) {
      if (cp.seq !== undefined && t.seq > cp.seq) continue;
      if (t.tick > cp.tick) continue;
      if (t.tickHi > cp.tick && t.tick < cp.tick) uncertain.push(t);
    }
    cur = t;
  }
  if (!cur || cur.op === 'unset') return { known: false, uncertain, supportRecordId: cur?.recordId };
  return { known: true, value: cur.value, validFrom: cur.tick, supportRecordId: cur.recordId, uncertain };
}

export function currentFacts(state: WorldState, cp?: Checkpoint): Map<string, FactAt> {
  const out = new Map<string, FactAt>();
  for (const k of state.facts.keys()) {
    const { entity_id, predicate } = splitKey(k);
    const f = factAt(state, entity_id, predicate, cp);
    if (f.known) out.set(k, f);
  }
  return out;
}

/** All transitions (history) of a fact, independent of the current value. */
export function factHistory(state: WorldState, entity: Id, predicate: Id): Transition[] {
  return [...(state.facts.get(factKey(entity, predicate)) || [])];
}

// ---- Three-valued condition evaluation ---------------------------------------------------------

export function evalCondition(c: Condition, state: WorldState, pack: LoadedPack, cp: Checkpoint): Tri {
  if ('all' in c) {
    let unknown = false;
    for (const x of c.all) {
      const v = evalCondition(x, state, pack, cp);
      if (v === false) return false;
      if (v === UNKNOWN) unknown = true;
    }
    return unknown ? UNKNOWN : true;
  }
  if ('any' in c) {
    let unknown = false;
    for (const x of c.any) {
      const v = evalCondition(x, state, pack, cp);
      if (v === true) return true;
      if (v === UNKNOWN) unknown = true;
    }
    return unknown ? UNKNOWN : false;
  }
  if ('not' in c) {
    const v = evalCondition(c.not, state, pack, cp);
    return v === UNKNOWN ? UNKNOWN : !v;
  }
  if ('fact' in c) {
    const f = factAt(state, c.fact.entity_id, c.fact.predicate, cp);
    if (!f.known) return UNKNOWN;
    return valuesEqual(f.value!, c.fact.value);
  }
  // occurred
  const d = state.dispositions.get(c.occurred);
  if (d) {
    if (d.tick > cp.tick) return false;
    return d.disposition === 'occurred';
  }
  const ev = pack.events.get(c.occurred);
  const idx = pack.timeIndex.find((t) => t.id === c.occurred);
  if (!ev || !idx) return false; // unknown-time canon is never accomplished history
  if (idx.lo > cp.tick) return false; // future
  return UNKNOWN; // window reached/passed but unresolved
}

export function triLabel(v: Tri): 'TRUE' | 'FALSE' | 'UNKNOWN' {
  return v === UNKNOWN ? 'UNKNOWN' : v ? 'TRUE' : 'FALSE';
}
