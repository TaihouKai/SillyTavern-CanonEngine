// Narrative integration: how the world reacts to the player character.
// - Player presence: the player's identity, organizations and who knows what about them, read from the Persona
//   (one revision per identity change) and kept current by actual history.
// - Engagement policy: the player's decisions (declined, deferred, joined, ...) and the contacts that reached them,
//   both replayable records; one filter for every way the world may pull the player in.
// - Candidate retrieval and the checked, disposable suggestions of the integrate task (never history).
import type { ContactInfo, EngagementInfo, Id, PackEvent, RuntimeEntity, ScopeKind } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import type { ContactEntry, EngagementEntry, WorldState } from '../domain/reducer';
import { evalCondition, factAt, triLabel } from '../domain/reducer';
import { formatTick, toTick } from '../domain/time';
import { hashObject, newId, sha256, uniq } from '../domain/util';
import type { WorldIndex } from '../domain/world-query';
import type { IntegrationCache, Opportunity, PlayerProfile, ProfileRevision, RecordDraft, SourceEntry } from './types';

/** Story-time lead for candidate events (events starting within it are considered). */
export const INTEGRATION_LEAD_MINUTES = 24 * 60;
/** A contact the player has not answered blocks new contacts about the same thing for this long. */
export const UNANSWERED_HOLD_MINUTES = 24 * 60;
/** A suggestion is offered to the GM when it can happen within this much story time. */
export const OFFER_SOON_MINUTES = 3 * 60;

export const personaHash = (p: { name: string; description: string }) => sha256(`${p.name}\n${p.description}`);

// ---------------------------------------------------------------------------------------------
// Player presence (profile)

export interface ProfileOut {
  player: { name: string; aliases?: string[]; summary: string; public_identity?: string };
  affiliations: { name: string; existing_id?: string | null; kind?: 'organization' | 'other'; role?: string; secrecy?: 'public' | 'restricted' | 'secret'; description?: string }[];
  places?: { name: string; existing_id?: string | null; use?: string; description?: string }[];
  capabilities?: string[]; resources?: string[]; goals?: string[];
  relationships: { name: string; existing_id?: string | null; relation?: string; basis?: 'persona_stated' | 'implied' }[];
  knowers: { who: string; existing_id?: string | null; level: 'exists' | 'identity' | 'secrets'; about: string; basis: 'persona_stated' | 'implied' }[];
  uncertain?: string[];
}

const slug = (s: string) => (String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, '-').replace(/^-|-$/g, '') || 'x').slice(0, 20);

/** Turn the profile task's output into a checked profile. Implied relationships and knowers never name a specific
 *  known character, and nobody knows secrets the Persona does not give them (user decision: allow the knowers an
 *  identity implies, keep the three levels apart, never make a canon character the player's superior on a guess).
 *  Ids of the player and their original organizations/places are kept from the previous revision by name. */
export function buildProfile(out: ProfileOut, pack: LoadedPack, index: WorldIndex, persona: { name: string; description: string }, prev: PlayerProfile | null): { profile: PlayerProfile; runtimeEntities: RuntimeEntity[] } {
  const notes: string[] = [];
  const runtimeEntities: RuntimeEntity[] = [];
  const known = (id: string | null | undefined) => (id && pack.entities.has(id) ? id : null);
  const kindOf = (id: Id) => pack.entities.get(id)?.kind || index.entityKind(id);
  const name = (out.player?.name || persona.name || 'player').trim();
  const playerId = prev?.playerId || `rt.player.${slug(name)}.${newId('e').slice(2, 8)}`;
  const aliases = uniq([...(out.player?.aliases || []), ...(persona.name && persona.name !== name ? [persona.name] : [])].map((a) => a.trim()).filter((a) => a && a !== name)).slice(0, 8);
  runtimeEntities.push({ id: playerId, name, aliases, kind: 'person', description: `The player character. ${out.player?.summary || ''}`.slice(0, 600) });
  const reuse = (n: string, list: { entityId: Id; name: string }[] | undefined) => list?.find((x) => x.name === n)?.entityId;
  const affiliations: PlayerProfile['affiliations'] = [];
  for (const a of out.affiliations || []) {
    if (!a.name?.trim()) continue;
    let id = known(a.existing_id) || index.resolveEntity(a.name).ids.find((x) => pack.entities.has(x)) || null;
    if (id && !['organization', 'other'].includes(kindOf(id))) id = null;
    if (!id) {
      id = reuse(a.name, prev?.affiliations) || `rt.org.${slug(a.name)}.${newId('e').slice(2, 8)}`;
      runtimeEntities.push({ id, name: a.name.trim(), aliases: [], kind: a.kind === 'other' ? 'other' : 'organization', description: (a.description || a.role || '').slice(0, 600) });
    }
    affiliations.push({ entityId: id, name: a.name.trim(), role: (a.role || '').slice(0, 400), secrecy: a.secrecy || 'public' });
  }
  const places: PlayerProfile['places'] = [];
  for (const p of out.places || []) {
    if (!p.name?.trim()) continue;
    let id = known(p.existing_id) || index.resolveEntity(p.name).ids.find((x) => pack.entities.has(x) && kindOf(x) === 'place') || null;
    if (id && kindOf(id) !== 'place') id = null;
    if (!id) {
      id = reuse(p.name, prev?.places) || `rt.place.${slug(p.name)}.${newId('e').slice(2, 8)}`;
      runtimeEntities.push({ id, name: p.name.trim(), aliases: [], kind: 'place', description: (p.description || p.use || '').slice(0, 600) });
    }
    places.push({ entityId: id, name: p.name.trim(), use: (p.use || '').slice(0, 400) });
  }
  const isKnownPerson = (id: Id | null) => !!id && pack.entities.get(id)?.kind === 'person';
  const relationships: PlayerProfile['relationships'] = [];
  for (const r of out.relationships || []) {
    if (!r.name?.trim()) continue;
    const id = known(r.existing_id) || index.resolveEntity(r.name).ids.find((x) => pack.entities.has(x)) || null;
    const basis = r.basis === 'persona_stated' ? 'persona_stated' : 'implied';
    if (basis === 'implied' && isKnownPerson(id)) { notes.push(`dropped implied relationship with ${r.name} (${r.relation || ''}): a known character is connected to the player only when the Persona says so or it happens in play`); continue; }
    relationships.push({ entityId: id, name: r.name.trim(), relation: (r.relation || '').slice(0, 400), basis });
  }
  const knowers: PlayerProfile['knowers'] = [];
  for (const k of out.knowers || []) {
    if (!k.who?.trim()) continue;
    const id = known(k.existing_id) || null;
    const basis = k.basis === 'persona_stated' ? 'persona_stated' : 'implied';
    if (basis === 'implied' && isKnownPerson(id)) { notes.push(`dropped implied knower ${k.who}: a known character knows about the player only when the Persona says so or it happens in play`); continue; }
    if (basis === 'implied' && k.level === 'secrets') { notes.push(`"${k.who}" kept at identity level: knowing specific secrets needs the Persona to say so`); knowers.push({ who: k.who.trim(), entityId: id, level: 'identity', about: k.about.slice(0, 400), basis }); continue; }
    knowers.push({ who: k.who.trim(), entityId: id, level: k.level, about: k.about.slice(0, 400), basis });
  }
  const list = (x?: string[]) => (x || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  return {
    profile: {
      personaName: persona.name, personaText: persona.description, personaHash: personaHash(persona), source: 'standard_persona', playerId,
      summary: (out.player?.summary || '').slice(0, 1500), publicIdentity: (out.player?.public_identity || '').slice(0, 800),
      affiliations, places, capabilities: list(out.capabilities), resources: list(out.resources), goals: list(out.goals), relationships, knowers, uncertain: list(out.uncertain), notes,
    },
    runtimeEntities,
  };
}

/** The persona_seed record: the player and their original organizations/places enter the world (no story event). */
export function seedRecord(profile: PlayerProfile, runtimeEntities: RuntimeEntity[], tick: number, rev: number): RecordDraft {
  return {
    recordId: newId('rec'), kind: 'persona_seed', storyTime: { lo: tick, hi: tick, precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
    visibility: { mode: 'public', knower_ids: [] }, summary: `Player presence from the Persona (revision ${rev}): ${profile.personaName}`, evidenceKind: 'bootstrap', runtimeEntities,
  };
}

/** The profile revision in effect at a transcript position: the latest one whose anchor message lies before it. */
export function profileAt(revs: ProfileRevision[] | undefined, entries: SourceEntry[], position: number): ProfileRevision | null {
  if (!revs?.length) return null;
  const pos = new Map(entries.map((e, i) => [e.messageId, i]));
  let best: ProfileRevision | null = null;
  for (const r of revs) {
    const at = r.afterMessageId === null ? -1 : pos.get(r.afterMessageId);
    // a revision anchored after a message that is gone applies from the end (like a manual record)
    const eff = at === undefined ? entries.length - 1 : at;
    if (eff < position && (!best || r.rev > best.rev)) best = r;
  }
  return best;
}

/** Entities that stand for the player: the player, their organizations and places. */
export function playerIds(p: PlayerProfile): Id[] {
  return uniq([p.playerId, ...p.affiliations.map((a) => a.entityId), ...p.places.map((x) => x.entityId)]);
}

const LEVEL = { exists: 'knows the organization exists (not that the player is in it)', identity: 'knows who the player is / their role', secrets: 'knows' } as const;

function factsLine(index: WorldIndex, id: Id, tick: number): string {
  if (!index.entityExists(id)) return '';
  const s = index.entityState(id, { tick });
  return s.facts.length ? ` [now: ${s.facts.map((f) => `${f.predicate}=${f.display}`).join('; ')}]` : '';
}

/** The player's actual history: every occurrence the player, their organizations or places took part in
 *  (causal retrieval by entity, not the latest few), plus those with the given people. */
export function playerHistory(index: WorldIndex, profile: PlayerProfile, withIds: Id[] = [], limit = 30): { id: string; time: string; title: string; account: string; actors: string[] }[] {
  const ids = new Set<string>();
  for (const e of playerIds(profile)) for (const o of index.occurrencesForEntity(e)) ids.add(o);
  const occs = [...ids].map((id) => index.state.occurrences.get(id)!).filter(Boolean).sort((a, b) => a.time.lo - b.time.lo || a.seq - b.seq);
  // the ones with the given people are always kept; the rest are the most recent
  const withSet = new Set(withIds);
  const keyed = occs.filter((o) => [...o.actors, ...o.affected].some((x) => withSet.has(x)));
  const rest = occs.filter((o) => !keyed.includes(o)).slice(-Math.max(0, limit - keyed.length));
  return [...keyed, ...rest].sort((a, b) => a.time.lo - b.time.lo).map((o) => ({ id: o.occurrenceId, time: formatTick(o.time.lo), title: o.title, account: o.account.length > 240 ? o.account.slice(0, 237) + '…' : o.account, actors: o.actors.map((a) => index.entityName(a)) }));
}

/** The player context shared by the HARD planner, the integrate task and (as text) the GM: the same projection,
 *  so no task treats the player as a bare name. */
export function playerContext(index: WorldIndex, profile: PlayerProfile, tick: number, opts: { historyWith?: Id[]; historyLimit?: number } = {}) {
  const eng = engagementView(index.state, index.pack);
  return {
    entity_id: profile.playerId,
    name: profile.personaName,
    who: profile.summary,
    public_identity: profile.publicIdentity,
    affiliations: profile.affiliations.map((a) => ({ id: a.entityId, name: a.name, role: a.role, secrecy: a.secrecy, now: factsLine(index, a.entityId, tick).trim() })),
    places: profile.places.map((p) => ({ id: p.entityId, name: p.name, use: p.use, now: factsLine(index, p.entityId, tick).trim() })),
    capabilities: profile.capabilities,
    resources: profile.resources,
    goals: profile.goals,
    relationships: profile.relationships.map((r) => ({ name: r.name, id: r.entityId, relation: r.relation, basis: r.basis })),
    knowers: profile.knowers.map((k) => ({ who: k.who, id: k.entityId, level: k.level, about: k.about, basis: k.basis })),
    now: factsLine(index, profile.playerId, tick).trim(),
    actual_history: playerHistory(index, profile, opts.historyWith || [], opts.historyLimit ?? 30),
    decisions: eng.lines(tick),
    profile_note: 'From the player\'s standard Persona description (revision with its own source) and actual play; actual history wins over the Persona when they differ.',
  };
}

/** What a plan depends on about the player: the profile revision, the player's decisions and the lasting state of
 *  the player's own entities (not every scene move). A change makes the HARD plan stale. */
export function playerContextHash(index: WorldIndex, profile: PlayerProfile | null, persona: { name: string; description: string }): string {
  if (!profile) return hashObject({ persona: personaHash(persona) });
  const facts: [string, unknown][] = [];
  for (const id of playerIds(profile)) for (const [k, list] of index.state.facts) {
    if (!k.startsWith(id + '|')) continue;
    const pred = index.pack.predicates.get(k.slice(id.length + 1));
    if (pred?.transient) continue;
    const last = list[list.length - 1];
    facts.push([k, last?.op === 'set' ? last.value : null]);
  }
  return hashObject({ p: profile.personaHash, ids: playerIds(profile), facts: facts.sort(), e: index.state.engagements.map((e) => `${e.scopeKind}:${e.scopeRef}:${e.stance}`) });
}

// ---------------------------------------------------------------------------------------------
// Engagement policy

export const scopeKey = (kind: ScopeKind, ref: string) => `${kind}:${ref}`;
const NEGATIVE = new Set(['declined', 'deferred', 'ooc_suppress']);
const POSITIVE = new Set(['accepted', 'joined', 'reopened']);

export interface ScopeStatus { current: EngagementEntry | null; history: EngagementEntry[] }

/** The player's current stance per scope, from their decisions in record order. A "limited" act changes nothing;
 *  joined/accepted/reopened lift a refusal of exactly that scope (not a broader one); a deferral ends at its time. */
export function engagementView(state: WorldState, pack: LoadedPack) {
  const scopes = new Map<string, ScopeStatus>();
  const all: EngagementEntry[] = [...state.engagements];
  // legacy participation_decline records count as declining that event
  for (const [eventId, recordId] of state.declines) {
    if (all.some((e) => e.recordId === recordId)) continue;
    const rec = state.recordById.get(recordId);
    all.push({ scopeKind: 'event', scopeRef: eventId, scopeLabel: pack.events.get(eventId)?.title || eventId, stance: 'declined', quote: rec?.sourceRefs[0]?.spans[0]?.quote || '', source: 'player_message', recordId, seq: rec?.sequence ?? 0, tick: rec?.storyTime.lo ?? 0 });
  }
  all.sort((a, b) => a.seq - b.seq);
  for (const e of all) {
    const k = scopeKey(e.scopeKind, e.scopeRef);
    const s = scopes.get(k) || { current: null, history: [] };
    s.history.push(e);
    if (e.stance !== 'limited') s.current = e;
    scopes.set(k, s);
  }
  const negativeAt = (k: string, tick: number): EngagementEntry | null => {
    const c = scopes.get(k)?.current;
    if (!c || !NEGATIVE.has(c.stance)) return null;
    if (c.stance === 'deferred' && c.until != null && c.until <= tick) return null;
    return c;
  };
  const positiveAfter = (k: string, seq: number) => { const c = scopes.get(k)?.current; return !!c && POSITIVE.has(c.stance) && c.seq > seq; };
  return {
    scopes,
    all,
    /** The decision that blocks pulling the player into this target, if any. */
    blockedBy(target: { eventId?: Id | null; scopeKind?: ScopeKind; scopeRef?: string; actors?: Id[] }, tick: number, contacts: ContactEntry[] = state.contacts): EngagementEntry | null {
      const ev = target.eventId ? pack.events.get(target.eventId) : undefined;
      if (target.eventId) { const n = negativeAt(scopeKey('event', target.eventId), tick); if (n) return n; }
      if (ev?.arc_id) {
        const n = negativeAt(scopeKey('arc', ev.arc_id), tick);
        // taking part in this very event later lifts the storyline refusal for it only
        if (n && !positiveAfter(scopeKey('event', ev.id), n.seq)) return n;
      }
      if (target.scopeKind && target.scopeRef) {
        const n = negativeAt(scopeKey(target.scopeKind, target.scopeRef), tick);
        if (n) return n;
      }
      for (const a of target.actors || []) { const n = negativeAt(scopeKey('faction', a), tick); if (n) return n; }
      // "not this request": a refusal of one contact blocks the same thing from the same people
      for (const [k, s] of scopes) {
        if (!k.startsWith('contact:')) continue;
        const n = negativeAt(k, tick);
        if (!n) continue;
        const c = contacts.find((x) => x.recordId === n.scopeRef);
        if (!c) continue;
        const sameThing = (target.scopeKind === c.scopeKind && target.scopeRef === c.scopeRef) || (!!target.eventId && c.scopeKind === 'event' && c.scopeRef === target.eventId);
        if (sameThing && (target.actors || []).some((a) => c.actors.includes(a))) return n;
        void s;
      }
      return null;
    },
    /** Lines for the GM, the reviewer and the analysis tasks (binding decisions and unanswered contacts). */
    lines(tick: number): string[] {
      const out: string[] = [];
      for (const s of scopes.values()) {
        const c = s.current;
        if (!c) continue;
        const q = c.quote ? ` ("${c.quote.slice(0, 120)}")` : '';
        const label = c.scopeLabel || c.scopeRef;
        if (c.stance === 'declined') out.push(`declined: ${label}${q} — do not pull the player into it again in any way (no other person, channel, news, friend's plea or contrived threat). The world goes on; harm with an actual cause may still reach them.`);
        else if (c.stance === 'deferred' && !(c.until != null && c.until <= tick)) out.push(`not now: ${label}${q}${c.until != null ? ` — until ${formatTick(c.until)}` : ''} — do not bring it up again${c.until != null ? ' before then' : ' unless the player does'}.`);
        else if (c.stance === 'ooc_suppress') out.push(`out of character, stop: ${label}${q} — keep it out of the player's story: no contacts, reminders or NPC arguments about it.`);
        else if (c.stance === 'joined' || c.stance === 'accepted' || c.stance === 'reopened') out.push(`${c.stance === 'joined' ? 'took part by their own action' : c.stance === 'accepted' ? 'accepted' : 'open to it again'}: ${label}${q} — continue it naturally.`);
        const lim = s.history.filter((h) => h.stance === 'limited' && h.seq > (c?.seq ?? -1)).slice(-1)[0];
        if (lim) out.push(`one act only: ${lim.scopeLabel || lim.scopeRef} ("${lim.quote.slice(0, 120)}") — that act; nothing more of it is accepted.`);
      }
      for (const c of unanswered(state, tick)) out.push(`already offered, not answered: ${c.scopeLabel || c.scopeRef} (${formatTick(c.tick)}, ${c.contactKind}) — do not repeat or press it.`);
      return out;
    },
  };
}

/** Contacts the player has not answered (no decision on that thing or that contact since), recent ones only. */
export function unanswered(state: WorldState, tick: number): ContactEntry[] {
  const out: ContactEntry[] = [];
  const latest = new Map<string, ContactEntry>();
  for (const c of state.contacts) if (!['hostile', 'consequence'].includes(c.contactKind)) latest.set(scopeKey(c.scopeKind, c.scopeRef), c);
  for (const [k, c] of latest) {
    if (tick - c.tick > UNANSWERED_HOLD_MINUTES) continue;
    const answered = state.engagements.some((e) => e.seq > c.seq && (scopeKey(e.scopeKind, e.scopeRef) === k || (e.scopeKind === 'contact' && e.scopeRef === c.recordId) || (e.scopeKind === 'event' && c.scopeKind === 'event' && e.scopeRef === c.scopeRef)));
    if (!answered) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Candidates

export interface Candidate {
  event: PackEvent; lo: number; hi: number;
  status: 'upcoming' | 'in_window' | 'under_way' | 'settled';
  focus: boolean;
}

/** Events the world may involve the player in: about to start (within the lead, or before a time jump's end), in
 *  their window, under way, the player's 关注 events, events of the player's known connections in the next days,
 *  and recently settled ones (for consequences only). Deterministic, so nothing near is missed. */
export function integrationCandidates(index: WorldIndex, profile: PlayerProfile, tick: number, opts: { jumpTo?: number | null; focus?: Id[]; lead?: number } = {}): Candidate[] {
  const pack = index.pack;
  const st = index.state;
  const end = Math.max(tick + (opts.lead ?? INTEGRATION_LEAD_MINUTES), opts.jumpTo ?? 0);
  const focus = new Set(opts.focus || []);
  const linked = new Set(profile.relationships.map((r) => r.entityId).concat(profile.affiliations.map((a) => a.entityId)).filter(Boolean) as Id[]);
  const underWay = new Set([...st.occurrences.values()].map((o) => o.inProgressOf).filter(Boolean) as Id[]);
  const out: Candidate[] = [];
  for (const t of pack.timeIndex) {
    if (t.lo > Math.max(end, tick + 3 * 1440)) break;
    const ev = pack.events.get(t.id)!;
    const settled = st.dispositions.get(t.id);
    if (settled) {
      if (settled.tick >= tick - 1440 && settled.tick <= tick && (ev.entity_ids.some((x) => linked.has(x)) || focus.has(t.id))) out.push({ event: ev, lo: t.lo, hi: t.hi, status: 'settled', focus: focus.has(t.id) });
      continue;
    }
    if (t.hi < tick && !underWay.has(t.id)) continue;
    const near = t.lo <= end;
    const mine = focus.has(t.id) || ev.entity_ids.some((x) => linked.has(x));
    if (!near && !mine) continue;
    out.push({ event: ev, lo: t.lo, hi: t.hi, status: underWay.has(t.id) ? 'under_way' : t.lo <= tick ? 'in_window' : 'upcoming', focus: focus.has(t.id) });
  }
  // under way first, then in time order; a bounded list
  return out.sort((a, b) => (a.status === 'under_way' ? -1 : 0) - (b.status === 'under_way' ? -1 : 0) || a.lo - b.lo).slice(0, 14);
}

export function candidateInput(index: WorldIndex, c: Candidate, tick: number, blocked: EngagementEntry | null) {
  const ev = c.event;
  const people = (ev.cast?.length ? ev.cast.map((m) => `${index.entityName(m.entity_id)} [${m.entity_id}] from ${formatTick(toTick(m.at))} (${m.role})`) : ev.entity_ids.filter((x) => ['person', 'organization'].includes(index.entityKind(x))).map((x) => `${index.entityName(x)} [${x}]`));
  const arc = ev.arc_id ? index.pack.pack.arcs.find((a) => a.id === ev.arc_id) : undefined;
  return {
    id: ev.id, title: ev.title, classification: ev.classification, window: `${formatTick(c.lo)} – ${formatTick(c.hi)}`, status: c.status,
    original: ev.summary.length > 500 ? ev.summary.slice(0, 497) + '…' : ev.summary,
    people, places: ev.location_ids.map((x) => index.entityName(x)),
    arc: arc ? { id: arc.id, title: arc.title } : null,
    original_conditions_now: triLabel(evalCondition(ev.canonical_preconditions, index.state, index.pack, { tick: Math.max(tick, c.lo) })),
    in_progress: index.inProgressBeats(ev.id).map((o) => `${o.title}: ${o.account}`.slice(0, 200)),
    pack_hook: ev.participation.offer === 'when_relevant' ? ev.participation.hook : null,
    never_offer: ev.participation.offer === 'never',
    focus: c.focus,
    player_decision: blocked ? `${blocked.stance}: ${blocked.scopeLabel}` : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Suggestions (integrate task output) — checked, then cached; never history

export interface IntegrateOut {
  assessments: { target: string; classification: 'direct_impact' | 'opportunity' | 'no_connection'; reason: string }[];
  opportunities: {
    ref: string; target_event_id?: string | null; scope_kind: ScopeKind; scope_ref: string; scope_label?: string; kind: ContactInfo['contactKind'];
    direct_impact?: boolean; actors: string[]; motivation: string; knowledge: string; contact: string; establishes?: string[];
    earliest?: { day: number; minute: number } | null; latest?: { day: number; minute: number } | null; priority?: number; basis_refs?: string[];
  }[];
}

/** Check the suggestions: real actors and scopes, nothing settled or impossible revived, the player's decisions
 *  (no way around a refusal — only harm with an actual recorded cause gets through), no repeat of an unanswered
 *  contact or of one already made. Returns the valid ones and why the others were dropped. */
export function checkOpportunities(out: IntegrateOut, index: WorldIndex, profile: PlayerProfile, candidates: Candidate[], tick: number): { valid: Opportunity[]; dropped: { id: string; reason: string }[] } {
  const pack = index.pack;
  const st = index.state;
  const eng = engagementView(st, pack);
  const cand = new Map(candidates.map((c) => [c.event.id, c]));
  const valid: Opportunity[] = [];
  const dropped: { id: string; reason: string }[] = [];
  const pending = unanswered(st, tick);
  for (const o of out.opportunities || []) {
    const ref = o.ref || '?';
    const actors = uniq((o.actors || []).map((a) => (index.entityExists(a) ? a : index.resolveEntity(a).ids.length === 1 ? index.resolveEntity(a).ids[0] : null)).filter(Boolean) as Id[]).filter((a) => a !== profile.playerId);
    if (!actors.length) { dropped.push({ id: ref, reason: 'no known actor' }); continue; }
    let scopeKind = o.scope_kind, scopeRef = String(o.scope_ref || '').trim();
    let label = (o.scope_label || '').trim();
    if (scopeKind === 'event') { if (!pack.events.has(scopeRef)) { dropped.push({ id: ref, reason: `unknown event ${scopeRef}` }); continue; } label ||= pack.events.get(scopeRef)!.title; }
    else if (scopeKind === 'arc') { const a = pack.pack.arcs.find((x) => x.id === scopeRef); if (!a) { dropped.push({ id: ref, reason: `unknown arc ${scopeRef}` }); continue; } label ||= a.title; }
    else if (scopeKind === 'faction') { if (!index.entityExists(scopeRef)) { dropped.push({ id: ref, reason: `unknown organization ${scopeRef}` }); continue; } label ||= index.entityName(scopeRef); }
    else if (scopeKind === 'contact') { const c = st.contacts.find((x) => x.recordId === scopeRef); if (!c) { dropped.push({ id: ref, reason: 'unknown contact' }); continue; } scopeKind = c.scopeKind; scopeRef = c.scopeRef; label ||= c.scopeLabel; }
    else { label ||= scopeRef; scopeRef = slug(label || scopeRef); }
    const targetEventId = o.target_event_id && cand.has(o.target_event_id) ? o.target_event_id : scopeKind === 'event' && cand.has(scopeRef) ? scopeRef : null;
    if (o.target_event_id && !targetEventId) { dropped.push({ id: ref, reason: `event ${o.target_event_id} is not near or not open` }); continue; }
    const kind = o.kind;
    const direct = !!o.direct_impact;
    const c = targetEventId ? cand.get(targetEventId)! : null;
    const consequence = kind === 'consequence';
    // what a settled event left behind reaches the player as a consequence or as news of what happened
    if (c?.status === 'settled' && !consequence && kind !== 'information') { dropped.push({ id: ref, reason: `${c.event.title} is already settled (only its consequences or news of it can reach the player)` }); continue; }
    if (c && c.status !== 'settled' && !consequence && triLabel(evalCondition(c.event.canonical_preconditions, st, pack, { tick: Math.max(tick, c.lo) })) === 'FALSE' && !direct) { dropped.push({ id: ref, reason: `${c.event.title}: its original conditions failed; not revived` }); continue; }
    if (c?.event.participation.offer === 'never' && !c.focus && !direct) { dropped.push({ id: ref, reason: `${c.event.title}: the pack never offers it` }); continue; }
    const earliest = o.earliest ? toTick(o.earliest) : null;
    const latest = o.latest ? toTick(o.latest) : null;
    if (latest !== null && latest < tick) { dropped.push({ id: ref, reason: 'its time has passed' }); continue; }
    const basisRefs = uniq((o.basis_refs || []).filter((b) => st.occurrences.has(b) || pack.events.has(b)));
    const blocked = eng.blockedBy({ eventId: targetEventId, scopeKind, scopeRef, actors }, tick);
    if (blocked) {
      // only harm that already has an actual cause in history gets past a refusal
      const actualCause = basisRefs.some((b) => { const oc = st.occurrences.get(b); return !!oc && [...oc.actors, ...oc.affected].some((x) => actors.includes(x)); });
      if (!(direct && (kind === 'hostile' || consequence) && actualCause)) { dropped.push({ id: ref, reason: `the player ${blocked.stance === 'ooc_suppress' ? 'suppressed' : blocked.stance} ${blocked.scopeLabel}` }); continue; }
    }
    const id = 'opp_' + sha256(`${scopeKind}|${scopeRef}|${kind}|${[...actors].sort().join(',')}`).slice(0, 10);
    if (st.contacts.some((x) => x.opportunityId === id)) { dropped.push({ id: ref, reason: 'already made' }); continue; }
    if (!['hostile', 'consequence'].includes(kind) && pending.some((p) => p.scopeKind === scopeKind && p.scopeRef === scopeRef)) { dropped.push({ id: ref, reason: 'an earlier contact about the same thing is unanswered' }); continue; }
    valid.push({
      id, scopeKind, scopeRef, scopeLabel: label, targetEventId, kind, directImpact: direct, actors,
      motivation: (o.motivation || '').slice(0, 800), knowledge: (o.knowledge || '').slice(0, 800), contact: (o.contact || '').slice(0, 800), establishes: (o.establishes || []).slice(0, 8),
      earliest, latest, priority: Math.min(3, Math.max(1, Math.round(o.priority || 2))), focus: !!c?.focus, basisRefs,
    });
  }
  return { valid, dropped };
}

/** At most one new contact for this reply: one that can happen now, not in a busy scene (an event under way
 *  admits only direct impacts); 关注 first, then direct impacts, priority and time. The policy is checked again
 *  against the current decisions (a cached suggestion may predate a refusal). */
export function selectOpportunity(cache: IntegrationCache | null, index: WorldIndex, tick: number, busy: boolean): Opportunity | null {
  if (!cache) return null;
  const eng = engagementView(index.state, index.pack);
  const pending = unanswered(index.state, tick);
  const ok = cache.opportunities.filter((o) => {
    if (o.latest !== null && o.latest < tick) return false;
    if (o.earliest !== null && o.earliest > tick + OFFER_SOON_MINUTES) return false;
    if (busy && !o.directImpact) return false;
    if (index.state.contacts.some((x) => x.opportunityId === o.id)) return false;
    if (!['hostile', 'consequence'].includes(o.kind) && pending.some((p) => p.scopeKind === o.scopeKind && p.scopeRef === o.scopeRef)) return false;
    const blocked = eng.blockedBy({ eventId: o.targetEventId, scopeKind: o.scopeKind, scopeRef: o.scopeRef, actors: o.actors }, tick);
    if (blocked && !(o.directImpact && (o.kind === 'hostile' || o.kind === 'consequence') && o.basisRefs.some((b) => index.state.occurrences.has(b)))) return false;
    return true;
  });
  ok.sort((a, b) => Number(b.focus) - Number(a.focus) || Number(b.directImpact) - Number(a.directImpact) || a.priority - b.priority || (a.earliest ?? tick) - (b.earliest ?? tick));
  return ok[0] || null;
}

/** What the analysis depends on: the profile, the player's decisions and contacts, the candidate events and their
 *  state, the 关注 list, a time jump, the player's lasting state, and actual history linking the player to the
 *  candidates' people. Ordinary turns with none of these changing reuse the cached result. */
export function integrationKey(index: WorldIndex, profile: PlayerProfile, candidates: Candidate[], focus: Id[], jumpTo: number | null): string {
  const people = new Set(candidates.flatMap((c) => c.event.entity_ids));
  const mine = new Set(playerIds(profile));
  const linkOccs = [...index.state.occurrences.values()].filter((o) => {
    const all = [...o.actors, ...o.affected, ...o.locations];
    return all.some((x) => mine.has(x)) && (all.some((x) => people.has(x)) || o.packEventId);
  }).map((o) => o.occurrenceId).sort();
  return hashObject({
    v: 1, p: profile.personaHash, ids: [...mine],
    c: candidates.map((c) => `${c.event.id}:${c.status}:${index.inProgressBeats(c.event.id).length}`),
    e: index.state.engagements.map((e) => e.recordId), k: index.state.contacts.map((c) => c.recordId),
    f: [...focus].sort(), j: jumpTo ?? null, o: linkOccs,
    s: playerIds(profile).map((id) => factAt(index.state, id, 'exists', { tick: Number.MAX_SAFE_INTEGER }).value ?? null),
  });
}

// ---------------------------------------------------------------------------------------------
// GM context sections

export function presenceSection(index: WorldIndex, profile: PlayerProfile, tick: number): string {
  const lines = [`PLAYER IN THIS WORLD (from the player's Persona and actual play; people know about the player only as listed — anyone else knows just the public identity):`];
  lines.push(`- ${profile.personaName} [${profile.playerId}] (the player character): ${profile.summary || '(no summary)'}${profile.publicIdentity ? ` Public identity: ${profile.publicIdentity}` : ''}${factsLine(index, profile.playerId, tick)}`);
  for (const a of profile.affiliations) lines.push(`- organization: ${a.name} [${a.entityId}] — ${a.role || 'member'} (${a.secrecy})${factsLine(index, a.entityId, tick)}`);
  for (const p of profile.places) lines.push(`- place: ${p.name} [${p.entityId}] — ${p.use}${factsLine(index, p.entityId, tick)}`);
  if (profile.capabilities.length || profile.resources.length) lines.push(`- can/has: ${[...profile.capabilities, ...profile.resources].slice(0, 10).join('; ')}`);
  for (const r of profile.relationships.slice(0, 12)) lines.push(`- connection: ${r.name}${r.entityId ? ` [${r.entityId}]` : ''} — ${r.relation} (${r.basis === 'persona_stated' ? 'Persona' : 'implied by the role'})`);
  for (const k of profile.knowers.slice(0, 12)) lines.push(`- who knows: ${k.who} ${LEVEL[k.level]}${k.level === 'secrets' ? ':' : ' —'} ${k.about}`);
  return lines.join('\n');
}

export function decisionsSection(lines: string[]): string {
  return lines.length ? `PLAYER'S DECISIONS (binding; from the player's own words or actions — they decide what they get drawn into):\n${lines.map((l) => '- ' + l).join('\n')}` : '';
}

export function worldReactionSection(index: WorldIndex, o: Opportunity, origin: { y: number; m: number; d: number } | null): string {
  const who = o.actors.map((a) => index.entityName(a)).join(', ');
  const when = o.earliest !== null ? ` It can happen from ${formatTick(o.earliest, origin)}${o.latest !== null ? ` until ${formatTick(o.latest, origin)}` : ''}; if this reply ends before then, it has not happened yet.` : '';
  return `WORLD REACTION (optional for this reply — NOT history; use it only if it fits the scene and its time; keep everyone in character and leave the player's answer to the player; not using it is fine):\n- ${who}: ${o.contact} Why: ${o.motivation} What they know about the player: ${o.knowledge}${o.establishes.length ? ` May establish: ${o.establishes.join('; ')}.` : ''}${when}`;
}

/** Records for the player's decisions from an extract_user statement (scope checked against the pack/state). */
export function engagementRecord(s: { stance?: string | null; scope_kind?: string | null; scope_ref?: string | null; scope_label?: string | null; until?: { day: number; minute: number } | null; quote: string; summary: string }, index: WorldIndex, tick: number, src: RecordDraft['sourceRefs']): RecordDraft | null {
  const stance = s.stance as EngagementInfo['stance'];
  if (!stance || !['declined', 'deferred', 'accepted', 'joined', 'limited', 'ooc_suppress', 'reopened'].includes(stance)) return null;
  let kind = (s.scope_kind || '') as ScopeKind;
  let ref = String(s.scope_ref || '').trim();
  let label = String(s.scope_label || '').trim();
  const pack = index.pack;
  if (kind === 'event') { if (!pack.events.has(ref)) return null; label ||= pack.events.get(ref)!.title; }
  else if (kind === 'arc') { const a = pack.pack.arcs.find((x) => x.id === ref); if (!a) return null; label ||= a.title; }
  else if (kind === 'faction') { if (!index.entityExists(ref)) { const r = index.resolveEntity(ref); if (r.ids.length !== 1) return null; ref = r.ids[0]; } label ||= index.entityName(ref); }
  else if (kind === 'contact') { const c = index.state.contacts.find((x) => x.recordId === ref); if (!c) return null; label ||= c.scopeLabel; }
  else if (kind === 'storyline') { label ||= ref; if (!label) return null; ref = slug(label); }
  else return null;
  const until = stance === 'deferred' && s.until && Number.isInteger(s.until.day) && Number.isInteger(s.until.minute) && toTick(s.until) > tick ? toTick(s.until) : null;
  const info: EngagementInfo = { scopeKind: kind, scopeRef: ref, scopeLabel: label.slice(0, 300), stance, quote: s.quote.slice(0, 300), until, source: 'player_message' };
  return { recordId: newId('rec'), kind: 'engagement', storyTime: { lo: tick, hi: tick, precision: 'minute' }, sourceRefs: src, factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: `Player ${stance} ${label}: ${s.summary}`.slice(0, 400), evidenceKind: 'direct', engagement: info };
}
