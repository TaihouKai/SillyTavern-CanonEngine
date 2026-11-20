import { describe, expect, it } from 'vitest';
import { makeEngine, tick, at } from './fake';
import { demoRaw } from './helpers';
import { fightNow, linksOf, statusesOf, styleOf } from '../../src/core/combat';

const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker who boxed as a youth', public_identity: 'works the piers' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };
const PERSONA = 'Ash, a dock worker. Boxed as a youth: a hard right hook. Carries no weapon.';
type X = ReturnType<typeof makeEngine>;

async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: PERSONA });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(JSON.stringify(demoRaw()), { startTick: tick(1, 6, 0), mode: 'new' });
  await x.engine.reconcile('test');
  x.host.addUser('I look around the harbor.');
  x.model.draft('The harbor at dawn. [F0]');
  await x.engine.runOperation('normal');
  return x;
}
const me = (x: X) => x.engine.playerProfile()!.profile.playerId;
const st = (x: X) => x.engine.current!.replay.state;
const L = (x: X) => x.engine.current!.index.pack;
const ctx = (x: X) => String(x.model.tasks('draft').at(-1)!.input.engineContext);
async function turn(x: X, user: string, draft: string, opts: { extract?: any; evaluate?: any; combat?: any; fill?: any } = {}) {
  x.host.addUser(user);
  if (opts.extract) x.model.on('extract_user', (i) => i.message === user, opts.extract, true);
  if (opts.fill) x.model.on('combat_fill', null, opts.fill, true);
  if (opts.combat) x.model.on('combat', (i) => i.player_message === user, opts.combat);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), { scene_end: at(1, 7, 0), ...(opts.evaluate || {}) });
  return x.engine.runOperation('normal');
}

describe('战斗分析: a fight is judged before the reply', () => {
  it('CF1 the player starts a fight with someone new: they get an identity, what nothing says is filled in, the ruling is judged and given to the GM, its states are recorded', async () => {
    const x = await setup();
    const msg = 'A thug in a yellow jacket grabs my collar. I hit him with my right hook.';
    const ok = await turn(x, msg, 'Your fist lands; he staggers back. [F1]', {
      extract: { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug in a yellow jacket', quote: 'A thug in a yellow jacket' }], why: 'the player hits him' } },
      fill: (i: any) => ({ people: i.people.map((p: any) => ({ who: p.who, links: [{ node: p.who === me(x) ? 'cb-ordinary' : 'cb-ordinary', label: 'is' }, { node: 'cb-firearms', label: 'not a concept' }], style: p.needs_style ? { start: 'picks on the weak', force: 'hits to hurt', response: 'hits back', limit: 'nothing', stop: 'runs when losing' } : null })) }),
      combat: (i: any) => ({ exchanges: [{ actor: me(x), text: 'The hook lands on the thug\'s jaw.', basis: [{ ref: 'judgement' }] }, { actor: i.fighters.find((f: any) => f.id !== me(x)).id, text: 'He staggers back, dazed, and swings wildly.', basis: [{ ref: 'cb-ordinary' }] }], statuses: [{ who: i.fighters.find((f: any) => f.id !== me(x)).id, text: 'dazed', until: { minutes: 5 } }], over: false, stop_at: 'his wild swing comes at Ash' }),
    });
    expect(ok).toBe(true);
    const f = fightNow(st(x));
    expect(f.ongoing).toBe(true);
    const thug = f.participants.find((p) => p !== me(x))!;
    expect(thug).toMatch(/^rt\./);
    expect(st(x).runtimeEntities.get(thug)?.name).toBe('Thug');
    // what nothing said, filled in (lowest source); a non-concept is refused
    expect(linksOf(L(x), st(x), thug).map((l) => `${l.node}:${l.source}`)).toEqual(['cb-ordinary:fill']);
    expect(styleOf(L(x), st(x), thug)).toMatchObject({ source: 'fill', style: { stop: 'runs when losing' } });
    // the fill call got the concepts as its menu; the analysis got the persona as a source and the player's words
    expect(x.model.tasks('combat_fill').at(-1)!.input.concepts).toContain('cb-ordinary | Ordinary person | An untrained adult with no weapon.');
    const ci = x.model.tasks('combat').at(-1)!.input;
    expect(ci.sources.map((s: any) => s.ref)).toEqual(['persona']);
    expect(ci.player_message).toBe(msg);
    expect(ci.nodes.map((n: any) => n.id)).toContain('cb-ordinary');
    // the GM writes the ruling; no 角色盘算 in a judged fight
    expect(ctx(x)).toContain('COMBAT RULING (binding');
    expect(ctx(x)).toContain("1. Ash: The hook lands on the thug's jaw.");
    expect(ctx(x)).toContain('End the reply at this point: his wild swing comes at Ash');
    expect(x.model.tasks('mind').length).toBe(0);
    // the reviewer was given the ruling; its states are recorded with the reply, and kept with it for the panel
    expect(x.model.tasks('evaluate').at(-1)!.input.fight_ruling.exchanges[1]).toMatch(/staggers back/);
    expect(statusesOf(st(x), thug, tick(1, 6, 2)).map((s) => s.text)).toEqual(['dazed']);
    expect(statusesOf(st(x), thug, tick(1, 6, 6)).map((s) => s.text)).toEqual([]); // five minutes from the start of the turn
    const gm = x.engine.current!.replay.applied.at(-1)!.interp;
    expect(gm.combat?.exchanges.length).toBe(2);
  });

  it('CF2 the player\'s words stand unless an objective mechanism stops them: a node reached through filled-in links or none is not one; the Persona quoted is', async () => {
    const x = await setup();
    const msg = 'I punch the thug and knock him out cold.';
    const start = { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'the thug' }] } };
    await turn(x, msg, 'He goes down. [F2]', {
      extract: start,
      fill: (i: any) => ({ people: i.people.map((p: any) => ({ who: p.who, links: [{ node: 'cb-soldier', label: 'is' }], style: p.needs_style ? { start: 'x', force: 'x', response: 'x', limit: 'x', stop: 'x' } : null })) }),
      combat: (i: any) => i.outcomes_that_stand
        ? { player_outcomes: [{ quote: 'knock him out cold', stands: true }], exchanges: [{ actor: me(x), text: 'The punch knocks him out cold.', basis: [{ ref: 'judgement' }] }], statuses: [], over: true, over_why: 'he is out' }
        : { player_outcomes: [{ quote: 'knock him out cold', stands: false, basis: [{ ref: 'cb-soldier' }], why: 'soldiers block' }], exchanges: [{ actor: i.fighters.find((f: any) => f.id !== me(x)).id, text: 'He blocks the punch; trained soldiers do.', basis: [{ ref: 'cb-soldier' }] }], statuses: [], over: false },
    });
    // stopped through a filled-in link only: asked again with the player's words standing
    const ruling = x.engine.current!.replay.applied.at(-1)!.interp.combat!;
    expect(x.model.tasks('combat').at(-1)!.input.outcomes_that_stand).toEqual(['knock him out cold']);
    expect(ruling.exchanges.map((e) => e.text)).toEqual(['The punch knocks him out cold.']);
    expect(ruling.outcomes).toEqual([{ quote: 'knock him out cold', stands: true, why: '', basis: [] }]);
    expect(fightNow(st(x)).ongoing).toBe(false);

    const msg2 = 'I punch Mira, my fist breaks her jaw.';
    await turn(x, msg2, 'Ash cannot reach. [F3]', {
      extract: { fight: { state: 'starts', participants: ['mira'] } },
      combat: () => ({ player_outcomes: [{ quote: 'my fist breaks her jaw', stands: false, basis: [{ ref: 'persona', quote: 'Carries no weapon.' }], why: 'the Persona' }], exchanges: [{ actor: me(x), text: 'The punch glances off.', basis: [{ ref: 'persona', quote: 'Carries no weapon.' }] }], statuses: [], over: true, over_why: 'Ash walks away' }),
    });
    const r2 = x.engine.current!.replay.applied.at(-1)!.interp.combat!;
    expect(r2.outcomes[0]).toMatchObject({ quote: 'my fist breaks her jaw', stands: false });
    expect(r2.stands).toEqual([]);
    expect(ctx(x)).toContain('Does NOT happen as the player wrote «my fist breaks her jaw»: the Persona');
    expect(fightNow(st(x)).ongoing).toBe(false);
  });

  it('CF2b the 对抗倾向 of a fighter can be cited for how they act (its own words), but it never stops what the player wrote', async () => {
    const x = await setup();
    const start = { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'the thug' }] } };
    const style = { start: 'picks fights with the weak', force: 'holds nothing back', response: 'is clumsy up close and backs away', limit: 'nobody', stop: 'runs when hurt' };
    await turn(x, 'I punch the thug in the face.', 'He staggers back. [F2b]', {
      extract: start,
      fill: (i: any) => ({ people: i.people.map((p: any) => ({ who: p.who, links: [{ node: 'cb-soldier', label: 'is' }], style: p.needs_style ? style : null })) }),
      combat: (i: any) => {
        const thug = i.fighters.find((f: any) => f.id !== me(x)).id;
        return i.outcomes_that_stand
          ? { player_outcomes: [{ quote: 'punch the thug in the face', stands: true }], exchanges: [{ actor: thug, text: 'Hit, he backs away.', basis: [{ ref: `style:${thug}`, quote: 'is clumsy up close and backs away' }, { ref: `style:${thug}`, quote: 'words he never had' }] }], statuses: [], over: false, stop_at: 'x' }
          : { player_outcomes: [{ quote: 'punch the thug in the face', stands: false, basis: [{ ref: `style:${thug}`, quote: 'runs when hurt' }], why: 'he runs' }], exchanges: [], statuses: [], over: false, stop_at: 'x' };
      },
    });
    const ruling = x.engine.current!.replay.applied.at(-1)!.interp.combat!;
    expect(ruling.outcomes[0]).toMatchObject({ stands: true });   // a 对抗倾向 is not an objective mechanism
    expect(ruling.exchanges[0].basis.map((b) => b.quote)).toEqual(['is clumsy up close and backs away']);   // words it does not have are left out
    expect(ruling.exchanges[0].unsupported).toBeUndefined();
    expect(x.engine.combatView(false)!.rulings[0].exchanges[0].basis[0]).toBe('Thug的对抗倾向「is clumsy up close and backs away」');
  });

  it('CF3 the reply is held to the ruling: a departure is sent back; with no fight, one the reply starts stops where it begins, and one it decides is sent back', async () => {
    const x = await setup();
    await turn(x, 'I swing at the thug.', 'The thug ducks. [F4a]', {
      extract: { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'the thug' }] } },
      combat: (i: any) => ({ exchanges: [{ actor: i.fighters.find((f: any) => f.id !== me(x)).id, text: 'He ducks the swing.', basis: [{ ref: 'judgement' }] }], statuses: [], over: false }),
      evaluate: { ruling_conflicts: [{ quote: '[F4a]', why: 'the reply has the thug fall' }] },
    });
    expect(x.engine.lastTimings!.repairs!.flat().join(' ')).toMatch(/departs from the combat ruling/);

    const y = await setup();
    expect(ctx(y)).toContain('FIGHTS (Canon Engine judges every fight');
    await turn(y, 'I walk to the pier.', 'A man lunges at you with a knife. [F5]', { evaluate: { fight: { starts: true, participants: [me(y), 'mira'], resolved_unruled: false, quote: '[F5]' } } });
    expect(fightNow(st(y))).toMatchObject({ ongoing: true, source: 'engine' });
    const z = await setup();
    await turn(z, 'I walk to the pier.', 'A man lunges and you beat him senseless. [F6]', { evaluate: { fight: { starts: true, participants: [me(z), 'mira'], resolved_unruled: true, quote: '[F6]' } } });
    expect(z.engine.lastTimings!.repairs!.flat().join(' ')).toMatch(/decides a fight Canon Engine has not judged/);
  });

  it('CF4 states a reply shows are recorded with their words; without them nothing is', async () => {
    const x = await setup();
    await turn(x, 'I help Mira carry the crates.', 'Mira twists her ankle on the ramp. [F7]', { evaluate: { statuses: [
      { who: 'mira', text: 'twisted ankle', until: 'lasting', quote: 'Mira twists her ankle' },
      { who: 'mira', text: 'drunk', quote: 'nowhere in the reply' },
    ] } });
    expect(statusesOf(st(x), 'mira').map((s) => s.text)).toEqual(['twisted ankle']);
  });
});

describe('states for the game master', () => {
  it('CF5 the GM and the reviewer see the states of the people here; over ones are gone', async () => {
    const x = await setup();
    await turn(x, 'I help Mira carry the crates.', 'Mira cuts her hand on a nail. [F8]', { evaluate: { present: ['mira'], statuses: [{ who: 'mira', text: 'cut hand', until: { minutes: 600 }, quote: 'Mira cuts her hand' }] } });
    await turn(x, 'We keep working.', 'You work on. [F9]');
    expect(ctx(x)).toMatch(/STATES \(状态[^\n]*\n- Mira \[mira\]: cut hand \(until \d+ min from now\)/);
    expect(String(x.model.tasks('evaluate').at(-1)!.input.retrieved_context)).toContain('- Mira [mira]: cut hand');
  });
});

describe('the 战斗 view and the player\'s corrections', () => {
  it('CF6 the view lists the fight, the rulings and everyone\'s states; the player turns the fight on and off, adds and takes away states and sets 对抗倾向', async () => {
    const x = await setup();
    await turn(x, 'I hit the thug.', 'He reels. [F10]', {
      extract: { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'the thug' }] } },
      combat: (i: any) => ({ exchanges: [{ actor: me(x), text: 'Ash hits the thug.', basis: [{ ref: 'judgement' }] }], statuses: [{ who: me(x), text: 'bruised knuckles', until: 'lasting' }], over: false, stop_at: 'he swings back' }),
    });
    let v = x.engine.combatView(false)!;
    expect(v.none).toBe(null);
    expect(v.fight.ongoing).toBe(true);
    expect(v.fight.people.map((p) => p.name)).toEqual(['Ash', 'Thug']);
    expect(v.rulings[0].exchanges[0]).toMatchObject({ who: 'Ash', text: 'Ash hits the thug.', unsupported: true });
    expect(v.people[0]).toMatchObject({ name: 'Ash', player: true, fighting: true, states: [{ text: 'bruised knuckles', source: 'play' }] });
    expect(v.people.find((p) => p.name === 'Mira')!.style!.source).toBe('pack');
    await x.engine.editCombat({ fight: { ongoing: false } });
    expect(fightNow(st(x))).toMatchObject({ ongoing: false, source: 'ui' });
    await x.engine.editCombat({ status: { entity: 'mira', text: 'sprained wrist', count: null, minutes: 120 } });
    await x.engine.editCombat({ status: { entity: me(x), text: 'bruised knuckles', removed: true } });
    await x.engine.editCombat({ style: { entity: 'mira', style: { start: 'never', force: 'none', response: 'hides', limit: 'patients', stop: 'at once' } } });
    v = x.engine.combatView(false)!;
    expect(v.people.find((p) => p.name === 'Mira')).toMatchObject({ states: [{ text: 'sprained wrist', source: 'ui' }], style: { response: 'hides', source: 'ui' } });
    expect(v.people.find((p) => p.name === 'Ash')!.states).toEqual([]);
    await x.engine.editCombat({ fight: { ongoing: true, participants: ['mira', me(x)] } });
    expect(fightNow(st(x))).toMatchObject({ ongoing: true, participants: ['mira', me(x)], source: 'ui' });
  });
});

describe('new people in a fight the player starts', () => {
  it('CF1b someone cited with spans of the message joined by an ellipsis is in the fight (live: the leader of the thugs was dropped)', async () => {
    const x = await setup();
    const msg = '两个染着黄毛的混混堵在巷口，伸手要钱。我没理他们，直接一拳打在领头那个的脸上。';
    await turn(x, msg, 'He reels. [F14]', {
      extract: { fight: { state: 'starts', participants: [me(x), '黄毛混混（领头）', '黄毛混混（同伙）'], new_people: [
        { name: '黄毛混混（领头）', description: '堵路索钱的混混头目', quote: '两个染着黄毛的混混堵在巷口，伸手要钱……直接一拳打在领头那个的脸上' },
        { name: '黄毛混混（同伙）', description: '一起堵路的混混', quote: '两个染着黄毛的混混堵在巷口，伸手要钱' },
      ] } },
    });
    const f = fightNow(st(x));
    expect(f.participants.map((id) => x.engine.current!.index.entityName(id))).toEqual(['Ash', '黄毛混混（领头）', '黄毛混混（同伙）']);
  });
});

describe('the 战斗 page shows the setting and why a ruling went as it did', () => {
  it('CF6b a ruling keeps the analysis\' reasoning and the nodes it was given (cited ones marked); the setting is drawn around a focus (two steps, people only around it), finds nodes by text and people by name, hides a precedent still to come unless spoilers', async () => {
    const x = await setup();
    // a game that has not begun (the player linked to nothing): the setting's core, the node most linked with others
    const start = x.engine.combatView(false)!.setting;
    expect(start.focus!.id).toBe('cb-soldier');
    expect(start.starts.map((p) => p.id).slice(0, 2)).toEqual(['cb-soldier', 'cb-firearms']);
    await turn(x, 'I hit the thug.', 'He reels. [F13]', {
      extract: { fight: { state: 'starts', participants: ['mira'] } },
      combat: () => ({ reasoning: 'Mira only knows first aid, so she cannot block.', exchanges: [{ actor: me(x), text: 'Ash hits Mira.', basis: [{ ref: 'cb-emergency-care' }] }], statuses: [], over: false }),
    });
    const r = x.engine.combatView(false)!.rulings[0];
    expect(r.reasoning).toBe('Mira only knows first aid, so she cannot block.');
    const care = r.walked.find((w) => w.node === 'cb-emergency-care')!;
    expect(care).toMatchObject({ name: 'Emergency care', depth: 1, full: true, via: 'Mira', label: 'has', used: true });
    expect(r.walked.find((w) => w.node === 'cb-ordinary')).toMatchObject({ used: false });
    expect(String(x.model.tasks('combat').at(-1)!.input.nodes.find((n: any) => n.id === 'cb-emergency-care').reached)).toBe('mira has');

    // the setting around a focus: by default the first listed person linked to something (the player is not)
    let s = x.engine.combatView(false)!.setting;
    expect(s.focus).toMatchObject({ id: 'mira', entity: true, out: expect.arrayContaining([{ node: 'cb-emergency-care', name: 'Emergency care', label: 'has' }]) });
    const depth = (v: typeof s) => Object.fromEntries(v.graph.nodes.map((p) => [p.id, p.depth]));
    expect(depth(s)).toEqual({ mira: 0, 'cb-ordinary': 1, 'cb-emergency-care': 1 });   // not the precedent still to come
    expect(s.graph.edges).toEqual(expect.arrayContaining([{ from: 'mira', to: 'cb-emergency-care', label: 'has' }]));
    expect(s.hidden).toBe(1);
    expect(s.byKind.map((k) => k.kind)).toEqual(['concept', 'rule']);
    expect(s.starts.map((p) => p.id)[0]).toBe('mira');
    // a node: its links both ways; two steps out, people only around the focus (the council's gunmen are not drawn)
    s = x.engine.combatView(false, '', 'cb-soldier')!.setting;
    expect(s.focus).toMatchObject({ id: 'cb-soldier', entity: false, out: [{ node: 'cb-firearms', name: 'Firearms', label: 'fights with' }], in: [{ id: 'union', label: 'its fighters are', source: 'pack' }] });
    expect(depth(s)).toEqual({ 'cb-soldier': 0, 'cb-firearms': 1, union: 1 });
    expect(x.engine.combatView(false, '', 'cb-emergency-care')!.setting.focus!.parts.map((p) => p.part)).toEqual(['effect', 'conditions', 'limits']);
    // a query finds nodes by their text and people by name
    const care2 = L(x).combat.nodes.get('cb-emergency-care')!;
    expect(x.engine.combatView(false, care2.parts![0].text.slice(0, 12))!.setting.found).toEqual([{ id: 'cb-emergency-care', name: 'Emergency care', kind: 'ability' }]);
    expect(x.engine.combatView(false, 'mir')!.setting.found).toEqual(expect.arrayContaining([{ id: 'mira', name: 'Mira', kind: 'person' }]));
    // spoilers: the precedent still to come is no focus without them, and drawn with them
    expect(x.engine.combatView(false, '', 'cb-ambush')!.setting.focus!.id).toBe('mira');
    s = x.engine.combatView(true, '', 'mira')!.setting;
    expect(s.hidden).toBe(0);
    expect(s.graph.edges).toEqual(expect.arrayContaining([{ from: 'mira', to: 'cb-ambush', label: null }]));
    expect(x.engine.combatView(true, 'ambush')!.setting.found!.map((n) => n.id)).toEqual(['cb-ambush']);
  });
});

describe('someone here joins', () => {
  it('CF7 a person present who is not in the fight may join it of their own accord: they act, and they are in the fight from then on', async () => {
    const x = await setup();
    await turn(x, 'I talk with Mira on the pier.', 'Mira listens. [F11]', { evaluate: { present: ['mira'] } });
    await turn(x, 'A thug shoves me; I shove him back.', 'He stumbles. [F12]', {
      extract: { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'A thug' }] } },
      combat: (i: any) => ({ joins: i.present.map((p: any) => p.id), player_outcomes: [], exchanges: [{ actor: me(x), text: 'Ash shoves him back.', basis: [{ ref: 'judgement' }] }, { actor: 'mira', text: 'Mira pulls Ash away from him.', basis: [{ ref: 'cb-emergency-care' }] }], statuses: [], over: false }),
    });
    const ci = x.model.tasks('combat').at(-1)!.input;
    expect(ci.present.map((p: any) => p.id)).toEqual(['mira']);
    expect(ci.nodes.map((n: any) => n.id)).toContain('cb-emergency-care');
    const r = x.engine.current!.replay.applied.at(-1)!.interp.combat!;
    expect(r.joined).toEqual(['mira']);
    expect(r.exchanges.map((e) => e.actor)).toContain('mira');
    expect(fightNow(st(x)).participants).toContain('mira');
  });

  it('CF8 someone present whom the ruling has act in the fight has joined it, even when joins leaves them out', async () => {
    const x = await setup();
    await turn(x, 'I talk with Mira on the pier.', 'Mira listens. [F13]', { evaluate: { present: ['mira'] } });
    await turn(x, 'A thug shoves me; I shove him back.', 'He stumbles. [F14]', {
      extract: { fight: { state: 'starts', participants: ['Thug'], new_people: [{ name: 'Thug', description: 'a thug', quote: 'A thug' }] } },
      combat: () => ({ joins: [], player_outcomes: [], exchanges: [{ actor: me(x), text: 'Ash shoves him back.', basis: [{ ref: 'judgement' }] }, { actor: 'Mira', text: 'Mira grabs the thug.', basis: [{ ref: 'judgement' }] }], statuses: [], over: false }),
    });
    const r = x.engine.current!.replay.applied.at(-1)!.interp.combat!;
    expect(r.joined).toEqual(['mira']);
    expect(r.exchanges.map((e) => e.actor)).toContain('mira');
    expect(fightNow(st(x)).participants).toContain('mira');
  });
});
