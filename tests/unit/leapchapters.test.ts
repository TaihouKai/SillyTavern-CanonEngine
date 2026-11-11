// LC: a leap across a lot of story goes in chapters, one reply each (下一章 sends the next). Chapters follow the pack's
// arcs and how much happens, never calendar time: few events is one reply however long the span; each chapter holds
// whole arcs; the planner reads at most LEAP_DETAILED_MAX events per call.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { validatePackText } from '../../src/core/domain/pack';
import { emptyState } from '../../src/core/domain/reducer';
import { LEAP_CHAPTERS_MAX, LEAP_DETAILED_MAX, leapChapters, leapEvents, parseLeap } from '../../src/core/runtime/leap';

const demoText = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

/** The demo pack plus `arcs` arcs of `per` small SOFT events each, from day 6 on, one event every 6 hours. */
function bigPack(arcs: number, per: number, withArcs = true): string {
  const p = JSON.parse(demoText);
  const base = p.events.find((e: any) => e.id === 'harbor-festival');
  let t = 6 * 1440 + 8 * 60;
  for (let a = 0; a < arcs; a++) {
    const ids: string[] = [];
    for (let i = 0; i < per; i++) {
      const id = `x-${a}-${i}`;
      const when = { day: Math.floor(t / 1440), minute: t % 1440 };
      p.events.push({ ...base, id, title: `Arc ${a} event ${i}`, when: { ...base.when, earliest: when, latest: when, label: id }, arc_id: withArcs ? `arc-${a}` : null, outcomes: [], canonical_effects: [] });
      ids.push(id);
      t += 360;
    }
    if (withArcs) p.arcs.push({ id: `arc-${a}`, title: `Arc ${a}`, summary: 'a synthetic arc', event_ids: ids });
  }
  p.coverage.end = { day: Math.ceil(t / 1440) + 400, minute: 1439 };
  return JSON.stringify(p);
}

describe('time leap chapters', () => {
  it('LC1 chapters end where arcs end, hold whole arcs, are never more than the cap', () => {
    const L = validatePackText(bigPack(12, 50)).loaded!;
    const st = emptyState(L);
    const from = tick(5, 8, 0), to = tick(200, 8, 0);
    const ch = leapChapters(L, st, from, to);
    expect(ch.length).toBeGreaterThan(1);
    expect(ch.length).toBeLessThanOrEqual(LEAP_CHAPTERS_MAX);
    expect(ch[ch.length - 1].to).toBe(to);
    let prev = from;
    for (const c of ch.slice(0, -1)) {
      expect(c.after).toMatch(/^Arc \d+$/);
      // the arc named is complete before the chapter lands, and the next arc has not begun
      const arc = Number(c.after!.split(' ')[1]);
      const last = leapEvents(L, st, from, to).filter((x) => x.id.startsWith(`x-${arc}-`)).pop()!;
      expect(c.to).toBeGreaterThan(last.hi);
      expect(leapEvents(L, st, prev, c.to).filter((x) => x.id.startsWith('x-')).length).toBeGreaterThanOrEqual(100);
      prev = c.to;
    }
  });

  it('LC2 few events is one reply, however long the span', () => {
    const L = validatePackText(demoText).loaded!;
    expect(leapChapters(L, emptyState(L), tick(0, 8, 0), tick(3000, 8, 0))).toEqual([{ to: tick(3000, 8, 0), after: null }]);
  });

  it('LC3 without arcs a chapter ends only after a HARD event (none here: one reply)', () => {
    const L = validatePackText(bigPack(12, 50, false)).loaded!;
    const ch = leapChapters(L, emptyState(L), tick(5, 8, 0), tick(200, 8, 0));
    expect(ch).toHaveLength(1);
  });

  it('LC4 the chapter directive: this reply goes to the first time, the leap to the second', () => {
    expect(parseLeap('{{time_leap:D50 08:00 → D300 08:00}}', null)).toMatchObject({ target: tick(50, 8, 0), final: tick(300, 8, 0) });
    expect(parseLeap('{{time_leap:D50 08:00 -> D300 08:00}}', null)).toMatchObject({ target: tick(50, 8, 0), final: tick(300, 8, 0) });
    expect(parseLeap('{{time_leap:D50 08:00}}', null)).toMatchObject({ target: tick(50, 8, 0), final: null });
  });

  it('LC5 a chapter turn: the GM writes one chapter; 下一章 offers the rest with the same description; the last chapter ends it', async () => {
    const x = makeEngine();
    await x.engine.bind(bigPack(12, 50), { startTick: tick(0, 8, 0), mode: 'new' });
    await x.engine.reconcile('test');
    const ch = x.engine.leapPlan(tick(200, 8, 0))!.chapters;
    expect(ch.length).toBeGreaterThan(1);
    x.host.addUser(`{{time_leap:D${Math.floor(ch[0].to / 1440)} 08:00 → D200 08:00}}\nI sail along the coast.`);
    x.model.draft('Weeks at sea… [LC5a]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('draft')[0].input.engineContext).toMatch(/one chapter of their leap to D200 08:00/);
    expect(x.engine.current!.replay.state.clock.lo).toBeGreaterThanOrEqual(ch[0].to);
    expect(x.engine.pendingLeap()).toEqual({ final: tick(200, 8, 0), description: 'I sail along the coast.' });
    x.host.addUser('{{time_leap:D200 08:00}}\nI sail along the coast.');
    x.model.draft('The rest of the voyage… [LC5b]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.pendingLeap()).toBe(null);
  });

  it('LC6 the planner gets the events in batches it can read in full', async () => {
    const x = makeEngine();
    await x.engine.bind(bigPack(8, 50), { startTick: tick(0, 8, 0), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('{{time_leap:D120 08:00}}\nI wait.');
    x.model.draft('Months pass. [LC6]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const calls = x.model.tasks('leap');
    expect(calls.length).toBe(Math.ceil(405 / LEAP_DETAILED_MAX));
    for (const c of calls) {
      expect(c.input.crossed_events.length).toBeLessThanOrEqual(LEAP_DETAILED_MAX);
      expect(c.input.other_events).toBeUndefined();
      expect(c.input.part).toMatch(/of 3/);
    }
    expect(x.engine.current!.replay.state.dispositions.get('x-7-49')?.disposition).toBe('occurred');
  });
});
