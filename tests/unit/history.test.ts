// HI: the player's history is their own. What their organizations and places did without them is background from the
// last weeks, every time says how long ago it was, a connection shows how the person is now, and a suggestion resting
// only on history long over that the player had no part in is dropped. Live (2026-11-08): a new member of an
// organization was given its year-old kidnapping of a member as "actual history", and the analysis made it
// "she has been missing since this morning" (user decision: fix all four).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { checkOpportunities, integrationCandidates } from '../../src/runtime/integration';
import { agoLabel } from '../../src/domain/time';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

/** The demo pack, longer: the Council (Sol, Ren) carried Ren off on day 0 and held a vote on day 45. */
function pack() {
  const p = JSON.parse(demo);
  p.coverage.end = { day: 60, minute: 1439 };
  p.predicates.push({ id: 'members', description: 'members of an organization', value_type: 'entity_set' });
  const src = p.entities[0].source_refs;
  p.entities.push(
    { id: 'ren', name: 'Ren', aliases: [], kind: 'person', static_description: 'A council clerk.', source_refs: src },
    { id: 'sol', name: 'Sol', aliases: [], kind: 'person', static_description: 'A council elder.', source_refs: src },
  );
  const fact = (entity_id: string, predicate: string, value: unknown) => ({ fact: { entity_id, predicate, value }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' });
  p.initial_state.facts.push(fact('council', 'members', ['sol', 'ren']), fact('ren', 'alive', true));
  const base = p.events.find((e: any) => e.id === 'harbor-festival');
  const ev = (id: string, title: string, day: number, entity_ids: string[]) => ({ ...JSON.parse(JSON.stringify(base)), id, title, summary: title, classification: 'SOFT',
    when: { earliest: { day, minute: 600 }, latest: { day, minute: 660 }, precision: 'range', label: 'x', basis: 'documented', notes: '' }, entity_ids, location_ids: [], arc_id: null, outcomes: [], canonical_effects: [] });
  p.events.push(ev('ren-carried-off', 'Ren carried out of the city', 0, ['council', 'ren']), ev('council-vote', 'The Council votes', 45, ['council', 'sol']));
  return JSON.stringify(p);
}
const PROFILE = {
  player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: '' },
  affiliations: [{ name: 'The Council', existing_id: 'council', role: 'about to be taken on', status: 'joining', secrecy: 'public' }],
  places: [], capabilities: [], resources: [], goals: [],
  relationships: [{ name: 'Ren', existing_id: 'ren', relation: 'an old friend', basis: 'persona_stated' }], knowers: [], uncertain: [],
};

describe('the player\'s own history, and how long ago things were', () => {
  it('HI1 the organization\'s past is not the player\'s history; its last weeks are background with dates; the friend shows how they are now; old history is no reason', async () => {
    expect([agoLabel(tick(50, 9, 0), tick(50, 17, 0)), agoLabel(tick(45, 10, 0), tick(50, 9, 0)), agoLabel(tick(0, 10, 0), tick(50, 9, 0)), agoLabel(tick(0, 10, 0), tick(400, 9, 0))])
      .toEqual(['today', '5 days ago', 'about 7 weeks ago', 'about a year ago']);
    const x = makeEngine();
    (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, about to join the Council. Ren is an old friend.' });
    x.model.on('profile', null, PROFILE);
    await x.engine.bind(pack(), { startTick: tick(50, 9, 0), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I walk to the Council house.');
    x.model.draft('The Council house is quiet. [H1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const player = x.model.tasks('integrate').at(-1)!.input.player;
    const all = JSON.stringify(player);
    expect(all).not.toMatch(/Ren carried out of the city/);
    expect(player.actual_history.every((h: any) => !/Council votes/.test(h.title))).toBe(true);
    expect(player.lately).toEqual([expect.objectContaining({ of: 'The Council', events: [expect.objectContaining({ title: 'The Council votes', time: expect.stringMatching(/D45 10:00.*5 days ago/) })] })]);
    expect(player.relationships[0]).toMatchObject({ name: 'Ren', now: expect.stringMatching(/alive=true/) });
    expect(String(x.model.tasks('draft').at(-1)!.input.engineContext)).toMatch(/connection: Ren \[ren\] — an old friend \(Persona\) \[now: [^\]]*alive=true/);
    // a suggestion resting only on the old event is dropped; one resting on the recent one is kept
    const index = x.engine.current!.index;
    const occOf = (id: string) => [...index.state.occurrences.values()].find((o) => o.packEventId === id)!.occurrenceId;
    const profile = x.engine.playerProfile()!.profile;
    const t = index.state.clock.lo;
    const opp = (ref: string, basis: string) => ({ ref, scope_kind: 'storyline' as const, scope_ref: ref, scope_label: ref, kind: 'information' as const, actors: ['sol'], motivation: 'm', knowledge: 'k', contact: 'c', basis_refs: [basis] });
    const out = checkOpportunities({ assessments: [], opportunities: [opp('ren missing', occOf('ren-carried-off')), opp('the vote', occOf('council-vote'))] }, index, profile, integrationCandidates(index, profile, t), t);
    expect(out.valid.map((o) => o.scopeLabel)).toEqual(['the vote']);
    expect(out.dropped).toEqual([{ id: 'ren missing', reason: 'it rests only on history long over that the player had no part in' }]);
  });
});
