// N01–N06: schema-driven normalization of model output (shapes observed from real models).
import { describe, expect, it } from 'vitest';
import { callStructured } from '../../src/runtime/model';
import type { ModelPort } from '../../src/runtime/model';

function port(replies: unknown[]): ModelPort & { seen: number } {
  const p = { seen: 0, async runTask() { p.seen++; return JSON.stringify(replies.shift() ?? {}); }, async generateDraft() { return ''; } };
  return p as unknown as ModelPort & { seen: number };
}
const base = { decision: 'retain', scene_end: null, claim_checks: [], transitions: [], occurrences: [], state_claims: [], player_actions: [], violations: [], hard_checks: [] };

describe('schema-driven normalization', () => {
  it('N01 the real deepseek-v4-pro shape: invented item fields, enacts instead of step_id, objects in scene_entities', async () => {
    const p = port([{ ...base, flashback: null,
      new_entities: [{ id: 'stranger', type: 'character', name: 'Stranger', quote: 'a stranger' }],
      step_enactments: [{ enacts: 's1', quote: 'x' }],
      scene_entities: [{ id: 'harbor', name: 'Harbor' }, 'mira'],
    }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.flashback).toBe(false);
    expect(out.new_entities).toEqual([{ name: 'Stranger', kind: 'person', quote: 'a stranger', ref: 'n1', description: '' }]);
    expect(out.step_enactments).toEqual([]);
    expect(out.scene_entities).toEqual(['harbor', 'mira']);
  });

  it('N02 optional data the model left out is filled with neutral values', async () => {
    const p = port([{ decision: 'retain', claim_checks: [], state_claims: [], player_actions: [], violations: [], hard_checks: [],
      occurrences: [{ ref: 'o1', title: 'Walk', account: 'walked', actors: [], quote: 'walk' }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.transitions).toEqual([]);
    expect(out.scene_end).toBeNull();
    expect(out.occurrences[0].title).toBe('Walk');
  });

  it('N03 a record item without its identity is dropped; the rest is kept', async () => {
    const p = port([{ ...base, occurrences: [{ ref: 'o1', account: 'no title', actors: [], quote: 'q' }, { ref: 'o2', title: 'Kept', account: 'a', actors: [], quote: 'q' }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(out.occurrences.map((o: any) => o.title)).toEqual(['Kept']);
  });

  it('N04 what decides a check is never invented: a player action without its quote is sent back', async () => {
    const p = port([{ ...base, player_actions: [{ authorized_by_quote: null }] }, { ...base }]);
    await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(2);
    const q = port([{ ...base, hard_checks: [{ event_id: 'conflict-begins', occurrence_ref: null, quote: null }] }, { ...base }]);
    await callStructured<any>(q, 'evaluate', 'sys', {});
    expect(q.seen).toBe(2); // missing HARD status
    const r = port([{ ...base, violations: undefined }, { ...base }]);
    await callStructured<any>(r, 'evaluate', 'sys', {});
    expect(r.seen).toBe(2); // the violations list itself is never assumed empty
  });

  it('N05 an unknown top-level field still rejects the whole reply (possible mutation)', async () => {
    const p = port([{ ...base, drop_anchor: 'conflict-begins' }, { ...base, drop_anchor: 'conflict-begins' }, { ...base, drop_anchor: 'conflict-begins' }]);
    await expect(callStructured<any>(p, 'evaluate', 'sys', {})).rejects.toThrow(/additional properties|drop_anchor/);
  });

  it('N06 oversized lists are trimmed to the schema limit', async () => {
    const refs = Array.from({ length: 205 }, (_, i) => ({ id: `r${i}`, quote: 'q', phrase: `p${i}`, ref_kind: 'place', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: [] }));
    const p = port([{ references: refs, claims: [] }]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(out.references.length).toBe(200);
  });
});
