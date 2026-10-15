// G01–G04: scene grouping (one 本局事件 box per ongoing scene) is opt-in and never drops occurrences.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { currentGraph } from '../../src/ui/graph';
import { buildPacket, retrieve } from '../../src/runtime/context';
import { WorldIndex } from '../../src/domain/world-query';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup(grouping: boolean) {
  const x = makeEngine();
  x.engine.settings.sceneGrouping = grouping;
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-8);
  x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state;
const lastEval = (x: ReturnType<typeof makeEngine>) => x.model.tasks('evaluate').slice(-1)[0].input;

describe('scene grouping', () => {
  it('G01 with grouping on, a later beat of the same scene continues the box; graph and prompt show one box', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I walk along the harbor.', 'You stroll past the fishing boats. [Z1]', { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Harbor stroll', 'stroll past the fishing boats', { locations: ['harbor'], origin: 'player' })] })).toBe(true);
    const first = [...st(x).occurrences.values()].find((o) => o.title === 'Harbor stroll')!;
    // the reviewer is offered the current box to continue
    x.host.addUser('I buy grilled fish at a stall.');
    x.model.draft('You eat grilled fish by the water. [Z2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[Z2]'), (i: any) => ({
      scene_end: at(1, 10), occurrences: [occ('o1', 'Grilled fish by the water', 'eat grilled fish', { locations: ['harbor'], origin: 'player', continues: i.scene_grouping?.[0]?.occurrence_id ?? null })],
    }));
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(lastEval(x).scene_grouping?.[0]).toMatchObject({ occurrence_id: first.occurrenceId, title: 'Harbor stroll' });
    const second = [...st(x).occurrences.values()].find((o) => o.title === 'Grilled fish by the water')!;
    expect(second.continues).toBe(first.occurrenceId); // still its own record, filed under the box
    const g = currentGraph(x.engine.current!.index.pack, st(x), null, true);
    const boxes = g.nodes.filter((n) => n.lane === 'RUNTIME');
    expect(boxes.length).toBe(1);
    expect(boxes[0].title).toMatch(/Harbor stroll（2段）/);
    expect(boxes[0].summary).toMatch(/Grilled fish by the water/);
    // the prompt writes retrieved beats of one scene as a single block
    const index = new WorldIndex(x.engine.current!.index.pack, st(x));
    const r = retrieve(index, { refs: [], claims: [], sceneEntityIds: [], causalSeedEntityIds: [], freeText: [], checkpointTick: st(x).clock.lo });
    r.occurrences.set(first.occurrenceId, new Set(['scene']));
    r.occurrences.set(second.occurrenceId, new Set(['mentioned']));
    const p = buildPacket({ pack: x.engine.current!.index.pack, index, retrieval: r, checkpointTick: st(x).clock.lo, origin: null, sceneLabel: '', playerScope: [], plan: null, forced: false, stagedNotes: [], opportunities: [], budgetChars: 60000, horizon: 1440 });
    expect(p.text).toMatch(/one scene, .* — Harbor stroll:\n  · .*Harbor stroll: .*\n  · .*Grilled fish by the water:/);
  });

  it('G02 a new place or activity starts a new box', async () => {
    const x = await setup(true);
    await turn(x, 'I walk along the harbor.', 'You stroll past the fishing boats. [Y1]', { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Harbor stroll', 'stroll past the fishing boats', { origin: 'player' })] });
    await turn(x, 'I go to the market.', 'The market is loud and crowded. [Y2]', { scene_end: at(1, 10, 30), occurrences: [occ('o1', 'Market visit', 'market is loud', { origin: 'player', continues: null })] });
    expect(currentGraph(x.engine.current!.index.pack, st(x), null, true).nodes.filter((n) => n.lane === 'RUNTIME').length).toBe(2);
  });

  it('G03 with grouping off (default), nothing is offered and a stray continues is ignored', async () => {
    const x = await setup(false);
    await turn(x, 'I walk along the harbor.', 'You stroll past the fishing boats. [X1]', { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Harbor stroll', 'stroll past the fishing boats', { origin: 'player' })] });
    const first = [...st(x).occurrences.values()][0];
    await turn(x, 'I buy fish.', 'You eat grilled fish by the water. [X2]', { scene_end: at(1, 10), occurrences: [occ('o1', 'Grilled fish', 'eat grilled fish', { origin: 'player', continues: first.occurrenceId })] });
    expect(lastEval(x).scene_grouping).toBeUndefined();
    expect([...st(x).occurrences.values()].every((o) => !o.continues)).toBe(true);
    expect(currentGraph(x.engine.current!.index.pack, st(x), null, true).nodes.filter((n) => n.lane === 'RUNTIME').length).toBe(2);
  });

  it('G04 a canonical event never continues an ordinary box', async () => {
    const x = await setup(true);
    await turn(x, 'I walk along the harbor.', 'You stroll past the fishing boats. [W1]', { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Harbor stroll', 'stroll past the fishing boats', { origin: 'player' })] });
    const first = [...st(x).occurrences.values()][0];
    await turn(x, 'I shield Mira.', 'The bolts miss. Mira survives. [W2]', { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'Mira survives', { pack_event_id: 'medic-ambush', disposition: 'diverged', origin: 'player', actors: ['mira'], continues: first.occurrenceId })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira survives', occurrence_ref: 'o1' }] });
    const amb = [...st(x).occurrences.values()].find((o) => o.packEventId === 'medic-ambush')!;
    expect(amb.continues).toBeUndefined();
  });
});
