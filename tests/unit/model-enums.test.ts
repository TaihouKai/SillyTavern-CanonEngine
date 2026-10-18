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

  it('a claim labelled kind "plan" keeps the claim as a plan instead of dropping it', async () => {
    const p = port([{ references: [], claims: [claim('plan'), claim('Intention')] }]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(out.claims.map((c: any) => [c.kind, c.assertion])).toEqual([['state', 'plan'], ['state', 'plan']]);
    expect(p.seen.length).toBe(1);
  });

  it('tells the model the offending value and the allowed values on retry', async () => {
    // (a strict list: review verdicts are checks, so a bad value is sent back rather than dropped)
    const base = { decision: 'retain', scene_end: null, transitions: [], occurrences: [], state_claims: [], player_actions: [], violations: [], hard_checks: [] };
    const cc = (verdict: string) => ({ claim_id: 'c1', verdict, record_ids: [], note: '' });
    const p = port([{ ...base, claim_checks: [cc('maybe')] }, { ...base, claim_checks: [cc('consistent')] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(out.claim_checks[0].verdict).toBe('consistent');
    const feedback = p.seen[1][p.seen[1].length - 1];
    expect(feedback).toContain('got "maybe"');
    expect(feedback).toContain('allowed: consistent, contradiction, unsupported');
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
    await expect(callStructured<any>(p, 'discover', 'sys', {}, { callTimeoutMs: 80 })).rejects.toThrow(/timed out after 0s \(one call, via /);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(aborted).toBe(true);
    const ok = await callStructured<any>(p, 'discover', 'sys', {}, { callTimeoutMs: 80 });
    expect(ok.claims[0].kind).toBe('state');
  });
});

describe('truncated replies', () => {
  it('retries a reply cut off at the length limit with a doubled budget', async () => {
    const budgets: number[] = [];
    const seen: string[][] = [];
    const full = JSON.stringify({ references: [ref('direct')], claims: [claim('state')] });
    const p = {
      async runTask(_t: string, m: { content: string }[], o: { maxTokens?: number }) {
        budgets.push(o.maxTokens || 0); seen.push(m.map((x) => x.content));
        return budgets.length === 1 ? full.slice(0, 60) : full;
      },
      async generateDraft() { return ''; },
    } as unknown as ModelPort;
    const out = await callStructured<any>(p, 'discover', 'sys', {}, { maxTokens: 5000 });
    expect(out.claims[0].kind).toBe('state');
    expect(budgets).toEqual([5000, 10000]);
    expect(seen[1][seen[1].length - 1]).toMatch(/cut off at the length limit/);
  });

  it('reports length and ending when the output never parses', async () => {
    const p = port(['not json', 'still not json', 'nope']);
    (p as any).runTask = async () => 'Sure, here you go: nothing';
    await expect(callStructured<any>(p, 'discover', 'sys', {})).rejects.toThrow(/no parseable JSON object in model output \(\d+ chars; ends with: /);
  });
});

import { TRANSIENT_DELAYS_MS } from '../../src/runtime/model';
describe('temporary provider errors', () => {
  it('waits and re-sends after a 503, without spending a parse attempt', async () => {
    const saved = TRANSIENT_DELAYS_MS.splice(0, TRANSIENT_DELAYS_MS.length, 5, 5);
    try {
      let calls = 0;
      const p = {
        async runTask() { calls++; if (calls <= 2) throw new Error('Service Unavailable'); return JSON.stringify({ references: [ref('direct')], claims: [claim('state')] }); },
        async generateDraft() { return ''; },
      } as unknown as ModelPort;
      const out = await callStructured<any>(p, 'discover', 'sys', {}, { maxAttempts: 1 });
      expect(out.claims[0].kind).toBe('state');
      expect(calls).toBe(3);
    } finally { TRANSIENT_DELAYS_MS.splice(0, TRANSIENT_DELAYS_MS.length, ...saved); }
  });

  it('gives up after the retries and says so; other errors are not retried', async () => {
    const saved = TRANSIENT_DELAYS_MS.splice(0, TRANSIENT_DELAYS_MS.length, 5, 5);
    try {
      let calls = 0;
      const p = { async runTask() { calls++; throw new Error('Service Unavailable'); }, async generateDraft() { return ''; } } as unknown as ModelPort;
      await expect(callStructured<any>(p, 'discover', 'sys', {})).rejects.toThrow(/Service Unavailable \(after 2 automatic retries\)/);
      expect(calls).toBe(3);
      let calls2 = 0;
      const q = { async runTask() { calls2++; throw new Error('Invalid API key'); }, async generateDraft() { return ''; } } as unknown as ModelPort;
      await expect(callStructured<any>(q, 'discover', 'sys', {})).rejects.toThrow(/Invalid API key$/);
      expect(calls2).toBe(1);
    } finally { TRANSIENT_DELAYS_MS.splice(0, TRANSIENT_DELAYS_MS.length, ...saved); }
  });
  it('new_entities with other field names are renamed, not failed (real-model finding)', async () => {
    const base = { decision: 'retain', scene_end: null, claim_checks: [], transitions: [], occurrences: [], state_claims: [], player_actions: [], violations: [], hard_checks: [] };
    const p = port([{ ...base, new_entities: [
      { entity_id: '茵蒂克丝', type: 'character', description: '自称茵蒂克丝的银发少女', quote: '自称茵蒂克丝' },
      { title: '禁闭室', entity_type: 'location', evidence: '禁闭室' },
      { description: 'no identity at all' },
    ] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen.length).toBe(1);
    expect(out.new_entities).toEqual([
      { ref: 'n1', name: '茵蒂克丝', kind: 'person', description: '自称茵蒂克丝的银发少女', quote: '自称茵蒂克丝' },
      { ref: 'n2', name: '禁闭室', kind: 'place', description: '', quote: '禁闭室' },
    ]);
  });
  it('a step enactment without an occurrence reference is dropped, not failed (real-model finding)', async () => {
    const base = { decision: 'retain', scene_end: null, claim_checks: [], transitions: [], occurrences: [], state_claims: [], player_actions: [], violations: [], hard_checks: [] };
    const p = port([{ ...base, step_enactments: [{ step_id: 's1', occurrence_ref: null, quote: 'x' }, { step_id: 's2', occurrence_ref: 'o1', quote: 'y' }] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen.length).toBe(1);
    expect(out.step_enactments).toEqual([{ step_id: 's2', occurrence_ref: 'o1', quote: 'y' }]);
  });
  it('a missing or null evidence quote becomes empty (the gate then ignores the item) instead of failing', async () => {
    const base = { decision: 'retain', scene_end: null, claim_checks: [], occurrences: [], violations: [], hard_checks: [] };
    const p = port([{ ...base, player_actions: [], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: null, occurrence_ref: null }], state_claims: [] }]);
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(p.seen.length).toBe(1);
    expect(out.transitions[0].quote).toBe('');
    // checks that could hide a problem are not patched: the output is sent back instead
    const q = port([{ ...base, transitions: [], state_claims: [], player_actions: [{ quote: null, authorized_by_quote: null }] }, { ...base, transitions: [], state_claims: [], player_actions: [] }]);
    await callStructured<any>(q, 'evaluate', 'sys', {});
    expect(q.seen.length).toBe(2);
  });
});
