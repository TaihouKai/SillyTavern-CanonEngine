// Interval adjudication for story-time advances: every crossed finite-time canonical event is
// adjudicated against actual state in chronological order (deterministic default, model when the
// actual state requires it). Results stay staged until the triggering reply is accepted.
import type { FactDelta, Id, Occurrence, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { valuesEqual } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { applyRecord, reduce } from '../domain/reducer';
import { adjudicateDefault, crossedCandidates, occurrenceWindow, type Candidate } from '../domain/schedule';
import { formatTick, toTick } from '../domain/time';
import { EngineError, newId } from '../domain/util';
import { callStructured, type ModelPort } from './model';
import { PROMPTS } from './prompts';
import type { PlanRevision, RecordDraft } from './types';
import { toStoryTime } from './gate';

export interface AdjudicationResult {
  records: RecordDraft[];
  basis: { eventId: Id; precondition: string; mode: 'deterministic' | 'model' }[];
  stagedHard: Map<Id, Occurrence>;
  notes: string[];
  forcedUsed: boolean;
}

interface ModelAdj {
  event_id: string; decision: 'occurred' | 'diverged' | 'omitted' | 'postponed'; time?: { lo: { day: number; minute: number }; hi: { day: number; minute: number }; precision: StoryTime['precision'] } | null;
  account: string; actors?: string[]; causes?: string[]; effects: { op: 'set' | 'unset'; entity_id: string; predicate: string; value?: never }[];
  plan_step_ids?: string[]; reason: string; extraordinary?: boolean;
}

function cloneState(pack: LoadedPack, s: WorldState): WorldState {
  return reduce(pack, s.records);
}

export async function adjudicateInterval(args: {
  pack: LoadedPack; state: WorldState; fromExclusive: number; toInclusive: number; exclude: Set<Id>;
  port: ModelPort | null; plan: PlanRevision | null; forcedAllowed: boolean; signal?: AbortSignal; operationId: string; facts: string; log?: (l: unknown) => void;
}): Promise<AdjudicationResult> {
  const { pack } = args;
  const scratch = cloneState(pack, args.state);
  let seq = scratch.lastSeq;
  const records: RecordDraft[] = [];
  const basis: AdjudicationResult['basis'] = [];
  const stagedHard = new Map<Id, Occurrence>();
  const notes: string[] = [];
  let forcedUsed = false;
  // An event the story shows under way (result not settled) is judged in play when it ends, not offscreen,
  // unless the story leaves it hanging for a day past its window.
  const underWay = new Set([...scratch.occurrences.values()].map((o) => o.inProgressOf).filter(Boolean) as Id[]);
  const cands = crossedCandidates(pack, scratch, args.fromExclusive, args.toInclusive).filter((c) => !args.exclude.has(c.event.id) && !(underWay.has(c.event.id) && args.toInclusive <= c.hi + 1440));
  // Only events whose window has closed by the end. An event whose window is still open stays pending
  // (it may still happen later inside its bounds, offscreen or in the story): a whole-day event is
  // not settled as done the moment the day begins.
  for (const c of cands) {
    // the whole window: it went by without the event being settled, so it may have happened at any point in it
    const when = occurrenceWindow(c, -Infinity, args.toInclusive);
    const windowStillOpen = c.hi > args.toInclusive;
    if (windowStillOpen) continue;
    const p = adjudicateDefault(pack, scratch, c, when);
    // The original route assumes the original situation. When actual play has recently involved this
    // event's characters, what they know or do may no longer fit it: let the model judge from actual play
    // (falling back to the original route if it cannot).
    const play = p.mode === 'deterministic' && p.record?.disposition === 'occurred' && c.event.classification !== 'HARD' && args.port ? recentPlay(pack, scratch, c) : [];
    if (play.length) {
      const judged = await modelAdjudicate(args, scratch, c, when, p.precondition, p.explanation, false, play);
      if (judged && !judged.postponed) {
        records.push(judged.record);
        basis.push({ eventId: c.event.id, precondition: p.precondition, mode: 'model' });
        applyRecord(scratch, { ...judged.record, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
        notes.push(`${formatTick(judged.record.storyTime.lo)} ${c.event.title}: ${judged.record.disposition} — ${judged.record.occurrences?.[0]?.account?.slice(0, 160) || judged.record.dispositionReason}`);
        continue;
      }
      if (judged?.postponed) { notes.push(`${c.event.title}: postponed within its bounds`); continue; }
    }
    if (p.mode === 'deterministic' && p.record) {
      records.push(p.record);
      basis.push({ eventId: c.event.id, precondition: p.precondition, mode: 'deterministic' });
      applyRecord(scratch, { ...p.record, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
      if (c.event.classification === 'HARD' && p.record.occurrences?.[0]) stagedHard.set(c.event.id, p.record.occurrences[0]);
      notes.push(`${formatTick(when.lo)} ${c.event.title}: ${p.record.disposition}${p.record.disposition !== 'occurred' ? ' — ' + p.record.dispositionReason : ''}`);
      continue;
    }
    if (!args.port) throw new EngineError('provider_failure', `Event "${c.event.title}" needs model adjudication but no model is available`);
    // what actual play did with this event's characters matters as much when its preconditions are unknown
    const playU = c.event.classification !== 'HARD' ? recentPlay(pack, scratch, c) : [];
    const rec = await modelAdjudicate(args, scratch, c, when, p.precondition, p.explanation, false, playU);
    let result = rec;
    if (!result && c.event.classification === 'HARD' && args.forcedAllowed) {
      forcedUsed = true;
      result = await modelAdjudicate(args, scratch, c, when, p.precondition, p.explanation, true);
    }
    if (!result) {
      if (c.event.classification === 'HARD') throw new EngineError('narrative_validation_failure', `Could not produce a valid adjudication for HARD "${c.event.title}" at ${formatTick(c.hi)}. The deadline cannot be skipped; retry or adjust the scene.`);
      // non-HARD fallback: omitted with an explicit reason (never silently ignored)
      const r: RecordDraft = {
        recordId: newId('rec'), kind: 'canon_disposition', storyTime: when, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
        visibility: c.event.visibility, summary: `${c.event.title}: not applied (adjudication unresolved)`, evidenceKind: 'adjudication', packEventId: c.event.id,
        disposition: 'omitted', dispositionReason: `actual preconditions ${p.precondition}: ${p.explanation.join('; ')}; model adjudication unavailable/invalid`,
      };
      records.push(r);
      basis.push({ eventId: c.event.id, precondition: p.precondition, mode: 'model' });
      applyRecord(scratch, { ...r, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
      continue;
    }
    if (result.postponed) { notes.push(`${c.event.title}: postponed within its bounds`); continue; }
    records.push(result.record);
    basis.push({ eventId: c.event.id, precondition: p.precondition, mode: 'model' });
    applyRecord(scratch, { ...result.record, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
    if (c.event.classification === 'HARD' && result.record.occurrences?.[0]) stagedHard.set(c.event.id, result.record.occurrences[0]);
    notes.push(`${formatTick(result.record.storyTime.lo)} ${c.event.title}: ${result.record.disposition} — ${result.record.occurrences?.[0]?.account?.slice(0, 160) || result.record.dispositionReason}`);
  }
  return { records, basis, stagedHard, notes, forcedUsed };
}

/** Actual play (player/GM scenes, not canon records) involving this event's people from 2 days before its window. */
function recentPlay(pack: LoadedPack, s: WorldState, c: Candidate): string[] {
  const people = new Set(c.event.entity_ids.filter((id) => pack.entities.get(id)?.kind === 'person'));
  if (!people.size) return [];
  const out: string[] = [];
  for (const o of s.occurrences.values()) {
    if (o.packEventId || (o.origin !== 'player' && o.origin !== 'gm') || o.time.hi < c.lo - 2 * 1440) continue;
    if (![...o.actors, ...o.affected].some((x) => people.has(x))) continue;
    out.push(`${formatTick(o.time.lo)} ${o.title}: ${o.account.length > 300 ? o.account.slice(0, 297) + '…' : o.account}`);
  }
  return out.slice(-12);
}

/** "结束事件": the player says this canonical event has ended in the story. The offscreen judgement decides
 *  from actual play how it ended (occurred / diverged / omitted); the beats shown as under way and recent play
 *  with its characters are its evidence. Returns the record, "still under way" when the model says it has not
 *  ended yet (only possible inside its window), or null when no valid judgement came back. */
export async function concludeFromPlay(args: Parameters<typeof adjudicateInterval>[0], eventId: Id, when: StoryTime): Promise<{ record: RecordDraft } | { stillUnderWay: true } | null> {
  const { pack } = args;
  const ev = pack.events.get(eventId);
  const t = pack.timeIndex.find((x) => x.id === eventId);
  if (!ev || !t) return null;
  const scratch = cloneState(pack, args.state);
  const c: Candidate = { event: ev, lo: t.lo, hi: t.hi };
  const p = adjudicateDefault(pack, scratch, c, when);
  const beats = [...scratch.occurrences.values()].filter((o) => o.inProgressOf === eventId).sort((a, b) => a.time.lo - b.time.lo);
  const play = [...new Set([...beats.map((o) => `${formatTick(o.time.lo)} ${o.title}: ${o.account}`), ...recentPlay(pack, scratch, c)])].slice(-16);
  const note = 'The player marked this event as FINISHED in the story: decide from recent_actual_play how it actually ended — occurred (original result), diverged (different result) or omitted (it did not happen) — and give the actual account; do not postpone unless the story clearly shows it is still going on.';
  const r = await modelAdjudicate({ ...args, toInclusive: when.hi }, scratch, c, when, p.precondition, [note, ...p.explanation], false, play);
  if (!r) return null;
  if (r.postponed) return { stillUnderWay: true };
  r.record.override = true;
  r.record.dispositionReason = `concluded by the player from the story: ${r.record.dispositionReason || ''}`.slice(0, 500);
  const occ = r.record.occurrences?.[0];
  if (occ) { occ.causes = [...new Set([...occ.causes, ...beats.map((b) => b.occurrenceId)])]; if (beats.length) occ.linkedFrom = beats.map((b) => b.occurrenceId); }
  return { record: r.record };
}

function occurredIds(c: import('../domain/types').Condition): string[] {
  if ('all' in c) return c.all.flatMap(occurredIds);
  if ('any' in c) return c.any.flatMap(occurredIds);
  if ('not' in c) return [];
  return 'occurred' in c ? [c.occurred] : [];
}

async function modelAdjudicate(
  args: Parameters<typeof adjudicateInterval>[0], scratch: WorldState, c: Candidate, when: StoryTime, pre: string, explanation: string[], forced: boolean, play: string[] = [],
): Promise<{ record: RecordDraft; postponed?: boolean } | null> {
  const { pack } = args;
  const ev = c.event;
  const input = {
    candidate: { id: ev.id, title: ev.title, classification: ev.classification, required_description: ev.required_description, original_summary: ev.summary, window: { lo: ev.when.earliest, hi: ev.when.latest }, adjudication_window: { lo: formatTick(when.lo), hi: formatTick(when.hi) }, original_outcomes: ev.outcomes, original_effects: ev.canonical_effects, entities: ev.entity_ids },
    original_preconditions_now: pre,
    ...(play.length ? { recent_actual_play_with_these_characters: play } : {}),
    // prerequisite events that happened differently in this playthrough: judge from what actually happened
    upstream_happened_differently: occurredIds(ev.canonical_preconditions).map((id) => ({ id, d: scratch.dispositions.get(id) })).filter((x) => x.d?.disposition === 'diverged')
      .map((x) => ({ id: x.id, title: pack.events.get(x.id)?.title, actual: (x.d!.occurrenceId && scratch.occurrences.get(x.d!.occurrenceId)?.account) || x.d!.reason || '' })),
    unmet_conditions: explanation,
    actual_world: args.facts,
    plan_steps: (args.plan?.steps || []).filter((s) => s.serves_anchor === ev.id || s.latest >= when.lo).slice(0, 10),
    authorized_forced: forced,
    predicates: [...pack.predicates.values()].map((p) => ({ id: p.id, type: p.value_type, allowed: p.allowed_values })),
  };
  let out: { adjudications: ModelAdj[] };
  try {
    out = await callStructured<{ adjudications: ModelAdj[] }>(args.port!, 'adjudicate', PROMPTS.adjudicate, input, { signal: args.signal, operationId: args.operationId, log: args.log });
  } catch (e) {
    if ((e as EngineError).kind === 'cancelled' || (e as EngineError).kind === 'provider_failure') throw e;
    return null;
  }
  const a = out.adjudications.find((x) => x.event_id === ev.id);
  if (!a || !a.account?.trim()) return null;
  const effects: FactDelta[] = [];
  for (const e of a.effects) {
    const p = pack.predicates.get(e.predicate);
    if (!p || !(pack.entities.has(e.entity_id) || scratch.runtimeEntities.has(e.entity_id))) return null;
    effects.push(e.op === 'set' ? { op: 'set', entity_id: e.entity_id, predicate: e.predicate, value: e.value as never } : { op: 'unset', entity_id: e.entity_id, predicate: e.predicate });
  }
  let time = toStoryTime(a.time) || when;
  if (time.lo < c.lo || time.hi > c.hi) time = when;
  if (ev.classification === 'HARD') {
    if (a.decision !== 'occurred') return null;
    for (const o of ev.outcomes) if (!effects.some((d) => d.op === 'set' && d.entity_id === o.entity_id && d.predicate === o.predicate && valuesEqual(d.value, o.value))) return null;
    if (a.extraordinary && !forced) return null;
  }
  if (a.decision === 'postponed') {
    if (ev.classification !== 'SOFT' || c.hi <= args.toInclusive) return null;
    return { record: null as never, postponed: true };
  }
  const occId = newId('occ');
  const occurred = a.decision === 'occurred' || a.decision === 'diverged';
  const occ: Occurrence | undefined = occurred ? {
    occurrenceId: occId, title: ev.title, account: a.account, actors: (a.actors || ev.entity_ids).filter((x) => pack.entities.has(x) || scratch.runtimeEntities.has(x)),
    affected: ev.entity_ids, locations: ev.location_ids, time, outcome: effects, causes: (a.causes || []).filter((x) => scratch.occurrences.has(x)),
    refPhrases: [ev.title], packEventId: ev.id, origin: forced ? 'intervention' : 'offscreen', visibility: ev.visibility,
  } : undefined;
  return {
    record: {
      recordId: newId('rec'), kind: occurred ? 'canon_occurrence' : 'canon_disposition', storyTime: time, sourceRefs: [], factsSetOrUnset: occurred ? effects : [],
      eventOccurrenceIds: occ ? [occId] : [], occurrences: occ ? [occ] : undefined, visibility: ev.visibility,
      summary: `${ev.title}: ${a.decision} (offscreen adjudication${forced ? ', forced convergence' : ''})`, evidenceKind: 'adjudication', packEventId: ev.id,
      disposition: a.decision === 'occurred' ? 'occurred' : a.decision === 'diverged' ? 'diverged' : 'omitted', dispositionReason: a.reason,
      adjudicationId: newId('adj'), enactedStepIds: (a.plan_step_ids || []).filter((s) => args.plan?.steps.some((x) => x.step_id === s)),
    },
  };
}

export { toTick };
