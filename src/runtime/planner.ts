// Rolling planner, impact assessment and finite forced-convergence control.
import type { Id } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { valuesEqual } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { evalCondition, factAt, triLabel } from '../domain/reducer';
import { pendingHard, explainCondition } from '../domain/schedule';
import { formatTick, toTick } from '../domain/time';
import { newId } from '../domain/util';
import type { WorldIndex } from '../domain/world-query';
import { callStructured, type ModelPort } from './model';
import { PROMPTS } from './prompts';
import type { PlanRevision, PlanStep } from './types';

export interface PlanOutput {
  rationale: string;
  protected_anchor_ids: string[];
  assumptions: { text: string; fact: { entity_id: string; predicate: string; value: never } | null }[];
  risks: string[];
  mode: 'NORMAL' | 'FORCED_CONVERGENCE';
  steps: {
    step_id: string; actors: string[]; targets?: string[]; earliest: { day: number; minute: number }; latest: { day: number; minute: number };
    prerequisites?: string[]; action: string; intended_effects: { entity_id: string; predicate: string; value: never }[];
    visibility?: 'public' | 'restricted' | 'secret'; knowers?: string[]; depends_on?: string[]; means: 'ordinary' | 'extraordinary';
    serves_anchor: string | null; requires_player_consent: boolean;
  }[];
  inadequacy_note?: string;
}

const ESCAPE_RE = /(parallel world|alternate (timeline|world|worldline)|another worldline|different timeline|drop(ped)? (the )?anchor|cancel (the )?anchor|平行世界|另一条世界线|世界线变动|取消锚点|放弃锚点)/i;

export interface PlanScope { detailed: Id[]; register: Id[] }

/** Next two pending HARD anchors plus any explicitly affected anchors; the rest is a compact register. */
export function planScope(pack: LoadedPack, state: WorldState, affected: Id[] = []): PlanScope {
  const pend = pendingHard(pack, state).map((c) => c.event.id);
  const detailed = [...new Set([...pend.slice(0, 2), ...affected.filter((a) => pend.includes(a))])];
  return { detailed, register: pend.filter((p) => !detailed.includes(p)) };
}

export function validatePlan(out: PlanOutput, pack: LoadedPack, index: WorldIndex, scope: PlanScope, clockTick: number, allowForced: boolean): string[] {
  const errs: string[] = [];
  if (out.mode === 'FORCED_CONVERGENCE' && !allowForced) errs.push('forced convergence was not authorized by the controller');
  for (const d of scope.detailed) if (!out.protected_anchor_ids.includes(d)) errs.push(`plan does not protect HARD anchor ${d}`);
  for (const a of out.protected_anchor_ids) if (!pack.events.has(a) || pack.events.get(a)!.classification !== 'HARD') errs.push(`unknown or non-HARD protected anchor ${a}`);
  if (ESCAPE_RE.test(out.rationale + ' ' + (out.inadequacy_note || '') + ' ' + out.steps.map((s) => s.action).join(' '))) errs.push('plan attempts to escape an anchor via an alternate world/cancellation');
  const ids = new Set<string>();
  for (const s of out.steps) {
    if (ids.has(s.step_id)) errs.push(`duplicate step id ${s.step_id}`);
    ids.add(s.step_id);
    const lo = toTick(s.earliest), hi = toTick(s.latest);
    if (hi < lo) errs.push(`step ${s.step_id}: latest precedes earliest`);
    if (hi < clockTick) errs.push(`step ${s.step_id}: scheduled entirely in the past`);
    if (s.requires_player_consent) errs.push(`step ${s.step_id}: depends on the player's consent/decision (offer an in-world opportunity instead)`);
    if (s.means === 'extraordinary' && out.mode !== 'FORCED_CONVERGENCE') errs.push(`step ${s.step_id}: extraordinary means outside forced convergence`);
    if (s.serves_anchor) {
      const pe = pack.events.get(s.serves_anchor);
      if (!pe || pe.classification !== 'HARD') errs.push(`step ${s.step_id}: serves unknown/non-HARD anchor ${s.serves_anchor}`);
      else if (pe.when.latest && lo > toTick(pe.when.latest)) errs.push(`step ${s.step_id}: starts after anchor ${pe.id}'s authored deadline (no sliding deadline)`);
    }
    for (const e of s.intended_effects) {
      if (!pack.predicates.has(e.predicate)) errs.push(`step ${s.step_id}: undeclared predicate ${e.predicate}`);
      const eid = e.entity_id;
      if (!index.entityExists(eid) && !eid.startsWith('new:')) errs.push(`step ${s.step_id}: unknown entity ${eid} (new actors must be named "new:<name>" and established by a step)`);
      for (const hid of scope.detailed.concat(scope.register)) {
        const pe = pack.events.get(hid)!;
        for (const o of pe.outcomes) if (o.entity_id === e.entity_id && o.predicate === e.predicate && !valuesEqual(o.value, e.value)) {
          errs.push(`step ${s.step_id}: intends ${e.entity_id}.${e.predicate}=${JSON.stringify(e.value)}, contradicting HARD ${hid}'s required outcome ${JSON.stringify(o.value)}`);
        }
      }
    }
    for (const d of s.depends_on || []) if (!out.steps.some((x) => x.step_id === d)) errs.push(`step ${s.step_id}: depends on unknown step ${d}`);
  }
  return errs;
}

export function toPlanRevision(out: PlanOutput, worldRevision: number, prefixHash: string, clockTick: number, readyWindow: number): PlanRevision {
  const steps: PlanStep[] = out.steps.map((s) => ({
    step_id: s.step_id,
    actors: s.actors,
    targets: s.targets || [],
    earliest: toTick(s.earliest),
    latest: toTick(s.latest),
    prerequisites: s.prerequisites || [],
    action: s.action,
    intended_effects: s.intended_effects,
    visibility: s.visibility || 'secret',
    knowers: s.knowers || [],
    depends_on: s.depends_on || [],
    means: s.means,
    serves_anchor: s.serves_anchor,
    status: 'proposed',
  }));
  for (const s of steps) if (!s.depends_on.length && s.earliest <= clockTick + readyWindow) s.status = 'ready';
  return {
    planId: newId('plan'), worldRevision, sourcePrefixHash: prefixHash, mode: out.mode, protectedAnchorIds: out.protected_anchor_ids,
    assumptions: out.assumptions as PlanRevision['assumptions'], rationale: out.rationale, risks: out.risks, steps, inadequacyNote: out.inadequacy_note || '',
    createdAtRevision: worldRevision, status: 'active',
  };
}

/** Advance step readiness from enacted steps; invalidate steps scheduled entirely in the past. */
export function refreshPlan(plan: PlanRevision, state: WorldState, clockTick: number, readyWindow: number): { plan: PlanRevision; invalidated: string[] } {
  const p: PlanRevision = JSON.parse(JSON.stringify(plan));
  const invalidated: string[] = [];
  for (const s of p.steps) {
    if (state.enactedSteps.has(s.step_id)) { s.status = 'enacted'; s.enactedBy = state.enactedSteps.get(s.step_id); continue; }
    if (s.status === 'enacted') s.status = 'proposed'; // enactment removed by a source revision
    if (s.latest < clockTick) { s.status = 'invalidated'; invalidated.push(s.step_id); continue; }
    const depsDone = s.depends_on.every((d) => state.enactedSteps.has(d));
    s.status = depsDone && s.earliest <= clockTick + readyWindow ? 'ready' : 'proposed';
  }
  return { plan: p, invalidated };
}

/** Explicitly diagnosed large-scale change that makes an ordinary route unavailable. */
export function diagnoseForced(pack: LoadedPack, state: WorldState, scope: PlanScope, clockTick: number): string | null {
  for (const e of pack.entities.values()) {
    if (e.kind !== 'world') continue;
    const f = factAt(state, e.id, 'exists', { tick: clockTick });
    if (f.known && f.value === false) {
      const affected = scope.detailed.filter((h) => triLabel(evalCondition(pack.events.get(h)!.canonical_preconditions, state, pack, { tick: clockTick })) !== 'TRUE');
      if (affected.length) return `${e.name} no longer exists; HARD ${affected.join(', ')} cannot be reached by ordinary means`;
    }
  }
  return null;
}

export interface PlanningResult { plan: PlanRevision | null; forced: boolean; attempts: number; errors: string[]; inadequacy: string }

export async function runPlanning(args: {
  port: ModelPort; pack: LoadedPack; index: WorldIndex; state: WorldState; clockTick: number; worldRevision: number; prefixHash: string;
  affected: Id[]; maxOrdinary: number; allowForcedAttempt: boolean; signal?: AbortSignal; operationId: string; readyWindow: number;
  facts: string; persona: string; log?: (l: unknown) => void; impactForced?: boolean;
}): Promise<PlanningResult> {
  const { pack, index, state, clockTick } = args;
  const scope = planScope(pack, state, args.affected);
  if (!scope.detailed.length) return { plan: null, forced: false, attempts: 0, errors: [], inadequacy: '' };
  const hardInput = (ids: Id[]) => ids.map((id) => {
    const e = pack.events.get(id)!;
    return {
      id, required_description: e.required_description, earliest: e.when.earliest, latest: e.when.latest, outcomes: e.outcomes,
      original_route: e.summary, original_preconditions_now: triLabel(evalCondition(e.canonical_preconditions, state, pack, { tick: clockTick })),
      unmet: explainCondition(e.canonical_preconditions, state, pack, clockTick),
      original_upstream: (pack.edgesTo.get(id) || []).map((x) => ({ from: x.from, relation: x.relation, status: index.canonStatus(x.from, clockTick)?.status })),
    };
  });
  const errors: string[] = [];
  const diagnosis = diagnoseForced(pack, state, scope, clockTick);
  let attempts = 0;
  const tryOnce = async (mode: 'NORMAL' | 'FORCED_CONVERGENCE', why: string) => {
    attempts++;
    const input = {
      now: { tick: clockTick, label: formatTick(clockTick), day: Math.floor(clockTick / 1440), minute: clockTick % 1440 },
      allowed_mode: mode,
      forced_reason: why,
      protected_hard_detailed: hardInput(scope.detailed),
      hard_register: scope.register.map((id) => ({ id, deadline: pack.events.get(id)!.when.latest, required: pack.events.get(id)!.required_description })),
      actual_world: args.facts,
      deviations: [...state.dispositions].filter(([, d]) => d.disposition !== 'occurred').map(([id, d]) => ({ id, disposition: d.disposition, reason: d.reason })),
      entities: [...pack.entities.values()].map((e) => ({ id: e.id, name: e.name, kind: e.kind })).concat([...state.runtimeEntities.values()].map((e) => ({ id: e.id, name: e.name, kind: e.kind }))),
      predicates: [...pack.predicates.values()].map((p) => ({ id: p.id, type: p.value_type, allowed: p.allowed_values })),
      previous_errors: errors.slice(-6),
      player: args.persona,
    };
    const out = await callStructured<PlanOutput>(args.port, 'plan', PROMPTS.plan, input, { signal: args.signal, operationId: args.operationId, log: args.log });
    const errs = validatePlan(out, pack, index, scope, clockTick, mode === 'FORCED_CONVERGENCE');
    if (errs.length) { errors.push(...errs); return null; }
    return toPlanRevision(out, args.worldRevision, args.prefixHash, clockTick, args.readyWindow);
  };
  if (diagnosis || args.impactForced) {
    const p = await tryOnce('FORCED_CONVERGENCE', diagnosis || 'impact assessment diagnosed a global, major change');
    if (p) return { plan: p, forced: true, attempts, errors, inadequacy: diagnosis || 'major global change' };
  }
  for (let i = 0; i < args.maxOrdinary && !(diagnosis && attempts); i++) {
    const p = await tryOnce('NORMAL', '');
    if (p) return { plan: p, forced: false, attempts, errors, inadequacy: '' };
  }
  if (args.allowForcedAttempt && !diagnosis) {
    const p = await tryOnce('FORCED_CONVERGENCE', `validated ordinary proposals failed: ${errors.slice(-3).join(' | ')}`);
    if (p) return { plan: p, forced: true, attempts, errors, inadequacy: 'ordinary proposals failed validation' };
  }
  return { plan: null, forced: false, attempts, errors, inadequacy: '' };
}

export interface ImpactOutput { changed: { entity_id: string; predicate: string }[]; affected_anchors: string[]; affected_steps: string[]; scope: 'local' | 'global' | 'unknown'; severity: 'none' | 'minor' | 'major'; replan: boolean; explanation: string }

/** Deterministic prefilter: do the changed keys touch plan assumptions or HARD-chain conditions? */
export function impactCandidates(pack: LoadedPack, plan: PlanRevision | null, changedKeys: Set<string>, changedEntities: Set<string>): { relevant: boolean; anchors: Id[] } {
  const anchors = new Set<Id>();
  const touches = (k: string) => changedKeys.has(k) || changedEntities.has(k.split('|')[0]);
  for (const id of pack.hardEvents) {
    const e = pack.events.get(id)!;
    const keys: string[] = [];
    const walk = (c: import('../domain/types').Condition) => {
      if ('all' in c) c.all.forEach(walk); else if ('any' in c) c.any.forEach(walk); else if ('not' in c) walk(c.not);
      else if ('fact' in c) keys.push(`${c.fact.entity_id}|${c.fact.predicate}`);
      else if ('occurred' in c) { const up = pack.events.get(c.occurred); if (up) up.outcomes.forEach((o) => keys.push(`${o.entity_id}|${o.predicate}`)); }
    };
    walk(e.canonical_preconditions);
    for (const ed of pack.edgesTo.get(id) || []) { const up = pack.events.get(ed.from); up?.outcomes.forEach((o) => keys.push(`${o.entity_id}|${o.predicate}`)); walkUp(ed.from, keys, 3); }
    e.outcomes.forEach((o) => keys.push(`${o.entity_id}|${o.predicate}`));
    if (keys.some(touches) || e.entity_ids.some((x) => changedEntities.has(x))) anchors.add(id);
  }
  function walkUp(id: Id, keys: string[], depth: number) {
    if (depth <= 0) return;
    const ev = pack.events.get(id);
    if (!ev) return;
    const walk = (c: import('../domain/types').Condition) => {
      if ('all' in c) c.all.forEach(walk); else if ('any' in c) c.any.forEach(walk); else if ('not' in c) walk(c.not);
      else if ('fact' in c) keys.push(`${c.fact.entity_id}|${c.fact.predicate}`);
    };
    walk(ev.canonical_preconditions);
    ev.outcomes.forEach((o) => keys.push(`${o.entity_id}|${o.predicate}`));
    for (const ed of pack.edgesTo.get(id) || []) walkUp(ed.from, keys, depth - 1);
  }
  let relevant = anchors.size > 0;
  if (plan) for (const a of plan.assumptions) if (a.fact && touches(`${a.fact.entity_id}|${a.fact.predicate}`)) relevant = true;
  // world-scale facts are always relevant (global scope)
  for (const k of changedKeys) { const ent = pack.entities.get(k.split('|')[0]); if (ent?.kind === 'world') relevant = true; }
  return { relevant, anchors: [...anchors] };
}

export async function assessImpact(port: ModelPort, input: unknown, signal: AbortSignal | undefined, operationId: string, log?: (l: unknown) => void): Promise<ImpactOutput> {
  return callStructured<ImpactOutput>(port, 'impact', PROMPTS.impact, input, { signal, operationId, log });
}
