// 战斗: the pack's combat graph — nodes (concepts, rules, abilities, precedents, dangers) joined by links, people,
// places and objects linked to nodes in versions — and each person's 对抗倾向. Lint and indexes; the walk that takes
// what a fight needs is in the runtime (combat analysis).
import type { CanonPack, CombatLink, CombatNode, Id } from './types';
import { ABILITY_PARTS } from './types';

export interface CombatIndex {
  /** none: the pack's reason it has no fighting worth judging (the analysis never runs). */
  none: string | null;
  basis: string;
  nodes: Map<Id, CombatNode>;
  /** Links by where they start (an entity or a node). */
  linksFrom: Map<Id, CombatLink[]>;
  /** Precedents by the people in them. */
  precedentsOf: Map<Id, Id[]>;
}

export function indexCombat(pack: CanonPack): CombatIndex {
  const c = pack.combat || { none: '' };
  const nodes = new Map((c.nodes || []).map((n) => [n.id, n]));
  const linksFrom = new Map<Id, CombatLink[]>();
  for (const l of c.links || []) linksFrom.set(l.from, [...(linksFrom.get(l.from) || []), l]);
  const precedentsOf = new Map<Id, Id[]>();
  for (const n of c.nodes || []) if (n.kind === 'precedent') for (const w of n.who || []) precedentsOf.set(w, [...(precedentsOf.get(w) || []), n.id]);
  return { none: c.none !== undefined ? c.none : null, basis: c.basis || '', nodes, linksFrom, precedentsOf };
}

type Report = (p: string, m: string) => void;

/** The combat section: either none (with its reason) or basis + nodes + links that hold together; every person has
 *  对抗倾向 when the pack has combat. */
export function lintCombat(pack: CanonPack, err: Report, warn: Report): void {
  const c = pack.combat;
  if (!c) { err('/combat', 'the pack says what confrontations are judged by: combat.none with the reason it has none, or combat.basis with nodes and links'); return; }
  const ents = new Map(pack.entities.map((e) => [e.id, e]));
  const evs = new Set(pack.events.map((e) => e.id));
  const sources = new Set(pack.sources.map((s) => s.id));
  const people = pack.entities.map((e, i) => ({ e, i })).filter((x) => x.e.kind === 'person');
  if (c.none !== undefined) {
    if (!c.none.trim()) err('/combat/none', 'none gives the reason the story has no fighting worth judging');
    if (c.basis !== undefined || c.nodes?.length || c.links?.length) err('/combat', 'a pack with combat.none gives no basis, nodes or links');
    for (const { e, i } of people) if (e.combat_style) warn(`/entities/${i}/combat_style`, 'combat_style in a pack without combat (combat.none)');
    return;
  }
  if (!c.basis?.trim()) err('/combat/basis', 'basis says what the world runs on by default (e.g. real-world physics)');
  const nodes = c.nodes || [];
  if (!nodes.length) err('/combat/nodes', 'a pack with combat has nodes (or says combat.none)');
  const ids = new Set<string>();
  nodes.forEach((n, i) => {
    const at = `/combat/nodes/${i}`;
    if (ids.has(n.id)) err(`${at}/id`, `duplicate node id "${n.id}"`);
    if (ents.has(n.id)) err(`${at}/id`, `"${n.id}" is also an entity id: nodes and entities need their own ids`);
    ids.add(n.id);
    if (n.parts && n.kind !== 'ability') err(`${at}/parts`, `parts are for abilities, not a ${n.kind}`);
    if (n.kind === 'ability') {
      const parts = (n.parts || []).map((p) => p.part);
      if (!parts.includes('effect')) err(`${at}/parts`, 'an ability says what it does (a part "effect")');
      if (new Set(parts).size < parts.length) err(`${at}/parts`, 'the same part twice');
      for (const p of parts) if (!ABILITY_PARTS.includes(p)) err(`${at}/parts`, `unknown part "${p}"`);
    }
    if ((n.who || n.event_id) && n.kind !== 'precedent') err(`${at}`, `who and event_id are for precedents, not a ${n.kind}`);
    if (n.kind === 'precedent' && !n.who?.length) err(`${at}/who`, 'a precedent names who was in it');
    for (const w of n.who || []) if (!ents.has(w)) err(`${at}/who`, `unknown entity "${w}"`);
    if (n.event_id && !evs.has(n.event_id)) err(`${at}/event_id`, `unknown event "${n.event_id}"`);
    const vis = [n.visibility, ...(n.parts || []).map((p) => p.visibility)].filter(Boolean);
    for (const v of vis) for (const k of v!.knower_ids) if (!ents.has(k)) err(`${at}`, `visibility names an unknown entity "${k}"`);
    for (const s of n.source_refs) if (!sources.has(s)) err(`${at}/source_refs`, `unknown source "${s}"`);
    if (!n.source_refs.length && !n.generated) err(`${at}/source_refs`, 'a node says where it comes from (source_refs), or that a model wrote it (generated: true)');
  });
  const reached = new Set<string>();
  const out = new Map<string, string[]>();
  const seen = new Set<string>();
  (c.links || []).forEach((l, i) => {
    const at = `/combat/links/${i}`;
    const fromEntity = ents.has(l.from);
    if (!fromEntity && !ids.has(l.from)) err(`${at}/from`, `unknown entity or node "${l.from}"`);
    if (!ids.has(l.to)) err(`${at}/to`, ents.has(l.to) ? `"${l.to}" is an entity: a link goes to a node` : `unknown node "${l.to}"`);
    if (!fromEntity && (l.from_event || l.until_event)) err(`${at}`, 'links between nodes are the setting and always hold: from_event and until_event are for an entity\'s links');
    for (const k of ['from_event', 'until_event'] as const) if (l[k] && !evs.has(l[k]!)) err(`${at}/${k}`, `unknown event "${l[k]}"`);
    if (l.from === l.to) err(`${at}`, 'a link to itself');
    const key = `${l.from}>${l.to}>${l.from_event || ''}`;
    if (seen.has(key)) warn(`${at}`, `a second link ${l.from} → ${l.to} for the same version`);
    seen.add(key);
    if (fromEntity) reached.add(l.to);
    else out.set(l.from, [...(out.get(l.from) || []), l.to]);
  });
  for (const n of nodes) if (n.kind === 'precedent' && n.who?.some((w) => ents.has(w))) reached.add(n.id);
  const queue = [...reached];
  while (queue.length) for (const t of out.get(queue.shift()!) || []) if (!reached.has(t)) { reached.add(t); queue.push(t); }
  nodes.forEach((n, i) => { if (!reached.has(n.id)) warn(`/combat/nodes/${i}`, `no entity reaches "${n.id}" through links: a fight never gets it`); });
  const linked = new Set((c.links || []).filter((l) => ents.has(l.from)).map((l) => l.from));
  for (const { e, i } of people) {
    if (!e.combat_style) err(`/entities/${i}/combat_style`, 'every person has 对抗倾向 in a pack with combat (start, force, response, limit, stop; "照常人" when nothing sets them apart)');
    else e.combat_style.forEach((v, j) => {
      const at = `/entities/${i}/combat_style/${j}`;
      if (j === 0 && v.from_event !== null) err(`${at}/from_event`, 'the first version holds at the story start: from_event must be null');
      if (j > 0 && v.from_event === null) err(`${at}/from_event`, 'a later version starts at an event: from_event is missing');
      for (const k of ['from_event', 'until_event'] as const) if (v[k] && !evs.has(v[k]!)) err(`${at}/${k}`, `unknown event "${v[k]}"`);
    });
    if (!linked.has(e.id)) warn(`/entities/${i}`, `"${e.id}" links to no combat node: a fight knows nothing of what they are (link at least what kind of person they are)`);
  }
  pack.entities.forEach((e, i) => { if (e.combat_style && e.kind !== 'person') warn(`/entities/${i}/combat_style`, `combat_style on a ${e.kind}: it is written for people`); });
}
