// H01-H03: with Horae installed, a new reply starts no earlier than Horae's story time (it tracks time every turn).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { mentionsTime } from '../../src/runtime/engine';
import { PROMPTS } from '../../src/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const ORIGIN = { y: 2020, m: 1, d: 1 }; // day 1 = 2020/01/02

async function setup(horae: { date: string; time: string } | null) {
  const x = makeEngine();
  if (horae) x.host.horae = {
    status: () => ({ available: true, version: 'x', mode: 'metadata', staleIndexes: [], busy: false, scene: { date: horae.date, time: horae.time } }),
    waitForIdle: async () => true, reanalyze: async () => undefined,
  } as any;
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), originDate: ORIGIN, mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
const clock = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state.clock.lo;

describe('story time follows Horae', () => {
  it('H01 a reply the reviewer left at the current time starts at Horae\'s later time', async () => {
    const x = await setup({ date: '2020/01/02', time: '11:00' });
    x.host.addUser('I talk with Mira.');
    x.model.draft('You talk for a while. [H1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(clock(x)).toBe(tick(1, 11, 0));
  });

  it('H02 Horae behind the engine clock, or without Horae, changes nothing', async () => {
    const x = await setup({ date: '2020/01/02', time: '08:00' });
    x.host.addUser('I talk with Mira.');
    x.model.draft('You talk for a while. [H2]');
    await x.engine.runOperation('normal');
    expect(clock(x)).toBe(tick(1, 9, 30));
    const y = await setup(null);
    y.host.addUser('I talk with Mira.');
    y.model.draft('You talk for a while. [H3]');
    await y.engine.runOperation('normal');
    expect(clock(y)).toBe(tick(1, 9, 30));
  });

  it('H03 an implausible Horae time (more than 3 days ahead) is ignored', async () => {
    const x = await setup({ date: '2020/01/09', time: '11:00' });
    x.host.addUser('I talk with Mira.');
    x.model.draft('You talk for a while. [H4]');
    await x.engine.runOperation('normal');
    expect(clock(x)).toBe(tick(1, 9, 30));
  });

  it('H05 when the reviewer misjudged the last reply (12:10 read as 00:10), the timeline and the next GM context use Horae\'s time', async () => {
    const x = await setup({ date: '2020/01/02', time: '12:10' }); // the engine clock is 09:30
    expect(x.engine.storyNow()).toBe(tick(1, 12, 10)); // the timeline's "now"
    x.host.addUser('I keep walking.');
    x.model.draft('The sun is high. [H5]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const ctx = String(x.model.tasks('draft')[0].input.engineContext);
    expect(ctx).toMatch(/at checkpoint 2020-01-02 12:10/);
    // Horae not ahead (or absent): the engine clock
    const y = await setup({ date: '2020/01/02', time: '08:00' });
    expect(y.engine.storyNow()).toBe(tick(1, 9, 30));
  });
});

describe('the clock does not run ahead of the story', () => {
  const run = async (user: string, draft: string, end: any, extra: any = {}, horae: { date: string; time: string } | null = null) => {
    const x = await setup(horae); // 09:30
    x.host.addUser(user);
    x.model.draft(draft);
    x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), { scene_end: end, ...extra });
    expect(await x.engine.runOperation('normal')).toBe(true);
    return clock(x);
  };
  const at = (d: number, h: number, m = 0) => ({ lo: { day: d, minute: h * 60 + m }, hi: { day: d, minute: h * 60 + m + 10 }, precision: 'approx' });

  it('CK1 a reply that says nothing about time advances at most 20 minutes, whatever the estimate (live: +20–40 min per short reply)', async () => {
    expect(await run('I grab her arm and shout.', 'She freezes; you hold on and shout her name. [CK1]', at(1, 10, 10))).toBe(tick(1, 9, 50));
  });

  it('CK2 explicit time in the reply or the player message is not capped; a small estimate is kept as it is', async () => {
    expect(await run('I wait.', 'Two hours later the rain stops. 两小时后雨停了。 [CK2]', at(1, 11, 30))).toBe(tick(1, 11, 30));
    expect(await run('我赶过去之后，是13点51分，大概就2分钟。', 'You arrive. [CK3]', at(1, 13, 53))).toBe(tick(1, 13, 53));
    expect(await run('I nod.', 'She nods back. [CK4]', at(1, 9, 33))).toBe(tick(1, 9, 33));
  });

  it('CK3 the Horae floor still wins over the cap; flashbacks are left alone', async () => {
    expect(await run('I keep walking.', 'You walk on. [CK5]', at(1, 12, 0), {}, { date: '2020/01/02', time: '11:00' })).toBe(tick(1, 11, 0));
    expect(await run('I remember.', 'Years ago she smiled. [CK6]', at(0, 8, 0), { flashback: true })).toBe(tick(1, 9, 30));
  });

  it('CK4 time words: clock times, durations, parts of the day count; "一点点" (a little) does not', () => {
    for (const t of ['13:51', '13点51分', '三点钟', '两小时后', '傍晚时分', '第二天早上', '大概2分钟', 'two hours later', 'that evening']) expect(mentionsTime(t)).toBe(true);
    for (const t of ['她一点点靠近', '他抓住她的手大喊', 'She freezes and shouts.']) expect(mentionsTime(t)).toBe(false);
  });

  it('CK5 the reviewer is told lo is the minimum and the player message can state the time', () => {
    expect(PROMPTS.evaluate).toMatch(/lo is the MINIMUM time the depicted events actually need/);
    expect(PROMPTS.evaluate).toMatch(/PLAYER'S MESSAGE \(player_action_scope\)/);
    expect(PROMPTS.evaluate).toMatch(/Spoken dialogue takes about as long as saying it: a short line a few seconds, a dozen lines of small talk about 1-2 minutes/);
    expect(PROMPTS.evaluate).not.toMatch(/Do not keep lo at current_time/);
  });
});
