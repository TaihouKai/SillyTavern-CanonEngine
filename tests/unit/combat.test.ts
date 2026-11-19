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
