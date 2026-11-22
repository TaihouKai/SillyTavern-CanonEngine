// NM: 称呼 — whom the words of the story mean (domain/names.ts, WorldIndex.whoIs). Each step that reads the story writes
// down whom it found words to mean; every step looks words up through the same table.
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/domain/reducer';
import { WorldIndex } from '../../src/core/domain/world-query';
import { SCENE_GAP, bindingFrom } from '../../src/core/domain/names';
import type { CanonPack, LedgerRecord, NameBinding } from '../../src/core/domain/types';
import { makeEngine, tick, at } from './fake';
import { demoRaw, load, ordinary, T } from './helpers';

let seq = 0;
const rec = (t: number, extra: Partial<LedgerRecord>): LedgerRecord => ({
  recordId: `r${++seq}`, commitId: 'c', branchId: 'main', sequence: seq, kind: 'naming', storyTime: { lo: t, hi: t, precision: 'minute' },
  sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: '', evidenceKind: 'direct', ...extra,
});
const bind = (words: string, id: string, source: NameBinding['source'] = 'player', removed = false): NameBinding => ({ words, id, quote: words, source, ...(removed ? { removed: true } : {}) });
const clock = (t: number) => rec(t, { kind: 'time_advance' });
const PLAYER = 'rt.player.ash-quill.abc123';
const seed = () => rec(T(0, 8), { kind: 'persona_seed', runtimeEntities: [{ id: PLAYER, name: 'Ash Quill', aliases: ['Ash'], kind: 'person', description: 'The player character.' }] });

/** The demo pack with a pilot who shares the player character's short name. */
function withPilot(): CanonPack {
  const p = demoRaw();
  p.entities.push({ id: 'ash-varn', name: 'Ash Varn', aliases: ['Ash'], kind: 'person', static_description: 'An old harbor pilot.', source_refs: ['example-source'] });
  return ordinary(p);
}

describe('称呼: the table', () => {
  it('NM1 words mean whom the text last used them for; the same one again keeps them; they are over SCENE_GAP minutes after the last use', () => {
    const L = load(withPilot());
    const at9 = [seed(), clock(T(0, 9)), rec(T(0, 9), { names: [bind('the blond thug', 'mira')] })];
    const idx = (recs: LedgerRecord[]) => new WorldIndex(L, reduce(L, recs));
    expect(idx(at9).whoIs('the blond thug')).toEqual(['mira']);
    expect(idx(at9).whoIs('The Blond-Thug')).toEqual(['mira']);
    const later = [...at9, rec(T(0, 9, 30), { names: [bind('the blond thug', 'ash-varn')] }), rec(T(0, 10), { names: [bind('the blond thug', 'ash-varn')] })];
    expect(idx(later).whoIs('the blond thug')).toEqual(['ash-varn']);
    expect(idx([...later, clock(T(0, 10) + SCENE_GAP)]).whoIs('the blond thug')).toEqual(['ash-varn']);
    expect(idx([...later, clock(T(0, 10) + SCENE_GAP + 1)]).whoIs('the blond thug')).toEqual([]);
    expect(idx([...later, clock(T(0, 10) + SCENE_GAP + 1)]).namesNow()).toEqual([]);
  });

  it('NM2 the player\'s word stands over the text and holds until taken back; words the player said are not someone never mean them from the text', () => {
    const L = load(withPilot());
    const idx = (recs: LedgerRecord[]) => new WorldIndex(L, reduce(L, recs));
    const ui = [seed(), clock(T(0, 9)), rec(T(0, 9), { names: [bind('the doc', 'mira', 'ui')] }), rec(T(0, 9, 5), { names: [bind('the doc', 'ash-varn')] }), clock(T(3, 9))];
    expect(idx(ui).whoIs('the doc')).toEqual(['mira']);
    expect(idx(ui).whoIs('the doc', { extra: [bind('the doc', 'ash-varn')] })).toEqual(['mira']);
    expect(idx(ui).namesNow()).toMatchObject([{ words: 'the doc', id: 'mira', source: 'ui' }]);
    const no = [seed(), clock(T(0, 9)), rec(T(0, 9), { names: [bind('the woman', 'mira', 'ui', true)] }), rec(T(0, 9, 5), { names: [bind('the woman', 'mira')] })];
    expect(idx(no).whoIs('the woman')).toEqual([]);
    expect(idx(no).namesDenied()).toMatchObject([{ words: 'the woman', id: 'mira' }]);
    expect(idx(no).nameDenied('The Woman', 'mira')).toBe(true);
    // the same words for someone else are fine; the player giving them back clears it
    expect(idx([...no, rec(T(0, 9, 6), { names: [bind('the woman', 'ash-varn')] })]).whoIs('the woman')).toEqual(['ash-varn']);
    expect(idx([...no, rec(T(0, 9, 6), { names: [bind('the woman', 'mira', 'ui')] })]).whoIs('the woman')).toEqual(['mira']);
    // denied words are never someone by name either (the player said 「Mira」 is not her here)
    expect(idx([seed(), rec(T(0, 9), { names: [bind('Mira', 'mira', 'ui', true)] })]).whoIs('Mira')).toEqual([]);
  });

  it('NM3 a binding says something: no pronoun, no one-letter words, the quote kept', () => {
    expect(bindingFrom('her', 'mira', 'her', 'player')).toBeNull();
    expect(bindingFrom('他', 'mira', '他', 'player')).toBeNull();
    expect(bindingFrom('对方', 'mira', '对方', 'player')).toBeNull();
    for (const w of ['那家伙', '这位先生', '那个女人', 'that guy', 'The woman']) expect(bindingFrom(w, 'mira', w, 'reply')).toBeNull();
    expect(bindingFrom('那个金发女人', 'mira', 'x', 'reply')).not.toBeNull();
    expect(bindingFrom('金发混混', 'mira', '一个金发混混', 'fight', 'x')).toEqual({ words: '金发混混', id: 'mira', quote: '一个金发混混', source: 'fight', why: 'x' });
  });
});

describe('称呼: whom words mean (whoIs)', () => {
  const L = load(withPilot());
  const st = reduce(L, [seed(), clock(T(0, 9)), rec(T(0, 9), { names: [bind('the blond thug', 'mira')] })]);
  const idx = new WorldIndex(L, st);

  it('NM4 an id is itself (a runtime id cut short too); this turn\'s own words first, then the table, then names', () => {
    expect(idx.playerId).toBe(PLAYER);
    expect(idx.whoIs('mira')).toEqual(['mira']);
    expect(idx.whoIs('rt.player.ash-quill')).toEqual([PLAYER]);
    expect(idx.whoIs('the medic', { extra: [bind('the medic', 'mira')] })).toEqual(['mira']);
    expect(idx.whoIs('the blond thug', { extra: [bind('the blond thug', 'ash-varn')] })).toEqual(['ash-varn']);
    expect(idx.whoIs('Doctor Mira')).toEqual(['mira']);
    expect(idx.whoIs("the Doctor Mira's clinic")).toEqual(['mira']);
    expect(idx.whoIs("the Doctor Mira's clinic", { exact: true })).toEqual([]);
    expect(idx.whoIs('Mira', { kind: 'place' })).toEqual([]);
    expect(idx.whoOne('nobody at all')).toBeNull();
  });

  it('NM5 a name the player character shares is the player character, unless the text names the other by a name of their own', () => {
    expect(idx.whoIs('Ash')).toEqual([PLAYER]);
    expect(idx.whoIs('Ash', { text: 'Ash looks at the hook in her hand.' })).toEqual([PLAYER]);
    expect(idx.whoIs('Ash', { text: 'Ash Varn nods; Ash looks at the hook.' }).sort()).toEqual(['ash-varn', PLAYER].sort());
    expect(idx.whoIs('Ash Varn')).toEqual(['ash-varn']);
    // an id a model gave for words of the text is read like the name only when asked (readIds)
    expect(idx.whoIs('ash-varn', { text: 'Ash looks at the hook.' })).toEqual(['ash-varn']);
    expect(idx.whoIs('ash-varn', { text: 'Ash looks at the hook.', readIds: true })).toEqual([PLAYER]);
    expect(idx.whoIs('ash-varn', { text: 'Old Varn looks at the hook.', readIds: true })).toEqual(['ash-varn']);
    // the player said 「Ash」 here is not the player character: then it is the pilot
    const no = new WorldIndex(L, reduce(L, [...st.records, rec(T(0, 9, 1), { names: [bind('Ash', PLAYER, 'ui', true)] })]));
    expect(no.whoIs('Ash')).toEqual(['ash-varn']);
  });

  it('NM6 a scan finds the words of the table, and a shared name as the player character', () => {
    const found = idx.scanEntities('Ash waves at the blond thug by the pier.');
    expect(found.map((f) => f.id).sort()).toEqual(['mira', PLAYER].sort());
    expect(idx.scanEntities('Ash Varn waves.').map((f) => f.id)).toContain('ash-varn');
  });
});

// ---- the steps that read the story write down what they found, and look words up through it -----------------------

const PERSONA = 'Ash, a dock worker.';
const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: 'works the piers' }, affiliations: [], places: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
async function game(raw: CanonPack = ordinary(demoRaw()), start = tick(1, 9, 0)) {
  const y = makeEngine();
  (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
  y.model.on('profile', null, PROFILE);
  await y.engine.bind(JSON.stringify(raw), { startTick: start, mode: 'new' });
  await y.engine.reconcile('test');
  return y;
}

describe('称呼 in play', () => {
  it('NM7 the reading of the player\'s message writes down the words it found for someone (not a name of theirs, not a pronoun); the reply\'s newcomer by those words is that one; the next reading is told', async () => {
    const y = await game();
    const msg = 'I wave to the woman with the bag; Mira waves back and I nod to her.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { references: [
      { phrase: 'the woman with the bag', quote: 'the woman with the bag', kind: 'entity', mode: 'indirect', candidates: ['mira'] },
      { phrase: 'Mira', quote: 'Mira waves back', kind: 'entity', mode: 'direct', candidates: ['mira'] },
      { phrase: 'her', quote: 'nod to her', kind: 'entity', mode: 'pronoun', candidates: ['mira'] },
      { phrase: 'the latter', quote: 'I wave', kind: 'entity', mode: 'pronoun', candidates: ['mira'] },
    ] }, true);
    y.model.draft('The woman with the bag smiles. [NM7]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM7]'), { scene_end: at(1, 9, 5), new_entities: [{ ref: 'n1', name: 'the woman with the bag', kind: 'person', description: 'carries a bag', quote: 'The woman with the bag smiles' }] });
    expect(await y.engine.runOperation('normal')).toBe(true);
    const idx = y.engine.current!.index;
    expect(idx.namesNow().map((n) => [n.words, n.id, n.source])).toEqual([['the woman with the bag', 'mira', 'player']]);
    expect([...idx.state.runtimeEntities.values()].map((e) => e.name)).not.toContain('the woman with the bag');
    expect(y.engine.namesView()!.now[0]).toMatchObject({ words: 'the woman with the bag', name: 'Mira', source: 'player', quote: 'the woman with the bag' });
    const m2 = 'I follow her.';
    y.host.addUser(m2);
    y.model.draft('The harbor is calm. [NM7b]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM7b]'), { scene_end: at(1, 9, 10) });
    await y.engine.runOperation('normal');
    const read = y.model.tasks('extract_user').find((c) => c.input.message === m2)!;
    expect(read.input.registry.names).toEqual(['「the woman with the bag」 = mira | Mira']);
  });

  it('NM8 the reading of the reply writes its words down with the reply; a newcomer the review says is someone known is that one under those words; words unused for hours are over', async () => {
    const y = await game();
    y.host.addUser('I look around.');
    y.model.draft('The medic in grey waves; the tall stranger nods. [NM8]');
    y.model.on('discover', (i) => String(i.text).includes('[NM8]'), { references: [{ id: 'r1', quote: 'The medic in grey', phrase: 'the medic in grey', ref_kind: 'person', mode: 'indirect', assertion: 'narrator', temporal: 'present', candidate_ids: ['mira'] }], claims: [] });
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM8]'), { scene_end: at(1, 9, 5), new_entities: [{ ref: 'n1', name: 'the tall stranger', kind: 'person', description: 'tall', quote: 'the tall stranger nods', same_as: 'mira' }] });
    expect(await y.engine.runOperation('normal')).toBe(true);
    expect(y.engine.current!.index.namesNow().map((n) => [n.words, n.id, n.source]).sort()).toEqual([['the medic in grey', 'mira', 'reply'], ['the tall stranger', 'mira', 'reply']]);
    // four hours on, nobody used the words: a newcomer by them is someone new
    y.host.addUser('I wait until the afternoon.');
    y.model.draft('Hours pass. The medic in grey is back, a different one. [NM8b]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM8b]'), { scene_end: at(1, 13, 30), new_entities: [{ ref: 'n1', name: 'the medic in grey', kind: 'person', description: 'another medic', quote: 'The medic in grey is back' }] });
    expect(await y.engine.runOperation('normal')).toBe(true);
    expect([...y.engine.current!.replay.state.runtimeEntities.values()].map((e) => e.name)).toContain('the medic in grey');
  });

  it('NM9 the panel: words that mean someone from now on, words that are not someone, taken back; an unknown name is nobody', async () => {
    const y = await game();
    y.host.addUser('I look around.');
    y.model.draft('Quiet. [NM9]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM9]'), { scene_end: at(1, 9, 5) });
    await y.engine.runOperation('normal');
    expect(await y.engine.editNames({ add: { words: 'the old doctor', who: 'Doctor Mira' } })).toBe(true);
    expect(y.engine.current!.index.whoIs('the old doctor')).toEqual(['mira']);
    const v = y.engine.namesView()!;
    expect(v.now).toMatchObject([{ words: 'the old doctor', name: 'Mira', source: 'ui', until: null }]);
    expect(v.people).toContain('Mira');
    expect(await y.engine.editNames({ add: { words: 'x', who: 'Nobody Here' } })).toBe(false);
    expect(await y.engine.editNames({ deny: { words: 'the old doctor', id: 'mira' } })).toBe(true);
    expect(y.engine.current!.index.whoIs('the old doctor')).toEqual([]);
    const denied = y.engine.namesView()!.denied;
    expect(denied).toMatchObject([{ words: 'the old doctor', name: 'Mira' }]);
    expect(await y.engine.editNames({ undo: denied[0].recordId })).toBe(true);
    expect(y.engine.current!.index.whoIs('the old doctor')).toEqual(['mira']);
    expect(await y.engine.editNames({ undo: y.engine.namesView()!.now[0].recordId })).toBe(true);
    expect(y.engine.current!.index.whoIs('the old doctor')).toEqual([]);
    expect(await y.engine.editNames({ undo: 'rec-nothing' })).toBe(false);
  });

  it('NM10 what a message\'s reading wrote is gone with the message as it was (an edit reads it again)', async () => {
    const y = await game();
    const msg = 'I wave to the woman with the bag.';
    const m = y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { references: [{ phrase: 'the woman with the bag', quote: 'the woman with the bag', kind: 'entity', mode: 'indirect', candidates: ['mira'] }] });
    y.model.draft('She waves. [NM10]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM10]'), { scene_end: at(1, 9, 5) });
    await y.engine.runOperation('normal');
    expect(y.engine.current!.index.whoIs('the woman with the bag')).toEqual(['mira']);
    y.host.edit(y.host.chat.indexOf(m as never), 'I wave to the harbor.');
    await y.engine.reconcile('edit');
    expect(y.engine.current!.index.whoIs('the woman with the bag')).toEqual([]);
  });

  it('NM11 a message that skips time is read at that time: words for someone unused since are over by then; what it writes holds from then', async () => {
    const play = async (skip: boolean) => {
      const y = await game();
      const m1 = 'I wave to the woman with the bag.';
      y.host.addUser(m1);
      y.model.on('extract_user', (i) => i.message === m1, { references: [{ phrase: 'the woman with the bag', quote: 'the woman with the bag', kind: 'entity', mode: 'indirect', candidates: ['mira'] }] });
      y.model.draft('She waves. [NM11a]');
      y.model.on('evaluate', (i) => String(i.candidate).includes('[NM11a]'), { scene_end: at(1, 9, 5) });
      await y.engine.runOperation('normal');
      const m2 = skip ? 'The next morning the woman with the bag attacks me.' : 'Then the woman with the bag attacks me.';
      y.host.addUser(m2);
      y.model.on('extract_user', (i) => i.message === m2, {
        statements: skip ? [{ kind: 'time_proposal', quote: 'The next morning', summary: 'next morning', entities: [], facts: [], event_id: null, time: { day: 2, minute: 480 }, ambiguous: false }] : [],
        references: [{ phrase: 'the cart', quote: 'attacks me', kind: 'entity', mode: 'indirect', candidates: ['harbor'] }],
        fight: { state: 'starts', participants: ['the woman with the bag'], new_people: [{ name: 'the woman with the bag', description: 'swings a bag', quote: 'the woman with the bag attacks me' }], why: 'x' } });
      y.model.on('combat_who', null, { people: [] });
      y.model.draft('She swings. [NM11b]');
      y.model.on('evaluate', (i) => String(i.candidate).includes('[NM11b]'), { scene_end: skip ? at(2, 8, 5) : at(1, 9, 10) });
      await y.engine.runOperation('normal');
      return y;
    };
    const same = await play(false);
    expect(same.engine.current!.replay.state.combat.fights[0].participants).toContain('mira');
    const later = await play(true);
    const fighters = later.engine.current!.replay.state.combat.fights[0].participants;
    expect(fighters).not.toContain('mira');
    expect(fighters.some((x) => x.startsWith('rt.') && !x.startsWith('rt.player.'))).toBe(true);
    // what the skipping message wrote is stamped at the time it skips to (it holds from the next morning on)
    const harborBinding = later.engine.current!.replay.state.names.find((n) => n.words === 'the cart');
    expect(harborBinding?.tick).toBe(tick(2, 8, 0));
  });

  it('NM12 only words that describe someone or are another name of theirs are written down, and only of the kind the reading says (live: the vending machine in the park was the park "directly")', async () => {
    const y = await game();
    const msg = 'By the harbor vending machine a stranger in a grey coat waves; the old docks are quiet.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { references: [
      { phrase: 'the harbor vending machine', quote: 'harbor vending machine', kind: 'entity', mode: 'direct', candidates: ['harbor'] },
      { phrase: 'the machine by the water', quote: 'harbor vending machine', kind: 'entity', mode: 'indirect', ref_kind: 'object', candidates: ['harbor'] },
      { phrase: 'a stranger in a grey coat', quote: 'a stranger in a grey coat', kind: 'entity', mode: 'indirect', ref_kind: 'person', candidates: ['mira'] },
      { phrase: 'the old docks', quote: 'the old docks', kind: 'entity', mode: 'indirect', ref_kind: 'place', candidates: ['harbor'] },
      { phrase: 'her healing touch', quote: 'waves', kind: 'entity', mode: 'indirect', ref_kind: 'other', candidates: ['mira'] },
    ] }, true);
    y.model.draft('Quiet. [NM12]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM12]'), { scene_end: at(1, 9, 5) });
    await y.engine.runOperation('normal');
    expect(y.engine.current!.index.namesNow().map((n) => [n.words, n.id]).sort()).toEqual([['a stranger in a grey coat', 'mira'], ['the old docks', 'harbor']]);
  });

  it('NM13 a newcomer of the reply whose words have someone else in them is not that one unless of the same kind', async () => {
    const y = await game();
    y.host.addUser('I look around.');
    y.model.draft('A clerk of the Council nods. [NM13]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[NM13]'), { scene_end: at(1, 9, 5), new_entities: [{ ref: 'n1', name: 'a clerk of the Council', kind: 'person', description: 'a clerk', quote: 'A clerk of the Council nods' }] });
    await y.engine.runOperation('normal');
    expect([...y.engine.current!.replay.state.runtimeEntities.values()].map((e) => e.name)).toContain('a clerk of the Council');
  });

  it("NM14 what the reading of the reply found is written down only of someone the review finds in the scene (live: the goggled sister's 「御坂美琴的妹妹」 was taken for 最后之作, nowhere near)", async () => {
    const play = async (present: string[]) => {
      const y = await game();
      y.host.addUser('I look around.');
      y.model.draft('The old doctor smiles. [NM14]');
      y.model.on('discover', (i) => String(i.text).includes('[NM14]'), { references: [{ id: 'r1', quote: 'The old doctor', phrase: 'the old doctor', ref_kind: 'person', mode: 'indirect', assertion: 'narrator', temporal: 'present', candidate_ids: ['mira'] }], claims: [] });
      y.model.on('evaluate', (i) => String(i.candidate).includes('[NM14]'), { scene_end: at(1, 9, 5), present });
      await y.engine.runOperation('normal');
      return y.engine.current!.index.whoIs('the old doctor');
    };
    expect(await play([])).toEqual([]);
    expect(await play(['mira'])).toEqual(['mira']);
  });
});
