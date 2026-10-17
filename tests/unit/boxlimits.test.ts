// BL1-BL3: a scene box is one stretch of one activity (size/time limits), and the reviewer sees the canon events open now.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { segmentSceneChain } from '../../src/domain/util';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const m = (lo: number, hi = lo, locations: string[] = []) => ({ time: { lo, hi }, locations });

describe('scene box limits', () => {
  it('BL1 a long chain is split by size, time span and a change of place', () => {
    const seven = [0, 30, 60, 75, 120, 180, 225].map((t) => m(780 + t)); // 13:00-16:45, like the live finding
    const segs = segmentSceneChain(seven);
    expect(segs.length).toBeGreaterThan(1);
    expect(segs.every((s) => s.length <= 4 && s[s.length - 1].time.hi - s[0].time.lo <= 90)).toBe(true);
    expect(segmentSceneChain([m(0, 0, ['a']), m(10, 10, ['b'])]).length).toBe(2);
    expect(segmentSceneChain([m(0, 0, ['a']), m(10, 10, ['a']), m(20)]).length).toBe(1);
  });

  it('BL2 a "continuation" two hours later starts a new box', async () => {
    const x = makeEngine();
    x.engine.settings.sceneGrouping = true;
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I walk along the harbor.');
    x.model.draft('You stroll past the boats. [B1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[B1]'), { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Harbor stroll', 'stroll past the boats', { origin: 'player' })] });
    await x.engine.runOperation('normal');
    x.host.addUser('Later I sit down.');
    x.model.draft('Two hours later you are still there. [B2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[B2]'), (i: any) => ({ scene_end: at(1, 11, 50), occurrences: [occ('o1', 'Still at the harbor', 'still there', { origin: 'player', time: { lo: { day: 1, minute: 710 }, hi: { day: 1, minute: 710 }, precision: 'minute' }, continues: i.scene_grouping?.[0]?.occurrence_id ?? null })] }));
    expect(await x.engine.runOperation('normal')).toBe(true);
    const later = [...x.engine.current!.replay.state.occurrences.values()].find((o) => o.title === 'Still at the harbor')!;
    expect(later.continues).toBeFalsy();
  });

  it('BL3 the reviewer is given the canon events whose window is open around the scene', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    x.host.addUser('I look around.');
    x.model.draft('The square is busy. [B3]');
    await x.engine.runOperation('normal');
    const input = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(input.canon_events_now.map((e: any) => e.id)).toContain('council-broadcast');
    expect(input.canon_events_now.map((e: any) => e.id)).not.toContain('conflict-begins'); // HARD contracts come separately
  });
});
