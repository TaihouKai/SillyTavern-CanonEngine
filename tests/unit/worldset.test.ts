// WS: 本局设定 — this game's changes of the world (Persona lines marked "(本局设定)" always, others the analysis
// finds, the user's own) and the lorebook entries and pack texts that contradict them, rewritten for this game only.
// User design 2026-11-08: no markup the GM could stumble over, every hit checked (batches, no size cap), the rewritten
// entries take the originals' place in SillyTavern's own scan (lorebook files untouched), the pack's texts too.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { validatePackText } from '../../src/domain/pack';
import { playerOrgs, worldChangesOf } from '../../src/runtime/integration';
import { applyLoreScan, markedLines, nonLocal, termsFor, textHash, worldBatches, worldItems, WORLD_BATCH_ITEMS } from '../../src/runtime/worldset';
import { PROMPTS } from '../../src/runtime/prompts';
import type { LoreEntry } from '../../src/runtime/lore';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const lore = (uid: number, comment: string, keys: string[], content: string, more: Partial<LoreEntry> = {}): LoreEntry =>
  ({ book: 'world', uid, comment, keys, secondary: [], selective: false, logic: 0, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content, ...more });
const BOOK = [
  lore(1, 'Level 5', ['Level 5', '超能力者'], '学园都市的Level 5共有七人，第七位是削板军霸。'),
  lore(2, '削板军霸', ['削板'], '削板军霸是第七位，也是最后一位Level 5。'),
  lore(3, '御坂美琴', ['御坂'], '御坂美琴是第三位Level 5。'),
  lore(4, '风纪委员', ['风纪委员'], '学生组成的治安组织。'),
];
const PERSONA = '姓名：田中太郎\n能力：Level 5 火焰能力者\n身份: 第8位Level 5 (本局设定)\n喜欢吃拉面。';
const PROFILE = (world: any[] = []) => ({ player: { name: '田中太郎', aliases: [], summary: '第八位Level 5', public_identity: '' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [], world_changes: world });

describe('this game\'s changes of the world', () => {
  it('WS1 a marked line is always a change (by the code, the mark taken off), with the analysis\' search words when it gave them; others are added', () => {
    expect(markedLines(PERSONA)).toEqual(['身份: 第8位Level 5']);
    expect(markedLines('a\n身份（本局设定）：X')).toEqual(['身份：X']);
    // the analysis missed the marked line: it is there all the same
    expect(worldChangesOf({ world_changes: [{ text: '常盘台有男生', terms: ['常盘台'] }] }, PERSONA)).toEqual([
      { text: '身份: 第8位Level 5', terms: [], marked: true },
      { text: '常盘台有男生', terms: ['常盘台'], marked: false },
    ]);
    // the analysis found it: its search words are kept, it is not listed twice
    expect(worldChangesOf({ world_changes: [{ text: '身份：第8位Level 5', terms: ['Level 5', '第七位'] }] }, PERSONA)).toEqual([{ text: '身份: 第8位Level 5', terms: ['Level 5', '第七位'], marked: true }]);
    expect(PROMPTS.profile).toMatch(/world_changes: how this game's world differs[^\n]*Every line marked "\(本局设定\)" is one/);
  });

  it('WS2 the search: the given words plus lorebook keys and pack names in the change; every entry a word finds in keys, title or text; a word in a third of a big lorebook is too common', () => {
    const terms = termsFor({ text: '身份: 第8位Level 5，比削板还强', terms: ['第七位'] }, BOOK, null);
    expect(terms).toEqual(expect.arrayContaining(['第七位', 'Level 5', '削板']));
    const { items } = worldItems(terms, BOOK, null);
    expect(items.map((x) => x.title)).toEqual(['Level 5', '削板军霸', '御坂美琴']);
    const big = Array.from({ length: 90 }, (_, i) => lore(100 + i, `e${i}`, [`key-${i}-x`], i < 40 ? `学园都市的${i}` : '别的'));
    const r = worldItems(['学园都市', 'key-3-x'], big, null);
    expect(r.generic).toEqual(['学园都市']);
    expect(r.items.map((x) => x.title)).toEqual(['e3']);
    // the pack's descriptions and events are searched too
    const pack = validatePackText(demo).loaded!;
    const p = worldItems(['Council'], [], pack);
    expect(p.items.some((x) => x.kind === 'entity' && x.target === 'council')).toBe(true);
    expect(p.items.some((x) => x.kind === 'event')).toBe(true);
  });

  it('WS3 no size cap: all hits are checked, in batches read in full', () => {
    const many = Array.from({ length: 95 }, (_, i) => ({ ref: `l${i}`, kind: 'lore' as const, title: `t${i}`, text: 'x'.repeat(100), hits: ['x'] }));
    const b = worldBatches(many);
    expect(b.length).toBe(Math.ceil(95 / WORLD_BATCH_ITEMS));
    expect(b.flat()).toHaveLength(95);
  });
});

describe('in the game', () => {
  async function setup(world: any[] = [], persona = PERSONA) {
    const x = makeEngine();
    (x.host as any).persona = () => ({ name: '田中太郎', description: persona });
    (x.host as any).loreEntries = async () => BOOK;
    x.model.on('profile', null, PROFILE(world));
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    return x;
  }

  it('WS4 the Persona read checks the found entries; a contradicted one is rewritten for this game and takes the original\'s place in SillyTavern\'s scan', async () => {
    const x = await setup([{ text: '身份：第8位Level 5', terms: ['Level 5', '第七位', '超能力者'] }]);
    x.model.on('world_check', null, { items: [
      { ref: 'l1', action: 'replace', untrue: ['共有七人'], content: '学园都市的Level 5共有八人，第七位是削板军霸，第八位是田中太郎。', reason: '第8位Level 5' },
      { ref: 'l2', action: 'replace', untrue: ['也是最后一位'], content: '削板军霸是第七位Level 5。', reason: '不再是最后一位' },
      { ref: 'l3', action: 'keep' },
    ], additions: [] });
    x.host.addUser('I look around.');
    x.model.draft('Academy City. [W1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const call = x.model.tasks('world_check')[0].input;
    expect(call.changes).toEqual([expect.objectContaining({ text: '身份: 第8位Level 5' })]);
    expect(call.items.map((i: any) => i.title)).toEqual(['Level 5', '削板军霸', '御坂美琴']);
    expect(call.additions_wanted).toBe(true);
    const ws = x.engine.campaign()!.worldSettings!;
    expect(ws.overrides.map((o) => [o.title, o.action])).toEqual([['Level 5', 'replace'], ['削板军霸', 'replace']]);
    expect(ws.checked).toMatchObject({ lore: 3 });
    // SillyTavern hands over per-scan copies: the rewritten text replaces the original's
    const copies = () => ({ globalLore: BOOK.map((e) => ({ world: e.book, uid: e.uid, content: e.content, key: e.keys })), characterLore: [], chatLore: [] as any[], personaLore: [] });
    const lists = copies();
    const r = applyLoreScan(lists, x.engine.loreScan()!, {});
    expect(r).toEqual({ applied: 2, stale: [] });
    expect(lists.globalLore[0].content).toBe('学园都市的Level 5共有八人，第七位是削板军霸，第八位是田中太郎。');
    expect(lists.globalLore[2].content).toBe(BOOK[2].content);
    expect(BOOK[0].content).toBe('学园都市的Level 5共有七人，第七位是削板军霸。'); // the lorebook itself is untouched
    // the user edited the lorebook entry since: not overridden until checked again
    const changed = copies(); changed.globalLore[1].content = '削板军霸，原石。';
    expect(applyLoreScan(changed, x.engine.loreScan()!, {})).toEqual({ applied: 1, stale: ['削板军霸'] });
    // the engine off for the chat: nothing
    x.engine.campaign()!.enabled = false;
    expect(x.engine.loreScan()).toBeNull();
  });

  it('WS5 the pack\'s texts are this game\'s too; an edit by hand is kept through a new check; disabling and removing', async () => {
    const x = await setup([{ text: 'The Council has no harbor office in this game', terms: ['Council'] }], 'Ash.');
    x.model.on('world_check', null, (i: any) => ({ items: i.items.filter((it: any) => it.kind === 'pack: who or what it is' && it.title === 'The Council').map((it: any) => ({ ref: it.ref, action: 'replace', untrue: ['A rival political institution'], content: 'The Council, without a harbor office.', reason: 'no office' })), additions: [{ title: 'Council office', keys: ['office'], content: 'There is no Council office at the harbor.', reason: 'new' }] }));
    x.host.addUser('I look around.');
    x.model.draft('The harbor. [W2]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.pack().entities.get('council')!.static_description).toBe('The Council, without a harbor office.');
    expect(x.engine.basePack().entities.get('council')!.static_description).not.toBe('The Council, without a harbor office.');
    expect(x.engine.pack().hash).toBe(x.engine.basePack().hash);
    const ws = () => x.engine.campaign()!.worldSettings!;
    const council = ws().overrides.find((o) => o.target === 'council')!;
    await x.engine.editWorld(council.id, 'The Council, by my hand.');
    expect(x.engine.pack().entities.get('council')!.static_description).toBe('The Council, by my hand.');
    await x.engine.recheckWorld();
    expect(ws().overrides.find((o) => o.target === 'council')).toMatchObject({ content: 'The Council, by my hand.', edited: true });
    // an addition joins the chat's lorebook scan
    const lists = { globalLore: [], characterLore: [], chatLore: [] as any[], personaLore: [] };
    applyLoreScan(lists, x.engine.loreScan()!, { order: 100 });
    expect(lists.chatLore[0]).toMatchObject({ comment: 'Council office', key: ['office'], content: 'There is no Council office at the harbor.', order: 100, disable: false });
    await x.engine.editWorld(council.id, null);
    expect(x.engine.pack().entities.get('council')!.static_description).toBe(x.engine.basePack().entities.get('council')!.static_description);
  });

  it('WS6 no change of the world: no check call; the user\'s own changes are checked with 重新检查', async () => {
    const x = await setup([], 'Ash, a dock worker.');
    x.host.addUser('I look around.');
    x.model.draft('The harbor. [W3]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('world_check')).toHaveLength(0);
    expect(x.engine.campaign()!.worldSettings).toBeUndefined();
    await x.engine.setWorldManual(['The Union has no members', '']);
    expect(x.engine.worldView()!.changes).toEqual([expect.objectContaining({ text: 'The Union has no members', source: 'manual' })]);
    await x.engine.recheckWorld();
    expect(x.model.tasks('world_check')).toHaveLength(1);
    expect(x.model.tasks('world_check')[0].input.changes[0].text).toBe('The Union has no members');
  });

  it('WS7 without SillyTavern\'s scan event the GM is given the rewritten entries', async () => {
    const x = await setup([{ text: '身份：第8位Level 5', terms: ['Level 5'] }]);
    x.model.on('world_check', null, { items: [{ ref: 'l1', action: 'replace', untrue: ['共有七人'], content: 'Level 5 共八人。', reason: 'r' }], additions: [] });
    x.host.addUser('I look around.');
    x.model.draft('Academy City. [W4]', 'Academy City again. [W5]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(String(x.model.tasks('draft')[0].input.engineContext)).toMatch(/LOREBOOK IN THIS GAME[^\n]*\n- Level 5: Level 5 共八人。/);
    x.engine.loreHook = true;
    x.host.addUser('I walk on.');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(String(x.model.tasks('draft').at(-1)!.input.engineContext)).not.toMatch(/LOREBOOK IN THIS GAME/);
    expect(textHash('a')).toBe(textHash('a'));
  });

  it('WS8 the check knows when each event is: before the game starts it is not given the player’s present situation; a rewritten event still to come is a spoiler in the panel', async () => {
    const x = makeEngine();
    (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash.' });
    (x.host as any).loreEntries = async () => [];
    x.model.on('profile', null, PROFILE([{ text: 'The Council is taking Ash on as a clerk', terms: ['conflict'] }]));
    x.model.on('world_check', null, (i: any) => ({ items: i.items.filter((it: any) => ['The harbor conflict begins', 'Union victory'].includes(it.title)).map((it: any) => ({ ref: it.ref, action: 'replace', untrue: [it.text.slice(-12)], content: `${it.text}!`, reason: 'r' })), additions: [] }));
    await x.engine.bind(demo, { startTick: tick(2, 12, 0), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I look around.');
    x.model.draft('The harbor. [W8]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const input = x.model.tasks('world_check')[0].input;
    expect(input.game_start).toBe('D2 12:00');
    const item = (title: string) => input.items.find((it: any) => it.title === title);
    expect(item('The harbor conflict begins')).toMatchObject({ time: 'D2 09:00', when: 'before the game starts' });
    expect(item('Union victory')).toMatchObject({ time: 'D4 18:00', when: 'after the game starts (still to come)' });
    expect(PROMPTS.world_check).toMatch(/Never write the player's present situation[^\n]*into an earlier event/);
    const ov = x.engine.worldView()!.overrides;
    expect(ov.map((o) => [o.title, o.future])).toEqual([['The harbor conflict begins', false], ['Union victory', true]]);
  });
  it('WS9 a pack name that states what a change makes untrue is renamed for this game; the old name still finds it', async () => {
    const x = await setup([{ text: 'The Council has nine elders in this game', terms: ['Council'] }], 'Ash.');
    x.model.on('world_check', null, (i: any) => ({ items: i.items.filter((it: any) => it.kind === 'pack: who or what it is' && it.title === 'The Council').map((it: any) => ({ ref: it.ref, action: 'replace', content: '', name: 'The Council of Nine', reason: 'nine elders' })), additions: [] }));
    x.host.addUser('I look around.');
    x.model.draft('The harbor. [W9]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(PROMPTS.world_check).toMatch(/name \(only for "pack: who or what it is" items/);
    const e = x.engine.pack().entities.get('council')!;
    expect(e.name).toBe('The Council of Nine');
    expect(e.aliases).toContain('The Council');
    expect(e.static_description).toBe(x.engine.basePack().entities.get('council')!.static_description);
    expect(x.engine.current!.index.resolveEntity('The Council').ids).toContain('council');
    expect(x.engine.worldView()!.overrides[0]).toMatchObject({ title: 'The Council', name: 'The Council of Nine' });
    // the Persona's organization is shown by its name in this game, not as the Persona analysis read it
    const idx = x.engine.current!.index;
    const profile = { playerId: 'player', affiliations: [{ entityId: 'council', name: 'The Council', role: 'the ninth', status: 'member', secrecy: 'public' }], places: [] } as any;
    expect(playerOrgs(idx, profile, x.engine.current!.replay.state.clock.lo)[0].name).toBe('The Council of Nine');
  });
  it('WS10 a rewrite is refused unless it changes only the sentences with the words it calls untrue (and adds none)', () => {
    const lv5 = '学园都市的Level 5共有七人。第七位是削板军霸。他们各有排名。';
    expect(nonLocal(lv5, '学园都市的Level 5共有八人。第七位是削板军霸。他们各有排名。', ['共有七人'])).toBeNull();
    expect(nonLocal(lv5, lv5.replace('七人', '八人'), [])).toMatch(/names no words/);
    expect(nonLocal(lv5, lv5.replace('七人', '八人'), ['全城仅7人'])).toMatch(/not in the original: 全城仅7人/);
    // live: a whole paragraph dropped and a sentence about the player added
    const hanano = '【人物速写】黑发三束的学生少女。\n华野超美是暗部的联络人，参与招募新成员。';
    expect(nonLocal(hanano, '华野超美是暗部的联络人，参与招募新成员。如今ITEM迎来一名新人。', ['参与招募新成员'])).toMatch(/changes or removes what the change does not touch: “【人物速写】/);
    // live: "the player was not there yet" appended to an old event
    const kaiz = '凯兹雇佣ITEM守卫研究所。结果：ITEM布防完毕。';
    expect(nonLocal(kaiz, '凯兹雇佣ITEM守卫研究所。结果：ITEM布防完毕；新人神光爱丽丝尚未入职，未参与此次布防。', ['ITEM布防完毕'])).toMatch(/adds what the original does not say/);
    // English sentences too
    expect(nonLocal('The Council has seven elders. It meets weekly.', 'The Council has eight elders. It meets weekly.', ['seven elders'])).toBeNull();
    expect(nonLocal('The Council has seven elders. It meets weekly.', 'The Council has eight elders. It meets daily.', ['seven elders'])).toMatch(/does not touch: “It meets weekly/);
    expect(PROMPTS.world_check).toMatch(/A newcomer leaves everyone else's standing as it was/);
  });
  it('WS11 a part of the check that fails is tried once more; failing twice it is left unchecked and listed, and the turn goes on', async () => {
    const x = await setup([{ text: '身份：第8位Level 5', terms: ['Level 5', '第七位', '超能力者'] }]);
    expect(x.engine.campaign()!.worldSettings).toBeUndefined();
    x.model.failTask.world_check = 1;
    x.model.on('world_check', null, { items: [{ ref: 'l1', action: 'replace', untrue: ['共有七人'], content: '学园都市的Level 5共有八人，第七位是削板军霸，第八位是田中太郎。', reason: '第8位' }], additions: [] });
    x.host.addUser('I look around.');
    x.model.draft('Academy City. [W11]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('world_check')).toHaveLength(2);
    let ws = x.engine.campaign()!.worldSettings!;
    expect(ws.overrides.map((o) => o.title)).toEqual(['Level 5']);
    expect(ws.unchecked).toBeUndefined();
    x.model.failTask.world_check = 2;
    await x.engine.recheckWorld();
    ws = x.engine.campaign()!.worldSettings!;
    expect(ws.unchecked!.map((u) => u.title)).toEqual(['Level 5', '削板军霸', '御坂美琴']);
    expect(ws.unchecked![0].why).toMatch(/simulated provider failure/);
    expect(x.engine.worldView()!.unchecked).toHaveLength(3);
  });
});
