// 战斗分析: a fight is judged before the reply, and the game master only writes the ruling (design: 战斗分析设计稿).
// - The player's message says whether a fight starts, goes on or ends, and who is in it (extract_user `fight`);
//   someone new in it gets an identity there and then.
// - The people in it without anything in the setting that says what they are get it filled in (combat_fill; the
//   lowest source: it never stands against the pack, the lorebook, the Persona or the player).
// - What the fight needs is taken from the combat graph (walkCombat), the lorebook entries about the fighters and the
//   player's Persona; the model rules the turn (combat), the code checks it: the player's words stand unless an
//   objective mechanism (a node the fighters reach without filled-in links, a lorebook entry or the Persona, quoted)
//   stops them; states and who saw what become records of the reply.
import type { CombatLinkChange, FactDelta, Id, StatusChange, StoryTime, StyleChange, Witnessed } from '../domain/types';
import { ABILITY_PARTS } from '../domain/types';
import { normalizeName } from '../domain/pack';
import type { WorldIndex } from '../domain/world-query';
import { quoteInText, uniq } from '../domain/util';
import { keyMatch, type LoreEntry } from '../runtime/lore';
import { callStructured, type ModelPort } from '../runtime/model';
import { PROMPTS } from '../runtime/prompts';
import type { RecordDraft } from '../runtime/types';
import { combatNodes, fightNow, knowsNode, linksOf, statusesOf, styleOf, tiesOf, walkCombat } from './state';
import { cleanUntil, combatRecord as rec } from './record';

export interface CombatSettings { maxDepth: number; fullDepth: number; budgetChars: number }
export const DEFAULT_COMBAT: CombatSettings = { maxDepth: 3, fullDepth: 2, budgetChars: 9000 };

/** One exchange of a ruling as the code accepted it. */
export interface RulingExchange { actor: Id; text: string; basis: { ref: string; quote?: string }[]; unsupported?: boolean }
/** An outcome the player's message states for the player character's own act, and whether it happens as written:
 *  only an objective mechanism (basis) can stop it. */
export interface PlayerOutcome { quote: string; stands: boolean; why: string; basis: { ref: string; quote?: string }[] }
/** The ruling of one turn: kept with the reply (the panel shows it; the reviewer checks the reply against it). */
export interface Ruling {
  fighters: Id[];
  exchanges: RulingExchange[];
  statuses: StatusChange[];
  witnessed: Witnessed[];
  over: boolean; overWhy: string; stopAt: string;
  /** People here who joined the fight this turn on their own. */
  joined: Id[];
  /** Things at work in the fight that stopped this turn (destroyed, switched off, carried off). */
  ended?: Id[];
  /** Objects of the world that changed hands this turn (taken, knocked away, picked up): who holds each now (null:
   *  nobody). They become the facts of who holds them, so what an object brings goes with it. */
  handovers?: { object: Id; to: Id | null }[];
  /** Each outcome the player's message states, standing or stopped by an objective mechanism (the code holds it so). */
  outcomes: PlayerOutcome[];
  /** The player's words that stand although the analysis ruled against them without an objective mechanism. */
  stands: string[];
  /** What was filled in for fighters the setting says nothing about. */
  filled: { links: CombatLinkChange[]; styles: StyleChange[] };
  /** Nodes the walk left out for the budget. */
  cut: Id[];
  notes: string[];
  /** The analysis' own account of how it ruled (for the player, in the panel). */
  reasoning: string;
  /** The nodes the fight was given, in the walk's order: how far out, whole or as the gist, and what reached them. */
  walked: { node: Id; depth: number; full: boolean; from: Id; label: string | null }[];
}

interface CombatOut { reasoning?: string; joins?: string[]; player_outcomes?: { quote: string; stands: boolean; basis?: { ref: string; quote?: string }[]; why?: string }[]; exchanges: { actor: string; text: string; basis: { ref: string; quote?: string }[]; unsupported?: boolean }[]; statuses: { who: string; text: string; count?: number | null; until?: unknown; node?: string | null; removed?: boolean; replaces?: string | null; quote?: string }[]; witnessed?: { node: string; part?: string | null; who: string[] }[]; stops?: { node: string; why?: string }[]; handovers?: { object: string; to: string | null; quote?: string }[]; over: boolean; over_why?: string; stop_at?: string }
interface FillOut { people: { who: string; links: { node: string; label: string }[]; style?: { start: string; force: string; response: string; limit: string; stop: string } | null }[] }

/** Lorebook entries about someone: an entry whose title is their name, or one of whose keys is in a name of theirs. */
export function loreAbout(entries: LoreEntry[], names: string[]): LoreEntry[] {
  const ns = names.filter((n) => n && n.trim().length >= 2);
  return entries.filter((e) => !e.disabled && e.content.trim() && (ns.some((n) => normalizeName(e.title || '') === normalizeName(n)) || e.keys.some((k) => ns.some((n) => keyMatch(k, n, e) !== null))));
}

const loreRef = (e: LoreEntry) => `lore:${e.book}/${e.uid}`;

/** Judge this turn of the fight under way (null: none, or the pack has no combat). */
export async function judgeFight(a: {
  port: ModelPort; index: WorldIndex; overlay: (records: RecordDraft[]) => WorldIndex;
  playerId: Id | null; personaName: string; personaText: string; lore: LoreEntry[];
  /** What anyone may know of the player character (their public identity). */
  playerPublic?: string;
  playerMessage: string; statements: string[]; recent: string; timeLabel: string; places: Id[];
  /** The people here not (yet) in the fight: they may join it on their own. */
  present?: Id[];
  settings: CombatSettings; signal?: AbortSignal; operationId: string; log?: (l: unknown) => void;
}): Promise<Ruling | null> {
  const L = a.index.pack;
  if (L.combat.none !== null) return null;
  const N = combatNodes(L, a.index.state);
  // who holds an object is a fact of the pack's (holder, naming the holder): a ruling can change it only then
  const canHold = L.predicates.get('holder')?.value_type === 'entity_ref';
  const now = fightNow(a.index.state);
  if (!now.ongoing) return null;
  const fighters = now.participants.filter((id) => a.index.entityExists(id));
  const bystanders = uniq((a.present || []).filter((id) => a.index.entityExists(id) && !fighters.includes(id) && id !== a.playerId)).slice(0, 8);
  if (fighters.length < 1) return null;
  const notes: string[] = [];
  const name = (id: Id) => (id === a.playerId ? a.personaName || a.index.entityName(id) : a.index.entityName(id));
  const namesOf = (id: Id) => { const e = L.entities.get(id) || a.index.state.runtimeEntities.get(id); return uniq([name(id), ...(e?.aliases || [])].filter(Boolean)); };
  const loreOf = new Map(fighters.map((id) => [id, id === a.playerId ? [] : loreAbout(a.lore, namesOf(id))]));
  // a link as the analysis reads it: what it is, the node, and what it comes with (an object held, an organization)
  const linkLine = (l: ReturnType<typeof linksOf>[number]) => `${l.label} ${l.node}${l.via && l.via !== l.node ? ` (through ${l.via}, which they ${l.how === 'holds' ? 'hold' : 'belong to'})` : ''}${l.source === 'fill' ? ' (filled in: a guess)' : ''}`;
  const worldNow = (id: Id) => index.entityState(id).facts.filter((f) => index.pack.predicates.get(f.predicate)?.value_type !== 'entity_set').slice(0, 10).map((f) => `${f.predicate}: ${f.display}`.slice(0, 200));
  // the objects of the world someone holds now (the facts): what a ruling may hand over
  const holdsNow = (id: Id) => (canHold ? tiesOf(index.state, id).holds.map((o) => `${o} | ${a.index.entityName(o)}`) : []);
  const describe = (id: Id) => (L.entities.get(id)?.static_description || a.index.state.runtimeEntities.get(id)?.description || '').slice(0, 600);

  // 1. what nothing says: filled in from the setting's concepts (lowest source, kept with the reply)
  let index = a.index;
  const filled: Ruling['filled'] = { links: [], styles: [] };
  const lacking = fighters.filter((id) => !linksOf(L, index.state, id).length || (id !== a.playerId && !styleOf(L, index.state, id)));
  const concepts = [...N.values()].filter((n) => n.kind === 'concept');
  if (lacking.length && concepts.length) {
    const out = await callStructured<FillOut>(a.port, 'combat_fill', PROMPTS.combat_fill, {
      concepts: concepts.map((n) => `${n.id} | ${n.name} | ${n.gist}`),
      people: lacking.map((id) => ({
        who: id, name: name(id), description: describe(id),
        sources: id === a.playerId ? [{ ref: 'persona', text: a.personaText.slice(0, 4000) }] : (loreOf.get(id) || []).slice(0, 4).map((e) => ({ ref: loreRef(e), text: e.content.slice(0, 1500) })),
        needs_style: id !== a.playerId && !styleOf(L, index.state, id),
        has_links: linksOf(L, index.state, id).length > 0,
      })),
      scene: a.recent.slice(-1500), player_message: a.playerMessage,
    }, { signal: a.signal, operationId: a.operationId, log: a.log });
    for (const p of out.people || []) {
      if (!lacking.includes(p.who)) continue;
      if (!linksOf(L, index.state, p.who).length) for (const l of (p.links || []).slice(0, 3)) {
        if (N.get(l.node)?.kind !== 'concept') { notes.push(`fill: "${l.node}" is not a concept of the setting (left out)`); continue; }
        filled.links.push({ entity: p.who, node: l.node, label: String(l.label || '是').slice(0, 40), source: 'fill' });
      }
      const s = p.style;
      if (p.who !== a.playerId && s && !styleOf(L, index.state, p.who) && [s.start, s.force, s.response, s.limit, s.stop].every((x) => typeof x === 'string' && x.trim()))
        filled.styles.push({ entity: p.who, style: { start: s.start.trim(), force: s.force.trim(), response: s.response.trim(), limit: s.limit.trim(), stop: s.stop.trim() }, source: 'fill' });
    }
    if (filled.links.length || filled.styles.length) index = a.overlay([rec({ lo: a.index.state.clock.lo, hi: a.index.state.clock.lo, precision: 'minute' }, [], 'filled in', { combatLinks: filled.links, styles: filled.styles })]);
  }

  // 2. what the fight needs
  // (the people here who may join are walked from too: what they can do is part of the turn)
  // (and the things of the setting at work in it: a device running, an object used)
  const inFight = now.things.map((t) => t.node).filter((x) => N.has(x));
  const starts = uniq([...fighters, ...bystanders, ...a.places, ...inFight]);
  const walk = walkCombat(L, index.state, starts, a.settings);
  const objective = new Set(walkCombat(L, index.state, starts, { ...a.settings, budgetChars: Infinity, objective: true }).nodes.map((w) => w.node.id));
  const sourceText = new Map<string, string>();
  if (a.playerId && a.personaText) sourceText.set('persona', a.personaText);
  for (const es of loreOf.values()) for (const e of es) sourceText.set(loreRef(e), e.content);
  const relations = [];
  for (let i = 0; i < fighters.length; i++) for (let j = i + 1; j < fighters.length; j++) {
    const r = index.relationNow(fighters[i], fighters[j]);
    if (r) relations.push({ people: [fighters[i], fighters[j]], bond: r.bond, views: r.views.map((v) => ({ who: v.who, sees: v.sees })) });
  }
  const knows = fighters.map((who) => ({
    who,
    of: walk.nodes.filter((w) => w.node.kind === 'ability' && !w.from.includes(who)).flatMap((w) => (w.node.parts || [{ part: 'effect' as const, text: '' }]).filter((p) => knowsNode(L, index.state, who, w.node.id, p.part)).map((p) => `${w.node.id}:${p.part}`)),
  }));
  const input = {
    basis: L.combat.basis,
    time: a.timeLabel,
    fighters: fighters.map((id) => ({
      id, name: name(id), ...(id === a.playerId ? { player_character: true, ...(a.playerPublic ? { known_to_all: a.playerPublic.slice(0, 600) } : {}) } : {}), description: describe(id),
      states: statusesOf(index.state, id).map((s) => `${s.text}${s.count != null ? ` ×${s.count}` : ''}`),
      ...(holdsNow(id).length ? { holds: holdsNow(id) } : {}),
      // what the world says of them now (an arm cut off by the story, a condition): live, a judge that had only the
      // fight's own states had 上条 raise the right arm the story had cut off
      ...(worldNow(id).length ? { world_now: worldNow(id) } : {}),
      ...(id === a.playerId ? {} : { style: styleOf(L, index.state, id)?.style || null }),
      linked: linksOf(L, index.state, id).map(linkLine),
    })),
    nodes: walk.nodes.map((w) => ({
      id: w.node.id, kind: w.node.owner === w.node.id ? L.entities.get(w.node.id)?.kind || w.node.kind : w.node.kind, name: w.node.name, ...(w.node.owner && w.node.owner !== w.node.id ? { of: name(w.node.owner) } : {}), ...(w.node.of ? { use_of: w.node.of } : {}), reached: w.viaFrom === w.node.id ? `at work in this fight: ${now.things.find((t) => t.node === w.node.id)?.why || ''}` : w.via,
      ...(w.full ? { text: w.node.text, ...(w.node.parts ? { parts: w.node.parts.map((p) => ({ part: p.part, text: p.text })) } : {}), ...(w.node.who ? { who: w.node.who } : {}) } : { gist: w.node.gist }),
    })),
    sources: [...sourceText].map(([ref, text]) => ({ ref, text: text.slice(0, 3000) })),
    relations, knows,
    present: bystanders.map((id) => ({ id, name: name(id), description: describe(id), style: styleOf(L, index.state, id)?.style || null, linked: linksOf(L, index.state, id).map(linkLine), relations: fighters.map((f) => index.relationNow(id, f)).filter(Boolean).map((r) => r!.bond) })),
    player_message: a.playerMessage, statements: a.statements, recent: a.recent.slice(-2000),
  };
  const ask = (extra: object) => callStructured<CombatOut>(a.port, 'combat', PROMPTS.combat, { ...input, ...extra }, { signal: a.signal, operationId: a.operationId, log: a.log });

  // 3. the code's checks: an outcome the player wrote is stopped only by an objective mechanism (a node the fighters
  // reach without filled-in links; a source's own words). One that is not gets the ruling asked again with it standing.
  // a fighter's 对抗倾向 can be cited for how they act ("style:<id>", with its words); it never stops the player's outcome
  const styleText = (ref: string) => { const id = ref.startsWith('style:') ? ref.slice(6) : ''; const st = fighters.includes(id) || bystanders.includes(id) ? styleOf(L, index.state, id)?.style : null; return st ? [st.start, st.force, st.response, st.limit, st.stop].join(' ') : null; };
  // a part of a node cited as "<node>:<part>" (the way knows lists them) is that node (live: the effect of a jamming
  // device a gang ran was cited so, and left out)
  const fixRef = (b: { ref: string; quote?: string }) => { const r = String(b.ref || ''), i = r.lastIndexOf(':'); return i > 0 && N.has(r.slice(0, i)) && (ABILITY_PARTS as readonly string[]).includes(r.slice(i + 1)) ? { ...b, ref: r.slice(0, i) } : b; };
  const basisOk = (b: { ref: string; quote?: string }) => b.ref === 'judgement' || N.has(b.ref) && walk.nodes.some((w) => w.node.id === b.ref) || (sourceText.has(b.ref) && !!b.quote && quoteInText(b.quote, sourceText.get(b.ref)!)) || (!!b.quote && !!styleText(b.ref) && quoteInText(b.quote, styleText(b.ref)!));
  const objectiveOk = (b: { ref: string; quote?: string }) => objective.has(b.ref) || (sourceText.has(b.ref) && !!b.quote && quoteInText(b.quote, sourceText.get(b.ref)!));
  const checkOutcomes = (o: CombatOut) => {
    const list: PlayerOutcome[] = [], unfounded: string[] = [];
    for (const x of o.player_outcomes || []) {
      const quote = String(x.quote || '').trim();
      if (!quote || !quoteInText(quote, a.playerMessage)) { notes.push(`ruling: an outcome of words the player did not write was left out ("${quote.slice(0, 40)}")`); continue; }
      const basis = (x.basis || []).map(fixRef).filter(basisOk);
      if (!x.stands && !basis.some(objectiveOk)) { unfounded.push(quote); continue; }
      list.push({ quote, stands: !!x.stands, why: String(x.why || '').slice(0, 300), basis: x.stands ? [] : basis });
    }
    return { list, unfounded };
  };
  let out = await ask({});
  let checked = checkOutcomes(out);
  const stands: string[] = [];
  if (checked.unfounded.length) {
    notes.push(`ruling: stopped without an objective mechanism, so they stand: ${checked.unfounded.map((q) => `"${q}"`).join(', ')} (ruled again)`);
    out = await ask({ outcomes_that_stand: checked.unfounded });
    checked = checkOutcomes(out);
    // what still does not hold stands for the game master in any case
    for (const q of checked.unfounded) { stands.push(q); checked.list.push({ quote: q, stands: true, why: 'no objective mechanism stops it', basis: [] }); }
  }
  const outcomes = checked.list;
  const bystander = (x: unknown) => (bystanders.includes(String(x)) ? String(x) : (() => { const r = index.resolveEntity(String(x)); return r.ids.length === 1 && bystanders.includes(r.ids[0]) ? r.ids[0] : null; })());
  // someone present the ruling has act in the fight has joined it, said or not (live: the grudge holder's Level 3
  // friend attacked the player and his exchange was dropped as "not a fighter")
  const joined = uniq([...(out.joins || []), ...(out.exchanges || []).map((x) => x.actor)].map(bystander).filter((x): x is Id => !!x));
  fighters.push(...joined);
  const exchanges: RulingExchange[] = [];
  for (const x of out.exchanges || []) {
    const actor = fighters.includes(x.actor) ? x.actor : (() => { const r = index.resolveEntity(String(x.actor)); return r.ids.length === 1 && fighters.includes(r.ids[0]) ? r.ids[0] : null; })();
    if (!actor || !String(x.text || '').trim()) { notes.push(`ruling: an exchange of "${x.actor}" left out (not a fighter)`); continue; }
    const basis = (x.basis || []).map(fixRef).filter((b) => { const ok = basisOk(b); if (!ok) notes.push(`ruling: basis "${b.ref}" is not in what the fight was given (left out)`); return ok; });
    exchanges.push({ actor, text: String(x.text).trim().slice(0, 800), basis: basis.length ? basis : [{ ref: 'judgement' }], ...(x.unsupported || !basis.length || basis.every((b) => b.ref === 'judgement') ? { unsupported: true } : {}) });
  }
  const statuses: StatusChange[] = [];
  for (const s of out.statuses || []) {
    const who = fighters.includes(s.who) ? s.who : (() => { const r = index.resolveEntity(String(s.who)); return r.ids.length === 1 && fighters.includes(r.ids[0]) ? r.ids[0] : null; })();
    const text = String(s.text || '').trim().slice(0, 120);
    if (!who || !text) { notes.push(`ruling: a state of "${s.who}" left out (not a fighter)`); continue; }
    const count = typeof s.count === 'number' && Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : null;
    let node = s.node && N.has(s.node) ? s.node : null;
    // (live: a wound from a teleported dart named the thrower's ability, and linked it to the one hit)
    if (node && N.get(node)!.kind === 'ability' && !linksOf(L, index.state, who).some((l) => l.node === node) && fighters.some((f) => f !== who && linksOf(L, index.state, f).some((l) => l.node === node))) {
      notes.push(`ruling: the state "${text}" of ${name(who)} names ${N.get(node)!.name}, another fighter's ability (not linked)`);
      node = null;
    }
    // as long as a thing at work in the fight goes on (a headache from a jamming noise): lasting until it stops
    const w = s.until && typeof s.until === 'object' && 'while' in s.until ? String((s.until as { while: unknown }).while) : null;
    if (w && !inFight.includes(w)) notes.push(`ruling: the state "${text}" of ${name(who)} lasts while "${w}", not a thing at work in the fight (lasting)`);
    const until = w ? 'lasting' : cleanUntil(s.until);
    // the state it takes the place of ends (one of theirs now, by its text)
    const old = s.replaces && !s.removed ? statusesOf(index.state, who).find((x) => normalizeName(x.text) === normalizeName(String(s.replaces)) && normalizeName(x.text) !== normalizeName(text)) : undefined;
    if (old) statuses.push({ entity: who, text: old.text, removed: true, source: 'play' });
    else if (s.replaces && !s.removed) notes.push(`ruling: the state "${text}" of ${name(who)} replaces "${String(s.replaces).slice(0, 60)}", which they do not have (kept both)`);
    statuses.push({ entity: who, text, ...(count !== null ? { count } : {}), ...(until ? { until } : {}), ...(w && inFight.includes(w) ? { while: w } : {}), ...(node ? { node } : {}), ...(s.removed ? { removed: true } : {}), source: 'play' });
  }
  const ended: Id[] = [];
  // an object changes hands: one a fighter or someone here holds, to a fighter, someone here or nobody
  const handovers: NonNullable<Ruling['handovers']> = [];
  const heldHere = new Set([...fighters, ...bystanders].flatMap((id) => (canHold ? tiesOf(index.state, id).holds : [])));
  for (const x of out.handovers || []) {
    const obj = String(x.object || '').split('|')[0].trim(), to = x.to ? String(x.to).trim() : null;
    if (!heldHere.has(obj)) { notes.push(`ruling: "${obj}" changes hands, but nobody here holds it (left out)`); continue; }
    if (to && !fighters.includes(to) && !bystanders.includes(to)) { notes.push(`ruling: "${obj}" goes to "${to}", who is not here (left out)`); continue; }
    if (!handovers.some((h) => h.object === obj)) handovers.push({ object: obj, to });
  }
  for (const x of out.stops || []) {
    if (!inFight.includes(x.node)) { notes.push(`ruling: "${x.node}" stops, but it is not a thing at work in the fight (left out)`); continue; }
    if (!ended.includes(x.node)) ended.push(x.node);
  }
  const witnessed: Witnessed[] = [];
  for (const w of out.witnessed || []) {
    if (!N.has(w.node)) continue;
    const who = (w.who || []).filter((x) => fighters.includes(x) || a.index.entityExists(x));
    if (who.length) witnessed.push({ node: w.node, ...(w.part && (ABILITY_PARTS as readonly string[]).includes(w.part) ? { part: w.part as Witnessed['part'] } : {}), who });
  }
  return { fighters, joined, ...(ended.length ? { ended } : {}), ...(handovers.length ? { handovers } : {}), exchanges, statuses, witnessed, over: !!out.over, overWhy: String(out.over_why || '').slice(0, 300), stopAt: String(out.stop_at || '').slice(0, 300), outcomes, stands, filled, cut: walk.cut, notes,
    reasoning: String(out.reasoning || '').trim().slice(0, 1500), walked: walk.nodes.map((w) => ({ node: w.node.id, depth: w.depth, full: w.full, from: w.viaFrom, label: w.viaLabel })) };
}

/** What the ruling records with the reply: what was filled in, the states, who saw what, the fight's end. */
export function rulingRecord(r: Ruling, st: StoryTime, names: (id: Id) => string): RecordDraft {
  const facts: FactDelta[] = (r.handovers || []).map((h) => (h.to ? { op: 'set' as const, entity_id: h.object, predicate: 'holder', value: h.to, until: 'lasting' as const } : { op: 'unset' as const, entity_id: h.object, predicate: 'holder' }));
  return rec(st, [], `Fight ruled: ${r.exchanges.map((x) => `${names(x.actor)}: ${x.text}`).join(' / ')}${(r.handovers || []).map((h) => ` / ${names(h.object)} → ${h.to ? names(h.to) : 'nobody'}`).join('')}`, {
    ...(facts.length ? { factsSetOrUnset: facts } : {}),
    ...(r.filled.links.length ? { combatLinks: r.filled.links } : {}),
    ...(r.filled.styles.length ? { styles: r.filled.styles } : {}),
    ...(r.statuses.length ? { statuses: r.statuses } : {}),
    ...(r.witnessed.length ? { witnessed: r.witnessed } : {}),
    ...(r.over ? { fight: { ongoing: false, participants: r.fighters, source: 'engine' as const, why: r.overWhy } }
      : r.joined.length || r.ended?.length ? { fight: { ongoing: true, participants: r.fighters, source: 'engine' as const, why: [r.joined.length ? `joined: ${r.joined.map(names).join(', ')}` : '', r.ended?.length ? `stopped: ${r.ended.join(', ')}` : ''].filter(Boolean).join('; '), ...(r.ended?.length ? { ended: r.ended } : {}) } } : {}),
    evidenceKind: 'adjudication',
  });
}
