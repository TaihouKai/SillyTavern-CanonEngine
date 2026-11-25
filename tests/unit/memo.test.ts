// ME: 历史包备忘 (runtime/memo.ts) — model answers that depend only on what was asked, kept next to the pack: a new
// game with the same pack, Persona and lorebook asks none of them again. User, 2026-11-23: "每个chat load history
// pack的预处理我感觉大多数内容都是一样的" (live: the lorebook check was 45–115 calls of every first turn).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { MEMO_MAX, PackMemo, type MemoStore } from '../../src/core/runtime/memo';
import type { LoreEntry } from '../../src/core/runtime/lore';
import { PROMPTS } from '../../src/core/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const lore = (uid: number, comment: string, keys: string[], content: string): LoreEntry =>
  ({ book: 'world', uid, title: comment, keys, secondary: [], secondaryLogic: null, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content });
const BOOK = () => [
  lore(1, 'Level 5', ['Level 5', '超能力者'], '学园都市的Level 5共有七人，第七位是削板军霸。'),
  lore(2, '削板军霸', ['削板'], '削板军霸是第七位，也是最后一位Level 5。'),
  lore(3, '御坂美琴', ['御坂'], '御坂美琴是第三位Level 5。'),
];
const PERSONA = '姓名：田中太郎\n能力：Level 5 火焰能力者\n身份: 第8位Level 5 (本局设定)';
const PROFILE = { player: { name: '田中太郎', aliases: [], summary: '第八位Level 5', public_identity: '' }, affiliations: [], places: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
const CHANGES = { world_changes: [{ text: '身份：第8位Level 5', terms: ['Level 5', '第七位'] }] };

function store(): MemoStore & { files: Map<string, string>; saves: number } {
  const files = new Map<string, string>();
  const s = { files, saves: 0, load: async (h: string) => files.get(h) ?? null, save: async (h: string, t: string) => { s.saves++; files.set(h, t); } };
  return s;
}

/** A new game in its own chat: the same pack, the Persona, the lorebook, the memo store shared. */
async function game(memo: MemoStore | undefined, opts: { persona?: string; book?: LoreEntry[]; start?: number } = {}) {
  const x = makeEngine();
  x.host.memo = memo;
  (x.host as any).persona = () => ({ name: '田中太郎', description: opts.persona ?? PERSONA });
  const book = opts.book || BOOK();
  x.host.lore = { entries: async () => book, appliesOverrides: false };
  x.model.on('profile', null, PROFILE);
  x.model.on('world_changes', null, CHANGES);
  x.model.on('world_check', null, (i: any) => ({ items: i.items.map((it: any) => it.title === 'Level 5'
    ? { ref: it.ref, action: 'replace', untrue: ['共有七人'], content: '学园都市的Level 5共有八人，第七位是削板军霸。', reason: '第8位' }
    : { ref: it.ref, action: 'keep' }), additions: i.additions_wanted ? [{ title: '田中太郎', keys: ['田中'], content: '第八位Level 5。', reason: 'new' }] : [] }));
  await x.engine.bind(demo, { startTick: opts.start ?? tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around.');
  x.model.draft('Academy City. [ME]');
  expect(await x.engine.runOperation('normal')).toBe(true);
  return x;
}
const asked = (x: Awaited<ReturnType<typeof game>>, task: string) => x.model.tasks(task as any).length;
const view = (x: Awaited<ReturnType<typeof game>>) => { const ws = x.engine.campaign()!.worldSettings!; return { overrides: ws.overrides.map((o) => [o.title, o.action, o.content]), additions: ws.additions.map((a) => a.content), checked: ws.checked }; };

describe("the pack's memo", () => {
  it('ME1 a second game with the same Persona asks nothing about the Persona or the lorebook again, and gets the same', async () => {
    const s = store();
    const a = await game(s);
    expect(asked(a, 'profile')).toBe(1);
    expect(asked(a, 'world_check')).toBeGreaterThan(0);
    expect(s.files.size).toBe(1);
    const b = await game(s);
    for (const t of ['profile', 'world_changes', 'affiliations', 'persona_abilities', 'world_check']) expect(asked(b, t)).toBe(0);
    expect(view(b)).toEqual(view(a));
    expect(view(b).overrides).toEqual([['Level 5', 'replace', '学园都市的Level 5共有八人，第七位是削板军霸。']]);
    expect(view(b).additions).toEqual(['第八位Level 5。']);
    expect(b.engine.playerProfile()!.profile.summary).toBe(a.engine.playerProfile()!.profile.summary);
    // without a store, every game asks
    const c = await game(undefined);
    expect(asked(c, 'profile')).toBe(1);
  });

  it('ME2 what changed is asked again, only that: an edited lorebook entry; another Persona asks everything', async () => {
    const s = store();
    await game(s);
    const book = BOOK(); book[2] = { ...book[2], content: '御坂美琴是第三位Level 5，常盘台的王牌。' };
    const b = await game(s, { book });
    expect(asked(b, 'profile')).toBe(0);
    const items = b.model.tasks('world_check').flatMap((t) => t.input.items.map((i: any) => i.title));
    expect(items).toEqual(['御坂美琴']);
    // the additions were known: not asked for again
    expect(b.model.tasks('world_check')[0].input.additions_wanted).toBe(false);
    expect(view(b).additions).toEqual(['第八位Level 5。']);
    const c = await game(s, { persona: PERSONA + '\n喜欢吃拉面。' });
    expect(asked(c, 'profile')).toBe(1);
  });

  it("ME7 a game started at another time takes the same 本局设定 and every verdict: the Persona's changes are its own, read apart from what depends on the time", async () => {
    const s = store();
    const a = await game(s);
    const b = await game(s, { start: tick(1, 7, 0) });
    expect(asked(b, 'world_changes')).toBe(0);
    expect(asked(b, 'world_check')).toBe(0);
    expect(view(b).overrides).toEqual(view(a).overrides);
    // the check is given the player by name only: nothing of the start-dependent reading is in its question
    expect(a.model.tasks('world_check')[0].input.player).toEqual({ name: '田中太郎' });
    expect(a.model.tasks('world_changes')[0].input).not.toHaveProperty('registry');
  });

  it('ME3 重新检查 asks every text again and keeps the new answers for the next game', async () => {
    const s = store();
    const a = await game(s);
    const n = a.model.tasks('world_check').flatMap((t) => t.input.items).length;
    a.model.on('world_check', null, (i: any) => ({ items: i.items.map((it: any) => ({ ref: it.ref, action: 'keep' })), additions: [] }));
    await a.engine.recheckWorld();
    expect(a.model.tasks('world_check').flatMap((t) => t.input.items).length).toBe(2 * n);
    expect(view(a).overrides).toEqual([]);
    const b = await game(s);
    expect(asked(b, 'world_check')).toBe(0);
    expect(view(b).overrides).toEqual([]);
    expect(view(b).additions).toEqual([]);
  });

  it('ME4 a failed part is not kept: the next game asks it again', async () => {
    const s = store();
    const x = makeEngine();
    x.host.memo = s;
    (x.host as any).persona = () => ({ name: '田中太郎', description: PERSONA });
    x.host.lore = { entries: async () => BOOK(), appliesOverrides: false };
    x.model.on('profile', null, PROFILE);
    x.model.on('world_changes', null, CHANGES);
    x.model.failTask.world_check = 2;
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I look around.');
    x.model.draft('Academy City. [ME4]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.campaign()!.worldSettings!.unchecked!.length).toBeGreaterThan(0);
    const b = await game(s);
    expect(asked(b, 'profile')).toBe(0);
    expect(asked(b, 'world_check')).toBe(1);
  });

  it('ME5 an unreadable or foreign memo file starts empty; the oldest entries go first past the limit', async () => {
    const warn: string[] = [];
    const s = store();
    s.files.set('h1', '{not json');
    const m = new PackMemo(s, 'h1', () => 1, (w) => warn.push(w));
    expect(await m.get('k')).toBeUndefined();
    expect(warn[0]).toMatch(/could not be read/);
    s.files.set('h2', JSON.stringify({ v: 1, pack: 'other', entries: { k: { at: 1, out: 5 } } }));
    expect(await new PackMemo(s, 'h2', () => 1, () => undefined).get('k')).toBeUndefined();
    let t = 0;
    const big = new PackMemo(s, 'h3', () => ++t, () => undefined);
    for (let i = 0; i < MEMO_MAX + 5; i++) await big.put(`k${i}`, i);
    await big.get('k0'); // used now: kept
    await big.flush();
    const kept = Object.keys(JSON.parse(s.files.get('h3')!).entries);
    expect(kept).toHaveLength(MEMO_MAX);
    expect(kept).toContain('k0');
    expect(kept).not.toContain('k1');
    // nothing new: no write
    const before = s.saves;
    await big.flush();
    expect(s.saves).toBe(before);
    // a stored answer is a copy: changing what was returned changes nothing kept
    const o = new PackMemo(s, 'h4', () => 1, () => undefined);
    await o.put('x', { a: [1] });
    (await o.get<{ a: number[] }>('x'))!.a.push(2);
    expect(await o.get('x')).toEqual({ a: [1] });
  });

  it("ME6 whether a companion knows their next canon event is the pack's story alone: a later game takes the judgement", async () => {
    const s = store();
    const walk = async () => {
      const x = makeEngine();
      x.host.memo = s;
      x.model.on('foreknow', null, { judgements: [{ id: 'k1', knows: false, how: 'chance' }] });
      await x.engine.bind(demo, { startTick: tick(1, 8, 30), mode: 'new' });
      await x.engine.reconcile('test');
      for (const [u, d] of [['I walk with Mira.', 'Mira walks beside me. [ME6a]'], ['We keep walking.', 'The road goes on. [ME6b]']]) {
        x.host.addUser(u);
        x.model.draft(d);
        x.model.on('evaluate', (i) => String(i.candidate).includes(d.slice(-6)), { scene_entities: ['mira'] });
        expect(await x.engine.runOperation('normal')).toBe(true);
      }
      return x;
    };
    const a = await walk();
    expect(a.model.tasks('foreknow')).toHaveLength(1);
    const b = await walk();
    expect(b.model.tasks('foreknow')).toHaveLength(0);
    expect(b.engine.campaign()!.foreknowledge).toEqual(a.engine.campaign()!.foreknowledge);
    expect(Object.values(b.engine.campaign()!.foreknowledge!)).toEqual([{ knows: false, how: 'chance' }]);
  });

  it('ME8 an engine update that asks a step differently: its old answers are dropped, the turn says why nothing was reused, the next game reuses the new ones', async () => {
    const s = store();
    const a = await game(s);
    expect(a.engine.lastTimings!.memoStale).toEqual([]);
    const wcKeys = (st: typeof s) => Object.entries(JSON.parse([...st.files.values()][0]).entries as Record<string, { t?: string }>).filter(([, e]) => e.t === 'world_check').map(([k]) => k);
    const before = wcKeys(s);
    expect(before.length).toBeGreaterThan(0);
    const old = PROMPTS.world_check;
    try {
      (PROMPTS as Record<string, string>).world_check = old + ' (asked differently)';
      const b = await game(s);
      expect(asked(b, 'world_check')).toBeGreaterThan(0);
      for (const t of ['profile', 'world_changes', 'affiliations', 'persona_abilities']) expect(asked(b, t)).toBe(0);
      expect(b.engine.lastTimings!.memoStale).toEqual(['world_check']);
      expect(b.engine.lastTimings!.memo).toBeGreaterThan(0); // the Persona's answers were still reused
      expect(view(b)).toEqual(view(a));
      // only the new answers are kept for that step
      const after = wcKeys(s);
      expect(after.length).toBe(before.length);
      expect(after.filter((k) => before.includes(k))).toEqual([]);
      const c = await game(s);
      expect(asked(c, 'world_check')).toBe(0);
      expect(c.engine.lastTimings!.memoStale).toEqual([]);
    } finally { (PROMPTS as Record<string, string>).world_check = old; }
    // a file from before this (no record of the instructions) is not reported as asked differently
    const s2 = store();
    await game(s2);
    const f = JSON.parse([...s2.files.values()][0]);
    delete f.prompts;
    for (const e of Object.values(f.entries as Record<string, { t?: string }>)) delete e.t;
    s2.files.set([...s2.files.keys()][0], JSON.stringify(f));
    const d = await game(s2);
    expect(d.engine.lastTimings!.memoStale).toEqual([]);
    expect(asked(d, 'world_check')).toBe(0);
  });
});
