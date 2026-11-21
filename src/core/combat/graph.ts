// 战斗: the pack's combat graph — the setting's nodes (concepts, rules, shared abilities, precedents, dangers) joined
// by links, and what the entities are written to have (their aspects: own abilities, links into the setting, what an
// organization or object is in a fight) — and each person's 对抗倾向. Lint and indexes; the walk that takes what a
// fight needs is in state.ts.
import type { CanonPack, CombatLink, CombatNode, Id } from '../domain/types';
import { ABILITY_PARTS } from '../domain/types';
import { packAbilities, packSetting } from '../domain/aspects';

export interface CombatIndex {
  /** none: the pack's reason it has no fighting worth judging (the analysis never runs). */
  none: string | null;
  basis: string;
  /** The setting's nodes, every entity's abilities (owner: the entity) and what an entity is in a fight (id and
   *  owner: the entity itself). */
  nodes: Map<Id, CombatNode>;
  /** Links between nodes by where they start (the setting's links and an ability's links into the setting). */
  linksFrom: Map<Id, CombatLink[]>;
  /** Precedents by the people in them. */
  precedentsOf: Map<Id, Id[]>;
}

export function indexCombat(pack: CanonPack): CombatIndex {
  const c = pack.combat || { none: '' };
  const nodes = new Map((c.nodes || []).map((n) => [n.id, n]));
  const linksFrom = new Map<Id, CombatLink[]>();
  const link = (l: CombatLink) => linksFrom.set(l.from, [...(linksFrom.get(l.from) || []), l]);
  for (const l of c.links || []) link(l);
  if (c.none === undefined) {
    for (const { owner, ability: a } of packAbilities(pack)) {
      nodes.set(a.id, { id: a.id, kind: 'ability', name: a.name, gist: a.gist, text: a.text, parts: a.parts, ...(a.visibility ? { visibility: a.visibility } : {}), source_refs: a.source_refs, ...(a.generated ? { generated: true } : {}), owner, from_event: a.from_event ?? null, until_event: a.until_event ?? null, ...(a.of ? { of: a.of } : {}) });
      for (const l of a.links || []) link({ from: a.id, to: l.to, label: l.label });
    }
    const ents = new Map(pack.entities.map((e) => [e.id, e]));
    for (const { owner, fighting } of packSetting(pack)) {
      if (!fighting) continue;
      const e = ents.get(owner)!;
      nodes.set(owner, { id: owner, kind: 'concept', name: e.name, gist: fighting.gist, text: fighting.text, ...(fighting.visibility ? { visibility: fighting.visibility } : {}), source_refs: e.source_refs, owner });
    }
  }
  const precedentsOf = new Map<Id, Id[]>();
  for (const n of c.nodes || []) if (n.kind === 'precedent') for (const w of n.who || []) precedentsOf.set(w, [...(precedentsOf.get(w) || []), n.id]);
  return { none: c.none !== undefined ? c.none : null, basis: c.basis || '', nodes, linksFrom, precedentsOf };
}

type Report = (p: string, m: string) => void;

/** The combat section: either none (with its reason) or basis + the setting's nodes and links that hold together
 *  with what the entities have; every person has 对抗倾向 when the pack has combat. */
export function lintCombat(pack: CanonPack, err: Report, warn: Report): void {
  const c = pack.combat;
  if (!c) { err('/combat', 'the pack says what confrontations are judged by: combat.none with the reason it has none, or combat.basis with nodes and links'); return; }
  const ents = new Map(pack.entities.map((e) => [e.id, e]));
  const evs = new Set(pack.events.map((e) => e.id));
  const sources = new Set(pack.sources.map((s) => s.id));
  const people = pack.entities.map((e, i) => ({ e, i })).filter((x) => x.e.kind === 'person');
  const withCombat = pack.entities.map((e, i) => ({ e, i })).filter((x) => x.e.aspects && (x.e.aspects.combat_style || x.e.aspects.abilities || x.e.aspects.setting || x.e.aspects.fighting));
  if (c.none !== undefined) {
    if (!c.none.trim()) err('/combat/none', 'none gives the reason the story has no fighting worth judging');
    if (c.basis !== undefined || c.nodes?.length || c.links?.length) err('/combat', 'a pack with combat.none gives no basis, nodes or links');
    for (const { i } of withCombat) warn(`/entities/${i}/aspects`, 'combat aspects (对抗倾向, 能力, 设定归属, 战斗中) in a pack without combat (combat.none)');
    return;
  }
  if (!c.basis?.trim()) err('/combat/basis', 'basis says what the world runs on by default (e.g. real-world physics)');
  const nodes = c.nodes || [];
  if (!nodes.length) err('/combat/nodes', 'a pack with combat has nodes (or says combat.none)');
  const ids = new Set<string>();
  nodes.forEach((n, i) => {
    const at = `/combat/nodes/${i}`;
    if (ids.has(n.id)) err(`${at}/id`, `duplicate node id "${n.id}"`);
    if (ents.has(n.id)) err(`${at}/id`, `"${n.id}" is also an entity id: what belongs to one entity is written on it (aspects), and nodes need their own ids`);
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
    if ((n.hours || n.frequency) && n.kind !== 'danger') err(`${at}`, `hours and frequency are for dangers, not a ${n.kind}`);
    if (n.kind === 'danger' && !n.frequency) err(`${at}/frequency`, 'a danger says how often someone there meets it (common, occasional, rare)');
    if (n.hours && n.hours.from === n.hours.to) err(`${at}/hours`, 'hours from and to are the same: leave hours out for any time of day');
    for (const w of n.who || []) if (!ents.has(w)) err(`${at}/who`, `unknown entity "${w}"`);
    if (n.event_id && !evs.has(n.event_id)) err(`${at}/event_id`, `unknown event "${n.event_id}"`);
    const vis = [n.visibility, ...(n.parts || []).map((p) => p.visibility)].filter(Boolean);
    for (const v of vis) for (const k of v!.knower_ids) if (!ents.has(k)) err(`${at}`, `visibility names an unknown entity "${k}"`);
    for (const s of n.source_refs) if (!sources.has(s)) err(`${at}/source_refs`, `unknown source "${s}"`);
    if (!n.source_refs.length && !n.generated) err(`${at}/source_refs`, 'a node says where it comes from (source_refs), or that a model wrote it (generated: true)');
  });
  // what the entities have: their abilities are nodes too (ids unique with the setting's), their links go to nodes
  const abilities = packAbilities(pack);
  const abilityIds = new Set(abilities.map((x) => x.ability.id));
  for (const id of abilityIds) if (ids.has(id)) err('/combat/nodes', `"${id}" is both a node of the setting and an entity's ability`);
  // what an organization, object or other entity is in a fight (战斗中) is a node too: its id is the entity's
  const fighting = new Set(pack.entities.filter((e) => e.aspects?.fighting).map((e) => e.id));
  const isNode = (id: Id) => ids.has(id) || abilityIds.has(id) || fighting.has(id);
  const reached = new Set<string>();
  const out = new Map<string, string[]>();
  const seen = new Set<string>();
  (c.links || []).forEach((l, i) => {
    const at = `/combat/links/${i}`;
    if (!isNode(l.from) || fighting.has(l.from)) err(`${at}/from`, ents.has(l.from) ? `"${l.from}" is an entity: what it is linked to is written on it (aspects.setting)` : `unknown node "${l.from}"`);
    if (!isNode(l.to)) err(`${at}/to`, ents.has(l.to) ? `"${l.to}" is an entity that says nothing of what it is in a fight (aspects.fighting): a link goes to a node` : `unknown node "${l.to}"`);
    if (l.from === l.to) err(`${at}`, 'a link to itself');
    const key = `${l.from}>${l.to}`;
    if (seen.has(key)) warn(`${at}`, `a second link ${l.from} → ${l.to}`);
    seen.add(key);
    out.set(l.from, [...(out.get(l.from) || []), l.to]);
  });
  const fromEntities = new Set<Id>();
  pack.entities.forEach((e, i) => {
    (e.aspects?.setting || []).forEach((l, j) => {
      if (!isNode(l.node)) err(`/entities/${i}/aspects/setting/${j}/node`, ents.has(l.node) ? `"${l.node}" is an entity that says nothing of what it is in a fight (aspects.fighting); what someone holds or belongs to is a fact of the world (holder, members)` : `unknown node "${l.node}"`);
      if (l.node === e.id) err(`/entities/${i}/aspects/setting/${j}/node`, 'a link to itself');
      reached.add(l.node); fromEntities.add(l.node);
    });
    (e.aspects?.abilities || []).forEach((a, j) => {
      reached.add(a.id);
      (a.links || []).forEach((l, k) => { if (!isNode(l.to)) err(`/entities/${i}/aspects/abilities/${j}/links/${k}/to`, `unknown node "${l.to}"`); out.set(a.id, [...(out.get(a.id) || []), l.to]); });
    });
  });
  for (const n of nodes) if (n.kind === 'precedent' && n.who?.some((w) => ents.has(w))) reached.add(n.id);
  const queue = [...reached];
  while (queue.length) for (const t of out.get(queue.shift()!) || []) if (!reached.has(t)) { reached.add(t); queue.push(t); }
  nodes.forEach((n, i) => { if (n.kind === 'danger' && !fromEntities.has(n.id)) err(`/combat/nodes/${i}`, `the danger "${n.id}" is linked from no place or organization: nobody ever meets it`); });
  nodes.forEach((n, i) => { if (!reached.has(n.id)) warn(`/combat/nodes/${i}`, `no entity reaches "${n.id}" through links: a fight never gets it`); });
  for (const { e, i } of people) {
    if (!e.aspects?.combat_style) err(`/entities/${i}/aspects/combat_style`, 'every person has 对抗倾向 in a pack with combat (start, force, response, limit, stop; "照常人" when nothing sets them apart)');
    if (!e.aspects?.setting?.length && !e.aspects?.abilities?.length) warn(`/entities/${i}`, `"${e.id}" has no abilities and links to nothing of the setting: a fight knows nothing of what they are (link at least what kind of person they are)`);
  }
}
