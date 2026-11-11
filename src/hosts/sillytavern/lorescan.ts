// 本局设定 in SillyTavern's own World Info scan: this game's rewritten lorebook entries take the originals' place (the
// event hands extensions per-scan copies, so the lorebook files and other chats are untouched).
import { textHash, type WorldAddition, type WorldOverride } from '../../core';

/** One lorebook scan with this game's overrides applied in place (the lists SillyTavern hands to
 *  extensions hold per-scan copies): replaced or disabled by book and uid while the original is the text they were
 *  written from, added entries joining the chat lore. Returns what was applied and what was not (original changed). */
export function applyLoreScan(lists: Record<string, any[]> | null | undefined, scan: { overrides: Map<string, WorldOverride>; additions: WorldAddition[] }, template: Record<string, unknown>): { applied: number; stale: string[] } {
  let applied = 0;
  const stale: string[] = [];
  for (const arr of [lists?.globalLore, lists?.characterLore, lists?.chatLore, lists?.personaLore]) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const o = scan.overrides.get(`${e?.world}|${e?.uid}`);
      if (!o) continue;
      if (textHash(String(e.content || '')) !== o.originalHash) { stale.push(o.title); continue; }
      if (o.action === 'disable') e.disable = true; else e.content = o.content;
      applied++;
    }
  }
  if (scan.additions.length && Array.isArray(lists?.chatLore)) {
    scan.additions.forEach((a, i) => lists!.chatLore.push({ ...template, uid: 990000 + i, world: 'Canon Engine 本局设定', key: [...a.keys], keysecondary: [], comment: a.title, content: a.content, disable: false, constant: false, selective: false }));
  }
  return { applied, stale: [...new Set(stale)] };
}
