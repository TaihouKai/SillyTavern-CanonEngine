// 战斗 as this game has it: the pack's combat graph with this game's changes over it (links, states, 对抗倾向, the
// fight, who saw what), and the walk that takes what a fight needs. Pure: pack + replayed state in, answers out.
import type { AbilityPart, CombatLinkChange, CombatNode, CombatSource, CombatStyleVersion, FightChange, Id, LedgerRecord, StatusChange, StyleChange, Witnessed } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { eventTime, normalizeName } from '../domain/pack';

/** A combat change as replayed (record order). */
export type Replayed<T> = T & { recordId: string; seq: number; tick: number };

/** This game's combat changes, replayed in record order (WorldState.combat): links, states, 对抗倾向, the fight and
 *  who saw which ability. */
export interface CombatState {
  links: Replayed<CombatLinkChange>[];
  statuses: Replayed<StatusChange>[];
  styles: Replayed<StyleChange>[];
  fights: Replayed<FightChange>[];
  witnessed: Replayed<Witnessed>[];
}

export const emptyCombatState = (): CombatState => ({ links: [], statuses: [], styles: [], fights: [], witnessed: [] });

/** The reducer's step for a record's combat changes. */
export function applyCombat(cs: CombatState, rec: LedgerRecord, tick: number): void {
  const at = { recordId: rec.recordId, seq: rec.sequence, tick };
  for (const x of rec.combatLinks || []) cs.links.push({ ...x, ...at });
  for (const x of rec.statuses || []) cs.statuses.push({ ...x, ...at });
  for (const x of rec.styles || []) cs.styles.push({ ...x, ...at });
  if (rec.fight) cs.fights.push({ ...rec.fight, ...at });
  for (const x of rec.witnessed || []) cs.witnessed.push({ ...x, ...at });
}

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
  for (const c of state.combat.links) {
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
  for (const s of state.combat.statuses) {
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
  for (const s of state.combat.styles) {
    if (s.entity !== entity) continue;
    if (!best || RANK[s.source] >= best.rank) best = { style: s.style, source: s.source, rank: RANK[s.source] };
  }
  return best && { style: best.style, source: best.source };
}

/** Whether a fight is under way now, and who is in it (the latest change: a player's correction in the panel is just
 *  the state from then on). */
export function fightNow(state: WorldState): { ongoing: boolean; participants: Id[]; source: 'player' | 'engine' | 'ui' | null; since: number | null } {
  const f = state.combat.fights[state.combat.fights.length - 1];
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
  return state.combat.witnessed.some((w) => w.node === nodeId && (!w.part || !part || w.part === part) && w.who.includes(who));
}

export interface WalkedNode { node: CombatNode; depth: number; /** whole text (near) or only the gist (further away). */ full: boolean; /** who in the fight reaches it. */ from: Id[]; via: string }
export interface Walk { nodes: WalkedNode[]; /** reached but left out for the budget. */ cut: Id[]; chars: number }

/** What a fight needs from the combat graph: from the people in it, the place and the objects used, their links
 *  (depth 1) and their precedents, then outward along node links up to maxDepth. The walk never goes into another
 *  entity (from "magic" it does not reach every magus). Nodes up to fullDepth come whole, further ones as their gist.
 *  Order (what the budget keeps first): what the starts are linked to; the original fights between two or more of them;
 *  depth 2; further out; then up to PRECEDENTS_EACH other fights of each (those already over in the story first, the
 *  nearest in time first). Within each, the starts take turns, so no one's long history crowds out another's
 *  abilities. Past the budget the rest is left out (listed in cut). */
export const PRECEDENTS_EACH = 3;
export function walkCombat(L: LoadedPack, state: WorldState, starts: Id[], opts: { maxDepth: number; fullDepth: number; budgetChars: number; tick?: number; /** only what holds without filled-in links (what can stand against the player's words). */ objective?: boolean }): Walk {
  const tick = opts.tick ?? state.clock.lo;
  const seen = new Map<Id, { depth: number; from: Set<Id>; via: string; order: number }>();
  const reach = (node: Id, depth: number, from: Id, via: string) => {
    const s = seen.get(node);
    if (!s) { seen.set(node, { depth, from: new Set([from]), via, order: seen.size }); return true; }
    s.from.add(from);
    if (depth < s.depth) { s.depth = depth; s.via = via; return true; }
    return false;
  };
  for (const e of starts) {
    let frontier: Id[] = [];
    for (const l of linksOf(L, state, e, tick)) { if (opts.objective && l.source === 'fill') continue; reach(l.node, 1, e, `${e} ${l.label}`); frontier.push(l.node); }
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
  const startSet = new Set(starts);
  const startAt = new Map(starts.map((x, i) => [x, i]));
  const when = (n: CombatNode) => (n.event_id ? eventTime(L, n.event_id) : null);
  const tierOf = (n: CombatNode, depth: number) =>
    n.kind === 'precedent' ? ((n.who || []).filter((x) => startSet.has(x)).length >= 2 ? 1 : 4) : depth <= 1 ? 0 : depth === 2 ? 2 : 3;
  const all = [...seen.entries()].map(([id, s]) => {
    const node = L.combat.nodes.get(id)!;
    const from = [...s.from].sort((a, b) => startAt.get(a)! - startAt.get(b)!);
    const t = when(node);
    return { node, depth: s.depth, full: s.depth <= opts.fullDepth, from, via: s.via, tier: tierOf(node, s.depth), order: s.order,
      // precedents: over in the story before now first, then the nearest in time
      past: t && t.hi <= tick ? 0 : 1, distance: t ? Math.abs(t.lo - tick) : Infinity };
  });
  all.sort((a, b) => a.tier - b.tier || b.from.length - a.from.length || a.past - b.past || a.distance - b.distance || a.order - b.order);
  // the starts take turns within each tier (a node's turn: how many of its first start's came before it there)
  const turns = new Map<string, number>(), each = new Map<Id, number>();
  const ranked: (typeof all[number] & { turn: number })[] = [];
  for (const w of all) {
    if (w.tier === 4) {   // only a few other fights of each
      if (!w.from.some((x) => (each.get(x) || 0) < PRECEDENTS_EACH)) continue;
      w.from.forEach((x) => each.set(x, (each.get(x) || 0) + 1));
    }
    const k = `${w.tier}|${w.from[0]}`;
    const turn = turns.get(k) || 0;
    turns.set(k, turn + 1);
    ranked.push({ ...w, turn });
  }
  const list = ranked.sort((a, b) => a.tier - b.tier || a.turn - b.turn || startAt.get(a.from[0])! - startAt.get(b.from[0])!);
  const nodes: WalkedNode[] = [], cut: Id[] = [];
  let chars = 0;
  for (const w of list) {
    const size = (w.full ? w.node.text.length + (w.node.parts || []).reduce((n, p) => n + p.text.length, 0) : w.node.gist.length) + w.node.name.length + 20;
    if (cut.length || (chars + size > opts.budgetChars && nodes.length)) { cut.push(w.node.id); continue; }   // in order: once over, the rest is out
    chars += size;
    nodes.push({ node: w.node, depth: w.depth, full: w.full, from: w.from, via: w.via });
  }
  return { nodes, cut, chars };
}
