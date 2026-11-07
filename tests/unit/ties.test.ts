// TI: the player's relationships and who knows what about them. The Persona gives the start; the review of an accepted
// reply records how play changes them (with the quote), the user can change them in the panel, and the GM, the
// analysis and recognition see how they stand now (user decision 2026-11-08: relationships and 谁知道你的什么 are
// kept up by Canon, not frozen at the Persona read).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { playedProfile, recognitionGroups } from '../../src/runtime/integration';
import { PROMPTS } from '../../src/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;
const PROFILE = {
  player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [],
  relationships: [{ name: 'Mira', existing_id: 'mira', relation: 'close friend since childhood', basis: 'persona_stated' }],
  knowers: [], uncertain: [],
};
async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker. Mira is a childhood friend.' });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(demo, { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: X, user: string, draft: string, ties: any[] = []) {
  x.host.addUser(user);
  x.model.draft(draft);
  if (ties.length) x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), { player_ties: ties });
  return x.engine.runOperation('normal');
}
const st = (x: X) => x.engine.current!.replay.state;
const ctx = (x: X) => String(x.model.tasks('draft').at(-1)!.input.engineContext);
const played = (x: X) => playedProfile(x.engine.current!.index, x.engine.playerProfile()!.profile);

describe('relationships and who knows what, as play changes them', () => {
  it('TI1 a relationship play changes: the GM sees how it stands now and what the Persona said at the start; the panel shows both', async () => {
    const x = await setup();
    expect(await turn(x, 'I tell Mira she lied to me.', 'Mira turns away; the friendship is over for now. [T1]', [{ tie: 'relation', who: 'Mira', existing_id: 'mira', relation: 'estranged friend after a quarrel', quote: 'the friendship is over for now' }])).toBe(true);
    expect(st(x).ties).toHaveLength(1);
    await turn(x, 'I walk the piers.', 'The piers. [T2]');
    expect(ctx(x)).toMatch(/connection: Mira \[mira\] — estranged friend after a quarrel \(as it stands since [^;]+ in play; Persona at the start: close friend since childhood\)/);
    const r = x.engine.integrationView(true)!.profile!.relationships[0];
    expect(r).toMatchObject({ name: 'Mira', text: 'estranged friend after a quarrel', basis: 'persona_stated', start: 'close friend since childhood', quote: 'the friendship is over for now' });
    // the analysis input carries it too
    expect(JSON.stringify(x.model.tasks('integrate').at(-1)?.input.player?.relationships || [])).toMatch(/estranged friend[^}]*at_start/);
    expect(PROMPTS.evaluate).toMatch(/player_ties: how this reply/);
  });

  it('TI2 someone learns the player\'s secret: they are a knower from then on (recognition too); knowing only grows', async () => {
    const x = await setup();
    await turn(x, 'I show Mira the smuggling ledger.', 'Mira reads the ledger and understands what you really do at night. [T3]', [{ tie: 'knows', who: 'Mira', existing_id: 'mira', level: 'secrets', about: 'Ash smuggles for the night boats', quote: 'understands what you really do at night' }]);
    await turn(x, 'I go home.', 'Home. [T4]');
    expect(ctx(x)).toMatch(/who knows: Mira knows: Ash smuggles for the night boats \(from play, since/);
    expect(recognitionGroups(x.engine.current!.index, x.engine.playerProfile()!.profile).find((g) => g.personId === 'mira')).toMatchObject({ level: 'secrets' });
    // a later, lesser report does not make her forget
    await turn(x, 'I meet Mira.', 'Mira nods; she knows who you are. [T5]', [{ tie: 'knows', who: 'Mira', existing_id: 'mira', level: 'identity', about: 'Ash smuggles for the night boats', quote: 'she knows who you are' }]);
    expect(played(x).knowers.find((k) => k.entityId === 'mira')!.level).toBe('secrets');
  });

  it('TI3 a death or a break ends the relationship; a new person met in play joins the list', async () => {
    const x = await setup();
    await turn(x, 'I hold Mira as the fever takes her.', 'Mira dies before dawn. Old Tomas, the net mender, stays with you and promises to help. [T6]', [
      { tie: 'relation', who: 'Mira', existing_id: 'mira', relation: 'childhood friend, died of the fever', ended: true, quote: 'Mira dies before dawn' },
      { tie: 'relation', who: 'Old Tomas', existing_id: null, relation: 'net mender who promised to help', quote: 'stays with you and promises to help' },
    ]);
    await turn(x, 'I sit by the water.', 'The water. [T7]');
    expect(ctx(x)).toMatch(/connection: Mira \[mira\] — ENDED: childhood friend, died of the fever/);
    expect(ctx(x)).toMatch(/connection: Old Tomas — net mender who promised to help \(from play, since/);
  });

  it('TI4 without its quote nothing is recorded; a quote from the player\'s own message counts', async () => {
    const x = await setup();
    await turn(x, 'I hug Mira.', 'A quiet morning. [T8]', [{ tie: 'relation', who: 'Mira', existing_id: 'mira', relation: 'lovers', quote: 'they kiss under the lantern' }]);
    expect(st(x).ties).toHaveLength(0);
    await turn(x, 'I ask Mira to be my girlfriend and she says yes.', 'Mira laughs. [T9]', [{ tie: 'relation', who: 'Mira', existing_id: 'mira', relation: 'girlfriend', quote: 'she says yes' }]);
    expect(played(x).relationships[0].relation).toBe('girlfriend');
  });

  it('TI5 the user changes, adds and removes ties in the panel; deleting the message that made a change takes it back', async () => {
    const x = await setup();
    await turn(x, 'I quarrel with Mira.', 'Mira storms off. [U1]', [{ tie: 'relation', who: 'Mira', existing_id: 'mira', relation: 'angry with Ash', quote: 'Mira storms off' }]);
    await turn(x, 'I mend nets.', 'Nets. [U2]');
    expect(played(x).relationships[0].relation).toBe('angry with Ash');
    x.host.remove(1); x.host.remove(1); // the quarrel and its reply (index 0 is the greeting)
    x.engine.sourceChanged('delete');
    await x.engine.reconcile('delete');
    expect(played(x).relationships[0].relation).toBe('close friend since childhood');
    await x.engine.editTie('relation', 'mira', 'Mira', { relation: 'sister in all but blood' });
    await x.engine.editTie('knows', null, 'The harbor watch', { level: 'identity', about: 'Ash is the one who found the body' });
    let p = played(x);
    expect(p.relationships[0]).toMatchObject({ relation: 'sister in all but blood', changed: expect.objectContaining({ by: 'ui', start: 'close friend since childhood' }) });
    expect(p.knowers).toEqual([expect.objectContaining({ who: 'The harbor watch', level: 'identity', basis: 'ui' })]);
    // the user may also lower what someone knows, and remove a tie
    await x.engine.editTie('knows', null, 'The harbor watch', { level: 'exists', about: 'only that someone found a body' });
    expect(played(x).knowers[0].level).toBe('exists');
    await x.engine.editTie('relation', 'mira', 'Mira', null);
    p = played(x);
    expect(p.relationships).toHaveLength(0);
    await turn(x, 'I look around.', 'Around. [U3]');
    expect(ctx(x)).not.toMatch(/connection: Mira/);
  });
});
