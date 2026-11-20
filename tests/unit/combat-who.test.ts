// CW: what a player's message brings into a fight that the setting knows, though the message does not name it
// (combat/who.ts): a described person of the world, a thing of the setting at work in it.
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/domain/reducer';
import { WorldIndex } from '../../src/core/domain/world-query';
import { fightFromMessage, fightNow, identifyInFight, walkCombat, type FightOut } from '../../src/core/combat';
import type { ModelPort } from '../../src/core/runtime/model';
import type { LedgerRecord } from '../../src/core/domain/types';
import { demoRaw, load, T } from './helpers';

function port(reply: unknown): ModelPort & { seen: { task: string; input: any }[] } {
  const p = { seen: [] as { task: string; input: any }[], async runTask(task: string, msgs: { content: string }[]) {
    const c = msgs.find((m) => m.content.startsWith('INPUT'))!.content;
    p.seen.push({ task, input: JSON.parse(c.slice(c.indexOf('\n') + 1)) });
    if (reply instanceof Error) throw reply;
    return JSON.stringify(reply);
  }, async generateDraft() { return ''; } };
  return p as unknown as ModelPort & { seen: { task: string; input: any }[] };
}
const pack = () => {
  const raw = demoRaw() as any;
  raw.combat.nodes.push({ id: 'cb-gas', kind: 'ability', name: 'Tear gas canister', gist: 'A canister of tear gas that blinds and chokes everyone near it.', text: 'A canister of tear gas that blinds and chokes everyone near it.', parts: [{ part: 'effect', text: 'Blinds and chokes everyone near it.' }], source_refs: raw.combat.nodes[0].source_refs });
  raw.combat.links.push({ from: 'council', to: 'cb-gas', label: 'keeps' });
  return load(raw);
};
const TEXT = 'A woman in a medic\'s coat kneels over the wounded and stops the bleeding; then a canister of tear gas hisses open and I choke.';
const fight = (): FightOut => ({ state: 'starts', participants: ['union', 'medic woman'], new_people: [{ name: 'medic woman', description: 'a woman in a medic\'s coat', quote: 'A woman in a medic\'s coat' }], things: [{ quote: 'a canister of tear gas hisses open', what: 'a tear gas canister' }], why: 'x' });

describe('who and what the message brings into a fight', () => {
  it('CW1 a described newcomer the call names becomes that person; a thing at work joins the fight, and the walk starts from it', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f = fight();
    const p = port({ people: [{ name: 'medic woman', id: 'mira', why: 'a medic who stops bleeding' }], things: [{ id: 'cb-gas', why: 'the canister hisses open' }] });
    const notes = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen[0].task).toBe('combat_who');
    expect(p.seen[0].input.candidates.map((c: any) => c.id)).toContain('mira');
    expect(p.seen[0].input.things.some((t: string) => t.startsWith('cb-gas |'))).toBe(true);
    expect(f.participants).toEqual(['union', 'mira']);
    expect(f.new_people).toEqual([]);
    expect(notes.join(' ')).toMatch(/is Mira|is mira/i);
    const { records } = fightFromMessage(f, idx, TEXT, [], { lo: T(0, 9), hi: T(0, 9), precision: 'minute' }, null);
    expect(records[0].runtimeEntities).toBeUndefined();
    const st = reduce(L, records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'main', commitId: 'c' }) as LedgerRecord));
    const now = fightNow(st);
    expect(now.participants).toEqual(['union', 'mira']);
    expect(now.identified).toEqual([{ id: 'mira', as: 'medic woman', why: 'a medic who stops bleeding' }]);
    expect(now.things.map((t) => t.node)).toEqual(['cb-gas']);
    const w = walkCombat(L, st, ['mira', 'cb-gas'], { maxDepth: 2, fullDepth: 1, budgetChars: 10000 });
    expect(w.nodes.find((n) => n.node.id === 'cb-gas')).toMatchObject({ depth: 1, full: true });
  });

  it('CW2 an id not offered keeps the newcomer; a failed call leaves the fight as it was; nothing new: no call', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f = fight();
    const notes = await identifyInFight({ port: port({ people: [{ name: 'medic woman', id: 'council', why: '?' }], things: [{ id: 'cb-firearms' }] }), index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(f.participants).toEqual(['union', 'medic woman']);
    expect(f.new_people).toHaveLength(1);
    expect(f.nodes).toBeUndefined();
    expect(notes.join(' ')).toMatch(/not a candidate/);
    const g = fight();
    const failed = await identifyInFight({ port: port(new Error('down')), index: idx, fight: g, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(g).toEqual(fight());
    expect(failed[0]).toMatch(/not decided/);
    const none = port({ people: [] });
    expect(await identifyInFight({ port: none, index: idx, fight: { state: 'none' }, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' })).toEqual([]);
    expect(none.seen).toHaveLength(0);
  });
});
