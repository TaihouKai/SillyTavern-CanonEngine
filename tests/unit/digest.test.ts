// D01-D03: 整理本局事件 — display-only episodes of the player's events in the timeline.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, occ } from './fake';
import { ROOT } from './helpers';
import { currentGraph } from '../../src/ui/graph';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function play(n: number) {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('t');
  for (let i = 0; i < n; i++) {
    x.host.addUser(`I do thing ${i}.`);
    x.model.draft(`Thing ${i} happens. [D${i}]`);
    x.model.on('evaluate', null, { occurrences: [occ('o1', `Thing ${i}`, `Thing ${i} happens`, { origin: 'player' })] }, true);
    expect(await x.engine.runOperation('normal')).toBe(true);
  }
  return x;
}
const playIds = (x: any) => [...x.engine.current!.replay.state.occurrences.values()].filter((o: any) => !o.packEventId).sort((a: any, b: any) => a.time.lo - b.time.lo || a.seq - b.seq).map((o: any) => o.occurrenceId);

describe('整理本局事件 (event digest)', () => {
  it('D01 consecutive groups become one box each; invalid groups (gaps, unknown ids) stay ungrouped', async () => {
    const x = await play(6);
    x.model.on('digest', null, { groups: [
      { member_ids: ['e1', 'e2', 'e3'], title: '上午的事', summary: '做了三件事。' },
      { member_ids: ['e4', 'e6'], title: '不连续', summary: '' }, // not consecutive: rejected
      { member_ids: ['e5', 'zz'], title: '只有一个', summary: '' }, // one known id: nothing to group
    ] }, true);
    const r = await x.engine.digestEvents();
    expect(r).toEqual({ groups: 1, events: 3 });
    const ids = playIds(x);
    expect(x.engine.digestGroups()[0].members).toEqual(ids.slice(0, 3));
    // the model only ever saw short aliases, not occurrence ids
    expect(JSON.stringify(x.model.tasks('digest')[0].input)).not.toContain(ids[0]);
    const s = x.engine.current!.replay.state;
    const g = currentGraph(x.engine.current!.index.pack, s, null, true, x.engine.digestGroups());
    const runtime = g.nodes.filter((n) => n.lane === 'RUNTIME');
    expect(runtime.find((n) => n.title === '上午的事（3段）')).toBeTruthy();
    expect(runtime.length).toBe(1 + 3); // the episode + three ungrouped events
  });

  it('D02 display only: history, records and the GM context are unchanged; undo restores the boxes', async () => {
    const x = await play(3);
    const before = JSON.stringify([...x.engine.current!.replay.state.occurrences.keys()]);
    x.model.on('digest', null, { groups: [{ member_ids: ['e1', 'e2', 'e3'], title: '全部', summary: '' }] }, true);
    await x.engine.digestEvents();
    expect(JSON.stringify([...x.engine.current!.replay.state.occurrences.keys()])).toBe(before);
    expect(x.engine.campaign()!.eventDigest!.groups.length).toBe(1);
    await x.engine.clearDigest();
    expect(x.engine.campaign()!.eventDigest).toBeUndefined();
    expect(x.engine.digestGroups()).toEqual([]);
  });

  it('D03 a group shrinks when edits remove its events, and disappears below two events', async () => {
    const x = await play(3);
    x.model.on('digest', null, { groups: [{ member_ids: ['e1', 'e2', 'e3'], title: '三件事', summary: '' }] }, true);
    await x.engine.digestEvents();
    const g = x.engine.campaign()!.eventDigest!.groups[0];
    g.members = [...g.members.slice(0, 2), 'occ_gone'];
    expect(x.engine.digestGroups()[0].members.length).toBe(2);
    g.members = [g.members[0], 'occ_gone'];
    expect(x.engine.digestGroups()).toEqual([]);
  });
});

describe('causal retrieval depth', () => {
  it('B05 causalClosure follows the nearest causes first and stops at the depth limit', async () => {
    const x = await play(5);
    const idx = x.engine.current!.index;
    const ids = playIds(x);
    // chain: e5 <- e4 <- e3 <- e2 <- e1
    ids.forEach((id: string, i: number) => { (idx.state.occurrences.get(id) as any).causes = i ? [ids[i - 1]] : []; });
    expect(idx.causalClosure([ids[4]]).length).toBe(5);
    expect(idx.causalClosure([ids[4]], { maxDepth: 2 }).sort()).toEqual([ids[2], ids[3], ids[4]].sort());
  });
});
