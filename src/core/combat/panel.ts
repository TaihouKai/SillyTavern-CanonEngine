// 战斗 in the timeline window: what it shows (the pack's basis, the fight now, the last rulings, each person's states,
// 对抗倾向 and links) and the records its buttons make (the fight on or off, a state, a 对抗倾向).
import type { Id, StoryTime } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { formatTick } from '../domain/time';
import { uniq } from '../domain/util';
import type { RecordDraft } from '../runtime/types';
import { fightNow, linksOf, statusesOf, styleOf } from './state';
import type { Ruling } from './judge';
import { combatRecord } from './record';

type Origin = { y: number; m: number; d: number } | null;

/** 战斗 as the timeline window shows it: the pack's basis (or why it has none), the fight now, the last rulings, and
 *  each person's states, 对抗倾向 and what they are linked to now (the people in the fight and the player first; the
 *  pack's versions still to come are left out, counted). */
export interface CombatViewData {
  none: string | null; basis: string;
  fight: { ongoing: boolean; people: { id: Id; name: string }[]; source: string | null; since: string | null };
  rulings: { when: string; exchanges: { who: string; text: string; basis: string[]; unsupported?: boolean }[]; stopped: { quote: string; why: string; basis: string[] }[]; states: string[]; stands: string[]; joined: string[]; over: boolean; overWhy: string; stopAt: string; filled: string[]; notes: string[] }[];
  people: { id: Id; name: string; player?: boolean; fighting?: boolean; /** fighting, the player, with states, or changed in this game (the rest only when searched for). */ relevant: boolean; states: { text: string; count: number | null; until: string; source: string }[]; style: { start: string; force: string; response: string; limit: string; stop: string; source: string } | null; links: { node: string; name: string; kind: string; label: string; source: string }[] }[];
  hidden: number;
}
export function combatView(idx: WorldIndex, spoilers: boolean, player: Id | null | undefined, origin: Origin, rulings: { tick: number; ruling: Ruling }[]): CombatViewData {
  const L = idx.pack, s = idx.state, tick = s.clock.lo;
  const name = (id: Id) => idx.entityName(id);
  // what a ruling went by, as the panel shows it: a node by name, the Persona, a lorebook entry, someone's 对抗倾向
  const basisLabel = (b: { ref: string; quote?: string }) =>
    (L.combat.nodes.get(b.ref)?.name || (b.ref === 'persona' ? 'Persona' : b.ref === 'judgement' ? '判断' : b.ref.startsWith('style:') ? `${name(b.ref.slice(6))}的对抗倾向` : b.ref.startsWith('lore:') ? `世界书 ${b.ref.slice(5)}` : b.ref)) + (b.quote ? `「${b.quote}」` : '');
  const f = fightNow(s);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  let hidden = 0;
  const ids = new Set<Id>([...(player ? [player] : []), ...f.participants, ...s.combat.statuses.map((x) => x.entity), ...s.combat.styles.map((x) => x.entity), ...s.combat.links.map((x) => x.entity), ...L.combat.linksFrom.keys()].filter((x) => idx.entityExists(x)));
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
  }).filter((p) => p.player || p.fighting || p.states.length || p.style || p.links.length)
    .map((p) => ({ ...p, relevant: !!(p.player || p.fighting || p.states.length || (p.style && p.style.source !== 'pack') || p.links.some((l) => l.source !== 'pack')) }));
  people.sort((a, b) => Number(!!b.fighting) - Number(!!a.fighting) || Number(!!b.player) - Number(!!a.player) || Number(b.states.length > 0) - Number(a.states.length > 0) || a.name.localeCompare(b.name, 'zh'));
  return {
    none: L.combat.none, basis: L.combat.basis,
    fight: { ongoing: f.ongoing, people: f.participants.filter((x) => idx.entityExists(x)).map((id) => ({ id, name: name(id) })), source: f.source, since: f.since === null ? null : formatTick(f.since, origin) },
    rulings: rulings.slice(-5).reverse().map(({ tick: t, ruling: r }) => ({
      when: formatTick(t, origin),
      exchanges: r.exchanges.map((x) => ({ who: name(x.actor), text: x.text, basis: x.basis.map(basisLabel), ...(x.unsupported ? { unsupported: true } : {}) })),
      stopped: (r.outcomes || []).filter((o) => !o.stands).map((o) => ({ quote: o.quote, why: o.why, basis: o.basis.map(basisLabel) })),
      states: r.statuses.map((x) => `${name(x.entity)}：${x.removed ? '−' : ''}${x.text}${x.count != null ? ` ×${x.count}` : ''}`),
      stands: r.stands, joined: (r.joined || []).map(name), over: r.over, overWhy: r.overWhy, stopAt: r.stopAt,
      filled: [...r.filled.links.map((l) => `${name(l.entity)} → ${L.combat.nodes.get(l.node)?.name || l.node}`), ...r.filled.styles.map((x) => `${name(x.entity)}：对抗倾向`)],
      notes: r.notes,
    })),
    people, hidden,
  };
}

/** A change the panel makes: the fight on or off (just the state from then on, no lock), a state of someone (removed:
 *  taken away), someone's 对抗倾向. */
export type CombatChange =
  | { fight: { ongoing: boolean; participants?: Id[] } }
  | { status: { entity: Id; text: string; count?: number | null; minutes?: number | null } | { entity: Id; text: string; removed: true } }
  | { style: { entity: Id; style: { start: string; force: string; response: string; limit: string; stop: string } } };

/** The record a panel change makes (null: nothing to record). */
export function panelRecord(idx: WorldIndex, change: CombatChange, tick: number, player: Id | null): RecordDraft | null {
  const st: StoryTime = { lo: tick, hi: tick, precision: 'minute' };
  if ('fight' in change) {
    const now = fightNow(idx.state);
    const participants = uniq((change.fight.participants?.length ? change.fight.participants : now.participants.length ? now.participants : player ? [player] : []).filter((x) => idx.entityExists(x)));
    return combatRecord(st, [], `Fight ${change.fight.ongoing ? 'on' : 'over'} (Canon Engine panel)`, { fight: { ongoing: change.fight.ongoing, participants, source: 'ui' } });
  }
  if ('status' in change) {
    const s = change.status;
    const text = String(s.text || '').trim().slice(0, 120);
    if (!text || !idx.entityExists(s.entity)) return null;
    const minutes = 'minutes' in s && s.minutes && s.minutes > 0 ? Math.round(s.minutes) : null;
    return combatRecord(st, [], `State of ${idx.entityName(s.entity)}: ${'removed' in s ? 'removed' : 'set'} ${text} (Canon Engine panel)`, { statuses: [{ entity: s.entity, text, ...('removed' in s ? { removed: true } : { ...(s.count != null && Number.isFinite(s.count) ? { count: Math.max(0, Math.round(s.count)) } : {}), until: minutes ? { minutes } : 'lasting' }), source: 'ui' }] });
  }
  const sty = change.style.style;
  if (!idx.entityExists(change.style.entity) || ![sty.start, sty.force, sty.response, sty.limit, sty.stop].every((x) => String(x || '').trim())) return null;
  return combatRecord(st, [], `对抗倾向 of ${idx.entityName(change.style.entity)} (Canon Engine panel)`, { styles: [{ entity: change.style.entity, style: { start: sty.start.trim(), force: sty.force.trim(), response: sty.response.trim(), limit: sty.limit.trim(), stop: sty.stop.trim() }, source: 'ui' }] });
}
