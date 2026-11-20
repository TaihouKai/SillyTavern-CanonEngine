import { describe, expect, it } from 'vitest';
import { makeEngine, tick, at } from './fake';
import { demoRaw } from './helpers';
import { grudgesNow } from '../../src/core/hostility';
import { nsfwOfMessage, nsfwScene } from '../../src/core/nsfw';

const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker who boxed as a youth', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
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
/** One turn; nsfw: what the player's message says about the scene (extract_user), and the reviews of the drafts. */
async function turn(x: X, user: string, nsfw: 'on' | 'off' | 'none', drafts: { text: string; evaluate?: any }[]) {
  x.host.addUser(user);
  x.model.on('extract_user', (i) => i.message === user, { statements: [], references: [], scene_entities: [], nsfw });
  for (const d of drafts) {
    x.model.draft(d.text);
    x.model.on('evaluate', (i) => String(i.candidate).includes(d.text.slice(-6)), { scene_entities: ['harbor'], player_places: ['harbor'], ...(d.evaluate || {}) });
  }
  return x.engine.runOperation('normal');
}
/** A thug who swore to come back on day 2 at 20:00, and the clock past it. */
async function grudgeDue(x: X) {
  await turn(x, 'I knock the thug down.', 'none', [{ text: "The thug spits blood: \"I'll be back tomorrow night.\" [N1]", evaluate: {
    scene_end: at(1, 7, 0),
    new_entities: [{ ref: 'n1', name: 'Thug', kind: 'person', description: 'a thug Ash knocked down', quote: 'The thug' }],
    grudges: [{ who: 'n1', why: 'Ash knocked him down', quote: "I'll be back tomorrow night", comes: { day: 2, minute: 20 * 60 } }],
  } }]);
  await turn(x, 'I sleep until the next evening.', 'none', [{ text: 'You sleep through the day. [N2]', evaluate: { scene_end: at(2, 20, 30) } }]);
  expect(grudgesNow(st(x))).toHaveLength(1);
}

describe('NSFW 场景: the world does not reach out to the player', () => {
  it('NS1 inside such a scene a due grudge waits (not required, a reply without it is kept), the world reaction is not asked and the GM is told nobody interrupts; it holds while the last reply ended inside one, and the grudge comes once the player ends it', async () => {
    const x = await setup();
    await grudgeDue(x);
    const integrations = x.model.tasks('integrate').length;
    expect(integrations).toBeGreaterThan(0);

    // the player's message opens one: nothing comes; the reply without the thug stands
    await turn(x, 'I pull her close and we kiss.', 'on', [{ text: 'A long kiss in the quiet room. [N3]', evaluate: { scene_end: at(2, 20, 45), nsfw: true } }]);
    expect(ctx(x)).toContain('PRIVATE SCENE');
    expect(ctx(x)).not.toContain('HOSTILE — REQUIRED');
    expect(x.model.tasks('draft').filter((d) => String(d.input.engineContext).includes('PRIVATE SCENE'))).toHaveLength(1);
    expect(x.host.chat.at(-1)!.text).toContain('[N3]');
    expect(x.model.tasks('integrate').length).toBe(integrations);
    expect(grudgesNow(st(x))).toHaveLength(1);
    expect(x.engine.privateSceneNow()).toBe(true);

    // a message that says nothing either way: the last reply ended inside it, so it holds
    await turn(x, 'Mm.', 'none', [{ text: 'Time slows. [N4]', evaluate: { scene_end: at(2, 21, 0) } }]);
    expect(ctx(x)).toContain('PRIVATE SCENE');
    expect(ctx(x)).not.toContain('HOSTILE — REQUIRED');
    expect(x.host.chat.at(-1)!.text).toContain('[N4]');
    expect(x.engine.privateSceneNow()).toBe(false);

    // the reply ended outside one (no nsfw from its review) and the player goes out: the grudge comes
    await turn(x, 'Afterwards I get dressed and walk down the harbor road.', 'off', [{ text: 'The Thug steps out and swings at you. [N5]', evaluate: { scene_end: at(2, 21, 30) } }]);
    expect(ctx(x)).not.toContain('PRIVATE SCENE');
    expect(ctx(x)).toContain('HOSTILE — REQUIRED');
  });

  it('NS2 the player\'s message ends the scene even when the last reply ended inside one; with the switch off the world reaches out as usual', async () => {
    const x = await setup();
    await grudgeDue(x);
    await turn(x, 'I pull her close.', 'on', [{ text: 'Close. [N6]', evaluate: { scene_end: at(2, 20, 40), nsfw: true } }]);
    expect(x.engine.privateSceneNow()).toBe(true);
    await turn(x, 'We part and I head out to the road.', 'off', [{ text: 'The Thug blocks the road and swings at you. [N7]', evaluate: { scene_end: at(2, 21, 0) } }]);
    expect(ctx(x)).not.toContain('PRIVATE SCENE');
    expect(ctx(x)).toContain('HOSTILE — REQUIRED');

    const y = await setup();
    y.engine.settings.nsfwQuiet = false;
    await grudgeDue(y);
    await turn(y, 'I pull her close.', 'on', [{ text: 'The Thug kicks the door in and swings at you. [N8]', evaluate: { scene_end: at(2, 20, 40), nsfw: true } }]);
    expect(ctx(y)).not.toContain('PRIVATE SCENE');
    expect(ctx(y)).toContain('HOSTILE — REQUIRED');
    expect(y.engine.privateSceneNow()).toBe(false);
  });

  it('NS3 the decision: the message decides when it says; else the reply it continues or the last reply', () => {
    expect(nsfwOfMessage('on')).toBe(true);
    expect(nsfwOfMessage('off')).toBe(false);
    expect(nsfwOfMessage('none')).toBeUndefined();
    expect(nsfwOfMessage(undefined)).toBeUndefined();
    expect(nsfwScene({ message: false, lastReply: true })).toBe(false);
    expect(nsfwScene({ message: true })).toBe(true);
    expect(nsfwScene({ lastReply: true })).toBe(true);
    expect(nsfwScene({ continued: true, lastReply: false })).toBe(true);
    expect(nsfwScene({})).toBe(false);
  });
});
