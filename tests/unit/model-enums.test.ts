import { describe, it, expect } from 'vitest';
import { callStructured } from '../../src/runtime/model';
import type { ModelPort } from '../../src/runtime/model';

const ref = (mode: string) => ({ id: 'r1', quote: '修女', phrase: '修女', ref_kind: 'person', mode, assertion: 'narrator', temporal: 'present', candidate_ids: [] });
const claim = (kind: string) => ({ id: 'c1', quote: '便利店', kind, entity_phrases: [], assertion: 'narrator', expected: null });

function port(replies: unknown[]): ModelPort & { seen: string[][] } {
  const seen: string[][] = [];
  return {
    seen,
    async runTask(_t: string, messages: { content: string }[]) { seen.push(messages.map((m) => m.content)); return JSON.stringify(replies.shift()); },
    async generateDraft() { return ''; },
  } as unknown as ModelPort & { seen: string[][] };
}

describe('structured output enum handling (real-model findings)', () => {
  it('repairs case slips and known synonyms without another model call', async () => {
    const p = port([{ references: [ref('Descriptor'), ref('DIRECT')], claims: [claim('Location')] }]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(out.references.map((r: any) => r.mode)).toEqual(['indirect', 'direct']);
    expect(out.claims[0].kind).toBe('location');
    expect(p.seen.length).toBe(1);
  });

  it('tells the model the offending value and the allowed values on retry', async () => {
    const p = port([{ references: [ref('direct')], claims: [claim('event')] }, { references: [ref('direct')], claims: [claim('state')] }]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(out.claims[0].kind).toBe('state');
    const feedback = p.seen[1][p.seen[1].length - 1];
    expect(feedback).toContain('got "event"');
    expect(feedback).toContain('allowed: state, capability, recollection, causal, location, presence, operation, time');
  });
});

import { readFileSync } from 'node:fs';
import { validatePack, claimComparable } from '../../src/domain/pack';

describe('deterministic state-claim comparison', () => {
  it('compares booleans, entity refs and closed vocabularies, but not free-text paraphrases', () => {
    const raw = JSON.parse(readFileSync('examples/demo.canon.json', 'utf8'));
    raw.predicates.push({ id: 'function', description: 'operating state', value_type: 'string' });
    raw.predicates.push({ id: 'condition', description: 'physical condition', value_type: 'string', allowed_values: ['intact', 'damaged', 'destroyed'] });
    const L = validatePack(raw).loaded!;
    expect(claimComparable(L, 'alive', false)).toBe(true);
    expect(claimComparable(L, 'victor', 'council')).toBe(true);
    expect(claimComparable(L, 'condition', 'destroyed')).toBe(true);
    expect(claimComparable(L, 'condition', 'busy')).toBe(false);
    expect(claimComparable(L, 'function', 'active')).toBe(false); // "正常运转" vs "active" is a paraphrase
    expect(claimComparable(L, 'unknown-predicate', true)).toBe(false);
  });
});

describe('nullable object slips', () => {
  it('turns a scalar in a "null or object" field into null instead of failing', async () => {
    const st = { kind: 'attempted_action', quote: '我去便利店', summary: 'goes to the store', entities: [], facts: [], event_id: null, time: '傍晚', ambiguous: false };
    const p = port([{ statements: [st], references: [], scene_entities: [] }]);
    const out = await callStructured<any>(p, 'extract_user', 'sys', {});
    expect(out.statements[0].time).toBeNull();
    expect(p.seen.length).toBe(1);
  });
});

describe('extra properties', () => {
  it('drops properties the schema does not define instead of failing', async () => {
    const c = { ...claim('state'), confidence: 0.9, reason: 'x' };
    const p = port([{ references: [ref('direct')], claims: [c] }]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(out.claims[0]).not.toHaveProperty('confidence');
    expect(p.seen.length).toBe(1);
  });
});

describe('top-level extra fields', () => {
  it('rejects unknown top-level fields (possible mutations) instead of stripping them', async () => {
    const bad = { references: [ref('direct')], claims: [claim('state')], drop_anchor: 'conflict-begins' };
    const p = port([bad, bad, bad]);
    await expect(callStructured<any>(p, 'discover', 'sys', {})).rejects.toThrow(/additional properties/);
  });
});

describe('per-call timeout', () => {
  it('times out a hung call, aborts it, and lets the next call run', async () => {
    let aborted = false;
    let calls = 0;
    const p = {
      async runTask(_t: string, _m: unknown, o: { signal?: AbortSignal }) {
        calls++;
        if (calls === 1) return new Promise<string>((_, rej) => o.signal?.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }));
        return JSON.stringify({ references: [ref('direct')], claims: [claim('state')] });
      },
      async generateDraft() { return ''; },
    } as unknown as ModelPort;
    const t0 = Date.now();
    await expect(callStructured<any>(p, 'discover', 'sys', {}, { callTimeoutMs: 80 })).rejects.toThrow(/timed out after 0s \(one call\)/);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(aborted).toBe(true);
    const ok = await callStructured<any>(p, 'discover', 'sys', {}, { callTimeoutMs: 80 });
    expect(ok.claims[0].kind).toBe('state');
  });
});
