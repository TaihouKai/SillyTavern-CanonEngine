// AS1–AS5: 条目的属性 (aspects). One record per entity, what the world knows of it in a fixed set of kinds; a module
// reads only the kinds it names. What changes in play — who holds an object, who belongs to an organization — is a
// fact of the world, and what comes with it reaches whoever holds or belongs. The player character has the same
// aspects (read from the Persona) and is read the same way (user: "我的Persona应当一样对待").
import { describe, expect, it } from 'vitest';
import { reduce } from '../../src/core/domain/reducer';
import { aspectReader, aspectWritten, ASPECTS, ASPECT_KEYS } from '../../src/core/domain/aspects';
import { WorldIndex } from '../../src/core/domain/world-query';
import { combatNodes, fightNow, knowsNode, linksOf, tiesOf, walkCombat } from '../../src/core/combat/state';
import type { CanonPack, LedgerRecord } from '../../src/core/domain/types';
import { makeEngine, tick, at } from './fake';
import { demoRaw, load, T } from './helpers';
import { validatePack } from '../../src/core/domain/pack';

let seq = 0;
const rec = (t: number, extra: Partial<LedgerRecord>): LedgerRecord => ({
  recordId: `r${++seq}`, commitId: 'c', branchId: 'main', sequence: seq, kind: 'world_event', storyTime: { lo: t, hi: t, precision: 'minute' },
  sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: '', evidenceKind: 'direct', ...extra,
});

/** The demo pack with a hook (an object with an ability), a dockers' guild inside the union, and the facts for them. */
function harbor(): CanonPack {
  const p = demoRaw();
  p.predicates.push({ id: 'holder', description: 'who holds the object', value_type: 'entity_ref' }, { id: 'members', description: 'who belongs', value_type: 'entity_set' });
  p.entities.push(
    { id: 'hook', name: 'Cargo hook', aliases: [], kind: 'object', static_description: 'A heavy cargo hook.', source_refs: ['example-source'],
      aspects: { abilities: [{ id: 'hook-swing', name: 'Hook swing', gist: 'A swung cargo hook tears flesh.', text: 'Swung, the hook tears flesh and catches limbs.', parts: [{ part: 'effect', text: 'Tears flesh, catches a limb.' }], source_refs: ['example-source'] }], setting: [{ node: 'cb-firearms', label: 'no better than' }] } },
    { id: 'guild', name: 'Dockers\' guild', aliases: [], kind: 'organization', static_description: 'The dockers of the union.', source_refs: ['example-source'],
      aspects: { fighting: { gist: 'Dockers who fight in crowds with hooks.', text: 'They fight in crowds, with hooks and chains.' } } },
  );
  p.initial_state.facts.push({ fact: { entity_id: 'union', predicate: 'members', value: ['guild'] }, source_refs: ['example-source'], note: 'x' });
  return p;
}

describe('条目的属性', () => {
  it('AS1 the registry: a fixed set of kinds, each for some kinds of entity; a reader gets only what it names, as it holds now', () => {
    expect(ASPECT_KEYS).toEqual(['nature', 'mind', 'combat_style', 'abilities', 'setting', 'fighting']);
    expect(ASPECTS.fighting.for).not.toContain('person');
    expect(ASPECTS.mind.for).toEqual(['person']);
    const raw = harbor();
    const mira = raw.entities.find((e) => e.id === 'mira')!;
    mira.aspects!.abilities!.push({ id: 'cb-later', name: 'Field surgery', gist: 'x', text: 'x', parts: [{ part: 'effect', text: 'x' }], from_event: 'conflict-begins', source_refs: ['example-source'] });
    mira.aspects!.nature = [{ from_event: null, habits: 'hums', uses: 'x', others: 'x', limits: 'x' }, { from_event: 'conflict-begins', habits: 'trembles', uses: 'x', others: 'x', limits: 'x' }];
    const L = load(raw);
    const READ = aspectReader(['abilities', 'nature'] as const);
    const idx = new WorldIndex(L, reduce(L, []));
    const now = READ(idx, 'mira');
    expect(Object.keys(now)).toEqual(['abilities', 'nature']);   // nothing it did not name
    expect(now.abilities.map((a) => a.id)).toEqual(['cb-emergency-care']);   // the later one not yet
    expect(now.nature!.version.habits).toBe('hums');
    // once its event occurred: the later ability and version hold
    const st = reduce(L, [rec(T(0, 9), { kind: 'canon_occurrence', packEventId: 'conflict-begins', disposition: 'occurred' })]);
    const later = READ(new WorldIndex(L, st), 'mira');
    expect(later.abilities.map((a) => a.id)).toEqual(['cb-emergency-care', 'cb-later']);
    expect(later.nature!.version.habits).toBe('trembles');
    // a display gets every version as written
    expect(aspectWritten(['nature'] as const)(idx, 'mira').nature).toHaveLength(2);
    // the combat index takes every entity's abilities in, with their owner
    expect(L.combat.nodes.get('hook-swing')).toMatchObject({ kind: 'ability', owner: 'hook' });
    expect(L.combat.nodes.get('guild')).toMatchObject({ kind: 'concept', owner: 'guild', gist: 'Dockers who fight in crowds with hooks.' });
  });

  it('AS2 what someone holds and belongs to are facts: what comes with them reaches whoever holds or belongs, and goes when they no longer do', () => {
    const L = load(harbor());
    const st = reduce(L, [
      rec(T(0, 9), { factsSetOrUnset: [{ op: 'set', entity_id: 'hook', predicate: 'holder', value: 'mira' }, { op: 'add', entity_id: 'guild', predicate: 'members', value: ['mira'] }, { op: 'add', entity_id: 'union', predicate: 'members', value: ['guild'] }] }),
      rec(T(0, 11), { factsSetOrUnset: [{ op: 'set', entity_id: 'hook', predicate: 'holder', value: 'council' }] }),
    ]);
    // a member of the guild belongs to the union too (an organization inside a larger one)
    expect(tiesOf(st, 'mira', T(0, 10))).toEqual({ holds: ['hook'], memberOf: ['guild', 'union'] });
    const at10 = linksOf(L, st, 'mira', T(0, 10));
    expect(at10.find((l) => l.node === 'hook-swing')).toMatchObject({ via: 'hook', how: 'holds', label: 'has' });
    expect(at10.find((l) => l.node === 'cb-firearms')).toMatchObject({ via: 'hook', how: 'holds', label: 'no better than' });
    expect(at10.find((l) => l.node === 'guild')).toMatchObject({ via: 'guild', how: 'member', label: 'belongs to' });
    expect(at10.find((l) => l.node === 'cb-soldier')).toMatchObject({ via: 'union', how: 'member' });   // the union's kind of fighter
    // her own: her kind first, then what she can do
    expect(at10.slice(0, 2).map((l) => [l.node, l.how])).toEqual([['cb-ordinary', undefined], ['cb-emergency-care', 'has']]);
    // the hook taken: it is the council's now
    const at12 = linksOf(L, st, 'mira', T(0, 12));
    expect(at12.some((l) => l.node === 'hook-swing')).toBe(false);
    expect(linksOf(L, st, 'council', T(0, 12)).some((l) => l.node === 'hook-swing' && l.via === 'hook')).toBe(true);
    // the walk takes what she holds and belongs to, at depth 1, from her
    const w = walkCombat(L, st, ['mira'], { maxDepth: 2, fullDepth: 1, budgetChars: 10000, tick: T(0, 10) });
    expect(w.nodes.find((n) => n.node.id === 'hook-swing')).toMatchObject({ depth: 1, viaFrom: 'mira' });
    expect(w.nodes.find((n) => n.node.id === 'guild')).toMatchObject({ depth: 1 });
  });

  it('AS3 the boundary: no module reads an entity\'s aspects raw (scripts/check-boundary.mjs); each names its kinds', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('scripts/check-boundary.mjs', 'utf8');
    expect(src).toMatch(/reads an entity's aspects directly; use a reader/);
    for (const f of ['src/core/combat/state.ts', 'src/core/combat/who.ts', 'src/core/runtime/context.ts', 'src/core/hostility/state.ts', 'src/core/runtime/integration.ts'])
      expect(readFileSync(f, 'utf8')).toMatch(/aspectReader\(\[/);
  });
});

const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker who boxed as a youth', public_identity: 'works the piers' }, affiliations: [], places: [], resources: ['a bicycle'], goals: [], relationships: [], knowers: [{ who: 'his sister', existing_id: 'mira', level: 'secrets', about: 'his past', basis: 'persona_stated' }], uncertain: [] };
const PERSONA = 'Ash, a dock worker. Boxed as a youth: a hard right hook. His left eye is weak (a secret only his sister Mira knows).';

async function setup(abilities: object | null) {
  const x = makeEngine();
  if (abilities === null) x.model.failTask.persona_abilities = 9;
  (x.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
  x.model.on('profile', null, PROFILE);
  if (abilities) x.model.on('persona_abilities', null, abilities);
  await x.engine.bind(JSON.stringify(harbor()), { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around the harbor.');
  x.model.draft('The harbor at dawn. [AS0]');
  x.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
  await x.engine.runOperation('normal');
  return x;
}

describe('the player character has the same aspects', () => {
  const READ = aspectReader(['abilities', 'setting'] as const);
  const HOOK = { name: 'Right hook', gist: 'A boxer\'s hard right hook.', text: 'Learned boxing as a youth.', parts: [{ part: 'effect', text: 'Knocks a man down.' }, { part: 'limits', text: 'His left eye is weak: blind on the left.', secret: true }], links: [{ to: 'cb-ordinary', label: 'as' }, { to: 'nowhere', label: 'x' }] };

  it('AS4 what the Persona gives them is read into abilities in the same parts as anyone\'s, with who knows the secret ones; links only into the setting', async () => {
    const x = await setup({ abilities: [HOOK, { name: 'Bad', gist: '', parts: [{ part: 'cost', text: 'x' }] }], setting: [{ node: 'cb-ordinary', label: 'is' }, { node: 'hook-swing', label: 'x' }, { node: 'ghost', label: 'x' }] });
    const t = x.model.tasks('persona_abilities').at(-1)!.input;
    expect(t.persona.description).toBe(PERSONA);
    expect(t.public_identity).toBe('works the piers');
    // the setting's own nodes are offered, not another entity's ability
    expect(t.setting.some((l: string) => l.startsWith('cb-ordinary | concept'))).toBe(true);
    expect(t.setting.some((l: string) => l.startsWith('hook-swing'))).toBe(false);
    const prof = x.engine.playerProfile()!.profile;
    const pid = prof.playerId;
    const a = READ(x.engine.current!.index, pid);
    expect(a.abilities).toHaveLength(1);
    expect(a.abilities[0]).toMatchObject({ id: `${pid}.right-hook`, name: 'Right hook', generated: true, links: [{ to: 'cb-ordinary', label: 'as' }] });
    expect(a.abilities[0].parts[1]).toEqual({ part: 'limits', text: 'His left eye is weak: blind on the left.', visibility: { mode: 'secret', knower_ids: ['mira'] } });
    expect(a.setting).toEqual([{ node: 'cb-ordinary', label: 'is' }]);
    expect(prof.notes.join(' ')).toMatch(/ability "Bad" left out[^]*setting link "hook-swing" left out[^]*setting link "ghost" left out/);
    // the combat graph has it, as the player's own (source persona); who may know its secret part
    const L = x.engine.current!.index.pack, st = x.engine.current!.replay.state;
    expect(combatNodes(L, st).get(`${pid}.right-hook`)).toMatchObject({ kind: 'ability', owner: pid });
    expect(linksOf(L, st, pid).map((l) => `${l.node}:${l.source}`)).toEqual(['cb-ordinary:persona', `${pid}.right-hook:persona`]);
    expect(knowsNode(L, st, 'council', `${pid}.right-hook`, 'effect')).toBe(true);
    expect(knowsNode(L, st, 'council', `${pid}.right-hook`, 'limits')).toBe(false);
    expect(knowsNode(L, st, 'mira', `${pid}.right-hook`, 'limits')).toBe(true);
    expect(knowsNode(L, st, pid, `${pid}.right-hook`, 'limits')).toBe(true);
    // what the player can do, wherever the world reads it: their abilities (no second list of capabilities)
    const ctx = String(x.model.tasks('draft').at(-1)!.input.engineContext);
    expect(ctx).toMatch(/- can\/has: Right hook: A boxer's hard right hook\.; a bicycle/);
    expect(x.engine.integrationView(true)!.profile!.abilities).toEqual([{ name: 'Right hook', gist: 'A boxer\'s hard right hook.', secret: false, parts: ['效果：Knocks a man down.', '限制（秘密）：His left eye is weak: blind on the left.'], uses: [] }]);
    expect(x.engine.integrationView(true)!.profile!.kinds).toEqual(['is Ordinary person']);
  });

  it('AS5 a failed read leaves the player without abilities and says so; a new Persona read replaces them', async () => {
    const x = await setup(null);
    const prof = x.engine.playerProfile()!.profile;
    expect(READ(x.engine.current!.index, prof.playerId).abilities).toEqual([]);
    expect(prof.notes.join(' ')).toMatch(/abilities not read from the Persona/);
    x.model.failTask.persona_abilities = 0;
    x.model.on('persona_abilities', null, { abilities: [{ ...HOOK, name: 'Left jab', links: [] }], setting: [] });
    (x as any).persona = undefined;
    (x.host as any).persona = () => ({ name: 'Ash', description: PERSONA + '\nNow he jabs.' });
    await x.engine.updateIdentity();
    const after = READ(x.engine.current!.index, x.engine.playerProfile()!.profile.playerId);
    expect(after.abilities.map((a) => a.name)).toEqual(['Left jab']);
  });

  it('AS6 a power and its uses: each use goes to the power it names, however the reply writes the name; a use of a use goes to the power; a name that fits nothing, or a ring, leaves an ability of its own; no effect: its summary is what it does', async () => {
    const P = (name: string, of: string | null, effect = true) => ({ name, gist: `${name} gist`, parts: effect ? [{ part: 'effect', text: `${name} does` }] : [], of });
    const x = await setup({ abilities: [
      { ...P('Domina Luminis (万光统御)', null), parts: [{ part: 'effect', text: 'bends light' }, { part: 'cost', text: 'needs light around' }] },
      P('Light Blade', '万光统御'), P('Photon Laser', 'domina luminis (万光统御)', false), P('Prism Burst', 'Photon Laser'),
      P('Boxing', 'Karate'), P('Ring A', 'Ring B'), P('Ring B', 'Ring A'), P('Self', 'Self'), P('Light Blade', null),
    ], setting: [] });
    const prof = x.engine.playerProfile()!.profile, pid = prof.playerId;
    const a = READ(x.engine.current!.index, pid).abilities;
    const id = (n: string) => a.find((y) => y.name === n)!.id;
    const of = Object.fromEntries(a.map((y) => [y.name, y.of ? a.find((z) => z.id === y.of)!.name : null]));
    expect(of).toEqual({ 'Domina Luminis (万光统御)': null, 'Light Blade': 'Domina Luminis (万光统御)', 'Photon Laser': 'Domina Luminis (万光统御)', 'Prism Burst': 'Domina Luminis (万光统御)', Boxing: null, 'Ring A': null, 'Ring B': null, Self: null });
    expect(a.find((y) => y.name === 'Photon Laser')!.parts).toEqual([{ part: 'effect', text: 'Photon Laser gist' }]);
    const notes = prof.notes.join(' | ');
    expect(notes).toMatch(/"Boxing" is a use of "Karate", which is none of the abilities read/);
    expect(notes).toMatch(/"Ring A": its uses go round in a ring/);
    expect(notes).toMatch(/ability "Light Blade" given twice: kept once/);
    expect(notes).toMatch(/ability "Photon Laser": no effect given, its summary taken/);
    // the fight: the power, then its uses (each a use of it), what the analysis is told about them
    const L = x.engine.current!.index.pack, st = x.engine.current!.replay.state;
    const links = linksOf(L, st, pid).filter((l) => l.node.startsWith(pid));
    expect(links.slice(0, 4).map((l) => [l.node, l.how, l.label])).toEqual([
      [id('Domina Luminis (万光统御)'), 'has', 'has'], [id('Light Blade'), 'use', `use of ${id('Domina Luminis (万光统御)')}`],
      [id('Photon Laser'), 'use', `use of ${id('Domina Luminis (万光统御)')}`], [id('Prism Burst'), 'use', `use of ${id('Domina Luminis (万光统御)')}`]]);
    // the 身份 page: each power with its uses under it
    const view = x.engine.integrationView(true)!.profile!.abilities;
    expect(view.map((v) => [v.name, v.uses.map((u) => u.name)])).toEqual([['Domina Luminis (万光统御)', ['Light Blade', 'Photon Laser', 'Prism Burst']], ['Boxing', []], ['Ring A', []], ['Ring B', []], ['Self', []]]);
    // the setting page draws a use from its power
    const s = x.engine.combatView(false, '', id('Domina Luminis (万光统御)'))!.setting;
    expect(s.graph.edges).toEqual(expect.arrayContaining([expect.objectContaining({ from: id('Domina Luminis (万光统御)'), to: id('Light Blade'), how: 'use' })]));
    expect(x.engine.combatView(false, '', id('Photon Laser'))!.setting.focus!.of).toEqual({ id: id('Domina Luminis (万光统御)'), name: 'Domina Luminis (万光统御)' });
  });
});

describe('uses in a pack', () => {
  it('AS7 the lint: a use is of one of the same entity\'s abilities, which is no use itself; a use holds only while its power does', () => {
    const raw = harbor();
    const mira = raw.entities.find((e) => e.id === 'mira')!;
    const ab = (id: string, extra: object = {}) => ({ id, name: id, gist: 'x', text: 'x', parts: [{ part: 'effect' as const, text: 'x' }], source_refs: ['example-source'], ...extra });
    mira.aspects!.abilities!.push(ab('cb-suture', { of: 'cb-emergency-care' }), ab('cb-knot', { of: 'cb-suture' }), ab('cb-self', { of: 'cb-self' }), ab('cb-far', { of: 'hook-swing' }));
    const e = validatePack(raw).errors.map((x) => x.message).join('\n');
    expect(e).toMatch(/"cb-suture" is itself a use \(of "cb-emergency-care"\)/);
    expect(e).toMatch(/an ability is no use of itself/);
    expect(e).toMatch(/"hook-swing" is no ability of this entity/);
    // fixed: the use holds with its power, and goes when the power does
    mira.aspects!.abilities = [ab('cb-power', { from_event: 'conflict-begins' }), ab('cb-move', { of: 'cb-power' }), mira.aspects!.abilities![0]];
    const L = load(raw);
    const READ2 = aspectReader(['abilities'] as const);
    expect(READ2(new WorldIndex(L, reduce(L, [])), 'mira').abilities.map((a) => a.id)).toEqual(['cb-emergency-care']);
    const st = reduce(L, [rec(T(0, 9), { kind: 'canon_occurrence', packEventId: 'conflict-begins', disposition: 'occurred' })]);
    expect(READ2(new WorldIndex(L, st), 'mira').abilities.map((a) => a.id)).toEqual(['cb-power', 'cb-move', 'cb-emergency-care']);
    expect(L.combat.nodes.get('cb-move')).toMatchObject({ of: 'cb-power', owner: 'mira' });
  });
});

describe('an object changes hands in a fight', () => {
  it('AS8 the ruling hands an object over: who holds it is then the fact, and what it brings goes with it; one nobody here holds, or to someone not here, is left out', async () => {
    const raw = harbor();
    raw.initial_state.facts.push({ fact: { entity_id: 'hook', predicate: 'holder', value: 'council' }, source_refs: ['example-source'], note: 'x' });
    // a chat bound to the pack where the council holds the hook
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const pid = () => y.engine.playerProfile()!.profile.playerId;
    const msg = 'I grab the hook out of the gunman\'s hands.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { fight: { state: 'starts', participants: ['council'], why: 'x' } }, true);
    y.model.on('combat', (i) => i.player_message === msg, (i: any) => {
      expect(i.fighters.find((f: any) => f.id === 'council').holds).toEqual(['hook | Cargo hook']);
      return { reasoning: 'x', exchanges: [{ actor: pid(), text: 'Ash wrenches the hook away.', basis: [{ ref: 'judgement' }], unsupported: true }], statuses: [], over: false,
        handovers: [{ object: 'hook', to: 'mira' }, { object: 'hook', to: pid(), quote: 'grab the hook' }, { object: 'cb-firearms', to: pid() }] };
    });
    y.model.draft('Ash wrenches the hook away. [AS8]');
    y.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
    await y.engine.runOperation('normal');
    const L = y.engine.current!.index.pack, st = y.engine.current!.replay.state;
    expect(tiesOf(st, pid()).holds).toEqual(['hook']);
    expect(tiesOf(st, 'council').holds).toEqual([]);
    expect(linksOf(L, st, pid()).find((l) => l.node === 'hook-swing')).toMatchObject({ via: 'hook', how: 'holds' });
    const r = y.engine.combatView(false)!.rulings[0];
    expect(r.states).toContain(`Cargo hook → ${y.engine.current!.index.entityName(pid())}`);
    expect(r.notes.join(' ')).toMatch(/"cb-firearms" changes hands, but nobody here holds it/);
    expect(r.notes.join(' ')).toMatch(/"hook" goes to "mira", who is not here/);
    expect(String(y.model.tasks('draft').at(-1)!.input.engineContext)).toMatch(/now holds Cargo hook/);
  });
});

describe('what is so of someone stops an outcome', () => {
  it('AS9 the hook in the gunman\'s hands stops "I swing my hook" (world:<id>, its words); words it does not have do not, and the outcome stands', async () => {
    const raw = harbor();
    raw.initial_state.facts.push({ fact: { entity_id: 'hook', predicate: 'holder', value: 'council' }, source_refs: ['example-source'], note: 'x' });
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const turn = async (msg: string, quote: string) => {
      y.host.addUser(msg);
      y.model.on('extract_user', (i) => i.message === msg, { fight: { state: 'starts', participants: ['council'], why: 'x' } }, true);
      y.model.on('combat', (i) => i.player_message === msg, { reasoning: 'x', player_outcomes: [{ quote: 'my hook hits him', stands: false, basis: [{ ref: 'world:council', quote }], why: 'he holds it' }],
        exchanges: [{ actor: 'council', text: 'He keeps the hook.', basis: [{ ref: 'world:council', quote }] }], statuses: [], over: false });
      y.model.draft(`He keeps the hook. [${quote}]`);
      y.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
      await y.engine.runOperation('normal');
      return y.engine.combatView(false)!.rulings[0];
    };
    const a = await turn('I swing my hook and my hook hits him.', 'hook | Cargo hook');
    expect(a.stopped.map((o) => o.basis)).toEqual([['The Council的现状「hook | Cargo hook」']]);
    expect(a.notes.join(' ')).not.toMatch(/without an objective mechanism/);
    const b = await turn('Again: I swing my hook and my hook hits him.', 'the hook is his');
    expect(b.stopped).toEqual([]);
    expect(b.stands).toContain('my hook hits him');
  });
});

describe('what the story fixes for later', () => {
  it('AS10 a near HARD outcome about someone here, or what they hold, is canon_fixed: it stops the player\'s outcome, and a handover that would bring it about is left out', async () => {
    const raw = harbor();
    raw.initial_state.facts.push({ fact: { entity_id: 'hook', predicate: 'holder', value: 'council' }, source_refs: ['example-source'], note: 'x' });
    const ev = raw.events.find((e) => e.id === 'conflict-begins')!;
    ev.outcomes.push({ entity_id: 'hook', predicate: 'holder', value: 'mira' }, { entity_id: 'council', predicate: 'alive', value: false });
    ev.canonical_effects.push({ op: 'set', fact: { entity_id: 'hook', predicate: 'holder', value: 'mira' }, until: 'lasting' }, { op: 'set', fact: { entity_id: 'council', predicate: 'alive', value: false }, until: 'lasting' });
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const msg = 'I shoot the gunman dead.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { fight: { state: 'starts', participants: ['council', 'mira'], why: 'x' } }, true);
    y.model.on('combat', (i) => i.player_message === msg, (i: any) => {
      expect(i.canon_fixed).toEqual([
        { ref: 'canon:conflict-begins', who: 'hook | Cargo hook', what: 'holder becomes Mira', only_by: ev.title },
        { ref: 'canon:conflict-begins', who: 'council | The Council', what: 'alive becomes false', only_by: ev.title },
      ]);
      return { reasoning: 'x', player_outcomes: [{ quote: 'shoot the gunman dead', stands: false, basis: [{ ref: 'canon:conflict-begins' }], why: 'he lives to see the conflict' }],
        exchanges: [{ actor: 'council', text: 'The shot misses; he drops the hook and Mira catches it.', basis: [{ ref: 'canon:conflict-begins' }] }], statuses: [], over: false,
        handovers: [{ object: 'hook', to: 'mira' }] };
    });
    y.model.draft('The shot misses. [AS10]');
    y.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
    await y.engine.runOperation('normal');
    const r = y.engine.combatView(false)!.rulings[0];
    expect(r.stopped.map((o) => o.basis)).toEqual([[`原作「${ev.title}」`]]);
    expect(r.notes.join(' ')).not.toMatch(/without an objective mechanism/);
    expect(r.notes.join(' ')).toMatch(/"hook" goes to "mira", which only ".*" brings about/);
    expect(tiesOf(y.engine.current!.replay.state, 'council').holds).toEqual(['hook']);
  });
  it('AS10b an event whose window is open is not fixed (the fight may be it)', async () => {
    const raw = harbor();
    const ev = raw.events.find((e) => e.id === 'conflict-begins')!;
    ev.outcomes.push({ entity_id: 'council', predicate: 'alive', value: false });
    ev.canonical_effects.push({ op: 'set', fact: { entity_id: 'council', predicate: 'alive', value: false }, until: 'lasting' });
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(2, 9, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const msg = 'I shoot the gunman.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { fight: { state: 'starts', participants: ['council'], why: 'x' } }, true);
    let seen: unknown = 'none';
    y.model.on('combat', (i) => i.player_message === msg, (i: any) => { seen = i.canon_fixed; return { reasoning: 'x', exchanges: [], statuses: [], over: false }; });
    y.model.draft('Shots. [AS10b]');
    y.model.on('evaluate', null, { scene_end: at(2, 9, 0) });
    await y.engine.runOperation('normal');
    expect(seen).toBeUndefined();
  });
});

describe('someone known by what they hold', () => {
  it('AS11 a newcomer with the cargo hook Mira holds now is Mira; the hook then changes hands from her', async () => {
    const raw = harbor();
    raw.initial_state.facts.push({ fact: { entity_id: 'hook', predicate: 'holder', value: 'mira' }, source_refs: ['example-source'], note: 'x' });
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const pid = () => y.engine.playerProfile()!.profile.playerId;
    const msg = 'A woman swings the cargo hook at me; I tear it from her hands.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, {
      references: [{ phrase: 'cargo hook', quote: 'the cargo hook', kind: 'entity', mode: 'direct', candidates: ['hook'] }],
      fight: { state: 'starts', participants: ['a woman'], new_people: [{ name: 'a woman', description: 'swings a hook', quote: 'A woman swings the cargo hook at me' }], why: 'x' } }, true);
    y.model.on('combat', (i) => i.player_message === msg, (i: any) => {
      expect(i.fighters.map((f: any) => f.id)).toContain('mira');
      return { reasoning: 'x', exchanges: [{ actor: pid(), text: 'Ash tears the hook away.', basis: [{ ref: 'judgement' }], unsupported: true }], statuses: [], over: false, handovers: [{ object: 'hook', to: pid() }] };
    });
    y.model.draft('Ash tears the hook away. [AS11]');
    y.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
    await y.engine.runOperation('normal');
    const st = y.engine.current!.replay.state;
    expect(fightNow(st).identified).toEqual([{ id: 'mira', as: 'a woman', why: 'holds Cargo hook, which Mira holds now' }]);
    expect(tiesOf(st, pid()).holds).toEqual(['hook']);
    expect(y.model.tasks('combat_who')).toHaveLength(0);
  });
});

describe('a thing the story keeps is not destroyed in a fight', () => {
  it('AS12 a ruling that destroys a device canon_fixed keeps (or does not say how) is ruled again with not_destroyed; switched off it stops', async () => {
    const raw = harbor();
    raw.predicates.push({ id: 'condition', description: 'its state', value_type: 'string' });
    raw.entities.push({ id: 'the-crane', name: 'The harbor crane', aliases: [], kind: 'object', static_description: 'The one crane of the harbor.', source_refs: ['example-source'], aspects: { setting: [{ node: 'cb-crane', label: 'is' }] } });
    (raw.combat as any).nodes.push({ id: 'cb-crane', kind: 'ability', name: 'Dock crane', gist: 'A dock crane a gunman fires down from.', text: 'A dock crane: high ground a gunman fires down from.', parts: [{ part: 'effect', text: 'High ground for a gunman.' }], source_refs: ['example-source'] });
    const ev = raw.events.find((e) => e.id === 'conflict-begins')!;
    ev.entity_ids.push('the-crane');
    ev.outcomes.push({ entity_id: 'the-crane', predicate: 'condition', value: 'wrecked' });
    ev.canonical_effects.push({ op: 'set', fact: { entity_id: 'the-crane', predicate: 'condition', value: 'wrecked' }, until: 'lasting' });
    const y = makeEngine();
    (y.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
    y.model.on('profile', null, PROFILE);
    y.model.on('persona_abilities', null, { abilities: [], setting: [] });
    await y.engine.bind(JSON.stringify(raw), { startTick: tick(1, 6, 0), mode: 'new' });
    await y.engine.reconcile('test');
    const msg = 'The gunman fires from the crane; I shoot out the crane.';
    y.host.addUser(msg);
    y.model.on('extract_user', (i) => i.message === msg, { fight: { state: 'starts', participants: ['council'], things: [{ quote: 'fires from the crane', what: 'a dock crane a gunman fires down from' }], why: 'x' } }, true);
    y.model.on('combat_who', null, { people: [], things: [{ seen: 1, id: 'cb-crane', why: 'the crane' }] });
    const asked: any[] = [];
    y.model.on('combat', (i) => i.player_message === msg, (i: any) => {
      asked.push(i);
      return { reasoning: 'x', exchanges: [{ actor: 'council', text: 'The crane shudders.', basis: [{ ref: 'judgement' }] }], statuses: [], over: false,
        stops: [i.not_destroyed ? { node: 'cb-crane', how: 'switched_off', why: 'its power cut' } : { node: 'cb-crane', why: 'shot to pieces' }] };
    });
    y.model.draft('The crane shudders. [AS12]');
    y.model.on('evaluate', null, { scene_end: at(1, 6, 10) });
    await y.engine.runOperation('normal');
    expect(asked).toHaveLength(2);
    expect(asked[0].canon_fixed.map((f: any) => f.who)).toEqual(['the-crane | The harbor crane']);
    expect(asked[1].not_destroyed).toEqual(['cb-crane | Dock crane']);
    const r = y.engine.combatView(false)!.rulings[0];
    expect(r.notes.join(' ')).toMatch(/which only a later event of the story does \(ruled again\)/);
    expect(r.notes.join(' ')).not.toMatch(/still destroys/);
    expect(r.ended).toHaveLength(1);
  });
});

