// PA1-PA2: a SOFT event whose people were recently involved in actual play is judged by the model from that play,
// not recorded along its original route automatically.
import { describe, expect, it } from 'vitest';
import { reduce, applyRecord } from '../../src/domain/reducer';
import { buildBootstrap } from '../../src/domain/schedule';
import type { LedgerRecord } from '../../src/domain/types';
import { adjudicateInterval } from '../../src/runtime/adjudicator';
import { demoRaw, load, T } from './helpers';

function setup(withPlay: boolean) {
  const raw = demoRaw() as any;
  const fest = raw.events.find((e: any) => e.id === 'harbor-festival');
  fest.when = { ...fest.when, earliest: { day: 3, minute: 600 }, latest: { day: 3, minute: 720 }, precision: 'range' };
  fest.canonical_preconditions = { all: [] };
  fest.entity_ids = ['harbor', 'mira'];
  const L = load(raw);
  const s = reduce(L, buildBootstrap(L, T(2, 23)).records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'b', commitId: 'c' }) as LedgerRecord));
  if (withPlay) applyRecord(s, { recordId: 'p1', commitId: 'c1', branchId: 'b', sequence: 500, kind: 'actual_occurrence', storyTime: { lo: T(3, 8), hi: T(3, 8), precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: ['po1'], occurrences: [{ occurrenceId: 'po1', title: 'Mira leaves town', account: 'Mira tells the player she is leaving before the festival.', actors: ['mira'], affected: ['mira'], locations: [], time: { lo: T(3, 8), hi: T(3, 8), precision: 'minute' }, outcome: [], causes: [], refPhrases: [], origin: 'gm', visibility: { mode: 'public', knower_ids: [] } }], visibility: { mode: 'public', knower_ids: [] }, summary: 'play', evidenceKind: 'direct' } as any);
  const inputs: any[] = [];
  const port = {
    runTask: async (_t: string, msgs: any[]) => {
      const input = JSON.parse(msgs[msgs.length - 1].content.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, '$1'));
      inputs.push(input);
      return JSON.stringify({ adjudications: [{ event_id: 'harbor-festival', decision: 'diverged', time: null, account: 'The festival goes on without Mira.', actors: [], causes: [], effects: [], plan_step_ids: [], reason: 'Mira left', extraordinary: false }] });
    },
    generateDraft: async () => '',
  };
  return { L, s, port, inputs };
}
const run = (x: ReturnType<typeof setup>) => adjudicateInterval({ pack: x.L, state: x.s, fromExclusive: T(3, 8), toInclusive: T(3, 13), exclude: new Set(['conflict-begins', 'conflict-ends']), port: x.port as any, plan: null, forcedAllowed: false, operationId: 't', facts: '' });

describe('settling an event after actual play involved its people', () => {
  it('PA1 the model judges it from actual play', async () => {
    const x = setup(true);
    const r = await run(x);
    expect(x.inputs.length).toBe(1);
    expect(JSON.stringify(x.inputs[0])).toMatch(/Mira leaves town/);
    expect(r.records.find((rec) => rec.packEventId === 'harbor-festival')?.disposition).toBe('diverged');
  });

  it('PA2 without such play it follows the original route with no model call', async () => {
    const x = setup(false);
    const r = await run(x);
    expect(x.inputs.length).toBe(0);
    expect(r.records.find((rec) => rec.packEventId === 'harbor-festival')?.disposition).toBe('occurred');
  });
});
