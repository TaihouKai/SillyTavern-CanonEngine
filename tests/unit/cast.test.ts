// CA1–CA5: an event's cast (who is at it from which fixed time) reaches the GM before the event starts, while it
// is in its window and while it is under way (live finding: the people who arrive later in an event — 湾内/泡浮,
// 上条/削板 — never turned up, because the GM only ever saw the event's opening or a clipped route).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { lintPack, validatePackText } from '../../src/domain/pack';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
// the ambush runs 10:00–11:00: Mira is on the road from 10:00, the council's patrol arrives at 10:30
function packWith(cast: unknown) {
  const p = structuredClone(base);
  const ev = p.events.find((e: any) => e.id === 'medic-ambush');
  ev.when = { ...ev.when, latest: { day: 1, minute: 660 }, precision: 'range', label: 'Day 1, 10:00–11:00' };
  if (cast !== null) ev.cast = cast;
  return p;
}
const CAST = [
  { entity_id: 'council', at: { day: 1, minute: 630 }, role: 'patrol answering the alarm' },
  { entity_id: 'mira', at: { day: 1, minute: 600 }, role: 'travelling medic, the target' },
];

async function setup(cast: unknown = CAST) {
  const x = makeEngine();
  await x.engine.bind(JSON.stringify(packWith(cast)), { startTick: tick(1, 9, 30), mode: 'new' });
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
const section = (ctx: string, head: string) => ctx.split('\n\n').find((s) => s.startsWith(head)) || '';
const name = (x: ReturnType<typeof makeEngine>, id: string) => x.engine.current!.index.entityName(id);

describe('event cast', () => {
  it('CA1 before the event starts, the GM sees who is there from when, in time order, and the cast rule', async () => {
    const x = await setup();
    expect(await turn(x, 'I walk to the road.', 'Dust on the road. [CA1a]', { scene_end: at(1, 9, 40) })).toBe(true);
    const ctx = lastCtx(x);
    const sec = section(ctx, 'CANON EVENTS ABOUT TO START');
    expect(sec).toMatch(new RegExp(`\\[medic-ambush\\][^\\n]*\\n  cast: ${name(x, 'mira')} arrives [^;]*10:00[^;]*\\(travelling medic, the target\\); ${name(x, 'council')} arrives [^;]*10:30`));
    expect(ctx).toMatch(/CAST of an event \(fixed times/);
    expect(ctx).toMatch(/whatever the player has done meanwhile \(fighting or talking with someone else does not keep them away\)/);
  });

  it('CA2 in its window (not started in the story), the event and its cast are required context, not droppable background', async () => {
    const x = await setup();
    expect(await turn(x, 'I wait by the road.', 'You wait until 10:05. [CA2a]', { scene_end: at(1, 10, 5) })).toBe(true);
    expect(await turn(x, 'I keep waiting.', 'Still waiting. [CA2b]', { scene_end: at(1, 10, 10) })).toBe(true);
    const ctx = lastCtx(x);
    const sec = section(ctx, 'CANON EVENTS WITHIN THEIR WINDOW');
    expect(sec).toMatch(new RegExp(`cast: ${name(x, 'mira')} there since [^;]*10:00[^;]*; ${name(x, 'council')} arrives [^;]*10:30`));
    // required sections come before the optional ones: it sits before the background list / at the end of required
    expect(ctx.indexOf('CAST of an event')).toBeGreaterThan(ctx.indexOf('CANON EVENTS WITHIN THEIR WINDOW'));
  });

  it('CA3 under way, the GM sees the whole original route (not clipped) and who has arrived by now', async () => {
    const x = await setup();
    const fight = { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush on the road', 'Bolts start flying', { pack_event_id: 'medic-ambush', disposition: 'ongoing', actors: ['mira'] })] };
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [CA3a]', fight)).toBe(true);
    expect(await turn(x, 'I draw my sword.', 'Steel rings. [CA3b]', { scene_end: at(1, 10, 20) })).toBe(true);
    let sec = section(lastCtx(x), 'CANON EVENTS UNDER WAY');
    const summary = base.events.find((e: any) => e.id === 'medic-ambush').summary;
    expect(sec).toContain(`Original route (FREE: reference): ${summary}`);
    expect(sec).toMatch(new RegExp(`${name(x, 'council')} arrives [^;]*10:30`));
    // named outright at the end: who must be in the scene now, who comes next
    expect(lastCtx(x)).toMatch(new RegExp(`AT THE EVENT UNDER WAY:\\n- [^\\n]*: present now — ${name(x, 'mira')}; still to come — ${name(x, 'council')} at [^\\n]*10:30\\. Everyone present now takes part`));
    // the fight goes on past 10:30: the patrol is due
    expect(await turn(x, 'I fight on.', 'You trade blows. [CA3c]', { scene_end: at(1, 10, 35) })).toBe(true);
    expect(await turn(x, 'I fight on.', 'More blows. [CA3d]', { scene_end: at(1, 10, 40) })).toBe(true);
    sec = section(lastCtx(x), 'CANON EVENTS UNDER WAY');
    expect(sec).toMatch(new RegExp(`${name(x, 'council')} there since [^;]*10:30`));
  });

  it('CA6 a cast member the story already brought in is shown as already here, not with the pack time (live: 食蜂 at 177)', async () => {
    const x = await setup();
    // the council's patrol (pack: 10:30) is already in the opening beat at 10:00
    const fight = { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush on the road', 'Bolts start flying', { pack_event_id: 'medic-ambush', disposition: 'ongoing', actors: ['mira', 'council'] })] };
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 the patrol is already there and bolts start flying at Mira. [CA6a]', fight)).toBe(true);
    expect(await turn(x, 'I draw my sword.', 'Steel rings. [CA6b]', { scene_end: at(1, 10, 10) })).toBe(true);
    const ctx = lastCtx(x);
    const sec = section(ctx, 'CANON EVENTS UNDER WAY');
    expect(sec).toMatch(new RegExp(`${name(x, 'council')} already here since [^;]*10:05 \\(actual play; the pack's time no longer applies\\)`));
    expect(sec).not.toMatch(new RegExp(`${name(x, 'council')} arrives`));
    expect(ctx).toMatch(new RegExp(`AT THE EVENT UNDER WAY:\\n- [^\\n]*: present now — [^;\\n]*${name(x, 'council')}[^;\\n]*\\. Everyone present now`));
    expect(ctx).not.toMatch(/still to come/);
  });

  it('CA4 an event without a cast adds neither a cast line nor the rule', async () => {
    const x = await setup(null);
    expect(await turn(x, 'I walk to the road.', 'Dust on the road. [CA4a]', { scene_end: at(1, 9, 40) })).toBe(true);
    const ctx = lastCtx(x);
    expect(ctx).toMatch(/\[medic-ambush\] \(FREE\) starts/);
    expect(ctx).not.toMatch(/\n {2}cast: |CAST of an event/);
  });

  it('CA5 the linter checks the cast: known entity, listed in the event, inside its window, once each; role required', () => {
    expect(lintPack(packWith(CAST)).errors).toEqual([]);
    const bad = lintPack(packWith([
      { entity_id: 'nobody', at: { day: 1, minute: 600 }, role: 'x' },
      { entity_id: 'union', at: { day: 1, minute: 600 }, role: 'x' },
      { entity_id: 'mira', at: { day: 1, minute: 700 }, role: 'x' },
      { entity_id: 'council', at: { day: 1, minute: 610 }, role: 'x' },
      { entity_id: 'council', at: { day: 1, minute: 620 }, role: 'x' },
    ])).errors.map((e) => e.message).join('\n');
    expect(bad).toMatch(/unknown entity "nobody"/);
    expect(bad).toMatch(/cast member "union" is not in the event's entity_ids/);
    expect(bad).toMatch(/cast time lies outside the event window/);
    expect(bad).toMatch(/"council" is listed in the cast more than once/);
    const noRole = validatePackText(JSON.stringify(packWith([{ entity_id: 'mira', at: { day: 1, minute: 600 } }])));
    expect(noRole.ok).toBe(false);
  });
});
