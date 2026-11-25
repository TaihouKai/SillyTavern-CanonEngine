// WSR: which words the 本局设定 check searches the world's texts with (worldset.ts searchTerms). Live (2026-11-25, 魔禁,
// a Persona with 8 changes): every text with any word of any change was read in full, 2321 texts at about $0.24 a
// first game, because words like 学园都市 and 御坂美琴 are in a fifth of the world's texts; none of the texts changed
// was found by those words alone.
import { describe, expect, it } from 'vitest';
import { searchTerms, worldItems, SEARCH_WORLD_MIN } from '../../src/core/runtime/worldset';
import type { LoreEntry } from '../../src/core/runtime/lore';

const lore = (uid: number, title: string, keys: string[], content: string): LoreEntry =>
  ({ book: 'world', uid, title, keys, secondary: [], secondaryLogic: null, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content });
/** A large world: 400 entries all in 学园都市, 40 about 御坂美琴 (10%), 8 about 白井 (2%), the Level 5 entry with its
 *  other name, texts that use only that other name, and the dorm. */
function world(): LoreEntry[] {
  const out: LoreEntry[] = [];
  for (let i = 0; i < 400; i++) out.push(lore(i, `地点${i}`, [`地点${i}`], `学园都市的第${i}个地点。` + (i < 40 ? '御坂美琴常来这里。' : '') + (i >= 40 && i < 48 ? '白井黑子在此巡逻。' : '')));
  out.push(lore(500, 'Level 5/超能力者', ['Level 5', '超能力者', 'LV5'], '学园都市的Level 5共有七人。'));
  out.push(lore(501, '大霸星祭', ['大霸星祭'], '学园都市邀请七位超能力者担任宣誓选手。'));
  out.push(lore(502, '常盘台宿舍', ['常盘台宿舍'], '御坂美琴与白井黑子住在常盘台宿舍。'));
  return out;
}
const found = (words: string[], book: LoreEntry[]) => worldItems(words, book, null).items.map((i) => i.title);

describe('the words the 本局设定 check searches with', () => {
  it('WSR1 what a change alters searches, with its other names; a common word it only mentions does not', () => {
    const book = world();
    const { use, common } = searchTerms([{ terms: ['Level 5', '学园都市', '第八位'], alters: ['Level 5'] }], book, null);
    expect(use).toEqual(expect.arrayContaining(['Level 5', '超能力者', 'LV5', '第八位']));
    expect(common).toEqual(['学园都市']);
    const titles = found(use, book);
    expect(titles).toContain('大霸星祭'); // 七位超能力者: found by the other name
    expect(titles).toContain('Level 5/超能力者');
    expect(titles.length).toBeLessThan(10);
  });

  it('WSR2 a change that alters a common thing reads every text about it', () => {
    const book = world();
    const { use } = searchTerms([{ terms: ['御坂美琴'], alters: ['御坂美琴'] }], book, null);
    expect(use).toEqual(['御坂美琴']);
    expect(found(use, book).length).toBe(41);
  });

  it('WSR3 a change only about the player: only its rare words search (a person in 2% of the texts does not)', () => {
    const book = world();
    const { use, common } = searchTerms([{ terms: ['御坂美琴', '白井黑子', '常盘台宿舍'], alters: [] }], book, null);
    expect(use).toEqual(['常盘台宿舍']);
    expect(common).toEqual(['御坂美琴', '白井黑子']);
    expect(found(use, book)).toEqual(['常盘台宿舍']);
    // the same words for a change that alters something: the 2% name searches, the 10% one does not
    const b = searchTerms([{ terms: ['御坂美琴', '白井黑子'], alters: ['常盘台宿舍'] }], book, null);
    expect(b.use.sort()).toEqual(['常盘台宿舍', '白井黑子']);
  });

  it('WSR4 a change added by hand (no altered words given) and a small world search with every word', () => {
    const book = world();
    expect(searchTerms([{ terms: ['学园都市', '御坂美琴'] }], book, null).use).toEqual(['学园都市', '御坂美琴']);
    const small = book.slice(0, SEARCH_WORLD_MIN - 10);
    expect(searchTerms([{ terms: ['学园都市', 'Level 5'], alters: [] }], small, null).use).toEqual(['学园都市', 'Level 5']);
  });

  it("WSR5 what a change alters given as the lorebook entry's title (live: 「Level 5/超能力者」) finds by that entry's keys; a longer name never makes the shorter word in it altered", () => {
    const book = world();
    const { use } = searchTerms([{ terms: ['Level 5', '学园都市', '学园都市统括理事会'], alters: ['Level 5/超能力者', '统括理事会'] }], book, null);
    expect(use).toEqual(expect.arrayContaining(['Level 5', '超能力者', 'LV5', '学园都市统括理事会']));
    expect(use).not.toContain('学园都市');
    expect(found(use, book)).toContain('大霸星祭');
  });
});
