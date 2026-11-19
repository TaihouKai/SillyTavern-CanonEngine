// 战斗 as this game has it: the pack's combat graph with this game's changes over it (links, states, 对抗倾向, the
// fight, who saw what), and the walk that takes what a fight needs. Pure: pack + replayed state in, answers out.
import type { AbilityPart, CombatNode, CombatSource, CombatStyleVersion, Id, StatusChange } from './types';
import type { LoadedPack } from './pack';
import type { Replayed, WorldState } from './reducer';
import { normalizeName } from './pack';

/** Precedence of a change's source: the player's word and the panel over the Persona over play over what was filled
 *  in. The pack stands between play and fill: what the original story says is objective, fill never overrides it. */
const RANK: Record<CombatSource | 'pack', number> = { ui: 5, persona: 4, play: 3, pack: 2, fill: 1 };

const occurred = (state: WorldState, e?: Id | null) => !!e && state.dispositions.get(e)?.disposition === 'occurred';

export interface LinkNow { node: Id; label: string; source: CombatSource | 'pack'; quote?: string }

/** What someone is linked to in the combat graph now: the pack's links in force (a version from its event, until
 *  its end event), with this game's changes over them in record order. A filled-in link never stands against one
 *  from a higher source, and never takes one away. A state that brings a node (holding a sword) links it too. */
export function linksOf(L: LoadedPack, state: WorldState, entity: Id, tick = state.clock.lo): LinkNow[] {
  const now = new Map<Id, LinkNow>();
  for (const l of L.combat.linksFrom.get(entity) || []) {
    if (l.from_event && !occurred(state, l.from_event)) continue;
    if (l.until_event && occurred(state, l.until_event)) continue;
    now.set(l.to, { node: l.to, label: l.label, source: 'pack' });
  }
  const removedBy = new Map<Id, number>();
  for (const c of state.combatLinks) {
    if (c.entity !== entity || !L.combat.nodes.has(c.node)) continue;
    const cur = now.get(c.node);
    const curRank = cur ? RANK[cur.source] : removedBy.get(c.node) ?? 0;
    if (c.source === 'fill' && (c.removed || curRank > RANK.fill)) continue;
    if (c.removed) { now.delete(c.node); removedBy.set(c.node, RANK[c.source]); continue; }
    now.set(c.node, { node: c.node, label: c.label, source: c.source, ...(c.quote ? { quote: c.quote } : {}) });
  }
  for (const s of statusesOf(state, entity, tick)) if (s.node && L.combat.nodes.has(s.node) && !now.has(s.node)) now.set(s.node, { node: s.node, label: s.text, source: s.source });
  return [...now.values()];
}

export type StatusNow = Replayed<StatusChange> & { endsAt?: number };

/** Someone's states now: each text's latest change (same text, normalized: replaced; removed: gone), without those
 *  whose time is over (minutes after they came; an event settled since). */
export function statusesOf(state: WorldState, entity: Id, tick = state.clock.lo): StatusNow[] {
  const by = new Map<string, Replayed<StatusChange>>();
  for (const s of state.statuses) {
    if (s.entity !== entity || s.tick > tick) continue;
    const k = normalizeName(s.text);
    if (s.removed) by.delete(k); else by.set(k, s);
  }
  const out: StatusNow[] = [];
  for (const s of by.values()) {
    const u = s.until;
    if (u && u !== 'lasting' && 'minutes' in u) { const end = s.tick + Math.max(1, Math.round(u.minutes)); if (tick >= end) continue; out.push({ ...s, endsAt: end }); continue; }
    if (u && u !== 'lasting' && 'event' in u) { const d = state.dispositions.get(u.event); if (d && d.tick >= s.tick && d.tick <= tick) continue; }
    out.push(s);
  }
  return out;
}

export type Style = Pick<CombatStyleVersion, 'start' | 'force' | 'response' | 'limit' | 'stop'>;

/** Someone's 对抗倾向 now: this game's own (the panel, the Persona, play) over the pack's version in force, which
 *  is over what was filled in. null: nothing says. */
export function styleOf(L: LoadedPack, state: WorldState, entity: Id): { style: Style; source: CombatSource | 'pack' } | null {
  let best: { style: Style; source: CombatSource | 'pack'; rank: number } | null = null;
  const vs = L.pack.entities.find((e) => e.id === entity)?.combat_style;
  if (vs?.length) {
    let i = 0;
    vs.forEach((v, j) => { if (j > 0 && occurred(state, v.from_event) && !occurred(state, v.until_event)) i = j; });
    const v = vs[i];
    best = { style: { start: v.start, force: v.force, response: v.response, limit: v.limit, stop: v.stop }, source: 'pack', rank: RANK.pack };
  }
  for (const s of state.styles) {
    if (s.entity !== entity) continue;
    if (!best || RANK[s.source] >= best.rank) best = { style: s.style, source: s.source, rank: RANK[s.source] };
  }
  return best && { style: best.style, source: best.source };
}

/** Whether a fight is under way now, and who is in it (the latest change: a player's correction in the panel is just
 *  the state from then on). */
export function fightNow(state: WorldState): { ongoing: boolean; participants: Id[]; source: 'player' | 'engine' | 'ui' | null; since: number | null } {
  const f = state.fights[state.fights.length - 1];
  return f ? { ongoing: f.ongoing, participants: f.participants, source: f.source, since: f.tick } : { ongoing: false, participants: [], source: null, since: null };
}

/** Whether `who` knows a node, or a part of an ability: public; their own (linked to them now); named as a knower; or
 *  they saw it used. */
export function knowsNode(L: LoadedPack, state: WorldState, who: Id, nodeId: Id, part?: AbilityPart | null): boolean {
  const n = L.combat.nodes.get(nodeId);
  if (!n) return false;
  const vis = (part && n.parts?.find((p) => p.part === part)?.visibility) || n.visibility;
  if (!vis || vis.mode === 'public') return true;
  if (vis.knower_ids.includes(who)) return true;
  if (linksOf(L, state, who).some((l) => l.node === nodeId)) return true;
  return state.witnessed.some((w) => w.node === nodeId && (!w.part || !part || w.part === part) && w.who.includes(who));
}

export interface WalkedNode { node: CombatNode; depth: number; /** whole text (near) or only the gist (further away). */ full: boolean; /** who in the fight reaches it. */ from: Id[]; via: string }
export interface Walk { nodes: WalkedNode[]; /** reached but left out for the budget. */ cut: Id[]; chars: number }

/** What a fight needs from the combat graph: from the people in it, the place and the objects used, their links
 *  (depth 1) and their precedents, then outward along node links up to maxDepth. The walk never goes into another
 *  entity (from "magic" it does not reach every magus). Nodes up to fullDepth come whole, further ones as their gist;
 *  nodes reached from more of the starts come first; past the budget the furthest are left out (listed in cut). */
export function walkCombat(L: LoadedPack, state: WorldState, starts: Id[], opts: { maxDepth: number; fullDepth: number; budgetChars: number; tick?: number }): Walk {
  const tick = opts.tick ?? state.clock.lo;
  const seen = new Map<Id, { depth: number; from: Set<Id>; via: string }>();
  const reach = (node: Id, depth: number, from: Id, via: string) => {
    const s = seen.get(node);
    if (!s) { seen.set(node, { depth, from: new Set([from]), via }); return true; }
    s.from.add(from);
    if (depth < s.depth) { s.depth = depth; s.via = via; return true; }
    return false;
  };
  for (const e of starts) {
    let frontier: Id[] = [];
    for (const l of linksOf(L, state, e, tick)) { reach(l.node, 1, e, `${e} ${l.label}`); frontier.push(l.node); }
    for (const p of L.combat.precedentsOf.get(e) || []) { reach(p, 1, e, `${e} was in it`); frontier.push(p); }
    for (let d = 2; d <= opts.maxDepth && frontier.length; d++) {
      const next: Id[] = [];
      for (const n of frontier) for (const l of L.combat.linksFrom.get(n) || []) {
        if (!L.combat.nodes.has(l.to)) continue;
        const before = seen.get(l.to)?.from.has(e);
        reach(l.to, d, e, `${n} ${l.label}`);
        if (!before) next.push(l.to);
      }
      frontier = next;
    }
  }
  const list = [...seen.entries()].map(([id, s]) => ({ node: L.combat.nodes.get(id)!, depth: s.depth, full: s.depth <= opts.fullDepth, from: [...s.from], via: s.via }))
    .sort((a, b) => a.depth - b.depth || b.from.length - a.from.length || a.node.id.localeCompare(b.node.id));
  const nodes: WalkedNode[] = [], cut: Id[] = [];
  let chars = 0;
  for (const w of list) {
    const size = (w.full ? w.node.text.length + (w.node.parts || []).reduce((n, p) => n + p.text.length, 0) : w.node.gist.length) + w.node.name.length + 20;
    if (chars + size > opts.budgetChars && nodes.length) { cut.push(w.node.id); continue; }
    chars += size;
    nodes.push(w);
  }
  return { nodes, cut, chars };
}
