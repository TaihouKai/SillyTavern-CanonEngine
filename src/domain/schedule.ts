// Due-event ordering, crossed-interval collection and deterministic default adjudication.
import type { Effect, FactDelta, Id, LedgerRecord, Occurrence, PackEvent, StoryTime } from './types';
import type { LoadedPack } from './pack';
import type { WorldState } from './reducer';
import { applyRecord, evalCondition, factAt, reduce, triLabel } from './reducer';
import { formatTick } from './time';
import { newId } from './util';
import type { Condition } from './types';

export interface Candidate { event: PackEvent; lo: number; hi: number }

/**
 * Collect every finite-time canonical event that is undisposed and whose interval intersects the
 * proposed advance (from, to]. Includes earlier undisposed windows (missed after a rebuild).
 * Independent of causal graph, scene, location and anchor relevance.
 */
export function crossedCandidates(pack: LoadedPack, state: WorldState, fromExclusive: number, toInclusive: number): Candidate[] {
  const out: Candidate[] = [];
  for (const t of pack.timeIndex) {
    if (t.lo > toInclusive) break;
    if (state.dispositions.has(t.id)) continue;
    if (t.hi <= fromExclusive && t.hi < pack.coverage.start) continue;
    out.push({ event: pack.events.get(t.id)!, lo: t.lo, hi: t.hi });
  }
  return out;
}

/** HARD events whose latest bound is reached by `toInclusive` and which have not occurred. */
export function hardDeadlinesReached(pack: LoadedPack, state: WorldState, toInclusive: number): Candidate[] {
  return crossedCandidates(pack, state, -Infinity, toInclusive).filter((c) => c.event.classification === 'HARD' && c.hi <= toInclusive);
}

/** Pending HARD obligations ordered by deadline (compact register). */
export function pendingHard(pack: LoadedPack, state: WorldState): Candidate[] {
  return pack.timeIndex
    .filter((t) => pack.events.get(t.id)!.classification === 'HARD' && state.dispositions.get(t.id)?.disposition !== 'occurred')
    .map((t) => ({ event: pack.events.get(t.id)!, lo: t.lo, hi: t.hi }));
}

export function effectsToDeltas(effects: Effect[]): FactDelta[] {
  return effects.map((e) => (e.op === 'set' ? { op: 'set', entity_id: e.fact.entity_id, predicate: e.fact.predicate, value: e.fact.value } : { op: 'unset', entity_id: e.entity_id, predicate: e.predicate }));
}

/** Explain which atomic terms of a condition are FALSE/UNKNOWN (for recorded dispositions). */
export function explainCondition(c: Condition, state: WorldState, pack: LoadedPack, tick: number): string[] {
  const out: string[] = [];
  const walk = (x: Condition) => {
    if ('all' in x) x.all.forEach(walk);
    else if ('any' in x) x.any.forEach(walk);
    else if ('not' in x) walk(x.not);
    else {
      const v = evalCondition(x, state, pack, { tick });
      if (v !== true) {
        if ('fact' in x) {
          const f = factAt(state, x.fact.entity_id, x.fact.predicate, { tick });
          out.push(`${x.fact.entity_id}.${x.fact.predicate} required ${JSON.stringify(x.fact.value)} but is ${f.known ? JSON.stringify(f.value) : 'UNKNOWN'} (${triLabel(v)})`);
        } else if ('occurred' in x) out.push(`occurred(${x.occurred}) is ${triLabel(v)}`);
      }
    }
  };
  walk(c);
  return out;
}

export interface AdjudicationProposal {
  eventId: Id;
  /** 'deterministic' = untouched canonical route; 'needs_model' = actual state requires adjudication. */
  mode: 'deterministic' | 'needs_model';
  precondition: 'TRUE' | 'FALSE' | 'UNKNOWN';
  explanation: string[];
  record?: Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'>;
}

export function occurrenceWindow(c: Candidate, fromExclusive: number, toInclusive: number): StoryTime {
  const lo = Math.max(c.lo, Number.isFinite(fromExclusive) ? fromExclusive + 1 : c.lo);
  const hi = Math.min(c.hi, toInclusive);
  return { lo: Math.min(lo, hi), hi, precision: lo === hi ? 'minute' : 'range' };
}

/**
 * Deterministic default adjudication: if the original preconditions are TRUE against actual state
 * the original route applies; FALSE for FREE/SOFT records an omission with its reason; HARD or
 * UNKNOWN requires model adjudication (HARD can never be omitted).
 */
export function adjudicateDefault(pack: LoadedPack, state: WorldState, c: Candidate, when: StoryTime, origin: Occurrence['origin'] = 'offscreen'): AdjudicationProposal {
  const ev = c.event;
  const v = evalCondition(ev.canonical_preconditions, state, pack, { tick: when.lo });
  const precondition = triLabel(v);
  const explanation = v === true ? [] : explainCondition(ev.canonical_preconditions, state, pack, when.lo);
  if (v === true) {
    const occId = newId('occ');
    const deltas = effectsToDeltas(ev.canonical_effects);
    const occ: Occurrence = {
      occurrenceId: occId,
      title: ev.title,
      account: /^zh/i.test(pack.pack.language) ? `${ev.summary}（本分支中按原作路线发生。）` : `${ev.summary} (Occurred in this branch along its original route.)`,
      actors: ev.entity_ids,
      affected: ev.entity_ids,
      locations: ev.location_ids,
      time: when,
      outcome: deltas,
      causes: [],
      refPhrases: [ev.title],
      packEventId: ev.id,
      origin,
      visibility: ev.visibility,
    };
    return {
      eventId: ev.id,
      mode: 'deterministic',
      precondition,
      explanation,
      record: {
        recordId: newId('rec'),
        kind: 'canon_occurrence',
        storyTime: when,
        sourceRefs: [],
        factsSetOrUnset: deltas,
        eventOccurrenceIds: [occId],
        occurrences: [occ],
        visibility: ev.visibility,
        summary: `${ev.title}: occurred (original route)`,
        evidenceKind: 'adjudication',
        packEventId: ev.id,
        disposition: 'occurred',
        dispositionReason: 'original preconditions satisfied by actual state',
      },
    };
  }
  if (v === false && ev.classification !== 'HARD') {
    return {
      eventId: ev.id,
      mode: 'deterministic',
      precondition,
      explanation,
      record: {
        recordId: newId('rec'),
        kind: 'canon_disposition',
        storyTime: when,
        sourceRefs: [],
        factsSetOrUnset: [],
        eventOccurrenceIds: [],
        visibility: ev.visibility,
        summary: `${ev.title}: did not occur in this branch (${ev.classification})`,
        evidenceKind: 'adjudication',
        packEventId: ev.id,
        disposition: 'omitted',
        dispositionReason: 'original preconditions false: ' + explanation.join('; '),
      },
    };
  }
  return { eventId: ev.id, mode: 'needs_model', precondition, explanation };
}

/** The player forced a canon event to complete ("强制完成"): it occurs along its original route with its
 *  effects and HARD outcomes, whatever its preconditions say. A past window keeps its time; an open or
 *  future window is completed now (facts apply from the current time, the clock does not move). */
export function forcedCompletion(pack: LoadedPack, state: WorldState, eventId: Id, nowTick: number): Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'> {
  const ev = pack.events.get(eventId);
  if (!ev) throw new Error(`unknown event ${eventId}`);
  const t = pack.timeIndex.find((x) => x.id === eventId);
  const when: StoryTime = !t || t.lo > nowTick ? { lo: nowTick, hi: nowTick, precision: 'minute' }
    : t.hi <= nowTick ? { lo: t.lo, hi: t.hi, precision: t.lo === t.hi ? 'minute' : 'range' }
    : { lo: t.lo, hi: nowTick, precision: t.lo === nowTick ? 'minute' : 'range' };
  const deltas = effectsToDeltas(ev.canonical_effects);
  for (const o of ev.outcomes) if (!deltas.some((d) => d.entity_id === o.entity_id && d.predicate === o.predicate)) deltas.push({ op: 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value });
  const zh = /^zh/i.test(pack.pack.language);
  const occId = newId('occ');
  const prior = state.dispositions.get(eventId);
  return {
    recordId: newId('rec'),
    kind: 'canon_occurrence',
    storyTime: when,
    sourceRefs: [],
    factsSetOrUnset: deltas,
    eventOccurrenceIds: [occId],
    occurrences: [{
      occurrenceId: occId, title: ev.title,
      account: zh ? `${ev.summary}（玩家在本局历史中强制完成。）` : `${ev.summary} (Forced to complete by the player.)`,
      actors: ev.entity_ids, affected: ev.entity_ids, locations: ev.location_ids, time: when, outcome: deltas, causes: [],
      refPhrases: [ev.title], packEventId: ev.id, origin: 'intervention', visibility: ev.visibility,
    }],
    visibility: ev.visibility,
    summary: `${ev.title}: occurred (forced by the player)`,
    evidenceKind: 'adjudication',
    packEventId: ev.id,
    disposition: 'occurred',
    dispositionReason: 'forced to complete by the player' + (prior ? ` (was ${prior.disposition})` : ''),
    override: true,
  };
}

/** "关联本局事件": the player says these story beats ARE this canonical event. "occurred" keeps the original
 *  result (its effects and outcomes apply); "diverged" keeps what play established. Recorded like 强制完成. */
export function linkedCompletion(pack: LoadedPack, state: WorldState, eventId: Id, beatIds: string[], disposition: 'occurred' | 'diverged'): Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'> {
  const ev = pack.events.get(eventId);
  if (!ev) throw new Error(`unknown event ${eventId}`);
  const beats = beatIds.map((id) => state.occurrences.get(id)).filter(Boolean) as Occurrence[];
  if (!beats.length) throw new Error('no story events to link');
  const when: StoryTime = { lo: Math.min(...beats.map((b) => b.time.lo)), hi: Math.max(...beats.map((b) => b.time.hi)), precision: 'range' };
  const deltas = disposition === 'occurred' ? effectsToDeltas(ev.canonical_effects) : [];
  if (disposition === 'occurred') for (const o of ev.outcomes) if (!deltas.some((d) => d.entity_id === o.entity_id && d.predicate === o.predicate)) deltas.push({ op: 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value });
  const zh = /^zh/i.test(pack.pack.language);
  const uniqIds = (xs: string[]) => [...new Set(xs)];
  const occId = newId('occ');
  const prior = state.dispositions.get(eventId);
  const story = beats.map((b) => b.account || b.title).join(zh ? '；' : '; ');
  return {
    recordId: newId('rec'),
    kind: 'canon_occurrence',
    storyTime: when,
    sourceRefs: [],
    factsSetOrUnset: deltas,
    eventOccurrenceIds: [occId],
    occurrences: [{
      occurrenceId: occId, title: ev.title,
      account: zh ? `${story}（玩家关联：${disposition === 'occurred' ? '原作结果成立' : '结果与原作不同'}。）` : `${story} (Linked by the player: ${disposition === 'occurred' ? 'the original result holds' : 'the result differs from the original'}.)`,
      actors: uniqIds(beats.flatMap((b) => b.actors)), affected: uniqIds(beats.flatMap((b) => b.affected)), locations: uniqIds(beats.flatMap((b) => b.locations)),
      time: when, outcome: deltas, causes: beats.map((b) => b.occurrenceId),
      refPhrases: [ev.title], packEventId: ev.id, origin: 'intervention', visibility: ev.visibility, linkedFrom: beats.map((b) => b.occurrenceId),
    }],
    visibility: ev.visibility,
    summary: `${ev.title}: ${disposition} (linked by the player to ${beats.length} story event(s))`,
    evidenceKind: 'adjudication',
    packEventId: ev.id,
    disposition,
    dispositionReason: `linked by the player to: ${beats.map((b) => b.title).join('; ')}` + (prior ? ` (was ${prior.disposition})` : ''),
    override: true,
  };
}

/** Text of an event summary that describes its starting situation ("起因：…" / "Cause: …"), i.e. what the
 *  characters know and intend before it happens; falls back to the first sentence. */
export function situationOf(summary: string): string {
  const m = summary.match(/(?:起因|Cause|Background)[：:]\s*([\s\S]*?)(?=(?:经过|结果|Course|Result|What happened)[：:]|$)/i);
  let s = (m ? m[1] : summary.split(/(?<=[。！？.!?])\s*/)[0] || summary).trim();
  if (s.length > 180) s = s.slice(0, 177) + '…';
  return s;
}

/** Events the player marked 关注 that can still start: not settled, preconditions not FALSE, window not over,
 *  and opening within `lead` minutes. */
export function focusedLive(pack: LoadedPack, state: WorldState, ids: Id[], nowTick: number, lead = 24 * 60): { event: PackEvent; lo: number; hi: number }[] {
  const out: { event: PackEvent; lo: number; hi: number }[] = [];
  for (const t of pack.timeIndex) {
    if (!ids.includes(t.id) || state.dispositions.has(t.id) || t.hi < nowTick || t.lo > nowTick + lead) continue;
    const ev = pack.events.get(t.id)!;
    if (ev.classification === 'HARD') continue;
    if (triLabel(evalCondition(ev.canonical_preconditions, state, pack, { tick: Math.max(nowTick, t.lo) })) === 'FALSE') continue;
    out.push({ event: ev, lo: t.lo, hi: t.hi });
  }
  return out;
}

/** Non-HARD original events whose window opens within (now, now+horizon], not settled and still possible. */
export function upcomingRoute(pack: LoadedPack, state: WorldState, nowTick: number, horizon: number, limit = 6): { event: PackEvent; lo: number; hi: number }[] {
  const out: { event: PackEvent; lo: number; hi: number }[] = [];
  for (const t of pack.timeIndex) {
    if (t.lo > nowTick + horizon) break;
    if (t.lo <= nowTick || state.dispositions.has(t.id)) continue;
    const ev = pack.events.get(t.id)!;
    if (ev.classification === 'HARD') continue;
    if (triLabel(evalCondition(ev.canonical_preconditions, state, pack, { tick: t.lo })) === 'FALSE') continue;
    out.push({ event: ev, lo: t.lo, hi: t.hi });
    if (out.length >= limit) break;
  }
  return out;
}

/** Pre-start bootstrap for a new binding: baseline facts + canonical history through the start point. */
export function buildBootstrap(pack: LoadedPack, startTick: number): { records: Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'>[]; unresolved: { eventId: Id; explanation: string[] }[]; pending: Id[] } {
  const records: Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'>[] = [];
  const cs = pack.coverage.start;
  records.push({
    recordId: newId('rec'),
    kind: 'initial_bootstrap',
    storyTime: { lo: cs, hi: cs, precision: 'minute' },
    sourceRefs: [],
    factsSetOrUnset: pack.pack.initial_state.facts.map((f) => ({ op: 'set', entity_id: f.fact.entity_id, predicate: f.fact.predicate, value: f.fact.value })),
    eventOccurrenceIds: [],
    visibility: { mode: 'public', knower_ids: [] },
    summary: `Pack baseline at coverage start (${pack.pack.pack_id}@${pack.pack.pack_version})`,
    evidenceKind: 'bootstrap',
  });
  const unresolved: { eventId: Id; explanation: string[] }[] = [];
  const pending: Id[] = [];
  // Adjudicate chronologically on a scratch state.
  const scratch = reduce(pack, records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'bootstrap', commitId: 'bootstrap' })));
  let seq = records.length;
  for (const t of pack.timeIndex) {
    const ev = pack.events.get(t.id)!;
    if (t.hi < startTick) {
      const when: StoryTime = { lo: t.lo, hi: t.hi, precision: t.lo === t.hi ? 'minute' : 'range' };
      const p = adjudicateDefault(pack, scratch, { event: ev, lo: t.lo, hi: t.hi }, when, 'bootstrap');
      let rec = p.record;
      if (!rec && ev.classification === 'HARD') {
        // HARD canon before the start point is part of the authored baseline history.
        const occId = newId('occ');
        const deltas = effectsToDeltas(ev.canonical_effects);
        rec = {
          recordId: newId('rec'), kind: 'canon_occurrence', storyTime: when, sourceRefs: [], factsSetOrUnset: deltas,
          eventOccurrenceIds: [occId],
          occurrences: [{ occurrenceId: occId, title: ev.title, account: ev.summary, actors: ev.entity_ids, affected: ev.entity_ids, locations: ev.location_ids, time: when, outcome: deltas, causes: [], refPhrases: [ev.title], packEventId: ev.id, origin: 'bootstrap', visibility: ev.visibility }],
          visibility: ev.visibility, summary: `${ev.title}: HARD baseline occurrence before start`, evidenceKind: 'bootstrap', packEventId: ev.id, disposition: 'occurred',
          dispositionReason: 'HARD event before the binding start point (bootstrap assumption)',
        };
      }
      if (!rec) {
        unresolved.push({ eventId: ev.id, explanation: p.explanation });
        continue;
      }
      rec.evidenceKind = 'bootstrap';
      rec.summary = '[bootstrap] ' + rec.summary;
      records.push(rec);
      applyRecord(scratch, { ...rec, sequence: ++seq, branchId: 'bootstrap', commitId: 'bootstrap' });
    } else if (t.lo <= startTick) {
      pending.push(ev.id);
    }
  }
  // Clock record at the start point.
  records.push({
    recordId: newId('rec'), kind: 'time_advance', storyTime: { lo: startTick, hi: startTick, precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [],
    eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: `Binding start at ${formatTick(startTick)}`, evidenceKind: 'bootstrap',
  });
  return { records, unresolved, pending };
}
