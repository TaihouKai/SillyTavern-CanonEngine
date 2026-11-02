// RC: who in the scene knows about the player (user design 2026-11-03). Canon only checked "doesn't know"; people who
// should know rarely showed it, because the Persona's knowers were one line the GM had to connect to the scene. Now a
// group is in the scene when it is known everywhere, a listed person or a member of its organization is there, the
// scene is at one of its places, or the analysis saw its people there (before the reply from the player's message,
// after it from what it shows). Secrets stay with the listed knowers; public standing is shown generously.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

function membersPack() {
  const p = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
  const refs = p.entities[0].source_refs;
  p.predicates.push({ id: 'members', description: 'members of an organization', value_type: 'entity_set' });
  p.entities.push(
    { id: 'ren', name: 'Ren', aliases: [], kind: 'person', static_description: 'A council clerk.', source_refs: refs },
    { id: 'market', name: 'Fish Market', aliases: [], kind: 'place', static_description: 'The harbor fish market.', source_refs: refs },
  );
  p.initial_state.facts.push({ fact: { entity_id: 'council', predicate: 'members', value: ['ren'] }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' });
  return JSON.stringify(p);
}

const PERSONA = { name: 'Vera', description: 'Vera, the famous singer of the harbor, owns the Lantern Tea House. Council clerks know she buys their records.' };
const PROFILE = {
  player: { name: 'Vera', aliases: [], summary: 'A famous harbor singer who owns a tea house.', public_identity: 'famous singer; owner of the Lantern Tea House' },
  affiliations: [], places: [{ name: 'Lantern Tea House', existing_id: null, use: 'her tea house' }],
  capabilities: [], resources: [], goals: [], relationships: [], uncertain: [],
  knowers: [
    { who: 'Council clerks', existing_id: 'council', level: 'identity', about: 'she buys the Council records', basis: 'persona_stated' },
    { who: 'the Council', existing_id: 'council', level: 'exists', about: 'someone buys records', basis: 'implied' },
  ],
  recognized_by: [
    { who: 'fishmongers of the market', existing_id: null, places: ['market'], everywhere: false, as: 'the singer who buys their whole catch' },
    { who: 'tea house regulars', existing_id: null, places: ['Lantern Tea House'], everywhere: false, as: 'the owner' },
  ],
};

type X = ReturnType<typeof makeEngine>;
async function setup(profile: any = PROFILE) {
  const x = makeEngine();
  (x.host as any).persona = () => PERSONA;
  x.model.on('profile', null, profile);
  await x.engine.bind(membersPack(), { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: X, user: string, draft: string, extract: any = {}, evalPatch: any = {}) {
  x.host.addUser(user);
  x.model.on('extract_user', (i) => String(i.message).includes(user.slice(0, 12)), { statements: [], references: [], ...extract }, true);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const lastCtx = (x: X) => String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
const section = (x: X) => (lastCtx(x).split('RECOGNITION IN THIS SCENE')[1] || '').split('\n\n')[0];

describe('recognition in the scene', () => {
  it('RC1 the profile keeps public recognition with its places; the panel lists it', async () => {
    const x = await setup();
    await turn(x, 'I tune my guitar.', 'A quiet morning. [RC1]');
    const p = x.engine.playerProfile()!.profile;
    expect(p.recognizedBy![0]).toMatchObject({ who: 'fishmongers of the market', places: ['market'], everywhere: false });
    expect(p.recognizedBy![1].places).toEqual([p.places[0].entityId]); // the Persona's own place
    expect(p.knowers[0].entityId).toBe('council');
  });

  it('RC2 at one of their places the group is in the scene; a member present brings their organization; elsewhere nobody', async () => {
    const x = await setup();
    await turn(x, 'I sing on the pier.', 'Gulls cry. [RC2a]');
    expect(lastCtx(x)).not.toContain('RECOGNITION IN THIS SCENE');
    await turn(x, 'I walk into the fish market.', 'Crates of fish everywhere. [RC2b]', { scene_entities: ['market'] });
    expect(section(x)).toMatch(/fishmongers of the market \(at Fish Market\) recognize the player on sight as: the singer who buys their whole catch\. Public standing — let it show/);
    expect(section(x)).not.toContain('Council clerks');
    await turn(x, 'I wave Ren over.', 'Ren comes. [RC2c]', { scene_entities: ['ren'] });
    expect(section(x)).toMatch(/Council clerks \(Ren is one of them\) know who the player is: she buys the Council records/);
    expect(section(x)).not.toContain('the Council (');            // "exists" knowers do not know the player
  });

  it('RC3 the analysis reports a group with no place in the scene (a big public event): before the reply from the message, after it from the reply', async () => {
    const x = await setup();
    // the player heads to the festival: tea house regulars will be in the crowd
    await turn(x, 'I go to the harbor festival.', 'Lanterns and crowds. [RC3a]', { scene_groups: ['g2'] }, { scene_groups: ['g2'] });
    const ex = x.model.tasks('extract_user').slice(-1)[0];
    expect(ex.input.recognition_groups).toEqual([{ id: 'g1', who: 'fishmongers of the market' }, { id: 'g2', who: 'tea house regulars' }, { id: 'g3', who: 'Council clerks' }]);
    expect(String(ex.messages![0].content)).toContain('"scene_groups"');
    expect(section(x)).toMatch(/tea house regulars \(in the scene\) recognize the player on sight as: the owner/);
    // the reviewer saw them at the end of the reply; a message that does not move the scene keeps them
    await turn(x, 'I keep watching the lanterns.', 'More lanterns. [RC3b]', { scene_groups: null });
    expect(section(x)).toContain('tea house regulars (in the scene)');
    const ev = x.model.tasks('evaluate').slice(-1)[0];
    expect(ev.input.recognition_groups[2]).toEqual({ id: 'g3', who: 'Council clerks', level: 'identity', knows: 'she buys the Council records' });
    expect(String(ev.messages![0].content)).toMatch(/RECOGNITION[^]*code "recognition"/);
    // the last reply ended with nobody of them; then the player goes home: nobody
    await turn(x, 'I go home.', 'Home. [RC3c]', { scene_groups: [] });
    expect(lastCtx(x)).not.toContain('RECOGNITION IN THIS SCENE');
  });

  it('RC4 a reviewer "recognition" violation (a regular asks who the player is) sends the reply back', async () => {
    const x = await setup();
    x.engine.settings.debug = true;
    x.host.addUser('I sit at my tea house counter.');
    x.model.on('extract_user', (i) => String(i.message).includes('I sit at my'), { statements: [], references: [], scene_groups: ['g2'] }, true);
    x.model.draft('A regular asks: "And who are you?" [RC4a]', 'A regular nods: "Morning, boss." [RC4b]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[RC4a]'), { violations: [{ code: 'recognition', quote: 'And who are you?', detail: 'a tea house regular does not know the owner', blocking: true }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/does not know the owner/);
    expect(x.host.chat.slice(-1)[0].text).toContain('[RC4b]');
  });

  it('RC5 a group known everywhere is always in the scene; old profiles without recognized_by add nothing', async () => {
    const x = await setup({ ...PROFILE, recognized_by: [{ who: 'everyone in the city', existing_id: null, places: [], everywhere: true, as: 'the famous singer' }] });
    await turn(x, 'I sing on the pier.', 'Gulls cry. [RC5]');
    expect(section(x)).toMatch(/everyone in the city \(known everywhere — strangers too, wherever the scene has people\) recognize the player on sight as: the famous singer/);
    const y = await setup({ ...PROFILE, recognized_by: undefined, knowers: [] });
    await turn(y, 'I sing on the pier.', 'Gulls cry. [RC5b]');
    expect(lastCtx(y)).not.toContain('RECOGNITION IN THIS SCENE');
  });
});
