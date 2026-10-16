// F01-F04: "强制完成" (the player forces a canon event to complete); U01-U02: GM context of where other characters stand.
import { describe, expect, it } from 'vitest';
import { factAt, reduce } from '../../src/domain/reducer';
import { buildBootstrap, forcedCompletion, situationOf, upcomingRoute } from '../../src/domain/schedule';
import type { LedgerRecord } from '../../src/domain/types';
import { buildPacket, retrieve } from '../../src/runtime/context';
import { replay } from '../../src/runtime/replay';
import { WorldIndex } from '../../src/domain/world-query';
import { demoRaw, load, T } from './helpers';

function setup(start = T(2, 23)) {
  const L = load(demoRaw());
  const boot = buildBootstrap(L, start).records;
  const recs = boot.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'b', commitId: 'c' }) as LedgerRecord);
  return { L, boot, s: reduce(L, recs) };
}

describe('force complete', () => {
  it('F01 a future event is completed now: occurred, effects apply from now, clock unchanged', () => {
    const { L, s } = setup();
    const now = s.clock.lo;
    const rec = forcedCompletion(L, s, 'harbor-festival', now);
    expect(rec.disposition).toBe('occurred');
    expect(rec.storyTime.lo).toBe(now);
    const s2 = reduce(L, [...s.records, { ...rec, sequence: 999, branchId: 'b', commitId: 'manual' } as LedgerRecord]);
    expect(s2.dispositions.get('harbor-festival')?.disposition).toBe('occurred');
    expect(s2.clock.lo).toBe(now);
    const eff = L.events.get("harbor-festival")!.canonical_effects[0] as any;
    expect(factAt(s2, eff.fact.entity_id, eff.fact.predicate, { tick: now }).known).toBe(true);
  });

  it('F02 it replaces an earlier disposition (e.g. omitted)', () => {
    const { L, s } = setup();
    const omit = { recordId: 'r-omit', kind: 'canon_disposition', storyTime: { lo: s.clock.lo, hi: s.clock.lo, precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: '', evidenceKind: 'adjudication', packEventId: 'harbor-festival', disposition: 'omitted', sequence: 900, branchId: 'b', commitId: 'x' } as unknown as LedgerRecord;
    const s1 = reduce(L, [...s.records, omit]);
    const rec = forcedCompletion(L, s1, 'harbor-festival', s1.clock.lo);
    const s2 = reduce(L, [...s1.records, { ...rec, sequence: 901, branchId: 'b', commitId: 'manual' } as LedgerRecord]);
    expect(s2.dispositions.get('harbor-festival')?.disposition).toBe('occurred');
  });

  it('F03 replay applies a manual record after its anchor message, or at the end when the message is gone', () => {
    const { L, boot, s } = setup();
    const rec = forcedCompletion(L, s, 'harbor-festival', s.clock.lo);
    const none = replay({ pack: L, branchId: 'b', bootstrap: boot, entries: [], store: {}, manual: [{ afterMessageId: 'gone', record: rec, at: 0 }] });
    expect(none.state.dispositions.get('harbor-festival')?.disposition).toBe('occurred');
    const root = replay({ pack: L, branchId: 'b', bootstrap: boot, entries: [], store: {}, manual: [{ afterMessageId: null, record: rec, at: 0 }] });
    expect(root.state.dispositions.get('harbor-festival')?.disposition).toBe('occurred');
  });

  it('F04 a HARD event forced to complete carries its required outcomes', () => {
    const { L, s } = setup(T(1, 13));
    const rec = forcedCompletion(L, s, 'conflict-begins', s.clock.lo);
    for (const o of L.events.get('conflict-begins')!.outcomes) expect(rec.factsSetOrUnset).toContainEqual(expect.objectContaining({ entity_id: o.entity_id, predicate: o.predicate }));
  });
});

describe('where other characters stand', () => {
  it('U01 the situation part of a summary is its 起因', () => {
    expect(situationOf('起因：美琴明早才发现妹妹没回来。经过：她四处寻找。结果：找到了。')).toBe('美琴明早才发现妹妹没回来。');
    expect(situationOf('A storm hits. Everyone hides.')).toBe('A storm hits.');
  });

  it('U02 upcoming non-HARD events of the next day are given to the GM as background, not as obligations', () => {
    const { L, s } = setup(T(3, 1));
    expect(upcomingRoute(L, s, T(3, 1), 24 * 60).map((u) => u.event.id)).toContain('harbor-festival');
    const index = new WorldIndex(L, s);
    const retrieval = retrieve(index, { refs: [], claims: [], sceneEntityIds: [], causalSeedEntityIds: [], freeText: [], checkpointTick: T(3, 1) });
    const p = buildPacket({ pack: L, index, retrieval, checkpointTick: T(3, 1), origin: null, sceneLabel: '', playerScope: [], plan: null, forced: false, stagedNotes: [], opportunities: [], budgetChars: 60000, horizon: 0 } as any);
    expect(p.text).toMatch(/WHERE OTHER CHARACTERS STAND[\s\S]*NOT what must happen[\s\S]*Do not steer/);
    expect(p.text).toMatch(/WHERE OTHER CHARACTERS STAND[^]*?\n- [^\n]*(Harbor|festival)/i);
  });
});
