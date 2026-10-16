// Controller-owned retrieval (causal OR mentioned, plus scene/entity constraints) and the
// bounded GM context packet. The model receives record CONTENT, never bare ids.
import type { Id } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { WorldIndex, type HistoryRecordView, type EntityStateView, type CanonStatusView } from '../domain/world-query';
import { formatStoryTime, formatTick } from '../domain/time';
import { pendingHard } from '../domain/schedule';
import { evalCondition, triLabel } from '../domain/reducer';
import { EngineError, sceneRoot, sha256 } from '../domain/util';
import type { CoverageEntry, PlanRevision } from './types';

export interface RefInput {
  id: string;
  quote: string;
  phrase: string;
  kind: string; // person|place|object|organization|event|other|entity
  assertion: string;
  temporal?: string;
  candidates?: string[];
}

export interface ClaimInput {
  id: string;
  quote: string;
  kind: string;
  entityPhrases: string[];
  assertion: string;
  expected?: { entity_id: string; predicate: string; value: unknown } | null;
  synthetic?: boolean;
}

export interface RetrievalSpec {
  refs: RefInput[];
  claims: ClaimInput[];
  sceneEntityIds: Id[];
  causalSeedEntityIds: Id[];
  freeText: string[];
  checkpointTick: number;
}

export interface Retrieval {
  entries: CoverageEntry[];
  occurrences: Map<string, Set<'causal' | 'mentioned' | 'scene'>>;
  entities: Map<Id, Set<'causal' | 'mentioned' | 'scene'>>;
  canonEvents: Set<Id>;
  claims: ClaimInput[];
  ambiguous: string[];
}

function add<K>(m: Map<K, Set<'causal' | 'mentioned' | 'scene'>>, k: K, t: 'causal' | 'mentioned' | 'scene') {
  if (!m.has(k)) m.set(k, new Set());
  m.get(k)!.add(t);
}

export function retrieve(index: WorldIndex, spec: RetrievalSpec): Retrieval {
  const occurrences: Retrieval['occurrences'] = new Map();
  const entities: Retrieval['entities'] = new Map();
  const canonEvents = new Set<Id>();
  const entries: CoverageEntry[] = [];
  const ambiguous: string[] = [];
  const cp = { tick: spec.checkpointTick };

  const pullEntity = (id: Id, trigger: 'causal' | 'mentioned' | 'scene', quote?: string) => {
    add(entities, id, trigger);
    // Causal history behind the entity's current constraints (who/what established them).
    for (const o of index.supportingOccurrences(id, cp)) {
      add(occurrences, o, trigger === 'scene' ? 'scene' : 'causal');
      for (const c of index.causalClosure([o])) add(occurrences, c, 'causal');
    }
    // Parent/containment constraints.
    const st = index.entityState(id, cp);
    for (const p of st.parents) {
      add(entities, p.parentId, 'scene');
      for (const o of index.supportingOccurrences(p.parentId, cp)) add(occurrences, o, 'causal');
    }
    // History of the entity that is semantically relevant to the mention text.
    if (quote) {
      const own = new Set(index.occurrencesForEntity(id));
      for (const h of index.semanticSearch(quote, 6, 1.0)) if (own.has(h.occurrenceId)) add(occurrences, h.occurrenceId, 'mentioned');
    }
  };

  for (const r of spec.refs) {
    const entry: CoverageEntry = {
      refId: r.id, quote: r.quote, kind: r.kind, assertion: r.assertion,
      resolved: { entityIds: [], occurrenceIds: [], packEventIds: [] },
      disposition: 'unresolved', triggers: ['mentioned'],
      lookups: { occurrenceIds: [], entityIds: [], canonEventIds: [], unknowns: [] }, checked: false,
    };
    const candIds = (r.candidates || []).filter((c) => index.entityExists(c) || index.state.occurrences.has(c) || index.pack.events.has(c));
    const entityIds = new Set<Id>(candIds.filter((c) => index.entityExists(c)));
    const occIds = new Set<string>(candIds.filter((c) => index.state.occurrences.has(c)));
    const packIds = new Set<Id>(candIds.filter((c) => index.pack.events.has(c)));
    const ent = index.resolveEntity(r.phrase);
    if (r.kind !== 'event') ent.ids.forEach((x) => entityIds.add(x));
    if (r.kind === 'event' || r.temporal === 'past' || r.temporal === 'flashback' || r.kind === 'other') {
      const ev = index.resolveEventPhrase(r.phrase + ' ' + r.quote);
      ev.occurrenceIds.forEach((x) => occIds.add(x));
      ev.packEventIds.forEach((x) => packIds.add(x));
    }
    // Indirect references ("the man I rescued", "that errand"): resolve through actual occurrences.
    if (!entityIds.size && !occIds.size && r.kind !== 'event') {
      const ev = index.resolveEventPhrase(r.phrase + ' ' + r.quote);
      for (const o of ev.occurrenceIds) {
        occIds.add(o);
        const oc = index.state.occurrences.get(o)!;
        for (const a of [...oc.affected, ...oc.actors]) if (index.entityKind(a) === (r.kind === 'person' ? 'person' : index.entityKind(a))) entityIds.add(a);
      }
    }
    if (ent.ambiguous && entityIds.size > 1 && !candIds.length) ambiguous.push(`${r.phrase}: ${[...entityIds].join(' | ')}`);
    entry.resolved = { entityIds: [...entityIds], occurrenceIds: [...occIds], packEventIds: [...packIds] };
    entry.disposition = entityIds.size + occIds.size + packIds.size === 0 ? (r.kind === 'event' ? 'unresolved' : 'new') : entityIds.size > 1 && !candIds.length ? 'ambiguous' : 'resolved';
    for (const id of entityIds) pullEntity(id, 'mentioned', r.quote);
    for (const o of occIds) {
      add(occurrences, o, 'mentioned');
      for (const c of index.causalClosure([o])) if (c !== o) add(occurrences, c, 'causal');
    }
    for (const p of packIds) canonEvents.add(p);
    entry.lookups.entityIds = [...entityIds];
    entry.lookups.occurrenceIds = [...occIds];
    entry.lookups.canonEventIds = [...packIds];
    for (const id of entityIds) for (const u of index.entityState(id, cp).unknown) entry.lookups.unknowns.push(`${id}.${u}`);
    entries.push(entry);
  }
  for (const id of spec.sceneEntityIds) if (index.entityExists(id)) pullEntity(id, 'scene');
  for (const id of spec.causalSeedEntityIds) if (index.entityExists(id)) pullEntity(id, 'causal');
  // Semantic expansion for paraphrases / missing explicit causal links.
  for (const t of spec.freeText) {
    if (!t) continue;
    for (const h of index.semanticSearch(t, 4, 2.5)) {
      add(occurrences, h.occurrenceId, 'causal');
      for (const c of index.causalClosure([h.occurrenceId])) add(occurrences, c, 'causal');
    }
    for (const m of index.scanEntities(t)) pullEntity(m.id, 'mentioned', t.slice(0, 400));
  }
  // Claims: resolve their entity phrases to state lookups.
  for (const c of spec.claims) {
    for (const ph of c.entityPhrases) for (const id of index.resolveEntity(ph).ids) pullEntity(id, 'scene', c.quote);
    if (c.expected && index.entityExists(c.expected.entity_id)) pullEntity(c.expected.entity_id, 'scene', c.quote);
  }
  return { entries, occurrences, entities, canonEvents, claims: spec.claims, ambiguous };
}

export interface PacketInput {
  pack: LoadedPack;
  index: WorldIndex;
  retrieval: Retrieval;
  checkpointTick: number;
  origin: { y: number; m: number; d: number } | null;
  sceneLabel: string;
  playerScope: string[];
  plan: PlanRevision | null;
  forced: boolean;
  stagedNotes: string[];
  opportunities: string[];
  budgetChars: number;
  horizon: number;
}

export interface Packet { text: string; facts: string; hash: string; required: number; optional: number; truncatedOptional: boolean }

function histLine(h: HistoryRecordView, triggers: Set<string> | undefined, compact: boolean): string {
  const acc = compact && h.account.length > 220 ? h.account.slice(0, 217) + '…' : h.account;
  const parts = [`- [${h.occurrenceId}] ${h.time} — ${h.title}: ${acc}`];
  if (h.actors.length) parts.push(`  actors: ${h.actors.join(', ')}`);
  if (h.outcome.length) parts.push(`  actual outcome: ${h.outcome.join('; ')}`);
  if (h.causes.length) parts.push(`  caused by: ${h.causes.map((c) => `${c.title} [${c.occurrenceId}]`).join('; ')}`);
  if (h.laterChanges.length) parts.push(`  later changes: ${h.laterChanges.join('; ')}`);
  parts.push(`  origin: ${h.origin}; visibility: ${h.visibility}${triggers ? `; retrieved because: ${[...triggers].join('+')}` : ''}`);
  if (!compact && h.evidence.length) parts.push(`  evidence: ${h.evidence.slice(0, 2).map((e) => `"${e.quote.slice(0, 120)}"`).join(' ')}`);
  return parts.join('\n');
}

/** One block for several retrieved beats of the same scene (scene grouping): shared metadata once. */
function sceneHistLine(hs: HistoryRecordView[], triggers: (Set<string> | undefined)[], compact: boolean): string {
  const ids = new Set(hs.map((h) => h.occurrenceId));
  const all = <T,>(f: (h: HistoryRecordView) => T[]) => [...new Set(hs.flatMap(f))];
  const parts = [`- [${hs.map((h) => h.occurrenceId).join(', ')}] one scene, ${hs[0].time} → ${hs[hs.length - 1].time} — ${hs[0].title}:`];
  for (const h of hs) parts.push(`  · ${h.time} ${h.title}: ${compact && h.account.length > 220 ? h.account.slice(0, 217) + '…' : h.account}`);
  const actors = all((h) => h.actors), outcome = all((h) => h.outcome), later = all((h) => h.laterChanges);
  const causes = all((h) => h.causes.filter((c) => !ids.has(c.occurrenceId)).map((c) => `${c.title} [${c.occurrenceId}]`));
  if (actors.length) parts.push(`  actors: ${actors.join(', ')}`);
  if (outcome.length) parts.push(`  actual outcome: ${outcome.join('; ')}`);
  if (causes.length) parts.push(`  caused by: ${causes.join('; ')}`);
  if (later.length) parts.push(`  later changes: ${later.join('; ')}`);
  const why = [...new Set(triggers.flatMap((t) => (t ? [...t] : [])))];
  parts.push(`  origin: ${all((h) => [h.origin]).join('/')}; visibility: ${all((h) => [h.visibility]).join('/')}${why.length ? `; retrieved because: ${why.join('+')}` : ''}`);
  return parts.join('\n');
}

function stateLine(s: EntityStateView, checkpoint: string, compact: boolean): string {
  // "since" labels are produced by entityState in pack-day form; keep them compact.
  const f = s.facts.length ? s.facts.map((x) => `${x.predicate}=${x.display} (since ${x.since}${!compact && x.support ? `; ${x.support}` : ''})`).join('; ') : 'no established facts';
  const lines = [`- ${s.name} [${s.entityId}] (${s.kind}): ${f}.${compact ? '' : ` No other supported change through ${checkpoint}.`}`];
  if (s.unknown.length) lines.push(`  UNKNOWN (not established; do not assume normality): ${s.unknown.join(', ')}`);
  if (s.uncertain.length) lines.push(`  uncertain timing: ${s.uncertain.join('; ')}`);
  for (const p of s.parents) lines.push(`  inside ${p.parentName} [${p.parentId}] via ${p.predicate}: ${p.parentFacts.join('; ') || 'no facts'}`);
  return lines.join('\n');
}

function canonLine(c: CanonStatusView): string {
  return `- ${c.title} [${c.packEventId}] (${c.classification}): ${c.status.toUpperCase()} — ${c.note}`;
}

export function buildPacket(inp: PacketInput, compact = false): Packet {
  const { pack, index, retrieval, checkpointTick } = inp;
  const cpLabel = formatTick(checkpointTick, inp.origin);
  const required: string[] = [];
  const optional: string[] = [];
  required.push(`[CANON ENGINE CONTEXT — persisted engine data for this request. Categories are distinct; do not print them.]`);
  required.push(`CLOCK & SCENE: committed story time ${formatStoryTime(index.state.clock, inp.origin)}. ${inp.sceneLabel}`);
  if (checkpointTick > pack.coverage.end) required.push(`PACK COVERAGE ENDED at ${formatTick(pack.coverage.end, inp.origin)}: there is no further scheduled canon. Do not invent canonical events; continue only from actual history and the user's choices.`);
  // Actual history
  const occIds = [...retrieval.occurrences.keys()].filter((id) => index.state.occurrences.has(id));
  occIds.sort((a, b) => index.state.occurrences.get(a)!.time.lo - index.state.occurrences.get(b)!.time.lo);
  const groups = new Map<string, string[]>();
  for (const id of occIds) { const root = sceneRoot(index.state.occurrences, id); groups.set(root, [...(groups.get(root) || []), id]); }
  const hist = [...groups.values()].map((ids) => ids.length === 1
    ? histLine(index.historyView(ids[0], inp.origin)!, retrieval.occurrences.get(ids[0]), compact)
    : sceneHistLine(ids.map((id) => index.historyView(id, inp.origin)!), ids.map((id) => retrieval.occurrences.get(id)), compact));
  required.push('ACTUAL HISTORY (retrieved because causally relevant OR mentioned; actually happened in this branch):\n' + (hist.length ? hist.join('\n') : '- (no matching actual occurrences)'));
  // Entity state
  const ents = [...retrieval.entities.keys()].filter((id) => index.entityExists(id));
  const views = ents.map((id) => index.entityState(id, { tick: checkpointTick }));
  // Compact form keeps every fact: the per-entity "no other change" sentence moves into the header,
  // the support note behind each fact is left out, and entities with nothing established share one line.
  const bare = compact ? views.filter((v) => !v.facts.length && !v.unknown.length && !v.uncertain.length && !v.parents.length) : [];
  const states = views.filter((v) => !bare.includes(v)).map((v) => stateLine(v, cpLabel, compact));
  if (bare.length) states.push(`- no established facts: ${bare.map((v) => `${v.name} [${v.entityId}]`).join(', ')}`);
  required.push(`ENTITY / SCENE STATE at checkpoint ${cpLabel} (applies to every depicted entity, including incidental route stops${compact ? `; no other supported change through ${cpLabel}` : ''}):\n` + (states.length ? states.join('\n') : '- (no referenced entities)'));
  // Explicit canon statuses for referenced canonical events (non-occurrence distinctions)
  const canon = [...retrieval.canonEvents].map((id) => index.canonStatus(id, checkpointTick)).filter(Boolean) as CanonStatusView[];
  if (canon.length) required.push('REFERENCED CANON EVENTS — status in THIS branch (pending/future/omitted are NOT accomplished):\n' + canon.map(canonLine).join('\n'));
  // Deviations
  const devs = [...index.state.dispositions].filter(([, d]) => d.disposition !== 'occurred').map(([id, d]) => `- ${pack.events.get(id)?.title} [${id}] (${pack.events.get(id)?.classification}): ${d.disposition} — ${d.reason || ''}`);
  if (devs.length) required.push('DEVIATIONS (original outcomes superseded by actual play; do not restore them):\n' + devs.join('\n'));
  // Hard obligations
  const hard = pendingHard(pack, index.state);
  const horizonEnd = checkpointTick + inp.horizon;
  const dueSoon = hard.filter((h) => h.lo <= horizonEnd);
  const later = hard.filter((h) => h.lo > horizonEnd);
  const hardLines = dueSoon.map((h) => `- [${h.event.id}] ${formatTick(h.lo, inp.origin)}${h.hi !== h.lo ? ' – ' + formatTick(h.hi, inp.origin) : ''}: ${h.event.required_description} REQUIRED OUTCOMES: ${h.event.outcomes.map((o) => `${o.entity_id}.${o.predicate}=${JSON.stringify(o.value)}`).join(', ')}${h.hi <= checkpointTick ? ' **DUE NOW**' : ''}`);
  required.push('FUTURE OBLIGATIONS (HARD; fixed content/outcome/time; route may change):\n' + (hardLines.length ? hardLines.join('\n') : '- none within the current horizon') + (later.length ? `\n- later HARD obligations exist (${later.length}); do not contradict them.` : ''));
  if (inp.forced) required.push('MODE: FORCED CONVERGENCE authorized by the controller — extraordinary world intervention may be depicted as a new event. It cannot erase history or choose the player\'s actions.');
  // Plan
  if (inp.plan) {
    const ready = inp.plan.steps.filter((s) => s.status === 'ready' || s.status === 'proposed').slice(0, 6);
    if (ready.length) required.push('PROPOSED ACTIONS (intentions, NOT accomplished; NPCs know only what they plausibly know; if the user\'s message skips past a window, that action happened off-screen during the skip):\n' + ready.map((s) => `- [${s.step_id}] ${formatTick(s.earliest)}–${formatTick(s.latest)} ${s.actors.map((a) => index.entityName(a)).join(', ')}: ${s.action} (${s.means}; ${s.visibility})`).join('\n'));
  }
  if (inp.stagedNotes.length) required.push('STAGED THIS OPERATION (validated but uncommitted):\n' + inp.stagedNotes.map((s) => '- ' + s).join('\n'));
  // Knowledge boundaries
  const restricted = occIds.map((id) => index.state.occurrences.get(id)!).filter((o) => o.visibility.mode !== 'public');
  if (restricted.length) required.push('KNOWLEDGE BOUNDARIES (world truth vs who knows it):\n' + restricted.map((o) => `- ${o.title}: ${o.visibility.mode}; known to ${o.visibility.knower_ids.length ? o.visibility.knower_ids.map((x) => index.entityName(x)).join(', ') : 'no established knowledge holder'} — physical consequences remain visible; do not disclose the hidden cause to the player or other NPCs.`).join('\n'));
  if (retrieval.ambiguous.length) required.push('AMBIGUOUS REFERENCES (do not guess; keep ambiguity in narration):\n' + retrieval.ambiguous.map((a) => '- ' + a).join('\n'));
  required.push('PLAYER SCOPE (exact current player input; do not add actions/consent/dialogue beyond it):\n' + (inp.playerScope.length ? inp.playerScope.map((s) => '- ' + s).join('\n') : '- (no new player input in this operation)'));
  // Optional
  if (inp.opportunities.length) optional.push('PARTICIPATION OPPORTUNITIES (offer in-world only if plausible; never force; a decline is respected):\n' + inp.opportunities.map((s) => '- ' + s).join('\n'));
  const canonRef = dueSoon.slice(0, 3).map((h) => `- ${h.event.title}: original route — ${h.event.summary}`);
  if (canonRef.length) optional.push('CANON REFERENCE (original routes; reference only, NOT facts):\n' + canonRef.join('\n'));
  const open = pack.timeIndex
    .filter((t) => t.lo <= checkpointTick && t.hi > checkpointTick && !index.state.dispositions.has(t.id) && pack.events.get(t.id)?.classification !== 'HARD'
      // an event whose original preconditions already failed will not happen; do not suggest it
      && triLabel(evalCondition(pack.events.get(t.id)!.canonical_preconditions, index.state, pack, { tick: checkpointTick })) !== 'FALSE')
    .slice(0, 4).map((t) => { const e = pack.events.get(t.id)!; return `- ${e.title} (${formatTick(t.lo, inp.origin)} – ${formatTick(t.hi, inp.origin)}): ${e.summary.length > 160 ? e.summary.slice(0, 157) + '…' : e.summary}`; });
  if (open.length) optional.push('CANON EVENTS WITHIN THEIR WINDOW (not happened yet in this branch; if the story does not reach them they are settled offscreen when the window ends; NOT facts):\n' + open.join('\n'));

  const reqText = required.join('\n\n');
  let text = reqText;
  let truncated = false;
  for (const o of optional) {
    if (text.length + o.length + 2 <= inp.budgetChars) text += '\n\n' + o;
    else truncated = true;
  }
  if (reqText.length > inp.budgetChars) {
    if (!compact) return buildPacket(inp, true);
    const need = Math.ceil((reqText.length + 2000) / 10000) * 10000;
    throw new EngineError('capacity', `Required Canon Engine context (${reqText.length} chars: ${hist.length} history records, ${states.length} entity states) exceeds the configured budget (${inp.budgetChars}). Matched history and scene constraints are never silently dropped; raise budgetChars in Canon Engine advanced settings (高级设置) to at least ${need}.`);
  }
  const facts = [hist.join('\n'), states.join('\n')].filter(Boolean).join('\n');
  return { text, facts, hash: sha256(text), required: reqText.length, optional: text.length - reqText.length, truncatedOptional: truncated };
}
