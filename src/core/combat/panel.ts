// 战斗 in the inspector: what its page shows (the fight now, the last rulings, each person's states, 对抗倾向 and links,
// and the pack's setting: its basis and nodes) and the records its buttons make (the fight on or off, a state, a 对抗倾向).
import type { Id, StoryTime } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { formatTick } from '../domain/time';
import { uniq } from '../domain/util';
import type { RecordDraft } from '../runtime/types';
import { fightNow, linksOf, statusesOf, styleOf } from './state';
import type { Ruling } from './judge';
import { combatRecord } from './record';

type Origin = { y: number; m: number; d: number } | null;

/** 战斗 as the inspector's page shows it: the pack's basis (or why it has none), the fight now, the last rulings, and
 *  each person's states, 对抗倾向 and what they are linked to now (the people in the fight and the player first; the
 *  pack's versions still to come are left out, counted). */
export interface CombatViewData {
  none: string | null; basis: string;
  fight: { ongoing: boolean; people: { id: Id; name: string }[]; source: string | null; since: string | null };
  rulings: { when: string; reasoning: string; walked: { node: Id; name: string; kind: string; depth: number; full: boolean; via: string; label: string | null; used: boolean }[]; cut: { node: Id; name: string }[]; exchanges: { who: string; text: string; basis: string[]; unsupported?: boolean }[]; stopped: { quote: string; why: string; basis: string[] }[]; states: string[]; stands: string[]; joined: string[]; over: boolean; overWhy: string; stopAt: string; filled: string[]; notes: string[] }[];
  people: { id: Id; name: string; player?: boolean; fighting?: boolean; /** fighting, the player, with states, or changed in this game (the rest only when searched for). */ relevant: boolean; states: { text: string; count: number | null; until: string; source: string }[]; style: { start: string; force: string; response: string; limit: string; stop: string; source: string } | null; links: { node: string; name: string; kind: string; label: string; source: string }[] }[];
  hidden: number;
  /** The setting's nodes the page lists: by default the concepts, rules and dangers and what the listed people are
   *  linked to; with a query, the nodes whose name or text has it (at most SETTING_MAX, more: the rest); focus: the
   *  nodes the player opened from a link. hidden: nodes left out as spoilers. */
  setting: { nodes: CombatNodeView[]; found: boolean; more: number; total: number; hidden: number };
}
/** A node of the combat setting as the page shows it: what it is, its parts (an ability), who knows it when not
 *  everyone does, and its links both ways (an entity's as they hold now; with spoilers, also those still to come). */
export interface CombatNodeView {
  id: Id; kind: string; name: string; gist: string; text: string; generated: boolean; knowers: string[] | null;
  parts: { part: string; text: string; knowers: string[] | null }[];
  who: string[]; event: string | null; hours: string; frequency: string;
  out: { node: Id; name: string; label: string }[];
  in: { node?: Id; name: string; label: string; source: string; later?: string }[];
}
export const SETTING_MAX = 40;
const KIND_ORDER = ['concept', 'rule', 'danger', 'ability', 'precedent'];

export function combatView(idx: WorldIndex, spoilers: boolean, player: Id | null | undefined, origin: Origin, rulings: { tick: number; ruling: Ruling }[], query = '', focus: readonly Id[] = []): CombatViewData {
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
      reasoning: r.reasoning || '',
      walked: (r.walked || []).filter((w) => L.combat.nodes.has(w.node)).map((w) => ({
        node: w.node, name: L.combat.nodes.get(w.node)!.name, kind: L.combat.nodes.get(w.node)!.kind, depth: w.depth, full: w.full,
        via: L.combat.nodes.get(w.from)?.name || name(w.from), label: w.label,
        used: [...r.exchanges.flatMap((x) => x.basis), ...(r.outcomes || []).flatMap((o) => o.basis)].some((b) => b.ref === w.node),
      })),
      cut: r.cut.filter((id) => L.combat.nodes.has(id)).map((id) => ({ node: id, name: L.combat.nodes.get(id)!.name })),
      exchanges: r.exchanges.map((x) => ({ who: name(x.actor), text: x.text, basis: x.basis.map(basisLabel), ...(x.unsupported ? { unsupported: true } : {}) })),
      stopped: (r.outcomes || []).filter((o) => !o.stands).map((o) => ({ quote: o.quote, why: o.why, basis: o.basis.map(basisLabel) })),
      states: r.statuses.map((x) => `${name(x.entity)}：${x.removed ? '−' : ''}${x.text}${x.count != null ? ` ×${x.count}` : ''}`),
      stands: r.stands, joined: (r.joined || []).map(name), over: r.over, overWhy: r.overWhy, stopAt: r.stopAt,
      filled: [...r.filled.links.map((l) => `${name(l.entity)} → ${L.combat.nodes.get(l.node)?.name || l.node}`), ...r.filled.styles.map((x) => `${name(x.entity)}：对抗倾向`)],
      notes: r.notes,
    })),
    people, hidden,
    setting: settingView(idx, spoilers, people.filter((p) => p.relevant), query, focus),
  };
}

/** The nodes of the setting the page lists (see CombatViewData.setting). A precedent of an event still to come, and
 *  a node only people still to come are linked to, are spoilers. */
function settingView(idx: WorldIndex, spoilers: boolean, listed: CombatViewData['people'], query: string, focus: readonly Id[]): CombatViewData['setting'] {
  const L = idx.pack, s = idx.state, nodes = L.combat.nodes;
  const name = (id: Id) => idx.entityName(id);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  const knowers = (v?: { mode: string; knower_ids: Id[] }) => (v && v.mode !== 'public' ? v.knower_ids.map(name) : null);
  // links into each node: the entities' as they hold now (pack, play, the panel, a state's node), with spoilers those
  // of the pack still to come, and the other nodes'
  const inNow = new Map<Id, CombatNodeView['in']>();
  const add = (n: Id, x: CombatNodeView['in'][number]) => inNow.set(n, [...(inNow.get(n) || []), x]);
  const entities = new Set<Id>([...L.combat.linksFrom.keys(), ...s.combat.links.map((x) => x.entity), ...s.combat.statuses.filter((x) => x.node).map((x) => x.entity)].filter((x) => !nodes.has(x) && idx.entityExists(x)));
  for (const e of entities) for (const l of linksOf(L, s, e)) add(l.node, { name: name(e), label: l.label, source: l.source });
  const later = new Map<Id, CombatNodeView['in']>();
  for (const l of L.pack.combat.links || []) {
    if (nodes.has(l.from) || !l.from_event || occurred(l.from_event) || occurred(l.until_event) || !idx.entityExists(l.from)) continue;
    later.set(l.to, [...(later.get(l.to) || []), { name: name(l.from), label: l.label, source: 'pack', later: L.events.get(l.from_event)?.title || l.from_event }]);
  }
  const fromNode = new Set((L.pack.combat.links || []).filter((l) => nodes.has(l.from)).map((l) => l.to));
  const spoiler = (id: Id) => {
    const n = nodes.get(id);
    if (!n || spoilers) return false;
    if (n.kind === 'precedent' && n.event_id && !occurred(n.event_id)) return true;
    return later.has(id) && !inNow.has(id) && !L.combat.linksFrom.has(id) && !fromNode.has(id);
  };
  const all = [...nodes.values()];
  const shown = all.filter((n) => !spoiler(n.id));
  const q = query.trim().toLowerCase();
  let picked: typeof all, more = 0;
  if (q) {
    const hay = (n: (typeof all)[number]) => [n.name, n.gist, n.text, ...(n.parts || []).map((p) => p.text)].join('\n').toLowerCase();
    // the nodes named so first
    const hits = shown.filter((n) => hay(n).includes(q)).sort((a, b) => Number(!a.name.toLowerCase().includes(q)) - Number(!b.name.toLowerCase().includes(q)));
    more = Math.max(0, hits.length - SETTING_MAX);
    picked = hits.slice(0, SETTING_MAX);
  } else {
    const ids = new Set(listed.flatMap((p) => p.links.map((l) => l.node)));
    picked = shown.filter((n) => n.kind === 'concept' || n.kind === 'rule' || n.kind === 'danger' || ids.has(n.id));
  }
  for (const id of focus) { const n = nodes.get(id); if (n && !spoiler(id) && !picked.includes(n)) picked.push(n); }
  picked.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.name.localeCompare(b.name, 'zh'));
  const nodeIn = new Map<Id, CombatNodeView['in']>();
  for (const l of L.pack.combat.links || []) if (nodes.has(l.from) && !spoiler(l.from)) nodeIn.set(l.to, [...(nodeIn.get(l.to) || []), { node: l.from, name: nodes.get(l.from)!.name, label: l.label, source: 'pack' }]);
  const view = (n: (typeof all)[number]): CombatNodeView => ({
    id: n.id, kind: n.kind, name: n.name, gist: n.gist, text: n.text, generated: !!n.generated, knowers: knowers(n.visibility),
    parts: (n.parts || []).map((p) => ({ part: p.part, text: p.text, knowers: knowers(p.visibility) })),
    who: (n.who || []).filter((x) => idx.entityExists(x)).map(name), event: n.event_id ? L.events.get(n.event_id)?.title || n.event_id : null,
    hours: n.hours ? `${n.hours.from}–${n.hours.to}` : '', frequency: n.frequency || '',
    out: (L.combat.linksFrom.get(n.id) || []).filter((l) => nodes.has(l.to) && !spoiler(l.to)).map((l) => ({ node: l.to, name: nodes.get(l.to)!.name, label: l.label })),
    in: [...(nodeIn.get(n.id) || []), ...(inNow.get(n.id) || []), ...(spoilers ? later.get(n.id) || [] : [])],
  });
  return { nodes: picked.map(view), found: !!q, more, total: shown.length, hidden: all.length - shown.length };
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
