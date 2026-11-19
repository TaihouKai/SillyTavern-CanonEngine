// 战斗分析: a fight is judged before the reply, and the game master only writes the ruling (design: 战斗分析设计稿).
// - The player's message says whether a fight starts, goes on or ends, and who is in it (extract_user `fight`);
//   someone new in it gets an identity there and then.
// - The people in it without anything in the setting that says what they are get it filled in (combat_fill; the
//   lowest source: it never stands against the pack, the lorebook, the Persona or the player).
// - What the fight needs is taken from the combat graph (walkCombat), the lorebook entries about the fighters and the
//   player's Persona; the model rules the turn (combat), the code checks it: the player's words stand unless an
//   objective mechanism (a node the fighters reach without filled-in links, a lorebook entry or the Persona, quoted)
//   stops them; states and who saw what become records of the reply.
import type { CombatLinkChange, CombatSource, Id, RuntimeEntity, SourceRef, StatusChange, StoryTime, StyleChange, Until, Witnessed } from '../domain/types';
import { ABILITY_PARTS } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { normalizeName } from '../domain/pack';
import type { WorldIndex } from '../domain/world-query';
import { fightNow, knowsNode, linksOf, statusesOf, styleOf, walkCombat } from '../domain/combat-state';
import { newId, quoteInText, uniq } from '../domain/util';
import { keyMatch, type LoreEntry } from './lore';
import { callStructured, type ModelPort } from './model';
import { PROMPTS } from './prompts';
import type { RecordDraft } from './types';

export interface FightOut { state: 'none' | 'starts' | 'continues' | 'ends'; participants?: string[]; new_people?: { name: string; description: string; quote: string }[]; why?: string }

const slug = (s: string) => (String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person').slice(0, 24);
const rec = (st: StoryTime, src: SourceRef[], summary: string, extra: Partial<RecordDraft>): RecordDraft => ({
  recordId: newId('rec'), kind: 'combat', storyTime: st, sourceRefs: src, factsSetOrUnset: [], eventOccurrenceIds: [],
  visibility: { mode: 'public', knower_ids: [] }, summary: summary.slice(0, 300), evidenceKind: 'direct', ...extra,
});

/** The fight as the player's message changes it: the record (with the new people it brings in), or none. */
export function fightFromMessage(out: FightOut | null | undefined, index: WorldIndex, text: string, src: SourceRef[], st: StoryTime, playerId: Id | null): { records: RecordDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!out || out.state === 'none' || index.pack.combat.none !== null) return { records: [], warnings };
  const now = fightNow(index.state);
  if (out.state === 'ends') {
    if (!now.ongoing) return { records: [], warnings };
    return { records: [rec(st, src, `The player ended the fight: ${out.why || ''}`, { fight: { ongoing: false, participants: now.participants, source: 'player', why: String(out.why || '').slice(0, 300) } })], warnings };
  }
  const made: RuntimeEntity[] = [];
  const byName = new Map<string, Id>();
  for (const p of out.new_people || []) {
    const name = String(p.name || '').trim();
    if (!name) continue;
    if (!quoteInText(p.quote, text)) { warnings.push(`fight: new person "${name}" left out (their words are not in the message)`); continue; }
    const known = index.resolveEntity(name);
    if (known.ids.length === 1) { byName.set(normalizeName(name), known.ids[0]); continue; }
    const id = `rt.${slug(name)}.${newId('e').slice(2, 8)}`;
    made.push({ id, name, aliases: [], kind: 'person', description: String(p.description || '').slice(0, 300) });
    byName.set(normalizeName(name), id);
  }
  const people: Id[] = [];
  for (const x of out.participants || []) {
    const s = String(x).trim();
    const id = index.entityExists(s) ? s : byName.get(normalizeName(s)) ?? (() => { const r = index.resolveEntity(s); return r.ids.length === 1 ? r.ids[0] : null; })();
    if (id) people.push(id); else warnings.push(`fight: "${s}" is nobody known (left out)`);
  }
  if (playerId && !people.includes(playerId) && people.length) people.unshift(playerId);
  let participants = uniq(people);
  if (out.state === 'continues' && now.ongoing) participants = uniq([...now.participants, ...participants]);
  if (participants.length < 2) { if (out.state === 'starts') warnings.push('fight: fewer than two sides known; no fight recorded'); return { records: [], warnings }; }
  if (now.ongoing && participants.length === now.participants.length && participants.every((p) => now.participants.includes(p)) && !made.length) return { records: [], warnings };
  return { records: [rec(st, src, `Fight: ${participants.map((p) => index.entityName(p) || made.find((m) => m.id === p)?.name || p).join(', ')}`, { fight: { ongoing: true, participants, source: 'player', why: String(out.why || '').slice(0, 300) }, ...(made.length ? { runtimeEntities: made } : {}) })], warnings };
}

export interface CombatSettings { maxDepth: number; fullDepth: number; budgetChars: number }
export const DEFAULT_COMBAT: CombatSettings = { maxDepth: 3, fullDepth: 2, budgetChars: 9000 };

/** One exchange of a ruling as the code accepted it. */
export interface RulingExchange { actor: Id; text: string; basis: { ref: string; quote?: string }[]; unsupported?: boolean; overrides?: { quote: string; why: string } | null }
/** The ruling of one turn: kept with the reply (the panel shows it; the reviewer checks the reply against it). */
export interface Ruling {
  fighters: Id[];
  exchanges: RulingExchange[];
  statuses: StatusChange[];
  witnessed: Witnessed[];
  over: boolean; overWhy: string; stopAt: string;
  /** The player's words that stand where the analysis ruled against them without an objective mechanism. */
  stands: string[];
  /** What was filled in for fighters the setting says nothing about. */
  filled: { links: CombatLinkChange[]; styles: StyleChange[] };
  /** Nodes the walk left out for the budget. */
  cut: Id[];
  notes: string[];
}

interface CombatOut { exchanges: { actor: string; text: string; basis: { ref: string; quote?: string }[]; overrides?: { quote: string; why: string } | null; unsupported?: boolean }[]; statuses: { who: string; text: string; count?: number | null; until?: unknown; node?: string | null; removed?: boolean; quote?: string }[]; witnessed?: { node: string; part?: string | null; who: string[] }[]; over: boolean; over_why?: string; stop_at?: string }
interface FillOut { people: { who: string; links: { node: string; label: string }[]; style?: { start: string; force: string; response: string; limit: string; stop: string } | null }[] }

/** Lorebook entries about someone: an entry whose title is their name, or one of whose keys is in a name of theirs. */
export function loreAbout(entries: LoreEntry[], names: string[]): LoreEntry[] {
  const ns = names.filter((n) => n && n.trim().length >= 2);
  return entries.filter((e) => !e.disabled && e.content.trim() && (ns.some((n) => normalizeName(e.title || '') === normalizeName(n)) || e.keys.some((k) => ns.some((n) => keyMatch(k, n, e) !== null))));
}

const loreRef = (e: LoreEntry) => `lore:${e.book}/${e.uid}`;
const cleanUntil = (u: unknown): Until | undefined => {
  if (u === 'lasting') return 'lasting';
  if (u && typeof u === 'object' && 'minutes' in u && Number.isFinite(Number((u as { minutes: unknown }).minutes)) && Number((u as { minutes: number }).minutes) > 0) return { minutes: Math.round(Number((u as { minutes: number }).minutes)) };
  return undefined;
};

/** Judge this turn of the fight under way (null: none, or the pack has no combat). */
export async function judgeFight(a: {
  port: ModelPort; index: WorldIndex; overlay: (records: RecordDraft[]) => WorldIndex;
  playerId: Id | null; personaName: string; personaText: string; lore: LoreEntry[];
  playerMessage: string; statements: string[]; recent: string; timeLabel: string; places: Id[];
  settings: CombatSettings; signal?: AbortSignal; operationId: string; log?: (l: unknown) => void;
}): Promise<Ruling | null> {
  const L = a.index.pack;
  if (L.combat.none !== null) return null;
  const now = fightNow(a.index.state);
  if (!now.ongoing) return null;
  const fighters = now.participants.filter((id) => a.index.entityExists(id));
  if (fighters.length < 1) return null;
  const notes: string[] = [];
  const name = (id: Id) => (id === a.playerId ? a.personaName || a.index.entityName(id) : a.index.entityName(id));
  const namesOf = (id: Id) => { const e = L.entities.get(id) || a.index.state.runtimeEntities.get(id); return uniq([name(id), ...(e?.aliases || [])].filter(Boolean)); };
  const loreOf = new Map(fighters.map((id) => [id, id === a.playerId ? [] : loreAbout(a.lore, namesOf(id))]));
  const describe = (id: Id) => (L.entities.get(id)?.static_description || a.index.state.runtimeEntities.get(id)?.description || '').slice(0, 600);

  // 1. what nothing says: filled in from the setting's concepts (lowest source, kept with the reply)
  let index = a.index;
  const filled: Ruling['filled'] = { links: [], styles: [] };
  const lacking = fighters.filter((id) => !linksOf(L, index.state, id).length || (id !== a.playerId && !styleOf(L, index.state, id)));
  const concepts = [...L.combat.nodes.values()].filter((n) => n.kind === 'concept');
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
        if (L.combat.nodes.get(l.node)?.kind !== 'concept') { notes.push(`fill: "${l.node}" is not a concept of the setting (left out)`); continue; }
        filled.links.push({ entity: p.who, node: l.node, label: String(l.label || '是').slice(0, 40), source: 'fill' });
      }
      const s = p.style;
      if (p.who !== a.playerId && s && !styleOf(L, index.state, p.who) && [s.start, s.force, s.response, s.limit, s.stop].every((x) => typeof x === 'string' && x.trim()))
        filled.styles.push({ entity: p.who, style: { start: s.start.trim(), force: s.force.trim(), response: s.response.trim(), limit: s.limit.trim(), stop: s.stop.trim() }, source: 'fill' });
    }
    if (filled.links.length || filled.styles.length) index = a.overlay([rec({ lo: a.index.state.clock.lo, hi: a.index.state.clock.lo, precision: 'minute' }, [], 'filled in', { combatLinks: filled.links, styles: filled.styles })]);
  }

  // 2. what the fight needs
  const starts = uniq([...fighters, ...a.places]);
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
  const out = await callStructured<CombatOut>(a.port, 'combat', PROMPTS.combat, {
    basis: L.combat.basis,
    time: a.timeLabel,
    fighters: fighters.map((id) => ({
      id, name: name(id), ...(id === a.playerId ? { player_character: true } : {}), description: describe(id),
      states: statusesOf(index.state, id).map((s) => `${s.text}${s.count != null ? ` ×${s.count}` : ''}`),
      ...(id === a.playerId ? {} : { style: styleOf(L, index.state, id)?.style || null }),
      linked: linksOf(L, index.state, id).map((l) => `${l.label} ${l.node}${l.source === 'fill' ? ' (filled in: a guess)' : ''}`),
    })),
    nodes: walk.nodes.map((w) => ({
      id: w.node.id, kind: w.node.kind, name: w.node.name, reached: w.via,
      ...(w.full ? { text: w.node.text, ...(w.node.parts ? { parts: w.node.parts.map((p) => ({ part: p.part, text: p.text })) } : {}), ...(w.node.who ? { who: w.node.who } : {}) } : { gist: w.node.gist }),
    })),
    sources: [...sourceText].map(([ref, text]) => ({ ref, text: text.slice(0, 3000) })),
    relations, knows,
    player_message: a.playerMessage, statements: a.statements, recent: a.recent.slice(-2000),
  }, { signal: a.signal, operationId: a.operationId, log: a.log });

  // 3. the code's checks
  const basisOk = (b: { ref: string; quote?: string }) => b.ref === 'judgement' || L.combat.nodes.has(b.ref) && walk.nodes.some((w) => w.node.id === b.ref) || (sourceText.has(b.ref) && !!b.quote && quoteInText(b.quote, sourceText.get(b.ref)!));
  const objectiveOk = (b: { ref: string; quote?: string }) => objective.has(b.ref) || (sourceText.has(b.ref) && !!b.quote && quoteInText(b.quote, sourceText.get(b.ref)!));
  const exchanges: RulingExchange[] = [];
  const stands: string[] = [];
  for (const x0 of out.exchanges || []) {
    // an override as words only, or without its reason, is still one (an empty one is none)
    const ov = x0.overrides as unknown;
    const x = { ...x0, overrides: typeof ov === 'string' ? (ov.trim() ? { quote: ov.trim(), why: '' } : null) : ov && typeof ov === 'object' && String((ov as { quote?: string }).quote || '').trim() ? { quote: String((ov as { quote: string }).quote), why: String((ov as { why?: string }).why || '') } : null };
    const actor = fighters.includes(x.actor) ? x.actor : (() => { const r = index.resolveEntity(String(x.actor)); return r.ids.length === 1 && fighters.includes(r.ids[0]) ? r.ids[0] : null; })();
    if (!actor || !String(x.text || '').trim()) { notes.push(`ruling: an exchange of "${x.actor}" left out (not a fighter)`); continue; }
    const basis = (x.basis || []).filter((b) => { const ok = basisOk(b); if (!ok) notes.push(`ruling: basis "${b.ref}" is not in what the fight was given (left out)`); return ok; });
    if (x.overrides) {
      if (!quoteInText(x.overrides.quote, a.playerMessage)) { notes.push(`ruling: an override of words the player did not write was left out`); }
      else if (!basis.some(objectiveOk)) { stands.push(x.overrides.quote); notes.push(`ruling: "${x.overrides.quote}" stands — ruled against without an objective mechanism (${x.overrides.why})`); continue; }
    }
    exchanges.push({ actor, text: String(x.text).trim().slice(0, 800), basis: basis.length ? basis : [{ ref: 'judgement' }], ...(x.unsupported || !basis.length || basis.every((b) => b.ref === 'judgement') ? { unsupported: true } : {}), ...(x.overrides && quoteInText(x.overrides.quote, a.playerMessage) ? { overrides: x.overrides } : {}) });
  }
  const statuses: StatusChange[] = [];
  for (const s of out.statuses || []) {
    const who = fighters.includes(s.who) ? s.who : (() => { const r = index.resolveEntity(String(s.who)); return r.ids.length === 1 && fighters.includes(r.ids[0]) ? r.ids[0] : null; })();
    const text = String(s.text || '').trim().slice(0, 120);
    if (!who || !text) { notes.push(`ruling: a state of "${s.who}" left out (not a fighter)`); continue; }
    const count = typeof s.count === 'number' && Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : null;
    const node = s.node && L.combat.nodes.has(s.node) ? s.node : null;
    statuses.push({ entity: who, text, ...(count !== null ? { count } : {}), ...(cleanUntil(s.until) ? { until: cleanUntil(s.until) } : {}), ...(node ? { node } : {}), ...(s.removed ? { removed: true } : {}), source: 'play' });
  }
  const witnessed: Witnessed[] = [];
  for (const w of out.witnessed || []) {
    if (!L.combat.nodes.has(w.node)) continue;
    const who = (w.who || []).filter((x) => fighters.includes(x) || a.index.entityExists(x));
    if (who.length) witnessed.push({ node: w.node, ...(w.part && (ABILITY_PARTS as readonly string[]).includes(w.part) ? { part: w.part as Witnessed['part'] } : {}), who });
  }
  return { fighters, exchanges, statuses, witnessed, over: !!out.over, overWhy: String(out.over_why || '').slice(0, 300), stopAt: String(out.stop_at || '').slice(0, 300), stands, filled, cut: walk.cut, notes };
}

/** What the ruling records with the reply: what was filled in, the states, who saw what, the fight's end. */
export function rulingRecord(r: Ruling, st: StoryTime, names: (id: Id) => string): RecordDraft {
  return rec(st, [], `Fight ruled: ${r.exchanges.map((x) => `${names(x.actor)}: ${x.text}`).join(' / ')}`, {
    ...(r.filled.links.length ? { combatLinks: r.filled.links } : {}),
    ...(r.filled.styles.length ? { styles: r.filled.styles } : {}),
    ...(r.statuses.length ? { statuses: r.statuses } : {}),
    ...(r.witnessed.length ? { witnessed: r.witnessed } : {}),
    ...(r.over ? { fight: { ongoing: false, participants: r.fighters, source: 'engine' as const, why: r.overWhy } } : {}),
    evidenceKind: 'adjudication',
  });
}

/** The ruling for the game master: binding, in order, to be written as vividly as wanted, and nothing beyond. */
export function rulingSection(r: Ruling, names: (id: Id) => string): string {
  const lines = r.exchanges.map((x, i) => `${i + 1}. ${names(x.actor)}: ${x.text}`);
  const states = r.statuses.map((s) => `${names(s.entity)}: ${s.removed ? 'no longer ' : ''}${s.text}${s.count != null ? ` (${s.count} left)` : ''}`);
  return [
    'COMBAT RULING (binding — Canon Engine judged this turn of the fight before the reply. Write exactly these results, in this order, as vividly as you like: how it looks, sounds and feels is yours. Change no result; add no blow, hit, dodge or move that is not here; nobody wins, loses, is hurt or escapes otherwise. The player character does nothing beyond the player\'s message.)',
    ...lines,
    ...(states.length ? [`After this turn: ${states.join('; ')}.`] : []),
    ...(r.stands.length ? [`The player's words stand as written: ${r.stands.map((q) => `«${q}»`).join(' ')}`] : []),
    r.over ? `The fight ends here${r.overWhy ? `: ${r.overWhy}` : ''}.` : `End the reply at this point${r.stopAt ? `: ${r.stopAt}` : ''} — the player character's next move is the player's.`,
  ].join('\n');
}

/** States a review found in a reply outside a ruling (and the GM-started fight), as the code accepts them. */
export function reviewStatuses(list: { who: string; text: string; count?: number | null; until?: unknown; removed?: boolean; quote: string }[] | undefined, text: string, userText: string, resolve: (x: string) => Id | null, skip: Id[]): { statuses: StatusChange[]; warnings: string[] } {
  const statuses: StatusChange[] = [], warnings: string[] = [];
  for (const s of list || []) {
    if (!quoteInText(s.quote, text) && !quoteInText(s.quote, userText)) { warnings.push(`state "${s.text}" dropped: its words are not in the reply`); continue; }
    const who = resolve(s.who);
    const t = String(s.text || '').trim().slice(0, 120);
    if (!who || !t) { warnings.push(`state "${s.text}" dropped: unknown person "${s.who}"`); continue; }
    if (skip.includes(who)) continue;
    const count = typeof s.count === 'number' && Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : null;
    statuses.push({ entity: who, text: t, ...(count !== null ? { count } : {}), ...(cleanUntil(s.until) ? { until: cleanUntil(s.until) } : {}), ...(s.removed ? { removed: true } : {}), source: 'play' as CombatSource, quote: s.quote.slice(0, 300) });
  }
  return { statuses, warnings };
}

/** For the game master when no fight is under way (a pack with combat): a fight the reply starts stops where it begins. */
export const FIGHT_START_RULE = 'FIGHTS (Canon Engine judges every fight before it is written): if someone in your reply attacks someone or a fight breaks out, write up to the moment it begins — the attack comes, the first move is made — and end the reply there. Do not decide how it goes (who hits, who is hurt, who wins or escapes): Canon Engine judges it on the next turn, after the player has answered.';

/** People's states (状态) for the game master and the reviewer: those of the people here that hold now. */
export function statesSection(index: WorldIndex, ids: Id[], name: (id: Id) => string, tick = index.state.clock.lo): string {
  const lines = uniq(ids).map((id) => ({ id, s: statusesOf(index.state, id, tick) })).filter((x) => x.s.length)
    .map((x) => `- ${name(x.id)} [${x.id}]: ${x.s.map((s) => `${s.text}${s.count != null ? ` ×${s.count}` : ''}${s.endsAt ? ` (until ${Math.max(0, s.endsAt - tick)} min from now)` : ''}`).join('; ')}`);
  return lines.length ? `STATES (状态 of the people here as they stand now — injuries, conditions, what they carry; they hold until the story changes them: show them where they matter, and keep counts as given):\n${lines.join('\n')}` : '';
}
