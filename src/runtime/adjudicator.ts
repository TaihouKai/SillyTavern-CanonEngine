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
  const cands = crossedCandidates(pack, scratch, args.fromExclusive, args.toInclusive).filter((c) => !args.exclude.has(c.event.id));
  // Only events whose window opens by the end; HARD events still open after the end stay pending.
  for (const c of cands) {
    const when = occurrenceWindow(c, args.fromExclusive, args.toInclusive);
    const windowStillOpen = c.hi > args.toInclusive;
    if (windowStillOpen && c.event.classification === 'HARD') continue; // may still happen later inside its bounds
    const p = adjudicateDefault(pack, scratch, c, when);
    if (p.mode === 'deterministic' && p.record) {
      records.push(p.record);
      basis.push({ eventId: c.event.id, precondition: p.precondition, mode: 'deterministic' });
      applyRecord(scratch, { ...p.record, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
      if (c.event.classification === 'HARD' && p.record.occurrences?.[0]) stagedHard.set(c.event.id, p.record.occurrences[0]);
      notes.push(`${formatTick(when.lo)} ${c.event.title}: ${p.record.disposition}${p.record.disposition !== 'occurred' ? ' — ' + p.record.dispositionReason : ''}`);
      continue;
    }
    if (!args.port) throw new EngineError('provider_failure', `Event "${c.event.title}" needs model adjudication but no model is available`);
    const rec = await modelAdjudicate(args, scratch, c, when, p.precondition, p.explanation, false);
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

async function modelAdjudicate(
  args: Parameters<typeof adjudicateInterval>[0], scratch: WorldState, c: Candidate, when: StoryTime, pre: string, explanation: string[], forced: boolean,
): Promise<{ record: RecordDraft; postponed?: boolean } | null> {
  const { pack } = args;
  const ev = c.event;
  const input = {
    candidate: { id: ev.id, title: ev.title, classification: ev.classification, required_description: ev.required_description, original_summary: ev.summary, window: { lo: ev.when.earliest, hi: ev.when.latest }, adjudication_window: { lo: formatTick(when.lo), hi: formatTick(when.hi) }, original_outcomes: ev.outcomes, original_effects: ev.canonical_effects, entities: ev.entity_ids },
    original_preconditions_now: pre,
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
