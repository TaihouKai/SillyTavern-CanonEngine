// H01-H03: with Horae installed, a new reply starts no earlier than Horae's story time (it tracks time every turn).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

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
});
