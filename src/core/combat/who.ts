// 战斗: what the player's message brings into a fight that the setting knows, though the message does not name it.
// - Someone brought in without a name ("a red-haired girl with a flashlight") may be a person of the world. Live,
//   three were (a teleporter, the fourth and the second Level 5) and were judged as ordinary strangers, so nothing
//   the setting says about them reached the ruling.
// - Something in the scene that no fighter has may be in the setting ("a piercing noise" was a device that stops
//   espers' powers): it is part of the fight from then on, and the walk starts from it too.
// The code picks the people and the things of the setting whose texts share the most with the message's words, and
// a focused call says which of them are meant (combat_who). A stranger the player made up stays a stranger.
import type { Id } from '../domain/types';
import { normalizeName } from '../domain/pack';
import type { WorldIndex } from '../domain/world-query';
import { quoteInText, uniq } from '../domain/util';
import type { LoreEntry } from '../runtime/lore';
import { callStructured, type ModelPort } from '../runtime/model';
import { PROMPTS } from '../runtime/prompts';
import { loreAbout } from './judge';
import type { FightOut } from './message';
import { aspectReader } from '../domain/aspects';
import { combatNodes, fightNow, heldBy, holderOf, linksOf } from './state';

// what telling people apart reads of them besides what they have (linksOf): 常态
const READ = aspectReader(['nature'] as const);

const PER_PERSON = 8;
const MAX_CANDIDATES = 16;
const PER_THING = 5;
const MAX_THINGS = 10;

interface WhoOut { people: { name: string; id: string | null; why?: string }[]; things?: { seen?: number; id: string | null; why?: string }[] }

/** Character pairs of a text (letters and digits only): what two texts share, in any script. singles: each CJK
 *  character too (marked #), for words that differ but share a character: 噪音 and 声音, 头痛 and 头疼 (live, the
 *  noise of an esper-jamming device was described in words none of whose pairs its text has). */
function grams(s: string, singles = false): Set<string> {
  const t = s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const out = new Set<string>();
  for (const w of t.split(' ')) {
    for (let i = 0; i + 1 < w.length; i++) out.add(w.slice(i, i + 2));
    if (singles) for (const ch of w) if (/\p{Script=Han}/u.test(ch)) out.add('#' + ch);
  }
  return out;
}

/** The ids whose texts share the most character pairs with the words (rarer pairs count more), best first. things:
 *  single characters count too, half (the texts were made with them), and a score is for the size of the text, mildly
 *  (a long text would win by its length alone). */
function ranked(texts: Map<Id, Set<string>>, words: string, n: number, things = false): Id[] {
  const df = new Map<string, number>();
  for (const g of texts.values()) for (const x of g) df.set(x, (df.get(x) || 0) + 1);
  const N = texts.size || 1;
  const q = grams(words, things);
  return [...texts.entries()].map(([id, g]) => {
    let s = 0;
    for (const x of q) if (g.has(x)) s += (x.startsWith('#') ? 0.5 : 1) * Math.log(1 + N / (df.get(x) || 1));
    return { id, s: things ? s / Math.sqrt(Math.sqrt(g.size || 1)) : s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.id);
}

/** What the setting and the lorebook say about a person, as one text. */
function personText(index: WorldIndex, id: Id, lore: LoreEntry[]): string {
  const L = index.pack;
  const e = L.entities.get(id)!;
  const n = READ(index, id).nature?.version;
  const nodes = linksOf(L, index.state, id).map((l) => combatNodes(L, index.state).get(l.node)).filter((x) => !!x).map((x) => `${x!.name} ${x!.gist}`);
  const lo = loreAbout(lore, [e.name, ...(e.aliases || [])]).slice(0, 2).map((x) => x.content.slice(0, 1500));
  // what they have on them now is seen too (live: the girl in a white habit with gold trim was not offered as 茵蒂克丝,
  // who wears the 移动教会, "the white habit 茵蒂克丝 wears")
  const held = heldBy(L, index.state, id).map((o) => `${index.entityName(o)} ${L.entities.get(o)?.static_description || ''}`);
  return [e.name, ...(e.aliases || []), e.static_description || '', n ? `${n.habits || ''} ${n.uses || ''} ${n.others || ''}` : '', ...nodes, ...held, ...lo].join('\n');
}

/** The people of the world most like the words about each described newcomer, with the ones near the story now
 *  (`near`) always in. */
export function whoCandidates(index: WorldIndex, words: string[], lore: LoreEntry[], near: Id[] = []): Id[] {
  const L = index.pack;
  const texts = new Map([...L.entities.values()].filter((e) => e.kind === 'person').map((e) => [e.id, grams(personText(index, e.id, lore))]));
  const picked = words.flatMap((w) => ranked(texts, w, PER_PERSON));
  const nearPeople = near.filter((id) => L.entities.get(id)?.kind === 'person');
  return uniq([...nearPeople.slice(0, MAX_CANDIDATES / 2), ...picked]).slice(0, MAX_CANDIDATES);
}

/** The setting's abilities and dangers most like each thing the message shows (its words and what it is), that none
 *  of the fighters has (what they have comes with them), nor the fight already. */
export function thingCandidates(index: WorldIndex, things: string[], fighters: Id[], inFight: Id[] = []): Id[] {
  const L = index.pack;
  if (!things.length) return [];
  const theirs = new Set(fighters.flatMap((f) => linksOf(L, index.state, f).map((l) => l.node)));
  const texts = new Map([...combatNodes(L, index.state).values()].filter((n) => (n.kind === 'ability' || n.kind === 'danger') && !theirs.has(n.id) && !inFight.includes(n.id)).map((n) => [n.id, grams(`${n.name} ${n.gist} ${n.text} ${(n.parts || []).map((x) => x.text).join(' ')}`, true)]));
  return uniq(things.flatMap((w) => ranked(texts, w, PER_THING, true))).slice(0, MAX_THINGS);
}

/** The names of what someone has now: their abilities, and what they hold or belong to. */
function ownNames(index: WorldIndex, id: Id): string[] {
  const L = index.pack, N = combatNodes(L, index.state);
  return uniq(linksOf(L, index.state, id).map((l) => (l.via && l.node === l.via ? index.entityName(l.via) : N.get(l.node)?.kind === 'ability' ? N.get(l.node)!.name : ''))).filter(Boolean).slice(0, 10);
}

/** Says which of the fight's new people are people of the world, and which things of the setting the message shows
 *  in it; writes both into the fight in place (identified people leave new_people). Returns notes for the turn's
 *  warnings. A failed call leaves the fight as it was. */
export async function identifyInFight(a: {
  port: ModelPort; index: WorldIndex; fight: FightOut | null | undefined; text: string; timeLabel: string;
  lore: LoreEntry[]; near: Id[]; signal?: AbortSignal; operationId: string; log?: (l: unknown) => void;
  /** The player character: a fighter whatever the message says (what they have is theirs, read from the Persona like
   *  anyone's: live, a light shield and a light blade of the player's own were matched to other people's). */
  player?: { id: Id } | null;
  /** Whom the message's words already mean (the reading's references with one candidate). */
  known?: { words: string; quote: string; id: Id }[];
}): Promise<string[]> {
  const f = a.fight;
  const L = a.index.pack;
  if (!f || (f.state !== 'starts' && f.state !== 'continues') || L.combat.none !== null) return [];
  const now = fightNow(a.index.state);
  const notes: string[] = [];
  // a newcomer the reading already resolved is that person (live: the man in a white suit was among the fighters as
  // the alchemist the reference named, and as a newcomer too, who was then matched to his double)
  const same = (x: string, y: string) => !!x && !!y && (normalizeName(x) === normalizeName(y) || (y.length >= 4 && x.includes(y)) || (x.length >= 4 && y.includes(x)));
  for (const p of [...(f.new_people || [])]) {
    const k = (a.known || []).find((r) => a.index.entityExists(r.id) && L.entities.get(r.id)?.kind === 'person' && [r.words, r.quote].some((w) => same(String(p.name || ''), w) || same(String(p.quote || ''), w)));
    if (!k) continue;
    f.new_people = (f.new_people || []).filter((x) => x !== p);
    const had = (f.participants || []).map(String).includes(k.id);
    f.participants = uniq((f.participants || []).map((x) => (normalizeName(String(x)) === normalizeName(String(p.name || '')) ? k.id : String(x))).concat(k.id));
    if (!had) f.identified = [...(f.identified || []), { id: k.id, as: String(p.name), why: 'the message refers to them' }];
    notes.push(`fight: "${p.name}" is ${a.index.entityName(k.id)} (the message refers to them)`);
  }
  // a newcomer with an object in hand that the world says someone holds now is that someone (live: the blond thug with
  // the ladies' handgun 滨面 held then was "too ordinary" to be him, and the gun taken from him was nobody's)
  const canHold = L.predicates.get('holder')?.value_type === 'entity_ref';
  const holderNow = (obj: Id): Id | null => { const h = holderOf(L, a.index.state, obj); return h && L.entities.get(h)?.kind === 'person' ? h : null; };
  for (const p of canHold ? [...(f.new_people || [])] : []) {
    const words = `${p.name || ''} ${p.quote || ''}`;
    const by = uniq((a.known || []).filter((r) => L.entities.has(r.id) && L.entities.get(r.id)!.kind !== 'person' && [r.words, r.quote].some((w) => !!w && w.length >= 2 && words.includes(w)))
      .map((r) => holderNow(r.id)).filter((h): h is Id => !!h && h !== a.player?.id));
    const obj = (a.known || []).find((r) => by.length === 1 && holderNow(r.id) === by[0]);
    if (by.length !== 1 || (f.participants || []).map(String).includes(by[0]) || !obj) continue;
    f.new_people = (f.new_people || []).filter((x) => x !== p);
    f.participants = uniq((f.participants || []).map((x) => (normalizeName(String(x)) === normalizeName(String(p.name || '')) ? by[0] : String(x))).concat(by[0]));
    f.identified = [...(f.identified || []), { id: by[0], as: String(p.name), why: `holds ${a.index.entityName(obj.id)}, which ${a.index.entityName(by[0])} holds now` }];
    notes.push(`fight: "${p.name}" is ${a.index.entityName(by[0])} (holds ${a.index.entityName(obj.id)})`);
  }
  const fresh = (f.new_people || []).filter((p) => String(p.name || '').trim() && quoteInText(p.quote, a.text) && a.index.resolveEntity(p.name).ids.length !== 1);
  const fighters = uniq([...(a.player ? [a.player.id] : []), ...(f.participants || []).map(String).filter((x) => a.index.entityExists(x)), ...(f.state === 'continues' && now.ongoing ? now.participants : [])]);
  const people = fresh.length ? whoCandidates(a.index, fresh.map((p) => `${p.name} ${p.description || ''} ${p.quote}`), a.lore, a.near).filter((id) => !fighters.includes(id)) : [];
  const shown = (f.things || []).filter((t) => quoteInText(t.quote, a.text)).slice(0, 12);
  // (only the fighters' own are left out: a candidate's — a device one of them carries — may be what is at work, and
  // live it was: the Capacity Down a gang member holds was never offered for the noise in the gang's ambush)
  const things = thingCandidates(a.index, shown.map((t) => `${t.what || ''} ${t.quote}`), fighters, now.ongoing ? now.things.map((t) => t.node) : []);
  if (!people.length && !things.length) return notes;
  let out: WhoOut;
  try {
    out = await callStructured<WhoOut>(a.port, 'combat_who', PROMPTS.combat_who, {
      message: a.text, time: a.timeLabel,
      // what each fighter has: a thing the message shows that is theirs comes with them (live, a fighter's own
      // flashlight was matched to someone else's flashlight weapon)
      fighters: fighters.map((id) => { const has = ownNames(a.index, id); return `${id} | ${a.index.entityName(id)}${has.length ? ` | has: ${has.join(', ')}` : ''}`; }),
      new_people: fresh.map((p) => ({ name: p.name, description: p.description || '', words: p.quote })),
      candidates: people.map((id) => {
        const e = L.entities.get(id)!; const n = READ(a.index, id).nature?.version;
        const lore = loreAbout(a.lore, [e.name, ...(e.aliases || [])])[0];
        return {
          id, name: e.name, aliases: (e.aliases || []).slice(0, 6), description: (e.static_description || '').slice(0, 300),
          ...(n?.habits ? { habits: n.habits.slice(0, 300) } : {}),
          // what they have in hand now (the world's facts): a gun in the message's hands may be theirs
          ...(heldBy(L, a.index.state, id).length ? { holds: heldBy(L, a.index.state, id).map((o) => a.index.entityName(o)) } : {}),
          abilities: linksOf(L, a.index.state, id).map((l) => combatNodes(L, a.index.state).get(l.node)).filter((x) => x && x.kind === 'ability').slice(0, 6).map((x) => `${x!.name}: ${x!.gist}`.slice(0, 160)),
          ...(lore ? { lorebook: lore.content.slice(0, 500) } : {}),
        };
      }),
      // each seen gets an answer, null allowed (asked for a list of the things at work, live the model listed ones it
      // said were not: "read as an ability application, not a device")
      ...(things.length ? { seen: shown.map((t, i) => ({ n: i + 1, words: t.quote, what: t.what })), things: things.map((id) => { const n = combatNodes(L, a.index.state).get(id)!; return `${id} | ${n.name} | ${n.gist}`; }) } : {}),
    }, { signal: a.signal, operationId: a.operationId, log: a.log });
  } catch (e) {
    if (a.signal?.aborted) throw e;
    return [...notes, `fight: who and what the message brings in was not decided (${String((e as Error).message || e).slice(0, 160)})`];
  }
  const taken = new Set<Id>();
  for (const r of out.people || []) {
    const p = fresh.find((x) => normalizeName(x.name) === normalizeName(r.name || ''));
    if (!p || !r.id) continue;
    if (!people.includes(r.id) || taken.has(r.id)) { notes.push(`fight: "${r.name}" said to be "${r.id}", not a candidate (kept as a newcomer)`); continue; }
    taken.add(r.id);
    f.participants = (f.participants || []).map((x) => (normalizeName(String(x)) === normalizeName(p.name) ? r.id! : x));
    if (!f.participants.includes(r.id)) f.participants.push(r.id);
    f.new_people = (f.new_people || []).filter((x) => x !== p);
    f.identified = [...(f.identified || []), { id: r.id, as: p.name, why: String(r.why || '').slice(0, 300) }];
    notes.push(`fight: "${p.name}" is ${L.entities.get(r.id)!.name} (${String(r.why || '').slice(0, 160)})`);
  }
  // what someone now in the fight has comes with them, not as a thing of its own (live: the flashlight of the
  // teleporter just identified was also put in the fight as a thing at work)
  const owner = (id: Id) => (f.participants || []).map(String).find((p) => a.index.entityExists(p) && linksOf(L, a.index.state, p).some((l) => l.node === id));
  for (const t of out.things || []) {
    if (!t.id) continue;
    if (!things.includes(t.id)) { notes.push(`fight: "${t.id}" is not one of the things offered (left out)`); continue; }
    const o = owner(t.id);
    if (o) { notes.push(`fight: ${combatNodes(L, a.index.state).get(t.id)!.name} comes with ${a.index.entityName(o)} (not a thing of its own)`); continue; }
    if (f.nodes?.some((x) => x.node === t.id)) continue;
    f.nodes = [...(f.nodes || []), { node: t.id, why: String(t.why || '').slice(0, 300) }];
    notes.push(`fight: ${combatNodes(L, a.index.state).get(t.id)!.name} is in it (${String(t.why || '').slice(0, 160)})`);
  }
  return notes;
}
