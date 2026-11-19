import { describe, expect, it } from 'vitest';
import { validatePack } from '../../src/core/domain/pack';
import { demoRaw, unrelatedRaw } from './helpers';

const msgs = (raw: unknown) => { const r = validatePack(raw); return { ok: r.ok, errors: r.errors.map((e) => `${e.path} ${e.message}`), warnings: r.warnings.map((e) => `${e.path} ${e.message}`) }; };

describe('combat section of a pack', () => {
  it('CB1 the example packs: combat with nodes, or none with its reason; neither is an error', () => {
    const d = msgs(demoRaw());
    expect(d.ok).toBe(true);
    expect(d.warnings.filter((w) => /combat/.test(w))).toEqual([]);
    expect(msgs(unrelatedRaw()).ok).toBe(true);
    const r = validatePack(demoRaw());
    expect(r.loaded!.combat.none).toBe(null);
    expect(r.loaded!.combat.nodes.get('cb-emergency-care')?.kind).toBe('ability');
    expect(r.loaded!.combat.linksFrom.get('mira')?.map((l) => l.to)).toEqual(['cb-ordinary', 'cb-emergency-care']);
    expect(r.loaded!.combat.precedentsOf.get('mira')).toEqual(['cb-ambush']);
  });

  it('CB2 a pack without the section, or with none and nodes, or with no reason, is refused', () => {
    const p = demoRaw() as any; delete p.combat;
    expect(msgs(p).errors.join('\n')).toMatch(/required property 'combat'/);
    const q = demoRaw() as any; q.combat.none = 'nobody fights';
    expect(msgs(q).errors.join('\n')).toMatch(/combat.none gives no basis/);
    const r = unrelatedRaw() as any; r.combat.none = ' ';
    expect(msgs(r).errors.join('\n')).toMatch(/gives the reason/);
  });

  it('CB3 nodes and links that do not hold together are refused', () => {
    const p = demoRaw() as any;
    p.combat.nodes.push({ id: 'mira', kind: 'concept', name: 'x', gist: 'x', text: 'x', source_refs: ['example-source'] });
    p.combat.nodes.push({ id: 'cb-bad-ability', kind: 'ability', name: 'x', gist: 'x', text: 'x', parts: [{ part: 'cost', text: 'x' }], source_refs: [] });
    p.combat.nodes.push({ id: 'cb-bad-rule', kind: 'rule', name: 'x', gist: 'x', text: 'x', who: ['mira'], source_refs: ['nowhere'] });
    p.combat.links.push({ from: 'cb-firearms', to: 'cb-ordinary', label: 'x', from_event: 'medic-ambush' }, { from: 'mira', to: 'harbor', label: 'x' }, { from: 'ghost', to: 'cb-ordinary', label: 'x' });
    const e = msgs(p).errors.join('\n');
    expect(e).toMatch(/"mira" is also an entity id/);
    expect(e).toMatch(/an ability says what it does/);
    expect(e).toMatch(/says where it comes from/);
    expect(e).toMatch(/who and event_id are for precedents/);
    expect(e).toMatch(/unknown source "nowhere"/);
    expect(e).toMatch(/links between nodes are the setting/);
    expect(e).toMatch(/"harbor" is an entity: a link goes to a node/);
    expect(e).toMatch(/unknown entity or node "ghost"/);
  });

  it('CB4 every person has 对抗倾向; a node nobody reaches and a person linked to nothing are warnings', () => {
    const p = demoRaw() as any;
    p.entities.push({ id: 'tomas', name: 'Tomas', aliases: [], kind: 'person', static_description: 'A docker.', source_refs: ['example-source'] });
    p.combat.nodes.push({ id: 'cb-lonely', kind: 'rule', name: 'x', gist: 'x', text: 'x', generated: true, source_refs: [] });
    const m = msgs(p);
    expect(m.errors.join('\n')).toMatch(/entities\/\d+\/combat_style every person has 对抗倾向/);
    expect(m.warnings.join('\n')).toMatch(/no entity reaches "cb-lonely"/);
    p.entities[p.entities.length - 1].combat_style = [{ from_event: 'medic-ambush', start: 'a', force: 'a', response: 'a', limit: 'a', stop: 'a' }];
    const n = msgs(p);
    expect(n.errors.join('\n')).toMatch(/the first version holds at the story start/);
    expect(n.warnings.join('\n')).toMatch(/"tomas" links to no combat node/);
  });
});

import { reduce } from '../../src/core/domain/reducer';
import { fightNow, knowsNode, linksOf, statusesOf, styleOf, walkCombat } from '../../src/core/combat';
import type { LedgerRecord } from '../../src/core/domain/types';
import { load, T } from './helpers';

let seq = 0;
const rec = (tick: number, extra: Partial<LedgerRecord>): LedgerRecord => ({
  recordId: `r${++seq}`, commitId: 'c', branchId: 'main', sequence: seq, kind: 'combat', storyTime: { lo: tick, hi: tick, precision: 'minute' },
  sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: '', evidenceKind: 'direct', ...extra,
});

describe('combat as this game has it', () => {
  it('CS1 links: the pack\'s, changed by play and the panel; what was filled in never stands against them', () => {
    const L = load(demoRaw());
    const st = reduce(L, [
      rec(T(0, 9), { combatLinks: [{ entity: 'mira', node: 'cb-emergency-care', label: 'has', removed: true, source: 'play', quote: 'her hands were broken' }] }),
      rec(T(0, 9), { combatLinks: [{ entity: 'mira', node: 'cb-emergency-care', label: 'has', source: 'fill' }, { entity: 'mira', node: 'cb-soldier', label: 'is', source: 'fill' }] }),
    ]);
    expect(linksOf(L, st, 'mira').map((l) => `${l.node}:${l.source}`)).toEqual(['cb-ordinary:pack', 'cb-soldier:fill']);
    const st2 = reduce(L, [rec(T(0, 9), { combatLinks: [{ entity: 'mira', node: 'cb-ordinary', label: 'is', removed: true, source: 'fill' }] })]);
    expect(linksOf(L, st2, 'mira').map((l) => l.node)).toContain('cb-ordinary');
  });

  it('CS2 states: the same text replaces, removed takes away, minutes and events end them; a state can bring a node', () => {
    const L = load(demoRaw());
    const st = reduce(L, [
      rec(T(0, 9), { statuses: [{ entity: 'mira', text: '流血', until: { minutes: 30 }, source: 'play' }, { entity: 'mira', text: 'Rifle', node: 'cb-firearms', source: 'play' }, { entity: 'mira', text: 'Bandages', count: 3, source: 'play' }] }),
      rec(T(0, 9, 5), { statuses: [{ entity: 'mira', text: 'bandages', count: 2, source: 'play' }] }),
    ]);
    const now = (t: number) => statusesOf(st, 'mira', t).map((s) => `${s.text}${s.count ? '×' + s.count : ''}`).sort();
    expect(now(T(0, 9, 10))).toEqual(['Rifle', 'bandages×2', '流血']);
    expect(now(T(0, 9, 40))).toEqual(['Rifle', 'bandages×2']);
    expect(linksOf(L, st, 'mira', T(0, 9, 10)).map((l) => l.node)).toContain('cb-firearms');
    const st2 = reduce(L, [...st.records, rec(T(0, 10), { statuses: [{ entity: 'mira', text: 'Rifle', removed: true, source: 'ui' }] })]);
    expect(statusesOf(st2, 'mira', T(0, 10)).map((s) => s.text)).toEqual(['bandages']);
  });

  it('CS3 对抗倾向: the panel over the pack over what was filled in; the fight is the latest change', () => {
    const L = load(demoRaw());
    const s = { start: 'x', force: 'x', response: 'x', limit: 'x', stop: 'x' };
    expect(styleOf(L, reduce(L, [rec(T(0, 9), { styles: [{ entity: 'mira', style: s, source: 'fill' }] })]), 'mira')!.source).toBe('pack');
    expect(styleOf(L, reduce(L, [rec(T(0, 9), { styles: [{ entity: 'mira', style: s, source: 'ui' }] })]), 'mira')!.style.start).toBe('x');
    expect(styleOf(L, reduce(L, []), 'nobody')).toBe(null);
    const st = reduce(L, [rec(T(0, 9), { fight: { ongoing: true, participants: ['mira', 'council'], source: 'player' } }), rec(T(0, 9, 3), { fight: { ongoing: false, participants: [], source: 'engine' } }), rec(T(0, 9, 3), { fight: { ongoing: true, participants: ['mira', 'council'], source: 'ui' } })]);
    expect(fightNow(st)).toMatchObject({ ongoing: true, participants: ['mira', 'council'], source: 'ui' });
  });

  it('CS4 who knows a hidden ability: its holder, the named knowers, and whoever saw it used', () => {
    const raw = demoRaw() as any;
    raw.combat.nodes.find((n: any) => n.id === 'cb-emergency-care').parts.find((p: any) => p.part === 'limits').visibility = { mode: 'secret', knower_ids: [] };
    const L = load(raw);
    const st = reduce(L, []);
    expect(knowsNode(L, st, 'council', 'cb-emergency-care', 'effect')).toBe(true);
    expect(knowsNode(L, st, 'council', 'cb-emergency-care', 'limits')).toBe(false);
    expect(knowsNode(L, st, 'mira', 'cb-emergency-care', 'limits')).toBe(true);
    const seen = reduce(L, [rec(T(0, 9), { witnessed: [{ node: 'cb-emergency-care', part: 'limits', who: ['council'] }] })]);
    expect(knowsNode(L, seen, 'council', 'cb-emergency-care', 'limits')).toBe(true);
  });

  it('CS5 the walk: from the fighters outward, never into another entity; near nodes whole, far ones as gist; the budget cuts the furthest', () => {
    const L = load(demoRaw());
    const st = reduce(L, []);
    const w = walkCombat(L, st, ['mira', 'union'], { maxDepth: 3, fullDepth: 1, budgetChars: 10000 });
    expect(w.nodes.map((n) => `${n.node.id}@${n.depth}${n.full ? '' : '~'}`)).toEqual(['cb-ambush@1', 'cb-emergency-care@1', 'cb-ordinary@1', 'cb-soldier@1', 'cb-firearms@2~']);
    expect(walkCombat(L, st, ['mira'], { maxDepth: 1, fullDepth: 1, budgetChars: 10000 }).nodes.map((n) => n.node.id)).not.toContain('cb-firearms');
    const tight = walkCombat(L, st, ['mira', 'union'], { maxDepth: 3, fullDepth: 1, budgetChars: 400 });
    expect(tight.cut.length).toBeGreaterThan(0);
    expect(tight.cut).toContain('cb-firearms');
  });
});
