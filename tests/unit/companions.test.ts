// CP: someone with the player takes part in a canon event soon (user design 2026-11-03). Known in advance: they bring
// it up (have to go / ask the player along — the player decides). Without warning (a chance encounter): it happens to
// them and the player together, where they are — the person does not wander off — unless the player declined it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;

async function setup(knows: boolean | null) {
  const x = makeEngine();
  if (knows !== null) x.model.on('foreknow', null, { judgements: [{ id: 'k1', knows, how: knows ? 'her own errand' : 'chance' }] });
  await x.engine.bind(demo, { startTick: tick(1, 8, 30), mode: 'new' });
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
const lastCtx = (x: X) => String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
const section = (x: X) => (lastCtx(x).split("COMPANIONS' NEXT EVENTS")[1] || '').split('\n\n')[0];

describe("companions' next events", () => {
  it('CP1 a chance event of the person with the player: it happens to both of them; asked once per pair', async () => {
    const x = await setup(false);
    await turn(x, 'I walk with Mira.', 'Mira walks beside me. [CP1a]', { scene_entities: ['mira'] });
    expect(lastCtx(x)).not.toContain("COMPANIONS' NEXT EVENTS"); // nobody with the player yet when this reply was written
    await turn(x, 'We keep walking.', 'The road goes on. [CP1b]', { scene_entities: ['mira'] });
    expect(section(x)).toMatch(/Mira — 「[^」]+」 \[medic-ambush\] \(FREE\) starts .*10:00/);
    expect(section(x)).toMatch(/Mira does NOT know this in advance \(chance\): Mira stays with the player[^]*happens to both of them together, where they are/);
    const ask = x.model.tasks('foreknow');
    expect(ask).toHaveLength(1);
    expect(ask[0].input.pairs[0]).toMatchObject({ id: 'k1', person: 'Mira' });
    await turn(x, 'Still walking.', 'More road. [CP1c]', { scene_entities: ['mira'] });
    expect(x.model.tasks('foreknow')).toHaveLength(1);
    expect(lastCtx(x)).toMatch(/COMPANIONS section says how the people with the player handle theirs/);
  });

  it('CP2 known in advance: the person brings it up; the player decides', async () => {
    const x = await setup(true);
    await turn(x, 'I walk with Mira.', 'Mira walks beside me. [CP2a]', { scene_entities: ['mira'] });
    await turn(x, 'We keep walking.', 'The road goes on. [CP2b]', { scene_entities: ['mira'] });
    expect(section(x)).toMatch(/Mira knows this in advance \(her own errand\): before it starts, Mira brings it up in character — has to go, or asks the player to come along\. Whether the player goes is the player's choice/);
  });

  it('CP3 the player declined the event: the person goes alone; no answer from the judgement gives both cases', async () => {
    const x = await setup(null);
    await turn(x, 'I walk with Mira.', 'Mira walks beside me. [CP3a]', { scene_entities: ['mira'] });
    await turn(x, 'We keep walking.', 'The road goes on. [CP3b]', { scene_entities: ['mira'] });
    expect(section(x)).toMatch(/If Mira would know it in advance, Mira brings it up[^]*if it comes without warning, Mira stays with the player/);
    const decline = { statements: [{ kind: 'engagement', quote: 'I want nothing to do with any ambush', summary: 'declined', entities: [], facts: [], event_id: null, time: null, ambiguous: false, stance: 'declined', scope_kind: 'event', scope_ref: 'medic-ambush', scope_label: null, until: null }], references: [], scene_entities: [] };
    await turn(x, 'I want nothing to do with any ambush.', 'Mira nods. [CP3c]', { scene_entities: ['mira'] }, decline);
    expect(section(x)).toMatch(/The player declined to take part in it: Mira leaves at a natural moment before it/);
  });

  it('CP4 nobody with the player: no section', async () => {
    const x = await setup(false);
    await turn(x, 'I walk alone.', 'Quiet road. [CP4a]');
    await turn(x, 'I keep walking.', 'Quiet road. [CP4b]');
    expect(lastCtx(x)).not.toContain("COMPANIONS' NEXT EVENTS");
    expect(x.model.tasks('foreknow')).toHaveLength(0);
  });
});
