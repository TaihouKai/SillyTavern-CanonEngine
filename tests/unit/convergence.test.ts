// C01–C20: narrative convergence and player control with deterministic scripted model outputs.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, D, occ } from './fake';
import { factAt } from '../../src/domain/reducer';
import { validatePlan, planScope, type PlanOutput } from '../../src/runtime/planner';
import { ROOT } from './helpers';
import * as V from '../../src/generated/validators.js';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const has = (s: string) => (i: any) => JSON.stringify(i).includes(s);

async function setup(start = tick(1, 9, 30)) {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: start, mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any = {}) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-8);
  if (evalPatch) x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state;
const rescue = { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'Mira survives', { pack_event_id: 'medic-ambush', disposition: 'diverged', origin: 'player', actors: ['mira'] })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira survives', occurrence_ref: 'o1' }] };

describe('convergence', () => {
  it('a failing planner does not block the GM reply (real-model finding)', async () => {
    const x = await setup();
    (x.model as any).rules.unshift({ task: 'plan', raw: '{"rationale":"truncated by max tokens", "steps":[{"step_id":"s1",', once: false });
    expect(await turn(x, 'I look around the harbor.', 'Gulls circle the quiet harbor. [P1]', { scene_end: at(1, 9, 45) })).toBe(true);
    expect(x.host.chat.slice(-1)[0].text).toContain('[P1]');
    expect(x.model.tasks('plan').length).toBeGreaterThan(0);
    expect(x.engine.notices.some((n) => /Planner could not produce a valid plan/.test(n.text))).toBe(true);
  });

  it('C02/C03 rescue diverges FREE death; broadcast omitted; HARD begins via an alternate adjudicated route', async () => {
    const x = await setup();
    expect(await turn(x, 'I shield Mira.', 'The bolts miss. Mira survives. [A1]', rescue)).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    // planner was asked to protect both HARD anchors
    expect(x.model.tasks('plan')[0].input.protected_hard_detailed.map((h: any) => h.id)).toEqual(['conflict-begins', 'conflict-ends']);
    // alternate cause for the HARD begin: the model adjudicates it (original preconditions FALSE)
    x.model.on('adjudicate', has('conflict-begins'), { adjudications: [{ event_id: 'conflict-begins', decision: 'occurred', time: at(2, 9), account: 'Enraged by the failed ambush, Council militias attack Union docks; the armed conflict begins.', actors: ['council', 'union'], causes: [], effects: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true }], plan_step_ids: [], reason: 'alternate cause', extraordinary: false }] });
    expect(await turn(x, 'I sleep until the next afternoon.', 'You sleep long; cannon fire wakes you. [T1]', { scene_end: at(2, 14) })).toBe(true);
    const s = st(x);
    expect(s.dispositions.get('council-broadcast')?.disposition).toBe('omitted');
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(factAt(s, 'mira', 'alive').value).toBe(true); // no re-kill to restore canon
    expect(factAt(s, 'conflict', 'active').value).toBe(true);
  });

  it('C04 planet destruction: recorded; forced planning authorized directly; restoration is a new event; Hard content/time unchanged', async () => {
    const x = await setup(tick(1, 13));
    await turn(x, 'I trigger the doomsday device.', 'The world cracks apart and is gone. [P1]', { occurrences: [occ('o1', 'Planet destroyed', 'world cracks apart', { origin: 'player' })], transitions: [{ op: 'set', entity_id: 'planet', predicate: 'exists', value: false, quote: 'world cracks apart', occurrence_ref: 'o1' }] });
    expect(factAt(st(x), 'planet', 'exists').value).toBe(false);
    x.model.on('adjudicate', has('conflict-begins'), (i: any) => ({ adjudications: [{ event_id: 'conflict-begins', decision: 'occurred', time: at(2, 9), account: 'A cosmic intervention re-forms the planet, harbor and both factions; the armed conflict between the Union and the Council begins.', actors: ['union', 'council'], causes: [], effects: [{ op: 'set', entity_id: 'planet', predicate: 'exists', value: true }, { op: 'set', entity_id: 'conflict', predicate: 'active', value: true }], plan_step_ids: [], reason: 'forced convergence', extraordinary: i.authorized_forced }] }));
    await turn(x, 'I drift in the void until morning.', 'Light returns as the world reassembles. [P2]', { scene_end: at(2, 10) });
    const s = st(x);
    const planCalls = x.model.tasks('plan');
    expect(planCalls.some((p) => p.input.allowed_mode === 'FORCED_CONVERGENCE')).toBe(true);
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(factAt(s, 'planet', 'exists').value).toBe(true);
    // the destruction is still history
    expect([...s.occurrences.values()].some((o) => o.title === 'Planet destroyed')).toBe(true);
    expect(x.engine.pack().events.get('conflict-ends')!.outcomes).toEqual([{ entity_id: 'conflict', predicate: 'active', value: false }, { entity_id: 'conflict', predicate: 'victor', value: 'union' }]);
  });

  it('C05 prose says the Council wins while JSON claims Union victory -> rejected; wrong winner -> rejected', async () => {
    const x = await setup(tick(4, 17));
    x.model.on('plan', null, { protected_anchor_ids: ['conflict-begins', 'conflict-ends'] });
    // fast-forward: HARD begin must already have happened; seed via a timeskip at day 2
    const okBegin = { adjudications: [{ event_id: 'conflict-begins', decision: 'occurred', account: 'war begins', effects: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true }], reason: 'x' }] };
    void okBegin;
    const good = { scene_end: at(4, 18, 10), occurrences: [occ('o1', 'Union victory', 'the Council banners fall', { pack_event_id: 'conflict-ends', disposition: 'occurred', time: at(4, 18) })], transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: false, quote: 'the Council banners fall', occurrence_ref: 'o1' }, { op: 'set', entity_id: 'conflict', predicate: 'victor', value: 'union', quote: 'the Council banners fall', occurrence_ref: 'o1' }] };
    x.host.addUser('I watch the final battle.');
    x.model.draft('The Council banners fall... no — the Council triumphs over the Union. [W1]', 'The Council banners fall... the Council triumphs. [W2]', 'The Council banners fall... still the Council. [W3]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[W'), { ...good, hard_checks: [{ event_id: 'conflict-ends', status: 'contradicted', occurrence_ref: 'o1', quote: 'the Council triumphs' }] });
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/contradicts HARD|Reviewer/);
    expect(st(x).dispositions.get('conflict-ends')).toBeUndefined();
    // structured wrong winner
    const y = await setup(tick(4, 17));
    y.host.addUser('I watch.');
    y.model.draft('The Council banners rise. [X1]', 'The Council banners rise. [X2]', 'The Council banners rise. [X3]');
    y.model.on('evaluate', (i) => String(i.candidate).includes('[X'), { ...good, occurrences: [occ('o1', 'end', 'The Council banners rise', { pack_event_id: 'conflict-ends', disposition: 'occurred', time: at(4, 18) })], transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'victor', value: 'council', quote: 'The Council banners rise', occurrence_ref: 'o1' }], hard_checks: [{ event_id: 'conflict-ends', status: 'fulfilled', occurrence_ref: 'o1', quote: 'x' }] });
    expect(await y.engine.runOperation('normal')).toBe(false);
    expect(y.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/exact required outcome/);
  });

  it('C06/C09 planner escapes are rejected (drop_anchor field, new date, renamed winner, parallel world, player consent)', async () => {
    const x = await setup();
    const L = x.engine.pack();
    const s = st(x);
    const scope = planScope(L, s);
    const base: PlanOutput = { rationale: 'ok', protected_anchor_ids: ['conflict-begins', 'conflict-ends'], assumptions: [], risks: [], mode: 'NORMAL', steps: [] };
    expect(V.plan({ ...base, drop_anchor: 'conflict-ends' })).toBe(false);
    const idx = x.engine.current!.index;
    const step = (extra: any) => ({ step_id: 's1', actors: ['council'], earliest: D(1, 12), latest: D(1, 13), action: 'act', intended_effects: [], means: 'ordinary', serves_anchor: 'conflict-begins', requires_player_consent: false, ...extra });
    expect(validatePlan({ ...base, steps: [step({ earliest: D(3, 0), latest: D(3, 1) })] } as any, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/after anchor .*deadline/);
    expect(validatePlan({ ...base, steps: [step({ serves_anchor: 'conflict-ends', earliest: D(4, 10), latest: D(4, 18), intended_effects: [{ entity_id: 'conflict', predicate: 'victor', value: 'council' }] })] } as any, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/contradicting HARD/);
    expect(validatePlan({ ...base, rationale: 'shift to a parallel world where the Council wins' }, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/alternate world/);
    expect(validatePlan({ ...base, steps: [step({ requires_player_consent: true })] } as any, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/consent/);
    expect(validatePlan({ ...base, protected_anchor_ids: ['conflict-begins'] }, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/does not protect HARD anchor conflict-ends/);
    expect(validatePlan({ ...base, mode: 'FORCED_CONVERGENCE' }, L, idx, scope, tick(1, 9, 30), false).join()).toMatch(/not authorized/);
  });

  it('C07 a planned attack is not a fact; C08 an obsolete due step is invalidated and triggers replanning', async () => {
    const x = await setup(tick(0, 8));
    x.model.on('plan', null, (i: any) => ({ protected_anchor_ids: ['conflict-begins', 'conflict-ends'], steps: [{ step_id: 'atk', actors: ['council'], targets: ['harbor'], earliest: D(0, 9), latest: D(0, 10), prerequisites: [], action: 'Council attacks the Union depot tomorrow', intended_effects: [{ entity_id: 'conflict', predicate: 'active', value: true }], visibility: 'secret', knowers: ['council'], depends_on: [], means: 'ordinary', serves_anchor: null, requires_player_consent: false }] }), true);
    await turn(x, 'I look around.', 'Gulls cry over the docks. [Q1]', {});
    expect(x.engine.activePlan()!.steps[0].action).toMatch(/attacks/);
    expect(factAt(st(x), 'conflict', 'active').value).toBe(false);
    const before = x.model.tasks('plan').length;
    await turn(x, 'I wait until noon.', 'Noon arrives quietly. [Q2]', { scene_end: at(0, 12) });
    await turn(x, 'I keep waiting.', 'Still quiet. [Q3]', {});
    expect(x.model.tasks('plan').length).toBeGreaterThan(before); // step expired unenacted -> replan
    expect(x.engine.campaign()!.planRevisions.some((p) => p.steps.some((s) => s.step_id === 'atk' && s.status === 'enacted'))).toBe(false);
  });

  it('C10 participation opportunity is offered in time; C11 a decline stops nagging and the event still proceeds; E15 removing the decline restores it', async () => {
    const x = await setup(tick(1, 9));
    await turn(x, 'I stroll near the harbor.', 'Rumors of an ambush on the medic spread. [O1]', {});
    const ctx1 = x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
    expect(ctx1).toMatch(/PARTICIPATION OPPORTUNITIES[\s\S]*Ambush of Mira/);
    x.model.on('extract_user', has('stay out of it'), { statements: [{ kind: 'participation_decline', quote: 'I stay out of it', summary: 'declines the ambush', entities: [], facts: [], event_id: 'medic-ambush', time: null, ambiguous: false }] }, true);
    const declineMsg = x.host.addUser('I stay out of it.');
    x.model.draft('You keep your distance. [O2]');
    await x.engine.runOperation('normal');
    expect(st(x).declines.has('medic-ambush')).toBe(true);
    await turn(x, 'I order tea.', 'Tea arrives. [O3]', {});
    const ctx3 = x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
    expect(ctx3).not.toMatch(/PARTICIPATION OPPORTUNITIES[\s\S]*Ambush of Mira/);
    // E15: remove the decline (user message) -> opportunity rebuilds
    const idx = x.host.chat.indexOf(declineMsg);
    x.host.remove(idx + 1); // its GM reply
    x.host.remove(idx);
    await x.engine.reconcile('edit');
    expect(st(x).declines.has('medic-ambush')).toBe(false);
  });

  it('C12 a severe verified change shows one spoiler-free banner on that variant; C13 a local change shows none; E16 deleting it removes the banner', async () => {
    const x = await setup();
    x.model.on('impact', null, { changed: [{ entity_id: 'mira', predicate: 'alive' }], affected_anchors: ['conflict-begins'], affected_steps: [], scope: 'local', severity: 'major', replan: true, explanation: 'broadcast route destroyed' }, true);
    await turn(x, 'I shield Mira.', 'The bolts miss. Mira survives. [B1]', rescue);
    const c = x.engine.campaign()!;
    const banners = Object.values(c.interpretations).flat().filter((i) => i.banner);
    expect(banners.length).toBe(1);
    expect(banners[0].banner!.text).toMatch(/严重历史偏离/);
    expect(banners[0].banner!.text).not.toMatch(/Union|Council|conflict-begins/);
    expect(x.host.chat.slice(-1)[0].text).not.toMatch(/严重|banner/);
    // C13: local rescue-like change with an ordinary route -> severity minor -> no banner
    x.model.on('impact', null, { changed: [], affected_anchors: [], affected_steps: [], scope: 'local', severity: 'minor', replan: false, explanation: 'local' }, true);
    await turn(x, 'I buy bread.', 'You buy bread. [B2]', { transitions: [] });
    expect(Object.values(x.engine.campaign()!.interpretations).flat().filter((i) => i.banner).length).toBe(1);
    // E16: delete the warning-causing reply -> its banner is no longer on the active history
    const gmIdx = x.host.chat.findIndex((m) => m.text.includes('[B1]'));
    x.host.remove(gmIdx);
    await x.engine.reconcile('delete');
    const active = x.engine.current!.replay.applied.map((a) => a.interp).filter((i) => i.banner);
    expect(active.length).toBe(0);
  });

  it('C15 provider failure during planning is an operational error, not a supernatural correction', async () => {
    const x = await setup();
    x.model.failTask.plan = 5;
    x.host.addUser('I look around.');
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.campaign()!.recoveryState.errorKind).toBe('provider_failure');
    expect(x.engine.campaign()!.planRevisions.length).toBe(0);
    expect(x.host.chat.slice(-1)[0].role).toBe('user');
  });

  it('C16 exhausted repair budget preserves the last valid state with finite attempts', async () => {
    const x = await setup();
    x.host.addUser('I look around.');
    x.model.draft('bad [R1]', 'bad [R2]', 'bad [R3]', 'bad [R4]');
    x.model.on('evaluate', null, { decision: 'repair', violations: [{ code: 'x', quote: 'bad', detail: 'always wrong' }] });
    const revBefore = x.engine.campaign()!.revision;
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.model.tasks('draft').length).toBe(3); // initial + 2 repairs
    expect(x.engine.campaign()!.recoveryState.errorKind).toBe('narrative_validation_failure');
    expect(x.host.chat.slice(-1)[0].role).toBe('user');
    expect(x.engine.campaign()!.revision).toBeGreaterThanOrEqual(revBefore);
  });

  it('C17 setting a HARD outcome fact without enacting the event is rejected', async () => {
    const x = await setup();
    x.host.addUser('I wait.');
    x.model.draft('War is declared by decree. [S1]', 'War is declared by decree. [S2]', 'War is declared by decree. [S3]');
    x.model.on('evaluate', null, { transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: 'War is declared by decree', occurrence_ref: null }] });
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/required outcome of pending HARD/);
    expect(factAt(st(x), 'conflict', 'active').value).toBe(false);
  });

  it('C18 a draft that skips further ahead re-runs crossed-interval checks and must realize crossed HARD events', async () => {
    const x = await setup();
    const discBefore = x.model.tasks('discover').length;
    // draft jumps to day 3 without depicting the HARD beginning; adjudicator stages it offscreen
    expect(await turn(x, 'I rest a little.', 'Two days pass in a blur. [J1]', { scene_end: at(3, 8) })).toBe(true);
    const s = st(x);
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(x.model.tasks('evaluate').length).toBeGreaterThanOrEqual(2); // re-reviewed with staged offscreen history
    expect(x.model.tasks('discover').length - discBefore).toBe(1); // same draft text: discovery is reused, not re-run
    const second = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(second.staged_offscreen.join(' ')).toMatch(/conflict begins/i);
  });

  it('C19/C20 impact on a distant anchor / global scope expands detailed planning scope', async () => {
    const x = await setup();
    const scope = planScope(x.engine.pack(), st(x), ['conflict-ends']);
    expect(scope.detailed).toContain('conflict-ends');
    x.model.on('impact', null, { changed: [{ entity_id: 'union', predicate: 'exists' }], affected_anchors: [], affected_steps: [], scope: 'global', severity: 'minor', replan: true, explanation: 'unknown cross-link' }, true);
    await turn(x, 'I sabotage the Union armory.', 'Smoke rises from the armory. [G1]', { occurrences: [occ('o1', 'Armory sabotage', 'Smoke rises from the armory', { origin: 'player', affected: ['union'] })], transitions: [{ op: 'set', entity_id: 'union', predicate: 'exists', value: true, quote: 'Smoke rises from the armory', occurrence_ref: 'o1' }] });
    expect(x.engine.activePlan()?.status).toBe('stale');
    await turn(x, 'I hide.', 'You hide. [G2]', {});
    const lastPlan = x.model.tasks('plan').slice(-1)[0].input;
    expect(lastPlan.protected_hard_detailed.map((h: any) => h.id)).toEqual(expect.arrayContaining(['conflict-begins', 'conflict-ends']));
  });

  it('C14 a secret plan/occurrence is labeled with its knowledge boundary; plan steps never reach extraction', async () => {
    const x = await setup();
    await turn(x, 'I look.', 'Nothing. [K1]', {});
    expect(x.model.tasks('extract_user').every((c) => !JSON.stringify(c.input).includes('move toward'))).toBe(true);
    const ctx = x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
    expect(ctx).toMatch(/PROPOSED ACTIONS \(intentions, NOT accomplished; NPCs know only what they plausibly know\)/);
  });
});

describe('reply length setting', () => {
  it('puts the configured reply length into the draft instructions, and nothing when empty', async () => {
    const x = await setup();
    expect(await turn(x, 'I wait.', 'The harbor is quiet. [L0]')).toBe(true);
    expect((x.model.tasks('draft').slice(-1)[0].input as any).lengthNote).toBe('');
    x.engine.settings.replyLength = '正文约800~1200字';
    expect(await turn(x, 'I wait more.', 'Gulls circle the pier. [L1]')).toBe(true);
    expect((x.model.tasks('draft').slice(-1)[0].input as any).lengthNote).toContain('本回合回复篇幅要求：正文约800~1200字。写在这个范围内');
  });
});
