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

describe('reply timeout', () => {
  it('DT1 a story model that runs past the reply timeout fails with a message naming the setting and the fix', async () => {
    const x = makeEngine({ draftTimeoutMs: 200 });
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    (x.model as any).generateDraft = () => new Promise(() => {}); // still thinking
    x.host.addUser('I look around.');
    expect(await x.engine.runOperation('normal')).toBe(false);
    const reason = x.engine.campaign()!.recoveryState.reason || '';
    expect(reason).toMatch(/story model did not finish the reply within 0s \(the reply timeout, draftTimeoutMs = 200\)/);
    expect(reason).toMatch(/reasoning effort/);
    expect(reason).toMatch(/Reply timeout \(ms\)/);
  });
});

describe('token usage of a turn', () => {
  it('TK1 the provider-reported tokens of every engine request in the turn are summed; earlier calls are not counted', async () => {
    const x = makeEngine();
    let tally = { input: 0, output: 0, calls: 0, unreported: 0 };
    const real = { runTask: x.model.runTask.bind(x.model), generateDraft: x.model.generateDraft.bind(x.model) };
    (x.model as any).runTask = async (...a: any[]) => { tally.input += 100; tally.output += 10; tally.calls++; return (real.runTask as any)(...a); };
    (x.model as any).generateDraft = async (r: any) => { tally.input += 5000; tally.output += 800; tally.calls++; return real.generateDraft(r); };
    (x.model as any).takeUsage = () => { const u = tally; tally = { input: 0, output: 0, calls: 0, unreported: 0 }; return u; };
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t'); // calls before the turn are not part of it
    x.host.addUser('I look around.');
    x.model.draft('Gulls circle. [TK]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const tk = x.engine.lastTimings!.tokens!;
    const tasks = x.model.calls.filter((c) => c.task !== 'draft').length - x.model.calls.filter((c, i) => c.task !== 'draft' && i < x.model.calls.findIndex((d) => d.task === 'extract_user' && /look around/.test(JSON.stringify(d.input)))).length;
    expect(tk.calls).toBe(1 + tasks);
    expect(tk.input).toBe(5000 + 100 * tasks);
    expect(tk.output).toBe(800 + 10 * tasks);
  });
});
