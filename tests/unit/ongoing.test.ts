// OG1–OG2: a canonical event shown under way keeps no result until the reply where it ends (live finding:
// 婚后光子遇袭与马场芳郎落败 recorded as 已改变 when the fight had only started); RA1–RA2: 重新分析.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { factAt } from '../../src/domain/reducer';
import { PROMPTS as PROMPTS_ } from '../../src/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
// the ambush window widened to 10:00–12:00 so it can stay under way across replies (the demo has point windows)
const demoWide = (() => { const j = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8')); j.events.find((e: any) => e.id === 'medic-ambush').when.latest = { day: 1, minute: 720 }; j.events.find((e: any) => e.id === 'medic-ambush').when.precision = 'range'; return JSON.stringify(j); })();

async function setup(wide = false) {
  const x = makeEngine();
  await x.engine.bind(wide ? demoWide : demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-6);
  x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const st = (x: ReturnType<typeof makeEngine>) => x.engine.current!.replay.state;
const ambush = (disposition: string, quote: string, title = 'Ambush on the road') => ({
  scene_end: at(1, 10, 0),
  occurrences: [occ('o1', title, quote, { pack_event_id: 'medic-ambush', disposition, actors: ['mira'] })],
});

describe('canonical events under way', () => {
  it('OG1 an event shown under way keeps no result; the reviewer sees it as in progress and judges it when it ends', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [OG1a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    const beat = [...st(x).occurrences.values()].find((o) => o.inProgressOf === 'medic-ambush');
    expect(beat?.title).toBe('Ambush on the road');
    expect(beat?.packEventId).toBeUndefined();
    expect(x.engine.current!.index.canonStatus('medic-ambush', st(x).clock.lo)!.note).toMatch(/UNDER WAY in this branch \(Ambush on the road\)/);
    // next reply: the reviewer is told it is under way, and the event ends
    expect(await turn(x, 'I pull Mira behind a cart.', 'The attackers flee; Mira lives. [OG1b]', ambush('diverged', 'The attackers flee', 'Ambush repelled'))).toBe(true);
    const ev = x.model.tasks('evaluate').map((c: any) => c.input).find((i: any) => String(i.candidate).includes('[OG1b]'));
    expect(ev.canon_events_now.find((e: any) => e.id === 'medic-ambush').in_progress[0]).toMatch(/^Ambush on the road: /);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
  });

  it('OG3 an event under way is closed when its window passes, even mid-fight; later beats are its after story; 重新分析 merges them (the player\'s design)', async () => {
    const x = await setup(true); // window 10:00–12:00
    x.engine.settings.debug = true;
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [OG3a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'Mira held out behind the cart.', actors: ['mira'], causes: [], effects: [], plan_step_ids: [], reason: 'the player shielded her', extraordinary: false }] });
    // still fighting when the window closes at 12:00: closed in this reply, judged once from the beats so far
    expect(await turn(x, 'I keep shooting back.', 'At 12:10 the bolts still thud into the cart. [OG3b]', { ...ambush('ongoing', 'the bolts still thud', 'Pinned behind the cart'), scene_end: at(1, 12, 10) })).toBe(true);
    const close = x.model.tasks('adjudicate').filter((c: any) => c.input.candidate?.id === 'medic-ambush').slice(-1)[0].input;
    expect(close.unmet_conditions[0]).toMatch(/window has now closed, so it is closed now[^]*Never postpone/);
    expect(close.recent_actual_play_with_these_characters.join(' ')).toMatch(/Ambush on the road[^]*Pinned behind the cart/);
    let d = st(x).dispositions.get('medic-ambush')!;
    expect(d.disposition).toBe('diverged');
    const beats = [...st(x).occurrences.values()].filter((o) => o.inProgressOf === 'medic-ambush').map((o) => o.occurrenceId);
    expect(beats).toHaveLength(2); // the closing reply's beat is main story, linked by its final id
    expect(st(x).occurrences.get(d.occurrenceId!)!.linkedFrom).toEqual(expect.arrayContaining(beats));
    expect(x.engine.current!.index.afterStory('medic-ambush')).toEqual([]);
    // the story goes on with it: after story, not a violation and not a second result
    expect(await turn(x, 'I chase the attackers off.', 'At 12:20 the attackers finally flee into the alleys. [OG3c]', { ...ambush('diverged', 'The attackers finally flee', 'Attackers flee'), scene_end: at(1, 12, 20) })).toBe(true);
    const after = x.engine.current!.index.afterStory('medic-ambush');
    expect(after.map((o) => o.title)).toEqual(['Attackers flee']);
    expect(x.engine.current!.index.canonStatus('medic-ambush', st(x).clock.lo)!.note).toMatch(/after story \(later developments\): Attackers flee/);
    expect(st(x).dispositions.get('medic-ambush')!.recordId).toBe(d.recordId);
    // 重新分析: one judgement from everything; the after story becomes part of the result
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush' && /after story/.test(JSON.stringify(i.unmet_conditions)), { adjudications: [{ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'The player drove the attackers off; Mira survived.', actors: ['mira'], causes: [], effects: [], plan_step_ids: [], reason: 'repelled', extraordinary: false }] });
    expect(await x.engine.reanalyzeEvent('medic-ambush')).toBe('diverged');
    const call = x.model.tasks('adjudicate').slice(-1)[0].input;
    expect(call.unmet_conditions[0]).toMatch(/including its after story/);
    expect(call.recent_actual_play_with_these_characters.join(' ')).toMatch(/\[after story\] Attackers flee/);
    d = st(x).dispositions.get('medic-ambush')!;
    expect(st(x).occurrences.get(d.occurrenceId!)!.account).toMatch(/drove the attackers off/);
    expect(x.engine.current!.index.afterStory('medic-ambush')).toEqual([]);
    expect(st(x).occurrences.get(d.occurrenceId!)!.linkedFrom).toEqual(expect.arrayContaining([...beats, after[0].occurrenceId]));
    // undo brings the after story back
    await x.engine.undoForce('medic-ambush');
    expect(x.engine.current!.index.afterStory('medic-ambush').map((o) => o.title)).toEqual(['Attackers flee']);
  });

  it('OG3b a reply ending exactly at the end of the window leaves an event under way open; the next one past it closes it', async () => {
    const x = await setup(); // point window 10:00
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [OG3d]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'Mira held out.', actors: ['mira'], causes: [], effects: [], plan_step_ids: [], reason: 'x', extraordinary: false }] });
    expect(await turn(x, 'I duck.', 'At 10:05 you duck behind a cart. [OG3e]', { scene_end: at(1, 10, 5) })).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
  });

  it('CR1 how far the original route binds follows the class: SOFT is the default course (goals kept, changed only by a concrete cause in play), FREE is reference (live: 食蜂 at 177)', async () => {
    const j = JSON.parse(demo); const e = j.events.find((x: any) => x.id === 'medic-ambush');
    Object.assign(e, { classification: 'SOFT' }); Object.assign(e.when, { latest: { day: 1, minute: 720 }, precision: 'range' });
    const x = makeEngine();
    await x.engine.bind(JSON.stringify(j), { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [CR1a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(await turn(x, 'I stand there.', 'At 10:05 nothing changes. [CR1b]', { scene_end: at(1, 10, 5) })).toBe(true);
    const ctx = String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
    expect(ctx).toMatch(/\[medic-ambush\] \(SOFT; window [^)]*\): so far — [^\n]*Original route \(SOFT: the default course\): /);
    expect(ctx).toMatch(/HOW FAR THE ORIGINAL ROUTE OF A CANON EVENT BINDS, by its class: FREE — reference only[^]*SOFT — the original route is the default course: its characters keep the goals they have in it[^]*only where a concrete cause in actual play requires it[^]*they do not drop it\. Your own guess at what a character might think, fear or prefer is not such a cause/);
    expect(ctx).not.toMatch(/the original route is reference only\)/);
  });

  it('OG4 the GM is told about an event under way in every reply until it ends, even when no message names it', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [OG4a]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(await turn(x, 'I duck.', 'You duck behind a cart. [OG4b]', { scene_end: at(1, 10, 0) })).toBe(true);
    const ctx = x.model.tasks('draft').map((d: any) => String(d.input.engineContext)).slice(-1)[0];
    expect(ctx).toMatch(/CANON EVENTS UNDER WAY in this branch[^\n]*\n- .*\[medic-ambush\][^\n]*so far — Ambush on the road/);
    // once it ends the section goes away
    expect(await turn(x, 'I pull Mira away.', 'The attackers flee. [OG4c]', ambush('diverged', 'The attackers flee', 'Ambush repelled'))).toBe(true);
    expect(await turn(x, 'I catch my breath.', 'Quiet returns. [OG4d]', { scene_end: at(1, 10, 5) })).toBe(true);
    const last = x.model.tasks('draft').map((d: any) => String(d.input.engineContext)).slice(-1)[0];
    expect(last).not.toMatch(/CANON EVENTS UNDER WAY/);
  });

  it('OG5 before writing, the GM is told which canon events start within two hours if its story time gets there', async () => {
    const x = await setup(); // 09:30; the ambush starts 10:00, the broadcast 12:00
    expect(await turn(x, 'I walk to the harbor.', 'Gulls circle. [OG5a]', { scene_end: at(1, 9, 40) })).toBe(true);
    const ctx = String(x.model.tasks('draft')[0].input.engineContext);
    const sec = ctx.split('\n\n').find((s) => s.startsWith('CANON EVENTS ABOUT TO START')) || '';
    expect(sec).toMatch(/\[medic-ambush\] \(FREE\) starts .*\(in 30 min\)/);
    expect(sec).toMatch(/the world does not wait/);
    expect(sec).toMatch(/Do not speed up or slow down time/);
    expect(sec).not.toMatch(/council-broadcast/); // 2.5 hours away
    // not repeated in the 24-hour background list
    const bg = ctx.split('\n\n').find((s) => s.startsWith('WHERE OTHER CHARACTERS STAND')) || '';
    expect(bg).not.toMatch(/Ambush/i);
  });

  it('TJ1 a time jump the player asks for announces every canon event starting before its end', async () => {
    const x = await setup(); // 09:30; ambush 10:00, broadcast 12:00 (both day 1); the HARD conflict starts day 2 09:00
    x.model.on('extract_user', (i) => String(i.message).includes('tomorrow morning'), { statements: [{ kind: 'time_proposal', quote: 'I sleep until tomorrow morning', summary: 'sleeps until the next morning', entities: [], facts: [], event_id: null, time: { day: 2, minute: 420 }, ambiguous: false }], references: [], scene_entities: [] }, true);
    expect(await turn(x, 'I sleep until tomorrow morning.', 'You wake at dawn. [TJ1a]', { scene_end: at(2, 7, 0) })).toBe(true);
    const ctx = String(x.model.tasks('draft').slice(-1)[0].input.engineContext);
    const sec = ctx.split('\n\n').find((s) => s.startsWith('CANON EVENTS ABOUT TO START')) || '';
    expect(sec).toMatch(/the player's message jumps story time to .*; these start before then/);
    expect(sec).toMatch(/Keep the jump the player asked for/);
    expect(sec).toMatch(/\[medic-ambush\] \(FREE\) starts .*\(in 30 min\)/);
    expect(sec).toMatch(/\[council-broadcast\] \(SOFT\) starts .*\(in 2 h 30 min\)/); // beyond the usual 2 hours, inside the jump
    expect(sec).not.toMatch(/harbor-festival/); // day 3: after the jump
  });

  it('TJ2 a jump backwards or implausibly far is ignored: the usual two hours apply', async () => {
    for (const time of [{ day: 1, minute: 300 }, { day: 30, minute: 0 }]) {
      const x = await setup();
      x.model.on('extract_user', (i) => String(i.message).includes('skip'), { statements: [{ kind: 'time_proposal', quote: 'I skip ahead', summary: 'skip', entities: [], facts: [], event_id: null, time, ambiguous: false }], references: [], scene_entities: [] }, true);
      expect(await turn(x, 'I skip ahead.', 'Time passes. [TJ2]', { scene_end: at(1, 9, 40) })).toBe(true);
      const sec = String(x.model.tasks('draft').slice(-1)[0].input.engineContext).split('\n\n').find((s) => s.startsWith('CANON EVENTS ABOUT TO START')) || '';
      expect(sec).toMatch(/within 2 hours of story time/);
      expect(sec).not.toMatch(/council-broadcast/);
    }
  });

  it('AJ1 when the second review places the reply later, the events whose windows close in the extra time are settled too', async () => {
    const x = await setup(); // 09:30; ambush 10:00, broadcast 12:00
    x.host.addUser('I wander the docks for a while.');
    x.model.draft('Hours pass on the docks. [AJ1]');
    const isDraft = (i: any) => String(i.candidate).includes('[AJ1]');
    x.model.on('evaluate', isDraft, { scene_end: at(1, 12, 30) }); // the review that sees the staged ambush
    x.model.on('evaluate', isDraft, { scene_end: at(1, 11, 0) }, true); // first review
    expect(await x.engine.runOperation('normal')).toBe(true);
    const s = st(x);
    expect(s.clock.lo).toBe(tick(1, 12, 30));
    expect(s.dispositions.has('medic-ambush')).toBe(true);
    expect(s.dispositions.has('council-broadcast')).toBe(true); // window closed at 12:00, inside the later end
  });

  it('OG2 the reviewer is told not to call an event changed only because its result is not shown yet', () => {
    const PROMPTS = PROMPTS_;
    expect(PROMPTS.evaluate).toMatch(/Never use "diverged" only because the result is not shown yet/);
    expect(PROMPTS.evaluate).toMatch(/"ongoing"/);
  });
});

describe('state claims', () => {
  it('CL1 a claimed boolean written as text ("true") is not a contradiction of true', async () => {
    const x = await setup();
    expect(await turn(x, 'I greet Mira.', 'Mira smiles back. [CL1]', { scene_end: at(1, 9, 35), state_claims: [{ entity_id: 'mira', predicate: 'alive', value: 'true', quote: 'Mira smiles back' }] })).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations).toEqual([]);
  });

  it('CL2 a change the reply shows, filed by the reviewer as a presupposition, is taken as that event\'s result (not three repairs)', async () => {
    const x = await setup();
    const ev = { scene_end: at(1, 9, 40), occurrences: [occ('o1', 'The doomsday device fires', 'the world cracks apart', { affected: ['planet'] })], state_claims: [{ entity_id: 'planet', predicate: 'exists', value: false, quote: 'the world cracks apart' }] };
    expect(await turn(x, 'I press the button.', 'The device fires and the world cracks apart. [CL2]', ev)).toBe(true);
    expect(x.model.tasks('draft').length).toBe(1); // no repair
    expect(factAt(st(x), 'planet', 'exists').value).toBe(false);
  });

  it('CL3 bringing the dead back is still a contradiction, even inside an event of the reply', async () => {
    const x = await setup();
    // the ambush at 10:00 kills Mira along the original route
    expect(await turn(x, 'I wait until noon.', 'Noon comes. [CL3a]', { scene_end: at(1, 11, 0) })).toBe(true);
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false);
    const ev = { scene_end: at(1, 11, 5), occurrences: [occ('o1', 'Mira walks in', 'Mira walks in', { actors: ['mira'] })], state_claims: [{ entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira walks in' }] };
    await turn(x, 'I look at the door.', 'Mira walks in. [CL3b]', ev);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/presupposes .*alive=true/);
  });
});

describe('greetings that are instructions', () => {
  it('GR1 binding a chat whose greeting is a setup instruction does not leave an unresolved conflict', async () => {
    const x = makeEngine();
    x.host.chat[0].text = '当前世界设定、玩家人设与可用资料已载入。用户可以直接行动，也可以只给一句简短开局要求，例如：“开始”。';
    // the reviewer keeps it but complains that it is not a story reply (blocking)
    x.model.on('evaluate', (i) => String(i.candidate).includes('已载入'), { decision: 'retain', violations: [{ code: 'not_story', quote: '用户可以直接行动', detail: 'The candidate is a meta-instruction prompt, not a story reply.', blocking: true }] });
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('test');
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
    const PROMPT = PROMPTS_.evaluate;
    expect(PROMPT).toMatch(/not story text at all \(out-of-character instructions, a setup or system note/);
  });
});

describe('结束事件', () => {
  it('CE1 an event under way is concluded from what happened in the story (the beats are the evidence), and can be undone', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [CE1]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [{ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'The player drove the attackers off; Mira survived.', actors: ['mira'], causes: [], effects: [], plan_step_ids: [], reason: 'the player intervened', extraordinary: false }] });
    expect(await x.engine.concludeEvent('medic-ambush')).toBe('diverged');
    const call = x.model.tasks('adjudicate').slice(-1)[0].input;
    expect(call.recent_actual_play_with_these_characters.join(' ')).toMatch(/Ambush on the road/); // the beats so far
    expect(call.unmet_conditions[0]).toMatch(/marked this event as FINISHED/);
    const d = st(x).dispositions.get('medic-ambush')!;
    expect(d.disposition).toBe('diverged');
    expect(factAt(st(x), 'mira', 'alive').value).not.toBe(false); // not the original route
    const beat = [...st(x).occurrences.values()].find((o) => o.inProgressOf === 'medic-ambush')!;
    expect(st(x).occurrences.get(d.occurrenceId!)!.causes).toContain(beat.occurrenceId);
    await x.engine.undoForce('medic-ambush');
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
  });

  it('CE3 a judgement is not thrown away for one bad effect: names are resolved, unknown entities dropped, text booleans coerced; a bare item is wrapped', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [CE3]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    // a bare adjudication object (no "adjudications" list) with an effect naming Mira by name, a text boolean, and an unknown entity
    (x.model as any).rules.unshift({ task: 'adjudicate', raw: JSON.stringify({ event_id: 'medic-ambush', decision: 'diverged', time: null, account: 'The player drove the attackers off.', actors: [], causes: [], effects: [{ op: 'set', entity_id: 'Mira', predicate: 'alive', value: 'true' }, { op: 'set', entity_id: 'nana', predicate: 'alive', value: true }], plan_step_ids: [], reason: 'the player intervened', extraordinary: false }), once: true });
    expect(await x.engine.concludeEvent('medic-ambush')).toBe('diverged');
    const d = st(x).dispositions.get('medic-ambush')!;
    expect(st(x).occurrences.get(d.occurrenceId!)!.outcome).toEqual([{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true }]);
  });

  it('CE2 without a valid judgement nothing is recorded; an event not started yet cannot be concluded', async () => {
    const x = await setup(true); // 09:30: the ambush (10:00) has not started
    await expect(x.engine.concludeEvent('medic-ambush')).rejects.toThrow(/not started yet/);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [CE2]', ambush('ongoing', 'Bolts start flying'))).toBe(true);
    x.model.on('adjudicate', (i) => i.candidate?.id === 'medic-ambush', { adjudications: [] });
    await expect(x.engine.concludeEvent('medic-ambush')).rejects.toThrow(/could not conclude this event/);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
  });
});

describe('关联本局事件', () => {
  it('LK1 story events the reviewer did not recognise can be linked to the canon event by hand, as changed or occurred, and undone', async () => {
    const x = await setup(); // 09:30; ambush 10:00 (original result: Mira killed)
    const beat = { scene_end: at(1, 9, 50), occurrences: [occ('o1', 'Bandits jump Mira on the road', 'Bandits jump Mira', { actors: ['mira'] })] };
    expect(await turn(x, 'I walk with Mira.', 'Bandits jump Mira; you drive them off. [LK1]', beat)).toBe(true);
    expect(st(x).dispositions.has('medic-ambush')).toBe(false); // not recognised
    const cands = x.engine.linkCandidates('medic-ambush');
    const b = cands.find((c) => c.title === 'Bandits jump Mira on the road');
    expect(b).toBeTruthy();
    // the result differs: what play established stands (Mira lives)
    await x.engine.linkEvent('medic-ambush', [b!.id], 'diverged');
    let d = st(x).dispositions.get('medic-ambush');
    expect(d?.disposition).toBe('diverged');
    const linked = st(x).occurrences.get(d!.occurrenceId!)!;
    expect(linked.linkedFrom).toEqual([b!.id]);
    expect(linked.causes).toEqual([b!.id]);
    expect(factAt(st(x), 'mira', 'alive').value).not.toBe(false);
    // undo, then link as the original result
    await x.engine.undoForce('medic-ambush');
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    await x.engine.linkEvent('medic-ambush', [b!.id], 'occurred');
    d = st(x).dispositions.get('medic-ambush');
    expect(d?.disposition).toBe('occurred');
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false); // the original outcome applies
    await expect(x.engine.linkEvent('medic-ambush', [], 'occurred')).rejects.toThrow(/at least one/);
  });
});

describe('重新分析', () => {
  it('RA1 re-examines the message that recorded the result with the current rules; later replies stay', async () => {
    const x = await setup(true);
    expect(await turn(x, 'I follow Mira onto the road.', 'At 10:00 bolts start flying at Mira. [RA1a]', ambush('diverged', 'Bolts start flying'))).toBe(true);
    expect(await turn(x, 'I look for cover.', 'You crouch behind a cart. [RA1b]', { scene_end: at(1, 10, 0) })).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    expect(x.engine.reanalyzableSource('medic-ambush')).not.toBeNull();
    // the reviewer now (correctly) sees the fight under way
    x.model.on('evaluate', (i) => String(i.candidate).includes('[RA1a]'), ambush('ongoing', 'Bolts start flying'));
    const before = x.model.tasks('evaluate').length;
    expect(await x.engine.reanalyzeEvent('medic-ambush')).toBe('ongoing');
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    const again = x.model.tasks('evaluate').slice(before).map((c: any) => String(c.input.candidate));
    expect(again.some((c) => c.includes('[RA1a]'))).toBe(true);
    expect(x.host.chat.map((m) => m.text).join(' ')).toContain('[RA1b]');
  });

  it('RA2 a result from the starting history or a 强制完成 has nothing to re-analyse', async () => {
    const x = await setup();
    await x.engine.forceComplete('council-broadcast');
    expect(x.engine.reanalyzableSource('council-broadcast')).toBeNull();
    await expect(x.engine.reanalyzeEvent('council-broadcast')).rejects.toThrow(/nothing to re-analyse/);
  });
});
