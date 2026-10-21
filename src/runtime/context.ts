// Controller-owned retrieval (causal OR mentioned, plus scene/entity constraints) and the
// bounded GM context packet. The model receives record CONTENT, never bare ids.
import type { Id, PackEvent } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { WorldIndex, type HistoryRecordView, type EntityStateView, type CanonStatusView } from '../domain/world-query';
import { formatStoryTime, formatTick, toTick } from '../domain/time';
import { pendingHard, situationOf, upcomingRoute } from '../domain/schedule';
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

/** How many steps of causes are followed back from a retrieved record (one more for an event the text names).
 *  The whole chain back to the start of play grew with every turn; the nearest causes carry the "why". */
const CAUSE_DEPTH = 2;

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
      for (const c of index.causalClosure([o], { maxDepth: CAUSE_DEPTH })) add(occurrences, c, 'causal');
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
      for (const c of index.causalClosure([o], { maxDepth: CAUSE_DEPTH + 1 })) if (c !== o) add(occurrences, c, 'causal');
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
      for (const c of index.causalClosure([h.occurrenceId], { maxDepth: CAUSE_DEPTH })) add(occurrences, c, 'causal');
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
  /** Player-focused (关注) events that can still start soon. */
  focus?: string[];
  /** Story time the player's message explicitly jumps to ("睡到明天早上"): canon events starting before then are announced. */
  timeJumpTo?: number | null;
  budgetChars: number;
  horizon: number;
  /** Narrative integration (required context, also for the reviewer): the player's presence in the world and their
   *  binding decisions; and the one optional WORLD REACTION chosen for this reply (GM only). */
  presence?: string;
  decisions?: string;
  reaction?: string;
  /** The reviewer's copy: it gets the player's input, due HARD events and canon events now as separate inputs,
   *  so those sections and the GM-only background (canon routes, where others stand) are left out. */
  review?: boolean;
}

export interface Packet { text: string; facts: string; hash: string; required: number; optional: number; truncatedOptional: boolean }

const clip = (s: string) => (s.length > 160 ? s.slice(0, 157) + '…' : s);
/** Canon events starting within this much story time are announced to the GM ("about to start"). */
export const START_SOON_MINUTES = 120;
const minutesAway = (m: number) => (m >= 1440 ? `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h` : m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function histLine(h: HistoryRecordView, triggers: Set<string> | undefined, compact: boolean): string {
  const acc = compact && h.account.length > 220 ? h.account.slice(0, 217) + '…' : h.account;
  const parts = [`- [${h.occurrenceId}] ${h.time} — ${h.title}: ${acc}`];
  if (h.actors.length) parts.push(`  actors: ${h.actors.join(', ')}`);
  if (h.outcome.length) parts.push(`  actual outcome: ${h.outcome.join('; ')}`);
  if (h.causes.length) parts.push(`  caused by: ${h.causes.map((c) => `${c.title} [${c.occurrenceId}]`).join('; ')}`);
  if (h.laterChanges.length) parts.push(`  later changes: ${(compact ? h.laterChanges.map(clip) : h.laterChanges).join('; ')}`);
  parts.push(`  origin: ${h.origin}; visibility: ${h.visibility}`);
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
  if (later.length) parts.push(`  later changes: ${(compact ? later.map(clip) : later).join('; ')}`);
  parts.push(`  origin: ${all((h) => [h.origin]).join('/')}; visibility: ${all((h) => [h.visibility]).join('/')}`);
  return parts.join('\n');
}

function stateLine(s: EntityStateView, compact: boolean, listed: Set<string>): string {
  // "since" labels are produced by entityState in pack-day form; keep them compact. The support note is
  // left out when the supporting record is already in ACTUAL HISTORY (it always is when it has an occurrence).
  const f = s.facts.length ? s.facts.map((x) => `${x.predicate}=${x.display} (since ${x.since}${!compact && x.support && !listed.has(x.supportRecordId || '') ? `; ${x.support}` : ''})`).join('; ') : 'no established facts';
  const lines = [`- ${s.name} [${s.entityId}] (${s.kind}): ${f}.`];
  if (s.uncertain.length) lines.push(`  uncertain timing: ${s.uncertain.join('; ')}`);
  for (const p of s.parents) lines.push(`  inside ${p.parentName} [${p.parentId}] via ${p.predicate}: ${p.parentFacts.join('; ') || 'no facts'}`);
  return lines.join('\n');
}

/** Canonical events shown under way in play whose result is not settled (as long as offscreen catch-up leaves
 *  them to the story: up to a day past their window). */
function underWayEvents(index: WorldIndex, tick: number): { id: Id; title: string; summary: string; lo: number; hi: number; beats: string[] }[] {
  const ids = new Set([...index.state.occurrences.values()].map((o) => o.inProgressOf).filter(Boolean) as Id[]);
  const out: ReturnType<typeof underWayEvents> = [];
  for (const id of ids) {
    const ev = index.pack.events.get(id);
    const t = index.pack.timeIndex.find((x) => x.id === id);
    const beats = index.inProgressBeats(id);
    if (!ev || !t || !beats.length || tick > t.hi + 1440) continue;
    out.push({ id, title: ev.title, summary: ev.summary, lo: t.lo, hi: t.hi, beats: beats.map((o) => clip(o.account)) });
  }
  return out.slice(0, 4);
}

/** An event's cast at fixed times: who is already there at `tick` and who arrives later. */
function castLine(ev: PackEvent | undefined, index: WorldIndex, tick: number, origin: PacketInput['origin']): string {
  if (!ev?.cast?.length) return '';
  const parts = [...ev.cast].sort((a, b) => toTick(a.at) - toTick(b.at)).map((c) => {
    const at = toTick(c.at);
    return `${index.entityName(c.entity_id)} ${at <= tick ? 'there since' : 'arrives'} ${formatTick(at, origin)} (${c.role})`;
  });
  return `\n  cast: ${parts.join('; ')}`;
}
const CAST_RULE = 'CAST of an event (fixed times, like the event\'s own): each listed person is at the event from that time. Whoever\'s time has come is there — show them when the player character is there or arrives, even if the scene so far is about someone else. Whoever\'s time is later turns up at that time, whatever the player has done meanwhile (fighting or talking with someone else does not keep them away); only actual history that makes it impossible (dead, held captive) does. If your reply ends before someone\'s time, they have not arrived yet; do not move the clock to reach or avoid an arrival. What they do once there follows from actual play; the role says why they are there.';

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
  const listed = new Set(occIds.map((id) => index.state.occurrences.get(id)!.recordId));
  // Rules that hold for every entity are stated once in the header ("no other change", "not listed =
  // UNKNOWN") and entities with nothing established share one line. The compact form also leaves out
  // the support note behind each fact.
  const bare = views.filter((v) => !v.facts.length && !v.uncertain.length && !v.parents.length);
  const states = views.filter((v) => !bare.includes(v)).map((v) => stateLine(v, compact, listed));
  if (bare.length) states.push(`- no established facts: ${bare.map((v) => `${v.name} [${v.entityId}]`).join(', ')}`);
  required.push(`ENTITY / SCENE STATE at checkpoint ${cpLabel} (applies to every depicted entity, including incidental route stops; no other supported change through ${cpLabel}; a property not listed for an entity is UNKNOWN — not established, do not assume normality):\n` + (states.length ? states.join('\n') : '- (no referenced entities)'));
  // The player in the world and their decisions: required, never dropped for budget, also for the reviewer.
  if (inp.presence) required.push(inp.presence);
  if (inp.decisions) required.push(inp.decisions);
  // Explicit canon statuses for referenced canonical events (non-occurrence distinctions)
  const canon = [...retrieval.canonEvents].map((id) => index.canonStatus(id, checkpointTick)).filter(Boolean) as CanonStatusView[];
  if (canon.length) required.push('REFERENCED CANON EVENTS — status in THIS branch (pending/future/omitted are NOT accomplished):\n' + canon.map(canonLine).join('\n'));
  // Canon events starting shortly: the reply's own end time is only decided after it is written, so the GM
  // is told what begins if its story time gets there (not a reason to steer toward them).
  // A time jump the player asked for ("睡到明天早上") reaches further: everything starting before its target.
  const jump = inp.timeJumpTo && inp.timeJumpTo > checkpointTick ? inp.timeJumpTo - checkpointTick : 0;
  const starting = upcomingRoute(pack, index.state, checkpointTick, Math.max(START_SOON_MINUTES, jump), jump > START_SOON_MINUTES ? 10 : 6);
  if (starting.length && !inp.review) {
    const head = jump > START_SOON_MINUTES
      ? `CANON EVENTS ABOUT TO START — the player's message jumps story time to ${formatTick(inp.timeJumpTo!, inp.origin)}; these start before then (NOT happened yet). Each begins at its time during the jump — the world does not wait: reflect the ones the player character would witness, be woken or interrupted by, or plausibly hear about; the others happen out of sight and you do not mention them. Keep the jump the player asked for: do not cut it short or stretch it to reach or avoid an event; their course and result follow from actual play`
      : `CANON EVENTS ABOUT TO START (within ${START_SOON_MINUTES / 60} hours of story time; NOT happened yet). If the story time of your reply reaches an event's start, it begins then — the world does not wait: show its start where the player character is present or would plausibly notice; otherwise it begins out of sight and you do not mention it. Do not speed up or slow down time to reach or avoid it; its course and result follow from actual play`;
    required.push(`${head}:\n` + starting.map((u) => `- ${u.event.title} [${u.event.id}] starts ${formatTick(u.lo, inp.origin)} (in ${minutesAway(u.lo - checkpointTick)}): ${situationOf(u.event.summary)}${castLine(u.event, index, checkpointTick, inp.origin)}`).join('\n'));
  }
  // Canon events the story has started but not finished: always shown, whether or not the latest messages name them.
  const underWay = underWayEvents(index, checkpointTick);
  if (underWay.length) required.push('CANON EVENTS UNDER WAY in this branch (started in the story, result NOT settled yet; continue from where they stand: their course and result follow from actual play and the player\'s choices; the original route is reference only):\n' + underWay.map((u) => `- ${u.title} [${u.id}] (window ${formatTick(u.lo, inp.origin)} – ${formatTick(u.hi, inp.origin)}): so far — ${u.beats.join(' → ')}. Original route (reference): ${u.summary}${castLine(index.pack.events.get(u.id), index, checkpointTick, inp.origin)}`).join('\n'));
  // Deviations
  const devs = [...index.state.dispositions].filter(([, d]) => d.disposition !== 'occurred').map(([id, d]) => `- ${pack.events.get(id)?.title} [${id}] (${pack.events.get(id)?.classification}): ${d.disposition} — ${d.reason || ''}`);
  if (devs.length) required.push('DEVIATIONS (original outcomes superseded by actual play; do not restore them):\n' + devs.join('\n'));
  // Hard obligations
  const hard = pendingHard(pack, index.state);
  const horizonEnd = checkpointTick + inp.horizon;
  const dueSoon = hard.filter((h) => h.lo <= horizonEnd);
  const later = hard.filter((h) => h.lo > horizonEnd);
  const hardLines = dueSoon.map((h) => `- [${h.event.id}] ${formatTick(h.lo, inp.origin)}${h.hi !== h.lo ? ' – ' + formatTick(h.hi, inp.origin) : ''}: ${h.event.required_description} REQUIRED OUTCOMES: ${h.event.outcomes.map((o) => `${o.entity_id}.${o.predicate}=${JSON.stringify(o.value)}`).join(', ')}${h.hi <= checkpointTick ? ' **DUE NOW**' : ''}${castLine(h.event, index, checkpointTick, inp.origin)}`);
  if (!inp.review) required.push('FUTURE OBLIGATIONS (HARD; fixed content/outcome/time; route may change):\n' + (hardLines.length ? hardLines.join('\n') : '- none within the current horizon') + (later.length ? `\n- later HARD obligations exist (${later.length}); do not contradict them.` : ''));
  if (inp.forced) required.push('MODE: FORCED CONVERGENCE authorized by the controller — extraordinary world intervention may be depicted as a new event. It cannot erase history or choose the player\'s actions.');
  // Plan
  if (inp.plan) {
    const ready = inp.plan.steps.filter((s) => s.status === 'ready' || s.status === 'proposed').slice(0, 6);
    if (ready.length) required.push('PROPOSED ACTIONS (intentions, NOT accomplished; NPCs know only what they plausibly know; if the user\'s message skips past a window, that action happened off-screen during the skip):\n' + ready.map((s) => `- [${s.step_id}] ${formatTick(s.earliest)}–${formatTick(s.latest)} ${s.actors.map((a) => index.entityName(a)).join(', ')}: ${s.action} (${s.means}; ${s.visibility})`).join('\n'));
  }
  if (inp.stagedNotes.length) required.push('STAGED THIS OPERATION (validated but uncommitted):\n' + inp.stagedNotes.map((s) => '- ' + s).join('\n'));
  // Knowledge boundaries
  const restricted = occIds.map((id) => index.state.occurrences.get(id)!).filter((o) => o.visibility.mode !== 'public');
  // Each record above already carries its visibility and knowers: state the rule once.
  if (restricted.length) required.push(`KNOWLEDGE BOUNDARIES (world truth vs who knows it): ${restricted.length} record(s) above are not public and are known only to the knowers listed with them (none listed: no established knowledge holder). Physical consequences remain visible; do not disclose the hidden cause to the player or other NPCs.`);
  if (retrieval.ambiguous.length) required.push('AMBIGUOUS REFERENCES (do not guess; keep ambiguity in narration):\n' + retrieval.ambiguous.map((a) => '- ' + a).join('\n'));
  if (inp.reaction && !inp.review) required.push(inp.reaction);
  if (!inp.review) required.push('PLAYER SCOPE (exact current player input; do not add actions/consent/dialogue beyond it):\n' + (inp.playerScope.length ? inp.playerScope.map((s) => '- ' + s).join('\n') : '- (no new player input in this operation)'));
  // Optional
  if (inp.focus?.length) optional.push('PLAYER WANTS TO EXPERIENCE (关注; for these events only this overrides "do not steer"): give the player character natural in-world chances to be present or involved when each one starts — an invitation, a rumor or news that reaches them, an errand or a chance meeting that brings them there, characters who would plausibly involve them. Lead up to it plausibly; do not force its course or result, do not act or decide for the player, and accept a decline:\n' + inp.focus.join('\n'));
  if (inp.opportunities.length) optional.push('PARTICIPATION OPPORTUNITIES (offer in-world only if plausible; never force; a decline is respected):\n' + inp.opportunities.map((s) => '- ' + s).join('\n'));
  const canonRef = dueSoon.slice(0, 3).map((h) => `- ${h.event.title}: original route — ${h.event.summary}`);
  if (canonRef.length) optional.push('CANON REFERENCE (original routes; reference only, NOT facts):\n' + canonRef.join('\n'));
  const openEvents = pack.timeIndex
    .filter((t) => t.lo <= checkpointTick && t.hi > checkpointTick && !index.state.dispositions.has(t.id) && pack.events.get(t.id)?.classification !== 'HARD' && !underWay.some((u) => u.id === t.id)
      // an event whose original preconditions already failed will not happen; do not suggest it
      && triLabel(evalCondition(pack.events.get(t.id)!.canonical_preconditions, index.state, pack, { tick: checkpointTick })) !== 'FALSE')
    .slice(0, 4);
  const open = openEvents.map((t) => { const e = pack.events.get(t.id)!; return `- ${e.title} (${formatTick(t.lo, inp.origin)} – ${formatTick(t.hi, inp.origin)}): ${e.summary.length > 160 ? e.summary.slice(0, 157) + '…' : e.summary}${castLine(e, index, checkpointTick, inp.origin)}`; });
  const soon = upcomingRoute(pack, index.state, checkpointTick, 24 * 60).filter((u) => !starting.some((x) => x.event.id === u.event.id)).map((u) => `- ${formatTick(u.lo, inp.origin)} ${u.event.title}: ${situationOf(u.event.summary)}`);
  if (soon.length) optional.push('WHERE OTHER CHARACTERS STAND (background only; from the original story of the next 24 hours; what these characters currently know, want and are doing — NOT what must happen). Use it only so that characters act on their own knowledge and motives: nobody notices, learns or pursues something earlier than this implies. Do not steer toward these events or foreshadow them (a WORLD REACTION given above is the one way the world may reach the player); the player may change them, and actual play wins over this:\n' + soon.join('\n'));
  // An event in its window with a cast says who is there right now: never dropped for budget.
  const openCast = openEvents.some((t) => pack.events.get(t.id)!.cast?.length);
  if (open.length) (openCast && !inp.review ? required : optional).push('CANON EVENTS WITHIN THEIR WINDOW (not happened yet in this branch; if the story does not reach them they are settled offscreen when the window ends; NOT facts):\n' + open.join('\n'));
  // The cast rule is stated once, whenever an event shown above (starting, under way, HARD, in its window) has a cast.
  const castShown = openCast || starting.some((u) => u.event.cast?.length) || underWay.some((u) => pack.events.get(u.id)?.cast?.length) || dueSoon.some((h) => h.event.cast?.length);
  if (castShown && !inp.review) {
    // For events under way the player is in: who must be in the scene now and who comes next, named outright.
    const due = underWay.flatMap((u) => {
      const cast = pack.events.get(u.id)?.cast || [];
      const here = cast.filter((c) => toTick(c.at) <= checkpointTick).map((c) => index.entityName(c.entity_id));
      const next = cast.filter((c) => toTick(c.at) > checkpointTick).sort((a, b) => toTick(a.at) - toTick(b.at)).map((c) => `${index.entityName(c.entity_id)} at ${formatTick(toTick(c.at), inp.origin)}`);
      return here.length || next.length ? [`- ${u.title}: present now — ${here.join(', ') || 'nobody listed'}${next.length ? `; still to come — ${next.join(', ')}` : ''}. Everyone present now takes part in this reply's scene (someone not shown yet enters it now).`] : [];
    });
    required.push(CAST_RULE + (due.length ? '\nAT THE EVENT UNDER WAY:\n' + due.join('\n') : ''));
  }

  if (inp.review) optional.length = 0;
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
