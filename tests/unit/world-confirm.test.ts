// WCF: a second look at each rewrite or removal the 本局设定 check proposes (engine.secondLook, task world_confirm).
// Live (2026-11-25): in batches of 40 texts the check read "the player lives next to 美琴 and has no roommate" as "美琴
// has no roommate" and rewrote 白井黑子 out of being her roommate, two runs in three; asked about one text at a time,
// step by step, it did so once in nine and kept every real change but one in eighteen.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import type { LoreEntry } from '../../src/core/runtime/lore';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const lore = (uid: number, comment: string, keys: string[], content: string): LoreEntry =>
  ({ book: 'world', uid, title: comment, keys, secondary: [], secondaryLogic: null, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content });
const BOOK = () => [
  lore(1, 'Level 5', ['Level 5'], '学园都市的Level 5共有七人。'),
  lore(2, '白井黑子', ['白井'], '白井黑子是御坂美琴的室友。'),
  lore(3, '旧研究所', ['研究所'], '研究所里有Level 5的资料。'),
];
const CHANGE = '神光爱丽丝是第八位Level 5，住在御坂美琴隔壁，没有室友。';
const PROFILE = { player: { name: '神光爱丽丝', aliases: [], summary: '', public_identity: '' }, affiliations: [], places: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };

async function game(confirm: (i: any) => unknown) {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: '神光爱丽丝', description: '身份: 第8位Level 5 (本局设定)' });
  const book = BOOK();
  x.host.lore = { entries: async () => book, appliesOverrides: false };
  x.model.on('profile', null, PROFILE);
  x.model.on('world_changes', null, { world_changes: [{ text: CHANGE, terms: ['Level 5', '御坂美琴', '白井'] }] });
  x.model.on('world_check', null, (i: any) => ({ items: i.items.map((it: any) => it.title === 'Level 5'
    ? { ref: it.ref, action: 'replace', untrue: ['共有七人'], content: '学园都市的Level 5共有八人。', reason: '第八位' }
    : it.title === '白井黑子' ? { ref: it.ref, action: 'replace', untrue: ['是御坂美琴的室友'], content: '白井黑子是常盘台的学生。', reason: '没有室友' }
      : it.title === '旧研究所' ? { ref: it.ref, action: 'disable', reason: '不存在' } : { ref: it.ref, action: 'keep' }), additions: [] }));
  x.model.on('world_confirm', null, confirm);
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around.');
  x.model.draft('Academy City. [WCF]');
  expect(await x.engine.runOperation('normal')).toBe(true);
  return x;
}
const ws = (x: Awaited<ReturnType<typeof game>>) => x.engine.campaign()!.worldSettings!;

describe('a second look at each rewrite of this game world', () => {
  it('WCF1 a rewrite the second look does not hold up is not made and is listed with why; one it holds up is', async () => {
    const x = await game((i: any) => i.text.title === '白井黑子'
      ? { about: '白井黑子 is 美琴\'s roommate', change_says: '', ok: false, why: 'the player having no roommate says nothing of 美琴\'s' }
      : { about: 'the count', change_says: '神光爱丽丝是第八位Level 5', ok: true, why: '' });
    expect(ws(x).overrides.map((o) => o.title).sort()).toEqual(['Level 5', '旧研究所']);
    expect(ws(x).rejected?.map((r) => r.title)).toEqual(['白井黑子']);
    expect(ws(x).rejected![0].why).toContain("美琴's");
    // each proposed rewrite or removal was asked about on its own, with the words it calls untrue
    const asks = x.model.tasks('world_confirm');
    expect(asks.map((a) => a.input.text.title).sort()).toEqual(['Level 5', '旧研究所', '白井黑子']);
    expect(asks.find((a) => a.input.text.title === '白井黑子')!.input.untrue).toEqual(['是御坂美琴的室友']);
  });

  it('WCF2 a yes that quotes no change is no yes; a second look that fails leaves the verdict', async () => {
    const x = await game((i: any) => {
      if (i.text.title === '白井黑子') return { about: '', change_says: '美琴没有室友', ok: true, why: '' };
      if (i.text.title === '旧研究所') throw new Error('provider down');
      return { about: '', change_says: '第八位Level 5', ok: true, why: '' };
    });
    expect(ws(x).overrides.map((o) => o.title).sort()).toEqual(['Level 5', '旧研究所']);
    expect(ws(x).rejected?.map((r) => r.title)).toEqual(['白井黑子']);
  });
});
