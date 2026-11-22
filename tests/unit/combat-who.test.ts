// CW: what a player's message brings into a fight that the setting knows, though the message does not name it
// (combat/who.ts): a described person of the world, a thing of the setting at work in it.
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/domain/reducer';
import { WorldIndex } from '../../src/core/domain/world-query';
import { fightFromMessage, fightNow, identifyInFight, walkCombat, type FightOut } from '../../src/core/combat';
import { whoCandidates } from '../../src/core/combat/who';
import { ordinary } from './helpers';
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
  raw.entities.find((e: any) => e.id === 'council').aspects.setting.push({ node: 'cb-gas', label: 'keeps' });
  return load(raw);
};
const TEXT = 'A woman in a medic\'s coat kneels over the wounded and stops the bleeding; then a canister of tear gas hisses open and I choke.';
const fight = (): FightOut => ({ state: 'starts', participants: ['union', 'medic woman'], new_people: [{ name: 'medic woman', description: 'a woman in a medic\'s coat', quote: 'A woman in a medic\'s coat' }], things: [{ quote: 'a canister of tear gas hisses open', what: 'a tear gas canister' }], why: 'x' });

describe('who and what the message brings into a fight', () => {
  it('CW1 a described newcomer the call names becomes that person; a thing at work joins the fight, and the walk starts from it', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f = fight();
    const p = port({ people: [{ name: 'medic woman', id: 'mira', why: 'a medic who stops bleeding' }], things: [{ seen: 1, id: 'cb-gas', why: 'the canister hisses open' }] });
    const { notes, names } = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen[0].task).toBe('combat_who');
    expect(p.seen[0].input.candidates.map((c: any) => c.id)).toContain('mira');
    expect(p.seen[0].input.things.some((t: string) => t.startsWith('cb-gas |'))).toBe(true);
    expect(f.participants).toEqual(['union', 'mira']);
    expect(f.new_people).toEqual([]);
    expect(notes.join(' ')).toMatch(/is Mira|is mira/i);
    expect(names).toEqual([{ words: 'medic woman', id: 'mira', quote: "A woman in a medic's coat", source: 'fight', why: 'a medic who stops bleeding' }]);
    const { records } = fightFromMessage(f, idx, TEXT, [], { lo: T(0, 9), hi: T(0, 9), precision: 'minute' }, null, names);
    expect(records[0].runtimeEntities).toBeUndefined();
    const st = reduce(L, records.map((r, i) => ({ ...r, sequence: i + 1, branchId: 'main', commitId: 'c' }) as LedgerRecord));
    const now = fightNow(st);
    expect(now.participants).toEqual(['union', 'mira']);
    expect(now.things.map((t) => t.node)).toEqual(['cb-gas']);
    const w = walkCombat(L, st, ['mira', 'cb-gas'], { maxDepth: 2, fullDepth: 1, budgetChars: 10000 });
    expect(w.nodes.find((n) => n.node.id === 'cb-gas')).toMatchObject({ depth: 1, full: true });
  });

  it('CW1c what the newcomer just identified has comes with them, not as a thing of its own', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f = fight();
    f.things = [...f.things!, { quote: 'stops the bleeding', what: 'emergency care' }];
    const p = port({ people: [{ name: 'medic woman', id: 'mira', why: 'a medic' }], things: [{ seen: 1, id: 'cb-gas' }, { seen: 2, id: 'cb-emergency-care' }] });
    const { notes } = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen[0].input.things.some((t: string) => t.startsWith('cb-emergency-care |'))).toBe(true);
    expect(f.nodes!.map((n) => n.node)).toEqual(['cb-gas']);
    expect(notes.join(' ')).toMatch(/Emergency care comes with Mira/);
  });

  it('CW1d a newcomer the reading already resolved is that person: once in the fight, never matched again', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const known = [{ words: 'A woman in a medic coat', quote: 'A woman in a medic coat kneels', id: 'mira', source: 'player' as const }];
    const f = fight(); f.things = [];
    const p = port({ people: [{ name: 'medic woman', id: 'mira' }] });
    const { notes, names } = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't', known: [{ ...known[0], words: 'medic woman' }] });
    expect(p.seen).toHaveLength(0);
    expect(f.participants).toEqual(['union', 'mira']);
    expect(f.new_people).toEqual([]);
    expect(names).toMatchObject([{ id: 'mira', words: 'medic woman', source: 'fight', why: 'the message refers to them' }]);
    expect(notes.join(' ')).toMatch(/"medic woman" is Mira \(the message refers to them\)/);
    // already a fighter by id: the newcomer is dropped, not matched to someone else
    const g = fight(); g.things = []; g.participants = ['union', 'mira', 'medic woman'];
    const again = await identifyInFight({ port: p, index: idx, fight: g, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't', known: [{ ...known[0], words: 'medic woman' }] });
    expect(g.participants).toEqual(['union', 'mira']);
    expect(again.names).toEqual([]);
    expect(p.seen).toHaveLength(0);
  });

  it('CW1b everyone new_people brings in fights, however participants calls them', () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const text = 'Seven or eight men with pipes and pistols step out and surround me; I set the leader gun alight.';
    const { records, warnings } = fightFromMessage({ state: 'starts', participants: ['union', 'the gang'], new_people: [{ name: 'gang leader', description: 'leads the ambush', quote: 'the leader gun' }], why: 'x' }, idx, text, [], { lo: T(0, 9), hi: T(0, 9), precision: 'minute' }, null);
    expect(records).toHaveLength(1);
    expect(records[0].runtimeEntities!.map((e) => e.name)).toEqual(['gang leader']);
    expect((records[0] as any).fight.participants).toEqual(['union', records[0].runtimeEntities![0].id]);
    expect(warnings.join(' ')).toMatch(/"the gang" is nobody known/);
  });

  it('CW2 an id not offered keeps the newcomer; a failed call leaves the fight as it was; nothing new: no call', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f = fight();
    const { notes } = await identifyInFight({ port: port({ people: [{ name: 'medic woman', id: 'council', why: '?' }], things: [{ seen: 1, id: 'cb-firearms' }] }), index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(f.participants).toEqual(['union', 'medic woman']);
    expect(f.new_people).toHaveLength(1);
    expect(f.nodes).toBeUndefined();
    expect(notes.join(' ')).toMatch(/not a candidate/);
    // a seen thing answered null (a fighter's own power, nothing that fits) joins nothing
    const h = fight();
    const nul = port({ people: [], things: [{ seen: 1, id: null, why: 'her own power' }] });
    expect(await identifyInFight({ port: nul, index: idx, fight: h, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' })).toEqual({ notes: [], names: [] });
    expect(h.nodes).toBeUndefined();
    expect(nul.seen[0].input.seen).toEqual([{ n: 1, words: 'a canister of tear gas hisses open', what: 'a tear gas canister' }]);
    const g = fight();
    const failed = await identifyInFight({ port: port(new Error('down')), index: idx, fight: g, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(g).toEqual(fight());
    expect(failed.notes[0]).toMatch(/not decided/);
    const none = port({ people: [] });
    expect(await identifyInFight({ port: none, index: idx, fight: { state: 'none' }, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' })).toEqual({ notes: [], names: [] });
    expect(none.seen).toHaveLength(0);
  });

  it("CW3 each newcomer gets their best candidates in turn (live: a thief's eight filled the list and the twin-tailed girl's best, 白井黑子, was never offered)", () => {
    const raw = demoRaw() as any;
    const person = (id: string, text: string) => ({ id, name: id, aliases: [], kind: 'person', static_description: text, source_refs: raw.entities.find((e: any) => e.id === 'mira').source_refs });
    for (let i = 0; i < 8; i++) raw.entities.push(person(`near${i}`, 'a sailor of the harbor'));
    for (let i = 0; i < 10; i++) raw.entities.push(person(`thief${i}`, `a pickpocket thief who robs bags with a knife number ${i}`));
    raw.entities.push(person('twintail', 'a twin-tailed girl of the guard who teleports out of thin air and kicks'));
    const L = load(ordinary(raw));
    const idx = new WorldIndex(L, reduce(L, []));
    const got = whoCandidates(idx, ['a thief robs a bag with a knife', 'a twin-tailed girl teleports out of thin air and kicks'], [], Array.from({ length: 8 }, (_, i) => `near${i}`));
    expect(got).toContain('twintail');
    expect(got.filter((x) => x.startsWith('thief')).length).toBeGreaterThanOrEqual(4);
    expect(got.slice(0, 8)).toEqual(Array.from({ length: 8 }, (_, i) => `near${i}`));
  });

  it('CW4 a newcomer whose words have an organization in them is a person, not the organization (live: 「扎着双马尾的风纪委员少女」 fought as 风纪委员)', async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const text = 'A guard of the Council steps in and blocks my blow.';
    const f: FightOut = { state: 'starts', participants: ['union', 'a guard of the Council'], new_people: [{ name: 'a guard of the Council', description: 'a guard', quote: 'A guard of the Council steps in' }], why: 'x' };
    const p = port({ people: [] });
    await identifyInFight({ port: p, index: idx, fight: f, text, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen.map((x) => x.task)).toEqual(['combat_who']);
    const { records } = fightFromMessage(f, idx, text, [], { lo: T(0, 9), hi: T(0, 9), precision: 'minute' }, null);
    const fighters = (records[0] as any).fight.participants as string[];
    expect(fighters).not.toContain('council');
    expect(records[0].runtimeEntities!.map((e) => e.name)).toEqual(['a guard of the Council']);
  });

  it("CW5 outside a fight the message's described people are told apart too, and nothing is asked about things at work", async () => {
    const L = pack();
    const idx = new WorldIndex(L, reduce(L, []));
    const f: FightOut = { state: 'none', new_people: [{ name: 'medic woman', description: "a woman in a medic's coat", quote: "A woman in a medic's coat" }], things: [{ quote: 'a canister of tear gas hisses open', what: 'tear gas' }] };
    const p = port({ people: [{ name: 'medic woman', id: 'mira', why: 'a medic' }] });
    const { names } = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen[0].input.seen).toBeUndefined();
    expect(names).toMatchObject([{ words: 'medic woman', id: 'mira', source: 'player' }]);
    const none = port({ people: [] });
    expect(await identifyInFight({ port: none, index: idx, fight: { state: 'none' }, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' })).toEqual({ notes: [], names: [] });
    expect(none.seen).toHaveLength(0);
  });

  it("CW6 someone the story brought in earlier is a candidate for the message's words (live: the reply's 「寸头混混」 was not offered for 「那个寸头」, taken for someone of the setting)", async () => {
    const L = pack();
    const st = reduce(L, [{ recordId: 'r1', commitId: 'c', branchId: 'main', sequence: 1, kind: 'world_event', storyTime: { lo: T(0, 9), hi: T(0, 9), precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: '', evidenceKind: 'direct', runtimeEntities: [{ id: 'rt.crewcut.abc123', name: 'crew-cut thug', aliases: [], kind: 'person', description: 'a thug with a crew cut and a tool bag' }] } as LedgerRecord]);
    const idx = new WorldIndex(L, st);
    const f: FightOut = { state: 'none', new_people: [{ name: 'the crew-cut one', description: 'the crew-cut one', quote: 'the crew-cut one' }] };
    const p = port({ people: [{ name: 'the crew-cut one', id: 'rt.crewcut.abc123', why: 'the thug from before' }] });
    const { names, notes } = await identifyInFight({ port: p, index: idx, fight: f, text: 'I ignore the crew-cut one.', timeLabel: 'D0 09:00', lore: [], near: ['rt.crewcut.abc123'], operationId: 't' });
    expect(p.seen[0].input.candidates[0]).toMatchObject({ id: 'rt.crewcut.abc123', name: 'crew-cut thug', introduced: 'earlier in this story' });
    expect(names).toMatchObject([{ words: 'the crew-cut one', id: 'rt.crewcut.abc123' }]);
    expect(notes.join(' ')).toMatch(/is crew-cut thug/);
  });

  it('CW7 a pack without combat tells the people a message describes apart too', async () => {
    const raw = demoRaw() as any;
    raw.combat = { none: 'a quiet story' };
    for (const e of raw.entities) if (e.aspects) { delete e.aspects.combat_style; delete e.aspects.abilities; delete e.aspects.setting; delete e.aspects.fighting; }
    const L = load(raw);
    const idx = new WorldIndex(L, reduce(L, []));
    const f: FightOut = { state: 'none', new_people: [{ name: 'medic woman', description: "a woman in a medic's coat", quote: "A woman in a medic's coat" }] };
    const p = port({ people: [{ name: 'medic woman', id: 'mira', why: 'a medic' }] });
    const { names } = await identifyInFight({ port: p, index: idx, fight: f, text: TEXT, timeLabel: 'D0 09:00', lore: [], near: [], operationId: 't' });
    expect(p.seen[0].input.candidates.map((c: any) => c.id)).toContain('mira');
    expect(names).toMatchObject([{ words: 'medic woman', id: 'mira', source: 'player' }]);
  });
});
