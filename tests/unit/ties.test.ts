// TI: relations between people and who knows what about the player. A relation is between any two people — the
// player character like the pack's characters (user, 2026-11-15: the Persona is a person of the world like the
// original's characters). The pack gives the original characters' relations in stages that begin at events; the
// Persona gives the player's start; the review of an accepted reply records how play changes any of them (with the
// quote); the user can change the player's in the panel; the GM sees the pairs of the people in the scene.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { playedProfile, recognitionGroups } from '../../src/core/runtime/integration';
import { PROMPTS } from '../../src/core/runtime/prompts';
import { lintPack, validatePackText } from '../../src/core/domain/pack';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
// a second person of the pack, and how she and Mira stand: neighbours from the start, close after the ambush
const RELATION = {
  people: ['mira', 'tomas'], source_refs: [base.sources[0].id],
  stages: [
    { from_event: null, bond: 'neighbours on the harbor road', views: [{ who: 'tomas', calls: 'the medic', sees: 'keeps a polite distance from her' }] },
    { from_event: 'medic-ambush', why: 'he hid her after the ambush', bond: 'close friends since the ambush', views: [{ who: 'mira', calls: 'Tomas', sees: 'trusts him with her life' }, { who: 'tomas', calls: 'Mira', sees: 'looks out for her' }], together: 'easy silences; he fusses over her wounds' },
  ],
};
function pack(rel: unknown[] = [RELATION]) {
  const p = structuredClone(base);
  p.entities.push({ id: 'tomas', name: 'Tomas', aliases: [], kind: 'person', static_description: 'A net mender on the harbor road.', source_refs: [base.sources[0].id] });
  p.relations = rel;
  return JSON.stringify(p);
}
const PROFILE = {
  player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [],
  relationships: [{ name: 'Mira', existing_id: 'mira', relation: 'close friend since childhood', basis: 'persona_stated', they: { calls: 'Ash', sees: 'teases Ash like a brother' }, player: null }],
  knowers: [], uncertain: [],
};
type X = ReturnType<typeof makeEngine>;
async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker. Mira is a childhood friend.' });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(pack(), { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  // the Persona is read with the first reply
  x.host.addUser('I look around the harbor.');
  x.model.draft('The harbor at dawn. [W0]');
  await x.engine.runOperation('normal');
  return x;
}
async function turn(x: X, user: string, draft: string, patch: any = {}) {
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), patch);
  return x.engine.runOperation('normal');
}
const st = (x: X) => x.engine.current!.replay.state;
const ctx = (x: X) => String(x.model.tasks('draft').at(-1)!.input.engineContext);
const section = (c: string, head: string) => c.split('\n\n').find((s) => s.startsWith(head)) || '';
const played = (x: X) => playedProfile(x.engine.current!.index, x.engine.playerProfile()!.profile);
const me = (x: X) => x.engine.playerProfile()!.profile.playerId;

describe('relations between people, the player character like anyone', () => {
  it('RL1 the pack: the stage in force follows the events this branch has reached; the GM sees the pairs in the scene', async () => {
    const x = await setup();
    const idx = () => x.engine.current!.index;
    expect(idx().relationNow('tomas', 'mira')).toMatchObject({ bond: 'neighbours on the harbor road', source: 'pack', since: null });
    expect(await turn(x, 'I walk the harbor road with Mira and Tomas.', 'The three of you walk. [R1a]', { scene_end: at(1, 6, 30), scene_entities: ['mira', 'tomas'] })).toBe(true);
    await turn(x, 'We keep walking.', 'Gulls. [R1b]', { scene_end: at(1, 6, 40), scene_entities: ['mira', 'tomas'] });
    let rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: neighbours on the harbor road \| Tomas → Mira: calls them "the medic"; keeps a polite distance/);
    // the player's relation is one of them, read the same way (the Persona's start)
    expect(rel).toMatch(new RegExp(`Ash \\[${me(x).replace(/\./g, '\\.')}\\] ↔ Mira \\[mira\\]: close friend since childhood \\(from the Persona\\) \\| Mira → Ash: calls them "Ash"; teases Ash like a brother`));
    expect(rel).toMatch(/never decide the player character's feelings/);
    // the ambush happens: the next stage holds from then on
    const ambush = { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Ambush on the road', 'Tomas drags Mira into his shed', { pack_event_id: 'medic-ambush', disposition: 'occurred', actors: ['mira', 'tomas'] })], scene_entities: ['mira', 'tomas'] };
    expect(await turn(x, 'I wait.', 'At 10:00 bolts fly; Tomas drags Mira into his shed. [R1c]', ambush)).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('occurred');
    expect(idx().relationNow('mira', 'tomas')).toMatchObject({ bond: 'close friends since the ambush', source: 'pack' });
    await turn(x, 'I look in on them.', 'The shed. [R1d]', { scene_end: at(1, 10, 40), scene_entities: ['mira', 'tomas'] });
    rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: close friends since the ambush \| Mira → Tomas: calls them "Tomas"; trusts him[^|]*\| Tomas → Mira: calls them "Mira"; looks out for her \| together: easy silences/);
  });

  it('RL2 before a first stage holds they do not know each other; a pack lint rejects bad relations', async () => {
    const late = { ...RELATION, stages: [RELATION.stages[1]] };
    const x = makeEngine();
    await x.engine.bind(pack([late]), { startTick: tick(1, 6, 0), mode: 'new' });
    await x.engine.reconcile('test');
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toBeNull();
    const bad = JSON.parse(pack([
      { ...RELATION, stages: [{ ...RELATION.stages[0], views: [{ who: 'harbor', sees: 'x' }] }, { ...RELATION.stages[1], from_event: null }] },
      { people: ['tomas', 'mira'], source_refs: [], stages: [{ from_event: 'nope', bond: 'b', views: [] }] },
    ]));
    expect(validatePackText(JSON.stringify(bad)).ok).toBe(false);
    const errs = lintPack(bad).errors.map((e) => e.message).join('\n');
    expect(errs).toMatch(/a view of someone not in this pair \(harbor\)/);
    expect(errs).toMatch(/only the first stage can hold from the story start/);
    expect(errs).toMatch(/a second relation for tomas and mira/);
    expect(errs).toMatch(/unknown event "nope"/);
  });

  it('RL3 play changes a relation between two of the pack\'s people, and one of the player\'s; the GM sees how it stands now', async () => {
    const x = await setup();
    await turn(x, 'I tell Mira that Tomas sold her out.', 'Mira slaps Tomas and walks off; she will not speak to him again. Mira turns away from you too; the friendship is over for now. [R3a]', {
      scene_end: at(1, 7, 0), scene_entities: ['mira', 'tomas'],
      relations: [
        { people: ['mira', 'tomas'], bond: 'estranged neighbours', views: [{ who: 'mira', sees: 'refuses to speak to him' }], quote: 'she will not speak to him again' },
        { people: ['mira', me(x)], bond: 'estranged friend after a quarrel', views: [{ who: 'mira', sees: 'avoids Ash' }], quote: 'the friendship is over for now' },
      ],
    });
    expect(st(x).relations.filter((r) => r.source === 'play')).toHaveLength(2);
    await turn(x, 'I follow them.', 'The piers. [R3b]', { scene_end: at(1, 7, 10), scene_entities: ['mira', 'tomas'] });
    const rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: estranged neighbours \(as it stands since [^;]+ in play; in the original story before that: neighbours on the harbor road\) \| Mira → Tomas: refuses to speak to him/);
    expect(rel).toMatch(/Mira \[mira\] ↔ Ash \[[^\]]+\]: estranged friend after a quarrel \(as it stands since/);
    // PLAYER IN THIS WORLD has the player's connections, with the Persona's start
    expect(ctx(x)).toMatch(/connection: Mira \[mira\] — estranged friend after a quarrel \(as it stands since [^;]+ in play; Persona at the start: close friend since childhood\)/);
    const r = x.engine.integrationView(true)!.profile!.relationships[0];
    expect(r).toMatchObject({ name: 'Mira', text: 'estranged friend after a quarrel', basis: 'persona_stated', start: 'close friend since childhood', quote: 'the friendship is over for now' });
    expect(PROMPTS.evaluate).toMatch(/relations: how this reply[^\n]*the player character \(player_entity\) and anyone else alike/);
    // a stage of the pack that starts later than the change wins again (the story reached it)
    const ambush = { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Ambush on the road', 'Tomas drags Mira into his shed', { pack_event_id: 'medic-ambush', disposition: 'occurred', actors: ['mira', 'tomas'] })] };
    await turn(x, 'I wait.', 'At 10:00 bolts fly; Tomas drags Mira into his shed. [R3c]', ambush);
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({ bond: 'close friends since the ambush', source: 'pack' });
  });

  it('RL4 someone learns the player\'s secret: they are a knower from then on (recognition too); knowing only grows', async () => {
    const x = await setup();
    await turn(x, 'I show Mira the smuggling ledger.', 'Mira reads the ledger and understands what you really do at night. [T3]', { player_knowers: [{ who: 'Mira', existing_id: 'mira', level: 'secrets', about: 'Ash smuggles for the night boats', quote: 'understands what you really do at night' }] });
    await turn(x, 'I go home.', 'Home. [T4]');
    expect(ctx(x)).toMatch(/who knows: Mira knows: Ash smuggles for the night boats \(from play, since/);
    expect(recognitionGroups(x.engine.current!.index, x.engine.playerProfile()!.profile).find((g) => g.personId === 'mira')).toMatchObject({ level: 'secrets' });
    await turn(x, 'I meet Mira.', 'Mira nods; she knows who you are. [T5]', { player_knowers: [{ who: 'Mira', existing_id: 'mira', level: 'identity', about: 'Ash smuggles for the night boats', quote: 'she knows who you are' }] });
    expect(played(x).knowers.find((k) => k.entityId === 'mira')!.level).toBe('secrets');
  });

  it('RL5 a death ends a relation; someone met in play who matters becomes a person of the chat with a relation', async () => {
    const x = await setup();
    await turn(x, 'I hold Mira as the fever takes her.', 'Mira dies before dawn. Old Ned, the lamp keeper, stays with you and promises to help. [T6]', {
      relations: [
        { people: [me(x), 'mira'], bond: 'childhood friend, died of the fever', ended: true, quote: 'Mira dies before dawn' },
        { people: [me(x), 'Old Ned'], bond: 'lamp keeper who promised to help', views: [{ who: 'Old Ned', sees: 'feels he owes Ash' }], quote: 'stays with you and promises to help' },
      ],
    });
    const ned = [...st(x).runtimeEntities.values()].find((e) => e.name === 'Old Ned');
    expect(ned).toMatchObject({ kind: 'person' });
    expect(x.engine.current!.index.relationNow(me(x), ned!.id)).toMatchObject({ bond: 'lamp keeper who promised to help', views: [{ who: ned!.id, sees: 'feels he owes Ash' }] });
    await turn(x, 'I sit by the water.', 'The water. [T7]');
    expect(ctx(x)).toMatch(/connection: Mira \[mira\] — ENDED: childhood friend, died of the fever/);
    expect(ctx(x)).toMatch(/connection: Old Ned \[rt\.person\.[^\]]+\] — lamp keeper who promised to help \(from play, since/);
  });

  it('RL6 without its quote nothing is recorded; a quote from the player\'s own message counts; not two people: nothing', async () => {
    const x = await setup();
    await turn(x, 'I hug Mira.', 'A quiet morning. [T8]', { relations: [{ people: [me(x), 'mira'], bond: 'lovers', quote: 'they kiss under the lantern' }, { people: ['mira', 'harbor'], bond: 'loves it', quote: 'A quiet morning' }] });
    expect(st(x).relations.filter((r) => r.source === 'play')).toHaveLength(0);
    await turn(x, 'I ask Mira to be my girlfriend and she says yes.', 'Mira laughs. [T9]', { relations: [{ people: ['mira', me(x)], bond: 'girlfriend', quote: 'she says yes' }] });
    expect(played(x).relationships[0].relation).toBe('girlfriend');
  });

  it('RL7 the user changes, adds and removes the player\'s relations and knowers in the panel; deleting the message that made a change takes it back', async () => {
    const x = await setup();
    await turn(x, 'I quarrel with Mira.', 'Mira storms off. [U1]', { relations: [{ people: [me(x), 'mira'], bond: 'angry with Ash', quote: 'Mira storms off' }] });
    await turn(x, 'I mend nets.', 'Nets. [U2]');
    expect(played(x).relationships[0].relation).toBe('angry with Ash');
    x.host.remove(3); x.host.remove(3); // the quarrel and its reply (0: the greeting, 1–2: the first turn)
    x.engine.sourceChanged('delete');
    await x.engine.reconcile('delete');
    expect(played(x).relationships[0].relation).toBe('close friend since childhood');
    await x.engine.editTie('relation', 'mira', 'Mira', { relation: 'sister in all but blood' });
    await x.engine.editTie('relation', null, 'Old Tomas', { relation: 'net mender who keeps my secrets' });
    await x.engine.editTie('knows', null, 'The harbor watch', { level: 'identity', about: 'Ash is the one who found the body' });
    let p = played(x);
    expect(p.relationships.find((r) => r.entityId === 'mira')).toMatchObject({ relation: 'sister in all but blood', changed: expect.objectContaining({ by: 'ui', start: 'close friend since childhood' }) });
    expect(p.relationships.find((r) => r.name === 'Old Tomas')).toMatchObject({ relation: 'net mender who keeps my secrets', basis: 'ui' });
    expect(p.knowers).toEqual([expect.objectContaining({ who: 'The harbor watch', level: 'identity', basis: 'ui' })]);
    await x.engine.editTie('knows', null, 'The harbor watch', { level: 'exists', about: 'only that someone found a body' });
    expect(played(x).knowers[0].level).toBe('exists');
    await x.engine.editTie('relation', 'mira', 'Mira', null);
    p = played(x);
    expect(p.relationships.map((r) => r.name)).toEqual(['Old Tomas']);
    await turn(x, 'I look around.', 'Around. [U3]');
    expect(ctx(x)).not.toMatch(/connection: Mira/);
  });

  it('RL9 the analysis naming the player character by name gives the player\'s relation, never a second person of that name', async () => {
    const x = await setup();
    await turn(x, 'I make up with Mira.', 'Mira hugs you; friends again. [N1]', { relations: [{ people: ['Ash', 'Mira'], bond: 'friends again', quote: 'friends again' }] });
    expect([...st(x).runtimeEntities.values()].filter((e) => e.name === 'Ash').map((e) => e.id)).toEqual([me(x)]);
    expect(x.engine.current!.index.relationNow(me(x), 'mira')).toMatchObject({ bond: 'friends again', source: 'play' });
  });

  it('RL8 a Persona revision without a relation takes it out', async () => {
    const x = await setup();
    expect(played(x).relationships.map((r) => r.name)).toEqual(['Mira']);
    x.model.on('profile', null, { ...PROFILE, relationships: [] }, true);
    (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker who keeps to himself.' });
    await x.engine.updateIdentity();
    expect(x.engine.playerProfile()!.profile.relationships).toEqual([]);
    expect(played(x).relationships).toEqual([]);
    expect(x.engine.current!.index.relationNow(me(x), 'mira')).toBeNull();
  });
});
