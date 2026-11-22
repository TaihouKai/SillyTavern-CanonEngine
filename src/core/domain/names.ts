// 称呼: whom the words of the story mean. Each step that reads the story — the player's message, who a fight's
// newcomer is, the GM's reply — writes down whom it found words to mean (a description, another name) in its record,
// and every step looks words up through the same table (WorldIndex.whoIs). What one step worked out is never lost to
// the next (live, again and again: the fight knew 「金发混混」 as 滨面 and the reply made him a new person; what the
// player asserted of 「金发混混」 was the words, nobody; the reply's 「爱丽丝」, the player character, was 爱丽丝·异典).
import type { Id, LedgerRecord, NameBinding } from './types';
import { normalizeName } from './pack';

/** How long words that describe someone mean them without being used for them again: the story has left them by then
 *  (another blond thug next week is someone else). The player's own word in the panel holds until taken away. */
export const SCENE_GAP = 180;

export interface NameEntry extends NameBinding { recordId: string; seq: number; tick: number }

/** Words as they stand at a time: whom they mean, from which step, since when and when last used for them. */
export interface NameNow { key: string; words: string; id: Id; source: NameBinding['source']; quote: string; why?: string; since: number; last: number; recordId: string }

/** Whether words describe someone enough to stand for them: at least three CJK characters or two words. A bare word
 *  for a kind of person or thing (混混, 小偷, girl) fits anyone of that kind (live: the reply's 「混混」 was written down
 *  as 滨面, and the next thug would have been him). A nickname is another name, not a description: not asked of it. */
export function describes(words: string): boolean {
  const w = String(words || '').normalize('NFKC').trim();
  const cjk = (w.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  const latin = w.replace(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/g, ' ').split(/[^\p{L}\p{N}]+/u).filter(Boolean).length;
  return cjk >= 3 || latin >= 2 || (cjk >= 2 && latin >= 1);
}

/** Words the player said are not someone (the record that says so). */
export interface NameDenied { words: string; id: Id; recordId: string; since: number }

export const nameKey = (words: string) => normalizeName(words);

export function applyNames(list: NameEntry[], rec: LedgerRecord, tick: number): void {
  for (const n of rec.names || []) if (String(n.words || '').trim() && n.id) list.push({ ...n, recordId: rec.recordId, seq: rec.sequence, tick });
}

/** The words in force at a time, and the words the player said are not someone (`${key}|${id}`).
 *  - The player's word (ui) stands over what the text gave, until taken away.
 *  - Of what the text gave, the latest: words now used for someone else are theirs; the same words for the same one
 *    again keep them (and are used anew).
 *  - Words the text gave are over SCENE_GAP minutes after they were last used for that one.
 *  - Words the player said are not someone are never them from the text again (the player may give them back). */
export function namesAt(list: readonly NameEntry[], tick: number): { now: Map<string, NameNow>; denied: Map<string, NameDenied> } {
  const ui = new Map<string, NameNow>(), text = new Map<string, NameNow>(), denied = new Map<string, NameDenied>();
  const sorted = [...list].sort((a, b) => a.seq - b.seq);
  for (const n of sorted) {
    const key = nameKey(n.words);
    if (!key) continue;
    const pair = `${key}|${n.id}`;
    if (n.removed) {
      if (ui.get(key)?.id === n.id) ui.delete(key);
      if (text.get(key)?.id === n.id) text.delete(key);
      denied.set(pair, { words: n.words.trim(), id: n.id, recordId: n.recordId, since: n.tick });
      continue;
    }
    const entry: NameNow = { key, words: n.words.trim(), id: n.id, source: n.source, quote: n.quote || '', ...(n.why ? { why: n.why } : {}), since: n.tick, last: n.tick, recordId: n.recordId };
    if (n.source === 'ui') { ui.set(key, entry); denied.delete(pair); continue; }
    if (denied.has(pair)) continue;
    const had = text.get(key);
    if (had && had.id === n.id) { had.last = n.tick; had.quote = n.quote || had.quote; if (n.why) had.why = n.why; } else text.set(key, entry);
  }
  const now = new Map<string, NameNow>(ui);
  for (const [k, n] of text) if (!now.has(k) && tick - n.last <= SCENE_GAP) now.set(k, n);
  return { now, denied };
}

/** Words a step found in the text it read, as a binding: only words that say something (a pronoun means whoever the
 *  sentence is about, and is never written down), with their quote. */
const PRONOUN = /^(我|你|您|他|她|它|祂|我们|你们|他们|她们|它们|咱|咱们|自己|对方|其|此人|那人|这人|i|me|you|he|him|she|her|it|they|them|we|us|myself|yourself|himself|herself|themselves)$/i;
/** Words that only point at someone — a demonstrative and a word for anyone (那家伙, 这位先生, that guy): they say
 *  nothing of whom, and mean whoever the sentence is about (live: the reply's 「那家伙」 and 「这位先生」 were written down
 *  as 滨面, 「那边」 as a street); so do words that only point at a place (那边, 这里, there). */
const POINTER = /^(那|这|那个|这个|那位|这位|那名|这名)(家伙|人|位|先生|小姐|女士|男人|女人|男的|女的|少年|少女|男生|女生|孩子|小子|丫头|姑娘|大叔|大姐|老头|小鬼|混蛋|东西)$|^(那边|这边|那里|这里|那儿|这儿|此处|彼处|那头|这头|对面|附近)$|^(that|this|the)(guy|man|woman|person|one|girl|boy|kid|lady|gentleman|fellow|bastard|place|spot)$|^(here|there|overthere)$/i;
export function bindingFrom(words: unknown, id: Id, quote: unknown, source: NameBinding['source'], why?: string): NameBinding | null {
  const w = String(words || '').trim().slice(0, 80);
  const k = nameKey(w);
  if (k.length < 2 || PRONOUN.test(k) || POINTER.test(k) || !id) return null;
  return { words: w, id, quote: String(quote || w).slice(0, 200), source, ...(why ? { why: why.slice(0, 300) } : {}) };
}
