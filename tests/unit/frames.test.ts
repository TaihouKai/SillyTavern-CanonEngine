// FR1–FR10: time frames. A pack may give places their own local time (a past era reached by time travel, a realm
// where time runs faster, a dream with no readable time). The story clock stays the main clock; the scene's frame
// is recorded from the reviewer's scene_frame (or set by hand) and the GM is told the local time. A pack without
// frames gets none of it (the Toaru pack is unchanged).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at } from './fake';
import { ROOT } from './helpers';
import { lintPack, validatePackText } from '../../src/domain/pack';
import { MAIN_FRAME, localTime, parseLocal } from '../../src/domain/frames';
import { frameRef } from '../../src/runtime/gate';
import { packGraph, renderGraphSvg } from '../../src/ui/graph';

const framesText = readFileSync(join(ROOT, 'examples', 'frames-demo.canon.json'), 'utf8');
const demoText = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const ORIGIN = { y: 2031, m: 3, d: 2 };
const loaded = () => validatePackText(framesText).loaded!;

async function setup(text = framesText, startTick = tick(1, 13, 50), settings = {}) {
  const x = makeEngine(settings);
  await x.engine.bind(text, { startTick, originDate: ORIGIN, mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const lastCtx = (x: ReturnType<typeof makeEngine>) => String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
const lastEval = (x: ReturnType<typeof makeEngine>) => x.model.tasks('evaluate').slice(-1)[0].input;
const frameNow = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state.sceneFrame?.frameId || MAIN_FRAME;

describe('time frames', () => {
  it('FR1 local time: a date offset, a faster realm, years before the common era, a frame without conversion', () => {
    const L = loaded();
    const harbor = L.frames.frames.get('harbor-1600')!, hill = L.frames.frames.get('faerie-hill')!, dream = L.frames.frames.get('dream-garden')!;
    // linked by date only: the local time of day is the main clock's at the link (14:00)
    expect(localTime(harbor, tick(1, 14))).toBe('1600-04-12 14:00');
    expect(localTime(harbor, tick(2, 9, 30))).toBe('1600-04-13 09:30');
    // 7x as fast: 12 main hours are 84 local hours
    expect(localTime(hill, tick(5, 10))).toBe('0812-09-01 06:00');
    expect(localTime(hill, tick(5, 22))).toBe('0812-09-04 18:00');
    expect(localTime(dream, tick(2, 23))).toBe('梦中没有可读的时间');
    expect(localTime({ id: 'x', name: 'x', description: '', clock: { kind: 'linked', at: { day: 0, minute: 0 }, local: '-2654-03-01 08:00' } }, 60)).toBe('BC2655-03-01 09:00');
    expect(parseLocal('1600-02-30', 0)).toBeNull();
  });

  it('FR2 an event is in its own frame, else in the frame of its places, else in the main frame', () => {
    const L = loaded();
    expect(L.frames.eventFrame.get('transfer')).toBe('harbor-1600'); // explicit
    expect(L.frames.eventFrame.get('church')).toBe('harbor-1600'); // its place
    expect(L.frames.eventFrame.get('dream')).toBe('dream-garden');
    expect(L.frames.eventFrame.get('faerie-week')).toBe('faerie-hill');
    expect(L.frames.eventFrame.has('return')).toBe(false); // the transfer room is in the main frame
    expect(L.frames.mainName).toBe('时序管理局本部');
  });

  it('FR3 lint: unknown frames, the reserved id, an unreadable date are errors; frames on people and mixed places warn', () => {
    const p = JSON.parse(framesText);
    p.frames.push({ id: 'main', name: 'x', description: '', clock: { kind: 'unlinked', label: 'x' } });
    p.frames[0].clock.local = '1600-13-01';
    p.events.find((e: any) => e.id === 'church').frame_id = 'nowhere';
    p.entities.find((e: any) => e.id === 'ada').frame_id = 'harbor-1600';
    p.events.find((e: any) => e.id === 'retake').location_ids = ['harbor-castle', 'faerie-hill-place'];
    const r = lintPack(p);
    const msgs = r.errors.map((e) => `${e.path} ${e.message}`).join('\n');
    expect(msgs).toMatch(/\/frames\/3\/id "main" is the main frame's id/);
    expect(msgs).toMatch(/\/frames\/0\/clock\/local "1600-13-01" is not a calendar date/);
    expect(msgs).toMatch(/unknown frame "nowhere"/);
    const w = r.warnings.map((e) => `${e.path} ${e.message}`).join('\n');
    expect(w).toMatch(/frame_id on a person/);
    expect(w).toMatch(/places in different frames \(harbor-1600, faerie-hill\)/);
    expect(lintPack(JSON.parse(framesText)).errors).toEqual([]);
  });

  it('FR4 a pack without frames: no frames, no frame wording anywhere the models see', async () => {
    expect(validatePackText(demoText).loaded!.frames.frames.size).toBe(0);
    const x = await setup(demoText, tick(1, 9, 30));
    expect(await turn(x, 'I walk to the road.', 'Dust on the road. [FR4a]', { scene_end: at(1, 9, 40), scene_frame: 'harbor-1600' })).toBe(true);
    expect(frameNow(x)).toBe(MAIN_FRAME);
    expect(x.engine.current!.replay.state.records.some((r) => r.kind === 'scene_frame')).toBe(false);
    expect(await turn(x, 'I keep walking.', 'Still dusty. [FR4b]', { scene_end: at(1, 9, 50) })).toBe(true);
    expect(lastCtx(x)).not.toMatch(/TIME FRAMES|\[in /);
    expect(lastEval(x).time_frames).toBeUndefined();
    expect(x.model.tasks('extract_user').slice(-1)[0].input.current_frame).toBeUndefined();
    expect(x.engine.sceneFrameNow()).toBeNull();
  });

  it('FR5 the GM is told the clock is the main clock, the scene\'s frame, and the local time of frames in play', async () => {
    const x = await setup();
    expect(await turn(x, '我们去转移室。', '转移室的灯亮了。[FR5a]', { scene_end: at(1, 13, 55) })).toBe(true);
    const ctx = lastCtx(x);
    const sec = ctx.split('\n\n').find((s) => s.startsWith('TIME FRAMES'))!;
    expect(sec).toMatch(/every story time in this context is on the main clock \(时序管理局本部\)/);
    expect(sec).toMatch(/- 1600年的港城 \[harbor-1600\]: local time now 1600-04-12 13:50 \(main 2031-03-03 13:50 \(D1\) = local 1600-04-12 13:50; local time runs at the same speed/);
    expect(sec).toMatch(/The scene is in 时序管理局本部 \(the main clock's own time\)/);
    // the HARD transfer at 14:00 carries its local time
    expect(ctx).toMatch(/\[transfer\][^\n]*\[in 1600年的港城; local 1600-04-12 14:00\]/);
    // the clock line comes first, the frames right after it
    expect(ctx.indexOf('TIME FRAMES')).toBeLessThan(ctx.indexOf('ACTUAL HISTORY (retrieved'));
    expect(ctx.indexOf('TIME FRAMES')).toBeGreaterThan(ctx.indexOf('CLOCK & SCENE'));
    // the reviewer gets the frames and how to report a move
    const ev = lastEval(x);
    expect(ev.time_frames.scene_frame_now).toBe(MAIN_FRAME);
    expect(ev.time_frames.frames.map((f: any) => f.id)).toContain('harbor-1600');
    expect(ev.time_frames.rule).toMatch(/scene_frame: the id of the frame the scene is in at the END of the reply/);
  });

  it('FR6 the reviewer\'s scene_frame moves the scene; later turns read local time there; Horae is not used in another frame', async () => {
    const x = await setup();
    x.host.horae = { status: () => ({ available: true, version: 'x', mode: 'metadata', staleIndexes: [], busy: false, scene: { date: '1600/04/12', time: '15:00' } }), waitForIdle: async () => true, reanalyze: async () => undefined } as any;
    expect(await turn(x, '出发。', '光芒散去，你们站在1600年的码头上。[FR6a]', { scene_end: at(1, 14, 5), scene_frame: 'harbor-1600' })).toBe(true);
    expect(frameNow(x)).toBe('harbor-1600');
    expect(x.engine.sceneFrameNow()).toEqual({ id: 'harbor-1600', name: '1600年的港城', local: '1600-04-12 14:05', main: false });
    expect(await turn(x, '我们去教堂。', '你们沿着石阶走向教堂。[FR6b]', { scene_end: at(1, 14, 20) })).toBe(true);
    expect(frameNow(x)).toBe('harbor-1600'); // null keeps the frame
    const ctx = lastCtx(x);
    expect(ctx).toMatch(/The scene is in 1600年的港城: local time now 1600-04-12 14:05/);
    expect(lastEval(x).time_frames.scene_frame_now).toBe('harbor-1600');
    expect(lastEval(x).horae_time).toBeUndefined(); // Horae reads the local date here; not the main clock
    expect(x.model.tasks('extract_user').slice(-1)[0].input.current_frame).toMatchObject({ name: '1600年的港城', local_now: '1600-04-12 14:05' });
    expect(x.engine.current!.replay.state.clock.lo).toBe(tick(1, 14, 20));
    // back home, by the main frame's name
    expect(await turn(x, '回去。', '你们回到了转移室。[FR6c]', { scene_end: at(1, 15, 0), scene_frame: '时序管理局本部' })).toBe(true);
    expect(frameNow(x)).toBe(MAIN_FRAME);
  });

  it('FR7 the move belongs to its reply: deleting or swiping it away takes the frame back', async () => {
    const x = await setup();
    expect(await turn(x, '出发。', '你们到了1600年的码头。[FR7a]', { scene_end: at(1, 14, 5), scene_frame: 'harbor-1600' })).toBe(true);
    expect(frameNow(x)).toBe('harbor-1600');
    x.model.draft('转移失败，你们还在转移室。[FR7b]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[FR7b]'), { scene_end: at(1, 14, 5) });
    expect(await x.engine.runOperation('swipe')).toBe(true);
    expect(frameNow(x)).toBe(MAIN_FRAME);
    x.host.selectSwipe(x.host.chat.length - 1, 0);
    await x.engine.reconcile('test');
    expect(frameNow(x)).toBe('harbor-1600');
    x.host.remove(x.host.chat.length - 1);
    await x.engine.reconcile('test');
    expect(frameNow(x)).toBe(MAIN_FRAME);
  });

  it('FR8 a frame is only named, not entered, in a flashback; an unknown frame is ignored', async () => {
    const x = await setup();
    expect(await turn(x, '回忆。', '你想起了梦里的白花庭院。[FR8a]', { scene_end: at(1, 13, 55), flashback: true, scene_frame: 'dream-garden' })).toBe(true);
    expect(frameNow(x)).toBe(MAIN_FRAME);
    expect(await turn(x, '走。', '你们走向转移室。[FR8b]', { scene_end: at(1, 13, 58), scene_frame: 'atlantis' })).toBe(true);
    expect(frameNow(x)).toBe(MAIN_FRAME);
    const L = loaded();
    expect(frameRef(L, '妖精丘')).toBe('faerie-hill');
    expect(frameRef(L, 'main')).toBe(MAIN_FRAME);
    expect(frameRef(L, null)).toBeNull();
  });

  it('FR9 当前时空 by hand: the scene moves to the chosen frame and back', async () => {
    const x = await setup();
    expect(await turn(x, '出发。', '光芒一闪。[FR9a]', { scene_end: at(1, 14, 5) })).toBe(true);
    await x.engine.setSceneFrame('harbor-1600');
    expect(frameNow(x)).toBe('harbor-1600');
    await x.engine.setSceneFrame(MAIN_FRAME);
    expect(frameNow(x)).toBe(MAIN_FRAME);
    await expect(x.engine.setSceneFrame('atlantis')).rejects.toThrow(/unknown time frame/);
  });

  it('FR10 timeline: events in another frame show the frame and local time; 现在 names the scene\'s frame', async () => {
    const L = loaded();
    const g = packGraph(L, ORIGIN);
    const church = g.nodes.find((n) => n.id === 'church')!;
    expect(church.frame).toMatchObject({ id: 'harbor-1600', name: '1600年的港城', local: '1600-04-12 16:00' });
    expect(church.detail![0]).toBe('时空：1600年的港城（当地 1600-04-12 16:00 起，至 1600-04-12 20:00）');
    expect(g.nodes.find((n) => n.id === 'return')!.frame).toBeUndefined();
    g.nowTick = tick(1, 14, 5);
    g.frames!.now = { id: 'harbor-1600', name: '1600年的港城', local: '1600-04-12 14:05', main: false };
    const svg = renderGraphSvg(g, 'pack');
    expect(svg).toMatch(/现在 · 1600年的港城 1600-04-12 14:05/);
    expect(svg).toMatch(/cg-frame cg-frame-0/);
    expect(svg).toMatch(/1600年的港城 1600-04-12/);
    const plain = packGraph(validatePackText(demoText).loaded!, null);
    expect(plain.frames).toBeUndefined();
    expect(renderGraphSvg({ ...plain, nowTick: 600 }, 'pack')).toMatch(/>现在</);
  });
});
