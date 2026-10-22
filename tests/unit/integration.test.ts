// NI: narrative integration — the world reacts to the player character (requirements doc + the user's decisions).
// The Persona becomes a checked profile (P0: the HARD planner gets it too); the integrate task suggests contacts;
// the player's decisions and the contacts that reached them are replayable records; one policy filters every way in.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ, legacyCampaign } from './fake';
import { ROOT } from './helpers';
import { engagementView } from '../../src/runtime/integration';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;

const VERA = { name: 'Vera', description: 'Vera runs the Grey Lantern, a secret smuggling ring at the harbor, from her tea house. Mira owes her a debt.' };
const PROFILE = {
  player: { name: 'Vera', aliases: [], summary: 'Leader of the Grey Lantern, a secret smuggling ring at the harbor.', public_identity: 'owner of a dockside tea house' },
  affiliations: [{ name: 'Grey Lantern', existing_id: null, kind: 'organization', role: 'leader', secrecy: 'secret', description: 'a smuggling ring' }],
  places: [{ name: 'Lantern Tea House', existing_id: null, use: 'front and base' }],
  capabilities: ['smuggling routes'], resources: ['twelve members', 'a fast boat'], goals: ['keep the ring alive'],
  relationships: [
    { name: 'Mira', existing_id: 'mira', relation: 'owes Vera a debt', basis: 'persona_stated' },
    { name: 'Mira', existing_id: 'mira', relation: 'Vera\'s handler', basis: 'implied' },
  ],
  knowers: [
    { who: 'members of the Grey Lantern', existing_id: null, level: 'identity', about: 'their leader', basis: 'implied' },
    { who: 'the Council', existing_id: 'council', level: 'exists', about: 'a smuggling ring works the harbor', basis: 'implied' },
    { who: 'Mira', existing_id: 'mira', level: 'identity', about: 'Vera runs the ring', basis: 'implied' },
    { who: 'rival smugglers', existing_id: null, level: 'secrets', about: 'the boat route', basis: 'implied' },
  ],
  uncertain: [],
};
const OPP = (over: any = {}) => ({ ref: 'o1', target_event_id: 'medic-ambush', scope_kind: 'event', scope_ref: 'medic-ambush', kind: 'request', direct_impact: false, actors: ['council'], motivation: 'needs a discreet boat to move Mira out of the harbor', knowledge: 'knows a smuggling ring exists through its medicine purchases', contact: 'a Council clerk leaves a sealed note at the tea house', establishes: ['a clerk named Oda'], earliest: null, latest: null, priority: 1, basis_refs: [], ...over });

async function setup(opts: { persona?: { name: string; description: string }; start?: number; pack?: string; integrate?: any } = {}) {
  const x = makeEngine();
  const persona = { ...(opts.persona || VERA) };
  (x.host as any).persona = () => persona;
  (x as any).persona = persona;
  x.model.on('profile', null, PROFILE);
  if (opts.integrate !== undefined) x.model.on('integrate', null, opts.integrate);
  await x.engine.bind(opts.pack || demo, { startTick: opts.start ?? tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: X, user: string, draft: string, evalPatch: any = {}, extract?: any) {
  x.host.addUser(user);
  if (extract) x.model.on('extract_user', (i) => String(i.message).includes(user.slice(0, 12)), extract, true);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: X) => x.engine.current!.replay.state;
const lastCtx = (x: X) => String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
const decline = (quote: string, scope_kind = 'event', scope_ref = 'medic-ambush', stance = 'declined') => ({ statements: [{ kind: 'engagement', quote, summary: `${stance} ${scope_ref}`, entities: [], facts: [], event_id: null, time: null, ambiguous: false, stance, scope_kind, scope_ref, scope_label: null, until: null }], references: [], scene_entities: [] });
const contact = (quote: string, over: any = {}) => ({ quote, actors: ['council'], kind: 'request', scope_kind: 'event', scope_ref: 'medic-ambush', scope_label: '', opportunity_id: null, ...over });

describe('player presence (Persona -> profile)', () => {
  it('NI-07 the Persona becomes a profile and a persona_seed: original organizations/places get stable runtime ids; the pack is untouched', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises from the kettles. [P1]');
    const prof = x.engine.playerProfile()!;
    expect(prof.rev).toBe(1);
    expect(prof.afterMessageId).toBeNull();
    expect(prof.profile.playerId).toMatch(/^rt\.player\./);
    expect(prof.profile.affiliations[0]).toMatchObject({ name: 'Grey Lantern', role: 'leader', secrecy: 'secret' });
    expect(prof.profile.affiliations[0].entityId).toMatch(/^rt\.org\./);
    expect(prof.profile.places[0].entityId).toMatch(/^rt\.place\./);
    // in the world: the player and their organization exist as entities (no story event was invented)
    expect(st(x).runtimeEntities.has(prof.profile.playerId)).toBe(true);
    expect(st(x).runtimeEntities.has(prof.profile.affiliations[0].entityId)).toBe(true);
    expect(st(x).records.filter((r) => r.kind === 'persona_seed')).toHaveLength(1);
    expect([...st(x).occurrences.values()].some((o) => /Grey Lantern/.test(o.title))).toBe(false);
    expect(x.engine.campaign()!.packSnapshot.entities.some((e) => /Lantern/.test(e.name))).toBe(false);
    // the Persona is read once; later turns reuse the profile
    await turn(x, 'I pour tea.', 'A quiet morning. [P2]');
    expect(x.model.tasks('profile')).toHaveLength(1);
  });

  it('NI-03/user decision 1: implied knowers stay groups/roles at their level; a known character is never made a superior or knower on a guess', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises. [K1]');
    const p = x.engine.playerProfile()!.profile;
    // stated: kept; implied handler role for a known character: dropped
    expect(p.relationships.map((r) => `${r.name}:${r.basis}`)).toEqual(['Mira:persona_stated']);
    // implied knowers: groups and organizations stay; a known person is dropped; implied "secrets" becomes identity level
    expect(p.knowers.map((k) => `${k.who}:${k.level}`)).toEqual(['members of the Grey Lantern:identity', 'the Council:exists', 'rival smugglers:identity']);
    expect(p.notes.join(' ')).toMatch(/dropped implied relationship with Mira/);
    expect(p.notes.join(' ')).toMatch(/dropped implied knower Mira/);
    // the GM is told who knows what at which level
    const ctx = lastCtx(x);
    expect(ctx).toMatch(/PLAYER IN THIS WORLD[\s\S]*Vera \[rt\.player\.[^\]]+\] \(the player character\)/);
    expect(ctx).toMatch(/who knows: the Council knows the organization exists [(]not that the player is in it[)] — a smuggling ring/);
    expect(ctx).toMatch(/anyone else knows just the public identity/);
  });

  it('NI-08 what the engine read is visible: the standard Persona only, with its size', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises. [K2]');
    const v = x.engine.integrationView(false)!;
    expect(v.profile).toMatchObject({ name: 'Vera', source: 'standard_persona', chars: VERA.description.length });
    expect(x.model.tasks('profile')[0].input.persona).toEqual(VERA);
  });

  it('NI-34 a changed Persona is reported, applies only from where the player updates it, and older messages keep their identity', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises. [V1]');
    (x as any).persona.description = 'Vera is a retired courier with no ring any more.';
    expect(x.engine.personaChanged()).toBe(true);
    await turn(x, 'I sweep the floor.', 'Dust motes. [V2]');
    expect(x.engine.notices.some((n) => /differs from this game's player/.test(n.text))).toBe(true);
    expect(x.engine.playerProfile()!.rev).toBe(1); // nothing changes until the player chooses
    await x.engine.updateIdentity();
    expect(x.engine.playerProfile()!.rev).toBe(2);
    expect(x.engine.personaChanged()).toBe(false);
    // the first user message is re-read after an edit: with the identity it was written with (revision 1)
    x.host.edit(1, 'I open the tea house early.');
    x.engine.sourceChanged('edit');
    await x.engine.reconcile('edit');
    const reread = x.model.tasks('extract_user').filter((t: any) => String(t.input.message).includes('early')).slice(-1)[0];
    expect(reread.input.persona.description).toBe(VERA.description);
  });
});

describe('P0: the HARD planner knows the player', () => {
  it('NI-00 the plan request carries the player context (identity, organization, knowers, decisions), not just a name', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises. [H1]');
    const plan = x.model.tasks('plan').slice(-1)[0].input;
    expect(plan.player.name).toBe('Vera');
    expect(plan.player.who).toMatch(/Grey Lantern/);
    expect(plan.player.affiliations[0].name).toBe('Grey Lantern');
    expect(plan.player.knowers.length).toBe(3);
    expect(plan.player_interests).toEqual([]); // 关注 contacts come from the integrate task now
    expect(x.engine.activePlan()!.playerContextHash).toBeTruthy();
  });

  it('NI-00 a new decision or identity makes the old plan stale (replanned with the new context)', async () => {
    const x = await setup();
    await turn(x, 'I open the tea house.', 'Steam rises. [H2]');
    const before = x.model.tasks('plan').length;
    await turn(x, 'I pour tea for myself.', 'Quiet. [H3]');
    expect(x.model.tasks('plan').length).toBe(before); // nothing about the player changed: plan reused
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [H4]', {}, decline('I stay out of the Council business'));
    expect(x.model.tasks('plan').length).toBe(before + 1);
    expect(x.model.tasks('plan').slice(-1)[0].input.player.decisions.join(' ')).toMatch(/declined: Ambush of Mira/);
  });

  it('NI-00 a campaign bound before integration still gives the planner the Persona text, not only the name', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    legacyCampaign(x);
    await x.engine.reconcile('t');
    await turn(x, 'I look around.', 'Gulls. [H5]');
    expect(x.model.tasks('plan').slice(-1)[0].input.player).toEqual({ name: 'Traveler', persona: 'a wandering cartographer' });
    expect(x.model.tasks('profile')).toHaveLength(0);
  });
});

describe('the world reaches the player', () => {
  it('NI-01 without naming any event, a player with an organization gets a world reaction the GM may use; it is not history', async () => {
    const x = await setup({ integrate: { assessments: [{ target: 'medic-ambush', classification: 'opportunity', reason: 'the Council needs a boat' }], opportunities: [OPP()] } });
    await turn(x, 'I drink tea in the back room.', 'Rain on the windows. [W1]');
    const inp = x.model.tasks('integrate')[0].input;
    expect(inp.player.affiliations[0].name).toBe('Grey Lantern');
    expect(inp.candidate_events.map((c: any) => c.id)).toContain('medic-ambush');
    const ctx = lastCtx(x);
    expect(ctx).toMatch(/WORLD REACTION \(optional for this reply — NOT history[\s\S]*The Council: a Council clerk leaves a sealed note at the tea house/);
    expect(st(x).contacts).toHaveLength(0); // offered is not delivered
    expect([...st(x).occurrences.values()].some((o) => /note/.test(o.account))).toBe(false);
  });

  it('NI-02 the analysis runs with no pending HARD event at all', async () => {
    const p = JSON.parse(demo);
    for (const e of p.events) if (e.classification === 'HARD') { e.classification = 'SOFT'; e.required_description = null; }
    const x = await setup({ pack: JSON.stringify(p), integrate: { assessments: [], opportunities: [OPP()] } });
    await turn(x, 'I drink tea.', 'Rain. [W2]');
    expect(x.model.tasks('plan')).toHaveLength(0);
    expect(x.model.tasks('integrate')).toHaveLength(1);
    expect(lastCtx(x)).toMatch(/WORLD REACTION [(]optional/);
  });

  it('NI-27/NI-25 a contact the reply delivers is recorded with its evidence; an invitation is not acceptance', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP()] } });
    const oppId = () => x.engine.campaign()!.integrationCache!.opportunities[0].id;
    await turn(x, 'I drink tea.', 'A clerk slips a sealed note under the door. [W3]', { contacts: [contact('A clerk slips a sealed note under the door', { opportunity_id: 'x' })] });
    expect(st(x).contacts).toHaveLength(1);
    expect(st(x).contacts[0]).toMatchObject({ scopeKind: 'event', scopeRef: 'medic-ambush', contactKind: 'request', actors: ['council'] });
    expect(st(x).contacts[0].opportunityId).toBeNull(); // the reviewer named a wrong suggestion id
    expect(st(x).engagements).toHaveLength(0);
    // the next turn: the same thing is not offered again while unanswered
    await turn(x, 'I read a book.', 'Pages turn. [W4]');
    expect(lastCtx(x)).not.toMatch(/WORLD REACTION [(]optional/);
    expect(lastCtx(x)).toMatch(/already offered, not answered: Ambush of Mira/);
    void oppId;
  });

  it('NI-14 a reply that does not use the reaction passes without repair; NI-26 a time skip past it does not make it happen', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP({ earliest: { day: 1, minute: 570 }, latest: { day: 1, minute: 600 } })] } });
    await turn(x, 'I sleep until the evening.', 'You wake at dusk. [W5]', { scene_end: at(1, 18, 0) });
    expect(x.model.tasks('draft')).toHaveLength(1);
    expect(st(x).contacts).toHaveLength(0);
    expect(st(x).engagements).toHaveLength(0);
  });

  it('NI-11 a settled event or one whose original conditions failed is not revived; its consequences may still reach the player', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP({ ref: 'a' }), OPP({ ref: 'b', kind: 'consequence', direct_impact: true, contact: 'the wounded are brought to the tea house' }), OPP({ ref: 'c', kind: 'information', contact: 'a runner tells Vera that Mira died' })] } });
    await x.engine.forceComplete('medic-ambush'); // settled (Mira dies in the original)
    await turn(x, 'I drink tea.', 'Rain. [W6]');
    const cache = x.engine.campaign()!.integrationCache!;
    expect(cache.dropped.map((d) => d.reason).join(' ')).toMatch(/already settled/);
    // live: news that the player's friend died (a settled event) was dropped; news of what happened may reach them
    expect(cache.opportunities.map((o) => o.kind)).toEqual(['consequence', 'information']);
  });
});

describe('declines, deferrals and re-engagement', () => {
  it('NI-16 a decline stops every way in — another person, another channel — across turns and reloads; the world still goes on', async () => {
    const x = await setup({ integrate: (i: any) => ({ assessments: [], opportunities: [OPP({ ref: 'u', actors: ['union'], contact: 'a Union runner begs Vera to help Mira' }), OPP({ ref: 'n', actors: ['council'], kind: 'information', contact: 'a newspaper story about the ambush is left on the counter' })] }) });
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [D1]', {}, decline('I stay out of the Council business'));
    expect(st(x).engagements.map((e) => `${e.stance}:${e.scopeRef}`)).toEqual(['declined:medic-ambush']);
    for (let i = 0; i < 3; i++) {
      await turn(x, `I tidy the shelves ${i}.`, `Quiet day ${i}. [D2${i}]`);
      expect(lastCtx(x)).not.toMatch(/WORLD REACTION [(]optional/);
      expect(lastCtx(x)).toMatch(/PLAYER'S DECISIONS[\s\S]*declined: Ambush of Mira \("I stay out of the Council business"\) — do not pull the player into it again/);
    }
    expect(x.engine.campaign()!.integrationCache!.dropped.every((d) => /the player declined Ambush of Mira/.test(d.reason))).toBe(true);
    // the reviewer gets the decisions too (required context, also in review mode)
    const ev = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(ev.engagement.join(' ')).toMatch(/declined: Ambush of Mira/);
    expect(ev.retrieved_context).toMatch(/PLAYER'S DECISIONS/);
    x.host.reload();
    await x.engine.reconcile('reload');
    expect(engagementView(st(x), x.engine.pack()).blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)?.stance).toBe('declined');
  });

  it('NI-23 after a decline, harm with an actual recorded cause can still reach the player; an invented one cannot', async () => {
    const x = await setup();
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [A1]', {}, decline('I stay out of the Council business'));
    const vera = x.engine.playerProfile()!.profile.playerId;
    await turn(x, 'I watch the street.', 'Council guards rough up your runner and mark the tea house. [A2]', { occurrences: [occ('o1', 'Council guards mark the tea house', 'Council guards rough up your runner', { actors: ['council'], affected: [vera] })] });
    const cause = [...st(x).occurrences.values()].find((o) => /mark the tea house/.test(o.title))!.occurrenceId;
    x.model.on('integrate', null, { assessments: [], opportunities: [
      OPP({ ref: 'h', kind: 'hostile', direct_impact: true, contact: 'guards come to search the tea house', basis_refs: [cause] }),
      OPP({ ref: 'f', actors: ['council'], kind: 'hostile', direct_impact: true, contact: 'they kidnap Vera\'s friend to force her to help', basis_refs: [] }),
    ] });
    await turn(x, 'I lock the door.', 'Footsteps outside. [A3]');
    const cache = x.engine.campaign()!.integrationCache!;
    expect(cache.opportunities.map((o) => o.contact)).toEqual(['guards come to search the tea house']);
    expect(cache.dropped.map((d) => d.reason)).toEqual(['the player declined Ambush of Mira']);
  });

  it('NI-17 a newer decline outweighs an older 关注 on every path (GM lines, planner, integrate input)', async () => {
    const x = await setup();
    await x.engine.toggleFocus('medic-ambush');
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [F1]', {}, decline('I stay out of the Council business'));
    const inp = x.model.tasks('integrate').slice(-1)[0].input;
    expect(inp.candidate_events.find((c: any) => c.id === 'medic-ambush').player_decision).toBe('declined: Ambush of Mira');
    expect(x.model.tasks('plan').slice(-1)[0].input.player_interests).toEqual([]);
    expect(lastCtx(x)).not.toMatch(/PLAYER WANTS TO EXPERIENCE/);
    // ☆ again on a declined event is an explicit "allow contact again"
    await x.engine.toggleFocus('medic-ambush');
    await x.engine.toggleFocus('medic-ambush');
    expect(engagementView(st(x), x.engine.pack()).blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)).toBeNull();
    expect(st(x).engagements.slice(-1)[0]).toMatchObject({ stance: 'reopened', source: 'ui' });
  });

  it('NI-18/NI-19 declining a storyline (arc, out of character) blocks its other events too, whatever the id, actor or wording', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP({ ref: 'b', target_event_id: 'council-broadcast', scope_ref: 'council-broadcast', actors: ['union'], contact: 'a Union friend asks Vera to listen to the broadcast' })] } });
    await turn(x, '(OOC: stop pulling me into the harbor conflict storyline.)', 'The harbor stays calm. [S1]', {}, decline('stop pulling me into the harbor conflict storyline', 'arc', 'harbor-conflict', 'ooc_suppress'));
    const cache = x.engine.campaign()!.integrationCache!;
    expect(cache.opportunities).toHaveLength(0);
    expect(cache.dropped[0].reason).toMatch(/suppressed Harbor conflict/);
    expect(lastCtx(x)).toMatch(/out of character, stop: Harbor conflict/);
  });

  it('NI-20 refusing one faction\'s request does not block the event for others', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP({ ref: 'c' }), OPP({ ref: 'u', actors: ['union'], contact: 'a Union runner warns Vera' })] } });
    await turn(x, 'I will not work for the Council.', 'Fine. [S2]', {}, decline('I will not work for the Council', 'faction', 'council'));
    const cache = x.engine.campaign()!.integrationCache!;
    expect(cache.opportunities.map((o) => o.actors[0])).toEqual(['union']);
  });

  it('NI-20b a blanket refusal can be scoped to the sender: the extractor sees who reached the player and the organizations nearby, not only the player\'s own', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP()] } });
    await turn(x, 'I drink tea.', 'A clerk slips a sealed note under the door. [B1]', { contacts: [contact('A clerk slips a sealed note under the door')] });
    await turn(x, 'No more jobs from anyone for a while.', 'The note burns. [B2]');
    const ctx = x.model.tasks('extract_user').slice(-1)[0].input.engagement_context;
    expect(ctx.recent_contacts[0].by).toEqual([{ id: 'council', name: expect.any(String) }]);
    const orgs = ctx.organizations.map((o: any) => `${o.id}:${o.player_member}`);
    expect(orgs).toContain('council:false');
    expect(orgs.some((o: string) => /^rt\.org\..*:true$/.test(o))).toBe(true);
  });

  it('NI-21 "not now" holds until the time the player named, then contacts may come again', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [OPP()] } });
    const later = { statements: [{ kind: 'engagement', quote: 'ask me again at noon', summary: 'defers', entities: [], facts: [], event_id: null, time: null, ambiguous: false, stance: 'deferred', scope_kind: 'event', scope_ref: 'medic-ambush', scope_label: null, until: { day: 1, minute: 720 } }], references: [], scene_entities: [] };
    await turn(x, 'Tell them to ask me again at noon.', 'The clerk bows. [S3]', {}, later);
    expect(lastCtx(x)).not.toMatch(/WORLD REACTION [(]optional/);
    expect(lastCtx(x)).toMatch(/not now: Ambush of Mira[^\n]*until D1 12:00/);
    const eng = engagementView(st(x), x.engine.pack());
    expect(eng.blockedBy({ eventId: 'medic-ambush' }, tick(1, 11, 0))?.stance).toBe('deferred');
    expect(eng.blockedBy({ eventId: 'medic-ambush' }, tick(1, 12, 0))).toBeNull();
  });

  it('user decision 6: a clear voluntary intervention re-engages that event (no words or button needed); a single act does not', async () => {
    const x = await setup();
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [J1]', {}, decline('I stay out of the Council business'));
    await turn(x, 'I pull one wounded man out of the alley and leave.', 'He lives. [J2]', {}, decline('I pull one wounded man out of the alley', 'event', 'medic-ambush', 'limited'));
    let eng = engagementView(st(x), x.engine.pack());
    expect(eng.blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)?.stance).toBe('declined');
    expect(eng.lines(st(x).clock.lo).join(' ')).toMatch(/one act only: Ambush of Mira/);
    await turn(x, 'I run to the road and fight the attackers.', 'Steel flashes. [J3]', {}, decline('I run to the road and fight the attackers', 'event', 'medic-ambush', 'joined'));
    eng = engagementView(st(x), x.engine.pack());
    expect(eng.blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)).toBeNull();
    expect(eng.lines(st(x).clock.lo).join(' ')).toMatch(/took part by their own action: Ambush of Mira/);
    // the earlier refusal stays in history
    expect(st(x).engagements.map((e) => e.stance)).toEqual(['declined', 'limited', 'joined']);
  });

  it('user decision 6: joining one event does not lift an out-of-character suppression of its whole storyline', async () => {
    const x = await setup();
    await turn(x, '(OOC: stop pulling me into the harbor conflict.)', 'Calm. [J4]', {}, decline('stop pulling me into the harbor conflict', 'arc', 'harbor-conflict', 'ooc_suppress'));
    await turn(x, 'I run to the road and fight the attackers.', 'Steel. [J5]', {}, decline('I run to the road and fight the attackers', 'event', 'medic-ambush', 'joined'));
    const eng = engagementView(st(x), x.engine.pack());
    expect(eng.blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)).toBeNull();
    expect(eng.blockedBy({ eventId: 'council-broadcast' }, st(x).clock.lo)?.stance).toBe('ooc_suppress');
  });

  it('NI-24 pressure on a declined thing is a blocking problem even when the reviewer mentions a pending HARD event', async () => {
    const x = await setup();
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [G1]', {}, decline('I stay out of the Council business'));
    x.host.addUser('I sip tea.');
    x.model.draft('Your best friend begs you to join the harbor conflict. [G2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G2]'), { violations: [{ code: 'engagement_pressure', quote: 'Your best friend begs you', detail: 'pushes the declined ambush toward The harbor conflict begins', blocking: true }] }, true);
    x.model.draft('You sip tea; the harbor is quiet. [G3]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/pulls the player toward something they declined/);
    expect(x.model.tasks('draft')).toHaveLength(3); // first turn + draft + repair
  });
});

describe('replay: decisions and contacts live with their messages', () => {
  it('NI-29 a swipe without the invitation drops its contact record; selecting the old swipe brings it back', async () => {
    const x = await setup();
    await turn(x, 'I drink tea.', 'A clerk slips a sealed note under the door. [R1]', { contacts: [contact('A clerk slips a sealed note under the door')] });
    expect(st(x).contacts).toHaveLength(1);
    x.model.draft('Only rain. [R2]');
    expect(await x.engine.runOperation('swipe')).toBe(true);
    expect(st(x).contacts).toHaveLength(0);
    x.host.selectSwipe(2, 0);
    x.engine.sourceChanged('swipe');
    await x.engine.reconcile('swipe');
    expect(st(x).contacts).toHaveLength(1);
  });

  it('NI-30 deleting the message with the decline removes the decline (rebuilt from the remaining history)', async () => {
    const x = await setup();
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [R3]', {}, decline('I stay out of the Council business'));
    await turn(x, 'I pour tea.', 'Quiet. [R4]');
    expect(st(x).engagements).toHaveLength(1);
    x.host.remove(1); // the decline message (index 0 is the greeting)
    x.host.remove(1); // its reply
    x.engine.sourceChanged('delete');
    await x.engine.reconcile('delete');
    expect(st(x).engagements).toHaveLength(0);
    expect(engagementView(st(x), x.engine.pack()).blockedBy({ eventId: 'medic-ambush' }, st(x).clock.lo)).toBeNull();
  });

  it('NI-32 a rejected draft records no contact; a failed save keeps nothing', async () => {
    const x = await setup();
    x.host.addUser('I drink tea.');
    x.model.draft('A clerk slips a note. [R5]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[R5]'), { contacts: [contact('A clerk slips a note')], violations: [{ code: 'x', quote: 'A clerk slips a note', detail: 'bad', blocking: true }] });
    x.model.draft('Rain. [R6]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[R6]'), {});
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(st(x).contacts).toHaveLength(0);
  });
});

describe('robustness', () => {
  it('NI-37 an unusable analysis leaves the turn without a reaction; the decisions still apply', async () => {
    const x = await setup();
    await turn(x, 'I stay out of the Council business.', 'The note stays sealed. [B1]', {}, decline('I stay out of the Council business'));
    (x.model as any).rules.unshift({ task: 'integrate', raw: 'not json at all', once: false });
    await turn(x, 'I pour tea.', 'Quiet. [B2]');
    expect(x.engine.lastTimings!.ok).toBe(true);
    expect(lastCtx(x)).not.toMatch(/WORLD REACTION [(]optional/);
    expect(lastCtx(x)).toMatch(/PLAYER'S DECISIONS[\s\S]*declined: Ambush of Mira/);
    expect(lastCtx(x)).not.toMatch(/PARTICIPATION OPPORTUNITIES[\s\S]*Ambush of Mira/); // legacy fallback lines skip the declined event
  });

  it('the analysis is cached by what it depends on: an ordinary turn reuses it', async () => {
    const x = await setup({ integrate: { assessments: [], opportunities: [] } });
    await turn(x, 'I pour tea.', 'Quiet. [C1]');
    await turn(x, 'I pour more tea.', 'Still quiet. [C2]');
    expect(x.model.tasks('integrate')).toHaveLength(1);
    await turn(x, 'I stay out of the Council business.', 'Sealed. [C3]', {}, decline('I stay out of the Council business'));
    expect(x.model.tasks('integrate')).toHaveLength(2); // a decision changes the basis
  });
});
