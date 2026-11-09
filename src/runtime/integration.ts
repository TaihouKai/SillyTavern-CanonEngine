// Narrative integration: how the world reacts to the player character.
// - Player presence: the player's identity, organizations and who knows what about them, read from the Persona
//   (one revision per identity change) and kept current by actual history.
// - Engagement policy: the player's decisions (declined, deferred, joined, ...) and the contacts that reached them,
//   both replayable records; one filter for every way the world may pull the player in.
// - Candidate retrieval and the checked, disposable suggestions of the integrate task (never history).
import type { ContactInfo, EngagementInfo, FactDelta, Id, PackEvent, RuntimeEntity, ScopeKind } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import type { ContactEntry, EngagementEntry, TieEntry, WorldState } from '../domain/reducer';
import { evalCondition, factAt, triLabel } from '../domain/reducer';
import { agoLabel, formatTick, toTick } from '../domain/time';
import { hashObject, newId, sha256, uniq } from '../domain/util';
import { WorldIndex } from '../domain/world-query';
import type { AffiliationStatus, TieChange, IntegrationCache, Opportunity, PlayerNature, PlayerProfile, ProfileRevision, RecordDraft, SourceEntry } from './types';
import { markedLines } from './worldset';

/** Story-time lead for candidate events (events starting within it are considered). */
export const INTEGRATION_LEAD_MINUTES = 24 * 60;
/** A contact the player has not answered blocks new contacts about the same thing for this long. */
export const UNANSWERED_HOLD_MINUTES = 24 * 60;
/** How long an answered / refused question stays in the GM's decisions. */
export const ANSWER_SHOWN_MINUTES = 24 * 60;
/** Live (白井, several games): turned down, she left with "if not today, tomorrow at the branch then" — the one
 *  in-character reaction a refusal allows, used to ask again. */
export const RENEW_NOT = "The reaction does not renew it in another form: no deadline or later appointment (\"then tomorrow…\"), condition, warning or veiled threat, \"I'll be watching you\" or \"this isn't over\".";
/** A suggestion is offered to the GM when it can happen within this much story time. */
export const OFFER_SOON_MINUTES = 3 * 60;

export const personaHash = (p: { name: string; description: string }) => sha256(`${p.name}\n${p.description}`);
/** Whether a stored Persona hash is this Persona, read either way (with or without Persona Library's sections). */
export const samePersona = (hash: string | undefined, p: { name: string; description: string; alt?: string }) =>
  !!hash && (hash === personaHash(p) || (p.alt !== undefined && hash === personaHash({ name: p.name, description: p.alt })));

// ---------------------------------------------------------------------------------------------
// Player presence (profile)

export interface ProfileOut {
  player: { name: string; aliases?: string[]; summary: string; public_identity?: string };
  affiliations: { name: string; existing_id?: string | null; kind?: 'organization' | 'other'; role?: string; status: AffiliationStatus; leads?: boolean; members?: string[]; secrecy?: 'public' | 'restricted' | 'secret'; description?: string }[];
  places?: { name: string; existing_id?: string | null; use?: string; description?: string }[];
  capabilities?: string[]; resources?: string[]; goals?: string[];
  roles?: { role: string; brings?: string[]; from?: string[]; style?: string }[];
  not_suited?: string[];
  voice?: string;
  nature?: Partial<PlayerNature>;
  relationships: { name: string; existing_id?: string | null; relation?: string; basis?: 'persona_stated' | 'implied' }[];
  knowers: { who: string; existing_id?: string | null; level: 'exists' | 'identity' | 'secrets'; about: string; basis: 'persona_stated' | 'implied'; places?: string[] }[];
  recognized_by?: { who: string; existing_id?: string | null; places?: string[]; everywhere?: boolean; as: string }[];
  world_changes?: { text: string; terms?: string[] }[];
  uncertain?: string[];
}

const slug = (s: string) => (String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9㐀-鿿]+/g, '-').replace(/^-|-$/g, '') || 'x').slice(0, 20);

/** 本局设定 from a Persona read: every line marked "(本局设定)" (taken by the code, so none is lost, with the
 *  analysis' search words when it gave that line), then the other changes the analysis found. */
export function worldChangesOf(out: Pick<ProfileOut, 'world_changes'>, personaText: string): NonNullable<PlayerProfile['worldChanges']> {
  const found = (out.world_changes || []).filter((w) => w?.text?.trim()).map((w) => ({ text: w.text.trim().slice(0, 600), terms: (w.terms || []).map((t) => String(t).trim()).filter(Boolean).slice(0, 12) }));
  const n = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const marked = markedLines(personaText).map((line) => {
    const same = found.find((w) => n(w.text).includes(n(line)) || n(line).includes(n(w.text)));
    return { text: line.slice(0, 600), terms: same?.terms || [], marked: true };
  });
  const rest = found.filter((w) => !marked.some((m) => n(m.text).includes(n(w.text)) || n(w.text).includes(n(m.text)))).map((w) => ({ ...w, marked: false }));
  return [...marked, ...rest].slice(0, 30);
}

/** Turn the profile task's output into a checked profile. Implied relationships and knowers never name a specific
 *  known character, and nobody knows secrets the Persona does not give them (user decision: allow the knowers an
 *  identity implies, keep the three levels apart, never make a canon character the player's superior on a guess).
 *  Ids of the player and their original organizations/places are kept from the previous revision by name. */
export function buildProfile(out: ProfileOut, pack: LoadedPack, index: WorldIndex, persona: { name: string; description: string; source?: PlayerProfile['source'] }, prev: PlayerProfile | null): { profile: PlayerProfile; runtimeEntities: RuntimeEntity[] } {
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
    const status = a.status === 'joining' || a.status === 'former' ? a.status : 'member';
    affiliations.push({ entityId: id, name: a.name.trim(), role: (a.role || '').slice(0, 400), status, secrecy: a.secrecy || 'public', ...(a.leads && status === 'member' ? { leads: true } : {}) });
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
  // The handler or superior the Persona states knows who the player is, however the model labelled that knower
  // (live: "联络人: 云川芹亚" was dropped as an "implied" knower). Being named for something else — a friend, a debtor —
  // is not enough; what they know beyond the identity still needs the Persona's words (secrets stay capped below).
  const CHAIN_ROLE = /handler|contact|liaison|superior|boss|commander|supervisor|report(?:s|ing)? to|联络|上级|上司|上线|直属|负责人|指挥|隶属|主管|顶头/i;
  const relationships: PlayerProfile['relationships'] = [];
  for (const r of out.relationships || []) {
    if (!r.name?.trim()) continue;
    let id = known(r.existing_id) || index.resolveEntity(r.name).ids.find((x) => pack.entities.has(x)) || null;
    const basis = r.basis === 'persona_stated' ? 'persona_stated' : 'implied';
    if (basis === 'implied' && isKnownPerson(id)) { notes.push(`dropped implied relationship with ${r.name} (${r.relation || ''}): a known character is connected to the player only when the Persona says so or it happens in play`); continue; }
    // someone the Persona names who is not in this world's pack (a friend, a shop owner, a parent) becomes a person of
    // the chat, like the Persona's own organizations and places, so the world can bring them in
    if (!id && basis === 'persona_stated') {
      id = prev?.relationships.find((x) => x.name === r.name.trim())?.entityId || `rt.person.${slug(r.name)}.${newId('e').slice(2, 8)}`;
      runtimeEntities.push({ id, name: r.name.trim(), aliases: [], kind: 'person', description: `${r.relation || ''} (from the Persona of ${name})`.slice(0, 600) });
    }
    relationships.push({ entityId: id, name: r.name.trim(), relation: (r.relation || '').slice(0, 400), basis });
  }
  // the other people the Persona puts in an organization: the Persona's own people read above, or this world's
  out.affiliations?.forEach((a) => {
    const aff = affiliations.find((x) => x.name === a.name?.trim());
    if (!aff || !a.members?.length) return;
    const ids = a.members.map((n) => relationships.find((r) => r.name === n.trim() && r.entityId)?.entityId
      || index.resolveEntity(n).ids.find((x) => pack.entities.has(x) && kindOf(x) === 'person') || null).filter((x): x is Id => !!x && x !== playerId);
    if (ids.length) aff.memberIds = uniq(ids).slice(0, 20);
    if (ids.length < a.members.length) notes.push(`${aff.name}: members not found in this world or the Persona's people: ${a.members.filter((n) => !relationships.some((r) => r.name === n.trim() && r.entityId) && !index.resolveEntity(n).ids.length).join(', ')}`);
  });
  // a group's organization and places: the pack's, or the Persona's own ones read above
  const orgRef = (ref: string | null | undefined): Id | null => {
    if (!ref) return null;
    const own = affiliations.find((a) => a.entityId === ref || a.name === ref)?.entityId;
    const id = own || known(ref) || index.resolveEntity(ref).ids.find((x) => pack.entities.has(x)) || null;
    return id && (own || ['organization', 'other'].includes(kindOf(id))) ? id : null;
  };
  const placeRefs = (refs: string[] | undefined): Id[] => uniq((refs || []).map((r) => places.find((p) => p.entityId === r || p.name === r)?.entityId
    || (known(r) && kindOf(r) === 'place' ? r : null) || index.resolveEntity(r).ids.find((x) => pack.entities.has(x) && kindOf(x) === 'place') || null).filter(Boolean) as Id[]).slice(0, 12);
  const knowers: PlayerProfile['knowers'] = [];
  for (const k of out.knowers || []) {
    if (!k.who?.trim()) continue;
    const id = known(k.existing_id) || orgRef(k.existing_id) || null;
    const kp = placeRefs(k.places);
    const basis = k.basis === 'persona_stated' ? 'persona_stated' : 'implied';
    const statedChain = !!id && relationships.some((r) => r.entityId === id && r.basis === 'persona_stated' && CHAIN_ROLE.test(r.relation));
    if (basis === 'implied' && isKnownPerson(id) && !statedChain) { notes.push(`dropped implied knower ${k.who}: a known character knows about the player only when the Persona says so or it happens in play`); continue; }
    if (basis === 'implied' && k.level === 'secrets') { notes.push(`"${k.who}" kept at identity level: knowing specific secrets needs the Persona to say so`); knowers.push({ who: k.who.trim(), entityId: id, level: 'identity', about: k.about.slice(0, 400), basis, ...(kp.length ? { places: kp } : {}) }); continue; }
    knowers.push({ who: k.who.trim(), entityId: id, level: k.level, about: k.about.slice(0, 400), basis, ...(kp.length ? { places: kp } : {}) });
  }
  // public standing: a known character is never made a recognizer by name (they know what is public anyway)
  const recognizedBy: NonNullable<PlayerProfile['recognizedBy']> = [];
  for (const r of out.recognized_by || []) {
    if (!r.who?.trim() || !r.as?.trim()) continue;
    if (isKnownPerson(known(r.existing_id))) continue;
    recognizedBy.push({ who: r.who.trim().slice(0, 300), orgId: orgRef(r.existing_id), places: placeRefs(r.places), everywhere: !!r.everywhere, as: r.as.trim().slice(0, 400) });
  }
  const list = (x?: string[]) => (x || []).map((s) => String(s).trim()).filter(Boolean).slice(0, 20);
  return {
    profile: {
      personaName: persona.name, personaText: persona.description, personaHash: personaHash(persona), source: persona.source || 'standard_persona', playerId,
      summary: (out.player?.summary || '').slice(0, 1500), publicIdentity: (out.player?.public_identity || '').slice(0, 800),
      affiliations, places, capabilities: list(out.capabilities), resources: list(out.resources), goals: list(out.goals), relationships, knowers, recognizedBy: recognizedBy.slice(0, 10), uncertain: list(out.uncertain), notes,
      roles: (out.roles || []).filter((r) => r?.role?.trim()).slice(0, 8).map((r) => ({ role: r.role.trim().slice(0, 200), brings: list(r.brings), from: list(r.from), style: String(r.style || '').trim().slice(0, 300) })),
      notSuited: list(out.not_suited),
      voice: String(out.voice || '').trim().slice(0, 600),
      ...natureOf(out.nature),
      worldChanges: worldChangesOf(out, persona.description),
    },
    runtimeEntities,
  };
}

/** The player's 常态 from the profile reply: kept when any field says something. */
function natureOf(n: ProfileOut['nature']): { nature?: PlayerNature } {
  const pick = (k: keyof PlayerNature) => String(n?.[k] || '').trim().slice(0, 500);
  const v: PlayerNature = { habits: pick('habits'), uses: pick('uses'), others: pick('others'), limits: pick('limits') };
  return Object.values(v).some(Boolean) ? { nature: v } : {};
}

/** The persona_seed record: the player and their original organizations/places enter the world (no story event),
 *  and the player joins the organizations the Persona makes them a member of — with the people the Persona puts there,
 *  and as their leader when the Persona says so (the Persona decides over the pack's leader). One they are about to
 *  join or have left is not joined: play does that. A later revision first takes the previous player out of what the
 *  new Persona no longer makes them a member of. */
export function seedRecord(profile: PlayerProfile, runtimeEntities: RuntimeEntity[], tick: number, rev: number, prev: PlayerProfile | null = null): RecordDraft {
  const deltas: FactDelta[] = [];
  const memberOf = (p: PlayerProfile) => p.affiliations.filter((a) => a.status === 'member');
  for (const a of prev ? memberOf(prev) : []) {
    const kept = profile.playerId === prev!.playerId ? memberOf(profile).find((x) => x.entityId === a.entityId) : undefined;
    if (!kept) deltas.push({ op: 'remove', entity_id: a.entityId, predicate: 'members', value: [prev!.playerId] });
    if (a.leads && !kept?.leads) deltas.push({ op: 'remove', entity_id: a.entityId, predicate: 'leader', value: prev!.playerId });
  }
  for (const a of memberOf(profile)) {
    deltas.push({ op: 'add', entity_id: a.entityId, predicate: 'members', value: [profile.playerId, ...(a.memberIds || [])] });
    if (a.leads) deltas.push({ op: 'set', entity_id: a.entityId, predicate: 'leader', value: profile.playerId });
  }
  return {
    recordId: newId('rec'), kind: 'persona_seed', storyTime: { lo: tick, hi: tick, precision: 'minute' }, sourceRefs: [], factsSetOrUnset: deltas, eventOccurrenceIds: [],
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

/** The profile with the player's relationships and who knows what about them as play has changed them: the Persona
 *  gives the start, every player_tie record (the analysis of an accepted reply, or the user in the panel) changes it
 *  from there, in record order — a relationship is replaced by how it stands now (or ended), a knower knows more
 *  (only the user can make it less), a tie the user removed is gone. Decided by the code, so the GM and the analysis
 *  see one current list, not the Persona's words next to a story that has moved on. */
export function playedProfile(index: WorldIndex, profile: PlayerProfile): PlayerProfile {
  const ties = index.state.ties;
  if (!ties?.length) return profile;
  const n = (s: string) => String(s || '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
  const same = (id: Id | null, name: string, t: TieEntry) => (t.who && id ? t.who === id : n(name) === n(t.name));
  const rank = { exists: 0, identity: 1, secrets: 2 } as const;
  let relationships = profile.relationships.map((r) => ({ ...r }));
  let knowers = profile.knowers.map((k) => ({ ...k }));
  for (const t of ties) {
    const change = (start: string | null, prevChange?: TieChange): TieChange => ({ since: t.tick, by: t.source, start: prevChange ? prevChange.start : start, quote: t.quote });
    if (t.kind === 'relation') {
      const i = relationships.findIndex((r) => same(r.entityId, r.name, t));
      if (t.removed) { if (i >= 0) relationships.splice(i, 1); continue; }
      if (i < 0) { relationships.push({ entityId: t.who, name: t.name, relation: t.relation || '', basis: t.source, ...(t.ended ? { ended: true } : {}), changed: change(null) }); continue; }
      const r = relationships[i];
      relationships[i] = { ...r, entityId: r.entityId || t.who, relation: t.relation || r.relation, ended: !!t.ended, changed: change(r.basis === 'play' || r.basis === 'ui' ? null : r.relation, r.changed) };
    } else {
      const i = knowers.findIndex((k) => same(k.entityId, k.who, t));
      if (t.removed) { if (i >= 0) knowers.splice(i, 1); continue; }
      const level = t.level || 'identity';
      if (i < 0) { knowers.push({ who: t.name, entityId: t.who, level, about: t.about || '', basis: t.source, changed: change(null) }); continue; }
      const k = knowers[i];
      knowers[i] = { ...k, entityId: k.entityId || t.who, level: t.source === 'ui' || rank[level] > rank[k.level] ? level : k.level, about: t.about || k.about, changed: change(k.basis === 'play' || k.basis === 'ui' ? null : `${k.level}: ${k.about}`, k.changed) };
    }
  }
  relationships = relationships.slice(-40);
  knowers = knowers.slice(-40);
  return { ...profile, relationships, knowers };
}

/** Entities that stand for the player: the player, their organizations and places. */
export function playerIds(p: PlayerProfile): Id[] {
  return uniq([p.playerId, ...p.affiliations.map((a) => a.entityId), ...p.places.map((x) => x.entityId)]);
}

/** Who belongs to which organization at a time, without the dead: the organization's `members` set when it has one
 *  (the whole list, also after it is emptied), otherwise the people whose `affiliation` names it (both pack
 *  conventions; live check: 一方通行's affiliation with GROUP outlived GROUP's dissolution). Cached for the last
 *  index and time. */
let membershipMemo: { index: WorldIndex; tick: number; facts: number; value: Map<Id, Id[]> } | null = null;
export function memberships(index: WorldIndex, tick: number): Map<Id, Id[]> {
  if (membershipMemo && membershipMemo.index === index && membershipMemo.tick === tick && membershipMemo.facts === index.state.facts.size) return membershipMemo.value;
  const sets = new Map<Id, Set<Id>>();
  const listed = new Set<Id>();
  const add = (org: Id, who: Id) => { if (!sets.has(org)) sets.set(org, new Set()); sets.get(org)!.add(who); };
  const byAffiliation: [Id, Id][] = [];
  for (const k of index.state.facts.keys()) {
    const i = k.lastIndexOf('|');
    const id = k.slice(0, i), pred = k.slice(i + 1);
    if (pred !== 'members' && pred !== 'affiliation') continue;
    const f = factAt(index.state, id, pred, { tick });
    if (!f.known) continue;
    if (pred === 'members' && Array.isArray(f.value)) { listed.add(id); for (const m of f.value) add(id, String(m)); }
    if (pred === 'affiliation' && typeof f.value === 'string' && index.entityKind(f.value) === 'organization') byAffiliation.push([f.value, id]);
  }
  for (const [org, who] of byAffiliation) if (!listed.has(org)) add(org, who);
  const alive = (id: Id) => { const f = factAt(index.state, id, 'alive', { tick }); return !(f.known && f.value === false); };
  const value = new Map([...sets].map(([org, s]) => [org, [...s].filter(alive)] as [Id, Id[]]).filter(([, s]) => s.length));
  membershipMemo = { index, tick, facts: index.state.facts.size, value };
  return value;
}
/** The organizations a person belongs to at a time. */
export function orgsOf(index: WorldIndex, who: Id, tick: number): Id[] {
  return [...memberships(index, tick)].filter(([, s]) => s.includes(who)).map(([org]) => org);
}

/** Where the player stands with each organization now: the Persona gives the start (member / about to join / former),
 *  the members facts what play made of it since (joined, left). Decided by the code, so the GM never has to weigh the
 *  Persona's words against the story. */
export type OrgStanding = 'member' | 'joined_in_play' | 'left_in_play' | 'not_joined_yet' | 'former';
export interface PlayerOrg { id: Id; name: string; role: string; secrecy: PlayerProfile['affiliations'][number]['secrecy']; persona: AffiliationStatus | null; standing: OrgStanding; leads: boolean }
/** A Persona organization's or place's name in this game: the pack's (本局设定 may rename it), else as the Persona read. */
export const nameIn = (index: WorldIndex, id: Id, stored: string) => (index.entityExists(id) ? index.entityName(id) : stored);

export function playerOrgs(index: WorldIndex, profile: PlayerProfile, tick: number): PlayerOrg[] {
  const now = new Set(orgsOf(index, profile.playerId, tick));
  const leads = (id: Id) => factAt(index.state, id, 'leader', { tick }).value === profile.playerId;
  const out: PlayerOrg[] = profile.affiliations.map((a) => ({
    id: a.entityId, name: nameIn(index, a.entityId, a.name), role: a.role, secrecy: a.secrecy, persona: a.status, leads: leads(a.entityId),
    standing: now.has(a.entityId) ? (a.status === 'member' ? 'member' : 'joined_in_play') : a.status === 'member' ? 'left_in_play' : a.status === 'joining' ? 'not_joined_yet' : 'former',
  }));
  for (const id of now) if (!out.some((o) => o.id === id)) out.push({ id, name: index.entityName(id), role: '', secrecy: 'public', persona: null, standing: 'joined_in_play', leads: leads(id) });
  return out;
}
/** Whether the player is in the organization now (member at the start or joined in play, not left). */
export const isIn = (o: PlayerOrg) => o.standing === 'member' || o.standing === 'joined_in_play';
const STANDING: Record<OrgStanding, string> = {
  member: 'member',
  joined_in_play: 'member (joined in play)',
  left_in_play: 'NOT a member any more (left in play)',
  not_joined_yet: 'NOT a member yet (about to join at the start; not joined in play so far)',
  former: 'NOT a member (a former member)',
};

const LEVEL = { exists: 'knows the organization exists (not that the player is in it)', identity: 'knows who the player is / their role', secrets: 'knows' } as const;

/** An entity's facts now; `max` cuts a person's long list (their connections' lines stay short). */
function factsLine(index: WorldIndex, id: Id, tick: number, max = 0): string {
  if (!index.entityExists(id)) return '';
  const s = index.entityState(id, { tick });
  const text = s.facts.map((f) => `${f.predicate}=${f.display}`).join('; ');
  return text ? ` [now: ${max && text.length > max ? text.slice(0, max - 1) + '…' : text}]` : '';
}

/** A time for the analysis steps: the date, and how long before the scene it was. */
function when(t: number, now: number): string {
  return `${formatTick(t, WorldIndex.displayOrigin)}, ${agoLabel(t, now)}`;
}

/** How far back what the player's organizations and places did without them is shown, and how old the history an
 *  opportunity rests on may be when the player had no part in it. */
export const LATELY_DAYS = 30;

/** The player's actual history: the occurrences the player took part in (causal retrieval by entity, not the latest
 *  few), those with the given people always kept. Only the player's own: what their organizations or places did
 *  without them is not (live: ITEM's year-old kidnapping of a member, given as a new member's history, came back as
 *  "she has been missing since this morning"); that is `lately`. */
export function playerHistory(index: WorldIndex, profile: PlayerProfile, tick: number, withIds: Id[] = [], limit = 30): { id: string; time: string; title: string; account: string; actors: string[] }[] {
  const occs = index.occurrencesForEntity(profile.playerId).map((id) => index.state.occurrences.get(id)!).filter(Boolean).sort((a, b) => a.time.lo - b.time.lo || a.seq - b.seq);
  // the ones with the given people are always kept; the rest are the most recent
  const withSet = new Set(withIds);
  const keyed = occs.filter((o) => [...o.actors, ...o.affected].some((x) => withSet.has(x)));
  const rest = occs.filter((o) => !keyed.includes(o)).slice(-Math.max(0, limit - keyed.length));
  return [...keyed, ...rest].sort((a, b) => a.time.lo - b.time.lo).map((o) => ({ id: o.occurrenceId, time: when(o.time.lo, tick), title: o.title, account: o.account.length > 240 ? o.account.slice(0, 237) + '…' : o.account, actors: o.actors.map((a) => index.entityName(a)) }));
}

/** What the player's organizations and places went through lately without the player (the last LATELY_DAYS, the
 *  latest few each): background for the analysis, never the player's own history. */
export function lately(index: WorldIndex, profile: PlayerProfile, tick: number, perEntity = 6) {
  const from = tick - LATELY_DAYS * 1440;
  const of = (id: Id) => index.occurrencesForEntity(id).map((x) => index.state.occurrences.get(x)!)
    .filter((o) => o && !o.undated && o.time.lo <= tick && o.time.hi >= from && ![...o.actors, ...o.affected].includes(profile.playerId))
    .sort((a, b) => a.time.lo - b.time.lo || a.seq - b.seq).slice(-perEntity)
    .map((o) => ({ id: o.occurrenceId, time: when(o.time.lo, tick), title: o.title, account: o.account.length > 200 ? o.account.slice(0, 197) + '…' : o.account }));
  return [
    ...playerOrgs(index, profile, tick).map((o) => ({ of: o.name, id: o.id, player_standing: STANDING[o.standing], events: of(o.id) })),
    ...profile.places.map((p) => ({ of: nameIn(index, p.entityId, p.name), id: p.entityId, events: of(p.entityId) })),
  ].filter((x) => x.events.length);
}

/** People (and organizations) who share an actual occurrence with the player, most recent first. */
export function playLinks(index: WorldIndex, profile: PlayerProfile, limit = 12): Id[] {
  const seen = new Map<Id, number>();
  for (const oid of index.occurrencesForEntity(profile.playerId)) {
    const o = index.state.occurrences.get(oid);
    if (!o) continue;
    for (const x of [...o.actors, ...o.affected]) if (x !== profile.playerId && ['person', 'organization'].includes(index.entityKind(x))) seen.set(x, Math.max(seen.get(x) ?? -1, o.seq));
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

/** The player context shared by the HARD planner, the integrate task and (as text) the GM: the same projection,
 *  so no task treats the player as a bare name. */
export function playerContext(index: WorldIndex, profile: PlayerProfile, tick: number, opts: { historyWith?: Id[]; historyLimit?: number } = {}) {
  profile = playedProfile(index, profile);
  const eng = engagementView(index.state, index.pack);
  return {
    entity_id: profile.playerId,
    name: profile.personaName,
    who: profile.summary,
    public_identity: profile.publicIdentity,
    affiliations: playerOrgs(index, profile, tick).map((o) => ({ id: o.id, name: o.name, standing: STANDING[o.standing], ...(o.leads ? { leads: true } : {}), ...(o.role ? { persona_role_at_start: o.role } : {}), secrecy: o.secrecy, now: factsLine(index, o.id, tick).trim() })),
    places: profile.places.map((p) => ({ id: p.entityId, name: nameIn(index, p.entityId, p.name), use: p.use, now: factsLine(index, p.entityId, tick).trim() })),
    capabilities: profile.capabilities,
    resources: profile.resources,
    goals: profile.goals,
    ...(profile.roles?.length ? { roles: profile.roles } : {}),
    ...(profile.notSuited?.length ? { not_suited: profile.notSuited } : {}),
    relationships: byChange(profile.relationships).map((r) => ({ name: r.name, id: r.entityId, relation: r.relation, basis: r.basis, ...(r.ended ? { ended: true } : {}), ...(r.changed ? { since: when(r.changed.since, tick), ...(r.changed.start ? { at_start: r.changed.start } : {}) } : {}), ...(r.entityId && factsLine(index, r.entityId, tick) ? { now: factsLine(index, r.entityId, tick, 300).trim() } : {}) })),
    knowers: byChange(profile.knowers).map((k) => ({ who: k.who, id: k.entityId, level: k.level, about: k.about, basis: k.basis, ...(k.changed ? { since: when(k.changed.since, tick) } : {}) })),
    now: factsLine(index, profile.playerId, tick).trim(),
    actual_history: playerHistory(index, profile, tick, opts.historyWith || [], opts.historyLimit ?? 30),
    lately: lately(index, profile, tick),
    decisions: eng.lines(tick),
    profile_note: 'From the player\'s standard Persona description (revision with its own source) and actual play; actual history wins over the Persona when they differ. actual_history is what the player themself took part in; lately is what their organizations and places went through without them (the last 30 days) — not the player\'s history, and over unless it says otherwise. Every time says how long ago it was: what happened long ago is over; what it set in motion shows in the facts "now" of the people and places.',
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
  return hashObject({ p: profile.personaHash, ids: playerIds(profile), facts: facts.sort(), e: index.state.engagements.filter((e) => e.stance !== 'answered' && e.stance !== 'refused').map((e) => `${e.scopeKind}:${e.scopeRef}:${e.stance}`) });
}

// ---------------------------------------------------------------------------------------------
// Engagement policy

export const scopeKey = (kind: ScopeKind, ref: string) => `${kind}:${ref}`;
const NEGATIVE = new Set(['declined', 'deferred', 'ooc_suppress']);
const POSITIVE = new Set(['accepted', 'joined', 'reopened']);
/** A refusal the reviewer enforces: marked 强烈拒绝 in the panel, or an out-of-character stop. */
export const isBinding = (e: { stance: string; strong?: boolean }) => e.stance === 'ooc_suppress' || (NEGATIVE.has(e.stance) && !!e.strong);

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
        // turning down a small job turns down that job only, not the organization it came through (live: ignoring one
        // EMBER job blocked every later request from 云川); the job itself is not offered again (lapsed / already made)
        if (!c || c.sideJob) continue;
        const sameThing = (target.scopeKind === c.scopeKind && target.scopeRef === c.scopeRef) || (!!target.eventId && c.scopeKind === 'event' && c.scopeRef === target.eventId);
        if (sameThing && (target.actors || []).some((a) => c.actors.includes(a))) return n;
        void s;
      }
      return null;
    },
    /** Refusals in force now that the reviewer enforces (强烈拒绝 or out of character). */
    binding(tick: number): EngagementEntry[] {
      return [...scopes.keys()].map((k) => negativeAt(k, tick)).filter((e): e is EngagementEntry => !!e && isBinding(e));
    },
    /** Questions and requests the player answered lately (any decision on one contact): asking again is enforced. */
    answers(tick: number): EngagementEntry[] {
      return [...scopes.values()].map((s) => s.current).filter((c): c is EngagementEntry => !!c && c.scopeKind === 'contact' && tick - c.tick <= ANSWER_SHOWN_MINUTES);
    },
    /** Lines for the GM, the reviewer and the analysis tasks (decisions and unanswered contacts). */
    lines(tick: number): string[] {
      const out: string[] = [];
      for (const s of scopes.values()) {
        const c = s.current;
        if (!c) continue;
        const q = c.quote ? ` ("${c.quote.slice(0, 120)}")` : '';
        const label = c.scopeLabel || c.scopeRef;
        // a decision on one question or request answers it, whatever the stance was called (agreeing to "will you
        // behave tonight?" was read as accepting): nobody asks it again
        const once = c.scopeKind === 'contact' ? ` That request has its answer: do not ask it again. ${RENEW_NOT}` : '';
        if (c.stance === 'declined' && c.strong) out.push(`BINDING — declined: ${label}${q} — do not pull the player into it again in any way (no other person, channel, news, friend's plea or contrived threat). The world goes on; harm with an actual cause may still reach them.`);
        else if (c.stance === 'declined') out.push(`wish — declined: ${label}${q} — respect it: do not arrange for anyone to pull the player into it. Ordinary remarks, small talk and favours from the people around them are fine.${once}`);
        else if (c.stance === 'deferred' && !(c.until != null && c.until <= tick)) out.push(`${c.strong ? 'BINDING' : 'wish'} — not now: ${label}${q}${c.until != null ? ` — until ${formatTick(c.until)}` : ''} — do not bring it up again${c.until != null ? ' before then' : ' unless the player does'}.`);
        else if (c.stance === 'ooc_suppress') out.push(`BINDING — out of character, stop: ${label}${q} — keep it out of the player's story: no contacts, reminders or NPC arguments about it.`);
        // answers to questions: recent ones only (a day), so a long game does not pile them up
        else if (c.stance === 'answered' && tick - c.tick <= ANSWER_SHOWN_MINUTES) out.push(`answered: ${label} — the player answered${q}. That is their answer, vague or partial as it may be: react to it if you like, but do not ask for it again. ${RENEW_NOT}`);
        else if (c.stance === 'refused' && tick - c.tick <= ANSWER_SHOWN_MINUTES) out.push(`refused to answer: ${label} — the player will not answer${q}. Respect it: one in-character reaction at most, then drop the question; do not ask it again or press for it another way. ${RENEW_NOT}`);
        else if (c.stance === 'done') out.push(`done: ${label} — the player finished it (Canon Engine panel). It is over: nothing about it is pending; do not bring it up as unfinished.${once}`);
        else if (c.stance === 'joined' || c.stance === 'accepted' || c.stance === 'reopened') out.push(`${c.stance === 'joined' ? 'took part by their own action' : c.stance === 'accepted' ? 'accepted' : 'open to it again'}: ${label}${q} — continue it naturally.${once}`);
        const lim = s.history.filter((h) => h.stance === 'limited' && h.seq > (c?.seq ?? -1)).slice(-1)[0];
        if (lim) out.push(`one act only: ${lim.scopeLabel || lim.scopeRef} ("${lim.quote.slice(0, 120)}") — that act; nothing more of it is accepted.`);
      }
      for (const c of unanswered(state, tick)) out.push(`already offered, not answered: ${c.scopeLabel || c.scopeRef} (${formatTick(c.tick)}, ${c.contactKind}) — do not repeat or press it.`);
      // what the player took up themselves in play, without a stated decision (live: an ITEM survivor's call about a
      // missing friend, answered by going to her — the reviewer then read every line of that thread as pressure
      // on an older "no 暗部 jobs")
      const taken = new Map<string, ContactEntry>();
      for (const c of state.contacts) if (tick - c.tick <= 3 * 1440 && !scopes.get(scopeKey(c.scopeKind, c.scopeRef))?.current && answeredBy(state, c) === 'play') taken.set(scopeKey(c.scopeKind, c.scopeRef), c);
      for (const c of taken.values()) out.push(`taken up by the player in play: ${c.scopeLabel || c.scopeRef} — they went along with it themselves; continuing it with the people involved is their choice, not pressure from another decision.`);
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
    if (tick - c.tick > UNANSWERED_HOLD_MINUTES || jobLapsed(state, c, tick)) continue;
    if (!answeredBy(state, c)) out.push(c);
  }
  return out;
}

/** The player character's entity (buildProfile names it rt.player.…). */
export const isPlayerId = (id: Id) => id.startsWith('rt.player.');

/** The decision in force on the matter of a contact: one on any contact about the same thing, or a later one on the
 *  thing itself (the newest). */
export function contactDecision(state: WorldState, c: ContactEntry): EngagementEntry | null {
  const k = scopeKey(c.scopeKind, c.scopeRef);
  // answering any contact about the same thing answers it (live: calling back after a message, then told where to come)
  const sameThing = (id: string) => { const x = state.contacts.find((y) => y.recordId === id); return !!x && scopeKey(x.scopeKind, x.scopeRef) === k; };
  const ds = state.engagements.filter((e) => e.stance !== 'limited' && (e.scopeKind === 'contact' ? sameThing(e.scopeRef) : e.seq > c.seq && scopeKey(e.scopeKind, e.scopeRef) === k));
  return ds.length ? ds.reduce((a, b) => (b.seq > a.seq ? b : a)) : null;
}

/** How the player answered a contact: by a decision (on it or the same thing), or in play — in a later message the
 *  player character has since acted with the people who reached out, the organization it came through (or its
 *  members) or in the event it was about (called them back, went to them). The occurrence's actors decide, not the
 *  reviewer's origin label (live: hardly ever "player", so a contact the player went along with stayed 未回应). */
export function answeredBy(state: WorldState, c: ContactEntry): 'decision' | 'play' | null {
  if (contactDecision(state, c)) return 'decision';
  const commit = state.recordById.get(c.recordId)?.commitId;
  const members = c.scopeKind === 'faction' ? factAt(state, c.scopeRef, 'members').value : null;
  const touched = new Set<Id>([...c.actors, ...(c.scopeKind === 'faction' ? [c.scopeRef, ...(Array.isArray(members) ? members.map(String) : [])] : [])].filter((x) => !isPlayerId(x)));
  if ([...state.occurrences.values()].some((o) => o.seq > c.seq && o.commitId !== commit && (o.origin === 'player' || o.actors.some(isPlayerId))
    && ([...o.actors, ...o.affected].some((a) => touched.has(a)) || (c.scopeKind === 'event' && o.packEventId === c.scopeRef)))) return 'play';
  return null;
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
  // connections: the Persona's as play changed them, and the people the player has actually dealt with in play
  // (live: 滨面/泷壶, met on 10/10, were nobody's connection because they are not in the Persona)
  const linked = new Set([...playedProfile(index, profile).relationships.filter((r) => !r.ended).map((r) => r.entityId), ...profile.affiliations.map((a) => a.entityId), ...playLinks(index, profile)].filter(Boolean) as Id[]);
  // ...and the members of the organizations among them (a bad relation with SCHOOL makes 垣根's moves the player's
  // concern; membership comes from the pack's facts at the scene's time)
  const members = memberships(index, tick);
  for (const id of [...linked]) for (const m of members.get(id) || []) if (m !== profile.playerId) linked.add(m);
  const underWay = new Set([...st.occurrences.values()].map((o) => o.inProgressOf).filter(Boolean) as Id[]);
  const out: Candidate[] = [];
  for (const t of pack.timeIndex) {
    // connections' events: the next three days from where the scene is (after a time jump, from where it lands)
    if (t.lo > Math.max(end, Math.max(tick, opts.jumpTo ?? 0) + 3 * 1440)) break;
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
  // a bounded list: under way, 关注 and the player's connections' events are kept first (a long time jump has many
  // unrelated events in between); shown under way first, then in time order
  const rank = (c: Candidate) => c.status === 'under_way' ? 0 : c.focus ? 1 : c.event.entity_ids.some((x) => linked.has(x)) ? 2 : 3;
  const kept = new Set([...out].sort((a, b) => rank(a) - rank(b) || a.lo - b.lo).slice(0, 14));
  return out.filter((c) => kept.has(c)).sort((a, b) => (a.status === 'under_way' ? -1 : 0) - (b.status === 'under_way' ? -1 : 0) || a.lo - b.lo);
}

export function candidateInput(index: WorldIndex, c: Candidate, tick: number, blocked: EngagementEntry | null, profile: PlayerProfile | null = null) {
  const ev = c.event;
  const orgs = (id: Id) => { const o = index.entityKind(id) === 'person' ? orgsOf(index, id, Math.max(tick, c.lo)) : []; return o.length ? `, of ${o.map((x) => index.entityName(x)).join(', ')}` : ''; };
  const people = (ev.cast?.length ? ev.cast.map((m) => `${index.entityName(m.entity_id)} [${m.entity_id}${orgs(m.entity_id)}] from ${formatTick(toTick(m.at))} (${m.role})`) : ev.entity_ids.filter((x) => ['person', 'organization'].includes(index.entityKind(x))).map((x) => `${index.entityName(x)} [${x}${orgs(x)}]`));
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
    // the player's own organization takes part: a required contact
    ...(profile && playerOrgsIn(index, profile, c, tick).length ? { player_org: playerOrgsIn(index, profile, c, tick).map((o) => index.entityName(o)).join(', ') } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Suggestions (integrate task output) — checked, then cached; never history

export interface IntegrateOut {
  assessments: { target: string; classification: 'direct_impact' | 'opportunity' | 'no_connection'; reason: string }[];
  opportunities: {
    ref: string; target_event_id?: string | null; scope_kind: ScopeKind; scope_ref: string; scope_label?: string; kind: ContactInfo['contactKind'];
    direct_impact?: boolean; actors: string[]; motivation: string; knowledge: string; contact: string; establishes?: string[];
    earliest?: { day: number; minute: number } | null; latest?: { day: number; minute: number } | null; priority?: number; basis_refs?: string[]; side_job?: boolean;
    required?: boolean; required_basis?: string;
  }[];
}

/** A small job is asked for only between these times of a free day, and must be done by JOB_DONE_BY (a job asked at
 *  23:50 for the remaining ten minutes is no job). */
export const JOB_FROM = 6 * 60, JOB_UNTIL = 18 * 60, JOB_DONE_BY = 20 * 60;

/** A free day, strictly: no canon event touches the story day at all (none under way, none whose window overlaps
 *  any part of 00:00–23:59, whether it starts, ends or runs through it), and it is between JOB_FROM and JOB_UNTIL. */
export function quietDay(index: WorldIndex, tick: number): boolean {
  const st = index.state;
  if (underWayEvents(st).size) return false;
  const dayStart = Math.floor(tick / 1440) * 1440, dayEnd = dayStart + 1439;
  if (tick - dayStart < JOB_FROM || tick - dayStart >= JOB_UNTIL) return false;
  // any canon event of the day counts, also one already over or settled (live: a game started at 17:00 on a day
  // with eleven events until 14:00, all settled at the start, got a small job as if the day were free)
  return !index.pack.timeIndex.some((t) => t.lo <= dayEnd && t.hi >= dayStart);
}

/** A small job the player let lapse: offered on a quiet day, not taken by the start of the next day (pending or
 *  declined). It is over: not unanswered, not followed up, not offered again. */
export function jobLapsed(state: WorldState, c: ContactEntry, tick: number): boolean {
  if (!c.sideJob || c.expires == null || tick < c.expires) return false;
  const k = scopeKey(c.scopeKind, c.scopeRef);
  const sameThing = (id: string) => { const x = state.contacts.find((y) => y.recordId === id); return !!x && scopeKey(x.scopeKind, x.scopeRef) === k; };
  const took = state.engagements.some((e) => ['accepted', 'joined', 'limited', 'done'].includes(e.stance) && e.tick < c.expires! && (e.scopeKind === 'contact' ? sameThing(e.scopeRef) : e.seq > c.seq && scopeKey(e.scopeKind, e.scopeRef) === k));
  return !took;
}

/** Check the suggestions: real actors and scopes, nothing settled or impossible revived, the player's decisions
 *  (no way around a refusal — only harm with an actual recorded cause gets through), no repeat of an unanswered
 *  contact or of one already made. Returns the valid ones and why the others were dropped. */
export function checkOpportunities(out: IntegrateOut, index: WorldIndex, profile: PlayerProfile, candidates: Candidate[], tick: number, quiet = false): { valid: Opportunity[]; dropped: { id: string; reason: string }[] } {
  const pack = index.pack;
  const st = index.state;
  const eng = engagementView(st, pack);
  const cand = new Map(candidates.map((c) => [c.event.id, c]));
  const valid: Opportunity[] = [];
  const dropped: { id: string; reason: string }[] = [];
  const pending = unanswered(st, tick);
  for (const o of out.opportunities || []) {
    const ref = o.ref || '?';
    const named = uniq((o.actors || []).map((a) => (index.entityExists(a) ? a : index.resolveEntity(a).ids.length === 1 ? index.resolveEntity(a).ids[0] : null)).filter(Boolean) as Id[]).filter((a) => a !== profile.playerId);
    // nobody dead acts (checked against the facts, not left to the model)
    const actors = named.filter((a) => { const f = factAt(st, a, 'alive', { tick }); return !(f.known && f.value === false); });
    // a small matter may come from a minor person it introduces (a customer, a neighbour), not yet anyone in the world
    const newcomers = quiet && o.side_job && !o.target_event_id && !named.length
      ? uniq((o.actors || []).map((a) => String(a).trim()).filter((a) => a && !/^[a-z0-9._-]+$/.test(a) && !index.resolveEntity(a).ids.length)).slice(0, 3) : [];
    if (!actors.length && !newcomers.length) { dropped.push({ id: ref, reason: named.length ? 'its actors are dead' : 'no known actor' }); continue; }
    let scopeKind = o.scope_kind, scopeRef = String(o.scope_ref || '').trim();
    let label = (o.scope_label || '').trim();
    // a small matter is never about a canon event, and its matter need not exist yet (live: one pointed at a contact
    // id that does not exist and was dropped): unknown scopes become its own storyline
    if (quiet && o.side_job && !o.target_event_id) {
      const exists = scopeKind === 'event' ? pack.events.has(scopeRef) : scopeKind === 'arc' ? pack.pack.arcs.some((x) => x.id === scopeRef) : scopeKind === 'faction' ? index.entityExists(scopeRef) : scopeKind === 'contact' ? st.contacts.some((x) => x.recordId === scopeRef) : true;
      if (!exists || scopeKind === 'event' || scopeKind === 'arc') { scopeKind = 'storyline'; label ||= (o.contact || '').slice(0, 40); scopeRef = label; }
    }
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
    // what rests only on history long over that the player had no part in is not happening now (live: a year-old
    // kidnapping of the player's friend became "she has been missing since this morning")
    const old = (b: string) => {
      const oc = st.occurrences.get(b);
      if (oc) return (!!oc.undated || oc.time.hi < tick - LATELY_DAYS * 1440) && ![...oc.actors, ...oc.affected].includes(profile.playerId);
      const d = st.dispositions.get(b);
      return !!d && d.tick < tick - LATELY_DAYS * 1440;
    };
    if (!targetEventId && basisRefs.length && basisRefs.every(old)) { dropped.push({ id: ref, reason: 'it rests only on history long over that the player had no part in' }); continue; }
    const blocked = eng.blockedBy({ eventId: targetEventId, scopeKind, scopeRef, actors }, tick);
    if (blocked) {
      // only harm that already has an actual cause in history gets past a refusal
      const actualCause = basisRefs.some((b) => { const oc = st.occurrences.get(b); return !!oc && [...oc.actors, ...oc.affected].some((x) => actors.includes(x)); });
      if (!(direct && (kind === 'hostile' || consequence) && actualCause)) { dropped.push({ id: ref, reason: `the player ${blocked.stance === 'ooc_suppress' ? 'suppressed' : blocked.stance} ${blocked.scopeLabel}` }); continue; }
    }
    // a small job is its own piece of work: what is asked is part of its identity (otherwise every later request from
    // the same people would count as already made)
    const isJob = quiet && !!o.side_job && !targetEventId;
    if (!actors.length && !isJob) { dropped.push({ id: ref, reason: 'no known actor' }); continue; }
    const id = 'opp_' + sha256(`${scopeKind}|${scopeRef}|${kind}|${[...actors].sort().join(',')}${isJob ? `|${o.contact || ''}` : ''}`).slice(0, 10);
    if (st.contacts.some((x) => x.opportunityId === id)) { dropped.push({ id: ref, reason: 'already made' }); continue; }
    if (!['hostile', 'consequence'].includes(kind) && pending.some((p) => p.scopeKind === scopeKind && p.scopeRef === scopeRef)) { dropped.push({ id: ref, reason: 'an earlier contact about the same thing is unanswered' }); continue; }
    // live: all four suggestions were about the event under way, as if the player were locked into it until it ends
    if (valid.filter((v) => v.scopeKind === scopeKind && v.scopeRef === scopeRef).length >= MAX_PER_SCOPE) { dropped.push({ id: ref, reason: `more than ${MAX_PER_SCOPE} about ${label}` }); continue; }
    valid.push({
      id, scopeKind, scopeRef, scopeLabel: label, targetEventId, kind, directImpact: direct, actors,
      motivation: (o.motivation || '').slice(0, 800), knowledge: (o.knowledge || '').slice(0, 800), contact: (o.contact || '').slice(0, 800), establishes: (o.establishes || []).slice(0, 8),
      earliest, latest, priority: Math.min(3, Math.max(1, Math.round(o.priority || 2))), focus: !!c?.focus, basisRefs,
      // a side job is only for a quiet day and never about a canonical event
      ...(isJob ? { sideJob: true, latest: Math.min(latest ?? Infinity, Math.floor(tick / 1440) * 1440 + JOB_DONE_BY), ...(newcomers.length ? { newcomers } : {}) } : {}),
      // required needs a reason in the player's own position, and is never a small job
      ...(o.required && o.required_basis?.trim() && !isJob ? { required: true, requiredBasis: o.required_basis.trim().slice(0, 300) } : {}),
    });
  }
  return { valid, dropped };
}

/** The organizations of the player's that take part in a candidate event (in its entities or cast), from the members
 *  facts at the event's time. */
export function playerOrgsIn(index: WorldIndex, profile: PlayerProfile, c: Candidate, tick: number): Id[] {
  const mine = orgsOf(index, profile.playerId, Math.max(tick, c.lo));
  const there = new Set([...c.event.entity_ids, ...(c.event.cast || []).map((m) => m.entity_id)]);
  return mine.filter((o) => there.has(o));
}

/** Contacts the world must make: every event not yet settled that one of the player's organizations takes part in
 *  (decided here from the members facts, not left to the model), and those the analysis marks required with a
 *  reason. An organization event without a suggestion gets one: the organization calls the player in. Nothing the
 *  player turned down (the event, its arc, the organization) is required. */
export function withRequired(valid: Opportunity[], index: WorldIndex, profile: PlayerProfile, candidates: Candidate[], tick: number): Opportunity[] {
  const eng = engagementView(index.state, index.pack);
  const out = valid.map((o) => ({ ...o }));
  for (const c of candidates) {
    if (c.status === 'settled' || reached(index.state, { scopeKind: 'event', scopeRef: c.event.id, targetEventId: c.event.id, actors: [] })) continue;
    const orgs = playerOrgsIn(index, profile, c, tick);
    if (!orgs.length) continue;
    const org = orgs[0];
    if (eng.blockedBy({ eventId: c.event.id, scopeKind: 'faction', scopeRef: org, actors: [org] }, tick)) continue;
    const basis = `the player is a member of ${index.entityName(org)}, which takes part in ${c.event.title}`;
    const about = out.filter((o) => o.targetEventId === c.event.id || (o.scopeKind === 'event' && o.scopeRef === c.event.id));
    if (about.length) { about.sort((a, b) => Number(b.actors.includes(org)) - Number(a.actors.includes(org)) || a.priority - b.priority)[0].required = true; about[0].requiredBasis ||= basis; continue; }
    // who calls: the organization's people in the event (alive), else the organization itself
    const members = memberships(index, Math.max(tick, c.lo)).get(org) || [];
    const there = [...(c.event.cast || []).map((m) => m.entity_id), ...c.event.entity_ids].filter((x) => x !== profile.playerId && members.includes(x));
    const actors = uniq(there).slice(0, 3);
    const id = 'opp_' + sha256(`required|event|${c.event.id}|${org}`).slice(0, 10);
    if (index.state.contacts.some((x) => x.opportunityId === id)) continue;
    out.push({
      id, scopeKind: 'event', scopeRef: c.event.id, scopeLabel: c.event.title, targetEventId: c.event.id, kind: 'request', directImpact: true,
      actors: [...actors, org],
      motivation: `${index.entityName(org)} takes part in ${c.event.title} and the player is one of its members.`,
      knowledge: `They know the player as one of ${index.entityName(org)}.`,
      contact: `${actors.length ? actors.map((a) => index.entityName(a)).join(', ') : `Someone of ${index.entityName(org)}`} reach the player through ${index.entityName(org)}'s usual channel and call them in for its part in ${c.event.title}.`,
      establishes: [], earliest: null, latest: c.status === 'upcoming' ? c.lo : c.hi, priority: 1, focus: c.focus, basisRefs: [c.event.id],
      required: true, requiredBasis: basis,
    });
  }
  return out;
}

/** The suggestions still to come, as the panel lists them: not made yet, its matter not reached since the analysis,
 *  its time not passed, its event not settled; about the event the player is in only when it reaches them directly
 *  (or they marked it 优先) — the others are never offered while it runs. Live: the list of contacts not yet made
 *  showed the one the GM had just written, until the next analysis. */
export function liveSuggestions(cache: IntegrationCache | null, index: WorldIndex, tick: number, preferred: Set<string> = new Set()): (Opportunity & { current: boolean })[] {
  if (!cache) return [];
  const st = index.state;
  const since = st.contacts.filter((x) => x.tick >= cache.tick);
  const underWay = underWayEvents(st);
  const out: (Opportunity & { current: boolean })[] = [];
  for (const o of cache.opportunities) {
    if (st.contacts.some((x) => x.opportunityId === o.id) || reached(st, o, since)) continue;
    if (o.latest !== null && o.latest < tick) continue;
    if (o.targetEventId && st.dispositions.has(o.targetEventId)) continue;
    const current = aboutUnderWay(o, index, underWay);
    if (current && !o.directImpact && !preferred.has(`${o.scopeKind}:${o.scopeRef}`)) continue;
    out.push({ ...o, current });
  }
  return out;
}

/** Whether a contact already reached the player about a matter: about its event or scope, or by its people. */
export function reached(st: WorldState, o: Pick<Opportunity, 'scopeKind' | 'scopeRef' | 'targetEventId' | 'actors'>, contacts: Pick<ContactInfo, 'scopeKind' | 'scopeRef' | 'actors'>[] = st.contacts): boolean {
  return contacts.some((x) => (x.scopeKind === o.scopeKind && x.scopeRef === o.scopeRef) || (!!o.targetEventId && x.scopeKind === 'event' && x.scopeRef === o.targetEventId)
    || (x.scopeKind === 'faction' && o.actors.includes(x.scopeRef)));
}

/** The required contacts this reply must make: not made yet (no contact about the matter since it was suggested), its
 *  event not settled, not turned down since, and due — its event begins within INTEGRATION_LEAD_MINUTES (or the time
 *  jump crosses it). */
export function dueRequired(cache: IntegrationCache | null, index: WorldIndex, tick: number, jumpTo: number | null = null): Opportunity[] {
  if (!cache) return [];
  const eng = engagementView(index.state, index.pack);
  const until = Math.max(tick + INTEGRATION_LEAD_MINUTES, jumpTo ?? 0);
  return cache.opportunities.filter((o) => {
    if (!o.required) return false;
    if (o.latest !== null && o.latest < tick) return false;
    if (o.targetEventId && index.state.dispositions.has(o.targetEventId)) return false;
    const t = o.targetEventId ? index.pack.timeIndex.find((x) => x.id === o.targetEventId) : null;
    if (t && t.lo > until) return false;
    if (index.state.contacts.some((x) => x.opportunityId === o.id) || reached(index.state, o)) return false;
    return !eng.blockedBy({ eventId: o.targetEventId, scopeKind: o.scopeKind, scopeRef: o.scopeRef, actors: o.actors }, tick);
  });
}

export function requiredSection(index: WorldIndex, list: Opportunity[], origin: { y: number; m: number; d: number } | null): string {
  if (!list.length) return '';
  const lines = list.map((o) => {
    const t = o.targetEventId ? index.pack.timeIndex.find((x) => x.id === o.targetEventId) : null;
    return `- ${opportunityBy(index, o).join(', ')}: ${o.contact} Why it must reach them: ${o.requiredBasis || o.motivation}. What they know about the player: ${o.knowledge}${t ? ` ${o.scopeLabel} begins ${formatTick(t.lo, origin)}.` : ''}`;
  });
  return `WORLD REACTION — REQUIRED (the player's own position binds them to this; it reaches them in THIS reply, wherever they are and whatever they are doing: a call, a message or someone arriving. Bring it after what the player does in this reply; when the matter begins before that would end, it interrupts. Keep everyone in character; whether and how the player answers or goes is up to the player — never decide it for them):\n${lines.join('\n')}`;
}

/** At most one new contact for this reply: one that can happen now, not in a busy scene (an event under way
 *  admits only direct impacts); 关注 first, then direct impacts, priority and time. The policy is checked again
 *  against the current decisions (a cached suggestion may predate a refusal). */
/** Suggestions kept about one matter: the rest of the list goes to other ways into the story. */
export const MAX_PER_SCOPE = 2;

/** Events under way right now (begun in play, not yet settled). */
export function underWayEvents(st: WorldState): Set<Id> {
  return new Set([...st.occurrences.values()].map((o) => o.inProgressOf).filter((x): x is Id => !!x && !st.dispositions.has(x)));
}

/** A suggestion about an event under way (or its storyline): the player is already in it. */
export function aboutUnderWay(o: Pick<Opportunity, 'targetEventId' | 'scopeKind' | 'scopeRef'>, index: WorldIndex, underWay: Set<Id>): boolean {
  if (o.targetEventId && underWay.has(o.targetEventId)) return true;
  if (o.scopeKind === 'event') return underWay.has(o.scopeRef);
  if (o.scopeKind === 'arc') return [...underWay].some((id) => index.pack.events.get(id)?.arc_id === o.scopeRef);
  return false;
}

export function selectOpportunity(cache: IntegrationCache | null, index: WorldIndex, tick: number, busy: boolean, preferred: Set<string> = new Set()): Opportunity | null {
  if (!cache) return null;
  const eng = engagementView(index.state, index.pack);
  const pending = unanswered(index.state, tick);
  const ok = cache.opportunities.filter((o) => {
    if (o.required) return false;
    if (o.latest !== null && o.latest < tick) return false;
    if (o.earliest !== null && o.earliest > tick + OFFER_SOON_MINUTES) return false;
    // in the middle of an event only what already reaches the player — or a matter the player marked 优先
    if (busy && !o.directImpact && !preferred.has(`${o.scopeKind}:${o.scopeRef}`)) return false;
    if (index.state.contacts.some((x) => x.opportunityId === o.id)) return false;
    if (!['hostile', 'consequence'].includes(o.kind) && pending.some((p) => p.scopeKind === o.scopeKind && p.scopeRef === o.scopeRef)) return false;
    const blocked = eng.blockedBy({ eventId: o.targetEventId, scopeKind: o.scopeKind, scopeRef: o.scopeRef, actors: o.actors }, tick);
    if (blocked && !(o.directImpact && (o.kind === 'hostile' || o.kind === 'consequence') && o.basisRefs.some((b) => index.state.occurrences.has(b)))) return false;
    return true;
  });
  const pref = (o: Opportunity) => Number(preferred.has(`${o.scopeKind}:${o.scopeRef}`));
  ok.sort((a, b) => pref(b) - pref(a) || Number(b.focus) - Number(a.focus) || Number(!!b.sideJob) - Number(!!a.sideJob) || Number(b.directImpact) - Number(a.directImpact) || a.priority - b.priority || (a.earliest ?? tick) - (b.earliest ?? tick));
  return ok[0] || null;
}

/** What the analysis depends on: the profile, the player's decisions and contacts, the candidate events and their
 *  state, the 关注 list, a time jump, the player's lasting state, and actual history linking the player to the
 *  candidates' people. Ordinary turns with none of these changing reuse the cached result. */
export function integrationKey(index: WorldIndex, profile: PlayerProfile, candidates: Candidate[], focus: Id[], jumpTo: number | null, quiet = false): string {
  const people = new Set(candidates.flatMap((c) => c.event.entity_ids));
  const mine = new Set(playerIds(profile));
  const linkOccs = [...index.state.occurrences.values()].filter((o) => {
    const all = [...o.actors, ...o.affected, ...o.locations];
    return all.some((x) => mine.has(x)) && (all.some((x) => people.has(x)) || o.packEventId);
  }).map((o) => o.occurrenceId).sort();
  return hashObject({
    v: 1, p: profile.personaHash, ids: [...mine], t: index.state.ties.map((x) => x.recordId),
    c: candidates.map((c) => `${c.event.id}:${c.status}:${index.inProgressBeats(c.event.id).length}`),
    e: index.state.engagements.map((e) => e.recordId), k: index.state.contacts.map((c) => c.recordId),
    f: [...focus].sort(), j: jumpTo ?? null, o: linkOccs, ...(quiet ? { q: Math.floor(index.state.clock.lo / 1440) } : {}),
    s: playerIds(profile).map((id) => factAt(index.state, id, 'exists', { tick: Number.MAX_SAFE_INTEGER }).value ?? null),
  });
}

// ---------------------------------------------------------------------------------------------
// GM context sections

export function natureText(n: PlayerNature): string {
  return (['habits', 'uses', 'others', 'limits'] as const).filter((k) => n[k]).map((k) => `${k}: ${n[k]}`).join(' | ');
}

export function presenceSection(index: WorldIndex, profile: PlayerProfile, tick: number): string {
  profile = playedProfile(index, profile);
  const lines = [`PLAYER IN THIS WORLD (from the player's Persona and actual play — the Persona describes the player at the start of this game, and what happened in play since overrides it; the public identity is what anyone may know — famous things (an esper's level and ability, a reputation) even strangers, personal details only people who would plausibly know them; beyond it, people know about the player only as listed):`];
  lines.push(`- ${profile.personaName} [${profile.playerId}] (the player character): ${profile.summary || '(no summary)'}${profile.publicIdentity ? ` Public identity: ${profile.publicIdentity}` : ''}${factsLine(index, profile.playerId, tick)}`);
  for (const o of playerOrgs(index, profile, tick)) lines.push(`- organization: ${o.name} [${o.id}] — now ${STANDING[o.standing]}${o.leads ? ', its leader' : ''}${o.role ? `; the Persona's words at the start: ${o.role}` : ''} (${o.secrecy})${factsLine(index, o.id, tick)}`);
  for (const p of profile.places) lines.push(`- place: ${nameIn(index, p.entityId, p.name)} [${p.entityId}] — ${p.use}${factsLine(index, p.entityId, tick)}`);
  if (profile.capabilities.length || profile.resources.length) lines.push(`- can/has: ${[...profile.capabilities, ...profile.resources].slice(0, 10).join('; ')}`);
  if (profile.roles?.length) lines.push(`- roles: ${profile.roles.map((r) => `${r.role}${r.brings.length || r.from.length ? ` (${[r.brings.join(', '), r.from.length ? `from ${r.from.join(', ')}` : ''].filter(Boolean).join('; ')})` : ''}`).join(' | ')}`);
  if (profile.notSuited?.length) lines.push(`- does not take on: ${profile.notSuited.join('; ')}`);
  if (profile.voice) lines.push(`- how they come across and talk (write the player character's lines and reactions this way): ${profile.voice}`);
  if (profile.nature) lines.push(`- 常态 (how their own power or condition shows in everyday moments — background, not story; signs that show by themselves may be written like a reaction, a deliberate use only as the player-character rules allow): ${natureText(profile.nature)}`);
  for (const r of byChange(profile.relationships).slice(0, 16)) lines.push(`- connection: ${r.name}${r.entityId ? ` [${r.entityId}]` : ''} — ${r.ended ? 'ENDED: ' : ''}${r.relation} (${tieSource(r)})${r.entityId ? factsLine(index, r.entityId, tick, 300) : ''}`);
  for (const k of byChange(profile.knowers).slice(0, 16)) lines.push(`- who knows: ${k.who} ${LEVEL[k.level]}${k.level === 'secrets' ? ':' : ' —'} ${k.about} (${tieSource(k)})`);
  return lines.join('\n');
}

/** Ties play changed first (the latest on top), then the Persona's. */
function byChange<T extends { changed?: TieChange }>(xs: T[]): T[] {
  return [...xs.filter((x) => x.changed).sort((a, b) => b.changed!.since - a.changed!.since), ...xs.filter((x) => !x.changed)];
}
function tieSource(x: { basis: PlayerProfile['knowers'][number]['basis']; changed?: TieChange }): string {
  const from = { persona_stated: 'Persona', implied: 'implied by the role', play: 'from play', ui: 'set by the user' }[x.basis];
  if (!x.changed || x.basis === 'play' || x.basis === 'ui') return x.changed ? `${from}, since ${formatTick(x.changed.since)}` : from;
  return `as it stands since ${formatTick(x.changed.since)} in play; ${from} at the start: ${x.changed.start}`;
}

export function decisionsSection(lines: string[]): string {
  return lines.length ? `PLAYER'S DECISIONS (binding; from the player's own words or actions — they decide what they get drawn into):\n${lines.map((l) => '- ' + l).join('\n')}` : '';
}

/** Who brings a suggestion: its actors, and for a small matter the minor people it introduces. */
export function opportunityBy(index: WorldIndex, o: Opportunity): string[] {
  return [...o.actors.map((a) => index.entityName(a)), ...(o.newcomers || [])];
}

export function worldReactionSection(index: WorldIndex, o: Opportunity, origin: { y: number; m: number; d: number } | null): string {
  const who = opportunityBy(index, o).join(', ');
  const when = o.earliest !== null ? ` It can happen from ${formatTick(o.earliest, origin)}${o.latest !== null ? ` until ${formatTick(o.latest, origin)}` : ''}; if this reply ends before then, it has not happened yet.` : '';
  const head = o.sideJob
    ? 'WORLD REACTION (optional: a small matter the player may take up today. It does not mean the player is free today — their own plans and the current scene come first. Bring it in only at a natural pause or change of scene; never interrupt a private, intimate or continuous scene with it (no message, call or knock arriving mid-scene); if it does not fit this reply, leave it out without comment — it stays available for later today. NOT history; keep everyone in character; whether and when to look at it or answer it is up to the player: a message may simply arrive and stay unanswered)'
    : 'WORLD REACTION (optional for this reply — NOT history; use it only if it fits the scene and its time; never interrupt a private, intimate or continuous scene with it; keep everyone in character and leave the player\'s answer to the player; not using it is fine, without comment)';
  return `${head}:\n- ${who}: ${o.contact} Why: ${o.motivation} What they know about the player: ${o.knowledge}${o.establishes.length ? ` May establish: ${o.establishes.join('; ')}.` : ''}${when}`;
}

/** Records for the player's decisions from an extract_user statement (scope checked against the pack/state). */
export function engagementRecord(s0: { stance?: string | null; scope_kind?: string | null; scope_ref?: string | null; scope_label?: string | null; until?: { day: number; minute: number } | null; quote: string; summary: string }, index: WorldIndex, tick: number, src: RecordDraft['sourceRefs']): RecordDraft | null {
  let s = s0;
  const stance = s.stance as EngagementInfo['stance'];
  if (!stance || !['declined', 'deferred', 'accepted', 'joined', 'limited', 'ooc_suppress', 'reopened', 'answered', 'refused'].includes(stance)) return null;
  // an answer belongs to the question asked (a contact); a decision on one contact is named by who asked what
  const answer = stance === 'answered' || stance === 'refused';
  const asked = s.scope_kind === 'contact' ? index.state.contacts.find((x) => x.recordId === String(s.scope_ref || '').trim()) : undefined;
  if (answer && !asked) return null;
  if (asked) s = { ...s, scope_label: `${asked.actors.map((a) => index.entityName(a)).join(', ') || asked.scopeLabel}: “${asked.quote.slice(0, 120)}”` };
  let kind = (s.scope_kind || '') as ScopeKind;
  if (answer && kind !== 'contact') return null;
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

// ---------------------------------------------------------------------------------------------
// Recognition: who in the scene knows about the player (user design: secrets stay with the listed knowers; public
// standing is shown generously — the player plays to be someone, and a famous character nobody recognizes is a letdown)

export interface RecognitionGroup { key: string; who: string; level: 'public' | 'identity' | 'secrets'; about: string; personId: Id | null; orgId: Id | null; places: Id[]; everywhere: boolean }

/** The groups and people who know about the player: public recognition first, then the knowers (who know more than
 *  the public identity). "exists" knowers do not know the player and are left out. */
export function recognitionGroups(index: WorldIndex, profile: PlayerProfile): RecognitionGroup[] {
  profile = playedProfile(index, profile);
  const out: RecognitionGroup[] = [];
  for (const r of profile.recognizedBy || []) out.push({ key: r.who, who: r.who, level: 'public', about: r.as, personId: null, orgId: r.orgId, places: r.places, everywhere: r.everywhere });
  for (const k of profile.knowers) {
    if (k.level === 'exists') continue;
    const kind = k.entityId ? index.entityKind(k.entityId) : null;
    out.push({
      key: k.who, who: k.who, level: k.level, about: k.about, personId: kind === 'person' ? k.entityId : null,
      orgId: k.entityId && kind !== 'person' && kind !== 'place' ? k.entityId : null,
      places: uniq([...(k.places || []), ...(k.entityId && kind === 'place' ? [k.entityId] : [])]), everywhere: false,
    });
  }
  const seen = new Set<string>();
  return out.filter((g) => !seen.has(g.key) && !!seen.add(g.key)).slice(0, 20);
}

/** Which of them are in the scene, and why: known everywhere; a listed person present; members of their organization
 *  present; at one of their places; or the analysis saw them there (reported: group keys). */
export function presentGroups(index: WorldIndex, profile: PlayerProfile, tick: number, sceneIds: Id[], reported: string[]): { g: RecognitionGroup; why: string[] }[] {
  const scene = new Set(sceneIds.filter((x) => x !== profile.playerId));
  const members = memberships(index, tick);
  const out: { g: RecognitionGroup; why: string[] }[] = [];
  for (const g of recognitionGroups(index, profile)) {
    const why: string[] = [];
    if (g.everywhere) why.push('known everywhere — strangers too, wherever the scene has people');
    if (g.personId && scene.has(g.personId)) why.push('present');
    if (g.orgId) {
      const ms = (members.get(g.orgId) || []).filter((m) => scene.has(m));
      if (ms.length) why.push(`${ms.map((m) => index.entityName(m)).join(', ')} ${ms.length > 1 ? 'are' : 'is'} one of them`);
      else if (scene.has(g.orgId)) why.push('their organization is in the scene');
    }
    const at = g.places.filter((p) => scene.has(p));
    if (at.length) why.push(`at ${at.map((p) => index.entityName(p)).join(', ')}`);
    if (!why.length && reported.includes(g.key)) why.push('in the scene');
    if (why.length) out.push({ g, why });
  }
  return out;
}

export function recognitionSection(present: { g: RecognitionGroup; why: string[] }[]): string {
  if (!present.length) return '';
  const lines = present.map(({ g, why }) => g.level === 'public'
    ? `- ${g.who} (${why.join('; ')}) recognize the player on sight as: ${g.about}. Public standing — show it: wherever people of this group are around, they notice the player and react as such people would (greet, stare, make way, whisper, take a photo, ask for something) — at least once in each scene with such people, more when it matters; vary it and do not repeat the same beat within a scene. Not the player's secrets.`
    : g.level === 'secrets'
      ? `- ${g.who} (${why.join('; ')}) know (secret): ${g.about}. Only they know; they keep it out of others' hearing.`
      : `- ${g.who} (${why.join('; ')}) know who the player is: ${g.about}. They act on it; others here do not learn it from them unless the story shows it.`);
  return `RECOGNITION IN THIS SCENE (from the player's Persona and what people learned in play; people listed here know this — they never act as if they did not, unless the scene gives a reason such as a disguise):\n${lines.join('\n')}`;
}

/** Group ids of a task's answer ("g1"…) back to their names; null stays null (the scene does not move). */
export function groupNames(groups: RecognitionGroup[], ids: string[] | null): string[] | null {
  if (ids === null) return null;
  return uniq(ids.map((id) => groups[Number(String(id).replace(/^g/, '')) - 1]?.key).filter(Boolean) as string[]);
}

// ---------------------------------------------------------------------------------------------
// Companions' next events: someone with the player takes part in a canon event soon (user design 2026-11-03). What
// they know in advance they bring up (they have to go, or ask the player along — the player decides); what comes
// without warning (a chance encounter) happens to them and the player together, unless the player declined it.

export const COMPANION_HORIZON_MINUTES = 180;

export interface CompanionEvent { personId: Id; event: PackEvent; lo: number; hi: number; declined: boolean }

/** Canon events starting within the horizon (or open now and not begun) that people in the scene take part in. */
export function companionEvents(index: WorldIndex, sceneIds: Id[], playerId: Id | null, tick: number): CompanionEvent[] {
  const st = index.state;
  const pack = index.pack;
  const people = uniq(sceneIds).filter((x) => x !== playerId && index.entityKind(x) === 'person');
  if (!people.length) return [];
  const underWay = underWayEvents(st);
  const eng = engagementView(st, pack);
  const out: CompanionEvent[] = [];
  for (const t of pack.timeIndex) {
    if (t.lo > tick + COMPANION_HORIZON_MINUTES) break;
    if (t.hi < tick || st.dispositions.has(t.id) || underWay.has(t.id)) continue;
    const ev = pack.events.get(t.id)!;
    if (triLabel(evalCondition(ev.canonical_preconditions, st, pack, { tick: Math.max(t.lo, tick) })) === 'FALSE') continue;
    for (const p of people) {
      if (!ev.entity_ids.includes(p)) continue;
      out.push({ personId: p, event: ev, lo: t.lo, hi: t.hi, declined: !!eng.blockedBy({ eventId: ev.id }, tick) });
    }
    if (out.length >= 6) break;
  }
  return out;
}

export const foreknowKey = (c: CompanionEvent) => `${c.event.id}|${c.personId}`;

export function companionSection(index: WorldIndex, list: CompanionEvent[], known: Record<string, { knows: boolean; how: string }>, tick: number, origin: { y: number; m: number; d: number } | null, causeOf: (ev: PackEvent) => string): string {
  if (!list.length) return '';
  const lines = list.map((c) => {
    const who = index.entityName(c.personId);
    const k = known[foreknowKey(c)];
    const when = c.lo > tick ? `starts ${formatTick(c.lo, origin)} (in ${Math.max(1, Math.round((c.lo - tick) / 60 * 10) / 10)} h)` : `can start now (until ${formatTick(c.hi, origin)})`;
    const head = `- ${who} — 「${c.event.title}」 [${c.event.id}] (${c.event.classification}) ${when}: ${causeOf(c.event)}`;
    const hard = c.event.classification === 'HARD' ? ' It must happen (HARD).' : '';
    if (c.declined) return `${head}\n  The player declined to take part in it: ${who} leaves at a natural moment before it, or it happens to ${who} after they part; do not pull the player in.${hard}`;
    if (k?.knows) return `${head}\n  ${who} knows this in advance (${k.how || 'planned'}): before it starts, ${who} brings it up in character — has to go, or asks the player to come along. Whether the player goes is the player's choice; if the player keeps ${who} with them, that is their choice too.${hard}`;
    if (k && !k.knows) return `${head}\n  ${who} does NOT know this in advance (${k.how || 'comes without warning'}): ${who} stays with the player — no leaving or wandering off without a reason, nothing foreshadows it — and when the time comes it happens to both of them together, where they are (its people come to them).${hard}`;
    return `${head}\n  If ${who} would know it in advance, ${who} brings it up before it starts (has to go, or asks the player along — the player decides); if it comes without warning, ${who} stays with the player and it happens to both of them together, where they are.${hard}`;
  });
  return `COMPANIONS' NEXT EVENTS (people with the player now who take part in a canon event soon — this overrides "do not steer" for them):\n${lines.join('\n')}`;
}
