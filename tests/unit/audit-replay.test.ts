// Audit 2026-11: replay after edits — which retained replies are looked at again.
// ARCHITECTURE.md "Source of truth & replay" 3: validity per message includes "whether it touches entities whose
// history changed earlier"; the fast path is for "an interpretation validated against the identical prefix state".
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ, deferred } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;

async function setup(start = tick(1, 9, 30)) {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: start, mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}
async function turn(x: X, user: string, draft: string, evalPatch: any = {}) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-6);
  x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const evals = (x: X, marker: string) => x.model.tasks('evaluate').filter((c) => String(c.input.candidate).includes(marker)).length;

/** Two turns about Mira: the second reply builds on what the first one told. */
async function twoTurns(g2 = 'You unlock the archive with the key Mira gave you. [G2]') {
  const x = await setup();
  expect(await turn(x, 'I watch the pier.', 'Mira hands you the brass key to the archive. [G1]', {
    scene_end: at(1, 9, 35), scene_entities: ['mira'], occurrences: [occ('o1', 'Mira hands over the key', 'Mira hands you the brass key', { actors: ['mira'] })],
  })).toBe(true);
  expect(await turn(x, 'I go to the archive.', g2, {
    scene_end: at(1, 9, 40), scene_entities: ['mira'], occurrences: [occ('o1', 'The archive is unlocked', 'You unlock the archive', { actors: ['mira'] })],
  })).toBe(true);
  await new Promise((r) => setTimeout(r, 20));
  expect(evals(x, '[G2]')).toBe(1);
  return x;
}
const G1 = 2; // greeting, user, GM1, user, GM2

describe('audit: retained replies after an earlier edit', () => {
  it('B0 (control): an edit that changes the number of occurrences → the later reply about the same entity is examined again', async () => {
    const x = await twoTurns();
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), { scene_end: at(1, 9, 35), scene_entities: ['mira'], occurrences: [] });
    x.host.edit(G1, 'Mira refuses to hand over the key and walks away. [G1x]');
    x.engine.sourceChanged('message_edited');
    await x.engine.reconcile('message_edited');
    expect(evals(x, '[G2]')).toBe(2);
  });

  it('B1: an edit that changes what happened but not how many things happened → the later reply is examined again as well', async () => {
    const x = await twoTurns();
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), {
      scene_end: at(1, 9, 35), scene_entities: ['mira'], occurrences: [occ('o1', 'Mira refuses to hand over the key', 'Mira refuses to hand over the key', { actors: ['mira'] })],
    });
    x.host.edit(G1, 'Mira refuses to hand over the key and walks away. [G1x]');
    x.engine.sourceChanged('message_edited');
    await x.engine.reconcile('message_edited');
    // same edit as B0 for the story; only the count of occurrences differs
    expect(evals(x, '[G2]')).toBe(2);
  });

  // the later reply refers to her without her name ("she"); the engine knows whom it is about from its interpretation
  const SHE = 'You unlock the archive with the key she gave you. [G2]';
  it('B2: the same edit, examined after a provider failure and Retry → the same replies are examined as without the failure', async () => {
    const x = await twoTurns(SHE);
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), { scene_end: at(1, 9, 35), scene_entities: [], occurrences: [] });
    x.host.edit(G1, 'Nothing happens on the pier this morning. [G1x]');
    x.engine.sourceChanged('message_edited');
    // the provider fails while the edited reply is examined; the engine then rebuilds without models (post_operation)
    x.model.failTask.evaluate = 1;
    await x.engine.reconcile('message_edited').catch(() => undefined);
    await x.engine.reconcile('post_operation', { allowModel: false });
    await x.engine.retry();
    await new Promise((r) => setTimeout(r, 20));
    expect(evals(x, '[G1x]')).toBeGreaterThanOrEqual(1);
    expect(evals(x, '[G2]')).toBe(2);
  });

  it('B2 control: the same edit without the failure', async () => {
    const x = await twoTurns(SHE);
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), { scene_end: at(1, 9, 35), scene_entities: [], occurrences: [] });
    x.host.edit(G1, 'Nothing happens on the pier this morning. [G1x]');
    x.engine.sourceChanged('message_edited');
    await x.engine.reconcile('message_edited');
    expect(evals(x, '[G2]')).toBe(2);
  });

  it('B2 control: failure and Retry, without the rebuild that runs without models in between', async () => {
    const x = await twoTurns(SHE);
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), { scene_end: at(1, 9, 35), scene_entities: [], occurrences: [] });
    x.host.edit(G1, 'Nothing happens on the pier this morning. [G1x]');
    x.engine.sourceChanged('message_edited');
    x.model.failTask.evaluate = 1;
    await x.engine.reconcile('message_edited').catch(() => undefined);
    await x.engine.retry();
    await new Promise((r) => setTimeout(r, 20));
    expect(evals(x, '[G2]')).toBe(2);
  });
  it('B3 (WORLD_STATE_CONTEXT_CONTRACT §8): the same edit made while a rebuild is waiting for a model → the same replies are examined', async () => {
    const x = await twoTurns(SHE);
    x.model.on('evaluate', (i) => String(i.candidate).includes('[G1x]'), { scene_end: at(1, 9, 35), scene_entities: [], occurrences: [] });
    // a rebuild is reading a new player message when the edit of the earlier reply arrives
    x.host.addUser('I wait.');
    const gate = deferred();
    x.model.taskGate.extract_user = () => gate.promise;
    x.engine.sourceChanged('message_sent');
    const first = x.engine.reconcile('message_sent').catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20));
    x.host.edit(G1, 'Nothing happens on the pier this morning. [G1x]');
    x.engine.sourceChanged('message_edited');
    const second = x.engine.reconcile('message_edited').catch(() => undefined); // queued behind the first, as the host does
    delete x.model.taskGate.extract_user;
    gate.resolve();
    await first; await second;
    await new Promise((r) => setTimeout(r, 20));
    expect(evals(x, '[G1x]')).toBeGreaterThanOrEqual(1);
    expect(evals(x, '[G2]')).toBe(2); // as in "B2 control: the same edit without the failure"
  });
});

describe('audit: an older reply examined again (S7)', () => {
  it('S7: the offscreen events of the time it crossed are settled with the plan it was written under, not the plan in force now', async () => {
    const x = await setup();
    const ambush = (i: any) => i.candidate?.id === 'medic-ambush';
    expect(await turn(x, 'I watch the pier.', 'Mira waves from the pier. [P1]', { scene_end: at(1, 9, 40), scene_entities: ['mira'], occurrences: [occ('o1', 'Mira waves', 'Mira waves from the pier', { actors: ['mira'] })] })).toBe(true);
    expect(await turn(x, 'I wait alone.', 'It is 11:00 when the tide turns. [P2]', { scene_end: at(1, 11, 0) })).toBe(true);
    const c = x.engine.campaign()!;
    const p1 = x.engine.activePlan()!;
    const stepsGiven = () => x.model.tasks('adjudicate').filter((t) => ambush(t.input)).map((t) => (t.input.plan_steps as any[]).map((s) => s.step_id));
    expect(p1.steps.length).toBeGreaterThan(0);
    expect(stepsGiven().at(-1)).toEqual(p1.steps.map((s) => s.step_id));
    // a new plan takes over (as after a replan), with steps of its own
    const p2 = { ...JSON.parse(JSON.stringify(p1)), planId: 'plan_two', steps: p1.steps.map((s, i) => ({ ...s, step_id: `z${i + 1}` })) };
    p1.status = 'superseded';
    c.planRevisions.push(p2); c.activePlanId = p2.planId;
    expect(await turn(x, 'I walk on.', 'You walk along the quay. [P3]', { scene_end: at(1, 11, 10) })).toBe(true);
    const before = stepsGiven().length;
    // the second reply is edited: it is examined again, and the hour it crossed is settled again
    const i2 = x.host.chat.findIndex((m) => m.text.includes('[P2]'));
    x.model.on('evaluate', (i) => String(i.candidate).includes('[P2b]'), { scene_end: at(1, 11, 0) });
    x.host.edit(i2, 'It is 11:00 when the tide turns, slowly. [P2b]');
    x.engine.sourceChanged('edit');
    await x.engine.reconcile('edit');
    expect(stepsGiven().length).toBeGreaterThan(before);
    expect(stepsGiven().at(-1)).toEqual(p1.steps.map((s) => s.step_id));
  });
});
