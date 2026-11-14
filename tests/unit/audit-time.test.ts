// Audit 2026-11: time and anchors — a game that starts exactly on a HARD event's deadline.
// RUNTIME_SCHEMAS.md §2: bootstrapRecords = "baseline facts + canonical history adjudicated up to the start point".
// The gate treats a HARD event whose window closes at the current minute as due (gate.ts: `c.hi <= g.clockTick`),
// the bootstrap settles only events that closed before it (schedule.ts buildBootstrap: `t.hi < startTick`).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { applyRecord, emptyState, factAt } from '../../src/core/domain/reducer';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const HARD_AT = tick(2, 9, 0); // conflict-begins (HARD), a one-minute window

describe('audit: a game that starts on a HARD deadline', () => {
  it('T1a: with a greeting in the chat (SillyTavern) → the campaign is usable after binding, as one minute earlier or later', async () => {
    const status = async (start: number) => {
      const x = makeEngine();
      await x.engine.bind(demo, { startTick: start, mode: 'new' });
      await x.engine.reconcile('t');
      x.host.addUser('I look around.');
      const ok = await x.engine.runOperation('normal');
      return { recovery: x.engine.campaign()!.recoveryState.status, turn: ok };
    };
    expect(await status(HARD_AT - 1)).toEqual({ recovery: 'ok', turn: true });
    expect(await status(HARD_AT + 1)).toEqual({ recovery: 'ok', turn: true });
    expect(await status(HARD_AT)).toEqual({ recovery: 'ok', turn: true });
  });

  it('T1b: with an empty chat (Canon Engine Play) → a first reply in which no time passes is accepted', async () => {
    const x = makeEngine();
    x.host.chat.length = 0;
    await x.engine.bind(demo, { startTick: HARD_AT, mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    expect(await x.engine.runOperation('normal')).toBe(true);
  });
});

describe('audit: a change put in at an earlier time than changes already there (S6)', () => {
  // an event told with a time window is recorded at the window's start, which can lie before changes play already made
  const rec = (seq: number, tick: number, d: any): any => ({
    recordId: `r${seq}`, commitId: 'c', branchId: 'b', sequence: seq, kind: 'world_event', storyTime: { lo: tick, hi: tick, precision: 'minute' }, sourceRefs: [],
    factsSetOrUnset: [{ entity_id: 'g', predicate: 'members', ...d }], eventOccurrenceIds: [], visibility: { mode: 'public' }, summary: '', evidenceKind: 'narrated',
  });
  const members = (s: any, tick: number) => factAt(s, 'g', 'members', { tick }).value;
  const state = (...records: any[]) => { const s = emptyState({ hash: 'h', coverage: { start: 0, end: 100 }, timeIndex: [] } as any); for (const r of records) applyRecord(s, r); return s; };

  it('S6a: someone who joined earlier is still there after a later change that was recorded first', () => {
    const s = state(rec(1, 0, { op: 'set', value: ['a'] }), rec(2, 50, { op: 'add', value: ['b'] }), rec(3, 30, { op: 'add', value: ['c'] }));
    expect(members(s, 40)).toEqual(['a', 'c']);
    expect([...(members(s, 60) as string[])].sort()).toEqual(['a', 'b', 'c']);
  });
  it('S6b: a later leaving that had nobody to remove when it was recorded removes the one put in before it', () => {
    const s = state(rec(1, 0, { op: 'set', value: ['a'] }), rec(2, 50, { op: 'remove', value: ['c'] }), rec(3, 30, { op: 'add', value: ['c'] }));
    expect(members(s, 40)).toEqual(['a', 'c']);
    expect(members(s, 60)).toEqual(['a']);
  });
  it('S6c: a later set still replaces everything before it, and changes after the set stand on it', () => {
    const s = state(rec(1, 0, { op: 'set', value: ['a'] }), rec(2, 50, { op: 'set', value: ['x'] }), rec(3, 60, { op: 'add', value: ['y'] }), rec(4, 30, { op: 'add', value: ['c'] }));
    expect(members(s, 55)).toEqual(['x']);
    expect([...(members(s, 70) as string[])].sort()).toEqual(['x', 'y']);
  });
  it('S6d: in time order nothing changes, and a change that changes nothing leaves no trace in the fact', () => {
    const s = state(rec(1, 0, { op: 'set', value: ['a'] }), rec(2, 30, { op: 'add', value: ['a'] }), rec(3, 50, { op: 'add', value: ['b'] }));
    expect(factAt(s, 'g', 'members', { tick: 40 }).supportRecordId).toBe('r1');
    expect(s.facts.get('g|members')!.map((t: any) => t.recordId)).toEqual(['r1', 'r3']);
  });
});
