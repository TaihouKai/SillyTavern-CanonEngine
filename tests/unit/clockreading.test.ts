// A reply's own clock ("都快十一点了") bounds the reviewer's estimate of when it ends (live: a reply finishing a meal
// begun two replies earlier, with "都快十一点了" in it, was given 23:20–23:35 from "a meal 30-60").
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { clockReadings, readingTick, cnNumber } from '../../src/core/domain/time';
import { PROMPTS } from '../../src/core/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

describe('clock readings in a reply', () => {
  it('CR1 reads the time now, not appointments or plans', () => {
    expect(cnNumber('十一')).toBe(11);
    expect(cnNumber('二十三')).toBe(23);
    expect(cnNumber('两')).toBe(2);
    expect(cnNumber('十')).toBe(10);
    const text = '“明天早上八点开幕式，你几点起？”“五点半就得起来。”“那你还不回去睡？都快十一点了。”';
    expect(clockReadings(text)).toEqual([{ hour: 11, minute: 0, nearly: true, quote: '都快十一点了' }]);
    expect(clockReadings('已经三点半了')).toMatchObject([{ hour: 3, minute: 30, nearly: false }]);
    expect(clockReadings('现在十点二十')).toMatchObject([{ hour: 10, minute: 20 }]);
    expect(clockReadings("It's already 11:30 and she is late.")).toMatchObject([{ hour: 11, minute: 30 }]);
    expect(clockReadings('我们约在八点见面，九点开会。')).toEqual([]);
    // a time read off a clock, or said as "…出头", is the time now (live: 08:50 recorded for a reply whose phone said
    // 八点二十出头); a plan after a look at the clock is still a plan
    expect(clockReadings('她低头看了看手机。八点二十出头，离九点还有好一阵。美琴的两人三足八点半开始，可九点又得回来站台。')).toMatchObject([{ hour: 8, minute: 20, quote: '八点二十出头' }]);
    expect(clockReadings('瞥了一眼手表，九点零五。')).toMatchObject([{ hour: 9, minute: 5 }]);
    expect(clockReadings('看了看表，八点要开会')).toEqual([]);
    // the reading is placed near the scene: 11 at 22:40 is 23:00 that day
    expect(readingTick({ hour: 11, minute: 0 }, tick(61, 22, 40))).toBe(tick(61, 23, 0));
    expect(readingTick({ hour: 3, minute: 0 }, tick(5, 23, 30))).toBe(tick(6, 3, 0));
  });

  it('CR2 an estimated end long after the reply\'s own clock is taken back to it; one close to it stays', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 22, 40), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I keep eating.');
    x.model.draft('Mira laughs. “Go to bed, 都快十一点了.” You finish the plate. [CR2]');
    x.model.on('evaluate', (i: any) => String(i.candidate).includes('[CR2]'), { scene_end: { lo: { day: 1, minute: 23 * 60 + 20 }, hi: { day: 1, minute: 23 * 60 + 35 }, precision: 'approx' } });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.current!.replay.state.clock.lo).toBe(tick(1, 23, 0));
    // a few minutes after the reading is what the reply may well show: kept
    x.host.addUser('I pay.');
    x.model.draft('“It is already 11:05 pm,” the owner says as you pay. [CR3]');
    x.model.on('evaluate', (i: any) => String(i.candidate).includes('[CR3]'), { scene_end: { lo: { day: 1, minute: 23 * 60 + 15 }, hi: { day: 1, minute: 23 * 60 + 20 }, precision: 'approx' } });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.current!.replay.state.clock.lo).toBe(tick(1, 23, 15));
    expect(PROMPTS.evaluate).toMatch(/a meal already under way before this reply counts only what this reply shows/);
  });

  it('CR4 a time read off a phone bounds the end too (live: 08:50 recorded for a reply whose phone said 八点二十出头)', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 8, 20), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('我在通道里等着。');
    x.model.draft('她低头看了看手机。八点二十出头，离九点还有好一阵。美琴的两人三足八点半开始，可九点又得回来站台。[CR4]');
    x.model.on('evaluate', (i: any) => String(i.candidate).includes('[CR4]'), { scene_end: { lo: { day: 1, minute: 8 * 60 + 50 }, hi: { day: 1, minute: 9 * 60 + 5 }, precision: 'approx' } });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.current!.replay.state.clock.lo).toBe(tick(1, 8, 20));
  });
});
