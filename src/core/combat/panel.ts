// 战斗 in the inspector: what its page shows (the fight now, the last rulings, each person's states, 对抗倾向 and links,
// and the pack's setting: its basis and nodes) and the records its buttons make (the fight on or off, a state, a 对抗倾向).
import type { Id, StoryTime } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { formatTick } from '../domain/time';
import { uniq } from '../domain/util';
import type { RecordDraft } from '../runtime/types';
import { aspectWritten, holdsNow } from '../domain/aspects';
import { combatNodes, fightNow, linksOf, statusesOf, styleOf } from './state';
import type { Ruling } from './judge';
import { combatRecord } from './record';

type Origin = { y: number; m: number; d: number } | null;

/** 战斗 as the inspector's page shows it: the pack's basis (or why it has none), the fight now, the last rulings, and
 *  each person's states, 对抗倾向 and what they are linked to now (the people in the fight and the player first; the
 *  pack's versions still to come are left out, counted). */
export interface CombatViewData {
  none: string | null; basis: string;
  fight: { ongoing: boolean; people: { id: Id; name: string; /** how the player's message called them, when it gave no name, and why they were taken for this person. */ as?: string; asWhy?: string }[]; /** the setting's things at work in it. */ things: { node: Id; name: string; why: string }[]; source: string | null; since: string | null };
  rulings: { when: string; reasoning: string; walked: { node: Id; name: string; kind: string; depth: number; full: boolean; via: string; label: string | null; /** a thing at work in the fight: reached as itself. */ inFight?: boolean; used: boolean }[]; cut: { node: Id; name: string }[]; exchanges: { who: string; text: string; basis: string[]; unsupported?: boolean }[]; stopped: { quote: string; why: string; basis: string[] }[]; states: string[]; stands: string[]; joined: string[]; /** things at work in the fight that stopped this turn (names). */ ended?: string[]; over: boolean; overWhy: string; stopAt: string; filled: string[]; notes: string[] }[];
  people: { id: Id; name: string; player?: boolean; fighting?: boolean; /** fighting, the player, with states, or changed in this game (the rest only when searched for). */ relevant: boolean; states: { text: string; count: number | null; until: string; /** the thing at work in the fight it lasts while (its name). */ while?: string; source: string }[]; style: { start: string; force: string; response: string; limit: string; stop: string; source: string } | null; links: { node: string; name: string; kind: string; label: string; source: string; /** the engine's own link (see LinkNow.how): the panel names it. */ how?: string; /** what it comes with (an object, an organization). */ via?: string }[] }[];
  hidden: number;
  /** The setting (战斗设定) around one focus — a node, or someone linked to nodes —: the graph two steps out (at most
   *  GRAPH_MAX points, never through another person; around a node at most PEOPLE_EACH people, the rest counted),
   *  the focus in full, what a query finds (nodes by name or text, people by name), and where to start (the listed
   *  people linked to something, the setting's core: the nodes most linked with other nodes). hidden: nodes left out as spoilers. */
  setting: {
    focus: CombatNodeView | null;
    graph: { nodes: GraphPoint[]; edges: GraphEdge[]; morePeople: number };
    found: { id: Id; name: string; kind: string }[] | null; more: number;
    starts: { id: Id; name: string; kind: string }[];
    byKind: { kind: string; items: { id: Id; name: string }[] }[];
    total: number; hidden: number;
  };
}
/** A point of the setting's graph: a node (kind: its kind) or an entity (kind: person, place, …). depth: steps from
 *  the focus. */
export interface GraphPoint { id: Id; name: string; kind: string; entity: boolean; depth: number }
/** A link of the graph. label null: the person was in the precedent. later: the pack's link from an event still to
 *  come (only with spoilers). */
export interface GraphEdge { from: Id; to: Id; label: string | null; later?: boolean; /** the engine's own link (has, holds, member): the panel names it. */ how?: string }
/** A node of the setting (or the entity in focus) as the page shows it: what it is, its parts (an ability), who
 *  knows it when not everyone does, and its links both ways (an entity's as they hold now; with spoilers, also those
 *  still to come). out label null: a precedent the entity was in. */
export interface CombatNodeView {
  id: Id; kind: string; entity: boolean; name: string; /** an ability's: whose it is. */ owner?: string; /** a use's: the ability it is a use of. */ of?: { id: Id; name: string }; gist: string; text: string; generated: boolean; knowers: string[] | null;
  parts: { part: string; text: string; knowers: string[] | null }[];
  who: string[]; event: string | null; hours: string; frequency: string;
  out: { node: Id; name: string; label: string | null; how?: string }[];
  in: { id: Id; name: string; label: string; source: string; later?: string; how?: string }[];
}
export const SETTING_MAX = 40;
export const GRAPH_MAX = 60;
export const PEOPLE_EACH = 12;
const KIND_ORDER = ['concept', 'rule', 'danger', 'ability', 'precedent'];

// what the page shows of an entity beyond what holds now: every version of its abilities and links into the setting
// (those still to come are spoilers), and whether it has 对抗倾向
const WRITTEN = aspectWritten(['abilities', 'setting', 'combat_style'] as const);
/** The entities written to have anything of 战斗 (abilities, links into the setting, 对抗倾向, what they are in a fight). */
function combatEntities(idx: WorldIndex): Id[] {
  return [...idx.pack.entities.keys(), ...idx.state.runtimeEntities.keys()].filter((id) => { const w = WRITTEN(idx, id); return !!(w.abilities?.length || w.setting?.length || w.combat_style?.length || idx.pack.combat.nodes.get(id)?.owner === id); });
}

export function combatView(idx: WorldIndex, spoilers: boolean, player: Id | null | undefined, origin: Origin, rulings: { tick: number; ruling: Ruling }[], query = '', focus: Id | null = null): CombatViewData {
  const L = idx.pack, s = idx.state, tick = s.clock.lo;
  const N = combatNodes(L, s);
  const name = (id: Id) => idx.entityName(id);
  // what a ruling went by, as the panel shows it: a node by name, the Persona, a lorebook entry, someone's 对抗倾向 or
  // what is so of them now
  const basisLabel = (b: { ref: string; quote?: string }) =>
    (N.get(b.ref)?.name || (b.ref === 'persona' ? 'Persona' : b.ref === 'judgement' ? '判断' : b.ref.startsWith('style:') ? `${name(b.ref.slice(6))}的对抗倾向` : b.ref.startsWith('world:') ? `${name(b.ref.slice(6))}的现状` : b.ref.startsWith('canon:') ? `原作「${idx.pack.events.get(b.ref.slice(6))?.title || b.ref.slice(6)}」` : b.ref.startsWith('lore:') ? `世界书 ${b.ref.slice(5)}` : b.ref)) + (b.quote ? `「${b.quote}」` : '');
  const f = fightNow(s);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  let hidden = 0;
  const ids = new Set<Id>([...(player ? [player] : []), ...f.participants, ...s.combat.statuses.map((x) => x.entity), ...s.combat.styles.map((x) => x.entity), ...s.combat.links.map((x) => x.entity), ...combatEntities(idx).filter((id) => idx.entityKind(id) === 'person')].filter((x) => idx.entityExists(x)));
  // what someone only has from an event still to come
  for (const id of L.entities.keys()) { const w = WRITTEN(idx, id); for (const x of [...(w.abilities || []), ...(w.setting || [])]) if (x.from_event && !occurred(x.from_event) && !s.dispositions.has(x.from_event) && !spoilers) hidden++; }
  const people: CombatViewData['people'] = [...ids].map((id) => {
    const style = styleOf(L, s, id);
    return {
      id, name: name(id), ...(id === player ? { player: true } : {}), ...(f.ongoing && f.participants.includes(id) ? { fighting: true } : {}),
      states: statusesOf(s, id, tick).map((x) => ({ text: x.text, count: x.count ?? null, ...(x.while ? { while: N.get(x.while)?.name || x.while } : {}), until: x.endsAt ? formatTick(x.endsAt, origin) : x.until && x.until !== 'lasting' && 'event' in x.until ? (L.events.get(x.until.event)?.title || x.until.event) : '', source: x.source })),
      style: style ? { ...style.style, source: style.source } : null,
      links: linksOf(L, s, id, tick).map((l) => ({ node: l.node, name: idx.entityExists(l.node) ? idx.entityName(l.node) : N.get(l.node)?.name || l.node, kind: N.get(l.node)?.kind || '', label: l.label, source: l.source, ...(l.how ? { how: l.how } : {}), ...(l.via && l.via !== l.node ? { via: idx.entityName(l.via) } : {}) })),
    };
  }).filter((p) => p.player || p.fighting || p.states.length || p.style || p.links.length)
    .map((p) => ({ ...p, relevant: !!(p.player || p.fighting || p.states.length || (p.style && p.style.source !== 'pack') || p.links.some((l) => l.source !== 'pack')) }));
  people.sort((a, b) => Number(!!b.fighting) - Number(!!a.fighting) || Number(!!b.player) - Number(!!a.player) || Number(b.states.length > 0) - Number(a.states.length > 0) || a.name.localeCompare(b.name, 'zh'));
  return {
    none: L.combat.none, basis: L.combat.basis,
    fight: { ongoing: f.ongoing, people: f.participants.filter((x) => idx.entityExists(x)).map((id) => { const w = f.identified.find((x) => x.id === id); return { id, name: name(id), ...(w ? { as: w.as, asWhy: w.why } : {}) }; }), things: f.things.filter((x) => N.has(x.node)).map((x) => ({ node: x.node, name: N.get(x.node)!.name, why: x.why })), source: f.source, since: f.since === null ? null : formatTick(f.since, origin) },
    rulings: rulings.slice(-5).reverse().map(({ tick: t, ruling: r }) => ({
      when: formatTick(t, origin),
      reasoning: r.reasoning || '',
      walked: (r.walked || []).filter((w) => N.has(w.node)).map((w) => ({
        node: w.node, name: N.get(w.node)!.name, kind: N.get(w.node)!.kind, depth: w.depth, full: w.full,
        via: N.get(w.from)?.name || name(w.from), label: w.label, ...(w.from === w.node ? { inFight: true } : {}),
        used: [...r.exchanges.flatMap((x) => x.basis), ...(r.outcomes || []).flatMap((o) => o.basis)].some((b) => b.ref === w.node),
      })),
      cut: r.cut.filter((id) => N.has(id)).map((id) => ({ node: id, name: N.get(id)!.name })),
      exchanges: r.exchanges.map((x) => ({ who: name(x.actor), text: x.text, basis: x.basis.map(basisLabel), ...(x.unsupported ? { unsupported: true } : {}) })),
      stopped: (r.outcomes || []).filter((o) => !o.stands).map((o) => ({ quote: o.quote, why: o.why, basis: o.basis.map(basisLabel) })),
      states: [...r.statuses.map((x) => `${name(x.entity)}：${x.removed ? '−' : ''}${x.text}${x.count != null ? ` ×${x.count}` : ''}`),
        ...(r.handovers || []).map((h) => `${name(h.object)} → ${h.to ? name(h.to) : '—'}`)],
      stands: r.stands, joined: (r.joined || []).map(name), ...(r.ended?.length ? { ended: r.ended.map((n) => N.get(n)?.name || n) } : {}), over: r.over, overWhy: r.overWhy, stopAt: r.stopAt,
      filled: [...r.filled.links.map((l) => `${name(l.entity)} → ${N.get(l.node)?.name || l.node}`), ...r.filled.styles.map((x) => `${name(x.entity)}：对抗倾向`)],
      notes: r.notes,
    })),
    people, hidden,
    setting: settingView(idx, spoilers, people.filter((p) => p.relevant), query, focus),
  };
}

/** The setting around one focus (see CombatViewData.setting). A precedent of an event still to come, and a node only
 *  people still to come are linked to, are spoilers. */
function settingView(idx: WorldIndex, spoilers: boolean, listed: CombatViewData['people'], query: string, focusId: Id | null): CombatViewData['setting'] {
  const L = idx.pack, s = idx.state, nodes = combatNodes(L, s);
  const name = (id: Id) => (idx.entityExists(id) ? idx.entityName(id) : nodes.get(id)?.name || id);
  const occurred = (e?: Id | null) => !!e && s.dispositions.get(e)?.disposition === 'occurred';
  const knowers = (v?: { mode: string; knower_ids: Id[] }) => (v && v.mode !== 'public' ? v.knower_ids.map(name) : null);
  // an entity is a point of its own (a person, an organization, an object), whatever it is in a fight; a node is the
  // setting's or an entity's ability
  const isEntity = (id: Id) => idx.entityExists(id);
  const isNode = (id: Id) => !isEntity(id) && nodes.has(id);
  const kindOf = (id: Id) => (isEntity(id) ? L.entities.get(id)?.kind || s.runtimeEntities.get(id)?.kind || 'person' : nodes.get(id)?.kind || 'concept');
  // every link as it holds now: an entity's (what it has, what it holds and belongs to, play, the panel, a state's
  // node), what it has from an event still to come (shown with spoilers), between nodes, and the people of a precedent
  type Link = GraphEdge & { source?: string; event?: string };
  const links: Link[] = [];
  const entities = new Set<Id>([...combatEntities(idx), ...s.combat.links.map((x) => x.entity), ...s.combat.statuses.filter((x) => x.node).map((x) => x.entity)].filter(isEntity));
  for (const e of entities) for (const l of linksOf(L, s, e)) {
    // what comes with an object or an organization hangs on it (the entity's own point), not on everyone with it
    if (l.via) { if (l.node === l.via) links.push({ from: e, to: l.via, label: l.label, source: l.source, ...(l.how ? { how: l.how } : {}) }); continue; }
    // a use hangs on its power, not on the person
    const of = nodes.get(l.node)?.of;
    if (of && l.how === 'use') links.push({ from: of, to: l.node, label: l.label, source: l.source, how: 'use' });
    else if (l.node !== e) links.push({ from: e, to: l.node, label: l.label, source: l.source, ...(l.how ? { how: l.how } : {}) });
  }
  const later: Link[] = [];
  for (const e of L.entities.keys()) {
    const w = WRITTEN(idx, e);
    for (const x of [...(w.abilities || []).map((a) => ({ to: a.id, label: 'has', v: a, from: a.of })), ...(w.setting || []).map((l) => ({ to: l.node, label: l.label, v: l }))]) {
      if (!x.v.from_event || holdsNow(x.v, occurred) || occurred(x.v.until_event) || !nodes.has(x.to)) continue;
      const from = 'from' in x && x.from ? x.from : e;
      later.push({ from, to: x.to, label: x.label, later: true, source: 'pack', event: L.events.get(x.v.from_event)?.title || x.v.from_event, ...(x.label === 'has' ? { how: from === e ? 'has' : 'use' } : {}) });
    }
  }
  for (const [from, ls] of L.combat.linksFrom) for (const l of ls) if (nodes.has(l.from) && nodes.has(l.to)) links.push({ from, to: l.to, label: l.label, source: 'pack' });
  for (const n of nodes.values()) if (n.kind === 'precedent') for (const w of n.who || []) if (isEntity(w)) links.push({ from: w, to: n.id, label: null });
  const linked = new Set(links.flatMap((l) => [l.from, l.to]));
  const laterTo = new Set(later.map((l) => l.to));
  const spoiler = (id: Id) => {
    const n = nodes.get(id);
    if (!n || spoilers) return false;
    if (n.kind === 'precedent' && n.event_id && !occurred(n.event_id)) return true;
    return laterTo.has(id) && !linked.has(id);
  };
  const all = [...nodes.values()].filter((n) => isNode(n.id));
  const shown = all.filter((n) => !spoiler(n.id));
  const graphLinks = [...links, ...(spoilers ? later : [])].filter((l) => !spoiler(l.from) && !spoiler(l.to));
  const adj = new Map<Id, Link[]>();
  for (const l of graphLinks) for (const end of [l.from, l.to]) adj.set(end, [...(adj.get(end) || []), l]);

  // the setting's core: the nodes most linked with other nodes (a concept before others, then by name)
  const usable = (id: Id | null | undefined): id is Id => !!id && (isNode(id) ? !spoiler(id) : isEntity(id) && adj.has(id));
  const byName = (a: Id, b: Id) => name(a).localeCompare(name(b), 'zh');
  const nodeDegree = new Map<Id, number>();
  for (const l of graphLinks) if (isNode(l.from) && isNode(l.to)) for (const end of [l.from, l.to]) nodeDegree.set(end, (nodeDegree.get(end) || 0) + 1);
  const core = shown.map((n) => n.id).sort((a, b) => (nodeDegree.get(b) || 0) - (nodeDegree.get(a) || 0) || Number(kindOf(b) === 'concept') - Number(kindOf(a) === 'concept') || byName(a, b));
  // the focus: the one asked for, else the first listed person linked to something (the player, those fighting),
  // else the core (a game that has not begun: the player is linked to nothing yet)
  const focus = usable(focusId) ? focusId : listed.map((p) => p.id).find(usable) ?? core[0] ?? null;

  // the graph: two steps out from the focus, never through another person; people only around the focus
  const listedIds = new Set(listed.map((p) => p.id));
  const pts = new Map<Id, GraphPoint>();
  let morePeople = 0;
  const add = (id: Id, depth: number) => { if (pts.has(id) || pts.size >= GRAPH_MAX) return false; pts.set(id, { id, name: name(id), kind: kindOf(id), entity: isEntity(id), depth }); return true; };
  if (focus) {
    add(focus, 0);
    let ring: Id[] = [focus];
    for (const depth of [1, 2]) {
      const next: Id[] = [];
      for (const id of ring) {
        if (depth > 1 && pts.get(id)?.entity && kindOf(id) === 'person') continue;
        const around = uniq((adj.get(id) || []).map((l) => (l.from === id ? l.to : l.from))).filter((x) => !pts.has(x));
        // what a person holds and belongs to is theirs, like their abilities (never counted among the people)
        const people = around.filter((x) => isEntity(x) && kindOf(x) === 'person').sort((a, b) => Number(listedIds.has(b)) - Number(listedIds.has(a)) || byName(a, b));
        const keep = depth === 1 ? people.slice(0, PEOPLE_EACH) : [];
        if (depth === 1) morePeople += people.length - keep.length;
        // (an organization or object: next to the focus too, like people, but never pushing them out)
        const things = depth === 1 ? around.filter((x) => isEntity(x) && kindOf(x) !== 'person').sort(byName) : [];
        for (const x of [...around.filter(isNode).sort((a, b) => KIND_ORDER.indexOf(kindOf(a)) - KIND_ORDER.indexOf(kindOf(b)) || byName(a, b)), ...things, ...keep]) if (add(x, depth)) next.push(x);
      }
      ring = next;
    }
  }
  const seen = new Set<string>();
  const edges: GraphEdge[] = graphLinks.filter((l) => pts.has(l.from) && pts.has(l.to) && !seen.has(`${l.from}|${l.to}|${l.label}`) && !!seen.add(`${l.from}|${l.to}|${l.label}`))
    .map((l) => ({ from: l.from, to: l.to, label: l.label, ...(l.later ? { later: true } : {}), ...(l.how ? { how: l.how } : {}) }));

  // the focus in full
  const view = (id: Id): CombatNodeView => {
    const n = nodes.get(id);
    const ins = (adj.get(id) || []).filter((l) => l.to === id && l.label !== null).map((l) => ({ id: l.from, name: name(l.from), label: l.label!, source: l.source || 'pack', ...(l.event ? { later: l.event } : {}), ...(l.how ? { how: l.how } : {}) }));
    const outs = (adj.get(id) || []).filter((l) => l.from === id).map((l) => ({ node: l.to, name: name(l.to), label: l.label, ...(l.how ? { how: l.how } : {}) }));
    if (isEntity(id)) {
      // an entity: its description, and what it is in a fight (an organization, an object), with who has it
      const e = L.entities.get(id), rt = s.runtimeEntities.get(id);
      const fight = n && n.owner === id ? n : null;
      return { id, kind: kindOf(id), entity: true, name: name(id), gist: String(e?.static_description || rt?.description || '').slice(0, 300), text: fight ? fight.text : '', generated: false, knowers: fight ? knowers(fight.visibility) : null, parts: [], who: [], event: null, hours: '', frequency: '', out: outs, in: isEntity(id) && kindOf(id) !== 'person' ? ins : [] };
    }
    if (!n) return { id, kind: 'concept', entity: false, name: id, gist: '', text: '', generated: false, knowers: null, parts: [], who: [], event: null, hours: '', frequency: '', out: outs, in: ins };
    return {
      id, kind: n.kind, entity: false, name: n.name, ...(n.owner ? { owner: name(n.owner) } : {}), ...(n.of ? { of: { id: n.of, name: name(n.of) } } : {}), gist: n.gist, text: n.text, generated: !!n.generated, knowers: knowers(n.visibility),
      parts: (n.parts || []).map((p) => ({ part: p.part, text: p.text, knowers: knowers(p.visibility) })),
      who: (n.who || []).filter(isEntity).map(name), event: n.event_id ? L.events.get(n.event_id)?.title || n.event_id : null,
      hours: n.hours ? `${n.hours.from}–${n.hours.to}` : '', frequency: n.frequency || '',
      out: outs, in: ins,
    };
  };

  // what a query finds: nodes by name or text (named so first), people linked to something by name
  const q = query.trim().toLowerCase();
  let found: CombatViewData['setting']['found'] = null, more = 0;
  if (q) {
    const hay = (n: (typeof all)[number]) => [n.name, n.gist, n.text, ...(n.parts || []).map((p) => p.text)].join('\n').toLowerCase();
    const hits = shown.filter((n) => hay(n).includes(q)).sort((a, b) => Number(!a.name.toLowerCase().includes(q)) - Number(!b.name.toLowerCase().includes(q)));
    const who = [...adj.keys()].filter((id) => isEntity(id) && idx.allNames(id).some((x) => x.toLowerCase().includes(q))).sort(byName).slice(0, 10);
    more = Math.max(0, hits.length - SETTING_MAX);
    found = [...who.map((id) => ({ id, name: name(id), kind: kindOf(id) })), ...hits.slice(0, SETTING_MAX).map((n) => ({ id: n.id, name: n.name, kind: n.kind }))];
  }
  const starts = [...listed.filter((p) => adj.has(p.id)).map((p) => p.id), ...core.slice(0, 4)].map((id) => ({ id, name: name(id), kind: kindOf(id) }));
  const byKind = ['concept', 'rule', 'danger'].map((kind) => ({ kind, items: shown.filter((n) => n.kind === kind).map((n) => ({ id: n.id, name: n.name })).sort((a, b) => a.name.localeCompare(b.name, 'zh')) })).filter((g) => g.items.length);
  return { focus: focus ? view(focus) : null, graph: { nodes: [...pts.values()], edges, morePeople }, found, more, starts, byKind, total: shown.length, hidden: all.length - shown.length };
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
