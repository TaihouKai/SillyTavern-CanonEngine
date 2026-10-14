// P01-P18: deterministic pack, clock and reducer behaviour.
import { describe, expect, it } from 'vitest';
import { validatePack, validatePackText, valuesEqual, normalizeValue, WORLD_INFO_ERROR } from '../../src/domain/pack';
import { reduce, evalCondition, factAt, triLabel, applyRecord } from '../../src/domain/reducer';
import { buildBootstrap, crossedCandidates, adjudicateDefault, occurrenceWindow, hardDeadlinesReached } from '../../src/domain/schedule';
import { formatTick, toTick } from '../../src/domain/time';
import { hashObject } from '../../src/domain/util';
import type { LedgerRecord } from '../../src/domain/types';
import { demoRaw, unrelatedRaw, load, T } from './helpers';

const errs = (raw: unknown) => validatePack(raw).errors.map((e) => `${e.path} ${e.message}`).join('\n');
const boot = (L: ReturnType<typeof load>, start: number) => buildBootstrap(L, start).records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'b', commitId: 'c' }) as LedgerRecord);

describe('pack validation', () => {
  it('P01 accepts both complete samples and reports Hard count', () => {
    const r = validatePack(demoRaw());
    expect(r.ok).toBe(true);
    expect(r.loaded!.hardEvents).toEqual(['conflict-begins', 'conflict-ends']);
    expect(validatePack(unrelatedRaw()).ok).toBe(true);
  });

  it('P02 rejects SillyTavern World Info JSON, even renamed, with a specific error and no conversion', () => {
    const wi = { entries: { 0: { uid: 0, key: ['Mira'], content: 'Mira dies on day 1', comment: '' } } };
    const r = validatePackText(JSON.stringify(wi));
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toBe(WORLD_INFO_ERROR);
    expect(r.loaded).toBeUndefined();
  });

  it('P03 duplicate ids and broken references are blocked with locations', () => {
    const a = demoRaw();
    a.events.push({ ...a.events[0] });
    expect(errs(a)).toMatch(/\/events\/5\/id duplicate events id "medic-ambush"/);
    const b = demoRaw();
    b.events[0].entity_ids.push('nobody');
    expect(errs(b)).toMatch(/\/events\/0\/entity_ids\/2 unknown entity "nobody"/);
    const c = demoRaw();
    c.entities.push({ ...c.entities[0] });
    expect(errs(c)).toMatch(/duplicate entities id "planet"/);
  });

  it('P04 null Hard bounds, minute 1440, reversed interval and wrong precision are blocked', () => {
    const a = demoRaw();
    a.events[2].when = { ...a.events[2].when, earliest: null, latest: null, precision: 'unknown', basis: 'unknown' };
    expect(validatePack(a).ok).toBe(false);
    const b = demoRaw();
    b.events[2].when.earliest = { day: 2, minute: 1440 };
    expect(validatePack(b).ok).toBe(false);
    const c = demoRaw();
    c.events[0].when = { ...c.events[0].when, precision: 'range', earliest: { day: 1, minute: 700 }, latest: { day: 1, minute: 600 } };
    expect(errs(c)).toMatch(/reversed interval/);
    const d = demoRaw();
    d.events[0].when = { ...d.events[0].when, precision: 'day' };
    expect(errs(d)).toMatch(/day precision/);
  });

  it('P05 wrong predicate type or invalid entity reference blocks import', () => {
    const a = demoRaw();
    a.initial_state.facts[1].fact.value = 'yes';
    expect(errs(a)).toMatch(/expects boolean/);
    const b = demoRaw();
    b.events[4].outcomes[1].value = 'nobody';
    b.events[4].canonical_effects[1] = { op: 'set', fact: { entity_id: 'conflict', predicate: 'victor', value: 'nobody' } };
    expect(errs(b)).toMatch(/unknown entity "nobody"/);
  });

  it('P08 related-edge cycle accepted; P09 precedence cycle / impossible ordering blocked', () => {
    const a = demoRaw();
    a.edges.push({ id: 'r1', from: 'conflict-ends', to: 'medic-ambush', relation: 'related', basis: 'editorial', source_refs: ['example-source'], note: 'association' });
    a.edges.push({ id: 'r2', from: 'medic-ambush', to: 'conflict-ends', relation: 'motivates', basis: 'editorial', source_refs: ['example-source'], note: 'association' });
    expect(validatePack(a).ok).toBe(true);
    const b = demoRaw();
    b.edges.push({ id: 'p1', from: 'conflict-ends', to: 'conflict-begins', relation: 'precedes', basis: 'editorial', source_refs: ['example-source'], note: 'bad' });
    expect(errs(b)).toMatch(/precedence cycle|temporally impossible/);
  });

  it('P10 contradictory baseline values block import (no last-entry-wins)', () => {
    const a = demoRaw();
    a.initial_state.facts.push({ fact: { entity_id: 'mira', predicate: 'alive', value: false }, source_refs: ['example-source'], note: '' });
    expect(errs(a)).toMatch(/more than one value for mira\|alive/);
  });

  it('P11 entity-set equality and pack hash ignore array order', () => {
    expect(valuesEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(normalizeValue(['z', 'a'])).toEqual(['a', 'z']);
    const a = demoRaw();
    a.predicates.push({ id: 'members', description: 'm', value_type: 'entity_set' });
    a.initial_state.facts.push({ fact: { entity_id: 'union', predicate: 'members', value: ['mira', 'council'] }, source_refs: ['example-source'], note: '' });
    const b = JSON.parse(JSON.stringify(a));
    b.initial_state.facts[b.initial_state.facts.length - 1].fact.value = ['council', 'mira'];
    expect(load(a).hash).toBe(load(b).hash);
  });

  it('missing Hard effect / incorrect arc membership / event outside coverage are blocked', () => {
    const a = demoRaw();
    a.events[4].canonical_effects = [a.events[4].canonical_effects[0]];
    expect(errs(a)).toMatch(/no matching final canonical set effect/);
    const b = demoRaw();
    b.arcs[0].event_ids.pop();
    expect(errs(b)).toMatch(/does not list event "conflict-ends"/);
    const c = demoRaw();
    c.events[3].when = { ...c.events[3].when, earliest: { day: 9, minute: 0 }, latest: { day: 9, minute: 0 } };
    expect(errs(c)).toMatch(/within coverage/);
  });

  it('two HARD events with incompatible outcomes at the same checkpoint are a data error', () => {
    const a = demoRaw();
    const extra = JSON.parse(JSON.stringify(a.events[4]));
    extra.id = 'conflict-ends-council';
    extra.title = 'Council victory';
    extra.outcomes[1].value = 'council';
    extra.canonical_effects[1].fact.value = 'council';
    extra.required_description = 'The conflict ends with the Council victorious.';
    a.events.push(extra);
    a.arcs[0].event_ids.push(extra.id);
    expect(errs(a)).toMatch(/incompatible values for conflict\.victor/);
  });
});

describe('clock, conditions, reducer', () => {
  it('P06 NOT of an absent predicate equality is UNKNOWN', () => {
    const L = load(demoRaw());
    const s = reduce(L, boot(L, T(0, 8)));
    expect(triLabel(evalCondition({ not: { fact: { entity_id: 'mira', predicate: 'victor', value: 'union' } } }, s, L, { tick: T(0, 9) }))).toBe('UNKNOWN');
    expect(triLabel(evalCondition({ all: [] }, s, L, { tick: 0 }))).toBe('TRUE');
  });

  it('P07 reordering event/entity arrays gives identical chronology and reducer results', () => {
    const a = load(demoRaw());
    const raw = demoRaw();
    raw.events.reverse();
    raw.entities.reverse();
    const b = load(raw);
    expect(b.timeIndex.map((t) => t.id)).toEqual(a.timeIndex.map((t) => t.id));
    const sa = reduce(a, boot(a, T(3, 0)));
    const sb = reduce(b, boot(b, T(3, 0)));
    expect([...sa.dispositions.keys()].sort()).toEqual([...sb.dispositions.keys()].sort());
    expect(factAt(sa, 'conflict', 'active').value).toBe(factAt(sb, 'conflict', 'active').value);
  });

  it('P12 a day-only HARD event may occur during its day but not remain pending beyond it', () => {
    const raw = demoRaw();
    raw.events[2].when = { ...raw.events[2].when, precision: 'day', earliest: { day: 2, minute: 0 }, latest: { day: 2, minute: 1439 } };
    const L = load(raw);
    const s = reduce(L, boot(L, T(0, 8)));
    expect(hardDeadlinesReached(L, s, T(2, 12)).map((c) => c.event.id)).not.toContain('conflict-begins');
    expect(hardDeadlinesReached(L, s, T(3, 0)).map((c) => c.event.id)).toContain('conflict-begins');
  });

  it('P13 a long timeskip collects every crossed obligation in chronological order', () => {
    const L = load(demoRaw());
    const s = reduce(L, boot(L, T(0, 8)));
    const c = crossedCandidates(L, s, T(0, 8), T(5, 0)).map((x) => x.event.id);
    expect(c).toEqual(['medic-ambush', 'council-broadcast', 'conflict-begins', 'harbor-festival', 'conflict-ends']);
    expect(hardDeadlinesReached(L, s, T(5, 0)).map((x) => x.event.id)).toEqual(['conflict-begins', 'conflict-ends']);
  });

  it('P14 story time never uses the host clock/timezone', () => {
    const before = formatTick(T(2, 9), { y: 2020, m: 7, d: 1 });
    const realTz = process.env.TZ;
    process.env.TZ = 'Pacific/Kiritimati';
    expect(formatTick(T(2, 9), { y: 2020, m: 7, d: 1 })).toBe(before);
    process.env.TZ = realTz;
    expect(before).toBe('2020-07-03 09:00 (D2)');
    expect(toTick({ day: -1, minute: 30 })).toBe(-1410);
  });

  it('P15 a fluent change after a fulfilled HARD occurrence does not unfulfil it', () => {
    const L = load(demoRaw());
    const s = reduce(L, boot(L, T(2, 10)));
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    applyRecord(s, { recordId: 'r-x', commitId: 'c', branchId: 'b', sequence: 999, kind: 'world_event', storyTime: { lo: T(2, 11), hi: T(2, 11), precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: false }], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: 'ceasefire', evidenceKind: 'direct' });
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(factAt(s, 'conflict', 'active').value).toBe(false);
    expect(factAt(s, 'conflict', 'active').supportRecordId).toBe('r-x');
  });

  it('P16 re-applying the same record is idempotent', () => {
    const L = load(demoRaw());
    const recs = boot(L, T(1, 11));
    const s = reduce(L, [...recs, ...recs]);
    expect(s.records.length).toBe(recs.length);
    expect([...s.occurrences.values()].filter((o) => o.packEventId === 'medic-ambush').length).toBe(1);
  });

  it('P17 starting outside coverage is refused; P18 unknown-time events are never scheduled', () => {
    const raw = demoRaw();
    raw.events.push({ ...JSON.parse(JSON.stringify(raw.events[3])), id: 'old-legend', title: 'Old legend', classification: 'FREE', arc_id: null, when: { earliest: null, latest: null, precision: 'unknown', label: '?', basis: 'unknown', notes: '' } });
    const L = load(raw);
    expect(L.unknownTimeEvents).toContain('old-legend');
    const s = reduce(L, boot(L, T(0, 8)));
    expect(crossedCandidates(L, s, -1e9, 1e9).map((c) => c.event.id)).not.toContain('old-legend');
    expect(triLabel(evalCondition({ occurred: 'old-legend' }, s, L, { tick: T(5, 0) }))).toBe('FALSE');
  });

  it('C01 untouched history: default adjudication applies original applicable events (FREE included)', () => {
    const L = load(demoRaw());
    const s = reduce(L, boot(L, T(5, 0)));
    for (const id of ['medic-ambush', 'council-broadcast', 'conflict-begins', 'harbor-festival', 'conflict-ends']) expect(s.dispositions.get(id)?.disposition).toBe('occurred');
    expect(factAt(s, 'conflict', 'victor').value).toBe('union');
    expect(factAt(s, 'mira', 'alive').value).toBe(false);
  });

  it('C02 a validated rescue keeps Mira alive and the ambush is not re-run later', () => {
    const L = load(demoRaw());
    const s = reduce(L, boot(L, T(0, 9)));
    applyRecord(s, { recordId: 'resc', commitId: 'c1', branchId: 'b', sequence: 100, kind: 'canon_occurrence', storyTime: { lo: T(1, 10), hi: T(1, 10), precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true }], eventOccurrenceIds: ['o1'], occurrences: [{ occurrenceId: 'o1', title: 'Ambush of Mira', account: 'The player shields Mira; she survives.', actors: ['mira'], affected: ['mira'], locations: ['harbor'], time: { lo: T(1, 10), hi: T(1, 10), precision: 'minute' }, outcome: [], causes: [], refPhrases: ['ambush'], packEventId: 'medic-ambush', origin: 'player', visibility: { mode: 'public', knower_ids: [] } }], visibility: { mode: 'public', knower_ids: [] }, summary: 'rescue', evidenceKind: 'direct', packEventId: 'medic-ambush', disposition: 'diverged' });
    expect(crossedCandidates(L, s, T(1, 10), T(5, 0)).map((c) => c.event.id)).not.toContain('medic-ambush');
    // broadcast's original precondition (ambush occurred) is now FALSE -> SOFT omitted with reason
    const c = crossedCandidates(L, s, T(1, 10), T(5, 0)).find((x) => x.event.id === 'council-broadcast')!;
    const p = adjudicateDefault(L, s, c, occurrenceWindow(c, T(1, 10), T(5, 0)));
    expect(p.record?.disposition).toBe('omitted');
    expect(p.record?.dispositionReason).toMatch(/occurred\(medic-ambush\) is FALSE/);
    // HARD conflict-begins now needs model adjudication (never omitted)
    applyRecord(s, { ...p.record!, sequence: 101, branchId: 'b', commitId: 'c2' });
    const h = crossedCandidates(L, s, T(1, 12), T(5, 0)).find((x) => x.event.id === 'conflict-begins')!;
    expect(adjudicateDefault(L, s, h, occurrenceWindow(h, T(1, 12), T(5, 0))).mode).toBe('needs_model');
    expect(factAt(s, 'mira', 'alive').value).toBe(true);
  });

  it('bootstrap marks events inside the start interval as pending', () => {
    const L = load(demoRaw());
    const b = buildBootstrap(L, T(1, 10));
    expect(b.pending).toContain('medic-ambush');
    expect(hashObject(1)).toHaveLength(64);
  });
});
