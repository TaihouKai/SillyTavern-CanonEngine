// 战斗: the player's message starts, goes on with or ends a fight (extract_user `fight`); someone new in it gets an
// identity there and then.
import type { Id, NameBinding, RuntimeEntity, SourceRef, StoryTime } from '../domain/types';
import { normalizeName } from '../domain/pack';
import type { WorldIndex } from '../domain/world-query';
import { newId, quoteInText, uniq } from '../domain/util';
import type { RecordDraft } from '../runtime/types';
import { fightNow } from './state';
import { combatRecord } from './record';

/** extract_user's input about the fight now (a pack without combat: the model is told to leave fight null). */
export function fightNowInput(index: WorldIndex): unknown {
  if (index.pack.combat.none !== null) return 'this pack has no combat: fight is always null';
  const f = fightNow(index.state);
  return f.ongoing ? { ongoing: true, participants: f.participants.map((p) => `${p} | ${index.entityName(p)}`) } : { ongoing: false };
}

export interface FightOut { state: 'none' | 'starts' | 'continues' | 'ends'; participants?: string[]; new_people?: { name: string; description: string; quote: string }[]; why?: string;
  /** What the message shows at work in the fight besides the fighters: its words, and what it is as the model reads it. */
  things?: { quote: string; what: string }[];
  /** Set by identifyInFight: the setting's things the message shows at work in the fight. */
  nodes?: { node: Id; why: string }[] }

const slug = (s: string) => (String(s).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'person').slice(0, 24);

/** The fight as the player's message changes it: the record (with the new people it brings in), or none. names: 称呼
 *  this message's reading found (whom its words mean); at: the story time the message is at. */
export function fightFromMessage(out: FightOut | null | undefined, index: WorldIndex, text: string, src: SourceRef[], st: StoryTime, playerId: Id | null, names: readonly NameBinding[] = [], at?: number): { records: RecordDraft[]; warnings: string[] } {
  const warnings: string[] = [];
  if (!out || out.state === 'none' || index.pack.combat.none !== null) return { records: [], warnings };
  const now = fightNow(index.state);
  if (out.state === 'ends') {
    if (!now.ongoing) return { records: [], warnings };
    return { records: [combatRecord(st, src, `The player ended the fight: ${out.why || ''}`, { fight: { ongoing: false, participants: now.participants, source: 'player', why: String(out.why || '').slice(0, 300) } })], warnings };
  }
  const made: RuntimeEntity[] = [];
  const byName = new Map<string, Id>();
  for (const p of out.new_people || []) {
    const name = String(p.name || '').trim();
    if (!name) continue;
    if (!quoteInText(p.quote, text)) { warnings.push(`fight: new person "${name}" left out (their words are not in the message)`); continue; }
    // (a person: 「扎着双马尾的风纪委员少女」 has 风纪委员 in it, and was the organization, live)
    const known = index.whoOne(name, { text, extra: names, at, kind: 'person' });
    if (known) { byName.set(normalizeName(name), known); continue; }
    const id = `rt.${slug(name)}.${newId('e').slice(2, 8)}`;
    made.push({ id, name, aliases: [], kind: 'person', description: String(p.description || '').slice(0, 300) });
    byName.set(normalizeName(name), id);
  }
  const people: Id[] = [];
  for (const x of out.participants || []) {
    const s = String(x).trim();
    const id = byName.get(normalizeName(s)) ?? index.whoOne(s, { text, extra: names, at, exact: true });
    if (id) people.push(id); else warnings.push(`fight: "${s}" is nobody known (left out)`);
  }
  // everyone new_people brings in is in the fight, however participants calls them (live: the thugs of an ambush were
  // new people, and participants named them otherwise: no fight was recorded)
  people.push(...byName.values());
  if (playerId && !people.includes(playerId) && people.length) people.unshift(playerId);
  let participants = uniq(people);
  if (out.state === 'continues' && now.ongoing) participants = uniq([...now.participants, ...participants]);
  if (participants.length < 2) { if (out.state === 'starts') warnings.push('fight: fewer than two sides known; no fight recorded'); return { records: [], warnings }; }
  if (now.ongoing && participants.length === now.participants.length && participants.every((p) => now.participants.includes(p)) && !made.length && !out.nodes?.length) return { records: [], warnings };
  return { records: [combatRecord(st, src, `Fight: ${participants.map((p) => index.entityName(p) || made.find((m) => m.id === p)?.name || p).join(', ')}`, { fight: { ongoing: true, participants, source: 'player', why: String(out.why || '').slice(0, 300), ...(out.nodes?.length ? { things: out.nodes } : {}) }, ...(made.length ? { runtimeEntities: made } : {}) })], warnings };
}
