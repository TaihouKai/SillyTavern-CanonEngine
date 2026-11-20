// N01–N06: schema-driven normalization of model output (shapes observed from real models).
import { describe, expect, it } from 'vitest';
import { callStructured } from '../../src/core/runtime/model';
import { normalizeToSchema } from '../../src/core/runtime/normalize';
import planSchema from '../../schemas/runtime/plan.schema.json';
import type { ModelPort } from '../../src/core/runtime/model';

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
  it('N07 a canonical occurrence with a broken field keeps the occurrence: the field is neutralized (real-model finding)', async () => {
    const hard = { ref: 'o1', title: 'Conflict begins', account: 'militias attack', actors: ['council'], quote: 'attack', pack_event_id: 'conflict-begins', disposition: 'occurred', time: { lo: '2020-07-20 09:00' }, origin: 'offscreen' };
    const p = port([{ ...base, occurrences: [hard], transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: 'attack', occurrence_ref: 'o1' }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.occurrences.length).toBe(1);
    expect(out.occurrences[0].pack_event_id).toBe('conflict-begins');
    expect(out.occurrences[0].time).toBeNull();
    expect(out.occurrences[0].origin).toBeUndefined();
  });

  it('N08 a canonical occurrence that cannot be fixed is sent back, never dropped', async () => {
    const hard = { ref: 'o1', title: 'Conflict begins', account: 'a', actors: 'council', quote: 'attack', pack_event_id: 'conflict-begins' };
    const p = port([{ ...base, occurrences: [{ ...hard, actors: 7 }] }, { ...base, occurrences: [{ ...hard, actors: ['council'] }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(2);
    expect(out.occurrences[0].pack_event_id).toBe('conflict-begins');
  });
  it('N09 a time without its precision keeps the time (precision "approx") instead of becoming null (live finding)', async () => {
    const t = { lo: { day: 0, minute: 720 }, hi: { day: 0, minute: 780 } };
    const p = port([{ ...base, occurrences: [{ ref: 'o1', title: 'Walk', account: 'a', actors: [], quote: 'q', time: t }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.occurrences[0].time).toEqual({ ...t, precision: 'approx' });
  });
  it('N10 a field written one level too high is moved into the one top-level object that has it (live: profile "public_identity")', async () => {
    const p = port([{ player: { name: 'S', aliases: [], summary: 'x' }, public_identity: 'a student', affiliations: [], relationships: [], knowers: [] }]);
    const out = await callStructured<any>(p, 'profile', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.player.public_identity).toBe('a student');
    expect('public_identity' in out).toBe(false);
  });

  it('N11 a remark on a field beside it is dropped; another unknown top-level field still fails the reply', async () => {
    const p = port([{ player: { name: 'S', aliases: [], summary: 'x', public_identity: 'a student' }, affiliations: [], affiliations_note: 'none found', relationships: [], knowers: [] }]);
    const out = await callStructured<any>(p, 'profile', 'sys', {});
    expect(p.seen).toBe(1);
    expect('affiliations_note' in out).toBe(false);
    const q = port([{ player: { name: 'S', aliases: [], summary: 'x', public_identity: 'a student' }, affiliations: [], relationships: [], knowers: [], drop_anchor: 'x' }, { player: { name: 'S', aliases: [], summary: 'x', public_identity: 'a student' }, affiliations: [], relationships: [], knowers: [] }]);
    await callStructured<any>(q, 'profile', 'sys', {});
    expect(q.seen).toBe(2);
  });

  it('N11b a field of the one object written beside it too, while the object has it: the copy is dropped', async () => {
    const p = port([{ player: { name: 'S', aliases: [], summary: 'x', public_identity: 'a student' }, public_identity: 'a student of Tokiwadai', affiliations: [], relationships: [], knowers: [] }]);
    const out = await callStructured<any>(p, 'profile', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.player.public_identity).toBe('a student');
    expect('public_identity' in out).toBe(false);
  });

  it('N12 a time written as minute 1440 and up is that time of the next day (live: plan steps past midnight)', () => {
    const notes: string[] = [];
    const t = { lo: { day: 76, minute: 1450 }, hi: { day: 76, minute: 2890 }, precision: 'approx' };
    const step = { step_id: 's1', actors: ['mira'], action: 'x', intended_effects: [], means: 'x', serves_anchor: null, requires_player_consent: false, earliest: t.lo, latest: t.hi };
    const out = normalizeToSchema({ steps: [step] }, planSchema as any, notes) as any;
    expect(out.steps[0].earliest).toEqual({ day: 77, minute: 10 });
    expect(out.steps[0].latest).toEqual({ day: 78, minute: 10 });
    expect(notes.join(' ')).toMatch(/minute 1450 → day 77 minute 10/);
    expect((normalizeToSchema({ steps: [{ ...step, earliest: { day: 76, minute: 600 } }] }, planSchema as any, []) as any).steps[0].earliest).toEqual({ day: 76, minute: 600 });
  });
});
