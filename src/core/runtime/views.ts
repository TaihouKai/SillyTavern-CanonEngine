// What the timeline window's 组织成员 and 常态 views show, worked out from a world index and the story time. The engine
// calls these for the game in play; anything else holding a world (a pack's canon replayed to a time) calls them too.
import type { Id, MindProfile, NatureVersion } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { factAt } from '../domain/reducer';
import { effectTarget, effectToDelta } from '../domain/delta';
import { agoLabel, formatTick } from '../domain/time';
import { memberships } from './integration';

type Origin = { y: number; m: number; d: number } | null;
export interface MembershipView {
  now: { id: Id; name: string; leader: string | null; members: string[]; status: string | null; statusSince: string | null }[];
  changes: { when: string; event: string; org: string; what: 'members' | 'leader'; op: 'set' | 'unset' | 'add' | 'remove'; names: string[]; state: 'occurred' | 'diverged' | 'pending' | 'future' }[];
  hidden: number;
}
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
 *  (the player character first) are listed like the pack's. */
export function natureView(idx: WorldIndex, spoilers: boolean, player?: Id | null): NatureViewData {
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
