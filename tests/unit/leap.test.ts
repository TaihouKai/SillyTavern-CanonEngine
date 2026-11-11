// LP: time leap — {{time_leap:<time>}} in the player's message moves story time there in one reply. The leap plan
// decides only what the player's description changes; every other crossed canon event is settled offscreen along its
// original route; a HARD event the description rules out, or a leap that does not go forward, sends the message back.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { parseLeapTime } from '../../src/core/runtime/leap';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const ALL = ['medic-ambush', 'council-broadcast', 'conflict-begins', 'harbor-festival', 'conflict-ends'];

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(0, 8, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}

describe('time leap', () => {
  it('LP1 a leap back in time is sent back before any model call', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D0 07:00}}\nI wait.');
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.model.tasks('extract_user')).toHaveLength(0);
    expect(x.model.tasks('draft')).toHaveLength(0);
    expect(x.engine.campaign()!.recoveryState.errorKind).toBe('invalid_input');
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/back in time/);
  });

  it('LP2 a time Canon cannot read is sent back', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:next spring}}\nI wait.');
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/not a time Canon can read/);
  });

  it('LP3 every crossed canon event is settled, the GM writes the leap, the clock lands at the target', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI spend the days mapping the coast.');
    x.model.draft('Five days pass along the coast… On the fifth morning you stand on the pier. [LP3]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const plan = x.model.tasks('leap');
    expect(plan).toHaveLength(1);
    expect(plan[0].input.crossed_events.map((e: any) => e.id)).toEqual(ALL);
    expect(plan[0].input.player_message).not.toMatch(/time_leap/);
    const gm = x.model.tasks('draft')[0].input.engineContext as string;
    expect(gm).toMatch(/TIME LEAP \(this reply\)/);
    expect(gm).not.toMatch(/Always leave to the player, whatever else/);
    const ev = x.model.tasks('evaluate').find((c) => String(c.input.candidate).includes('[LP3]'))!.input;
    expect(ev.time_leap).toBeTruthy();
    expect(ev.player_voice.player_only).toEqual([]);
    const s = x.engine.current!.replay.state;
    for (const id of ALL) expect(s.dispositions.get(id)?.disposition, id).toBe('occurred');
    expect(s.clock.lo).toBeGreaterThanOrEqual(tick(5, 8, 0));
  });

  it('LP4 an event the description changes follows the plan, with the player character in it', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI talk the organizers into cancelling the festival.');
    x.model.on('leap', null, { events: [{ event_id: 'harbor-festival', decision: 'omitted', player_part: 'talks the organizers out of it', account: 'The festival is called off.' }] });
    x.model.draft('The festival never happens; the days pass. [LP4]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const s = x.engine.current!.replay.state;
    expect(s.dispositions.get('harbor-festival')?.disposition).toBe('omitted');
    expect(s.dispositions.get('conflict-ends')?.disposition).toBe('occurred');
    expect(x.model.tasks('draft')[0].input.engineContext).toMatch(/Harbor festival — does not happen: The festival is called off\./);
  });

  it('LP5 a HARD event the description rules out sends the message back', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI make sure the war never ends.');
    x.model.on('leap', null, { impossible: [{ event_id: 'conflict-ends', why: 'the player keeps the war going' }] });
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.model.tasks('draft')).toHaveLength(0);
    expect(x.engine.campaign()!.recoveryState.errorKind).toBe('invalid_input');
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/Union victory/);
    expect(x.engine.current!.replay.state.dispositions.has('conflict-ends')).toBe(false);
  });

  it('LP6 a HARD event the plan would change is never changed: the message is sent back', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI stop the fighting before it starts.');
    x.model.on('leap', null, { events: [{ event_id: 'conflict-begins', decision: 'omitted', player_part: 'stops it', account: 'No fighting.' }] });
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/The harbor conflict begins/);
  });

  it('LP7 during the leap the GM may write any act of the player character', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI join the militia.');
    x.model.draft('You fight on the docks for days. [LP7]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[LP7]'), { player_actions: [{ quote: 'You fight on the docks for days', category: 'combat', authorized_by_quote: null }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts).toHaveLength(1);
  });

  it('LP8 deleting the leap reply takes everything it settled with it', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI wait.');
    x.model.draft('Days pass. [LP8]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    x.host.remove(x.host.chat.length - 1);
    await x.engine.reconcile('test');
    const s = x.engine.current!.replay.state;
    for (const id of ALL) expect(s.dispositions.has(id), id).toBe(false);
    expect(s.clock.lo).toBe(tick(0, 8, 0));
  });

  it('LP10 an edited leap message: the kept reply is checked again with the leap staged again', async () => {
    const x = await setup();
    const u = x.host.addUser('{{time_leap:D5 08:00}}\nI wait.');
    x.model.draft('Days pass. [LP10]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    x.host.edit(x.host.chat.indexOf(u), '{{time_leap:D5 08:00}}\nI wait patiently.');
    x.engine.sourceChanged('edit');
    await x.engine.reconcile('test');
    expect(x.model.tasks('leap')).toHaveLength(2);
    const s = x.engine.current!.replay.state;
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
    for (const id of ALL) expect(s.dispositions.get(id)?.disposition, id).toBe('occurred');
    expect(s.clock.lo).toBeGreaterThanOrEqual(tick(5, 8, 0));
  });

  it('LP11 a beat of the leap without a usable time is placed in the leap, not at its landing', async () => {
    const x = await setup();
    x.host.addUser('{{time_leap:D5 08:00}}\nI map the coast.');
    x.model.draft('You map the whole coast over those days. [LP11]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[LP11]'), { occurrences: [{ ref: 'o1', title: 'Mapping the coast', account: 'maps the coast', quote: 'You map the whole coast', actors: [], affected: [], locations: [], time: null, origin: 'player', visibility: 'public', knowers: [], causes: [], pack_event_id: null, disposition: null, continues: null, ref_phrases: [], backstory: false }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    const o = [...x.engine.current!.replay.state.occurrences.values()].find((v) => v.title === 'Mapping the coast')!;
    expect(o.time.lo).toBe(tick(0, 8, 0));
    expect(o.time.hi).toBeGreaterThanOrEqual(tick(5, 8, 0));
  });

  it('LP9 the time formats of the start-time field; a date alone lands at 08:00', () => {
    const o = { y: 2000, m: 1, d: 1 };
    expect(parseLeapTime('D3 16:00', null)).toBe(tick(3, 16, 0));
    expect(parseLeapTime('D3', null)).toBe(tick(3, 8, 0));
    expect(parseLeapTime('2000-01-04 09:30', o)).toBe(tick(3, 9, 30));
    expect(parseLeapTime('2000-01-04', o)).toBe(tick(3, 8, 0));
    expect(parseLeapTime('2000年1月4日 09:30', o)).toBe(tick(3, 9, 30));
    expect(parseLeapTime('2000-01-04', null)).toBe(null);
    expect(parseLeapTime('soon', o)).toBe(null);
  });
});
