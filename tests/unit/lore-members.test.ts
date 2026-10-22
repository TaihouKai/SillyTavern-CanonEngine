// LM: who is in an organization (pack `members` facts) and the user's lorebook as background for reading the Persona.
// User request: a Persona saying "Relation to SCHOOL: bad" should be read knowing what SCHOOL is and who is in it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { lintPack, validatePackText } from '../../src/domain/pack';
import { buildBootstrap } from '../../src/domain/schedule';
import { WorldIndex } from '../../src/domain/world-query';
import { replay } from '../../src/runtime/replay';
import { candidateInput, integrationCandidates, memberships, orgsOf } from '../../src/runtime/integration';
import { keyMatches, loreFor, type LoreEntry } from '../../src/runtime/lore';
import type { PlayerProfile } from '../../src/runtime/types';

/** The demo pack with organization membership: the Council's members Sol and Ren (a `members` set), Tal in the
 *  Union by `affiliation`, Ren's errand on day 2, and an event that empties the Council on day 4. */
function membersPack(opts: { deathWithoutUpdate?: boolean } = {}) {
  const p = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
  p.predicates.push({ id: 'members', description: 'members of an organization', value_type: 'entity_set' }, { id: 'affiliation', description: 'organization of a person', value_type: 'entity_ref' });
  p.entities.push(
    { id: 'ren', name: 'Ren', aliases: [], kind: 'person', static_description: 'A council clerk.', source_refs: p.entities[0].source_refs },
    { id: 'sol', name: 'Sol', aliases: [], kind: 'person', static_description: 'A council elder.', source_refs: p.entities[0].source_refs },
    { id: 'tal', name: 'Tal', aliases: [], kind: 'person', static_description: 'A union docker.', source_refs: p.entities[0].source_refs },
  );
  p.initial_state.facts.push(
    { fact: { entity_id: 'council', predicate: 'members', value: ['sol', 'ren'] }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' },
    { fact: { entity_id: 'tal', predicate: 'affiliation', value: 'union' }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' },
    { fact: { entity_id: 'ren', predicate: 'alive', value: true }, source_refs: p.initial_state.facts[0].source_refs, note: 'test' },
  );
  const base = p.events.find((e: any) => e.id === 'harbor-festival');
  const ev = (id: string, day: number, ents: string[], effects: unknown[]) => ({ ...JSON.parse(JSON.stringify(base)), id, title: id, summary: id, classification: 'FREE', when: { earliest: { day, minute: 600 }, latest: { day, minute: 660 }, precision: 'range', label: id, basis: 'documented', notes: '' }, entity_ids: ents, location_ids: [], arc_id: null, outcomes: [], canonical_effects: effects, cast: undefined });
  p.events.push(ev('ren-errand', 2, ['ren'], []));
  p.events.push(ev('council-falls', 4, ['council'], [{ op: 'set', fact: { entity_id: 'council', predicate: 'members', value: [] } }]));
  if (opts.deathWithoutUpdate) p.events.push(ev('ren-dies', 3, ['ren'], [{ op: 'set', fact: { entity_id: 'ren', predicate: 'alive', value: false } }]));
  for (const a of p.arcs || []) a.event_ids = (a.event_ids || []).filter((x: string) => p.events.some((e: any) => e.id === x));
  return JSON.stringify(p);
}
function world(text: string, at: number) {
  const r = validatePackText(text);
  if (!r.loaded) throw new Error(JSON.stringify(r.errors));
  const rr = replay({ pack: r.loaded, branchId: 'b', bootstrap: buildBootstrap(r.loaded, at).records, manual: [], entries: [], store: {} } as any);
  return new WorldIndex(r.loaded, rr.state);
}
const profile = (rel: Partial<PlayerProfile> = {}): PlayerProfile => ({
  personaName: 'Ash', personaText: '', personaHash: '', source: 'standard_persona', playerId: 'player', summary: '', publicIdentity: '',
  affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [], notes: [], ...rel,
} as PlayerProfile);
const lore = (book: string, comment: string, keys: string[], content: string, more: Partial<LoreEntry> = {}): LoreEntry =>
  ({ book, uid: comment, comment, keys, secondary: [], selective: false, logic: 0, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content, ...more });

describe('organization members', () => {
  it('LM1 a members set is the whole list (also once emptied); affiliation counts only for organizations without one; the dead are left out', () => {
    const idx = world(membersPack(), tick(1, 9, 0));
    expect(memberships(idx, tick(1, 9, 0)).get('council')).toEqual(['ren', 'sol']);
    expect(memberships(idx, tick(1, 9, 0)).get('union')).toEqual(['tal']);
    expect(orgsOf(idx, 'ren', tick(1, 9, 0))).toEqual(['council']);
    const later = world(membersPack(), tick(5, 9, 0));
    expect(later.state.dispositions.get('council-falls')?.disposition).toBe('occurred');
    expect(memberships(later, tick(5, 9, 0)).get('council')).toBeUndefined();
  });

  it('LM2 a connection with an organization makes its members\' events the player\'s concern; their people are shown with their organization', () => {
    const idx = world(membersPack(), tick(1, 9, 0));
    const t = tick(1, 9, 0);
    expect(integrationCandidates(idx, profile(), t).map((c) => c.event.id)).not.toContain('ren-errand');
    const bad = profile({ relationships: [{ name: 'The Council', entityId: 'council', relation: 'bad blood', basis: 'persona_stated' }] as any });
    const cands = integrationCandidates(idx, bad, t);
    const errand = cands.find((c) => c.event.id === 'ren-errand');
    expect(errand).toBeTruthy();
    expect(candidateInput(idx, errand!, t, null).people).toEqual(['Ren [ren, of The Council]']);
  });

  it('LM3 lint: someone who dies while a members set still lists them is flagged', () => {
    const r = validatePackText(membersPack({ deathWithoutUpdate: true }));
    const w = lintPack(JSON.parse(membersPack({ deathWithoutUpdate: true }))).warnings.map((x) => x.message).join('\n');
    expect(r.loaded).toBeTruthy();
    expect(w).toMatch(/ren dies in this event but is still listed in members of council/);
    expect(lintPack(JSON.parse(membersPack())).warnings.map((x) => x.message).join('\n')).not.toMatch(/still listed in members/);
  });
});

describe('lorebook background for the Persona', () => {
  const pack = validatePackText(membersPack()).loaded!;
  const book = [
    lore('world', 'COUNCIL（议会）', ['Council', '/(?:议会|暗部)/iu'], 'The Council rules the harbor. Its clerk Ren keeps the books.'),
    lore('world', 'Ren', ['Ren'], 'Ren, a council clerk who hates the Union.'),
    lore('world', 'Mira', ['Mira'], 'Mira, a medic.'),
    ...['a', 'b', 'c', 'd'].map((x) => lore('world', `dark ${x}`, ['暗部', `dark-${x}`], `another 暗部 group ${x}`)),
    lore('world', 'Old song', ['ballad'], 'A harbor ballad.'),
    lore('world', 'Weather', ['rain'], 'Always raining.', { constant: true }),
    lore('style', 'Style rule', ['council'], 'Write in second person.'),
  ];

  it('LM4 keys as SillyTavern reads them: regex keys, case-insensitive text keys, whole words for Latin keys', () => {
    expect(keyMatches('/(?:议会|暗部)/iu', '他属于议会', { caseSensitive: null, wholeWords: null })).toBe(true);
    expect(keyMatches('Council', 'relation to COUNCIL: bad', { caseSensitive: null, wholeWords: null })).toBe(true);
    expect(keyMatches('Council', 'relation to COUNCIL: bad', { caseSensitive: true, wholeWords: null })).toBe(false);
    expect(keyMatches('Ren', 'Lorentz', { caseSensitive: null, wholeWords: true })).toBe(false);
  });

  it('LM5 the entries the Persona names, then the people they name; not generic words, unrelated lorebooks or always-on entries', () => {
    const r = loreFor(book, 'Relation to COUNCIL: bad. Grew up in 暗部.', pack);
    expect(r.map((x) => [x.title, x.entity_id, x.via])).toEqual([['COUNCIL（议会）', 'council', 'persona'], ['Ren', 'ren', 'related']]);
    expect(loreFor(book, 'sings a ballad', pack).map((x) => x.title)).toEqual(['Old song']); // the world's lorebook, no entity
    expect(loreFor(book, 'nothing here', pack)).toEqual([]);
    expect(loreFor(book, 'Relation to COUNCIL: bad', pack, { budgetChars: 70 }).map((x) => x.title)).toEqual(['COUNCIL（议会）']);
  });

  it('LM6 the Persona is read with the lorebook entries it names and the organizations\' members; the panel lists the entries', async () => {
    const x = makeEngine();
    x.host.persona = () => ({ name: 'Ash', description: 'Relation to COUNCIL: bad.' });
    (x.host as any).loreEntries = async () => book;
    await x.engine.bind(membersPack(), { startTick: tick(1, 9, 0), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('You look around. [L1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const input = x.model.tasks('profile')[0].input;
    expect(input.background_lore.map((l: any) => l.title)).toEqual(['COUNCIL（议会）', 'Ren']);
    expect(input.registry.entities).toContain('council | The Council |  | organization | members: Ren, Sol');
    expect(x.engine.playerProfile()!.profile.lore).toEqual(['COUNCIL（议会）', 'Ren (related)']);
  });
});
