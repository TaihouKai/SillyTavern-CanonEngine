// How far a reply moves story time (scenetime.ts). Whether a time in the text is reached or only spoken of is the
// reviewer's reading (time_evidence); code checks each item against the text and bounds the estimate by the checked
// ones. Replaces the word lists and patterns that tried to tell 「明天八点见」 from 「等到八点，她终于来了」 in code.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { checkTimeEvidence, dialClocks, settleSceneEnd, writtenMinutes, UNTIMED_ADVANCE_MAX, CLOCK_READING_SLACK } from '../../src/core/runtime/scenetime';
import { fromTick } from '../../src/core/domain/time';
import { PROMPTS } from '../../src/core/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const span = (lo: number, hi = lo) => ({ lo: fromTick(lo), hi: fromTick(hi) });
const now = (quote: string, lo: number, hi = lo) => ({ quote, kind: 'now', at: span(lo, hi) });
const elapsed = (quote: string, minutes: number) => ({ quote, kind: 'elapsed', minutes });
const mentioned = (quote: string) => ({ quote, kind: 'mentioned' });

describe('time evidence is checked against the text', () => {
  const T = tick(1, 22, 40);
  it('TE1 an item is kept only when its quote is in the reply or the player message', () => {
    const r = checkTimeEvidence([now('都快十一点了', tick(1, 22, 55), tick(1, 23, 0)), now('都快十二点了', tick(1, 23, 55))], '那你还不回去睡？都快十一点了。', '', T);
    expect(r.items.map((x) => x.quote)).toEqual(['都快十一点了']);
    expect(r.warnings.join('\n')).toMatch(/都快十二点了.*not in the reply/);
    expect(checkTimeEvidence([elapsed('等了一个半小时', 90)], '他叹气。', '我在门口等了一个半小时。', T).items).toHaveLength(1);
  });

  it('TE2 a clock is the one its quote writes (live: 08:50 for a phone showing 八点二十出头); a part of the day is not checked', () => {
    const at = tick(1, 8, 10);
    const text = '她低头看了看手机。八点二十出头，离九点还有好一阵。';
    expect(checkTimeEvidence([now('八点二十出头', tick(1, 8, 50), tick(1, 9, 5))], text, '', at).items).toEqual([]);
    expect(checkTimeEvidence([now('八点二十出头', tick(1, 8, 20), tick(1, 8, 30))], text, '', at).items).toHaveLength(1);
    expect(checkTimeEvidence([now('傍晚时分', tick(1, 17, 0), tick(1, 18, 30))], '傍晚时分，雨停了。', '', at).items).toHaveLength(1);
    // 12-hour dial: "3点" is 03:00 or 15:00
    expect(checkTimeEvidence([now('下午三点整', tick(1, 15, 0))], '下午三点整，钟声响起。', '', at).items).toHaveLength(1);
    expect(dialClocks('13:51 or 八点二十七 or 三点半 or 11 pm')).toEqual([111, 507, 210, 660]);
  });

  it('TE3 an amount of time is one the quote writes', () => {
    expect(writtenMinutes('三人又走了十分钟')).toBe(10);
    expect(writtenMinutes('等了一个半小时')).toBe(90);
    expect(writtenMinutes('half an hour, then twenty minutes more')).toBe(50);
    expect(writtenMinutes('过了一会儿')).toBeNull();
    const at = tick(1, 9, 0);
    expect(checkTimeEvidence([elapsed('过了一会儿', 40)], '过了一会儿，她回来了。', '', at).items).toEqual([]);
    expect(checkTimeEvidence([elapsed('走了十分钟', 60)], '走了十分钟。', '', at).items).toEqual([]);
    expect(checkTimeEvidence([elapsed('走了十来分钟', 12)], '走了十来分钟。', '', at).items).toHaveLength(1);
  });

  it('TE4 a time only spoken of lifts nothing; a time reached before the clock is left out', () => {
    const at = tick(1, 9, 0);
    const r = checkTimeEvidence([mentioned('明天八点见'), now('昨晚十点', tick(0, 22, 0))], '「明天八点见。」昨晚十点的事谁也没提。', '', at);
    expect(r.items).toEqual([]);
    expect(r.mentioned).toEqual(['明天八点见']);
  });
});

describe('the end of a reply is bounded by what its text accounts for', () => {
  const T = tick(1, 9, 30);
  const est = (lo: number, hi = lo + 10) => ({ lo, hi, precision: 'approx' as const });
  const end = (estimate: ReturnType<typeof est> | null, items: any[], floor: number | null = null, extra: any = {}) =>
    settleSceneEnd({ estimate, items: checkTimeEvidence(items, extra.text ?? items.map((i) => i.quote).join('。'), '', T).items, clockTick: T, floor, flashback: !!extra.flashback, leap: !!extra.leap });

  it('TS1 no time in the text: at most 20 minutes, whatever the estimate; a small estimate is kept', () => {
    expect(end(est(tick(1, 10, 10)), []).end!.lo).toBe(T + UNTIMED_ADVANCE_MAX);
    expect(end(est(tick(1, 9, 33)), []).end!.lo).toBe(tick(1, 9, 33));
    expect(end(est(tick(1, 11, 0)), [mentioned('明天再说')]).end!.lo).toBe(T + UNTIMED_ADVANCE_MAX);
  });

  it('TS2 stated amounts add to it, in told order from where the reply starts', () => {
    expect(end(est(tick(1, 11, 0)), [elapsed('三人走了十分钟', 10)]).end!.lo).toBe(T + 10 + UNTIMED_ADVANCE_MAX);
    expect(end(est(tick(1, 11, 30)), [elapsed('两小时后雨停了', 120)]).end!.lo).toBe(tick(1, 11, 30));
  });

  it('TS3 a time reached sets it; the reply runs on 10 minutes after it, plus what passes after it', () => {
    const r = end(est(tick(1, 23, 20)), [now('都快十一点了', tick(1, 22, 55), tick(1, 23, 0))]);
    expect(r.end!.lo).toBe(tick(1, 23, 0) + CLOCK_READING_SLACK);
    expect(r.bound).toBe(tick(1, 23, 0) + CLOCK_READING_SLACK);
    expect(end(est(tick(1, 23, 40)), [now('都快十一点了', tick(1, 22, 55), tick(1, 23, 0)), elapsed('又聊了二十分钟', 20)]).end!.lo).toBe(tick(1, 23, 30));
    // a time reached lifts the 20-minute bound: the next morning
    expect(end(est(tick(2, 7, 30)), [now('第二天早上', tick(2, 7, 0), tick(2, 8, 0))]).end!.lo).toBe(tick(2, 7, 30));
  });

  it('TS4 Horae\'s later time is where the reply starts; the reply\'s own clock wins over it; flashbacks and leaps', () => {
    expect(end(est(tick(1, 12, 0)), [], tick(1, 11, 0)).end!.lo).toBe(tick(1, 11, 0) + UNTIMED_ADVANCE_MAX);
    expect(end(est(tick(1, 9, 30)), [], tick(1, 11, 0)).end!.lo).toBe(tick(1, 11, 0));
    expect(end(est(tick(1, 10, 0)), [now('九点四十出头', tick(1, 9, 40), tick(1, 9, 45))], tick(1, 10, 20)).end!.lo).toBe(tick(1, 9, 55));
    expect(end(est(tick(0, 8, 0)), [], null, { flashback: true }).end!.lo).toBe(tick(0, 8, 0));
    expect(end(est(tick(1, 9, 40)), [], tick(3, 8, 0), { leap: true }).end!.lo).toBe(tick(3, 8, 0));
  });
});

describe('in a turn', () => {
  async function turn(start: number, draft: string, evaluation: object, horae: { time: string } | null = null) {
    const x = makeEngine();
    const tracker = horae;
    if (tracker) x.host.sceneTracker = {
      name: 'Horae',
      status: () => ({ available: true, version: 'x', mode: 'metadata', staleIndexes: [], busy: false, scene: { date: '2020/01/02', time: tracker.time } }),
      waitForIdle: async () => true, reanalyze: async () => undefined,
    } as any;
    await x.engine.bind(demo, { startTick: start, originDate: { y: 2020, m: 1, d: 1 }, mode: 'new' });
    await x.engine.reconcile('test');
    x.model.vouchTime = false; // the evidence is the test's
    x.host.addUser('我在通道里等着。');
    x.model.draft(draft);
    x.model.on('evaluate', (i: any) => String(i.candidate).includes(draft.slice(-5)), evaluation);
    expect(await x.engine.runOperation('normal')).toBe(true);
    return { x, tracker, clock: () => x.engine.current!.replay.state.clock.lo };
  }

  it('TT1 a reply whose clock the reviewer misreads keeps the time it accounts for (live: 八点二十出头 recorded as 08:50)', async () => {
    const draft = '她低头看了看手机。八点二十出头，离九点还有好一阵。[TT1]';
    const { clock } = await turn(tick(1, 8, 20), draft, {
      scene_end: { lo: { day: 1, minute: 8 * 60 + 50 }, hi: { day: 1, minute: 9 * 60 + 5 }, precision: 'approx' },
      time_evidence: [now('八点二十出头', tick(1, 8, 20), tick(1, 8, 30)), mentioned('离九点还有好一阵')],
    });
    expect(clock()).toBe(tick(1, 8, 40));
  });

  it('TT2 Horae ahead of what the latest reply\'s text accounts for is not followed; within it, it is', async () => {
    const draft = '她低头看了看手机。九点四十出头。[TT2]';
    const ev = { scene_end: { lo: { day: 1, minute: 9 * 60 + 42 }, hi: { day: 1, minute: 9 * 60 + 45 }, precision: 'approx' }, time_evidence: [now('九点四十出头', tick(1, 9, 40), tick(1, 9, 45))] };
    const a = await turn(tick(1, 9, 30), draft, ev, { time: '09:30' });
    a.tracker!.time = '10:20';
    expect(a.x.engine.storyNow()).toBe(tick(1, 9, 42));
    a.tracker!.time = '09:50';
    expect(a.x.engine.storyNow()).toBe(tick(1, 9, 50));
  });

  it('TT3 a quote the reply does not have lifts nothing (a misread item cannot move the clock a day)', async () => {
    const { x, clock } = await turn(tick(1, 9, 30), '「明天八点见。」她说完就走了。[TT3]', {
      scene_end: { lo: { day: 2, minute: 8 * 60 }, hi: { day: 2, minute: 8 * 60 + 10 }, precision: 'approx' },
      time_evidence: [now('第二天早上八点', tick(2, 8, 0))],
    });
    expect(clock()).toBe(tick(1, 9, 50));
    expect(JSON.stringify(x.engine.current!.replay.applied.slice(-1)[0].interp.warnings)).toMatch(/第二天早上八点.*left out/);
  });

  it('TT4 the reviewer is asked for the evidence, judged by meaning, dialogue marked or not', () => {
    expect(PROMPTS.evaluate).toMatch(/time_evidence: every expression of time in the player's message/);
    expect(PROMPTS.evaluate).toMatch(/inside dialogue or not and however the dialogue is marked/);
    expect(PROMPTS.evaluate).toMatch(/"mentioned" where a time is only spoken of/);
    expect(PROMPTS.evaluate).toMatch(/"time_evidence":\[\{"quote":"","kind":"now"/);
  });
});
