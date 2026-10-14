// Runtime model-response schemas/fixtures and package-validation parity (22 rejected variants).
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as V from '../../src/generated/validators.js';
import { validatePack } from '../../src/domain/pack';
import { extractJson } from '../../src/runtime/model';
import { demoRaw, ROOT } from './helpers';

describe('model response schemas', () => {
  const dir = join(ROOT, 'tests', 'fixtures', 'model');
  for (const f of readdirSync(dir)) {
    it(`fixture ${f}`, () => {
      const task = f.split('.')[0];
      const data = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      expect((V as Record<string, (d: unknown) => boolean>)[task](data)).toBe(f.includes('.valid.'));
    });
  }
  it('JSON extraction tolerates fences/prose but never evaluates code', () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('prefix {"a":{"b":"}"}} suffix')).toEqual({ a: { b: '}' } });
    expect(() => extractJson('function(){ return 1 }')).toThrow();
  });
});

describe('package validation parity: 22 deliberately invalid variants are rejected', () => {
  const variants: [string, (p: any) => void][] = [
    ['World Info shape', (p) => { for (const k of Object.keys(p)) delete p[k]; p.entries = { 0: { uid: 0, key: ['x'], content: 'y' } }; }],
    ['Unsupported schema version', (p) => { p.schema_version = '2.0.0'; }],
    ['Undeclared root field', (p) => { p.extra = 1; }],
    ['Hard downgrade subtype', (p) => { p.events[2].hard_subtype = 'start'; }],
    ['Hard description absent', (p) => { p.events[2].required_description = null; }],
    ['Hard outcomes empty', (p) => { p.events[2].outcomes = []; }],
    ['Hard unknown time', (p) => { p.events[2].when = { ...p.events[2].when, earliest: null, latest: null, precision: 'unknown', basis: 'unknown' }; }],
    ['Minute overflow', (p) => { p.events[0].when.earliest.minute = 1440; }],
    ['Null fact value', (p) => { p.initial_state.facts[0].fact.value = null; }],
    ['Script condition', (p) => { p.events[0].canonical_preconditions = { script: 'return true' }; }],
    ['Empty any condition', (p) => { p.events[0].canonical_preconditions = { any: [] }; }],
    ['Soft hidden hard contract', (p) => { p.events[1].required_description = 'must happen'; }],
    ['Broken entity reference', (p) => { p.events[0].entity_ids.push('ghost'); }],
    ['Duplicate event ID', (p) => { p.events.push({ ...p.events[0] }); }],
    ['Reversed time bounds', (p) => { p.events[0].when = { ...p.events[0].when, precision: 'range', earliest: { day: 1, minute: 700 }, latest: { day: 1, minute: 600 } }; }],
    ['Incorrect day precision', (p) => { p.events[0].when.precision = 'day'; }],
    ['Wrong predicate value type', (p) => { p.initial_state.facts[0].fact.value = 3; }],
    ['Conflicting baseline fact', (p) => { p.initial_state.facts.push({ fact: { entity_id: 'mira', predicate: 'alive', value: false }, source_refs: ['example-source'], note: '' }); }],
    ['Missing Hard effect', (p) => { p.events[2].canonical_effects = []; }],
    ['Precedence cycle', (p) => { p.edges.push({ id: 'cyc', from: 'conflict-ends', to: 'conflict-begins', relation: 'precedes', basis: 'editorial', source_refs: ['example-source'], note: 'cycle' }); }],
    ['Incorrect arc membership', (p) => { p.arcs[0].event_ids = p.arcs[0].event_ids.filter((x: string) => x !== 'harbor-festival'); }],
    ['Event outside coverage', (p) => { p.events[3].when = { ...p.events[3].when, earliest: { day: 7, minute: 0 }, latest: { day: 7, minute: 0 } }; }],
  ];
  for (const [name, mutate] of variants) {
    it(name, () => {
      const p = demoRaw();
      mutate(p);
      expect(validatePack(p).ok).toBe(false);
    });
  }
  it('accepted variants: day-precision Hard, unknown-time non-Hard, related-edge cycle', () => {
    const p = demoRaw() as any;
    p.events[2].when = { ...p.events[2].when, precision: 'day', earliest: { day: 2, minute: 0 }, latest: { day: 2, minute: 1439 } };
    p.events.push({ ...JSON.parse(JSON.stringify(p.events[3])), id: 'legend', title: 'Legend', classification: 'FREE', arc_id: null, when: { earliest: null, latest: null, precision: 'unknown', label: '?', basis: 'unknown', notes: '' } });
    p.edges.push({ id: 'r1', from: 'conflict-ends', to: 'medic-ambush', relation: 'related', basis: 'editorial', source_refs: ['example-source'], note: 'n' }, { id: 'r2', from: 'medic-ambush', to: 'conflict-ends', relation: 'related', basis: 'editorial', source_refs: ['example-source'], note: 'n' });
    expect(validatePack(p).ok).toBe(true);
  });
});
