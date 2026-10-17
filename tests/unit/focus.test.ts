// FO1-FO3: 关注 (focus) — the player marks a SOFT/FREE event; the GM and planner are asked to give the player a chance to be there.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { focusedLive } from '../../src/domain/schedule';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}

describe('focus', () => {
  it('FO1 a focused event within the next day reaches the GM as something to lead the player to, without forcing it', async () => {
    const x = await setup();
    expect(await x.engine.toggleFocus('council-broadcast')).toBe(true);
    expect(x.engine.campaign()!.focusEvents).toEqual(['council-broadcast']);
    x.host.addUser('I look around.');
    x.model.draft('The square is busy. [F1]');
    await x.engine.runOperation('normal');
    const ctx = x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
    expect(ctx).toMatch(/PLAYER WANTS TO EXPERIENCE[\s\S]*do not force its course or result[\s\S]*\n- [^\n]*(Council|broadcast)/i);
  });

  it('FO2 unfocusing removes it; settled, impossible or HARD events are never listed', async () => {
    const x = await setup();
    await x.engine.toggleFocus('council-broadcast');
    expect(await x.engine.toggleFocus('council-broadcast')).toBe(false);
    x.host.addUser('I look around.');
    x.model.draft('The square is busy. [F2]');
    await x.engine.runOperation('normal');
    expect(x.model.tasks('draft').slice(-1)[0].input.engineContext as string).not.toMatch(/PLAYER WANTS TO EXPERIENCE/);
    const s = x.engine.current!.replay.state;
    expect(focusedLive(x.engine.pack(), s, ['conflict-begins', 'harbor-festival'], tick(1, 9, 30)).map((f) => f.event.id)).toEqual([]); // HARD; festival is days away
  });

  it('FO3 the planner receives focused events as player interests', async () => {
    const x = await setup();
    await x.engine.toggleFocus('council-broadcast');
    x.host.addUser('I look around.');
    x.model.draft('The square is busy. [F3]');
    await x.engine.runOperation('normal');
    const plans = x.model.tasks('plan');
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.slice(-1)[0].input.player_interests.map((i: any) => i.id)).toContain('council-broadcast');
  });
});
