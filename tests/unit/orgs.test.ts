// OR: organizations. An entity set (an organization's members) changes by who joins and who leaves, in the pack and in
// play, so a canon change keeps what play made of it; the Persona puts the player into their organizations (and makes
// them leader when it says so); an event the player's own organization takes part in reaches the player — required,
// wherever they are — unless they turned it down (user decisions 2026-11-08).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at } from './fake';
import { ROOT } from './helpers';
import { validatePackText } from '../../src/domain/pack';
import { factAt } from '../../src/domain/reducer';
import { memberships } from '../../src/runtime/integration';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;

/** The demo pack with members/leader: the Council is Sol (leader) and Ren; on day 4 Ren leaves it and Sol hands it to Ren
 *  (canon), so play's changes must survive both. */
function orgPack(over: (p: any) => void = () => {}) {
  const p = JSON.parse(demo);
  p.predicates.push({ id: 'members', description: 'members of an organization', value_type: 'entity_set' }, { id: 'leader', description: 'leader of an organization', value_type: 'entity_ref' });
  const src = p.entities[0].source_refs;
  p.entities.push(
    { id: 'ren', name: 'Ren', aliases: [], kind: 'person', static_description: 'A council clerk.', source_refs: src },
    { id: 'sol', name: 'Sol', aliases: [], kind: 'person', static_description: 'A council elder.', source_refs: src },
  );
  p.initial_state.facts.push(
    { fact: { entity_id: 'council', predicate: 'members', value: ['sol', 'ren'] }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' },
    { fact: { entity_id: 'council', predicate: 'leader', value: 'sol' }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' },
  );
  const base = p.events.find((e: any) => e.id === 'harbor-festival');
  p.events.push({ ...JSON.parse(JSON.stringify(base)), id: 'council-reshuffle', title: 'Council reshuffle', summary: 'reshuffle', classification: 'SOFT',
    when: { earliest: { day: 3, minute: 600 }, latest: { day: 3, minute: 660 }, precision: 'range', label: 'x', basis: 'documented', notes: '' }, entity_ids: ['council', 'ren', 'sol'], location_ids: [], arc_id: null,
    outcomes: [{ op: 'remove', entity_id: 'council', predicate: 'members', value: ['ren'] }],
    canonical_effects: [{ op: 'remove', entity_id: 'council', predicate: 'members', value: ['ren'] }, { op: 'remove', entity_id: 'council', predicate: 'leader', value: 'sol' }, { op: 'add', entity_id: 'council', predicate: 'leader', value: 'ren' }] });
  over(p);
  return JSON.stringify(p);
}
const PROFILE = (affiliations: any[], relationships: any[] = []) => ({
  player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: '' }, affiliations, places: [], capabilities: [], resources: [], goals: [], relationships, knowers: [], uncertain: [],
});
async function setup(pack: string, profile: any, start = tick(1, 9, 30)) {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash.' });
  x.model.on('profile', null, profile);
  await x.engine.bind(pack, { startTick: start, mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: X, user: string, ...drafts: string[]) {
  x.host.addUser(user);
  x.model.draft(...drafts);
  return x.engine.runOperation('normal');
}
const st = (x: X) => x.engine.current!.replay.state;
const player = (x: X) => x.engine.playerProfile()!.profile.playerId;
const ctx = (x: X, i = -1) => String(x.model.tasks('draft').slice(i)[0].input.engineContext);

describe('who joins and who leaves', () => {
  it('OR1 an event writes an entity set only by who joins and leaves; outcomes say the same; a whole list is an error', () => {
    expect(validatePackText(orgPack()).ok).toBe(true);
    const whole = validatePackText(orgPack((p) => { p.events.at(-1).canonical_effects[0] = { op: 'set', fact: { entity_id: 'council', predicate: 'members', value: ['sol'] } }; p.events.at(-1).outcomes = []; }));
    expect(whole.errors.map((e) => e.message).join('\n')).toMatch(/council\.members is an entity set: an event writes who joins \(op "add"\) and who leaves \(op "remove"\)/);
    const unmatched = validatePackText(orgPack((p) => { p.events.at(-1).outcomes = [{ op: 'remove', entity_id: 'council', predicate: 'members', value: ['sol'] }]; }));
    expect(unmatched.errors.map((e) => e.message).join('\n')).toMatch(/outcome council\.members remove \["sol"\] has no matching canonical effect/);
  });

  it('OR2 the Persona puts the player into a canon organization; the canon change keeps them, and the leader the Persona made stays', async () => {
    const x = await setup(orgPack(), PROFILE([{ name: 'The Council', existing_id: 'council', role: 'head', leads: true, secrecy: 'public' }]));
    await turn(x, 'I look around.', 'You look around. [O1]');
    const me = player(x);
    expect(memberships(x.engine.current!.index, st(x).clock.lo).get('council')).toEqual(expect.arrayContaining(['sol', 'ren', me]));
    expect(factAt(st(x), 'council', 'leader', { tick: st(x).clock.lo }).value).toBe(me);
    expect(x.engine.membershipView(false)!.now.find((o) => o.id === 'council')).toMatchObject({ leader: 'Ash', members: expect.arrayContaining(['Ash', 'Ren', 'Sol']) });
    // past the reshuffle: Ren left, the player stayed, and Sol's handover to Ren did not unseat the player
    // the Council's events in those days reach the player (required): one call from the Council covers them
    x.model.on('evaluate', (i) => String(i.candidate).includes('[O2]'), { scene_end: at(5, 9, 0), contacts: [{ quote: 'Days pass', actors: ['council'], kind: 'request', scope_kind: 'faction', scope_ref: 'council', scope_label: '', opportunity_id: null }] });
    expect(await turn(x, 'I sleep until the fifth day.', 'Days pass. [O2]')).toBe(true);
    const t = tick(5, 9, 0);
    expect(st(x).dispositions.get('council-reshuffle')?.disposition).toBe('occurred');
    expect([...(factAt(st(x), 'council', 'members', { tick: t }).value as string[])].sort()).toEqual([me, 'sol'].sort());
    expect(factAt(st(x), 'council', 'leader', { tick: t }).value).toBe(me);
    expect(x.engine.membershipView(true)!.changes.find((c) => c.event === 'Council reshuffle' && c.what === 'members')).toMatchObject({ op: 'remove', names: ['Ren'] });
  });

  it('OR3 without the Persona the canon handover happens as written', async () => {
    const x = await setup(orgPack(), PROFILE([]));
    x.model.on('evaluate', (i) => String(i.candidate).includes('[O3]'), { scene_end: at(5, 9, 0) });
    expect(await turn(x, 'I sleep until the fifth day.', 'Days pass. [O3]')).toBe(true);
    expect(factAt(st(x), 'council', 'leader', { tick: tick(5, 9, 0) }).value).toBe('ren');
    expect(factAt(st(x), 'council', 'members', { tick: tick(5, 9, 0) }).value).toEqual(['sol']);
  });

  it('OR4 an original organization is kept like any other: the player, the people the Persona puts in it, the player as its leader', async () => {
    const x = await setup(orgPack(), PROFILE([{ name: 'Grey Lantern', existing_id: null, role: 'founder', leads: true, members: ['Kit', 'Ren'], secrecy: 'secret' }],
      [{ name: 'Kit', existing_id: null, relation: 'right hand in the Grey Lantern', basis: 'persona_stated' }]));
    await turn(x, 'I look around.', 'You look around. [O4]');
    const org = x.engine.membershipView(false)!.now.find((o) => o.name === 'Grey Lantern');
    expect(org).toMatchObject({ leader: 'Ash', members: expect.arrayContaining(['Ash', 'Kit', 'Ren']) });
  });

  it('OR5 a new identity takes the player out of what the new Persona no longer gives them', async () => {
    const x = await setup(orgPack(), PROFILE([{ name: 'The Council', existing_id: 'council', role: 'head', leads: true }]));
    await turn(x, 'I look around.', 'You look around. [O5]');
    const me = player(x);
    x.model.on('profile', null, PROFILE([]), true);
    (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash left the Council.' });
    await x.engine.updateIdentity();
    expect(factAt(st(x), 'council', 'members', { tick: st(x).clock.lo }).value).toEqual(['ren', 'sol']);
    expect(factAt(st(x), 'council', 'leader', { tick: st(x).clock.lo }).known).toBe(false);
    expect(player(x)).toBe(me);
  });
});

describe('what the player\'s own organization does reaches them', () => {
  const union = PROFILE([{ name: 'The Union', existing_id: 'union', role: 'docker', secrecy: 'public' }]);

  it('OR6 the Union\'s event within a day is a required contact: the GM must bring it; a draft without it is sent back; once made it is done', async () => {
    const x = await setup(demo, union, tick(1, 12, 30));
    x.host.addUser('I take a nap.');
    x.model.draft('You nap through the afternoon. [R1]', 'You nap — until a Union runner bangs on the door: the dockmaster wants everyone at the piers before dawn. [R2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[R2]'), { contacts: [{ quote: 'a Union runner bangs on the door', actors: ['union'], kind: 'request', scope_kind: 'faction', scope_ref: 'union', scope_label: '', opportunity_id: null }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(ctx(x, -2)).toMatch(/WORLD REACTION — REQUIRED[\s\S]*The harbor conflict begins/);
    expect(ctx(x, -2)).toMatch(/the player is a member of The Union, which takes part in/);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/The world must reach the player character in this reply about "The harbor conflict begins"/);
    expect(x.model.tasks('evaluate').some((t) => (t.input.required_contacts || []).length === 1)).toBe(true);
    const made = st(x).contacts.at(-1)!;
    expect(made.opportunityId).toMatch(/^opp_/);
    // done: the next reply is not told again
    await turn(x, 'I get dressed.', 'You get dressed. [R3]');
    expect(ctx(x)).not.toMatch(/WORLD REACTION — REQUIRED/);
  });

  it('OR7 not when the player turned the organization down', async () => {
    const x = await setup(demo, union, tick(1, 12, 30));
    x.host.addUser('I am done with the Union.');
    x.model.on('extract_user', () => true, { statements: [{ kind: 'engagement', quote: 'I am done with the Union', summary: 'declined the union', entities: [], facts: [], event_id: null, time: null, ambiguous: false, stance: 'declined', scope_kind: 'faction', scope_ref: 'union', scope_label: null, until: null }], references: [], scene_entities: [] }, true);
    x.model.draft('You nap. [R4]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(ctx(x)).not.toMatch(/WORLD REACTION — REQUIRED/);
    expect(x.model.tasks('draft')).toHaveLength(1);
  });

  it('OR8 an event far off is not required yet; the analysis marks the event for the integrate task', async () => {
    const x = await setup(demo, union, tick(1, 6, 0));
    await turn(x, 'I wake up.', 'Morning. [R5]');
    expect(ctx(x)).not.toMatch(/WORLD REACTION — REQUIRED/);
    const cand = x.model.tasks('integrate')[0].input.candidate_events.find((c: any) => c.id === 'conflict-begins');
    if (cand) expect(cand.player_org).toBe('The Union');
  });
});
