// Background from the user's lorebooks (SillyTavern World Info) for reading the Persona: the entries whose keys the
// Persona text contains, as SillyTavern's own scan would find them, plus one hop to the entries those mention. Only
// entries of this world count: an entry whose key or title is the name of a pack entity, and the other entries of
// lorebooks that have such entries (an unrelated lorebook — a style or rules book — contributes nothing).
import type { LoadedPack } from '../domain/pack';
import type { Id } from '../domain/types';

export interface LoreEntry {
  book: string;
  uid: string | number;
  comment: string;
  keys: string[];
  secondary: string[];
  /** SillyTavern: selective + selectiveLogic (0 AND ANY, 1 NOT ALL, 2 NOT ANY, 3 AND ALL) for the secondary keys. */
  selective: boolean;
  logic: number;
  constant: boolean;
  disabled: boolean;
  caseSensitive: boolean | null;
  wholeWords: boolean | null;
  content: string;
}

export interface LoreBackground { title: string; entity_id: Id | null; via: 'persona' | 'related'; text: string }

const norm = (s: string) => s.normalize('NFKC').trim().toLowerCase();

/** One SillyTavern key against a text: "/pattern/flags" is a regex, anything else a substring (case-insensitive unless
 *  the entry says otherwise; whole words only for Latin-script keys). Returns the matched text, or null. */
export function keyMatch(key: string, text: string, e: Pick<LoreEntry, 'caseSensitive' | 'wholeWords'>): string | null {
  const k = key.trim();
  if (!k) return null;
  const re = /^\/(.+)\/([a-z]*)$/s.exec(k);
  if (re) {
    try { return new RegExp(re[1], re[2].replace(/[gy]/g, '')).exec(text)?.[0] ?? null; } catch { return null; }
  }
  const cs = e.caseSensitive === true;
  if (e.wholeWords && /^[\p{Script=Latin}\d\s'’-]+$/u.test(k)) {
    return new RegExp(`(?<![\\p{L}\\d])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\d])`, cs ? 'u' : 'iu').exec(text)?.[0] ?? null;
  }
  const i = (cs ? text : text.toLowerCase()).indexOf(cs ? k : k.toLowerCase());
  return i < 0 ? null : text.slice(i, i + k.length);
}
export const keyMatches = (key: string, text: string, e: Pick<LoreEntry, 'caseSensitive' | 'wholeWords'>) => keyMatch(key, text, e) !== null;

/** Whether an entry fires for a text (its primary keys, then its secondary-key logic). A match on a generic word
 *  (a key many entries of the lorebook share, like 暗部 — also inside a regex key) does not count: it would bring in
 *  every entry of a kind. */
function entryMatches(e: LoreEntry, text: string, generic: Set<string> = new Set()): boolean {
  if (!e.keys.some((k) => { const m = keyMatch(k, text, e); return m !== null && !generic.has(norm(m)); })) return false;
  const sec = e.secondary.filter((k) => k.trim());
  if (!e.selective || !sec.length) return true;
  const hits = sec.filter((k) => keyMatches(k, text, e)).length;
  switch (e.logic) {
    case 1: return hits < sec.length; // NOT ALL
    case 2: return hits === 0; // NOT ANY
    case 3: return hits === sec.length; // AND ALL
    default: return hits > 0; // AND ANY
  }
}

/** The lorebook background for a text (the Persona), within a character budget. */
export function loreFor(entries: LoreEntry[], text: string, pack: LoadedPack, opts: { budgetChars?: number; entryChars?: number; related?: number } = {}): LoreBackground[] {
  const budget = opts.budgetChars ?? 6000;
  const cap = opts.entryChars ?? 800;
  const byName = new Map<string, Id>();
  for (const ent of pack.entities.values()) for (const n of [ent.name, ...(ent.aliases || [])]) if (n && norm(n).length >= 2) byName.set(norm(n), ent.id);
  const usable = entries.filter((e) => !e.disabled && !e.constant && e.content.trim());
  // an entry is about an entity when its title is the entity's name ("SCHOOL（学校）", "BLOCK（区块）": the part
  // before the bracket; 暗部SCHOOL ends with SCHOOL), or else its first key is
  const titled = (e: LoreEntry): Id | null => {
    const t = norm(e.comment || ''), head = norm((e.comment || '').split(/[（(]/)[0]);
    return byName.get(t) || byName.get(head) || (head.length >= 3 ? [...byName].find(([n]) => n.endsWith(head))?.[1] : undefined) || null;
  };
  const about = new Map(usable.map((e) => [e, titled(e)]));
  const tied = new Map(usable.map((e) => [e, about.get(e) || byName.get(norm(e.keys[0] || '')) || null]));
  const worldBooks = new Set(usable.filter((e) => tied.get(e)).map((e) => e.book));
  const pool = usable.filter((e) => worldBooks.has(e.book));

  const out: LoreBackground[] = [];
  const taken = new Set<LoreEntry>();
  let used = 0;
  const add = (e: LoreEntry, via: LoreBackground['via']) => {
    if (taken.has(e)) return;
    const t = e.content.trim();
    const piece = t.length > cap ? t.slice(0, cap - 1) + '…' : t;
    if (used + piece.length > budget) return;
    taken.add(e);
    used += piece.length;
    out.push({ title: e.comment || e.keys[0] || String(e.uid), entity_id: tied.get(e) || null, via, text: piece });
  };
  const uses = new Map<string, number>();
  for (const e of pool) for (const k of new Set(e.keys.map(norm))) uses.set(k, (uses.get(k) || 0) + 1);
  const generic = new Set([...uses].filter(([, n]) => n > 3).map(([k]) => k));
  const direct = pool.filter((e) => entryMatches(e, text, generic));
  // world entries first, then the rest of the world's lorebooks
  for (const e of direct.filter((x) => tied.get(x))) add(e, 'persona');
  for (const e of direct.filter((x) => !tied.get(x))) add(e, 'persona');
  // one hop: the people and organizations of this world named in the found entries (SCHOOL's entry names its
  // leader), first mentioned first, at most `related` of them
  const mentioned = out.map((b) => b.text).join('\n');
  // (not the ones named all over the lorebook, like 学园都市)
  const names = (x: { name: string; aliases?: string[] }) => [x.name, ...(x.aliases || [])].filter((n) => n && n.length >= 2);
  const everywhere = (x: { name: string; aliases?: string[] }) => pool.filter((e) => names(x).some((n) => e.content.includes(n))).length > Math.max(20, pool.length * 0.05);
  const named = [...pack.entities.values()].filter((x) => ['person', 'organization'].includes(x.kind) && !out.some((b) => b.entity_id === x.id))
    .map((x) => ({ x, at: Math.min(...names(x).map((n) => { const i = mentioned.indexOf(n); return i < 0 ? Infinity : i; })) }))
    .filter((n) => n.at < Infinity).sort((a, b) => a.at - b.at).filter((n) => !everywhere(n.x)).slice(0, opts.related ?? 4);
  for (const n of named) { const e = pool.find((x) => about.get(x) === n.x.id && !taken.has(x)); if (e) add(e, 'related'); }
  return out;
}
