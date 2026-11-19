// TI: relations between people and who knows what about the player. A relation is between any two people — the
// player character like the pack's characters (user, 2026-11-15: the Persona is a person of the world like the
// original's characters). A relation is a state of the game (user, 2026-11-16): it starts as the original story has
// it (the pack's stages, as far as the branch follows them), the Persona gives the player's start, and every change —
// the review of an accepted reply (with the quote), an event of the original story worked out for a pair that no
// longer follows it, the user in the panel — is merged into it part by part. The GM sees one whole line a pair.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT, ordinary } from './helpers';
import { playedProfile, recognitionGroups } from '../../src/core/runtime/integration';
import { PROMPTS } from '../../src/core/runtime/prompts';
import { lintPack, validatePackText } from '../../src/core/domain/pack';
import { ADDRESS_USES, cleanAddress, mergeAddress, settleAddress } from '../../src/core/domain/address';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
// a second person of the pack, and how she and Mira stand: neighbours from the start, close after the ambush
const RELATION = {
  people: ['mira', 'tomas'], source_refs: [base.sources[0].id],
  stages: [
    { from_event: null, bond: 'neighbours on the harbor road', views: [{ who: 'tomas', address: [{ term: 'the medic', use: 'usually' }], sees: 'keeps a polite distance from her' }] },
    { from_event: 'medic-ambush', why: 'he hid her after the ambush', bond: 'close friends since the ambush', views: [{ who: 'mira', address: [{ term: 'Tom', use: 'usually' }], sees: 'trusts him with her life' }, { who: 'tomas', address: [{ term: 'Mira-girl', use: 'sometimes', when: 'when he fusses over her' }], sees: 'looks out for her' }], together: 'easy silences; he fusses over her wounds' },
  ],
};
function pack(rel: unknown[] = [RELATION]) {
  const p = structuredClone(base);
  p.entities.push({ id: 'tomas', name: 'Tomas', aliases: [], kind: 'person', static_description: 'A net mender on the harbor road.', source_refs: [base.sources[0].id] }); ordinary(p);
  // Tomas hides Mira in the ambush: he is in that event (a stage starts only at an event both are in)
  p.events.find((e: any) => e.id === 'medic-ambush').entity_ids.push('tomas');
  p.relations = rel;
  return JSON.stringify(p);
}
const PROFILE = {
  player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [],
  relationships: [{ name: 'Mira', existing_id: 'mira', relation: 'close friend since childhood', basis: 'persona_stated', they: { address: [{ term: 'Ashy', use: 'always', when: '' }], sees: 'teases Ash like a brother' }, player: null }],
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
const forms = (x: X) => section(ctx(x), 'FORMS OF ADDRESS');
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
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: neighbours on the harbor road \| Tomas → Mira: keeps a polite distance/);
    // the player's relation is one of them, read the same way (the Persona's start)
    expect(rel).toMatch(new RegExp(`Ash \\[${me(x).replace(/\./g, '\\.')}\\] ↔ Mira \\[mira\\]: close friend since childhood \\(from the Persona\\) \\| Mira → Ash: teases Ash like a brother`));
    expect(rel).toMatch(/never decide the player character's feelings/);
    // the forms of address apart, each with how often and when (user: the GM often gets them wrong)
    expect(forms(x)).toMatch(/^FORMS OF ADDRESS \(how one person here addresses or refers to another where it is not simply by name;[^\n]*always — the only form/);
    expect(forms(x)).toContain('- Tomas → Mira: 「the medic」 (usually)');
    expect(forms(x)).toContain('- Mira → Ash: 「Ashy」 (always)');
    // the ambush happens: the next stage holds from then on
    const ambush = { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Ambush on the road', 'Tomas drags Mira into his shed', { pack_event_id: 'medic-ambush', disposition: 'occurred', actors: ['mira', 'tomas'] })], scene_entities: ['mira', 'tomas'] };
    expect(await turn(x, 'I wait.', 'At 10:00 bolts fly; Tomas drags Mira into his shed. [R1c]', ambush)).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('occurred');
    expect(idx().relationNow('mira', 'tomas')).toMatchObject({ bond: 'close friends since the ambush', source: 'pack' });
    await turn(x, 'I look in on them.', 'The shed. [R1d]', { scene_end: at(1, 10, 40), scene_entities: ['mira', 'tomas'] });
    rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: close friends since the ambush \| Mira → Tomas: trusts him[^|]*\| Tomas → Mira: looks out for her \| together: easy silences/);
    expect(forms(x)).toContain('- Mira → Tomas: 「Tom」 (usually)');
    expect(forms(x)).toContain('- Tomas → Mira: 「Mira-girl」 (sometimes: when he fusses over her)');
    expect(forms(x)).not.toMatch(/the medic/);
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
    // a stage starts at an event both are in (user: a relation must not change without an event the game can change)
    const orphan = JSON.parse(pack());
    orphan.events.find((e: any) => e.id === 'medic-ambush').entity_ids = ['mira', 'council'];
    expect(lintPack(orphan).errors.map((e) => e.message).join('\n')).toMatch(/"medic-ambush" is not an event of tomas: a stage starts at an event both are in/);
  });

  it('RL3 play changes a relation between two of the pack\'s people, and one of the player\'s; the GM sees how it stands now', async () => {
    const x = await setup();
    await turn(x, 'I tell Mira that Tomas sold her out.', 'Mira slaps Tomas and walks off; she will not speak to him again. Tomas mutters about "that woman", the "old girl". Mira turns away from you too; the friendship is over for now. [R3a]', {
      scene_end: at(1, 7, 0), scene_entities: ['mira', 'tomas'],
      relations: [
        { people: ['mira', 'tomas'], bond: 'estranged neighbours', views: [{ who: 'mira', sees: 'refuses to speak to him' }, { who: 'tomas', sees: 'pretends not to care' }], address: [{ by: 'tomas', to: 'mira', term: '「that woman」、“old girl”', use: 'usually', quote: 'Tomas mutters about "that woman", the "old girl"' }, { by: 'tomas', to: 'mira', term: 'the medic', use: 'dropped', quote: 'Tomas mutters about "that woman"' }], quote: 'she will not speak to him again' },
        { people: ['mira', me(x)], bond: 'estranged friend after a quarrel', views: [{ who: 'mira', sees: 'avoids Ash' }], quote: 'the friendship is over for now' },
      ],
    });
    expect(st(x).relations.filter((r) => r.source === 'play')).toHaveLength(2);
    // the forms themselves, one a term (live: the model wrote 「「姐姐」」 — the brackets the section adds itself)
    expect(st(x).relations.find((r) => r.source === 'play' && r.people.includes('tomas'))!.views.find((v) => v.who === 'tomas')!.address).toEqual([{ term: 'that woman', use: 'usually' }, { term: 'old girl', use: 'usually' }, { term: 'the medic', use: 'dropped' }]);
    await turn(x, 'I follow them.', 'The piers. [R3b]', { scene_end: at(1, 7, 10), scene_entities: ['mira', 'tomas'] });
    const rel = section(ctx(x), 'RELATIONSHIPS');
    // one whole line: the change merged into the relation it changed, no line of the original story beside it
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: estranged neighbours \(changed in this game, [^)]+\) \| Tomas → Mira: pretends not to care \| Mira → Tomas: refuses to speak to him/);
    expect(rel).not.toMatch(/original story|neighbours on the harbor road/);
    expect(rel).toMatch(/Mira \[mira\] ↔ Ash \[[^\]]+\]: estranged friend after a quarrel \(changed in this game, [^)]+\) \| Mira → Ash: avoids Ash/);
    // forms merged form by form: the dropped one gone, the others of the side and the other side's as they were
    expect(forms(x)).toContain('- Tomas → Mira: 「that woman」 (usually); 「old girl」 (usually)');
    expect(forms(x)).toContain('- Mira → Ash: 「Ashy」 (always)');
    expect(forms(x)).not.toMatch(/the medic/);
    // PLAYER IN THIS WORLD has the player's connections, with the Persona's start
    expect(ctx(x)).toMatch(/connection: Mira \[mira\] — estranged friend after a quarrel \(as it stands since [^;]+ in play; Persona at the start: close friend since childhood\)/);
    const r = x.engine.integrationView(true)!.profile!.relationships[0];
    expect(r).toMatchObject({ name: 'Mira', text: 'estranged friend after a quarrel', basis: 'persona_stated', start: 'close friend since childhood', quote: 'the friendship is over for now' });
    expect(PROMPTS.evaluate).toMatch(/relations: how this reply[^\n]*the player character \(player_entity\) and anyone else alike/);
    // the original story's next stage does not overwrite what this game did to the pair: the event happens, and what
    // it changes (the stage's why) is worked out for the relation the game has
    const ambush = { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Ambush on the road', 'Tomas drags Mira into his shed', { pack_event_id: 'medic-ambush', disposition: 'occurred', actors: ['mira', 'tomas'], account: 'Tomas drags Mira into his shed' })] };
    x.model.on('relate', null, { pairs: [{ n: 1, changed: true, bond: 'estranged neighbours; she owes him her life', views: [{ who: 'mira', sees: 'grateful, still cold to him' }] }] });
    await turn(x, 'I wait.', 'At 10:00 bolts fly; Tomas drags Mira into his shed. [R3c]', ambush);
    const asked = x.model.tasks('relate').at(-1)!.input;
    expect(asked.pairs).toEqual([expect.objectContaining({ event: 'medic-ambush', change: 'he hid her after the ambush', now: expect.objectContaining({ bond: 'estranged neighbours' }) })]);
    // how the original story's forms of address change there, worked out by the code from its two stages
    expect(asked.pairs[0].address_change).toEqual([
      { who: 'mira', name: 'Mira', address: [{ term: 'Tom', use: 'usually' }] },
      { who: 'tomas', name: 'Tomas', address: [{ term: 'Mira-girl', use: 'sometimes', when: 'when he fusses over her' }, { term: 'the medic', use: 'dropped' }] },
    ]);
    expect(asked.events[0]).toMatchObject({ id: 'medic-ambush', actual: expect.stringMatching(/^as in the original story: Tomas drags Mira/) });
    expect(JSON.stringify(asked)).not.toMatch(/close friends since the ambush/);
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({
      bond: 'estranged neighbours; she owes him her life', source: 'event',
      views: [{ who: 'tomas', address: [{ term: 'that woman', use: 'usually' }, { term: 'old girl', use: 'usually' }], sees: 'pretends not to care' }, { who: 'mira', sees: 'grateful, still cold to him' }],
    });
  });

  it('RL13 a change gives only what changes: the rest of the relation stays (the other side, the forms of address, together)', async () => {
    const x = await setup();
    const ambush = { scene_end: at(1, 10, 30), scene_entities: ['mira', 'tomas'], occurrences: [occ('o1', 'Ambush on the road', 'Tomas drags Mira into his shed', { pack_event_id: 'medic-ambush', disposition: 'occurred', actors: ['mira', 'tomas'] })] };
    await turn(x, 'I wait.', 'At 10:00 bolts fly; Tomas drags Mira into his shed. [M1]', ambush);
    // the pair followed the original story: its stage simply holds, nothing to work out
    expect(x.model.tasks('relate')).toHaveLength(0);
    await turn(x, 'I watch them.', 'Mira snaps at Tomas for fussing; she calls him "mother hen" now. [M2]', {
      scene_end: at(1, 10, 40), scene_entities: ['mira', 'tomas'],
      relations: [{ people: ['mira', 'tomas'], bond: 'close friends who bicker', address: [{ by: 'mira', to: 'tomas', term: 'mother hen', use: 'sometimes', when: 'when he fusses', quote: 'she calls him "mother hen" now' }], quote: 'she calls him "mother hen" now' }],
    });
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({
      bond: 'close friends who bicker', source: 'play', together: 'easy silences; he fusses over her wounds',
      views: [{ who: 'mira', address: [{ term: 'Tom', use: 'usually' }, { term: 'mother hen', use: 'sometimes', when: 'when he fusses' }], sees: 'trusts him with her life' }, { who: 'tomas', address: [{ term: 'Mira-girl', use: 'sometimes' }], sees: 'looks out for her' }],
    });
    // a form now used always is the only one left
    await turn(x, 'I watch them more.', 'From now on it is only "mother hen". [M3]', {
      scene_end: at(1, 10, 50), scene_entities: ['mira', 'tomas'],
      relations: [{ people: ['mira', 'tomas'], bond: 'close friends who bicker', address: [{ by: 'mira', to: 'tomas', term: 'mother hen', use: 'always', quote: 'From now on it is only "mother hen"' }], quote: 'From now on it is only "mother hen"' }],
    });
    expect(x.engine.current!.index.relationNow('mira', 'tomas')!.views.find((v) => v.who === 'mira')!.address).toEqual([{ term: 'mother hen', use: 'always' }]);
    expect(PROMPTS.evaluate).toMatch(/a part you leave out stays as it is — so give anew every part this change makes untrue/);
    // a change of the relation changes the forms of address with it where they no longer fit (user: "称呼也应该会随着改")
    expect(PROMPTS.evaluate).toMatch(/each form of address that no longer fits — a pet name dropped/);
    expect(PROMPTS.relate).toMatch(/give anew every part the change makes untrue, the forms of address included/);
  });

  it('RL14 an event that goes otherwise: the original stage does not come; what it does to the pair is worked out (here: nothing)', async () => {
    const x = await setup();
    x.model.on('relate', null, { pairs: [{ n: 1, changed: false }] });
    const ambush = { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Ambush on the road', 'Mira escapes alone; Tomas never sees it', { pack_event_id: 'medic-ambush', disposition: 'diverged', actors: ['mira'], account: 'Mira escapes alone; Tomas never sees it' })] };
    await turn(x, 'I pull Mira away before the bolts.', 'Mira escapes alone; Tomas never sees it. [D1]', ambush);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    expect(x.model.tasks('relate').at(-1)!.input.events[0].actual).toMatch(/^otherwise: Mira escapes alone/);
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({ bond: 'neighbours on the harbor road', source: 'pack' });
    // the stage of that event is no longer to come (not even with spoilers)
    expect(x.engine.relationsView(true)!.rows.filter((r) => r.state === 'later')).toEqual([]);
  });

  it('RL15 a result given by hand carries what it does to a changed pair, and undoing it takes that back', async () => {
    const x = await setup();
    await turn(x, 'I tell Mira that Tomas sold her out.', 'Mira will not speak to Tomas again. [H1]', {
      scene_end: at(1, 7, 0), scene_entities: ['mira', 'tomas'],
      relations: [{ people: ['mira', 'tomas'], bond: 'estranged neighbours', views: [{ who: 'mira', sees: 'refuses to speak to him' }], quote: 'Mira will not speak to Tomas again' }],
    });
    x.model.on('relate', null, { pairs: [{ n: 1, changed: true, bond: 'estranged, but he saved her', views: [] }] });
    await x.engine.forceComplete('medic-ambush');
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({ bond: 'estranged, but he saved her', source: 'event', views: [{ who: 'tomas', address: [{ term: 'the medic', use: 'usually' }] }, { who: 'mira', sees: 'refuses to speak to him' }] });
    await x.engine.undoForce('medic-ambush');
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({ bond: 'estranged neighbours', source: 'play' });
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
    // the panel gives the whole relation: each side (how they see and address the other) and how they are together
    await x.engine.editTie('relation', 'mira', 'Mira', {
      relation: 'sister in all but blood', together: "finish each other's sentences",
      they: { address: [{ term: 'little brother', use: 'usually' }, { term: 'Ashy', use: 'sometimes', when: 'when teasing' }], sees: 'would go to the wall for Ash' },
      me: { address: [{ term: 'Mimi', use: 'always' }], sees: 'protective of her' },
    });
    expect(x.engine.current!.index.relationNow(me(x), 'mira')).toEqual(expect.objectContaining({
      bond: 'sister in all but blood', source: 'ui', together: "finish each other's sentences",
      views: [{ who: 'mira', address: [{ term: 'little brother', use: 'usually' }, { term: 'Ashy', use: 'sometimes', when: 'when teasing' }], sees: 'would go to the wall for Ash' }, { who: me(x), address: [{ term: 'Mimi', use: 'always' }], sees: 'protective of her' }],
    }));
    expect(x.engine.integrationView(true)!.profile!.relationships[0]).toMatchObject({ person: true, together: "finish each other's sentences", they: { sees: 'would go to the wall for Ash' }, me: { address: [{ term: 'Mimi', use: 'always' }] } });
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

  it('RL10 two people the player\'s message names, not yet in the scene, get their pair too (live: 美琴 and 白井 on the first turn)', async () => {
    const x = await setup();
    await turn(x, 'At the café I see Mira and Tomas arguing over cake.', 'They argue. [N2]', { scene_end: at(1, 6, 30) });
    const rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]: neighbours on the harbor road/);
  });

  it('RL11 the people with the player are the last reply\'s present, not everyone it mentioned', async () => {
    const x = await setup();
    await turn(x, 'I meet Mira at the pier.', 'Mira waves; she says Tomas is mending nets far up the road. [N3]', { scene_end: at(1, 6, 30), scene_entities: ['mira', 'tomas'], present: ['mira'] });
    await turn(x, 'I ask how she is.', 'Fine, she says; Tomas is still up the road. [N4]', { scene_end: at(1, 6, 40), scene_entities: ['mira', 'tomas'], present: ['mira'] });
    const rel = section(ctx(x), 'RELATIONSHIPS');
    expect(rel).toMatch(/Mira \[mira\] ↔ Ash|Ash \[[^\]]+\] ↔ Mira/);
    expect(rel).not.toMatch(/Tomas/);
    expect(PROMPTS.evaluate).toMatch(/present: the people physically with the player character where the reply ends/);
    // live: someone who left at the end of a reply and whom the next message names again is paired again
    await turn(x, 'I follow Tomas up the road to his nets.', 'Tomas looks up from the nets. [N5]', { scene_end: at(1, 7, 0) });
    const rel2 = section(ctx(x), 'RELATIONSHIPS');
    expect(rel2).toMatch(/Mira \[mira\] ↔ Tomas \[tomas\]|Tomas \[tomas\] ↔ Mira \[mira\]/);
  });

  it('RL12 the timeline window lists the relations as table rows: in force now, and the stages to come only with spoilers', async () => {
    const x = await setup();
    const v = x.engine.relationsView(false)!;
    expect(v.rows.map((r) => [r.a, r.b, r.state, r.bond])).toEqual([
      ['Ash', 'Mira', 'now', 'close friend since childhood'],
      ['Mira', 'Tomas', 'now', 'neighbours on the harbor road'],
    ]);
    expect(v.rows[0]).toMatchObject({ player: true, source: 'persona', ba: { address: [{ term: 'Ashy', use: 'always' }], sees: 'teases Ash like a brother' } });
    expect(v.rows[1]).toMatchObject({ when: null, source: 'pack', ba: { address: [{ term: 'the medic', use: 'usually' }], sees: 'keeps a polite distance from her' } });
    expect(v.hidden).toBe(1);
    const s = x.engine.relationsView(true)!;
    expect(s.rows.find((r) => r.state === 'later')).toMatchObject({ a: 'Mira', b: 'Tomas', bond: 'close friends since the ambush', together: 'easy silences; he fusses over her wounds' });
    // the 常态 view no longer carries relations
    expect(JSON.stringify(x.engine.natureView(true))).not.toMatch(/close friend since childhood/);
  });

  it('RL16 someone the player keeps with them through an event\'s time is not at it: the event does not go as in the original story', async () => {
    // live: the player kept 美琴 the whole afternoon; the reply recorded no beat of it, and 美琴与食蜂同车前往会场 was
    // settled offscreen as in the original story — with 美琴–食蜂 switched to the stage it starts
    const x = await setup();
    await turn(x, 'I find Mira at dawn.', 'Mira joins you on the pier. [K1]', { scene_end: at(1, 6, 30), scene_entities: ['mira'], present: ['mira'] });
    x.model.on('adjudicate', (i: any) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'omitted', time: null, account: '', actors: [], causes: [], effects: [], plan_step_ids: [], reason: 'Mira was with Ash all morning, nowhere near the road.' }] });
    await turn(x, 'I keep Mira with me all morning, mending nets on the pier.', 'You and Mira mend nets until noon. [K2]', { scene_end: at(1, 12, 0), scene_entities: ['mira'], present: ['mira'] });
    const asked = x.model.tasks('adjudicate').find((c) => c.input.candidate?.id === 'medic-ambush')!.input;
    expect(asked.recent_actual_play_with_these_characters[0]).toMatch(/^Mira stayed with the player character the whole time from D1 06:30 to D1 12:00/);
    // the omission stands (no beat had to rule it out), and the pair stays as it was
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('omitted');
    expect(x.engine.current!.index.relationNow('mira', 'tomas')).toMatchObject({ bond: 'neighbours on the harbor road', source: 'pack' });
  });

  it('RL17 forms of address: written as a model writes them, kept consistent, merged form by form; a pack lint checks them', () => {
    expect(cleanAddress([{ term: '「「姐姐」」、“老姐”', use: 'usually' }, { term: '“首领”或“支仓同学”', use: 'sometimes', when: '  in front of others ' }, { term: 'x', use: 'never' }, { term: ' ', use: 'always' }], ADDRESS_USES))
      .toEqual([{ term: '姐姐', use: 'usually' }, { term: '老姐', use: 'usually' }, { term: '首领', use: 'sometimes', when: 'in front of others' }, { term: '支仓同学', use: 'sometimes', when: 'in front of others' }]);
    // always is the only form: beside others it is the usual one; a new always leaves only itself
    expect(settleAddress([{ term: 'A', use: 'always' }, { term: 'B', use: 'sometimes', when: 'w' }])).toEqual([{ term: 'A', use: 'usually' }, { term: 'B', use: 'sometimes', when: 'w' }]);
    expect(mergeAddress([{ term: 'A', use: 'always' }], [{ term: 'B', use: 'sometimes', when: 'w' }])).toEqual([{ term: 'A', use: 'usually' }, { term: 'B', use: 'sometimes', when: 'w' }]);
    expect(mergeAddress([{ term: 'A', use: 'usually' }, { term: 'B', use: 'usually' }], [{ term: 'C', use: 'always' }])).toEqual([{ term: 'C', use: 'always' }]);
    expect(mergeAddress([{ term: 'A', use: 'usually' }, { term: 'B', use: 'usually' }], [{ term: 'a', use: 'sometimes', when: 'w' }, { term: 'B', use: 'dropped' }])).toEqual([{ term: 'a', use: 'sometimes', when: 'w' }]);
    const bad = JSON.parse(pack([{ ...RELATION, stages: [{ ...RELATION.stages[0], views: [{ who: 'tomas', sees: 'x', address: [{ term: 'Mira', use: 'usually' }, { term: '「doc」', use: 'sometimes' }, { term: 'mira', use: 'always' }] }] }] }]));
    const res = lintPack(bad);
    expect(res.errors.map((e) => e.message).join('\n')).toMatch(/the same term twice[\s\S]*"always" is the only form a side uses/);
    expect(res.warnings.map((e) => e.message).join('\n')).toMatch(/"Mira" is the other's full name[\s\S]*"「doc」": the term alone[\s\S]*a form used sometimes says when/);
    expect(PROMPTS.evaluate).toMatch(/Form of address \(code "wrong_address", blocking\)/);
  });

  it('RL18 the player character\'s forms of address come from the player\'s own words, never from the reply', async () => {
    // user: the GM once had the player call 美琴 姐姐大人 (黑子's form) — that must not become how the player addresses her
    const x = await setup();
    (x.engine.settings as any).debug = true;   // (the review's warnings in the trace)
    await turn(x, 'I walk Mira home.', '"Thanks, Big Sis," Ash says to Mira. "Anytime, kiddo." [P1]', {
      scene_end: at(1, 6, 30), scene_entities: ['mira'],
      relations: [{ people: [me(x), 'mira'], bond: 'close friend since childhood', address: [{ by: me(x), to: 'mira', term: 'Big Sis', use: 'usually', quote: 'Thanks, Big Sis' }, { by: 'mira', to: me(x), term: 'kiddo', use: 'sometimes', when: 'when teasing', quote: 'Anytime, kiddo' }], quote: 'Thanks, Big Sis' }],
    });
    let rel = x.engine.current!.index.relationNow(me(x), 'mira')!;
    expect(rel.views.find((v) => v.who === me(x))).toBeUndefined();
    expect(rel.views.find((v) => v.who === 'mira')!.address).toEqual([{ term: 'Ashy', use: 'usually' }, { term: 'kiddo', use: 'sometimes', when: 'when teasing' }]);
    expect(x.engine.lastTrace!.attempts.at(-1)!.warnings!.join('\n')).toMatch(/form of address 「Big Sis」 \(Ash → Mira, usually\) ignored: the player's message does not have it/);
    // the player's own words make it theirs; a nickname taken up with nothing else changing keeps the bond (live: 黑子
    // took up 小光 in a light exchange and the review recorded nothing, a change needing a bond restated)
    await turn(x, 'From now on I call her "Mimi", and she can call me "Ace".', 'Mira laughs. "Fine, Ace." [P2]', {
      scene_end: at(1, 6, 40), scene_entities: ['mira'],
      relations: [{ people: [me(x), 'mira'], bond: '', address: [{ by: me(x), to: 'mira', term: 'Mimi', use: 'usually', quote: 'From now on I call her "Mimi"' }, { by: 'mira', to: me(x), term: 'Ace', use: 'usually', quote: 'Fine, Ace.' }], quote: 'Fine, Ace.' }],
    });
    rel = x.engine.current!.index.relationNow(me(x), 'mira')!;
    expect(rel).toMatchObject({ bond: 'close friend since childhood', source: 'play' });
    expect(rel.views.find((v) => v.who === me(x))!.address).toEqual([{ term: 'Mimi', use: 'usually' }]);
    expect(rel.views.find((v) => v.who === 'mira')!.address).toEqual([{ term: 'Ashy', use: 'usually' }, { term: 'kiddo', use: 'sometimes', when: 'when teasing' }, { term: 'Ace', use: 'usually' }]);
    expect(PROMPTS.evaluate).toMatch(/a form of address taken up or given up \(a nickname offered and then used[^)]*— a change of its own, even in a light exchange/);
    expect(PROMPTS.evaluate).toMatch(/small talk \(a form of address someone takes up is not small talk\)/);
    // live: the bond became 「色鬼同好，刚互定「小黑」「小光」的称呼」 and the player's own 小黑 was left out
    expect(PROMPTS.evaluate).toMatch(/never forms of address — they go in address\./);
    expect(PROMPTS.evaluate).toMatch(/the player calling someone by a new name in their message \("小黑，早！"\) is one/);
    // two with no relation yet still need what they are to each other
    await turn(x, 'I nod to Tomas.', 'Tomas nods back: "Morning, kid." [P3]', {
      scene_end: at(1, 6, 50), scene_entities: ['tomas'],
      relations: [{ people: [me(x), 'tomas'], bond: '', address: [{ by: 'tomas', to: me(x), term: 'kid', use: 'usually', quote: 'Morning, kid.' }], quote: 'Morning, kid.' }],
    });
    expect(x.engine.current!.index.relationNow(me(x), 'tomas')).toBeNull();
    // the GM and the review are told: a form is that person's own, the player's come from the Persona and the player
    expect(forms(x)).toMatch(/a form listed is that person's own, not the others' who know the same one\. The player character's forms are the Persona's and the player's own words/);
    expect(PROMPTS.evaluate).toMatch(/using for someone a distinctive form that FORMS OF ADDRESS gives as another person's for them/);
    expect(PROMPTS.evaluate).toMatch(/never a form that is another person's for that one[^;]*; the player character's forms only when the player's own message gives them/);
  });

  it('RL19 a form of address is the one who uses it: shown by its own words, never also the other way round (live: the player\'s 「电电」 for 美琴 put on 美琴\'s side)', async () => {
    const x = await setup();
    (x.engine.settings as any).debug = true;
    // the player names Mira; the review also gives Mira the same name for the player, from her putting up with it
    await turn(x, 'From today I call you "Sparky", Mira.', 'Mira glares. "Sparky. Fine, for today." [S1]', {
      scene_end: at(1, 6, 30), scene_entities: ['mira'],
      relations: [{ people: [me(x), 'mira'], bond: '', address: [
        { by: me(x), to: 'mira', term: 'Sparky', use: 'usually', quote: 'From today I call you "Sparky"' },
        { by: 'mira', to: me(x), term: 'Sparky', use: 'sometimes', quote: '"Sparky. Fine, for today."' },
      ], quote: 'Fine, for today.' }],
    });
    let rel = x.engine.current!.index.relationNow(me(x), 'mira')!;
    expect(rel.views.find((v) => v.who === me(x))!.address).toEqual([{ term: 'Sparky', use: 'usually' }]);
    expect(rel.views.find((v) => v.who === 'mira')!.address).toEqual([{ term: 'Ashy', use: 'always' }]);
    expect(x.engine.lastTrace!.attempts.at(-1)!.warnings!.join('\n')).toMatch(/「Sparky」 \(Mira → Ash, sometimes\) ignored: 「Sparky」 is Ash's for Mira/);
    // later, the same misread alone: the relation already has it the other way
    await turn(x, 'I wave.', 'Mira sighs. "Sparky, again?" [S2]', {
      scene_end: at(1, 6, 40), scene_entities: ['mira'],
      relations: [{ people: [me(x), 'mira'], bond: '', address: [{ by: 'mira', to: me(x), term: 'Sparky', use: 'usually', quote: '"Sparky, again?"' }], quote: 'Sparky, again?' }],
    });
    rel = x.engine.current!.index.relationNow(me(x), 'mira')!;
    expect(rel.views.find((v) => v.who === 'mira')!.address).toEqual([{ term: 'Ashy', use: 'always' }]);
    // someone else's form needs the reply's words that have it; a side not of the pair is no form
    await turn(x, 'I listen.', 'Tomas grins at Mira. [S3]', {
      scene_end: at(1, 6, 50), scene_entities: ['mira', 'tomas'],
      relations: [{ people: ['mira', 'tomas'], bond: '', address: [
        { by: 'tomas', to: 'mira', term: 'Doc', use: 'usually', quote: 'Tomas grins at Mira' },
        { by: 'tomas', to: 'mira', term: 'Missy', use: 'usually', quote: 'he calls her Missy' },
        { by: 'tomas', to: me(x), term: 'Boss', use: 'usually', quote: 'Tomas grins' },
      ], quote: 'Tomas grins at Mira' }],
    });
    const warn = x.engine.lastTrace!.attempts.at(-1)!.warnings!.join('\n');
    expect(warn).toMatch(/「Doc」 \(Tomas → Mira, usually\) ignored: its quote does not have the term/);
    expect(warn).toMatch(/「Missy」 \(Tomas → Mira, usually\) ignored: its quote is not in the reply/);
    expect(x.engine.current!.index.relationNow('mira', 'tomas')!.views.find((v) => v.who === 'tomas')!.address!.map((a) => a.term)).toEqual(['the medic']);
    // a bond that writes out a form of the change keeps the bond the relation has (live: 「色鬼同好，刚约定互称「小光」与「小黑子」」)
    await turn(x, 'And you can call me "Ace-chan".', 'Mira rolls her eyes. "Fine, Ace-chan." [S4]', {
      scene_end: at(1, 7, 0), scene_entities: ['mira'],
      relations: [{ people: [me(x), 'mira'], bond: 'old friends who just agreed on 「Sparky」 and 「Ace-chan」', address: [{ by: 'mira', to: me(x), term: 'Ace-chan', use: 'sometimes', quote: 'Fine, Ace-chan.' }], quote: 'Fine, Ace-chan.' }],
    });
    rel = x.engine.current!.index.relationNow(me(x), 'mira')!;
    expect(rel.bond).toBe('close friend since childhood');
    expect(rel.views.find((v) => v.who === 'mira')!.address!.map((a) => a.term)).toContain('Ace-chan');
    expect(x.engine.lastTrace!.attempts.at(-1)!.warnings!.join('\n')).toMatch(/bond 「old friends who just agreed on 「Sparky」 and 「Ace-chan」」 not taken: it writes out a form of address/);
    expect(PROMPTS.evaluate).toMatch(/by: the one who uses it, to: the one called so/);
    expect(PROMPTS.evaluate).toMatch(/also where 美琴 puts up with the name, objects to it or repeats it/);
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
