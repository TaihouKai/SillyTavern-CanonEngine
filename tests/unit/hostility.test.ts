import { describe, expect, it } from 'vitest';
import { makeEngine, tick, at } from './fake';
import { demoRaw, load } from './helpers';
import { fightNow } from '../../src/core/combat';
import { DANGER_CHANCE, LEVEL_FACTOR, grudgesNow, inHours, roll } from '../../src/core/hostility';
import { validatePack } from '../../src/core/domain/pack';
import type { CanonPack } from '../../src/core/domain/types';

const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker who boxed as a youth', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
type X = ReturnType<typeof makeEngine>;

/** The demo pack with a danger at the harbor at night. */
function withDanger(freq: 'common' | 'occasional' | 'rare' = 'common'): CanonPack {
  const raw = demoRaw();
  raw.combat!.nodes!.push({ id: 'cb-harbor-muggers', kind: 'danger', name: 'Harbor muggers', gist: 'Muggers work the harbor road at night.', text: 'After dark, small gangs rob people walking alone on the harbor road; they go for whoever looks like they carry money.', hours: { from: '20:00', to: '04:00' }, frequency: freq, source_refs: ['example-source'] } as never);
  raw.combat!.links!.push({ from: 'harbor', to: 'cb-harbor-muggers', label: 'danger' });
  return raw;
}

async function setup(raw: CanonPack = demoRaw()) {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker. Boxed as a youth.' });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around the harbor.');
  x.model.draft('The harbor at dawn. [H0]');
  x.model.on('evaluate', (i) => String(i.candidate).includes('[H0]'), { scene_end: at(1, 6, 30), scene_entities: ['harbor'], player_places: ['harbor'] });
  await x.engine.runOperation('normal');
  return x;
}
const me = (x: X) => x.engine.playerProfile()!.profile.playerId;
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

describe('主动敌对: the world comes for the player', () => {
  it('HO1 a grudge the reply shows is recorded; when its time comes the GM must bring them (a reply without them is sent back); a fight with them settles it', async () => {
    const x = await setup();
    await turn(x, 'I knock the thug down.', [{ text: "The thug spits blood: \"I'll be back tomorrow night with my boys.\" [H1]", evaluate: {
      scene_end: at(1, 7, 0),
      new_entities: [{ ref: 'n1', name: 'Thug', kind: 'person', description: 'a thug Ash knocked down', quote: 'The thug' }],
      grudges: [{ who: 'n1', why: 'Ash knocked him down', quote: "I'll be back tomorrow night with my boys", comes: { day: 2, minute: 20 * 60 } }],
    } }]);
    const g = grudgesNow(st(x));
    expect(g).toHaveLength(1);
    const thug = g[0].holder;
    expect(st(x).runtimeEntities.get(thug)?.name).toBe('Thug');
    expect(g[0].comes).toBe(tick(2, 20, 0));
    // the reviewer knows the grudges in force; the panel lists it, not yet due
    expect(x.engine.hostilityView()!.grudges[0]).toMatchObject({ name: 'Thug', why: 'Ash knocked him down', due: false });

    // not before its time
    await turn(x, 'I go home and sleep until the next evening.', [{ text: 'You sleep through the day. [H2]', evaluate: { scene_end: at(2, 20, 30) } }]);
    expect(ctx(x)).not.toContain('HOSTILE — REQUIRED');
    expect(x.model.tasks('evaluate').at(-1)!.input.grudges_now).toEqual([{ who: `${thug} | Thug`, why: 'Ash knocked him down' }]);

    // its time has come: required; a reply without them is sent back
    await turn(x, 'I walk down the harbor road.', [
      { text: 'A quiet walk. [H3a]', evaluate: { scene_end: at(2, 20, 45) } },
      { text: 'The Thug steps out with two friends and swings at you. [H3b]', evaluate: { scene_end: at(2, 20, 45), fight: { starts: true, participants: [me(x), thug], resolved_unruled: false, quote: 'swings at you' } } },
    ]);
    expect(x.model.tasks('draft').at(-2)!.input.engineContext).toContain('HOSTILE — REQUIRED');
    expect(x.model.tasks('draft').at(-2)!.input.engineContext).toContain('Thug — Ash knocked him down');
    expect(x.host.chat.at(-1)!.text).toContain('[H3b]');
    expect(fightNow(st(x)).participants).toContain(thug);
    expect(grudgesNow(st(x))).toEqual([]);
    expect(st(x).hostility.grudges.at(-1)).toMatchObject({ holder: thug, ended: 'avenged' });
  });

  it('HO1b when they come at the player and the review saw no fight yet, the code starts it (live: the reply stopped as the attack began, the review called it a hostile contact)', async () => {
    const x = await setup();
    await turn(x, 'I knock the thug down.', [{ text: "The thug spits: \"Tomorrow night.\" [J1]", evaluate: {
      scene_end: at(1, 7, 0), new_entities: [{ ref: 'n1', name: 'Thug', kind: 'person', description: 'a thug', quote: 'The thug' }],
      grudges: [{ who: 'n1', why: 'knocked down', quote: 'Tomorrow night.', comes: { day: 2, minute: 20 * 60 } }],
    } }]);
    const thug = grudgesNow(st(x))[0].holder;
    await turn(x, 'I sleep until the next evening.', [{ text: 'You sleep. [J2]', evaluate: { scene_end: at(2, 20, 30) } }]);
    await turn(x, 'I walk down the harbor road.', [{ text: 'The Thug blocks the road and raises a pipe at you. [J3]', evaluate: {
      scene_end: at(2, 20, 45), contacts: [{ quote: 'raises a pipe at you', actors: [thug], kind: 'hostile', scope_kind: 'storyline', scope_label: 'revenge', opportunity_id: null }],
    } }]);
    expect(x.host.chat.at(-1)!.text).toContain('[J3]');
    expect(fightNow(st(x))).toMatchObject({ ongoing: true, source: 'engine' });
    expect(fightNow(st(x)).participants).toEqual([me(x), thug]);
    expect(grudgesNow(st(x))).toEqual([]);
  });

  it('HO2 a grudge needs its words in the text; without a time it comes the next evening; one the reply settles ends', async () => {
    const x = await setup();
    await turn(x, 'I shove Mira aside.', [{ text: 'Mira glares: "You will regret this." [H4]', evaluate: {
      scene_end: at(1, 7, 0),
      grudges: [{ who: 'mira', why: 'Ash shoved her', quote: 'You will regret this.' }, { who: 'mira', why: 'twice', quote: 'words nobody wrote' }],
    } }]);
    const g = grudgesNow(st(x));
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ holder: 'mira', comes: tick(1, 18, 0) });
    await turn(x, 'I apologize to Mira.', [{ text: 'Mira sighs: "Fine. Forget it." [H5]', evaluate: { scene_end: at(1, 7, 30), grudges_ended: [{ who: 'mira', quote: 'Fine. Forget it.' }] } }]);
    expect(grudgesNow(st(x))).toEqual([]);
    expect(st(x).hostility.grudges.at(-1)).toMatchObject({ holder: 'mira', ended: 'reconciled' });
  });

  it('HO3 a danger of where the player is comes when the roll lets it through (the same stretch gives the same answer), at most once a day; the switch stops dangers, not grudges', async () => {
    const x = await setup(withDanger('common'));
    const seed = x.engine.campaign()!.sessionId;
    const p = DANGER_CHANCE.common * LEVEL_FACTOR.medium;
    // a night stretch where the roll lets it through
    let t = tick(1, 21, 0);
    while (roll(seed, 'cb-harbor-muggers', t) >= p || !inHours({ hours: { from: '20:00', to: '04:00' } }, t)) t += 180;
    const h = Math.floor((t % 1440) / 60), d = Math.floor(t / 1440);
    expect(inHours({ hours: { from: '20:00', to: '04:00' } }, t)).toBe(true);
    await turn(x, 'I wait at the harbor until night.', [{ text: 'Night falls. [H6]', evaluate: { scene_end: at(d, h, 0) } }]);
    await turn(x, 'I walk home along the harbor road.', [
      { text: 'A quiet walk home. [H7a]', evaluate: { scene_end: at(d, h, 10) } },
      { text: 'Two muggers block the road and one lunges at you. [H7b]', evaluate: { scene_end: at(d, h, 10), new_entities: [{ ref: 'n1', name: 'Mugger', kind: 'person', description: 'a harbor mugger', quote: 'Two muggers' }], fight: { starts: true, participants: [me(x), 'n1'], resolved_unruled: false, quote: 'one lunges at you' } } },
    ]);
    expect(x.model.tasks('draft').at(-2)!.input.engineContext).toContain('DANGER HERE — REQUIRED');
    expect(x.model.tasks('draft').at(-2)!.input.engineContext).toContain('Harbor muggers');
    expect(x.host.chat.at(-1)!.text).toContain('[H7b]');
    expect(st(x).hostility.dangers).toHaveLength(1);
    expect(x.engine.hostilityView()!.came[0]).toMatchObject({ name: 'Harbor muggers', place: 'Harbor' });
    // once a day
    await turn(x, 'I fight them off and keep walking.', [{ text: 'They run. [H8]', evaluate: { scene_end: at(d, h, 20), fight: null } }]);
    expect(ctx(x)).not.toContain('DANGER HERE');
  });

  it('HO4 with the switch off no danger comes; the panel takes a grudge away and adds one', async () => {
    const x = await setup(withDanger('common'));
    // the panel (Mira is alive this early in the demo story)
    expect(await x.engine.editHostility({ add: { name: 'Mira', why: 'she blames Ash for the strike' } })).toBe(true);
    expect(grudgesNow(st(x))[0]).toMatchObject({ holder: 'mira', source: 'ui', comes: tick(1, 18, 0) });
    expect(await x.engine.editHostility({ add: { name: 'Nobody', why: 'x' } })).toBe(false);
    expect(await x.engine.editHostility({ add: { name: me(x), why: 'x' } })).toBe(false);
    expect(await x.engine.editHostility({ end: 'mira' })).toBe(true);
    expect(grudgesNow(st(x))).toEqual([]);
    // the switch off: nights at the harbor, no danger
    x.engine.settings.dangers = false;
    for (let k = 0; k < 4; k++) await turn(x, `I walk the harbor road at night ${k}.`, [{ text: `Night ${k}. [H9${k}]`, evaluate: { scene_end: at(1 + k, 22, 0) } }]);
    expect(x.model.tasks('draft').some((t) => String(t.input.engineContext).includes('DANGER HERE'))).toBe(false);
    expect(x.engine.hostilityView()!.here[0]).toMatchObject({ name: 'Harbor muggers', frequency: 'common', hours: '20:00–04:00' });
  });

  it('HO6 someone known only by a description who is now named keeps their identity and takes the name (live: 「初中男生」 and 「小仓航」 became two people)', async () => {
    const x = await setup();
    await turn(x, 'I help the boy up.', [{ text: 'The schoolboy thanks you. [H10]', evaluate: { scene_end: at(1, 7, 0), new_entities: [{ ref: 'n1', name: 'schoolboy', kind: 'person', description: 'a boy Ash helped', quote: 'The schoolboy' }] } }]);
    const boy = [...st(x).runtimeEntities.values()].find((r) => r.name === 'schoolboy')!.id;
    await turn(x, 'I ask his name.', [{ text: '"I am Kenta," the schoolboy says. [H11]', evaluate: { scene_end: at(1, 7, 5), new_entities: [{ ref: 'n1', name: 'Kenta', kind: 'person', description: 'the schoolboy', quote: 'I am Kenta', same_as: boy }], present: ['n1'] } }]);
    const people = [...st(x).runtimeEntities.values()].filter((r) => r.kind === 'person' && !r.id.startsWith('rt.player.'));
    expect(people.map((r) => r.name)).toEqual(['Kenta']);
    expect(people[0].aliases).toContain('schoolboy');
    expect(x.engine.current!.index.resolveEntity('Kenta').ids).toEqual([boy]);
  });

  it('HO5 pack lint: a danger says how often, is linked from somewhere, and only dangers have hours', () => {
    const raw = withDanger();
    delete (raw.combat!.nodes!.at(-1) as any).frequency;
    raw.combat!.links = raw.combat!.links!.filter((l) => l.to !== 'cb-harbor-muggers');
    (raw.combat!.nodes![0] as any).hours = { from: '01:00', to: '02:00' };
    const errs = validatePack(raw).errors.map((e) => e.message).join('\n');
    expect(errs).toMatch(/a danger says how often/);
    expect(errs).toMatch(/linked from no place or organization/);
    expect(errs).toMatch(/hours and frequency are for dangers/);
    expect(load(withDanger()).combat.nodes.get('cb-harbor-muggers')?.frequency).toBe('common');
  });
});
