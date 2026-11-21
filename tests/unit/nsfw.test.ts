import { describe, expect, it } from 'vitest';
import { makeEngine, tick, at } from './fake';
import { demoRaw } from './helpers';
import { grudgesNow } from '../../src/core/hostility';

const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker who boxed as a youth', public_identity: 'works the piers' }, affiliations: [], places: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
type X = ReturnType<typeof makeEngine>;

async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker. Boxed as a youth.' });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(JSON.stringify(demoRaw()), { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around the harbor.');
  x.model.draft('The harbor at dawn. [N0]');
  x.model.on('evaluate', (i) => String(i.candidate).includes('[N0]'), { scene_end: at(1, 6, 30), scene_entities: ['harbor'], player_places: ['harbor'] });
  await x.engine.runOperation('normal');
  return x;
}
const st = (x: X) => x.engine.current!.replay.state;
const ctx = (x: X) => String(x.model.tasks('draft').at(-1)!.input.engineContext);
async function turn(x: X, user: string, drafts: { text: string; evaluate?: any }[]) {
  x.host.addUser(user);
  for (const d of drafts) {
    x.model.draft(d.text);
    x.model.on('evaluate', (i) => String(i.candidate).includes(d.text.slice(-6)), { scene_entities: ['harbor'], player_places: ['harbor'], ...(d.evaluate || {}) });
  }
  return x.engine.runOperation('normal');
}
/** A thug who swore to come back on day 2 at 20:00, and the clock past it. */
async function grudgeDue(x: X) {
  await turn(x, 'I knock the thug down.', [{ text: "The thug spits blood: \"I'll be back tomorrow night.\" [N1]", evaluate: {
    scene_end: at(1, 7, 0),
    new_entities: [{ ref: 'n1', name: 'Thug', kind: 'person', description: 'a thug Ash knocked down', quote: 'The thug' }],
    grudges: [{ who: 'n1', why: 'Ash knocked him down', quote: "I'll be back tomorrow night", comes: { day: 2, minute: 20 * 60 } }],
  } }]);
  await turn(x, 'I sleep until the next evening.', [{ text: 'You sleep through the day. [N2]', evaluate: { scene_end: at(2, 20, 30) } }]);
  expect(grudgesNow(st(x))).toHaveLength(1);
}

describe('NSFW 模式: the world does not reach out to the player', () => {
  it('NS1 off by default; turned on by hand, a due grudge waits (not required, a reply without it is kept), the world reaction is not asked and the GM is told nobody interrupts; turned off, the grudge comes', async () => {
    const x = await setup();
    expect(x.engine.nsfwMode()).toBe(false);
    await grudgeDue(x);
    const integrations = x.model.tasks('integrate').length;
    expect(integrations).toBeGreaterThan(0);

    await x.engine.setNsfwMode(true);
    expect(x.engine.nsfwMode()).toBe(true);
    expect(x.engine.campaign()!.nsfwMode).toBe(true);
    for (const [msg, tag] of [['I pull her close and we kiss.', '[N3]'], ['Mm.', '[N4]']]) {
      await turn(x, msg, [{ text: `Time slows. ${tag}`, evaluate: { scene_end: at(2, 20, 45) } }]);
      expect(ctx(x)).toContain('PRIVATE SCENE');
      expect(ctx(x)).not.toContain('HOSTILE — REQUIRED');
      expect(x.host.chat.at(-1)!.text).toContain(tag);
    }
    expect(x.model.tasks('integrate').length).toBe(integrations);
    expect(grudgesNow(st(x))).toHaveLength(1);

    await x.engine.setNsfwMode(false);
    await turn(x, 'I walk down the harbor road.', [{ text: 'The Thug steps out and swings at you. [N5]', evaluate: { scene_end: at(2, 21, 30) } }]);
    expect(ctx(x)).not.toContain('PRIVATE SCENE');
    expect(ctx(x)).toContain('HOSTILE — REQUIRED');
  });

  it('NS2 the player\'s messages never turn it on: without the mode a due grudge is required as usual', async () => {
    const x = await setup();
    await grudgeDue(x);
    await turn(x, 'I pull her close and we kiss.', [{ text: 'The Thug kicks the door in and swings at you. [N6]', evaluate: { scene_end: at(2, 20, 40) } }]);
    expect(ctx(x)).not.toContain('PRIVATE SCENE');
    expect(ctx(x)).toContain('HOSTILE — REQUIRED');
    expect(x.engine.nsfwMode()).toBe(false);
  });
});
