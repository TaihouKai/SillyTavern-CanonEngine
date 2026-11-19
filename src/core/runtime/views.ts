// What the timeline window's 组织成员 and 常态 views show, worked out from a world index and the story time. The engine
// calls these for the game in play; anything else holding a world (a pack's canon replayed to a time) calls them too.
import type { AddressForm, Id, MindProfile, NatureVersion, RelationView } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { factAt } from '../domain/reducer';
import { effectTarget, effectToDelta } from '../domain/delta';
import { agoLabel, formatTick } from '../domain/time';
import { memberships } from './integration';
import { pairKey } from '../domain/pack';
import { fightNow, linksOf, statusesOf, styleOf } from '../domain/combat-state';

type Origin = { y: number; m: number; d: number } | null;
export interface MembershipView {
  now: { id: Id; name: string; leader: string | null; members: string[]; status: string | null; statusSince: string | null }[];
  changes: { when: string; event: string; org: string; what: 'members' | 'leader'; op: 'set' | 'unset' | 'add' | 'remove'; names: string[]; state: 'occurred' | 'diverged' | 'pending' | 'future' }[];
  hidden: number;
}
/** A relation in force, as a person's 常态 view lists it: with whom, what they are, each side, since when. */
export interface NatureViewData {
  people: { id: Id; name: string; player?: boolean; mind?: MindProfile; versions: (NatureVersion & { from: string | null; until: string | null; state: 'now' | 'ended' | 'later' })[] }[];
  hidden: number;
}

/** Organizations at `tick` (leader, members, status and how old it is) and the pack's membership changes; the ones
 *  still to come only with spoilers. */
export function membershipView(idx: WorldIndex, tick: number, origin: Origin, spoilers: boolean): MembershipView {
  const s = idx.state, pack = idx.pack;
  const members = memberships(idx, tick);
  const str = (id: Id, p: string) => { const f = factAt(s, id, p, { tick }); return f.known && typeof f.value === 'string' ? f.value : null; };
  const orgs = [...new Set([...pack.entities.values()].filter((e) => e.kind === 'organization').map((e) => e.id).concat([...s.runtimeEntities.values()].filter((e) => e.kind === 'organization').map((e) => e.id)))];
  const now = orgs.map((id) => {
    const leader = str(id, 'leader');
    // a status holds until another is written: when it was written shows how old it is
    const st = factAt(s, id, 'status', { tick });
    const status = st.known && typeof st.value === 'string' ? st.value : null;
    return { id, name: idx.entityName(id), leader: leader ? idx.entityName(leader) : null, members: (members.get(id) || []).map((m) => idx.entityName(m)), status, statusSince: status && st.validFrom !== undefined ? `${formatTick(st.validFrom, origin)}, ${agoLabel(st.validFrom, tick)}` : null };
  }).filter((o) => o.leader || o.members.length || o.status);
  const changes: MembershipView['changes'] = [];
  let hidden = 0;
  for (const t of pack.timeIndex) {
    const ev = pack.events.get(t.id)!;
    const fx = ev.canonical_effects.filter((x) => ['members', 'leader'].includes(effectTarget(x).predicate));
    if (!fx.length) continue;
    const d = s.dispositions.get(t.id)?.disposition;
    const state = d === 'occurred' ? 'occurred' : d === 'diverged' ? 'diverged' : t.hi < tick ? 'pending' : 'future';
    if (state === 'future' && !spoilers) { hidden += fx.length; continue; }
    for (const x of fx) {
      const d = effectToDelta(x);
      changes.push({ when: formatTick(t.lo, origin), event: ev.title, org: idx.entityName(d.entity_id), what: d.predicate as 'members' | 'leader', op: d.op, names: d.op === 'unset' ? [] : [d.value].flat().map((m) => idx.entityName(String(m))), state } as MembershipView['changes'][number]);
    }
  }
  return { now, changes, hidden };
}

/** 常态 of the people: each version with how it stands (in force now, ended, or not reached). A version not reached
 *  starts at an event still to come: a canon spoiler, shown only with spoilers on. The people the story brought in
 *  (the player character first) are listed like the pack's. With them, their relations in force in this game (the
 *  ones still to come are not shown: they are spoilers and change with play). */
export function natureView(idx: WorldIndex, spoilers: boolean, player?: Id | null, origin: Origin = null): NatureViewData {
  const s = idx.state;
  const title = (e?: Id | null) => (e ? idx.pack.events.get(e)?.title || e : null);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  let hidden = 0;
  const all = [...[...s.runtimeEntities.values()].sort((a, b) => Number(b.id === player) - Number(a.id === player)), ...idx.pack.entities.values()] as { id: Id; name: string; nature?: NatureVersion[]; mind?: MindProfile }[];
  const people: NatureViewData['people'] = all.filter((e) => e.nature?.length || e.mind).map((e) => {
    const nowAt = idx.natureNow(e.id)?.index ?? -1;
    const versions = (e.nature || []).map((v, i) => ({ ...v, from: title(v.from_event), until: title(v.until_event),
      state: (i === nowAt ? 'now' : i === 0 || occurred(v.from_event) ? 'ended' : 'later') as 'now' | 'ended' | 'later' }))
      .filter((v) => { if (v.state === 'later' && !spoilers) { hidden++; return false; } return true; });
    return { id: e.id, name: e.name, ...(e.id === player ? { player: true } : {}), ...(e.mind ? { mind: e.mind } : {}), versions };
  });
  return { people, hidden };
}

/** 角色关系 as the timeline window shows them, one row a relation: every pair this game knows of (the pack's and those
 *  play or the Persona made) with the relation in force now; with spoilers also the original story's stages whose
 *  events are still to come, and the pairs who have not met yet. */
export interface RelationSide { address?: AddressForm[]; sees: string }
export interface RelationsViewData {
  rows: { a: string; b: string; player?: boolean; state: 'now' | 'later'; when: string | null; source?: 'pack' | 'persona' | 'play' | 'ui' | 'event'; bond: string; ended?: boolean; ab?: RelationSide; ba?: RelationSide; together?: string }[];
  hidden: number;
}
export function relationsView(idx: WorldIndex, spoilers: boolean, player?: Id | null, origin: Origin = null): RelationsViewData {
  const s = idx.state;
  const title = (e?: Id | null) => (e ? idx.pack.events.get(e)?.title || e : null);
  const keys = new Map<string, [Id, Id]>();
  for (const [k, r] of idx.pack.relations) keys.set(k, r.people);
  for (const c of s.relations) keys.set(pairKey(c.people[0], c.people[1]), c.people);
  const sides = (a: Id, vs: RelationView[]) => {
    const one = (v?: RelationView) => (v ? { ...(v.address?.length ? { address: v.address } : {}), sees: v.sees } : undefined);
    const ab = one(vs.find((v) => v.who === a)), ba = one(vs.find((v) => v.who !== a));
    return { ...(ab ? { ab } : {}), ...(ba ? { ba } : {}) };
  };
  let hidden = 0;
  const rows: RelationsViewData['rows'] = [];
  for (const [k, [a, b]] of keys) {
    const base = { a: idx.entityName(a), b: idx.entityName(b), ...(a === player || b === player ? { player: true } : {}) };
    const rel = idx.relationNow(a, b);
    if (rel) rows.push({ ...base, state: 'now', when: rel.since === null ? null : formatTick(rel.since, origin), source: rel.source, bond: rel.bond, ...(rel.ended ? { ended: true } : {}), ...sides(a, rel.views), ...(rel.together ? { together: rel.together } : {}) });
    (idx.pack.relations.get(k)?.stages || []).forEach((st, i) => {
      // (an event that went otherwise or did not happen brings no stage of the original story: it is not to come)
      if (st.from_event === null ? i === 0 : s.dispositions.has(st.from_event)) return;
      if (!spoilers) { hidden++; return; }
      rows.push({ ...base, state: 'later', when: title(st.from_event), bond: st.bond, ...sides(a, st.views), ...(st.together ? { together: st.together } : {}) });
    });
  }
  const rank = (r: RelationsViewData['rows'][number]) => Number(!r.player) * 2 + Number(r.state === 'later');
  rows.sort((x, y) => Number(!x.player) - Number(!y.player) || (x.a + x.b).localeCompare(y.a + y.b, 'zh') || rank(x) - rank(y));
  return { rows, hidden };
}

/** 战斗 as the timeline window shows it: the pack's basis (or why it has none), the fight now, the last rulings, and
 *  each person's states, 对抗倾向 and what they are linked to now (the people in the fight and the player first; the
 *  pack's versions still to come are left out, counted). */
export interface CombatViewData {
  none: string | null; basis: string;
  fight: { ongoing: boolean; people: { id: Id; name: string }[]; source: string | null; since: string | null };
  rulings: { when: string; exchanges: { who: string; text: string; basis: string[]; unsupported?: boolean }[]; stopped: { quote: string; why: string; basis: string[] }[]; states: string[]; stands: string[]; over: boolean; overWhy: string; stopAt: string; filled: string[]; notes: string[] }[];
  people: { id: Id; name: string; player?: boolean; fighting?: boolean; states: { text: string; count: number | null; until: string; source: string }[]; style: { start: string; force: string; response: string; limit: string; stop: string; source: string } | null; links: { node: string; name: string; kind: string; label: string; source: string }[] }[];
  hidden: number;
}
export function combatView(idx: WorldIndex, spoilers: boolean, player: Id | null | undefined, origin: Origin, rulings: { tick: number; ruling: import('./combat').Ruling }[]): CombatViewData {
  const L = idx.pack, s = idx.state, tick = s.clock.lo;
  const name = (id: Id) => idx.entityName(id);
  const f = fightNow(s);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  let hidden = 0;
  const ids = new Set<Id>([...(player ? [player] : []), ...f.participants, ...s.statuses.map((x) => x.entity), ...s.styles.map((x) => x.entity), ...s.combatLinks.map((x) => x.entity), ...L.combat.linksFrom.keys()].filter((x) => idx.entityExists(x)));
  for (const e of L.pack.entities) if (e.kind === 'person' && e.combat_style) ids.add(e.id);
  for (const l of L.pack.combat.links || []) if (L.entities.has(l.from) && l.from_event && !occurred(l.from_event) && !s.dispositions.has(l.from_event)) { if (!spoilers) hidden++; }
  const people: CombatViewData['people'] = [...ids].map((id) => {
    const style = styleOf(L, s, id);
    return {
      id, name: name(id), ...(id === player ? { player: true } : {}), ...(f.ongoing && f.participants.includes(id) ? { fighting: true } : {}),
      states: statusesOf(s, id, tick).map((x) => ({ text: x.text, count: x.count ?? null, until: x.endsAt ? formatTick(x.endsAt, origin) : x.until && x.until !== 'lasting' && 'event' in x.until ? (L.events.get(x.until.event)?.title || x.until.event) : '', source: x.source })),
      style: style ? { ...style.style, source: style.source } : null,
      links: linksOf(L, s, id, tick).map((l) => ({ node: l.node, name: L.combat.nodes.get(l.node)?.name || l.node, kind: L.combat.nodes.get(l.node)?.kind || '', label: l.label, source: l.source })),
    };
  }).filter((p) => p.player || p.fighting || p.states.length || p.style || p.links.length);
  people.sort((a, b) => Number(!!b.fighting) - Number(!!a.fighting) || Number(!!b.player) - Number(!!a.player) || Number(b.states.length > 0) - Number(a.states.length > 0) || a.name.localeCompare(b.name, 'zh'));
  return {
    none: L.combat.none, basis: L.combat.basis,
    fight: { ongoing: f.ongoing, people: f.participants.filter((x) => idx.entityExists(x)).map((id) => ({ id, name: name(id) })), source: f.source, since: f.since === null ? null : formatTick(f.since, origin) },
    rulings: rulings.slice(-5).reverse().map(({ tick: t, ruling: r }) => ({
      when: formatTick(t, origin),
      exchanges: r.exchanges.map((x) => ({ who: name(x.actor), text: x.text, basis: x.basis.map((b) => (L.combat.nodes.get(b.ref)?.name || b.ref) + (b.quote ? `「${b.quote}」` : '')), ...(x.unsupported ? { unsupported: true } : {}) })),
      stopped: (r.outcomes || []).filter((o) => !o.stands).map((o) => ({ quote: o.quote, why: o.why, basis: o.basis.map((b) => (L.combat.nodes.get(b.ref)?.name || b.ref) + (b.quote ? `「${b.quote}」` : '')) })),
      states: r.statuses.map((x) => `${name(x.entity)}：${x.removed ? '−' : ''}${x.text}${x.count != null ? ` ×${x.count}` : ''}`),
      stands: r.stands, over: r.over, overWhy: r.overWhy, stopAt: r.stopAt,
      filled: [...r.filled.links.map((l) => `${name(l.entity)} → ${L.combat.nodes.get(l.node)?.name || l.node}`), ...r.filled.styles.map((x) => `${name(x.entity)}：对抗倾向`)],
      notes: r.notes,
    })),
    people, hidden,
  };
}
