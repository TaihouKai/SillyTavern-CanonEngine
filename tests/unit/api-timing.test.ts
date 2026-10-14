import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { publicClock } from '../../src/api';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

describe('public clock API and turn timings', () => {
  it('publishes the committed clock with a calendar date when day 0 is set', async () => {
    const x = makeEngine();
    expect(publicClock(x.engine).active).toBe(false);
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), originDate: { y: 2020, m: 7, d: 19 }, mode: 'new' });
    await x.engine.reconcile('t');
    const c = publicClock(x.engine);
    expect(c).toMatchObject({ active: true, packId: 'demo-harbor', day: 1, minute: 570, date: '2020/07/20', time: '09:30', weekday: 1 });
    expect(c.label).toBe('2020-07-20 09:30 (D1)');
  });

  it('records per-step durations of the last turn', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('Gulls circle. [T1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const tm = x.engine.lastTimings!;
    expect(tm.ok).toBe(true);
    const steps = tm.steps.map((s) => s.step);
    for (const s of ['extract_user', 'draft', 'discover', 'evaluate']) expect(steps).toContain(s);
    expect(tm.totalMs).toBeGreaterThanOrEqual(0);
  });
});
