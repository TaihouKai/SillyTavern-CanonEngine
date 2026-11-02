// OB1–OB2: live finding — 索绮特接受首个任务 (preconditions met, nobody touched it) was judged "omitted" because 佐天
// "was at the track with 御坂" at 09:00: she had been with them the night before, and nothing in play put her anywhere
// then. An omission judged from actual play needs a cited record that rules the event out (one of its people shown
// during its window, or a lasting change to them); otherwise the original route stands.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(1, 7, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state;
const omitCiting = (x: ReturnType<typeof makeEngine>) => x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', (i: any) => ({
  adjudications: [{ event_id: 'medic-ambush', decision: 'omitted', time: null, account: 'Mira stayed with the player.', actors: ['mira'], causes: [String(i.recent_actual_play_with_these_characters[0]).match(/^\[([^\]]+)\]/)![1]], effects: [], plan_step_ids: [], reason: 'Mira was with the player', extraordinary: false }],
}));

describe('an omission from actual play needs a record that rules the event out', () => {
  it('OB1 a scene with the event\'s person hours before its window rules nothing out: the event happens', async () => {
    const x = await setup();
    expect(await turn(x, 'I have tea with Mira.', 'Mira sips her tea. [OB1a]', { scene_end: at(1, 7, 30), occurrences: [occ('o1', 'Tea with Mira', 'Mira sips her tea', { actors: ['mira'] })] })).toBe(true);
    omitCiting(x);
    expect(await turn(x, 'I spend the morning alone until 11:00.', 'The morning passes; it is 11:00. [OB1b]', { scene_end: at(1, 11, 0) })).toBe(true);
    const call = x.model.tasks('adjudicate').map((c) => c.input).find((i: any) => i.candidate?.id === 'medic-ambush');
    expect(call.recent_actual_play_with_these_characters[0]).toMatch(/^\[occ_[^\]]+\] .* Tea with Mira/);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('occurred');
  });

  it('OB2 the event\'s person shown with the player during its window: the omission stands', async () => {
    const x = await setup();
    expect(await turn(x, 'I spend the morning with Mira.', 'Mira stays with me through ten. [OB2a]', { scene_end: at(1, 10, 0), occurrences: [occ('o1', 'Morning with Mira', 'Mira stays with me through ten', { actors: ['mira'], time: { lo: { day: 1, minute: 540 }, hi: { day: 1, minute: 600 }, precision: 'range' } })] })).toBe(true);
    omitCiting(x);
    expect(await turn(x, 'We part at 11:00.', 'We part; it is 11:00. [OB2b]', { scene_end: at(1, 11, 0) })).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('omitted');
  });

  it('OB3 an event recorded as 未发生 can be re-analysed (live: no 重新分析 under it)', async () => {
    const x = await setup();
    await turn(x, 'I spend the morning with Mira.', 'Mira stays with me through ten. [OB3a]', { scene_end: at(1, 10, 0), occurrences: [occ('o1', 'Morning with Mira', 'Mira stays with me through ten', { actors: ['mira'], time: { lo: { day: 1, minute: 540 }, hi: { day: 1, minute: 600 }, precision: 'range' } })] });
    omitCiting(x);
    await turn(x, 'We part at 11:00.', 'We part; it is 11:00. [OB3b]', { scene_end: at(1, 11, 0) });
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('omitted');
    expect(x.engine.reanalyzableSource('medic-ambush')).not.toBeNull();
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'occurred', time: null, account: 'The ambush happens on the road after Mira leaves.', actors: ['mira', 'council'], causes: [], effects: [], plan_step_ids: [], reason: 'original route', extraordinary: false }] });
    expect(await x.engine.reanalyzeEvent('medic-ambush')).toBe('occurred');
  });
});
