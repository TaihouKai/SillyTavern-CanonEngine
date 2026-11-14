// Pure history replay: baseline + ordered validated ledger records -> world state.
// Occurrences are kept separate from fluent state; a later reversal never erases an occurrence.
import type { Condition, ContactInfo, EngagementInfo, TieInfo, FactDelta, FactValue, Id, LedgerRecord, Occurrence, RuntimeEntity, StoryTime, Tri } from './types';
import { UNKNOWN } from './types';
import type { LoadedPack } from './pack';
import { normalizeValue, valuesEqual } from './pack';
import { applyChange } from './delta';

export interface Transition {
  tick: number;
  tickHi: number;
  seq: number;
  op: 'set' | 'unset';
  value?: FactValue;
  recordId: string;
  kind: LedgerRecord['kind'];
  /** An add/remove as it was given. Its value is the fact as it stands before it with this applied, and is worked
   *  out again when a change is put in at an earlier time (a record's time can lie before changes already there). */
  change?: { op: 'add' | 'remove'; value: FactValue };
  /** Over from this tick on (its effect said for how long, or until when); then the fact is what it was before. */
  end?: number;
  /** Over once this event is settled, if that comes before `end` (its window end). */
  untilEvent?: Id;
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

/** A player decision or a contact as replayed (record order = sequence). */
export interface EngagementEntry extends EngagementInfo { recordId: string; seq: number; tick: number }
export interface ContactEntry extends ContactInfo { recordId: string; seq: number; tick: number }
export interface TieEntry extends TieInfo { recordId: string; seq: number; tick: number }

export interface WorldState {
  packHash: string;
  facts: Map<string, Transition[]>;
  /** add/remove changes that change nothing where they stand (not part of a fact's history; one may come to change
   *  something when an earlier change is put in before it). */
  idleChanges: Map<string, Transition[]>;
  occurrences: Map<string, OccurrenceEntry>;
  dispositions: Map<Id, Disposition>;
  declines: Map<Id, string>;
  /** Narrative integration: the player's decisions and the contacts that reached them, in record order. */
  engagements: EngagementEntry[];
  contacts: ContactEntry[];
  /** The player's relationships and who knows what about them, as play changed them (record order). */
  ties: TieEntry[];
  runtimeEntities: Map<Id, RuntimeEntity & { recordId: string }>;
  enactedSteps: Map<string, string>;
  clock: StoryTime;
  /** The time frame the scene is in (scene_frame records; null: the main frame, never changed). */
  sceneFrame: { frameId: Id; since: number; recordId: string } | null;
  /** Per entity: a running digest of the messages so far that are about it (their text, in order). Kept by the
   *  replay; a later message about the entity is valid only for the digest it was examined with. */
  told: Map<Id, string>;
  /** The latest time of each event of the pack: an effect that holds until an event is over by then. */
  eventEnds: Map<Id, number>;
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
    idleChanges: new Map(),
    occurrences: new Map(),
    dispositions: new Map(),
    declines: new Map(),
    engagements: [],
    contacts: [],
    ties: [],
    runtimeEntities: new Map(),
    enactedSteps: new Map(),
    clock: { lo: pack.coverage.start, hi: pack.coverage.start, precision: 'minute' },
    sceneFrame: null,
    told: new Map(),
    eventEnds: new Map(pack.timeIndex.map((t) => [t.id, t.hi])),
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
  if (rec.packEventId && rec.disposition && (rec.override || !state.dispositions.has(rec.packEventId))) {
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
  if (rec.engagement) state.engagements.push({ ...rec.engagement, recordId: rec.recordId, seq: rec.sequence, tick });
  if (rec.contact) state.contacts.push({ ...rec.contact, recordId: rec.recordId, seq: rec.sequence, tick });
  if (rec.tie) state.ties.push({ ...rec.tie, recordId: rec.recordId, seq: rec.sequence, tick });
  // a later Persona read describes the player (and the Persona's own people, groups, places) anew: it wins
  for (const re of rec.runtimeEntities || []) if (!state.runtimeEntities.has(re.id) || rec.kind === 'persona_seed') state.runtimeEntities.set(re.id, { ...re, recordId: rec.recordId });
  for (const s of rec.enactedStepIds || []) if (!state.enactedSteps.has(s)) state.enactedSteps.set(s, rec.recordId);
  if (rec.kind === 'scene_frame' && rec.frameId) state.sceneFrame = { frameId: rec.frameId, since: tick, recordId: rec.recordId };
  // The committed clock moves only through time-advance/bootstrap records and never backwards;
  // flashbacks change scene framing, not the world clock.
  if ((rec.kind === 'time_advance' || rec.kind === 'initial_bootstrap') && rec.storyTime.lo >= state.clock.lo) {
    state.clock = { ...rec.storyTime };
  }
}

function applyDelta(state: WorldState, d: FactDelta, rec: LedgerRecord, tick: number) {
  const k = factKey(d.entity_id, d.predicate);
  const t: Transition = {
    tick,
    tickHi: rec.storyTime.hi,
    seq: rec.sequence,
    op: d.op === 'unset' ? 'unset' : 'set',
    value: d.op === 'set' ? normalizeValue(d.value) : undefined,
    recordId: rec.recordId,
    kind: rec.kind,
  };
  if (d.op === 'add' || d.op === 'remove') t.change = { op: d.op, value: d.value };
  if (d.op !== 'unset' && d.until && d.until !== 'lasting') {
    if ('minutes' in d.until) t.end = tick + Math.max(1, Math.round(d.until.minutes));
    else { t.untilEvent = d.until.event; t.end = state.eventEnds.get(d.until.event); }
  }
  // ordered by (tick, seq), with the changes that change nothing in their places
  const all = [...(state.facts.get(k) || []), ...(state.idleChanges.get(k) || []), t].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
  // add/remove apply to the fact as it stands at their time: this one, and those after it up to the next set/unset
  // (which stands on nothing before it)
  const list: Transition[] = [], idle: Transition[] = [];
  let at = all.indexOf(t), settled = false;
  for (let i = 0; i < all.length; i++) {
    const x = all[i];
    if (i > at && !x.change) settled = true;
    if (x.change && i >= at && !settled) {
      const cur = list[list.length - 1];
      const r = applyChange(cur && cur.op === 'set' ? cur.value : undefined, { ...x.change, entity_id: d.entity_id, predicate: d.predicate });
      if (r === 'same') { idle.push(x); continue; }
      x.op = r.value === undefined ? 'unset' : 'set';
      x.value = r.value === undefined ? undefined : normalizeValue(r.value);
    } else if (x.change && (state.idleChanges.get(k) || []).includes(x)) { idle.push(x); continue; }
    list.push(x);
  }
  if (list.length) state.facts.set(k, list); else state.facts.delete(k);
  if (idle.length) state.idleChanges.set(k, idle); else state.idleChanges.delete(k);
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
  /** When what holds now is over (it was set for a while); absent: until it is changed. */
  endsAt?: number;
  supportRecordId?: string;
  /** Transitions whose uncertain time overlaps the checkpoint (reported, never silently resolved). */
  uncertain: Transition[];
}

/** Value of a fact at a checkpoint (tick, optional sequence bound). */
/** Whether a transition is over at a time: its end has come, or the event it lasted until is settled by then. */
export function transitionOver(state: WorldState, t: Transition, tick: number): boolean {
  if (t.end !== undefined && tick >= t.end) return true;
  const d = t.untilEvent ? state.dispositions.get(t.untilEvent) : undefined;
  return !!d && d.tick <= tick && d.tick >= t.tick;
}

/** Value of a fact at a checkpoint (tick, optional sequence bound; none: the current clock). A change that held only
 *  for a while is over at its end: the fact is then what the last change still holding made it. */
export function factAt(state: WorldState, entity: Id, predicate: Id, cp?: Checkpoint): FactAt {
  const list = state.facts.get(factKey(entity, predicate)) || [];
  const now = cp ? cp.tick : state.clock.lo;
  let cur: Transition | undefined;
  const uncertain: Transition[] = [];
  for (const t of list) {
    if (cp) {
      if (cp.seq !== undefined && t.seq > cp.seq) continue;
      if (t.tick > cp.tick) continue;
      if (t.tickHi > cp.tick && t.tick < cp.tick) uncertain.push(t);
    }
    if (transitionOver(state, t, now)) continue;
    cur = t;
  }
  if (!cur || cur.op === 'unset') return { known: false, uncertain, supportRecordId: cur?.recordId };
  const endsAt = cur.end !== undefined ? cur.end : undefined;
  return { known: true, value: cur.value, validFrom: cur.tick, supportRecordId: cur.recordId, uncertain, ...(endsAt !== undefined ? { endsAt } : {}) };
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
    // happened differently: it did happen, but whether what depends on it still follows is a judgement on
    // the actual state (adjudicated with the model), not a deterministic yes/no from the original route
    return d.disposition === 'occurred' ? true : d.disposition === 'diverged' ? UNKNOWN : false;
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
