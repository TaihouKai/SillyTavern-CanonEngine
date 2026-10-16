// W01-W02: a canon event with a long window (e.g. a whole day) is not settled offscreen the moment its window opens.
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/domain/reducer';
import { buildBootstrap } from '../../src/domain/schedule';
import type { LedgerRecord } from '../../src/domain/types';
import { adjudicateInterval } from '../../src/runtime/adjudicator';
import { buildPacket, retrieve } from '../../src/runtime/context';
import { WorldIndex } from '../../src/domain/world-query';
import { demoRaw, load, T } from './helpers';

function setup() {
  const raw = demoRaw() as any;
  const fest = raw.events.find((e: any) => e.id === 'harbor-festival');
  fest.when = { ...fest.when, earliest: { day: 3, minute: 0 }, latest: { day: 3, minute: 1439 }, precision: 'day' };
  // keep it independent of earlier HARD events so the default adjudication is deterministic
  fest.canonical_preconditions = { all: [] };
  const L = load(raw);
  const recs = buildBootstrap(L, T(2, 23)).records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'b', commitId: 'c' }) as LedgerRecord);
  return { L, s: reduce(L, recs) };
}
const adj = (L: any, s: any, from: number, to: number) => adjudicateInterval({ pack: L, state: s, fromExclusive: from, toInclusive: to, exclude: new Set(['conflict-begins', 'conflict-ends']), port: null, plan: null, forcedAllowed: false, operationId: 't', facts: '' });

describe('event windows', () => {
  it('W01 a whole-day event stays pending while its day is still running', async () => {
    const { L, s } = setup();
    const r = await adj(L, s, T(2, 23), T(3, 7, 37));
    expect(r.records.map((x) => x.packEventId)).not.toContain('harbor-festival');
  });

  it('W02 it is settled once its window has passed, anywhere within the window', async () => {
    const { L, s } = setup();
    const r = await adj(L, s, T(3, 7, 37), T(4, 8));
    const rec = r.records.find((x) => x.packEventId === 'harbor-festival')!;
    expect(rec).toBeTruthy();
    expect(rec.storyTime.lo).toBe(T(3, 0));
    expect(rec.storyTime.hi).toBe(T(3, 23, 59));
  });

  it('W03 the GM is told which canon events are within their window but not happened yet', () => {
    const { L, s } = setup();
    const index = new WorldIndex(L, s);
    const retrieval = retrieve(index, { refs: [], claims: [], sceneEntityIds: [], causalSeedEntityIds: [], freeText: [], checkpointTick: T(3, 7, 37) });
    const p = buildPacket({ pack: L, index, retrieval, checkpointTick: T(3, 7, 37), origin: null, sceneLabel: '', playerScope: [], plan: null, forced: false, stagedNotes: [], opportunities: [], budgetChars: 60000, horizon: 0 } as any);
    expect(p.text).toMatch(/CANON EVENTS WITHIN THEIR WINDOW[\s\S]*Harbor|CANON EVENTS WITHIN THEIR WINDOW[\s\S]*festival/i);
  });

  it('W04 an event in its window whose preconditions already failed is not suggested to the GM', () => {
    const raw = demoRaw() as any;
    const fest = raw.events.find((e: any) => e.id === 'harbor-festival');
    fest.when = { ...fest.when, earliest: { day: 3, minute: 0 }, latest: { day: 3, minute: 1439 }, precision: 'day' };
    fest.canonical_preconditions = { fact: { entity_id: 'mira', predicate: 'alive', value: true } }; // Mira died in the ambush (backstory)
    const L = load(raw);
    const recs = buildBootstrap(L, T(2, 23)).records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'b', commitId: 'c' }) as LedgerRecord);
    const s = reduce(L, recs);
    const index = new WorldIndex(L, s);
    const retrieval = retrieve(index, { refs: [], claims: [], sceneEntityIds: [], causalSeedEntityIds: [], freeText: [], checkpointTick: T(3, 7, 37) });
    const p = buildPacket({ pack: L, index, retrieval, checkpointTick: T(3, 7, 37), origin: null, sceneLabel: '', playerScope: [], plan: null, forced: false, stagedNotes: [], opportunities: [], budgetChars: 60000, horizon: 0 } as any);
    expect(p.text).not.toMatch(/CANON EVENTS WITHIN THEIR WINDOW[\s\S]*festival/i);
  });
});
