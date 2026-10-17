import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { publicClock } from '../../src/api';
import { ENGINE_RELEASE } from '../../src/runtime/types';

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
  it('counts resent structured calls and keeps why they were rejected', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('Gulls circle. [T2]');
    (x.model as any).rules.unshift({ task: 'evaluate', raw: '{"decision":"retain","new_entities":"oops"}', once: true });
    expect(await x.engine.runOperation('normal')).toBe(true);
    const ev = x.engine.lastTimings!.steps.find((s) => s.step === 'evaluate')!;
    expect(ev.count).toBe(2);
    expect(ev.retries).toBe(1);
    expect(x.engine.lastTimings!.rejects!.join(' ')).toMatch(/^evaluate: schema violation/);
  });
  it('a failed turn keeps a full report with every attempt and the resend reasons (saved with the chat)', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('Bad tone. [F1]', 'Bad tone. [F2]', 'Bad tone. [F3]');
    x.model.on('evaluate', null, { decision: 'repair', violations: [{ code: 'tone', quote: 'Bad tone', detail: 'the tone is wrong' }] });
    (x.model as any).rules.unshift({ task: 'discover', raw: 'not json at all', once: true });
    expect(await x.engine.runOperation('normal')).toBe(false);
    const rep = x.engine.campaign()!.recoveryState.details!;
    expect(rep).toMatch(/^Canon Engine \d+\.\d+\.\d+ — failed turn \(normal\)/);
    expect(rep).toMatch(/Error: The reply could not be validated within 2 repairs/);
    expect(rep).toMatch(/Attempt 1 \(first draft\): 1 problem[\s\S]*the tone is wrong[\s\S]*Attempt 3 \(repair 2\)/);
    expect(rep).toMatch(/Model output problems \(resent, or an unusable item dropped\):\n  - discover: no parseable JSON/);
    expect(rep).toMatch(/Steps: .*discover .*\(resent 1\)/);
  });

  it('the release number shown to users matches package.json and manifest.json', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
    const man = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8')).version;
    expect(ENGINE_RELEASE).toBe(pkg);
    expect(ENGINE_RELEASE).toBe(man);
  });
});
