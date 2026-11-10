// MD1–MD5: 思考方式 and 角色盘算 (user: clever characters only sounded clever — the GM wrote everyone with the same
// effort). People differ in how much they think before acting; those who do get their moves for the reply worked out
// in a call of their own, and the GM writes them by it: what they say, show, or keep to themselves.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { lintPack, validatePackText } from '../../src/domain/pack';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
const SCHEMER = { deliberation: 'habitual', sharpness: 'exceptional', approach: 'trades favours, never pays in coin', notices: 'when a story changes between tellings', blind: 'that kindness can be meant', speaks: 'asks, rarely tells' };
const BRAWLER = { deliberation: 'rarely', sharpness: 'plain', approach: 'shoulders through the problem', pushed: 'a friend in danger' };
function packWith(mira: unknown = SCHEMER, tomas: unknown = BRAWLER) {
  const p = structuredClone(base);
  p.entities.find((e: any) => e.id === 'mira').mind = mira;
  p.entities.push({ id: 'tomas', name: 'Tomas', aliases: [], kind: 'person', static_description: 'a docker', source_refs: [], ...(tomas ? { mind: tomas } : {}) });
  return p;
}
async function setup(pack = packWith(), settings: any = {}) {
  const x = makeEngine();
  Object.assign(x.engine.settings, settings);
  await x.engine.bind(JSON.stringify(pack), { startTick: tick(2, 7, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, scene: string[]) {
  x.model.on('extract_user', (i) => JSON.stringify(i).includes(user.slice(0, 8)), { statements: [], references: [], scene_entities: scene }, true);
  x.host.addUser(user);
  x.model.draft(draft);
  expect(await x.engine.runOperation('normal')).toBe(true);
  return x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
}
const PLAN = { minds: [{ id: 'mira', reads: [
  { what: 'the story changed since this morning', basis: 'first a cousin, now a friend', sure: 'high', surface: 'say', purpose: 'make them admit it' },
  { what: 'they were at the warehouse themselves', basis: 'they know the door', sure: 'mid', surface: 'show' },
  { what: 'someone sent them', sure: 'low', surface: 'keep' },
], wants: 'the truth before she helps', move: 'refuses the money, asks for a favour later', next: 'if they bolt, lets them and asks around' }] };

describe('思考方式 and 角色盘算', () => {
  it('MD1 the pack format: mind is valid on people; on anything else a warning', () => {
    expect(validatePackText(JSON.stringify(packWith())).ok).toBe(true);
    expect(lintPack(packWith()).errors).toEqual([]);
    const p = packWith();
    p.entities.find((e: any) => e.id === 'harbor').mind = BRAWLER;
    expect(lintPack(p).warnings.map((w) => w.message).join(' ')).toMatch(/mind on a place/);
    const bad = packWith({ ...SCHEMER, deliberation: 'sometimes' });
    expect(validatePackText(JSON.stringify(bad)).ok).toBe(false);
  });

  it('MD2 someone who thinks before acting is planned for first; the GM gets how they think and the plan, said/shown/kept apart; the reviewer gets neither', async () => {
    const x = await setup();
    x.model.on('mind', null, PLAN);
    const ctx = await turn(x, 'With Tomas beside me, I tell Mira a friend of mine was hurt at the warehouse; I can pay.', 'Mira smiles. [MD2]', ['mira', 'tomas']);
    const call = x.model.tasks('mind');
    expect(call.length).toBe(1);
    expect(call[0].input.people.map((p: any) => p.id)).toEqual(['mira']); // Tomas rarely thinks first: not planned for
    expect(call[0].input.people[0].mind.deliberation).toMatch(/always thinking/);
    expect(call[0].input.player_message).toMatch(/a friend of mine was hurt/);
    expect(String(call[0].input.context)).toMatch(/\[CANON ENGINE CONTEXT/);
    expect(ctx).toMatch(/HOW THEY THINK[\s\S]*Mira \[mira\]: always thinking[\s\S]*approach: trades favours/);
    expect(ctx).toMatch(/Tomas \[tomas\]: rarely thinks before acting[\s\S]*pushed to think by: a friend in danger/);
    expect(ctx).toMatch(/CHARACTER PLANS[\s\S]*never print it/);
    expect(ctx).toMatch(/Mira \[mira\]: wants: the truth before she helps \| move: refuses the money[^\n]*says: the story changed since this morning — to make them admit it \| shows: they were at the warehouse themselves \| keeps to themselves: someone sent them \(a guess\) \| if others react: if they bolt/);
    const review = String(x.model.tasks('evaluate').slice(-1)[0].input.retrieved_context);
    expect(review).not.toMatch(/CHARACTER PLANS|HOW THEY THINK/);
  });

  it('MD3 nobody there who thinks first, or the setting off: no call; how they think still reaches the GM', async () => {
    const x = await setup();
    const ctx = await turn(x, 'I help Tomas lift the crates.', 'Tomas grunts. [MD3a]', ['tomas']);
    expect(x.model.tasks('mind').length).toBe(0);
    expect(ctx).toMatch(/Tomas \[tomas\]: rarely thinks/);
    expect(ctx).not.toMatch(/CHARACTER PLANS/);
    const y = await setup(packWith(), { mindPlans: false });
    const ctx2 = await turn(y, 'I talk with Mira.', 'Mira nods. [MD3b]', ['mira']);
    expect(y.model.tasks('mind').length).toBe(0);
    expect(ctx2).toMatch(/Mira \[mira\]: always thinking/);
  });

  it('MD4 a failed plan does not stop the reply', async () => {
    const x = await setup();
    x.model.failTask.mind = 9;
    const ctx = await turn(x, 'I talk with Mira.', 'Mira nods. [MD4]', ['mira']);
    expect(ctx).not.toMatch(/CHARACTER PLANS/);
    expect(x.engine.lastTimings!.rejects!.join(' ')).toMatch(/mind: no character plans this turn/);
  });

  it('MD5 the timeline lists people with a way of thinking, with or without a nature', async () => {
    const x = await setup();
    const v = x.engine.natureView(false)!;
    expect(v.people.find((p) => p.id === 'tomas')!.mind!.deliberation).toBe('rarely');
    expect(v.people.find((p) => p.id === 'tomas')!.versions).toEqual([]);
  });
});
