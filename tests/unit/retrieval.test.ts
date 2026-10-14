// W01–W20: actual-history retrieval by causality OR mention, independent world state, whole-draft
// discovery/coverage and repair rechecks. Inspects the context actually supplied to the generator,
// the evaluator and repairs (not just ledger contents).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ, deferred, D } from './fake';
import { factAt } from '../../src/domain/reducer';
import { retrieve, buildPacket } from '../../src/runtime/context';
import { WorldIndex } from '../../src/domain/world-query';
import { ROOT } from './helpers';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'unrelated-history.canon.json'), 'utf8'));
/** Fixture extension (W09/W17/W18): bridge collapse, contained shop, partial damage, alias collision. */
function fixture() {
  const p = JSON.parse(JSON.stringify(base));
  p.predicates.find((x: any) => x.id === 'condition').allowed_values.push('damaged');
  p.predicates.push({ id: 'located_in', description: 'Known parent place containing this place.', value_type: 'entity_ref' });
  p.predicates.push({ id: 'status', description: 'Institutional status.', value_type: 'string', allowed_values: ['active', 'dissolved'] });
  const src = ['example-source'];
  p.entities.push(
    { id: 'east-bridge', name: 'East Bridge', aliases: ['东桥'], kind: 'place', static_description: 'A stone bridge east of the harbor.', source_refs: src },
    { id: 'spice-shop', name: 'Spice Shop', aliases: ['香料铺'], kind: 'place', static_description: 'A small shop inside Old Market.', source_refs: src },
    { id: 'lantern-stall', name: 'Lantern Stall', aliases: [], kind: 'place', static_description: 'A stall in the north district.', source_refs: src },
    { id: 'north-district', name: 'North District', aliases: [], kind: 'place', static_description: 'A harbor district.', source_refs: src },
    { id: 'kai-smith', name: 'Kai Smith', aliases: ['Kai'], kind: 'person', static_description: 'A blacksmith.', source_refs: src },
    { id: 'kai-fisher', name: 'Kai Fisher', aliases: ['Kai'], kind: 'person', static_description: 'A fisher.', source_refs: src },
  );
  const fact = (e: string, pr: string, v: any) => ({ fact: { entity_id: e, predicate: pr, value: v }, source_refs: src, note: '' });
  p.initial_state.facts.push(fact('east-bridge', 'condition', 'intact'), fact('spice-shop', 'located_in', 'old-market'), fact('lantern-stall', 'located_in', 'north-district'), fact('north-district', 'condition', 'intact'), fact('council', 'status', 'active'));
  const ev = JSON.parse(JSON.stringify(p.events.find((e: any) => e.id === 'market-destruction')));
  Object.assign(ev, { id: 'bridge-collapse', title: 'East Bridge collapse', summary: 'Floodwater undermines East Bridge; it collapses. Unrelated to the conflict.', entity_ids: ['east-bridge'], location_ids: ['east-bridge'] });
  ev.when = { ...ev.when, earliest: { day: 1, minute: 960 }, latest: { day: 1, minute: 960 }, label: 'Day 1, 16:00' };
  ev.canonical_preconditions = { all: [{ fact: { entity_id: 'east-bridge', predicate: 'condition', value: 'intact' } }] };
  ev.outcomes = [{ entity_id: 'east-bridge', predicate: 'condition', value: 'destroyed' }];
  ev.canonical_effects = [{ op: 'set', fact: { entity_id: 'east-bridge', predicate: 'condition', value: 'destroyed' } }];
  p.events.push(ev);
  return JSON.stringify(p);
}
const PACK = fixture();
type X = ReturnType<typeof makeEngine>;
const st = (x: X) => x.engine.current!.replay.state;
const lastDraftCtx = (x: X) => String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
const section = (t: string, a: string, b: string) => { const i = t.indexOf(a); if (i < 0) return ''; const j = t.indexOf(b, i + a.length); return t.slice(i, j < 0 ? undefined : j); };
const HIST = (t: string) => section(t, 'ACTUAL HISTORY (retrieved', 'ENTITY / SCENE STATE');
const STATE = (t: string) => section(t, 'ENTITY / SCENE STATE', '\n\n');

async function setup(start = tick(2, 8)) {
  const x = makeEngine();
  await x.engine.bind(PACK, { startTick: start, mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}
async function turn(x: X, user: string, draft: string | string[], evalPatches: Record<string, any> = {}, extract?: any) {
  x.host.addUser(user);
  for (const d of Array.isArray(draft) ? draft : [draft]) x.model.draft(d);
  for (const [marker, patch] of Object.entries(evalPatches)) x.model.on('evaluate', (i) => String(i.candidate).includes(marker), patch);
  if (extract) x.model.on('extract_user', (i) => i.message === user, extract, true);
  return x.engine.runOperation('normal');
}
const ref = (phrase: string, kind: string, extra: any = {}) => ({ phrase, quote: extra.quote || phrase, kind, mode: extra.mode || 'direct', candidates: extra.candidates || [] });

describe('W: actual history and world state', () => {
  it('W05 timeskip crosses the unrelated FREE market destruction while the player is elsewhere', async () => {
    const x = await setup(tick(1, 7));
    expect(await turn(x, 'I sleep at the inn until morning.', 'You sleep until dawn. [W5]', { '[W5]': { scene_end: at(2, 8) } })).toBe(true);
    const s = st(x);
    expect(factAt(s, 'old-market', 'condition').value).toBe('destroyed');
    const o = [...s.occurrences.values()].find((v) => v.packEventId === 'market-destruction')!;
    expect(o.origin).toBe('offscreen');
    const rec = s.recordById.get(o.recordId)!;
    expect(rec.triggerCommitId).toBeTruthy(); // committed with the triggering time advance
    expect(x.host.chat.slice(-1)[0].text).not.toMatch(/explosion/i); // no forced player involvement
  });

  it('W01 causal retrieval without mention — player, GM/NPC and adjudicated-canon origins (+ semantic expansion)', async () => {
    const x = await setup();
    // player-caused runtime event
    await turn(x, 'I secretly take the key from the desk.', 'You pocket the key. [P1]', { '[P1]': { new_entities: [{ ref: 'pl', name: 'Traveler', kind: 'person', description: 'the player', quote: 'You pocket the key' }], occurrences: [occ('o1', 'Player took the archive key', 'You pocket the key', { origin: 'player', actors: ['pl'], affected: ['archive-key', 'archivist'], visibility: 'secret', knowers: ['pl'] })], transitions: [{ op: 'set', entity_id: 'archive-key', predicate: 'holder', value: 'pl', quote: 'You pocket the key', occurrence_ref: 'o1' }], scene_entities: ['archive-key'] } });
    await turn(x, 'I go back to the archive door.', 'The archivist searches his drawers. [P2]', {}, { scene_entities: ['archive-key'] });
    expect(HIST(lastDraftCtx(x))).toContain('Player took the archive key');
    // GM/NPC-caused event
    const y = await setup();
    await turn(y, 'I wait in the square.', 'A gull steals the courier\'s satchel. [G1]', { '[G1]': { occurrences: [occ('o1', 'Gull stole the courier satchel', 'A gull steals the courier', { origin: 'gm', affected: ['courier'] })], transitions: [] } });
    await turn(y, 'I greet the courier.', 'The courier looks flustered. [G2]', {}, { references: [ref('courier', 'entity', { candidates: ['courier'] })] });
    expect(HIST(lastDraftCtx(y))).toContain('Gull stole the courier satchel');
    // adjudicated canon: market destruction is a route constraint the user never names
    const z = await setup();
    await turn(z, 'I take the shortest way to the harbor.', 'You set off. [C1]', {}, { scene_entities: ['old-market'] });
    expect(HIST(lastDraftCtx(z))).toMatch(/Old Market explosion/);
    expect(STATE(lastDraftCtx(z))).toContain('condition=destroyed');
    // semantic expansion with no explicit edge/identity: paraphrase of the loan
    const ctx = retrieve(z.engine.current!.index, { refs: [], claims: [], sceneEntityIds: [], causalSeedEntityIds: [], freeText: ['that errand when the archivist lent the archive key'], checkpointTick: tick(2, 8) });
    expect([...ctx.occurrences.keys()].map((id) => z.engine.current!.index.state.occurrences.get(id)!.title)).toContain('Archive key loan');
  });

  it('W02 a directly mentioned unrelated event is retrieved for all three origins, even with no causal link', async () => {
    const x = await setup();
    await turn(x, 'I help a stranded fisherman ashore.', 'You haul the fisherman out. [R0]', { '[R0]': { new_entities: [{ ref: 'f', name: 'Old fisherman', kind: 'person', description: 'rescued fisherman', quote: 'You haul the fisherman out' }], occurrences: [occ('o1', 'Player rescued the drowning fisherman', 'You haul the fisherman out', { origin: 'player', affected: ['f'], ref_phrases: ['the rescue at the pier'] })] } });
    await turn(x, 'I chat about the weather.', 'Clouds gather. [R1]', { '[R1]': { occurrences: [occ('o1', 'Harbormaster rang the storm bell', 'Clouds gather', { origin: 'gm', ref_phrases: ['the storm bell'] })] } });
    await turn(x, 'I tell everyone about the rescue at the pier, the storm bell and the market explosion.', 'They listen. [R2]', {}, { references: [ref('the rescue at the pier', 'event'), ref('the storm bell', 'event'), ref('the market explosion', 'event')] });
    const h = HIST(lastDraftCtx(x));
    expect(h).toContain('Player rescued the drowning fisherman');
    expect(h).toContain('Harbormaster rang the storm bell');
    expect(h).toContain('Old Market explosion');
    expect(h).toMatch(/retrieved because: mentioned/);
  });

  it('W03 indirect references, aliases and an ambiguous name are resolved or explicitly kept ambiguous', async () => {
    const x = await setup();
    await turn(x, 'I pull a man from the water.', 'You save him. [I0]', { '[I0]': { new_entities: [{ ref: 'f', name: 'Bram', kind: 'person', description: 'a drowning man', quote: 'You save him' }], occurrences: [occ('o1', 'Player rescued Bram from drowning', 'You save him', { origin: 'player', affected: ['f'] })] } });
    await turn(x, 'I visit the man I rescued, walk past 旧市场 and ask Kai for news.', 'You walk on. [I1]', {}, { references: [ref('the man I rescued', 'entity', { mode: 'indirect' }), ref('旧市场', 'entity', { mode: 'alias' }), ref('Kai', 'entity')] });
    const ctx = lastDraftCtx(x);
    expect(HIST(ctx)).toContain('Player rescued Bram from drowning');
    expect(STATE(ctx)).toMatch(/Old Market \[old-market\][^\n]*condition=destroyed/);
    expect(ctx).toMatch(/AMBIGUOUS REFERENCES[\s\S]*Kai: (kai-smith \| kai-fisher|kai-fisher \| kai-smith)/);
  });

  it('W04 after the key is returned, a mention of the loan retrieves loan + return; also a player theft followed by return', async () => {
    const x = await setup();
    await turn(x, 'I ask the courier what happened when he borrowed the archive key.', 'He shrugs. [L1]', {}, { references: [ref('borrowed the archive key', 'event')] });
    const h = HIST(lastDraftCtx(x));
    expect(h).toContain('Archive key loan');
    expect(h).toContain('Archive key return');
    expect(h).toMatch(/later changes: .*holder -> "archivist"/);
    expect(factAt(st(x), 'archive-key', 'holder').value).toBe('archivist');
    // player theft then return
    await turn(x, 'I steal the key.', 'You take the key. [L2]', { '[L2]': { new_entities: [{ ref: 'pl', name: 'Traveler', kind: 'person', description: 'player', quote: 'You take the key' }], occurrences: [occ('o1', 'Player stole the archive key', 'You take the key', { origin: 'player', actors: ['pl'], affected: ['archive-key'] })], transitions: [{ op: 'set', entity_id: 'archive-key', predicate: 'holder', value: 'pl', quote: 'You take the key', occurrence_ref: 'o1' }] } });
    await turn(x, 'I return the key.', 'You hand it back. [L3]', { '[L3]': { occurrences: [occ('o1', 'Player returned the archive key', 'You hand it back', { origin: 'player', affected: ['archive-key', 'archivist'] })], transitions: [{ op: 'set', entity_id: 'archive-key', predicate: 'holder', value: 'archivist', quote: 'You hand it back', occurrence_ref: 'o1' }] } });
    // the extractor maps the paraphrase ("theft" vs "stole") to an id from the offered catalogue
    await turn(x, 'Someone asks about my theft of the key.', 'Silence. [L4]', {}, (i: any) => ({ references: [ref('my theft of the key', 'event', { candidates: i.occurrences.filter((o: any) => /stole/.test(o.title)).map((o: any) => o.id) })] }));
    const h2 = HIST(lastDraftCtx(x));
    expect(h2).toContain('Player stole the archive key');
    expect(h2).toContain('Player returned the archive key');
  });

  it('W06 a user-named route through the market gets the destroyed condition and supporting history before generation', async () => {
    const x = await setup();
    await turn(x, 'I go through the Old Market to reach the harbor.', 'You walk. [M1]', {}, { references: [ref('Old Market', 'entity', { candidates: ['old-market'] })] });
    const ctx = lastDraftCtx(x);
    expect(STATE(ctx)).toMatch(/condition=destroyed \(since D1 15:00/);
    expect(HIST(ctx)).toContain('Old Market explosion');
  });

  it('W07 GM draft first introduces shopping at the destroyed market -> fresh lookup -> rejected -> repair receives history', async () => {
    const x = await setup();
    x.model.on('discover', (i) => String(i.text).includes('[S1]'), { references: [{ id: 'r1', quote: 'Old Market', phrase: 'Old Market', ref_kind: 'place', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: [] }], claims: [{ id: 'c1', quote: 'buy an apple from a busy stall', kind: 'operation', entity_phrases: ['Old Market'], assertion: 'narrator', expected: { entity_id: 'old-market', predicate: 'condition', value: 'intact' } }] });
    expect(await turn(x, 'I head to the harbor.', ['You cut through Old Market and buy an apple from a busy stall. [S1]', 'You skirt the ruins of Old Market. [S2]'])).toBe(true);
    const evals = x.model.tasks('evaluate').filter((c) => c.input.mode === 'draft');
    expect(STATE(evals[0].input.retrieved_context)).toContain('condition=destroyed');
    const repair = x.model.tasks('draft')[1].input;
    expect(repair.instruction).toMatch(/presupposes Old Market\.condition="intact"/);
    expect(STATE(repair.engineContext)).toContain('condition=destroyed');
    expect(x.host.chat.slice(-1)[0].text).toContain('[S2]');
  });

  it('W08 a draft-only mention of an unrelated old event loads its record into the final review even when accurate; false actors are caught', async () => {
    const x = await setup();
    x.model.on('discover', (i) => String(i.text).includes('[A'), { references: [{ id: 'r1', quote: 'the archive key errand', phrase: 'the archive key errand', ref_kind: 'event', mode: 'indirect', assertion: 'narrator', temporal: 'past', candidate_ids: [] }], claims: [{ id: 'c1', quote: 'the archive key errand', kind: 'recollection', entity_phrases: [], assertion: 'narrator', expected: null }] });
    expect(await turn(x, 'I chat with the courier.', 'He mentions the archive key errand from yesterday. [A1]')).toBe(true);
    const ev = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(HIST(ev.retrieved_context)).toContain('Archive key loan');
    expect(HIST(ev.retrieved_context)).toContain('lends the Archive Key to the courier');
    // false actor -> contradiction verdict -> repaired
    x.model.on('evaluate', (i) => String(i.candidate).includes('[A2]'), { claim_checks: [{ claim_id: 'c1', verdict: 'contradiction', record_ids: [], note: 'the archivist lent it to the courier, not the Council' }] });
    expect(await turn(x, 'I ask more.', ['The Council ran the archive key errand. [A2]', 'He recalls the archive key errand. [A3]'])).toBe(true);
    expect(x.host.chat.slice(-1)[0].text).toContain('[A3]');
  });

  it('W09 a repair that introduces a demolished bridge is discovered, queried and checked again (first coverage cannot authorize it)', async () => {
    const x = await setup();
    x.model.on('discover', (i) => String(i.text).includes('[B1]'), { references: [{ id: 'r1', quote: 'Old Market', phrase: 'Old Market', ref_kind: 'place', assertion: 'narrator', temporal: 'present', candidate_ids: ['old-market'] }], claims: [{ id: 'c1', quote: 'busy stalls', kind: 'operation', entity_phrases: ['Old Market'], assertion: 'narrator', expected: { entity_id: 'old-market', predicate: 'condition', value: 'intact' } }] });
    x.model.on('discover', (i) => String(i.text).includes('[B2]'), { references: [{ id: 'r2', quote: 'East Bridge', phrase: 'East Bridge', ref_kind: 'place', assertion: 'narrator', temporal: 'present', candidate_ids: [] }], claims: [{ id: 'c2', quote: 'cross the crowded East Bridge', kind: 'operation', entity_phrases: ['East Bridge'], assertion: 'narrator', expected: { entity_id: 'east-bridge', predicate: 'condition', value: 'intact' } }] });
    expect(await turn(x, 'I head east.', ['Busy stalls line Old Market. [B1]', 'You cross the crowded East Bridge. [B2]', 'You wade the shallows below the broken bridge. [B3]'])).toBe(true);
    const evals = x.model.tasks('evaluate').filter((c) => c.input.mode === 'draft');
    if (evals.length !== 3) console.log(JSON.stringify(x.engine.lastTrace), JSON.stringify(x.engine.notices));
    expect(evals.length).toBe(3);
    expect(STATE(evals[1].input.retrieved_context)).toMatch(/East Bridge \[east-bridge\][^\n]*condition=destroyed/);
    const traceAttempts = x.engine.lastTrace!.attempts;
    expect(traceAttempts[1].violations.join(' ')).toMatch(/East Bridge\.condition/);
    expect(new Set(traceAttempts.map((a) => a.candidateHash)).size).toBe(3);
    const man = Object.values(x.engine.campaign()!.manifests).slice(-1)[0];
    expect(man.attempt).toBe(2);
  });

  it('W10 implicit contradictions: dead NPC greeting, using a missing key, a dissolved organization operating; established exceptions remain possible', async () => {
    const x = await setup();
    await turn(x, 'I watch the square.', 'A falling beam kills Mira. [D0]', { '[D0]': { occurrences: [occ('o1', 'Mira killed by a falling beam', 'kills Mira', { affected: ['mira'] })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false, quote: 'kills Mira', occurrence_ref: 'o1' }] } });
    x.model.on('extract_user', (i) => i.message.includes('dissolved'), { statements: [{ kind: 'asserted_fact', quote: 'The Council was dissolved', summary: 'council dissolved', entities: ['council'], facts: [{ entity_id: 'council', predicate: 'status', value: 'dissolved' }], event_id: null, time: null, ambiguous: false }] });
    await turn(x, 'The Council was dissolved last night.', 'Noted. [D1]');
    for (const [marker, claim] of [['[G1]', { entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira greets you warmly' }], ['[K1]', { entity_id: 'archive-key', predicate: 'holder', value: 'courier', quote: 'The courier unlocks the archive with his key' }], ['[O1]', { entity_id: 'council', predicate: 'status', value: 'active', quote: 'Council clerks stamp your petition' }]] as const) {
      const y = x;
      y.host.addUser('I look around.');
      y.model.draft(`${claim.quote}. ${marker}`, `${claim.quote}. ${marker}`, `${claim.quote}. ${marker}`);
      y.model.on('evaluate', (i) => String(i.candidate).includes(marker), { state_claims: [claim] });
      expect(await y.engine.runOperation('normal')).toBe(false);
      expect(y.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/presupposes/);
      y.host.chat.pop();
      y.engine.campaign()!.recoveryState = { status: 'ok' };
    }
    // a genuine established exception: the reply itself depicts a supported change with its own occurrence
    x.host.addUser('I use the resurrection relic on Mira.');
    x.model.draft('The relic flares; Mira breathes again and greets you. [X1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[X1]'), { occurrences: [occ('o1', 'Mira resurrected by the relic', 'Mira breathes again', { origin: 'player', affected: ['mira'] })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira breathes again', occurrence_ref: 'o1' }], state_claims: [{ entity_id: 'mira', predicate: 'alive', value: true, quote: 'greets you' }], player_actions: [{ quote: 'The relic flares', authorized_by_quote: 'I use the resurrection relic on Mira' }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect([...st(x).occurrences.values()].some((o) => o.title === 'Mira killed by a falling beam')).toBe(true);
  });

  it('W11 checkpoint-correct claims: flashback uses then-valid facts; present claims use current facts; changes cannot validate themselves', async () => {
    const x = await setup();
    expect(await turn(x, 'I remember yesterday.', 'Yesterday morning the market bustled with traders. [F1]', { '[F1]': { flashback: true, state_claims: [{ entity_id: 'old-market', predicate: 'condition', value: 'intact', quote: 'Yesterday morning the market bustled', at: D(1, 9) }] } })).toBe(true);
    x.host.addUser('I look at the market now.');
    x.model.draft('The market bustles today. [F2]', 'The market bustles today. [F2]', 'The market bustles today. [F2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[F2]'), { state_claims: [{ entity_id: 'old-market', predicate: 'condition', value: 'intact', quote: 'The market bustles today', at: null }], transitions: [{ op: 'set', entity_id: 'old-market', predicate: 'condition', value: 'intact', quote: 'The market bustles today', occurrence_ref: null }] });
    expect(await x.engine.runOperation('normal')).toBe(false); // a bare claimed restoration cannot establish itself
  });

  it('W12 ruins are visible without disclosing the culprit; a rumor stays a belief', async () => {
    const x = await setup();
    await turn(x, 'Who blew it up?', 'You see blackened ruins. [K1]', {}, { references: [ref('Old Market', 'entity', { candidates: ['old-market'] })] });
    expect(STATE(lastDraftCtx(x))).toContain('condition=destroyed');
    x.model.on('discover', (i) => String(i.text).includes('[K2]'), { references: [], claims: [{ id: 'c1', quote: 'the Council blew up the market', kind: 'causal', entity_phrases: ['Old Market'], assertion: 'rumor', expected: null }] });
    x.model.on('evaluate', (i) => String(i.candidate).includes('[K2]'), { claim_checks: [{ claim_id: 'c1', verdict: 'belief_ok', record_ids: [], note: 'rumor; actual cause was an accidental fuel explosion' }] });
    expect(await turn(x, 'I listen to gossip.', 'A drunk insists the Council blew up the market. [K2]')).toBe(true);
    expect([...st(x).occurrences.values()].find((o) => o.packEventId === 'market-destruction')!.account).toMatch(/accidental/);
  });

  it('W13 after a supported restoration, current state is restored while history returns destruction AND restoration', async () => {
    const x = await setup();
    await turn(x, 'I fund the rebuilding.', 'Masons rebuild the market by evening. [Z1]', { '[Z1]': { scene_end: at(2, 20), occurrences: [occ('o1', 'Old Market rebuilt', 'Masons rebuild the market', { origin: 'player', affected: ['old-market'], locations: ['old-market'] })], transitions: [{ op: 'set', entity_id: 'old-market', predicate: 'condition', value: 'intact', quote: 'Masons rebuild the market', occurrence_ref: 'o1' }], player_actions: [{ quote: 'Masons rebuild', authorized_by_quote: 'I fund the rebuilding' }] } });
    await turn(x, 'People talk about the old explosion at the market.', 'They remember. [Z2]', {}, { references: [ref('the old explosion at the market', 'event')] });
    const ctx = lastDraftCtx(x);
    expect(HIST(ctx)).toContain('Old Market explosion');
    expect(HIST(ctx)).toContain('Old Market rebuilt');
    expect(factAt(st(x), 'old-market', 'condition').value).toBe('intact');
  });

  it('W14 deleting the only source of a player- or GM-caused change rebuilds everything and exposes an incompatible suffix (both roles)', async () => {
    for (const role of ['user', 'gm'] as const) {
      const x = await setup();
      if (role === 'user') {
        x.model.on('extract_user', (i) => i.message.includes('burn'), { statements: [{ kind: 'asserted_fact', quote: 'the North District has burned', summary: 'district damaged', entities: ['north-district'], facts: [{ entity_id: 'north-district', predicate: 'condition', value: 'damaged' }], event_id: null, time: null, ambiguous: false }] });
        x.host.addUser('I hear the North District has burned.');
        x.model.draft('Smoke rises in the east. [Y0]');
        await x.engine.runOperation('normal');
      } else {
        await turn(x, 'I look north.', 'Raiders torch the North District. [Y0]', { '[Y0]': { occurrences: [occ('o1', 'Raiders torched the North District', 'Raiders torch the North District', { affected: ['north-district'] })], transitions: [{ op: 'set', entity_id: 'north-district', predicate: 'condition', value: 'damaged', quote: 'Raiders torch the North District', occurrence_ref: 'o1' }] } });
      }
      await turn(x, 'I mourn the district.', 'You stare at the charred district. [Y1]', { '[Y1]': { state_claims: [{ entity_id: 'north-district', predicate: 'condition', value: 'damaged', quote: 'charred district' }] } });
      const srcIdx = role === 'user' ? 1 : 2;
      x.host.edit(srcIdx, role === 'user' ? 'Nothing happens.' : 'Nothing happens in the north. [Y9]');
      x.model.on('evaluate', (i) => i.mode === 'retained' && String(i.candidate).includes('[Y1]'), { decision: 'conflict', violations: [{ code: 'state', quote: 'charred district', detail: 'no surviving source for the damage' }] });
      await x.engine.reconcile('edit');
      expect(factAt(st(x), 'north-district', 'condition').value).toBe('intact');
      expect(x.engine.campaign()!.recoveryState.status).toBe('conflict');
      expect(x.host.chat.some((m) => m.text.includes('[Y1]'))).toBe(true);
    }
  });

  it('W15 deleting the triggering timeskip removes offscreen history; a valid new time path re-adjudicates canon; backup/swipe keep isolation', async () => {
    const x = await setup(tick(1, 7));
    await turn(x, 'I sleep.', 'Dawn. [V1]', { '[V1]': { scene_end: at(2, 8) } });
    expect(factAt(st(x), 'old-market', 'condition').value).toBe('destroyed');
    x.host.remove(2);
    await x.engine.reconcile('delete');
    expect(factAt(st(x), 'old-market', 'condition').value).toBe('intact');
    // still-applicable canon happens again on a new valid path
    x.host.chat.pop();
    await turn(x, 'I nap until evening.', 'Evening. [V2]', { '[V2]': { scene_end: at(1, 18) } });
    expect(factAt(st(x), 'old-market', 'condition').value).toBe('destroyed');
    const b = x.engine.exportBackup();
    x.host.campaignData = null;
    await x.engine.importBackup(b);
    expect(factAt(st(x), 'old-market', 'condition').value).toBe('destroyed');
  });

  it('W16 stale lookup/evaluation after a source edit or chat switch never authorizes commit; rejected drafts never reach publication', async () => {
    for (const mutate of ['edit', 'chat'] as const) {
      const x = await setup();
      x.host.addUser('I walk.');
      const gate = deferred();
      let once = false;
      x.model.taskGate.evaluate = async () => { if (!once) { once = true; await gate.promise; } };
      const op = x.engine.runOperation('normal');
      await new Promise((r) => setTimeout(r, 30));
      if (mutate === 'edit') { x.host.edit(1, 'I run.'); x.engine.sourceChanged('edit'); } else x.host.chatIdValue = 'other-chat';
      gate.resolve();
      expect(await op).toBe(false);
      expect(x.host.chat.filter((m) => m.role === 'gm').length).toBe(1);
      expect(x.host.persisted.chat.filter((m) => m.role === 'gm').length).toBeLessThanOrEqual(1);
    }
  });

  it('W17 UNKNOWN stays explicit; new entities get runtime ids; alias collisions are ambiguous; renaming a destroyed place cannot bypass its history', async () => {
    const x = await setup();
    const view = x.engine.current!.index.entityState('east-bridge', { tick: tick(2, 8) });
    expect(view.facts.find((f) => f.predicate === 'condition')?.value).toBe('destroyed');
    const shop = x.engine.current!.index.entityState('courier', { tick: tick(2, 8) });
    expect(shop.unknown).toContain('alive'); // missing fact is UNKNOWN, not assumed
    x.model.on('evaluate', (i) => String(i.candidate).includes('[N1]'), { new_entities: [{ ref: 'n1', name: 'Old Bazaar', kind: 'place', description: 'a lively bazaar', quote: 'the lively Old Bazaar' }], state_claims: [{ entity_id: 'n1', predicate: 'condition', value: 'intact', quote: 'the lively Old Bazaar' }] });
    x.host.addUser('I wander.');
    x.model.draft('You enter the lively Old Bazaar. [N1]', 'You enter the lively Old Bazaar. [N1]', 'You enter the lively Old Bazaar. [N1]');
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/Old Market\.condition="intact"/);
    x.host.chat.pop();
    x.engine.campaign()!.recoveryState = { status: 'ok' };
    expect(await turn(x, 'I meet a stranger.', 'A tinker named Oda waves. [N2]', { '[N2]': { new_entities: [{ ref: 't', name: 'Oda', kind: 'person', description: 'a tinker', quote: 'A tinker named Oda' }] } })).toBe(true);
    expect([...st(x).runtimeEntities.keys()].some((k) => k.startsWith('rt.oda.'))).toBe(true);
  });

  it('W18 containment: total destruction blocks a contained shop; partial damage and an explicit exception do not', async () => {
    const x = await setup();
    const bad = async (marker: string, claim: any) => {
      x.host.addUser('I shop.');
      x.model.draft(`${claim.quote} ${marker}`, `${claim.quote} ${marker}`, `${claim.quote} ${marker}`);
      x.model.on('evaluate', (i) => String(i.candidate).includes(marker), { state_claims: [claim] });
      const ok = await x.engine.runOperation('normal');
      if (!ok) { x.host.chat.pop(); x.engine.campaign()!.recoveryState = { status: 'ok' }; }
      return ok;
    };
    expect(await bad('[H1]', { entity_id: 'spice-shop', predicate: 'condition', value: 'intact', quote: 'The Spice Shop is open as usual' })).toBe(false);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/inside Old Market/);
    // partial damage of a parent does not imply every building was destroyed
    await turn(x, 'I go north.', 'Part of the north district is damaged. [H2]', { '[H2]': { occurrences: [occ('o1', 'North district partly damaged', 'Part of the north district is damaged', { affected: ['north-district'] })], transitions: [{ op: 'set', entity_id: 'north-district', predicate: 'condition', value: 'damaged', quote: 'Part of the north district is damaged', occurrence_ref: 'o1' }] } });
    expect(await bad('[H3]', { entity_id: 'lantern-stall', predicate: 'condition', value: 'intact', quote: 'The Lantern Stall still sells lamps' })).toBe(true);
    // explicit supported exception inside the destroyed market
    await turn(x, 'I check the spice shop.', 'Against all odds the Spice Shop survived intact. [H4]', { '[H4]': { occurrences: [occ('o1', 'Spice Shop found intact', 'the Spice Shop survived intact', { affected: ['spice-shop'] })], transitions: [{ op: 'set', entity_id: 'spice-shop', predicate: 'condition', value: 'intact', quote: 'the Spice Shop survived intact', occurrence_ref: 'o1' }] } });
    expect(await bad('[H5]', { entity_id: 'spice-shop', predicate: 'condition', value: 'intact', quote: 'The Spice Shop owner greets you' })).toBe(true);
  });

  it('W19 matched history competes for a small budget: compacted, never silently dropped; explicit capacity failure', async () => {
    const x = await setup();
    const index = x.engine.current!.index;
    const r = retrieve(index, { refs: [], claims: [], sceneEntityIds: ['old-market', 'archive-key', 'east-bridge', 'mira'], causalSeedEntityIds: [], freeText: [], checkpointTick: tick(2, 8) });
    const ids = [...r.occurrences.keys()];
    const args = { pack: x.engine.pack(), index, retrieval: r, checkpointTick: tick(2, 8), origin: null, sceneLabel: '', playerScope: ['x'], plan: null, forced: false, stagedNotes: [], opportunities: ['opt '.repeat(3000)], budgetChars: 9000, horizon: 4320 };
    const p = buildPacket(args);
    for (const id of ids) expect(p.text).toContain(id);
    expect(p.truncatedOptional).toBe(true); // optional material is reduced first
    expect(() => buildPacket({ ...args, budgetChars: 500 })).toThrow(/exceeds the configured budget/);
    expect(new WorldIndex(x.engine.pack(), index.state)).toBeTruthy();
  });
});
