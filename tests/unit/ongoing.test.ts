// OG1–OG2: a canonical event shown under way keeps no result until the reply where it ends (live finding:
// 婚后光子遇袭与马场芳郎落败 recorded as 已改变 when the fight had only started); RA1–RA2: 重新分析.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { PROMPTS as PROMPTS_ } from '../../src/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-6);
  x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state;
const ambush = (disposition: string, quote: string, title = 'Ambush on the road') => ({
  scene_end: at(1, 10, 0),
  occurrences: [occ('o1', title, quote, { pack_event_id: 'medic-ambush', disposition, actors: ['mira'] })],
});

describe('canonical events under way', () => {
  it('OG1 an event shown under way keeps no result; the reviewer sees it as in progress and judges it when it ends', async () => {
    const x = await setup();
    expect(await turn(x, 'I follow Mira onto the road.', 'Bolts start flying at Mira. [OG1a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    const beat = [...st(x).occurrences.values()].find((o) => o.inProgressOf === 'medic-ambush');
    expect(beat?.title).toBe('Ambush on the road');
    expect(beat?.packEventId).toBeUndefined();
    expect(x.engine.current!.index.canonStatus('medic-ambush', st(x).clock.lo)!.note).toMatch(/UNDER WAY in this branch \(Ambush on the road\)/);
    // next reply: the reviewer is told it is under way, and the event ends
    expect(await turn(x, 'I pull Mira behind a cart.', 'The attackers flee; Mira lives. [OG1b]', ambush('diverged', 'The attackers flee', 'Ambush repelled'))).toBe(true);
    const ev = x.model.tasks('evaluate').map((c: any) => c.input).find((i: any) => String(i.candidate).includes('[OG1b]'));
    expect(ev.canon_events_now.find((e: any) => e.id === 'medic-ambush').in_progress[0]).toMatch(/^Ambush on the road: /);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
  });

  it('OG3 an event left under way for more than a day past its window is settled offscreen as usual', async () => {
    const x = await setup();
    expect(await turn(x, 'I follow Mira onto the road.', 'Bolts start flying at Mira. [OG3a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(await turn(x, 'I wander off to the market.', 'Hours pass at the stalls. [OG3b]', { scene_end: at(1, 20, 0) })).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false); // same day: still waiting for the story
    expect(await turn(x, 'I sleep for two days.', 'You wake two days later. [OG3c]', { scene_end: at(3, 9, 0) })).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(true);
  });

  it('OG2 the reviewer is told not to call an event changed only because its result is not shown yet', () => {
    const PROMPTS = PROMPTS_;
    expect(PROMPTS.evaluate).toMatch(/Never use "diverged" only because the result is not shown yet/);
    expect(PROMPTS.evaluate).toMatch(/"ongoing"/);
  });
});

describe('重新分析', () => {
  it('RA1 re-examines the message that recorded the result with the current rules; later replies stay', async () => {
    const x = await setup();
    expect(await turn(x, 'I follow Mira onto the road.', 'Bolts start flying at Mira. [RA1a]', ambush('diverged', 'Bolts start flying'))).toBe(true);
    expect(await turn(x, 'I look for cover.', 'You crouch behind a cart. [RA1b]', { scene_end: at(1, 10, 0) })).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    expect(x.engine.reanalyzableSource('medic-ambush')).not.toBeNull();
    // the reviewer now (correctly) sees the fight under way
    x.model.on('evaluate', (i) => String(i.candidate).includes('[RA1a]'), ambush('ongoing', 'Bolts start flying'));
    const before = x.model.tasks('evaluate').length;
    expect(await x.engine.reanalyzeEvent('medic-ambush')).toBe('ongoing');
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    const again = x.model.tasks('evaluate').slice(before).map((c: any) => String(c.input.candidate));
    expect(again.some((c) => c.includes('[RA1a]'))).toBe(true);
    expect(x.host.chat.map((m) => m.text).join(' ')).toContain('[RA1b]');
  });

  it('RA2 a result from the starting history or a 强制完成 has nothing to re-analyse', async () => {
    const x = await setup();
    await x.engine.forceComplete('council-broadcast');
    expect(x.engine.reanalyzableSource('council-broadcast')).toBeNull();
    await expect(x.engine.reanalyzeEvent('council-broadcast')).rejects.toThrow(/nothing to re-analyse/);
  });
});
