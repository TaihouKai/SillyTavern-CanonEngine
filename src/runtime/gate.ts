// Deterministic gate over evaluator output: evidence, references, time, Hard invariants,
// player agency, plan transitions, state contradictions, containment and coverage.
// The evaluator's own verdicts never bypass these checks.
import type { FactDelta, FactValue, Id, Occurrence, RuntimeEntity, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { claimComparable, normalizeValue, valuesEqual } from '../domain/pack';
import { factAt } from '../domain/reducer';
import type { WorldIndex } from '../domain/world-query';
import { toTick, formatTick } from '../domain/time';
import { pendingHard } from '../domain/schedule';
import { newId, quoteInText, uniq } from '../domain/util';
import type { ClaimInput, Retrieval } from './context';
import type { CoverageEntry, PlanRevision, PlayerAction, RecordDraft, StateClaim } from './types';

export interface EvalOutput {
  decision: 'retain' | 'repair' | 'conflict';
  scene_end: { lo: { day: number; minute: number }; hi: { day: number; minute: number }; precision: StoryTime['precision'] } | null;
  flashback?: boolean;
  claim_checks: { claim_id: string; verdict: string; record_ids?: string[]; note?: string }[];
  transitions: { op: 'set' | 'unset'; entity_id: string; predicate: string; value?: FactValue; quote?: string; occurrence_ref?: string | null }[];
  occurrences: {
    ref: string; title: string; account: string; actors: string[]; affected?: string[]; locations?: string[];
    time?: EvalOutput['scene_end']; causes?: string[]; quote: string; pack_event_id?: string | null; disposition?: 'occurred' | 'diverged' | null;
    ref_phrases?: string[]; continues?: string | null; visibility?: 'public' | 'restricted' | 'secret'; knowers?: string[]; origin?: 'player' | 'gm' | 'intervention';
  }[];
  state_claims: { entity_id: string; predicate: string; value: FactValue; quote: string; at?: { day: number; minute: number } | null }[];
  player_actions: { quote: string; authorized_by_quote: string | null }[];
  step_enactments?: { step_id: string; occurrence_ref: string; quote: string }[];
  new_entities?: { ref: string; name: string; kind: RuntimeEntity['kind']; description: string; quote: string }[];
  violations: { code: string; quote?: string; detail: string }[];
  hard_checks: { event_id: string; status: 'fulfilled' | 'not_due' | 'missing' | 'contradicted'; occurrence_ref?: string | null; quote?: string | null }[];
  scene_entities?: string[];
  summary?: string;
}

export interface GateInput {
  pack: LoadedPack;
  index: WorldIndex; // committed prefix + staged overlay
  text: string; // complete candidate (or complete revised reply)
  userText: string;
  userSource: { messageId: string; contentHash: string } | null;
  evaluation: EvalOutput;
  retrieval: Retrieval;
  claims: ClaimInput[];
  plan: PlanRevision | null;
  clockTick: number;
  /** Staged offscreen occurrences for HARD events crossed in this operation (eventId -> occurrence). */
  stagedHard: Map<Id, Occurrence>;
  mode: 'draft' | 'retained';
  forced: boolean;
}

export interface GateResult {
  violations: string[];
  warnings: string[];
  records: RecordDraft[];
  stateClaims: StateClaim[];
  playerActions: PlayerAction[];
  sceneEnd: StoryTime | null;
  flashback: boolean;
  sceneEntities: Id[];
  enactedSteps: string[];
  hardFulfilled: Id[];
  coverage: CoverageEntry[];
  coverageGaps: string[];
  runtimeEntities: RuntimeEntity[];
}

const DESTRUCTIVE = /(destroy|ruin|demolish|collaps|dead|dissolv|gone|burn|毁|废|塌|灭|亡|解散)/i;

export function toStoryTime(t: EvalOutput['scene_end'] | undefined | null): StoryTime | null {
  if (!t) return null;
  const lo = toTick(t.lo), hi = toTick(t.hi);
  return { lo: Math.min(lo, hi), hi: Math.max(lo, hi), precision: t.precision };
}

function slug(s: string): string {
  return (String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'entity').slice(0, 24);
}

export function runGate(g: GateInput): GateResult {
  const { pack, index, text, evaluation: ev } = g;
  const violations: string[] = [];
  const warnings: string[] = [];
  const records: RecordDraft[] = [];
  const hasQuote = (q?: string | null) => !!q && quoteInText(q, text);

  // ---- runtime entities (code-assigned ids) ---------------------------------------------------
  const runtimeEntities: RuntimeEntity[] = [];
  const refToId = new Map<string, Id>();
  for (const ne of ev.new_entities || []) {
    if (!hasQuote(ne.quote)) { warnings.push(`new entity "${ne.name}" dropped: evidence not found in text`); continue; }
    const existing = index.resolveEntity(ne.name);
    if (existing.ids.length) {
      // Renaming/duplicating a known identity cannot bypass its history (W17).
      refToId.set(ne.ref, existing.ids[0]);
      warnings.push(`"${ne.name}" resolves to existing entity ${existing.ids[0]}; not registered as new`);
      continue;
    }
    const id = `rt.${slug(ne.name)}.${newId('e').slice(2, 8)}`;
    runtimeEntities.push({ id, name: ne.name, aliases: [], kind: ne.kind, description: ne.description });
    refToId.set(ne.ref, id);
    refToId.set(ne.name, id);
  }
  const resolveId = (x: string): Id | null => {
    if (refToId.has(x)) return refToId.get(x)!;
    if (index.entityExists(x)) return x;
    if (runtimeEntities.some((r) => r.id === x)) return x;
    const r = index.resolveEntity(x);
    return r.ids.length === 1 ? r.ids[0] : null;
  };
  const entityKnown = (id: Id) => index.entityExists(id) || runtimeEntities.some((r) => r.id === id);

  // ---- typed delta validation ------------------------------------------------------------------
  const checkDelta = (d: { op: 'set' | 'unset'; entity_id: string; predicate: string; value?: FactValue }, where: string): FactDelta | null => {
    const eid = resolveId(d.entity_id);
    if (!eid || !entityKnown(eid)) { warnings.push(`${where}: unknown entity "${d.entity_id}" (kept as narrative detail only)`); return null; }
    const p = pack.predicates.get(d.predicate);
    if (!p) { warnings.push(`${where}: undeclared predicate "${d.predicate}" (kept as narrative detail only)`); return null; }
    if (d.op === 'unset') return { op: 'unset', entity_id: eid, predicate: p.id };
    let v = d.value as FactValue;
    const okType =
      (p.value_type === 'boolean' && typeof v === 'boolean') ||
      (p.value_type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
      (p.value_type === 'string' && typeof v === 'string') ||
      (p.value_type === 'entity_ref' && typeof v === 'string') ||
      (p.value_type === 'entity_set' && Array.isArray(v));
    if (!okType) { warnings.push(`${where}: value ${JSON.stringify(v)} has the wrong type for ${p.id}`); return null; }
    if (p.value_type === 'entity_ref') { const r = resolveId(String(v)); if (!r) { warnings.push(`${where}: unknown entity value ${v}`); return null; } v = r; }
    if (p.value_type === 'entity_set') {
      const arr = (v as string[]).map((x) => resolveId(x));
      if (arr.some((x) => !x)) { warnings.push(`${where}: unknown entity in set`); return null; }
      v = normalizeValue(arr as string[]);
    }
    if (p.allowed_values && !p.allowed_values.some((a) => valuesEqual(a, v))) { warnings.push(`${where}: ${JSON.stringify(v)} not allowed for ${p.id}`); return null; }
    return { op: 'set', entity_id: eid, predicate: p.id, value: v };
  };

  // ---- time --------------------------------------------------------------------------------
  let sceneEnd = toStoryTime(ev.scene_end);
  const flashback = !!ev.flashback;
  if (sceneEnd && !flashback && sceneEnd.hi < g.clockTick) violations.push(`Story time moves backwards (ends ${formatTick(sceneEnd.hi)} before the committed ${formatTick(g.clockTick)}) without a flashback frame or recorded intervention.`);
  if (!sceneEnd) sceneEnd = { lo: g.clockTick, hi: g.clockTick, precision: 'approx' };

  // ---- HARD invariants ------------------------------------------------------------------------
  const pendingHardMap = new Map(pendingHard(pack, index.state).map((c) => [c.event.id, c]));
  const hardOutcomeKeys = new Map<string, Id>();
  // the earliest pending HARD event that requires the fact (a fact can be required by several, e.g. a conflict starting and ending)
  for (const [id, c] of pendingHardMap) for (const o of c.event.outcomes) if (!hardOutcomeKeys.has(`${o.entity_id}|${o.predicate}`)) hardOutcomeKeys.set(`${o.entity_id}|${o.predicate}`, id);

  // occurrences
  const occByRef = new Map<string, Occurrence>();
  const occRecords: RecordDraft[] = [];
  const hardFulfilled: Id[] = [];
  const transitionsByRef = new Map<string, FactDelta[]>();
  const looseDeltas: { d: FactDelta; quote: string }[] = [];
  // Reviewer bookkeeping slips around HARD events (real-model finding): the HARD check names the
  // occurrence that fulfils it but that occurrence lacks pack_event_id, or a required outcome fact with
  // exactly the required value is filed under a sibling occurrence (or none). Re-file them; a different
  // value is still a violation below.
  for (const h of ev.hard_checks) {
    if (h.status !== 'fulfilled' || !h.occurrence_ref || !pendingHardMap.has(h.event_id) || ev.occurrences.some((x) => x.pack_event_id === h.event_id)) continue;
    const o = ev.occurrences.find((x) => x.ref === h.occurrence_ref && !x.pack_event_id);
    if (o) { o.pack_event_id = h.event_id; o.disposition = 'occurred'; warnings.push(`occurrence "${o.title}" linked to HARD ${h.event_id} from the reviewer's HARD check`); }
  }
  const hardOccRef = new Map<Id, string>();
  for (const o of ev.occurrences) if (o.pack_event_id && pendingHardMap.has(o.pack_event_id)) hardOccRef.set(o.pack_event_id, o.ref);
  for (const t of ev.transitions) {
    if (!hasQuote(t.quote)) { warnings.push(`transition ${t.entity_id}.${t.predicate} dropped: evidence quote not found`); continue; }
    const d = checkDelta(t, 'transition');
    if (!d) continue;
    // (a fact can be a required outcome of several HARD events, e.g. a conflict starting and ending)
    const hardRef = d.op === 'set' ? [...hardOccRef].find(([hid]) => pendingHardMap.get(hid)!.event.outcomes.some((r) => r.entity_id === d.entity_id && r.predicate === d.predicate && valuesEqual(r.value, d.value!)))?.[1] : undefined;
    if (hardRef && t.occurrence_ref !== hardRef) {
      warnings.push(`transition ${d.entity_id}.${d.predicate} re-filed under the HARD occurrence ${hardRef} (was ${t.occurrence_ref || 'none'})`);
      t.occurrence_ref = hardRef;
    }
    if (t.occurrence_ref) transitionsByRef.set(t.occurrence_ref, [...(transitionsByRef.get(t.occurrence_ref) || []), d]);
    else looseDeltas.push({ d, quote: t.quote! });
  }
  for (const o of ev.occurrences) {
    if (!hasQuote(o.quote)) { warnings.push(`occurrence "${o.title}" dropped: evidence quote not found in text`); continue; }
    const actors = uniq(o.actors.map(resolveId).filter(Boolean) as Id[]);
    const affected = uniq((o.affected || []).map(resolveId).filter(Boolean) as Id[]);
    const locations = uniq((o.locations || []).map(resolveId).filter(Boolean) as Id[]);
    const causes = (o.causes || []).filter((c) => index.state.occurrences.has(c) || occByRef.has(c));
    const deltas = transitionsByRef.get(o.ref) || [];
    let time = toStoryTime(o.time) || { ...sceneEnd };
    const occ: Occurrence = {
      occurrenceId: newId('occ'), title: o.title, account: o.account, actors, affected, locations, time, outcome: deltas,
      causes: causes.map((c) => occByRef.get(c)?.occurrenceId || c), refPhrases: uniq([o.title, ...(o.ref_phrases || [])]),
      origin: o.origin === 'player' ? 'player' : o.origin === 'intervention' ? 'intervention' : 'gm',
      visibility: { mode: o.visibility || 'public', knower_ids: uniq((o.knowers || []).map(resolveId).filter(Boolean) as Id[]) },
    };
    let kind: RecordDraft['kind'] = occ.origin === 'player' ? 'enacted_action' : occ.origin === 'intervention' ? 'authored_intervention' : 'world_event';
    let packEventId: Id | undefined;
    let disposition: 'occurred' | 'diverged' | undefined;
    if (o.pack_event_id) {
      const pe = pack.events.get(o.pack_event_id);
      if (!pe) violations.push(`Occurrence cites unknown canonical event "${o.pack_event_id}".`);
      else if (index.state.dispositions.has(pe.id)) violations.push(`"${pe.title}" already has a disposition in this branch; it cannot occur again as the same canonical event.`);
      else {
        packEventId = pe.id;
        occ.packEventId = pe.id;
        disposition = o.disposition === 'diverged' ? 'diverged' : 'occurred';
        kind = 'canon_occurrence';
        const st = pack.timeIndex.find((x) => x.id === pe.id);
        if (st) {
          // clamp to the authored bounds; outside them is a violation for HARD
          if (time.hi < st.lo || time.lo > st.hi) {
            if (pe.classification === 'HARD') violations.push(`HARD "${pe.title}" is depicted at ${formatTick(time.lo)}, outside its authored bounds ${formatTick(st.lo)}–${formatTick(st.hi)}.`);
            time = { lo: Math.max(st.lo, Math.min(time.lo, st.hi)), hi: Math.min(st.hi, Math.max(time.hi, st.lo)), precision: 'range' };
          }
          occ.time = { lo: Math.max(time.lo, st.lo), hi: Math.min(time.hi, st.hi), precision: time.precision };
        }
        if (pe.classification === 'HARD') {
          const missing = pe.outcomes.filter((req) => !deltas.some((d) => d.op === 'set' && d.entity_id === req.entity_id && d.predicate === req.predicate && valuesEqual(d.value, req.value)));
          const wrong = deltas.filter((d) => pe.outcomes.some((req) => req.entity_id === d.entity_id && req.predicate === d.predicate && (d.op === 'unset' || !valuesEqual(d.value!, req.value))));
          if (disposition !== 'occurred' || missing.length || wrong.length) {
            violations.push(`HARD "${pe.title}" must occur with its exact required outcome (${pe.required_description}). Depicted result differs: missing ${missing.map((m) => `${m.entity_id}.${m.predicate}=${JSON.stringify(m.value)}`).join(', ') || 'none'}${wrong.length ? `; conflicting ${wrong.map((w) => `${w.entity_id}.${w.predicate}=${JSON.stringify(w.op === 'set' ? w.value : null)}`).join(', ')}` : ''}.`);
          } else {
            const hc = ev.hard_checks.find((h) => h.event_id === pe.id);
            if (!hc || hc.status !== 'fulfilled') violations.push(`HARD "${pe.title}" outcome facts are claimed but the reviewer did not confirm the required content is depicted (${hc?.status || 'no check'}).`);
            else hardFulfilled.push(pe.id);
          }
        }
      }
    }
    if (o.continues && !packEventId) {
      const prev = occByRef.get(o.continues) || index.state.occurrences.get(o.continues);
      if (prev && !prev.packEventId && prev.occurrenceId !== occ.occurrenceId) occ.continues = prev.occurrenceId;
      else warnings.push(`occurrence "${o.title}": continues=${o.continues} ignored (unknown or canonical box)`);
    }
    occByRef.set(o.ref, occ);
    occRecords.push({
      recordId: newId('rec'), kind, storyTime: occ.time, sourceRefs: [], factsSetOrUnset: deltas, eventOccurrenceIds: [occ.occurrenceId],
      occurrences: [occ], visibility: occ.visibility, summary: `${occ.title}${packEventId ? ` (${disposition} ${packEventId})` : ''}`,
      evidenceKind: 'direct', packEventId, disposition, dispositionReason: packEventId ? `depicted in accepted reply: "${o.quote.slice(0, 120)}"` : undefined,
    });
  }
  // transitions referencing a missing occurrence ref become loose
  for (const [ref, ds] of transitionsByRef) if (!occByRef.has(ref)) ds.forEach((d) => looseDeltas.push({ d, quote: '' }));

  // C17: HARD outcome facts can only be produced by the HARD occurrence itself
  for (const { d } of looseDeltas) {
    const hid = hardOutcomeKeys.get(`${d.entity_id}|${d.predicate}`);
    if (hid) violations.push(`Fact ${d.entity_id}.${d.predicate} is a required outcome of pending HARD "${pack.events.get(hid)!.title}"; it can only be established by depicting that event occurring at its authored time.`);
  }
  for (const r of occRecords) {
    if (r.packEventId && pack.events.get(r.packEventId)?.classification === 'HARD') continue;
    for (const d of r.factsSetOrUnset) {
      const hid = hardOutcomeKeys.get(`${d.entity_id}|${d.predicate}`);
      if (hid) violations.push(`"${r.summary}" sets ${d.entity_id}.${d.predicate}, a required outcome of pending HARD "${pack.events.get(hid)!.title}", without that event occurring.`);
    }
  }

  // HARD deadlines crossed by this reply must be realized (onscreen or by staged offscreen adjudication).
  for (const [id, c] of pendingHardMap) {
    if (hardFulfilled.includes(id) || g.stagedHard.has(id)) continue;
    if (c.hi <= sceneEnd.lo || c.hi <= g.clockTick) {
      violations.push(`HARD "${c.event.title}" is due by ${formatTick(c.hi)} and this reply reaches ${formatTick(Math.max(sceneEnd.lo, g.clockTick))}, but the event is not realized: ${c.event.required_description}`);
    } else if (!flashback && c.hi <= sceneEnd.hi) {
      // Ambiguous end time straddles a HARD checkpoint: never pick a convenient endpoint.
      violations.push(`The reply's end time is ambiguous (${formatTick(sceneEnd.lo)}–${formatTick(sceneEnd.hi)}) around the HARD checkpoint "${c.event.title}" at ${formatTick(c.hi)}. Either stop the scene clearly before it, or depict it: ${c.event.required_description}`);
    }
  }
  // Reviewer-reported contradictions of HARD contracts
  for (const h of ev.hard_checks) if (h.status === 'contradicted') violations.push(`Reviewer: text contradicts HARD "${pack.events.get(h.event_id)?.title || h.event_id}" (${h.quote || ''}).`);

  // ---- player agency ---------------------------------------------------------------------------
  const playerActions: PlayerAction[] = [];
  for (const a of ev.player_actions) {
    if (!hasQuote(a.quote)) continue;
    const auth = a.authorized_by_quote && g.userSource && quoteInText(a.authorized_by_quote, g.userText) ? { messageId: g.userSource.messageId, quote: a.authorized_by_quote } : null;
    if (!auth && g.mode === 'draft') violations.push(`The reply narrates a player action/decision/dialogue the user did not authorize: "${a.quote}". Do not supply voluntary player actions.`);
    playerActions.push({ quote: a.quote, authorizedBy: auth });
  }

  // ---- state claims vs actual state (+ staged overlay, containment) -----------------------------
  const stateClaims: StateClaim[] = [];
  const cp = { tick: Math.max(sceneEnd.lo, g.clockTick) };
  const setInReply = (eid: Id, pred: Id, v: FactValue) =>
    occRecords.some((r) => r.factsSetOrUnset.some((d) => d.op === 'set' && d.entity_id === eid && d.predicate === pred && valuesEqual(d.value, v)));
  const checkClaim = (eid: Id, pred: Id, value: FactValue, quote: string, label: string, atTick?: number) => {
    // Each claim is checked at its own story checkpoint (flashbacks use then-valid facts).
    const claimCp = atTick !== undefined ? { tick: atTick } : cp;
    const f = factAt(index.state, eid, pred, claimCp);
    if (f.known && !valuesEqual(f.value!, value) && claimComparable(pack, pred, value)) {
      if (atTick === undefined && setInReply(eid, pred, value)) return; // a genuine staged change with its own occurrence
      const rec = f.supportRecordId ? index.state.recordById.get(f.supportRecordId) : undefined;
      violations.push(`${label} "${quote}" presupposes ${index.entityName(eid)}.${pred}=${JSON.stringify(value)}, but the actual state is ${JSON.stringify(f.value)} (established by: ${rec?.summary || 'record'}). No supported change is recorded through this scene.`);
      return;
    }
    if (!f.known) {
      // containment: an unknown own state inside a destroyed parent
      const st = index.entityState(eid, claimCp);
      for (const p of st.parents) {
        const pf = factAt(index.state, p.parentId, pred, claimCp);
        if (pf.known && typeof pf.value === 'string' && DESTRUCTIVE.test(pf.value) && !valuesEqual(pf.value, value)) {
          violations.push(`${label} "${quote}" presents ${index.entityName(eid)} as ${pred}=${JSON.stringify(value)}, but it lies inside ${p.parentName}, whose ${pred} is ${JSON.stringify(pf.value)}, and no supported exception is recorded.`);
        }
      }
    }
  };
  for (const c of ev.state_claims) {
    if (!hasQuote(c.quote)) continue;
    const eid = resolveId(c.entity_id);
    if (!eid || !pack.predicates.has(c.predicate)) continue;
    stateClaims.push({ entity_id: eid, predicate: c.predicate, value: c.value, quote: c.quote });
    if (flashback && !c.at) continue; // a flashback claim without its time cannot be checked against the present
    checkClaim(eid, c.predicate, c.value, c.quote, c.at ? 'Flashback' : 'Narration', c.at ? toTick(c.at) : undefined);
  }
  // discovery "expected" facts on narrator-asserted claims are checked deterministically too
  for (const c of g.claims) {
    if (!c.expected || !['narrator', 'new_event'].includes(c.assertion) || flashback) continue;
    if (!quoteInText(c.quote, text)) continue;
    const eid = resolveId(c.expected.entity_id);
    if (!eid || !pack.predicates.has(c.expected.predicate)) continue;
    checkClaim(eid, c.expected.predicate, c.expected.value as FactValue, c.quote, 'Claim');
  }

  // ---- coverage: every discovered claim needs a verdict; contradictions block --------------------
  const coverage = g.retrieval.entries.map((e) => ({ ...e }));
  const coverageGaps: string[] = [];
  const checks = new Map(ev.claim_checks.map((c) => [c.claim_id, c]));
  for (const c of g.claims) {
    const chk = checks.get(c.id);
    if (!chk) { coverageGaps.push(`claim ${c.id} ("${c.quote.slice(0, 80)}") was not reviewed`); continue; }
    if (chk.verdict === 'contradiction') violations.push(`Contradiction with actual history/state: "${c.quote}"${chk.note ? ` — ${chk.note}` : ''}`);
    // Only claims about what HAPPENED (recollections, causes) need an actual record. Present-scene
    // details without a record are compatible new details unless they contradict something.
    if (chk.verdict === 'unsupported' && ['recollection', 'causal'].includes(c.kind) && ['narrator', 'new_event'].includes(c.assertion)) {
      violations.push(`Unsupported historical claim (no actual record): "${c.quote}"${chk.note ? ` — ${chk.note}` : ''}`);
    } else if (chk.verdict === 'unsupported' && ['narrator', 'new_event'].includes(c.assertion)) {
      warnings.push(`present-state detail without a record (accepted as new detail): "${c.quote.slice(0, 80)}"`);
    }
    if (chk.verdict === 'unsupported' && c.kind === 'recollection' && c.assertion === 'dialogue') warnings.push(`character recollection without record (kept as a belief): "${c.quote.slice(0, 80)}"`);
  }
  for (const e of coverage) {
    const looked = e.lookups.entityIds.length + e.lookups.occurrenceIds.length + e.lookups.canonEventIds.length > 0 || e.disposition === 'new' || e.disposition === 'unresolved';
    e.checked = looked;
    if (!looked) coverageGaps.push(`reference ${e.refId} has no lookup`);
    if (e.disposition === 'unresolved' && e.kind === 'event' && ['narrator'].includes(e.assertion) && e.quote && quoteInText(e.quote, text)) {
      // an asserted past event with no actual record must be reviewed explicitly
      const chk = [...checks.values()].find((c) => c.claim_id === e.refId);
      if (chk && chk.verdict === 'unsupported') violations.push(`The reply asserts a past event with no actual record: "${e.quote}"`);
    }
  }
  for (const v of ev.violations) {
    if (v.quote && !quoteInText(v.quote, text)) { warnings.push(`reviewer violation without valid evidence ignored: ${v.detail}`); continue; }
    violations.push(`Reviewer: ${v.detail}${v.quote ? ` ("${v.quote}")` : ''}`);
  }
  if (/\[CANON[ _]ENGINE|ACTUAL HISTORY|FUTURE OBLIGATIONS|"entity_id"|<\/?canon/i.test(text)) violations.push('The reply leaks internal engine labels/JSON into the narrative.');

  // ---- plan transitions ------------------------------------------------------------------------
  const enactedSteps: string[] = [];
  for (const s of ev.step_enactments || []) {
    const step = g.plan?.steps.find((x) => x.step_id === s.step_id);
    const occ = occByRef.get(s.occurrence_ref);
    if (!step || !occ || !hasQuote(s.quote)) { warnings.push(`step enactment ${s.step_id} ignored (unknown step/occurrence or invalid evidence)`); continue; }
    enactedSteps.push(step.step_id);
    const rec = occRecords.find((r) => r.eventOccurrenceIds.includes(occ.occurrenceId));
    if (rec) rec.enactedStepIds = [...(rec.enactedStepIds || []), step.step_id];
  }

  // ---- assemble records --------------------------------------------------------------------------
  if (runtimeEntities.length) {
    records.push({
      recordId: newId('rec'), kind: 'runtime_entity', storyTime: { ...sceneEnd }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
      visibility: { mode: 'public', knower_ids: [] }, summary: `Introduced: ${runtimeEntities.map((r) => r.name).join(', ')}`, evidenceKind: 'direct', runtimeEntities,
    });
  }
  // chronological order of occurrences
  occRecords.sort((a, b) => a.storyTime.lo - b.storyTime.lo);
  records.push(...occRecords);
  if (looseDeltas.length) {
    records.push({
      recordId: newId('rec'), kind: 'world_event', storyTime: { ...sceneEnd }, sourceRefs: [], factsSetOrUnset: looseDeltas.map((x) => x.d), eventOccurrenceIds: [],
      visibility: { mode: 'public', knower_ids: [] }, summary: `Facts established in reply: ${looseDeltas.map((x) => `${x.d.entity_id}.${x.d.predicate}`).join(', ')}`, evidenceKind: 'direct',
    });
  }
  const sceneEntities = uniq((ev.scene_entities || []).map(resolveId).filter(Boolean) as Id[]);
  return { violations: uniq(violations), warnings, records, stateClaims, playerActions, sceneEnd, flashback, sceneEntities, enactedSteps, hardFulfilled, coverage, coverageGaps, runtimeEntities };
}
