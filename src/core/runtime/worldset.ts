// 本局设定: what this game's world changes from the original setting (from the player's Persona, lines marked
// "(本局设定)" always, and changes the user adds by hand), and the lorebook entries and history-pack texts that
// contradict them, rewritten for this game only. The rewritten lorebook entries replace the originals in the host's
// own lore scan where it allows (SillyTavern: src/hosts/sillytavern/lorescan.ts), so the GM sees one consistent
// lorebook and nothing extra (else the GM is told them); the pack's entity descriptions and event summaries are
// overlaid in this chat's pack.
// User design (2026-11-08): no special markup the GM could stumble over, no total size cap (every hit is checked, in
// batches), the check runs with the Persona read.
import type { LoadedPack } from '../domain/pack';
import type { Id, PackEntity, PackEvent } from '../domain/types';
import { hashObject } from '../domain/util';
import { keyMatches, type LoreEntry } from './lore';

/** A line of the Persona that marks a change of the world: `身份: 第8位Level 5 (本局设定)`. */
/** The mark, in Chinese or English: `(本局设定)` or `(world change)`. */
export const WORLD_MARK_RE = /[(（]\s*(?:本局设定|world change)\s*[)）]/i;

export interface WorldChange { id: string; text: string; terms: string[]; source: 'marked' | 'persona' | 'manual' }

/** What one lorebook entry or pack text becomes in this game. */
export interface WorldOverride {
  id: string;
  /** lore: a lorebook entry (book + uid); entity / event: the pack's description / summary. */
  kind: 'lore' | 'entity' | 'event';
  book?: string; uid?: string | number; target?: Id;
  title: string;
  /** A pack entity's name in this game, when its name itself states what a change makes untrue ("七名超能力者");
   *  the original name stays an alias. */
  name?: string;
  action: 'replace' | 'disable';
  content: string;
  /** The text it was written from (a changed original is not overridden until checked again). */
  original: string; originalHash: string;
  reason: string;
  edited?: boolean;
}
export interface WorldAddition { id: string; title: string; keys: string[]; content: string; reason: string; edited?: boolean }

export interface WorldSettings {
  /** The profile revision and manual changes the check was made for. */
  basis: string;
  at: number;
  changes: WorldChange[];
  overrides: WorldOverride[];
  additions: WorldAddition[];
  /** What was read: how many lorebook entries and pack texts each search found, terms too common to search by. */
  checked: { lore: number; entities: number; events: number; generic: string[] };
  /** Rewrites not applied, with why (not a local change of what the change makes untrue). */
  rejected?: { title: string; kind: WorldOverride['kind']; reason: string; why: string }[];
  /** Texts not checked: their part of the check failed twice (timed out or errored); 重新检查 checks again. */
  unchecked?: { title: string; kind: WorldOverride['kind']; why: string }[];
}

export const textHash = (s: string) => hashObject(String(s)).slice(0, 16);

/** Lines marked "(本局设定)" (the mark taken off), in order. */
export function markedLines(persona: string): string[] {
  return String(persona || '').split(/\r?\n/).filter((l) => WORLD_MARK_RE.test(l)).map((l) => l.replace(WORLD_MARK_RE, '').replace(/\s*\/\/\s*$/, '').trim()).filter(Boolean);
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase();
const plainKey = (k: string) => !/^\/.+\/[a-z]*$/s.test(k.trim()) && k.trim().length >= 2;

/** Search words for a change: the ones given, plus lorebook keys and pack names the change's text contains. */
export function termsFor(change: Pick<WorldChange, 'text' | 'terms'>, lore: LoreEntry[], pack: LoadedPack | null): string[] {
  const t = norm(change.text);
  const out = new Set(change.terms.map((x) => x.trim()).filter((x) => x.length >= 2));
  for (const e of lore) for (const k of e.keys) if (plainKey(k) && t.includes(norm(k))) out.add(k.trim());
  if (pack) for (const e of pack.entities.values()) for (const n of [e.name, ...e.aliases]) if (n && n.length >= 2 && t.includes(norm(n))) out.add(n);
  return [...out].slice(0, 24);
}

export interface WorldItem { ref: string; kind: 'lore' | 'entity' | 'event'; title: string; text: string; book?: string; uid?: string | number; target?: Id; hits: string[] }

/** Every lorebook entry (enabled) and pack text a search word finds: in its keys, title or text. A word found in more
 *  than a third of a large lorebook is too common to search by (reported, not used). No size cap: all are checked. */
export function worldItems(terms: string[], lore: LoreEntry[], pack: LoadedPack | null): { items: WorldItem[]; generic: string[] } {
  const live = lore.filter((e) => !e.disabled && e.content.trim());
  const generic: string[] = [];
  const hit = (text: string, term: string) => norm(text).includes(norm(term));
  const loreHits = (e: LoreEntry, term: string) => hit(e.content, term) || hit(e.title, term) || e.keys.some((k) => hit(k, term) || keyMatches(k, term, e));
  const useful = terms.filter((term) => {
    if (live.length >= 60 && live.filter((e) => loreHits(e, term)).length > live.length / 3) { generic.push(term); return false; }
    return true;
  });
  const items: WorldItem[] = [];
  for (const e of live) {
    const hits = useful.filter((term) => loreHits(e, term));
    if (hits.length) items.push({ ref: `l${items.length + 1}`, kind: 'lore', title: e.title || e.keys[0] || String(e.uid), text: e.content, book: e.book, uid: e.uid, hits });
  }
  if (pack) {
    for (const e of pack.entities.values()) {
      const hits = useful.filter((term) => hit(`${e.name} ${e.aliases.join(' ')} ${e.static_description}`, term));
      if (hits.length && e.static_description.trim()) items.push({ ref: `e${items.length + 1}`, kind: 'entity', title: e.name, text: e.static_description, target: e.id, hits });
    }
    for (const ev of pack.events.values()) {
      const hits = useful.filter((term) => hit(`${ev.title} ${ev.summary}`, term));
      if (hits.length) items.push({ ref: `v${items.length + 1}`, kind: 'event', title: ev.title, text: ev.summary, target: ev.id, hits });
    }
  }
  return { items, generic };
}

/** Batches the model reads in full: at most WORLD_BATCH_ITEMS items and about WORLD_BATCH_CHARS characters each. */
export const WORLD_BATCH_ITEMS = 40, WORLD_BATCH_CHARS = 30000;
export function worldBatches(items: WorldItem[]): WorldItem[][] {
  const out: WorldItem[][] = [];
  let cur: WorldItem[] = [], size = 0;
  for (const it of items) {
    if (cur.length && (cur.length >= WORLD_BATCH_ITEMS || size + it.text.length > WORLD_BATCH_CHARS)) { out.push(cur); cur = []; size = 0; }
    cur.push(it); size += it.text.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface WorldCheckOut {
  items: { ref: string; action: 'keep' | 'replace' | 'disable'; content?: string; name?: string; untrue?: string[]; reason?: string }[];
  additions?: { title: string; keys: string[]; content: string; reason?: string }[];
}

/** Sentences with their ending punctuation (a clause after "；" is its own: appending one is adding a sentence). */
export function sentences(text: string): string[] {
  return String(text).split(/(?<=[。！？!?；;\n]|\.\s)/).map((s) => s.trim()).filter(Boolean);
}

/** Why a rewrite is not a local change of what it calls untrue, or null when it is: the words it calls untrue are in
 *  the original, and only sentences holding them changed — none other removed or rewritten, none added. Live: an
 *  entry had a whole paragraph dropped and a sentence about the player added; "the strongest Level 5" became "ranked
 *  first" for a new eighth; old events got "the player was not there yet" appended. */
export function nonLocal(original: string, content: string, untrue: string[], title = ''): string | null {
  const words = untrue.map((w) => String(w).trim()).filter(Boolean);
  if (!words.length) return 'it names no words of the original that the change makes untrue';
  const missing = words.filter((w) => !original.includes(w) && !title.includes(w));
  if (missing.length) return `the words it calls untrue are not in the original: ${missing.join(' / ')}`;
  const a = sentences(original), b = sentences(content);
  // longest common subsequence of sentences: what is left out of it was removed (a) or added (b)
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const removed: string[] = [], added: string[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i >= a.length || dp[i][j + 1] >= dp[i + 1][j])) added.push(b[j++]);
    else removed.push(a[i++]);
  }
  const other = removed.filter((s) => !words.some((w) => s.includes(w)));
  if (other.length) return `it changes or removes what the change does not touch: “${other[0].slice(0, 60)}”`;
  if (added.length > removed.length) return `it adds what the original does not say: “${added.find((s) => !a.includes(s))!.slice(0, 60)}”`;
  return null;
}

/** The checked results as overrides (a replacement must change the text, locally, where it is untrue; nothing
 *  unknown is applied); the rewrites refused, with why. */
export function worldResults(items: WorldItem[], outs: WorldCheckOut[]): { overrides: WorldOverride[]; additions: WorldAddition[]; rejected: NonNullable<WorldSettings['rejected']> } {
  const byRef = new Map(items.map((x) => [x.ref, x]));
  const overrides: WorldOverride[] = [];
  const additions: WorldAddition[] = [];
  const rejected: NonNullable<WorldSettings['rejected']> = [];
  for (const o of outs) {
    for (const r of o.items || []) {
      const it = byRef.get(r.ref);
      if (!it || r.action === 'keep') continue;
      const name = it.kind === 'entity' && r.action === 'replace' ? String(r.name || '').trim().slice(0, 200) : '';
      const renamed = !!name && name !== it.title;
      const content = String(r.content || '').trim() || (renamed ? it.text : '');
      if (r.action === 'replace' && (!content || (content === it.text.trim() && !renamed))) continue;
      if (r.action === 'replace' && content !== it.text.trim()) {
        const why = nonLocal(it.text, content, r.untrue || [], it.title);
        if (why) { rejected.push({ title: it.title, kind: it.kind, reason: String(r.reason || '').trim(), why }); continue; }
      }
      if (overrides.some((x) => x.kind === it.kind && x.book === it.book && String(x.uid) === String(it.uid) && x.target === it.target)) continue;
      overrides.push({
        id: `wo_${textHash(`${it.kind}|${it.book ?? ''}|${it.uid ?? ''}|${it.target ?? ''}`)}`, kind: it.kind, ...(it.book !== undefined ? { book: it.book, uid: it.uid } : {}), ...(it.target ? { target: it.target } : {}),
        title: it.title, ...(renamed ? { name } : {}), action: r.action, content: r.action === 'replace' ? content : '', original: it.text, originalHash: textHash(it.text), reason: String(r.reason || '').trim(),
      });
    }
    for (const a of o.additions || []) {
      const keys = (a.keys || []).map((k) => String(k).trim()).filter(Boolean);
      if (!a.content?.trim() || !keys.length) continue;
      additions.push({ id: `wa_${textHash(`${a.title}|${keys.join(',')}`)}`, title: String(a.title || keys[0]).trim(), keys, content: a.content.trim(), reason: String(a.reason || '').trim() });
    }
  }
  return { overrides, additions, rejected };
}

/** This chat's pack with the overridden entity descriptions and event summaries (same hash: the binding is the
 *  pack's; the texts are this game's). */
export function overlayPack(base: LoadedPack, ws: WorldSettings | undefined): LoadedPack {
  const ov = (ws?.overrides || []).filter((o) => o.kind !== 'lore' && o.target);
  if (!ov.length) return base;
  const entities = new Map(base.entities);
  const events = new Map(base.events);
  for (const o of ov) {
    if (o.kind === 'entity') {
      const e = entities.get(o.target!);
      if (e && textHash(e.static_description) === o.originalHash) {
        entities.set(o.target!, { ...e, static_description: o.action === 'disable' ? '' : o.content, ...(o.name ? { name: o.name, aliases: [...new Set([...e.aliases, e.name])] } : {}) } as PackEntity);
      }
    } else {
      const ev = events.get(o.target!);
      if (ev && textHash(ev.summary) === o.originalHash && o.action === 'replace') events.set(o.target!, { ...ev, summary: o.content, sections: null } as PackEvent);
    }
  }
  return { ...base, entities, events };
}

/** How a lorebook scan applies this game's overrides: by book and uid; one whose original changed is left alone. */
export function loreOverrideMap(ws: WorldSettings | undefined): Map<string, WorldOverride> {
  return new Map((ws?.overrides || []).filter((o) => o.kind === 'lore').map((o) => [`${o.book}|${o.uid}`, o]));
}
