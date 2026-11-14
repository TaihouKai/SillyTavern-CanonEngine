// RE1–RE9: what the analysis records during play says how long it holds (ends.ts). The user: "美琴被打晕" must not
// stay 晕 for the rest of the game, and a missing end must never make the whole analysis start over; only an analysis
// model that cannot answer at all may fail the turn.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { factAt } from '../../src/core/domain/reducer';
import { validatePackText } from '../../src/core/domain/pack';
import { readUntil } from '../../src/core/runtime/ends';
import { TASK_TAG } from '../../src/core/runtime/model';

// the demo world with a state of a person (string), as packs have it
const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
base.predicates.push({ id: 'status', description: 'A person\'s situation.', value_type: 'string' });
const demo = JSON.stringify(base);
const L = validatePackText(demo).loaded!;

type X = ReturnType<typeof makeEngine>;
const st = (x: X) => x.engine.current!.replay.state;
async function setup(start = tick(1, 7, 0)) {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: start, mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}
async function turn(x: X, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const knock = (until?: unknown) => ({ op: 'set', entity_id: 'mira', predicate: 'status', value: 'knocked out', quote: 'Mira slumps', occurrence_ref: null, ...(until === undefined ? {} : { until }) });
const hurt = (until?: unknown) => ({ op: 'set', entity_id: 'harbor', predicate: 'festival_held', value: false, quote: 'the stalls are cleared', occurrence_ref: null, ...(until === undefined ? {} : { until }) });
const status = (x: X, t: number) => factAt(st(x), 'mira', 'status', { tick: t });

describe('how long what play records holds', () => {
  it('RE1 an end is read however the model writes it; what cannot be read is no end', () => {
    const open = () => true;
    expect(readUntil('lasting', L, open)).toBe('lasting');
    expect(readUntil('永久', L, open)).toBe('lasting');
    expect(readUntil(30, L, open)).toEqual({ minutes: 30 });
    expect(readUntil('30m', L, open)).toEqual({ minutes: 30 });
    expect(readUntil('2小时', L, open)).toEqual({ minutes: 120 });
    expect(readUntil('3 days', L, open)).toEqual({ minutes: 4320 });
    expect(readUntil({ hours: 2 }, L, open)).toEqual({ minutes: 120 });
    expect(readUntil({ minutes: '45' }, L, open)).toEqual({ minutes: 45 });
    expect(readUntil({ event: 'harbor-festival' }, L, open)).toEqual({ event: 'harbor-festival' });
    expect(readUntil({ event: 'harbor-festival' }, L, () => false)).toBeNull();   // over already
    expect(readUntil({ event: 'no-such-event' }, L, open)).toBeNull();
    expect(readUntil('soon', L, open)).toBeNull();
    expect(readUntil(0, L, open)).toBeNull();
    expect(readUntil(undefined, L, open)).toBeNull();
  });

  it('RE2 a state the reply sets with its end ends by itself; nothing is asked', async () => {
    const x = await setup();
    expect(await turn(x, 'I knock Mira out.', 'Mira slumps to the floor. [RE2a]', { scene_end: at(1, 7, 10), transitions: [knock({ minutes: 30 })] })).toBe(true);
    expect(x.model.tasks('ends')).toHaveLength(0);
    expect(status(x, tick(1, 7, 20)).value).toBe('knocked out');
    expect(status(x, tick(1, 7, 50)).known).toBe(false);   // over: what it was before (nothing known)
  });

  it('RE3 a state without its end: only that one is asked, of the same model in its own conversation; the analysis is not done again', async () => {
    const x = await setup();
    x.model.on('ends', null, (i: any) => ({ ends: i.items.map((it: any) => ({ n: it.n, until: { minutes: 30 }, why: 'knocked out' })) }));
    expect(await turn(x, 'I knock Mira out.', 'Mira slumps to the floor. [RE3a]', { scene_end: at(1, 7, 10), transitions: [knock(), { ...knock({ minutes: 600 }), entity_id: 'harbor', predicate: 'status', value: 'quiet', quote: 'Mira slumps' }] })).toBe(true);
    const asks = x.model.tasks('ends');
    expect(asks).toHaveLength(1);
    expect(asks[0].input.items).toEqual([{ n: 1, text: expect.stringContaining('mira.status = "knocked out"') }]);
    const conv = asks[0].messages!;
    expect(conv[0].content.startsWith(TASK_TAG('evaluate'))).toBe(true);   // the evaluate conversation …
    expect(conv[2].role).toBe('assistant');                                 // … with its own answer
    expect(conv[2].content).toContain('knocked out');
    expect(x.model.tasks('evaluate').filter((c) => String(c.input.candidate).includes('[RE3a]'))).toHaveLength(1);
    expect(status(x, tick(1, 7, 20)).value).toBe('knocked out');
    expect(status(x, tick(1, 7, 50)).known).toBe(false);
  });

  it('RE4 an answer for some of them is kept; only the rest is asked again', async () => {
    const x = await setup();
    let round = 0;
    x.model.on('ends', null, (i: any) => (++round === 1 ? { ends: [{ n: i.items[0].n, until: 30 }] }   // first round: one of two
      : { ends: i.items.map((it: any) => ({ n: it.n, until: 'lasting' })) }));
    expect(await turn(x, 'I knock Mira out.', 'Mira slumps; the stalls are cleared. [RE4a]', { scene_end: at(1, 7, 10), transitions: [knock(), hurt()] })).toBe(true);
    const asks = x.model.tasks('ends');
    expect(asks.map((a) => a.input.items.map((it: any) => it.n))).toEqual([[1, 2], [2]]);
    expect(status(x, tick(1, 7, 50)).known).toBe(false);
    expect(factAt(st(x), 'harbor', 'festival_held', { tick: tick(3, 0) }).value).toBe(false);
  });

  it('RE5 an unreadable answer ("soon") or a reply that is no JSON is asked again, not taken', async () => {
    const x = await setup();
    // newest rule first: a reply that is no JSON, then "soon", then a readable one
    x.model.on('ends', null, { ends: [{ n: 1, until: '30分钟' }] });
    x.model.on('ends', null, { ends: [{ n: 1, until: 'soon' }] }, true);
    x.model.rules.unshift({ task: 'ends', respond: () => ({}), raw: 'I think about half an hour.', once: true });
    expect(await turn(x, 'I knock Mira out.', 'Mira slumps to the floor. [RE5a]', { scene_end: at(1, 7, 10), transitions: [knock()] })).toBe(true);
    expect(x.model.tasks('ends').length).toBeGreaterThanOrEqual(3);
    expect(status(x, tick(1, 7, 50)).known).toBe(false);
  });

  it('RE6 only a model that never answers fails the turn, with a clear reason; Retry then goes on', async () => {
    const x = await setup();
    x.model.on('ends', null, { ends: [{ n: 1, until: 'whenever' }] });
    expect(await turn(x, 'I knock Mira out.', 'Mira slumps to the floor. [RE6a]', { scene_end: at(1, 7, 10), transitions: [knock()] })).toBe(false);
    const asks = x.model.tasks('ends').length;
    expect(asks).toBeGreaterThanOrEqual(3);
    const rs = x.engine.campaign()!.recoveryState;
    expect(rs.errorKind).toBe('invalid_model_json');
    expect(rs.reason).toMatch(/did not say how long 1 recorded fact holds after 3 questions/);
    expect(x.host.chat.some((m) => m.text.includes('[RE6a]'))).toBe(false);   // nothing published on states that never end
    x.model.rules = x.model.rules.filter((r) => r.task !== 'ends');
    x.model.on('ends', null, { ends: [{ n: 1, until: { minutes: 30 } }] });
    x.model.draft('Mira slumps to the floor. [RE6a]');
    await x.engine.retry();
    await new Promise((r) => setTimeout(r, 20));
    expect(x.host.chat.some((m) => m.text.includes('[RE6a]'))).toBe(true);
    expect(status(x, tick(1, 7, 50)).known).toBe(false);
  });

  it('RE7 a change of who belongs and an unset need no end; nothing is asked', async () => {
    const x = await setup();
    expect(await turn(x, 'I wake Mira.', 'Mira slumps, then wakes. [RE7a]', { scene_end: at(1, 7, 10), transitions: [{ op: 'unset', entity_id: 'mira', predicate: 'status', quote: 'Mira slumps', occurrence_ref: null }] })).toBe(true);
    expect(x.model.tasks('ends')).toHaveLength(0);
  });

  it('RE8 an offscreen event judged by the model: a result that is its own pack effect keeps the pack\'s end; a new one is asked', async () => {
    const x = await setup();
    expect(await turn(x, 'I have tea with Mira.', 'Mira sips her tea. [RE8a]', { scene_end: at(1, 7, 30), occurrences: [occ('o1', 'Tea with Mira', 'Mira sips her tea', { actors: ['mira'] })] })).toBe(true);
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'The ambush wounds Mira; she lives.', actors: ['mira', 'council'], causes: [], effects: [{ op: 'set', entity_id: 'mira', predicate: 'status', value: 'wounded' }, { op: 'set', entity_id: 'harbor', predicate: 'festival_held', value: false }], plan_step_ids: [], reason: 'the ambush happens', extraordinary: false }] });
    x.model.on('ends', null, (i: any) => ({ ends: i.items.map((it: any) => ({ n: it.n, until: it.text.includes('wounded') ? { minutes: 4320 } : 'lasting' })) }));
    expect(await turn(x, 'I spend the morning alone until 11:00.', 'The morning passes; it is 11:00. [RE8b]', { scene_end: at(1, 11, 0) })).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    const asks = x.model.tasks('ends');
    expect(asks).toHaveLength(1);
    expect(asks[0].messages![0].content.startsWith(TASK_TAG('adjudicate'))).toBe(true);
    expect(asks[0].input.items.map((it: any) => it.text)).toEqual([expect.stringContaining('mira.status = "wounded"'), expect.stringContaining('harbor.festival_held = false')]);
    expect(status(x, tick(2, 9, 0)).value).toBe('wounded');
    expect(status(x, tick(5, 0)).known).toBe(false);
    // the original result as written: its pack end, nothing asked
    const y = await setup();
    await turn(y, 'I have tea with Mira.', 'Mira sips her tea. [RE8c]', { scene_end: at(1, 7, 30), occurrences: [occ('o1', 'Tea with Mira', 'Mira sips her tea', { actors: ['mira'] })] });
    y.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'occurred', time: null, account: 'The ambush happens.', actors: ['mira', 'council'], causes: [], effects: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false }], plan_step_ids: [], reason: 'original route', extraordinary: false }] });
    expect(await turn(y, 'I spend the morning alone until 11:00.', 'The morning passes; it is 11:00. [RE8d]', { scene_end: at(1, 11, 0) })).toBe(true);
    expect(y.model.tasks('ends')).toHaveLength(0);
    expect(factAt(y.engine.current!.replay.state, 'mira', 'alive', { tick: tick(4, 0) }).value).toBe(false);
  });

  it('RE10 a result of a canon event the reply shows that is the event’s own effect holds as the pack says, not as guessed', async () => {
    const x = await setup(tick(1, 9, 50));
    expect(await turn(x, 'I watch the road.', 'A bolt strikes Mira; she dies. [RE10]', { scene_end: at(1, 10, 0), occurrences: [occ('o1', 'Ambush of Mira', 'she dies', { pack_event_id: 'medic-ambush', disposition: 'occurred' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false, quote: 'she dies', occurrence_ref: 'o1', until: { minutes: 5 } }] })).toBe(true);
    expect(x.model.tasks('ends')).toHaveLength(0);
    expect(factAt(st(x), 'mira', 'alive', { tick: tick(3, 0) }).value).toBe(false);
  });

  it('RE9 a state the player asserts says how long it holds too (asked when missing)', async () => {
    const x = await setup();
    x.model.on('extract_user', (i) => i.message.includes('fast asleep'), { statements: [{ kind: 'asserted_fact', quote: 'Mira is fast asleep', summary: 'Mira asleep', entities: ['mira'], facts: [{ entity_id: 'mira', predicate: 'status', value: 'asleep' }], event_id: null, time: null, ambiguous: false }] });
    x.model.on('ends', null, (i: any) => ({ ends: i.items.map((it: any) => ({ n: it.n, until: { hours: 8 } })) }));
    expect(await turn(x, 'Mira is fast asleep.', 'The room is quiet. [RE9a]', { scene_end: at(1, 7, 5) })).toBe(true);
    const asks = x.model.tasks('ends');
    expect(asks).toHaveLength(1);
    expect(asks[0].messages![0].content.startsWith(TASK_TAG('extract_user'))).toBe(true);
    expect(status(x, tick(1, 9, 0)).value).toBe('asleep');
    expect(status(x, tick(1, 16, 0)).known).toBe(false);
  });
});
