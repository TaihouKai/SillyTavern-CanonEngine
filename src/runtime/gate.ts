// Deterministic gate over evaluator output: evidence, references, time, Hard invariants,
// player agency, plan transitions, state contradictions, containment and coverage.
// The evaluator's own verdicts never bypass these checks.
import type { ContactInfo, FactDelta, FactValue, Id, Occurrence, RuntimeEntity, ScopeKind, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { claimComparable, claimMatches, valuesEqual, coerceClaimValue } from '../domain/pack';
import { factAt } from '../domain/reducer';
import { applyChange, deltaMeets, deltaText, outcomeDelta } from '../domain/delta';
import type { WorldIndex } from '../domain/world-query';
import { toTick, formatTick, clockReadings, readingTick } from '../domain/time';
import { pendingHard } from '../domain/schedule';
import { breaksSceneBox, newId, quoteInText, sceneRoot, uniq } from '../domain/util';
import type { ClaimInput, Retrieval } from './context';
import { opportunityBy, reached } from './integration';
import { voiceAllows, type PlayerVoice } from './voice';
import { MAIN_FRAME } from '../domain/frames';
import { normalizeName } from '../domain/pack';
import type { CoverageEntry, Opportunity, PlanRevision, PlayerAction, RecordDraft, StateClaim } from './types';

export interface EvalOutput {
  decision: 'retain' | 'repair' | 'conflict';
  scene_end: { lo: { day: number; minute: number }; hi: { day: number; minute: number }; precision: StoryTime['precision'] } | null;
  flashback?: boolean;
  claim_checks: { claim_id: string; verdict: string; record_ids?: string[]; note?: string }[];
  transitions: { op: 'set' | 'unset'; entity_id: string; predicate: string; value?: FactValue; quote?: string; occurrence_ref?: string | null }[];
  occurrences: {
    ref: string; title: string; account: string; actors: string[]; affected?: string[]; locations?: string[];
    time?: EvalOutput['scene_end']; causes?: string[]; quote: string; pack_event_id?: string | null; disposition?: 'occurred' | 'diverged' | 'ongoing' | null;
    ref_phrases?: string[]; continues?: string | null; backstory?: boolean; visibility?: 'public' | 'restricted' | 'secret'; knowers?: string[]; origin?: 'player' | 'gm' | 'intervention';
  }[];
  state_claims: { entity_id: string; predicate: string; value: FactValue; quote: string; at?: { day: number; minute: number } | null }[];
  player_actions: { quote: string; authorized_by_quote: string | null; category?: string | null }[];
  step_enactments?: { step_id: string; occurrence_ref: string; quote: string }[];
  new_entities?: { ref: string; name: string; kind: RuntimeEntity['kind']; description: string; quote: string }[];
  violations: { code: string; quote?: string; detail: string; blocking?: boolean }[];
  hard_checks: { event_id: string; status: 'fulfilled' | 'not_due' | 'missing' | 'contradicted'; occurrence_ref?: string | null; quote?: string | null }[];
  scene_entities?: string[];
  scene_groups?: string[];
  /** Time frames (only asked when the pack has frames): the frame the scene is in at the reply's end, or null. */
  scene_frame?: string | null;
  summary?: string;
  /** Narrative integration: contacts from the world that reached the player in this reply. */
  contacts?: { quote: string; actors?: string[]; kind: ContactInfo['contactKind']; scope_kind: ScopeKind; scope_ref: string; scope_label?: string; opportunity_id?: string | null }[];
  /** Narrative integration: changes of the player's relationships and of what people know about them. */
  player_ties?: { tie: 'relation' | 'knows'; who: string; existing_id?: string | null; relation?: string; ended?: boolean; level?: 'exists' | 'identity' | 'secrets'; about?: string; quote: string }[];
}

/** A quote that is a line of speech: a quoted span (“…” 「…」 『…』 "…" ‘…’) with at most a short attribution around it. */
export function spokenLine(q: string): boolean {
  const s = q.trim();
  const m = /^(.{0,12}?)(“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|‘[^’]*’)(.{0,12})$/su.exec(s);
  return !!m && m[2].length > 2;
}

/** The pack event or arc (or an earlier contact's matter) a free contact label names, when exactly one fits: the
 *  same title, or the title without its storyline prefix ("使徒十字篇：追击欧莉安娜" for "追击欧莉安娜"). */
export function matchScope(pack: LoadedPack, contacts: { scopeKind: ScopeKind; scopeRef: string; scopeLabel: string }[], label: string): { scopeKind: ScopeKind; scopeRef: string; label: string } | null {
  const norm = (x: string) => x.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
  const want = norm(label);
  if (want.length < 2) return null;
  const tail = (title: string) => title.split(/[：:]/).slice(-1)[0];
  const fits = (title: string) => norm(title) === want || norm(tail(title)) === want;
  const hits: { scopeKind: ScopeKind; scopeRef: string; label: string }[] = [];
  for (const e of pack.events.values()) if (fits(e.title)) hits.push({ scopeKind: 'event', scopeRef: e.id, label: e.title });
  for (const a of pack.pack.arcs) if (fits(a.title)) hits.push({ scopeKind: 'arc', scopeRef: a.id, label: a.title });
  if (hits.length === 1) return hits[0];
  if (hits.length) return null;
  const earlier = uniq(contacts.filter((c) => c.scopeKind !== 'storyline' && fits(c.scopeLabel)).map((c) => `${c.scopeKind}\u0000${c.scopeRef}\u0000${c.scopeLabel}`));
  if (earlier.length !== 1) return null;
  const [scopeKind, scopeRef, l] = earlier[0].split('\u0000');
  return { scopeKind: scopeKind as ScopeKind, scopeRef, label: l };
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
  /** What the GM may write for the player character without the player writing it (settings). */
  voice: PlayerVoice;
  /** How many refusals in force are binding (强烈拒绝 or out of character); with none, pressure is only a note. */
  /** Decisions enforced as rules: binding refusals and the questions the player answered lately. */
  bindingDecisions?: number;
  /** The player's message carries out-of-character directions (OOC keyword) this turn. */
  hasOoc?: boolean;
  mode: 'draft' | 'retained';
  forced: boolean;
  /** Narrative integration: the player character's entity and the suggestion offered to the GM this turn. */
  playerId?: Id | null;
  offered?: Opportunity | null;
  /** Contacts this reply must make (the player's own position binds them to the matter): a draft without one is
   *  sent back. */
  required?: Opportunity[];
  /** Companions' events that come without warning (judged not known in advance, not declined): with the person
   *  still beside the player when the reply passes the start, the event happens to both of them (user design). */
  chanceCompanions?: { eventId: Id; personId: Id; lo: number; title: string; who: string }[];
  /** Whether skipping such an event sends the reply back: only the first draft of a turn. It may already have been
   *  shown without being recognised as the event (live: an unnamed girl's phone question), so a repair that still
   *  does not show it is kept with a note; the turn never fails over it. */
  chanceBlocking?: boolean;
  /** A time leap reply: the GM writes the player character's life in it (any kind of act; contradicting the player's
   *  message is still the reviewer's violation). */
  leap?: boolean;
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
  /** The frame the scene moved to in this reply (a known frame id or MAIN_FRAME), or null when it stays. */
  sceneFrame: Id | null;
  enactedSteps: string[];
  hardFulfilled: Id[];
  coverage: CoverageEntry[];
  coverageGaps: string[];
  runtimeEntities: RuntimeEntity[];
}

/** How far an estimated (not stated) time may lie before a canonical event's start and still be moved up to it. */
export const EARLY_SHIFT_MAX = 3 * 60;
/** Minutes a reply may run on after a clock reading in it before its estimated end is taken back to the reading. */
export const CLOCK_READING_SLACK = 10;
const DESTRUCTIVE = /(destroy|ruin|demolish|collaps|dead|dissolv|gone|burn|毁|废|塌|灭|亡|解散)/i;

/** Does a reviewer's text refer to this HARD event (id, title, or a run of its required description)? */
export function refersToHard(text: string, id: string, title: string, required: string): boolean {
  if (text.includes(id) || (title && text.includes(title))) return true;
  // a copied phrase of the description: 6+ consecutive CJK characters, or 4+ consecutive words
  const t = text.replace(/\s+/g, ' ');
  const cjk = required.match(/[\u3400-\u9fff]+/g) || [];
  for (const run of cjk) for (let i = 0; i + 6 <= run.length; i++) if (t.includes(run.slice(i, i + 6))) return true;
  const words = required.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let i = 0; i + 4 <= words.length; i++) if (t.toLowerCase().includes(words.slice(i, i + 4).join(' '))) return true;
  return false;
}

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
  /** A model's fact change, typed. An entity set changes by who joins (add) or leaves (remove); a whole list the
   *  model gives is read as that difference from the list as it stands, so nobody it forgot is dropped silently
   *  only when the list really omits them (the difference is reported). */
  const checkDelta = (d: { op: 'set' | 'unset' | 'add' | 'remove'; entity_id: string; predicate: string; value?: FactValue }, where: string): FactDelta[] | null => {
    const eid = resolveId(d.entity_id);
    if (!eid || !entityKnown(eid)) { warnings.push(`${where}: unknown entity "${d.entity_id}" (kept as narrative detail only)`); return null; }
    const p = pack.predicates.get(d.predicate);
    if (!p) { warnings.push(`${where}: undeclared predicate "${d.predicate}" (kept as narrative detail only)`); return null; }
    if (d.op === 'unset') return [{ op: 'unset', entity_id: eid, predicate: p.id }];
    let v = d.value as FactValue;
    if (p.value_type === 'entity_set') {
      const arr = (Array.isArray(v) ? v : typeof v === 'string' ? [v] : null)?.map((x) => resolveId(String(x)));
      if (!arr || arr.some((x) => !x)) { warnings.push(`${where}: unknown entity in set ${JSON.stringify(v)}`); return null; }
      const ids = [...new Set(arr as Id[])];
      if (d.op === 'add' || d.op === 'remove') return ids.length ? [{ op: d.op, entity_id: eid, predicate: p.id, value: ids }] : null;
      const cur = factAt(index.state, eid, p.id, { tick: g.clockTick });
      const had: Id[] = cur.known && Array.isArray(cur.value) ? cur.value : [];
      const joins = ids.filter((x) => !had.includes(x)), leaves = had.filter((x) => !ids.includes(x));
      if (leaves.length || joins.length) warnings.push(`${where}: ${eid}.${p.id} given as a whole list, read as ${joins.length ? `+[${joins.join(', ')}]` : ''}${leaves.length ? ` −[${leaves.join(', ')}]` : ''}`);
      return [...(joins.length ? [{ op: 'add' as const, entity_id: eid, predicate: p.id, value: joins }] : []), ...(leaves.length ? [{ op: 'remove' as const, entity_id: eid, predicate: p.id, value: leaves }] : [])];
    }
    const okType =
      (p.value_type === 'boolean' && typeof v === 'boolean') ||
      (p.value_type === 'number' && typeof v === 'number' && Number.isFinite(v)) ||
      (p.value_type === 'string' && typeof v === 'string') ||
      (p.value_type === 'entity_ref' && typeof v === 'string');
    if (!okType) { warnings.push(`${where}: value ${JSON.stringify(v)} has the wrong type for ${p.id}`); return null; }
    if (p.value_type === 'entity_ref') { const r = resolveId(String(v)); if (!r) { warnings.push(`${where}: unknown entity value ${v}`); return null; } v = r; }
    if (p.allowed_values && !p.allowed_values.some((a) => valuesEqual(a, v))) { warnings.push(`${where}: ${JSON.stringify(v)} not allowed for ${p.id}`); return null; }
    // add/remove of a single value: filled when vacant / emptied when it holds that value
    return [{ op: d.op, entity_id: eid, predicate: p.id, value: v }];
  };

  // ---- time --------------------------------------------------------------------------------
  let sceneEnd = toStoryTime(ev.scene_end);
  const flashback = !!ev.flashback;
  if (sceneEnd && !flashback && sceneEnd.hi < g.clockTick) violations.push(`Story time moves backwards (ends ${formatTick(sceneEnd.hi)} before the committed ${formatTick(g.clockTick)}) without a flashback frame or recorded intervention.`);
  if (!sceneEnd) sceneEnd = { lo: g.clockTick, hi: g.clockTick, precision: 'approx' };
  // the reply's own clock ("都快十一点了") is the time at that point of it: an estimated end far past it is taken back
  // to it (live: a reply ending a meal begun two replies earlier, with "都快十一点了" in it, was given 23:20 from "a meal
  // 30-60"; the clock only moves on, so an overestimate is never undone later)
  if (!flashback && !g.leap && sceneEnd.precision !== 'minute') {
    const rs = clockReadings(g.text).map((r) => ({ r, tick: readingTick(r, g.clockTick) })).filter((x): x is { r: (typeof x)['r']; tick: number } => x.tick !== null);
    const last = rs.length ? rs.reduce((a, b) => (b.tick > a.tick ? b : a)) : null;
    if (last && sceneEnd.lo > last.tick + CLOCK_READING_SLACK) {
      warnings.push(`scene end ${formatTick(sceneEnd.lo)} is long after the reply's own clock "${last.r.quote}" (${formatTick(last.tick)}): taken from it`);
      sceneEnd = { lo: Math.max(g.clockTick, last.tick), hi: Math.max(sceneEnd.hi, last.tick + CLOCK_READING_SLACK), precision: 'approx' };
    }
  }

  // ---- HARD invariants ------------------------------------------------------------------------
  const pendingHardMap = new Map(pendingHard(pack, index.state).map((c) => [c.event.id, c]));
  const hardOutcomeKeys = new Map<string, Id[]>();
  for (const [id, c] of pendingHardMap) for (const o of c.event.outcomes) { const k = `${o.entity_id}|${o.predicate}`; hardOutcomeKeys.set(k, [...(hardOutcomeKeys.get(k) || []), id]); }
  /** A change pre-empts a pending HARD event only when it establishes that event's exact required value
   *  (as a change, not the value already holding) while the event is near (one of the next two pending HARD
   *  events, or its window opens within 2 days of the scene). Other values of the same fact are ordinary story (e.g. someone's whereabouts changes long
   *  before a HARD event that later requires a particular whereabouts). */
  const nextHard = [...pendingHardMap.keys()].slice(0, 2);
  const preempted = (d: FactDelta, at: number): Id | undefined => {
    if (d.op === 'unset') return undefined;
    const cur = factAt(index.state, d.entity_id, d.predicate, { tick: Number.MAX_SAFE_INTEGER });
    if (applyChange(cur.known ? cur.value : undefined, d) === 'same') return undefined;
    return (hardOutcomeKeys.get(`${d.entity_id}|${d.predicate}`) || []).find((id) => {
      const c = pendingHardMap.get(id)!;
      return (nextHard.includes(id) || c.lo <= at + 2 * 1440) && c.event.outcomes.some((o) => deltaMeets(d, o));
    });
  };

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
    const ds = checkDelta(t, 'transition');
    if (!ds) continue;
    for (const d of ds) {
      // (a fact can be a required outcome of several HARD events, e.g. a conflict starting and ending)
      const hardRef = [...hardOccRef].find(([hid]) => pendingHardMap.get(hid)!.event.outcomes.some((r) => deltaMeets(d, r)))?.[1];
      let ref = t.occurrence_ref;
      if (hardRef && ref !== hardRef) {
        warnings.push(`transition ${d.entity_id}.${d.predicate} re-filed under the HARD occurrence ${hardRef} (was ${ref || 'none'})`);
        ref = hardRef;
      }
      if (ref) transitionsByRef.set(ref, [...(transitionsByRef.get(ref) || []), d]);
      else looseDeltas.push({ d, quote: t.quote! });
    }
  }
  // live: a reply announced the opening ceremony at its authored time ("开幕式现在开始！"); the reviewer filed it as a story
  // event setting the HARD outcome (大霸星祭 进行中) but neither linked it nor confirmed the HARD check, and the draft was sent
  // back as setting the outcome "without that event occurring". An occurrence whose facts are all the required outcomes of
  // a pending HARD event, exactly and with no other value of them, at a time within its window, is that event occurring.
  for (const o of ev.occurrences) {
    if (o.pack_event_id || o.backstory || !hasQuote(o.quote)) continue;
    const ds = transitionsByRef.get(o.ref) || [];
    if (!ds.length) continue;
    const given = toStoryTime(o.time);
    const when = given || (g.leap && sceneEnd.lo > g.clockTick ? { lo: g.clockTick, hi: sceneEnd.lo, precision: 'range' as const } : sceneEnd);
    const early = !flashback && when.precision !== 'minute' ? EARLY_SHIFT_MAX : 0;
    const hid = [...pendingHardMap.values()].find((c) => !hardOccRef.has(c.event.id)
      && !ev.hard_checks.some((h) => h.event_id === c.event.id && h.status === 'contradicted')
      && when.hi >= c.lo - early && when.lo <= c.hi
      && c.event.outcomes.every((r) => ds.some((d) => deltaMeets(d, r)))
      && !ds.some((d) => c.event.outcomes.some((r) => r.entity_id === d.entity_id && r.predicate === d.predicate && !deltaMeets(d, r))))?.event.id;
    if (!hid) continue;
    o.pack_event_id = hid; o.disposition = 'occurred'; hardOccRef.set(hid, o.ref);
    const hc = ev.hard_checks.find((h) => h.event_id === hid);
    if (hc) { hc.status = 'fulfilled'; hc.occurrence_ref = o.ref; } else ev.hard_checks.push({ event_id: hid, status: 'fulfilled', occurrence_ref: o.ref, quote: o.quote });
    warnings.push(`occurrence "${o.title}" sets the required outcome of HARD "${pendingHardMap.get(hid)!.event.title}" within its window: taken as that event occurring`);
  }
  for (const o of ev.occurrences) {
    if (!hasQuote(o.quote)) { warnings.push(`occurrence "${o.title}" dropped: evidence quote not found in text`); continue; }
    const actors = uniq(o.actors.map(resolveId).filter(Boolean) as Id[]);
    const affected = uniq((o.affected || []).map(resolveId).filter(Boolean) as Id[]);
    const locations = uniq((o.locations || []).map(resolveId).filter(Boolean) as Id[]);
    const causes = (o.causes || []).filter((c) => index.state.occurrences.has(c) || occByRef.has(c));
    // Backstory: a small past the reply invents (an anecdote, a minor earlier incident) that nothing contradicts. It is
    // recorded at its past time so later replies can rely on it; it never links a canonical event, joins a scene box
    // or changes current facts.
    if (o.backstory) {
      if (o.pack_event_id || transitionsByRef.has(o.ref)) warnings.push(`backstory "${o.title}": canonical link / fact changes ignored`);
      o.pack_event_id = null; o.disposition = null; o.continues = null;
      transitionsByRef.delete(o.ref);
    }
    const deltas = transitionsByRef.get(o.ref) || [];
    const given = toStoryTime(o.time);
    // a beat of a time leap without a usable time happened somewhere in the leap, not at its landing (live: four
    // episodes of a 33-day leap all recorded at the landing time)
    // a backstory without a usable time is undated: some time in the year before now (story time may be before day 0)
    const undated = o.backstory && !(given && given.hi < g.clockTick);
    let time = o.backstory ? (!undated ? given! : { lo: g.clockTick - 365 * 1440, hi: g.clockTick - 1, precision: 'range' as const })
      : given || (g.leap && sceneEnd.lo > g.clockTick ? { lo: g.clockTick, hi: sceneEnd.lo, precision: 'range' as const } : { ...sceneEnd });
    const occ: Occurrence = {
      occurrenceId: newId('occ'), title: o.title, account: o.account, actors, affected, locations, time, outcome: deltas,
      causes: causes.map((c) => occByRef.get(c)?.occurrenceId || c), refPhrases: uniq([o.title, ...(o.ref_phrases || [])]),
      origin: o.origin === 'player' ? 'player' : o.origin === 'intervention' ? 'intervention' : 'gm',
      visibility: { mode: o.visibility || 'public', knower_ids: uniq((o.knowers || []).map(resolveId).filter(Boolean) as Id[]) },
      ...(undated ? { undated: true as const } : {}),
    };
    let kind: RecordDraft['kind'] = occ.origin === 'player' ? 'enacted_action' : occ.origin === 'intervention' ? 'authored_intervention' : 'world_event';
    let packEventId: Id | undefined;
    let disposition: 'occurred' | 'diverged' | undefined;
    if (o.pack_event_id && index.state.dispositions.has(o.pack_event_id) && pack.events.has(o.pack_event_id)) {
      // The event is closed (its window passed or it was settled): what the story shows of it now is its after story,
      // an ordinary beat kept with the event; 重新分析 merges it into the result.
      occ.afterOf = o.pack_event_id;
      warnings.push(`occurrence "${o.title}": after story of "${pack.events.get(o.pack_event_id)!.title}" (the event already has its result)`);
    } else if (o.pack_event_id && o.disposition === 'ongoing') {
      // Under way, result not settled: an ordinary beat linked to the event; the event is closed when its window passes.
      if (pack.events.has(o.pack_event_id)) occ.inProgressOf = o.pack_event_id;
    } else if (o.pack_event_id) {
      const pe = pack.events.get(o.pack_event_id);
      if (!pe) violations.push(`Occurrence cites unknown canonical event "${o.pack_event_id}".`);
      else {
        packEventId = pe.id;
        occ.packEventId = pe.id;
        disposition = o.disposition === 'diverged' ? 'diverged' : 'occurred';
        kind = 'canon_occurrence';
        const st = pack.timeIndex.find((x) => x.id === pe.id);
        if (st) {
          // clamp to the authored bounds; outside them is a violation for HARD
          // live: a morning reply walked to the opening ceremony (08:00) and the reviewer's minimum estimate of the
          // whole reply ended at 07:40; three rewrites were sent back over it. The pack knows when the event starts:
          // an estimated time a little before it is moved up to its start, and the scene ends no earlier.
          const early = time.hi < st.lo && !flashback && time.precision !== 'minute' && st.lo - time.hi <= EARLY_SHIFT_MAX;
          if (early) {
            warnings.push(`"${pe.title}" estimated at ${formatTick(time.lo)}, before its authored start ${formatTick(st.lo)}: moved to its start`);
            time = { lo: st.lo, hi: Math.max(st.lo, Math.min(st.hi, time.hi)), precision: 'range' };
            if (sceneEnd.hi < st.lo) sceneEnd = { lo: Math.max(sceneEnd.lo, st.lo), hi: st.lo, precision: sceneEnd.precision };
            else if (sceneEnd.lo < st.lo) sceneEnd = { ...sceneEnd, lo: st.lo };
          } else if (time.hi < st.lo || time.lo > st.hi) {
            if (pe.classification === 'HARD') violations.push(`HARD "${pe.title}" is depicted at ${formatTick(time.lo)}, outside its authored bounds ${formatTick(st.lo)}–${formatTick(st.hi)}.`);
            time = { lo: Math.max(st.lo, Math.min(time.lo, st.hi)), hi: Math.min(st.hi, Math.max(time.hi, st.lo)), precision: 'range' };
          }
          occ.time = { lo: Math.max(time.lo, st.lo), hi: Math.min(time.hi, st.hi), precision: time.precision };
        }
        if (pe.classification === 'HARD') {
          let missing = pe.outcomes.filter((req) => !deltas.some((d) => deltaMeets(d, req)));
          // a change of the same fact that is not the required one (for who joins or leaves: one the other way)
          const wrong = deltas.filter((d) => pe.outcomes.some((req) => req.entity_id === d.entity_id && req.predicate === d.predicate && !deltaMeets(d, req)
            && (!req.op || d.op === 'unset' || (d.op !== 'set' && d.op !== req.op && [d.value].flat().some((x) => [req.value].flat().includes(x))))));
          // live: the reviewer confirmed the HARD content depicted (an off-screen abduction reported by text message)
          // but left out the outcome fact, whose exact pack wording it never reproduces ("被秘密带离并藏匿"); three
          // rewrites were sent back over it. Its own confirmation stands for the required facts; a different value is
          // still a violation.
          const hc0 = ev.hard_checks.find((h) => h.event_id === pe.id);
          if (missing.length && !wrong.length && disposition === 'occurred' && hc0?.status === 'fulfilled') {
            for (const m of missing) deltas.push(outcomeDelta(m));
            warnings.push(`HARD "${pe.title}": required outcome ${missing.map((m) => `${m.entity_id}.${m.predicate}`).join(', ')} taken from the pack (the reviewer confirmed it depicted)`);
            missing = [];
          }
          if (disposition !== 'occurred' || missing.length || wrong.length) {
            violations.push(`HARD "${pe.title}" must occur with its exact required outcome (${pe.required_description}). Depicted result differs: missing ${missing.map((m) => deltaText(outcomeDelta(m))).join(', ') || 'none'}${wrong.length ? `; conflicting ${wrong.map((w) => deltaText(w)).join(', ')}` : ''}.`);
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
      if (prev && !prev.packEventId && prev.occurrenceId !== occ.occurrenceId) {
        // the box the previous beat belongs to (committed members plus earlier beats of this reply)
        const all = new Map<string, Occurrence>([...index.state.occurrences, ...[...occByRef.values()].map((x) => [x.occurrenceId, x] as [string, Occurrence])]);
        const root = sceneRoot(all, prev.occurrenceId);
        const members = [...all.values()].filter((m) => !m.packEventId && sceneRoot(all, m.occurrenceId) === root);
        if (breaksSceneBox(members, occ)) warnings.push(`occurrence "${o.title}": starts a new box (the scene box would exceed its time/place/size limits)`);
        else occ.continues = prev.occurrenceId;
      } else warnings.push(`occurrence "${o.title}": continues=${o.continues} ignored (unknown or canonical box)`);
    }
    occByRef.set(o.ref, occ);
    occRecords.push({
      recordId: newId('rec'), kind, storyTime: occ.time, sourceRefs: [], factsSetOrUnset: deltas, eventOccurrenceIds: [occ.occurrenceId],
      occurrences: [occ], visibility: occ.visibility, summary: `${o.backstory ? 'backstory: ' : ''}${occ.title}${packEventId ? ` (${disposition} ${packEventId})` : ''}`,
      evidenceKind: 'direct', packEventId, disposition, dispositionReason: packEventId ? `depicted in accepted reply: "${o.quote.slice(0, 120)}"` : undefined,
    });
  }
  // transitions referencing a missing occurrence ref become loose
  for (const [ref, ds] of transitionsByRef) if (!occByRef.has(ref)) ds.forEach((d) => looseDeltas.push({ d, quote: '' }));

  // C17: HARD outcome facts can only be produced by the HARD occurrence itself
  for (const { d } of looseDeltas) {
    const hid = preempted(d, sceneEnd.hi);
    if (hid) violations.push(`Fact ${d.entity_id}.${d.predicate} is a required outcome of pending HARD "${pack.events.get(hid)!.title}"; it can only be established by depicting that event occurring at its authored time.`);
  }
  for (const r of occRecords) {
    if (r.packEventId && pack.events.get(r.packEventId)?.classification === 'HARD') continue;
    for (const d of r.factsSetOrUnset) {
      const hid = preempted(d, r.storyTime.hi);
      if (hid) violations.push(`"${r.summary}" sets ${d.entity_id}.${d.predicate}, a required outcome of pending HARD "${pack.events.get(hid)!.title}", without that event occurring.`);
    }
  }

  // HARD deadlines crossed by this reply must be realized (onscreen or by staged offscreen adjudication).
  for (const [id, c] of pendingHardMap) {
    if (hardFulfilled.includes(id) || g.stagedHard.has(id)) continue;
    if (c.hi <= sceneEnd.lo || c.hi <= g.clockTick) {
      violations.push(`HARD "${c.event.title}" is due by ${formatTick(c.hi)} and this reply reaches ${formatTick(Math.max(sceneEnd.lo, g.clockTick))}, but the event is not realized: ${c.event.required_description}`);
    } else if (!flashback && c.hi <= sceneEnd.hi) {
      // The end time's range reaches a HARD checkpoint the reply does not depict. lo is the least time the depicted events
      // need and the clock moves to lo; the rest of the range is unstated slack. So the scene ends before the checkpoint,
      // and the event stays due (staged offscreen once time passes it). Decided here, not by rewriting the reply (live:
      // two repairs of a quiet waiting scene, 15:35–16:00 around the 16:00 checkpoint).
      warnings.push(`scene end ${formatTick(sceneEnd.lo)}–${formatTick(sceneEnd.hi)} reaches the HARD checkpoint "${c.event.title}" at ${formatTick(c.hi)} without depicting it: taken as ending before it`);
      sceneEnd = { ...sceneEnd, hi: Math.max(sceneEnd.lo, c.hi - 1) };
    }
  }
  // Reviewer-reported contradictions of HARD contracts
  // HARD events not yet due at the end of this reply (and not depicted in it): see the reviewer-violation filter below.
  const depicted = new Set(ev.occurrences.map((o) => o.pack_event_id).filter(Boolean));
  const notDue = [...pendingHardMap.values()].filter((c) => !depicted.has(c.event.id) && !hardFulfilled.includes(c.event.id) && !g.stagedHard.has(c.event.id) && c.hi > Math.max(sceneEnd.lo, g.clockTick) && !(!flashback && c.hi <= sceneEnd.hi));
  for (const h of ev.hard_checks) {
    if (h.status !== 'contradicted') continue;
    // Not yet due: confinement, distance or obstacles do not contradict it (the world can still bring it
    // about, and the deadline rule forces it). A typed fact that rules out the outcome is caught above.
    const nd = notDue.find((c) => c.event.id === h.event_id);
    if (nd) { warnings.push(`reviewer "contradicted" for not-yet-due HARD "${nd.event.title}" ignored (deadline ${formatTick(nd.hi)}): ${h.quote || ''}`); continue; }
    violations.push(`Reviewer: text contradicts HARD "${pack.events.get(h.event_id)?.title || h.event_id}" (${h.quote || ''}).`);
  }

  // ---- player agency ---------------------------------------------------------------------------
  const playerActions: PlayerAction[] = [];
  for (const a of ev.player_actions) {
    if (!hasQuote(a.quote)) continue;
    const auth = a.authorized_by_quote && g.userSource && quoteInText(a.authorized_by_quote, g.userText) ? { messageId: g.userSource.messageId, quote: a.authorized_by_quote } : null;
    // live: the reviewer left category out (its answer format lacked it) and the player character's own lines were
    // sent back as unlabelled acts; a quote that is plainly a spoken line is dialogue
    if (!a.category && spokenLine(a.quote)) a.category = 'dialogue';
    const allowed = !!g.leap || voiceAllows(g.voice, a.category);
    if (!auth && !allowed && g.mode === 'draft') violations.push(`The reply has the player character do something the player did not write and leaves to themselves${a.category ? ` (${a.category})` : ''}: "${a.quote}". Leave it to the player.`);
    playerActions.push({ quote: a.quote, authorizedBy: auth, category: a.category ?? null });
  }

  // ---- state claims vs actual state (+ staged overlay, containment) -----------------------------
  const stateClaims: StateClaim[] = [];
  const cp = { tick: Math.max(sceneEnd.lo, g.clockTick) };
  const setInReply = (eid: Id, pred: Id, v: FactValue) =>
    occRecords.some((r) => r.factsSetOrUnset.some((d) => d.entity_id === eid && d.predicate === pred && (d.op === 'set' ? valuesEqual(d.value, v) : d.op === 'add' && claimMatches(d.value, v))));
  // A name or alias, or one of its words ("the market" for Old Market).
  const mentionsPlace = (eid: Id) => index.allNames(eid).some((n) => !!n && (text.includes(n)
    || n.split(/\s+/).some((w) => w.length >= 4 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))));
  const checkClaim = (eid: Id, pred: Id, value0: FactValue, quote: string, label: string, atTick?: number) => {
    const value = coerceClaimValue(pack, pred, value0);
    // Each claim is checked at its own story checkpoint (flashbacks use then-valid facts).
    const claimCp = atTick !== undefined ? { tick: atTick } : cp;
    const f = factAt(index.state, eid, pred, claimCp);
    if (f.known && !claimMatches(f.value!, value) && claimComparable(pack, pred, value)) {
      if (atTick === undefined && setInReply(eid, pred, value)) return; // a genuine staged change with its own occurrence
      // A place's state is presupposed only by a reply that mentions the place: a door blasted open in a building
      // the registry does not know is not a claim about its district (live finding: 紫阳花庄's door filed as 第七学区.condition).
      if (index.entityKind(eid) === 'place' && !mentionsPlace(eid)) {
        warnings.push(`state claim "${quote.slice(0, 60)}" filed on ${index.entityName(eid)}.${pred} ignored: the reply does not mention that place`);
        return;
      }
      // The reply shows the change happening (the dog is hit and collapses) but the reviewer filed the new
      // state as a presupposition (live finding: three repairs of a correct reply). When an event of this
      // reply involves the entity, take the claim as that event's result. Never for coming back to life.
      const revival = typeof f.value === 'boolean' && f.value === false && value === true && /alive|living|存活|生存/i.test(pred);
      const host = atTick === undefined && !revival ? occRecords.find((r) => (r.occurrences || []).some((o) => o.affected.includes(eid) || o.actors.includes(eid))) : undefined;
      if (host) {
        const d: FactDelta = { op: pack.predicates.get(pred)?.value_type === 'entity_set' ? 'add' : 'set', entity_id: eid, predicate: pred, value };
        host.factsSetOrUnset.push(d);
        host.occurrences?.[0]?.outcome.push(d);
        warnings.push(`state claim "${quote.slice(0, 60)}" taken as a change this reply depicts: ${eid}.${pred}=${JSON.stringify(value)}`);
        return;
      }
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
  // A HARD event that is not yet due is never a violation: the scene may end before it, and the world
  // can still bring it about offscreen (adjudicated when story time passes it). Deadlines are enforced
  // above; an explicit contradiction comes through hard_checks. Reviewer complaints about such an event
  // ("no escape route yet", "the meeting is not depicted") are therefore ignored.
  for (const v of ev.violations) {
    // the reviewer itself marked it non-blocking (minor/acceptable); a missing flag counts as blocking
    if (v.blocking === false) { warnings.push(`non-blocking reviewer note: ${v.detail.slice(0, 160)}`); continue; }
    // A message already in the chat cannot be repaired: whether it can stay is the reviewer's decision
    // (retain / conflict). A complaint about a message it keeps — e.g. a card greeting that is a setup
    // instruction rather than a story scene (live finding) — is a note, not an editorial conflict.
    if (g.mode === 'retained' && ev.decision === 'retain') { warnings.push(`reviewer note on a retained message: ${v.detail.slice(0, 160)}`); continue; }
    if (v.quote && !quoteInText(v.quote, text)) { warnings.push(`reviewer violation without valid evidence ignored: ${v.detail}`); continue; }
    // Pulling the player toward something they declined is its own problem, never "restating a HARD event"
    // (it may name one): it bypasses the HARD-noise filter below.
    if (/engagement[_ ]pressure/i.test(v.code) && !g.bindingDecisions) { warnings.push(`touches a decision the player left as a wish (not enforced): ${v.detail.slice(0, 200)}${v.quote ? ` ("${v.quote}")` : ''}`); continue; }
    // live: the reviewer also sent back the player character's lines as a free-text violation ("the reply writes
    // dialogue for the player character") although the player lets the GM write dialogue
    // live: with no OOC directions this turn, the reviewer called the user's preset preamble ("好的，这是你需求的最终输出：",
    // hidden by the user's own regex) an OOC leak
    if (/ooc[_ ]?leak/i.test(v.code) && !g.hasOoc) { warnings.push(`reviewer "ooc_leak" ignored: the player gave no out-of-character directions this turn: ${v.detail.slice(0, 160)}`); continue; }
    if (/ooc[_ ]?leak/i.test(v.code)) { violations.push(`The reply gives away the player's out-of-character instructions: ${v.detail}${v.quote ? ` ("${v.quote}")` : ''}. Apply them silently — no thoughts, plans or narration about them.`); continue; }
    const agency = /agency|player[_ ]?(act|voice|dialogue|speech|line)|godmod|puppet/i.test(v.code) || (/玩家|player/i.test(v.detail) && /代写|替玩家|台词|player_only|on (the )?player'?s? behalf|for the player/i.test(v.detail));
    if (agency) {
      const act = v.quote ? playerActions.find((a) => quoteInText(v.quote!, a.quote) || quoteInText(a.quote, v.quote!)) : undefined;
      const kind = act?.category ?? (v.quote && spokenLine(v.quote) ? 'dialogue' : null);
      if (voiceAllows(g.voice, kind)) { warnings.push(`reviewer complaint about a player-character act the settings let the GM write (${kind}) ignored: ${v.detail.slice(0, 160)}`); continue; }
      // live: "走一路烧一路魔法陷阱" — the reviewer authorized the burning in player_actions, then still sent back the
      // incantation and the fire as player-only skills the player had not spelled out
      if (act?.authorizedBy) { warnings.push(`reviewer complaint about a player-character act the player's message authorizes ("${act.authorizedBy.quote}") ignored: ${v.detail.slice(0, 160)}`); continue; }
      // live: "the reply has 美铃 and 刀夜 go along without the player agreeing", quoting 美铃's own request, in a reply
      // that ended on 食蜂 asking the player what she would do. A player-character act is in the reviewer's
      // player_actions (checked above) or at least names the player character; evidence that does neither is
      // someone else's line.
      if (!act && v.quote && g.playerId) {
        const names = uniq(g.index.allNames(g.playerId).flatMap((n) => [n, ...n.split(/[·・\s]/)]).filter((n) => n.length >= 2));
        if (names.length && !names.some((n) => v.quote!.includes(n))) { warnings.push(`reviewer complaint about the player character ignored: its evidence is not something the player character does ("${v.quote.slice(0, 80)}"): ${v.detail.slice(0, 160)}`); continue; }
      }
    }
    // a caricature is sent back once: a rewrite that still has it stands (the turn never fails over style)
    if (/caricature/i.test(v.code)) { (g.chanceBlocking === false ? warnings : violations).push(`A character acts as a caricature of themselves: ${v.detail}${v.quote ? ` ("${v.quote}")` : ''}. Write them as the person the story shows, with the common sense of their age and situation.`); continue; }
    if (/engagement[_ ]pressure/i.test(v.code)) { violations.push(`The reply pulls the player toward something they declined or deferred: ${v.detail}${v.quote ? ` ("${v.quote}")` : ''}. Do not press it again through anyone or anything; let the world go on without it.`); continue; }
    // HARD conformance is decided by the structured HARD checks and deadlines above. A free-text
    // complaint that only restates a HARD event (live finding: the reviewer treated the canonical ROUTE
    // in the description as actual history and called the player's own actions a contradiction) is
    // ignored when that event is not yet due or is confirmed fulfilled in this reply.
    const about = [...pendingHardMap.values()].find((c) => (notDue.includes(c) || hardFulfilled.includes(c.event.id)) && refersToHard(`${v.code} ${v.detail}`, c.event.id, c.event.title, c.event.required_description || ''));
    if (about && !/without a credible cause/.test(v.detail)) { warnings.push(`reviewer violation restating HARD "${about.event.title}" ignored (${hardFulfilled.includes(about.event.id) ? 'fulfilled in this reply' : 'not yet due'}): ${v.detail.slice(0, 160)}`); continue; }
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
  // ---- contacts that reached the player (narrative integration) ---------------------------------------
  for (const k of ev.contacts || []) {
    if (!hasQuote(k.quote)) { warnings.push(`contact "${(k.quote || '').slice(0, 40)}" ignored: evidence not found in text`); continue; }
    const actors = uniq((k.actors || []).map(resolveId).filter(Boolean) as Id[]).filter((a) => a !== g.playerId);
    let scopeKind = k.scope_kind, scopeRef = String(k.scope_ref || '').trim(), label = (k.scope_label || '').trim();
    if (scopeKind === 'event') { if (!pack.events.has(scopeRef)) { warnings.push(`contact "${k.quote.slice(0, 40)}": unknown event ${scopeRef}, kept as a storyline`); scopeKind = 'storyline'; label ||= scopeRef; } else label ||= pack.events.get(scopeRef)!.title; }
    else if (scopeKind === 'arc') { const a = pack.pack.arcs.find((x) => x.id === scopeRef); if (!a) { scopeKind = 'storyline'; label ||= scopeRef; } else label ||= a.title; }
    else if (scopeKind === 'faction') { const id = resolveId(scopeRef); if (!id) { scopeKind = 'storyline'; label ||= scopeRef; } else { scopeRef = id; label ||= index.entityName(id); } }
    else if (scopeKind === 'contact') { const c = index.state.contacts.find((x) => x.recordId === scopeRef); if (c) { scopeKind = c.scopeKind; scopeRef = c.scopeRef; label ||= c.scopeLabel; } else { scopeKind = 'storyline'; label ||= scopeRef; } }
    // live: the same matter filed once under its event and once as a free storyline ("追击欧莉安娜" for the event
    // "使徒十字篇：追击欧莉安娜"): a label naming one pack event or arc, or an earlier contact's matter, is filed there
    // a storyline ref an earlier contact already uses (the reviewer repeating its scope) stays that matter
    const same = scopeKind === 'storyline' ? index.state.contacts.find((c) => c.scopeKind === 'storyline' && c.scopeRef === scopeRef) : undefined;
    if (same) label = same.scopeLabel;
    else if (scopeKind === 'storyline') { const m = matchScope(pack, index.state.contacts, label || scopeRef); if (m) ({ scopeKind, scopeRef, label } = m); }
    if (scopeKind === 'storyline' && !same) { label ||= scopeRef || k.quote.slice(0, 40); scopeRef = String(label).normalize('NFKC').toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'storyline'; }
    // the offered suggestion is credited only when the contact is about the same thing
    const req = (g.required || []).find((o) => k.opportunity_id === o.id || reached(index.state, o, [{ scopeKind, scopeRef, actors }]));
    const opp = req ? req.id : g.offered && k.opportunity_id === g.offered.id && g.offered.scopeKind === scopeKind && g.offered.scopeRef === scopeRef ? g.offered.id : null;
    // the offered small job, delivered (about the same matter): it lapses at the start of the next day unless taken
    const job = !!g.offered?.sideJob && g.offered.scopeKind === scopeKind && g.offered.scopeRef === scopeRef;
    records.push({
      recordId: newId('rec'), kind: 'world_contact', storyTime: { ...sceneEnd }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
      visibility: { mode: 'public', knower_ids: [] }, summary: `Contact (${k.kind}) about ${label}: ${k.quote.slice(0, 120)}`, evidenceKind: 'direct',
      contact: { scopeKind, scopeRef, scopeLabel: label.slice(0, 300), opportunityId: opp ?? (job ? g.offered!.id : null), contactKind: k.kind, actors, quote: k.quote.slice(0, 300), ...(job ? { sideJob: true, expires: Math.floor(sceneEnd.lo / 1440) * 1440 + 1440, job: g.offered!.contact.slice(0, 300) } : {}) },
    });
  }
  // ---- the player's relationships and who knows what about them, as this reply changes them --------------
  if (g.playerId) {
    for (const t of ev.player_ties || []) {
      const name = String(t.who || '').trim();
      if (!name || !(hasQuote(t.quote) || quoteInText(t.quote || '', g.userText || ''))) { warnings.push(`tie "${name || (t.quote || '').slice(0, 40)}" ignored: evidence not found in text`); continue; }
      const id = (t.existing_id ? resolveId(t.existing_id) : null) || resolveId(name);
      if (id === g.playerId) continue;
      const relation = String(t.relation || '').trim().slice(0, 400), about = String(t.about || '').trim().slice(0, 400);
      if (t.tie === 'relation' ? !relation : !about && !t.level) continue;
      const label = (id && index.entityExists(id) ? index.entityName(id) : runtimeEntities.find((r) => r.id === id)?.name) || name;
      records.push({
        recordId: newId('rec'), kind: 'player_tie', storyTime: { ...sceneEnd }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
        visibility: { mode: 'public', knower_ids: [] }, summary: `${t.tie === 'relation' ? 'Relationship' : 'Who knows'}: ${label} — ${t.tie === 'relation' ? relation : about}`.slice(0, 300), evidenceKind: 'direct',
        tie: t.tie === 'relation'
          ? { kind: 'relation', who: id, name: label, relation, ...(t.ended ? { ended: true } : {}), quote: t.quote.slice(0, 300), source: 'play' }
          : { kind: 'knows', who: id, name: label, level: t.level || 'identity', about, quote: t.quote.slice(0, 300), source: 'play' },
      });
    }
  }
  // a required contact the reply leaves out (it may also show the player already in the event itself)
  if (g.mode === 'draft' && !g.leap) {
    const made = records.filter((r) => r.contact).map((r) => r.contact!);
    const inEvent = new Set(ev.occurrences.filter((o) => o.pack_event_id).map((o) => o.pack_event_id));
    for (const o of g.required || []) {
      if (made.some((m) => m.opportunityId === o.id) || reached(index.state, o, made) || (o.targetEventId && inEvent.has(o.targetEventId))) continue;
      violations.push(`The world must reach the player character in this reply about "${o.scopeLabel}" (${o.requiredBasis || o.motivation}), but the reply does not show it: ${opportunityBy(index, o).join(', ')} reach them — ${o.contact} Wherever they are and whatever they are doing: after what the player does in this reply, or interrupting it when the matter begins first. Leave their answer to the player.`);
    }
  }
  const sceneEntities = uniq((ev.scene_entities || []).map(resolveId).filter(Boolean) as Id[]);
  // live: 佐天 walked with the player from 08:35 to 09:20 and the reply went past 索绮特's 09:00 chance encounter
  // without it; it was then settled offscreen as if she had been elsewhere.
  if (g.mode === 'draft' && !flashback) {
    const shown = new Set(ev.occurrences.map((o) => o.pack_event_id).filter(Boolean));
    for (const c of g.chanceCompanions || []) {
      if (shown.has(c.eventId) || sceneEnd.lo < c.lo || !sceneEntities.includes(c.personId)) continue;
      (g.chanceBlocking === false ? warnings : violations).push(`"${c.title}" comes to ${c.who} without warning at ${formatTick(c.lo)}, and ${c.who} is still with the player when this reply passes that time, but the reply does not show it: show it happening to both of them where they are, or end the reply before ${formatTick(c.lo)}.`);
    }
  }
  // Time frames: the frame the scene is in after this reply, when the reviewer names a known one (by id or name)
  // and it is not the current one. Without one, the place of the last beat the player character takes part in, when
  // that place belongs to a frame (or is a known place of the main frame). A flashback does not move the scene.
  let sceneFrame = flashback ? null : frameRef(g.pack, ev.scene_frame);
  if (!sceneFrame && !flashback && g.playerId && g.pack.frames.frames.size) {
    const fx = g.pack.frames;
    for (const o of ev.occurrences) {
      if (o.backstory || !hasQuote(o.quote) || !o.actors.map(resolveId).includes(g.playerId)) continue;
      const fr = (o.locations || []).map(resolveId).map((l) => (!l ? null : fx.placeFrame.get(l) || (g.pack.entities.get(l)?.kind === 'place' ? MAIN_FRAME : null))).find(Boolean);
      if (fr) sceneFrame = fr;
    }
  }
  const frameNow = g.index.state.sceneFrame?.frameId || MAIN_FRAME;
  if (sceneFrame && sceneFrame !== frameNow) {
    records.push({
      recordId: newId('rec'), kind: 'scene_frame', storyTime: { lo: sceneEnd.lo, hi: sceneEnd.lo, precision: sceneEnd.precision }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
      visibility: { mode: 'public', knower_ids: [] }, summary: `The scene is now in ${sceneFrame === MAIN_FRAME ? 'the main frame' : g.pack.frames.frames.get(sceneFrame)!.name}`, evidenceKind: 'direct', frameId: sceneFrame,
    });
  }
  return { violations: uniq(violations), warnings, records, stateClaims, playerActions, sceneEnd, flashback, sceneEntities, sceneFrame: sceneFrame && sceneFrame !== frameNow ? sceneFrame : null, enactedSteps, hardFulfilled, coverage, coverageGaps, runtimeEntities };
}

/** A frame named by a model: its id, MAIN_FRAME, or its name (also the main frame's name); null for anything else. */
export function frameRef(pack: LoadedPack, ref: unknown): Id | null {
  if (typeof ref !== 'string' || !ref.trim() || !pack.frames.frames.size) return null;
  const r = ref.trim();
  if (r === MAIN_FRAME || pack.frames.frames.has(r)) return r;
  const n = normalizeName(r);
  if (pack.frames.mainName && normalizeName(pack.frames.mainName) === n) return MAIN_FRAME;
  for (const f of pack.frames.frames.values()) if (normalizeName(f.name) === n) return f.id;
  return null;
}
