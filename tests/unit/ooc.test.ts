// OOC: out-of-character parts of the player's message, marked with the OOC keyword (setting oocKeyword). The user's
// case: "(OOC: if A, then B; if C, then D)" — the GM should simply have them do D when C happens, never narrate
// "the player is considering: if A, then B…"; the text goes only to the checker and the GM's hidden note.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { PROMPTS } from '../../src/runtime/prompts';
import { oocNote, splitOoc, storyOnly } from '../../src/runtime/ooc';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}

describe('OOC keyword', () => {
  it('OOC1 finds the marked parts in every bracket style and as a line of its own; the rest is the story text', () => {
    expect(splitOoc('我推开门。（OOC：如果黑子来了，我就躲进衣柜；如果是美琴，就开门）', 'OOC')).toEqual({ story: '我推开门。', ooc: ['如果黑子来了，我就躲进衣柜；如果是美琴，就开门'] });
    expect(splitOoc('I wait. (ooc: if she leaves (angry), I follow her)', 'OOC')).toEqual({ story: 'I wait.', ooc: ['if she leaves (angry), I follow her'] });
    expect(splitOoc('[OOC skip the small talk] 我坐下。【OOC：别写我的心理活动】', 'OOC')).toEqual({ story: '我坐下。', ooc: ['skip the small talk', '别写我的心理活动'] });
    expect(splitOoc('我点头。\nOOC: if C, then D\n然后离开。', 'OOC')).toEqual({ story: '我点头。\n\n然后离开。', ooc: ['if C, then D'] });
    expect(splitOoc('我点头。(戏外：如果她哭了就递纸巾)', '戏外').ooc).toEqual(['如果她哭了就递纸巾']);
    // mixed half- and full-width brackets, and an unclosed one runs to the end
    expect(splitOoc('嗯。(OOC：如果A就B）好。', 'OOC')).toEqual({ story: '嗯。好。', ooc: ['如果A就B'] });
    expect(splitOoc('嗯。（OOC：如果A就B', 'OOC')).toEqual({ story: '嗯。', ooc: ['如果A就B'] });
  });

  it('OOC2 ordinary brackets, a longer word starting with the keyword, and an empty keyword are left alone', () => {
    const t = '她（小声）说：“OOCX 是什么？” (I smile) OOC is a word.';
    expect(splitOoc(t, 'OOC')).toEqual({ story: t, ooc: [] });
    expect(splitOoc('（OOC：如果A就B）', '')).toEqual({ story: '（OOC：如果A就B）', ooc: [] });
    expect(storyOnly('（OOC：如果A就B）', 'OOC')).toBe('……'); // only OOC: a silent beat, never an empty message
    expect(storyOnly('I wait.', 'OOC')).toBe('I wait.');
  });

  it('OOC3 the GM gets the directions as a hidden note, not as the player\'s story input or intent', async () => {
    const x = await setup();
    x.host.addUser('I sit with Mira. (OOC: if Mira cries, I hand her a tissue; if the guard comes, I leave)');
    x.model.on('extract_user', null, { statements: [
      { kind: 'attempted_action', quote: 'I sit with Mira.', summary: 'sits with Mira' },
      { kind: 'hypothetical', quote: 'if Mira cries, I hand her a tissue', summary: 'plans to hand a tissue if Mira cries' },
      { kind: 'ooc_direction', quote: 'if the guard comes, I leave', summary: 'leaves if the guard comes' },
    ], references: [], scene_entities: [] });
    x.model.draft('You sit with Mira. [O1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('extract_user')[0].input.ooc_parts).toEqual(['if Mira cries, I hand her a tissue; if the guard comes, I leave']);
    const ctx = String(x.model.tasks('draft')[0].input.engineContext);
    const [packet, note] = ctx.split("PLAYER'S OUT-OF-CHARACTER INSTRUCTIONS");
    expect(note).toMatch(/if Mira cries, I hand her a tissue[^]*never show the player character weighing, planning or "considering" them[^]*only when C actually happens/);
    expect(packet).toMatch(/I sit with Mira\./);
    expect(packet).not.toMatch(/tissue|guard comes|OOC/);
    const ev = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(ev.player_action_scope).toBe('I sit with Mira.');
    expect(ev.player_ooc_instructions).toEqual(['if Mira cries, I hand her a tissue; if the guard comes, I leave']);
    // the next reply no longer carries it
    x.host.addUser('I stand up.');
    x.model.draft('You stand up. [O2]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(String(x.model.tasks('draft').slice(-1)[0].input.engineContext)).not.toMatch(/OUT-OF-CHARACTER|tissue/);
    expect(x.model.tasks('evaluate').slice(-1)[0].input.player_ooc_instructions).toBeUndefined();
  });

  it('OOC4 acting on a direction whose condition happened is the player\'s own act; narrating the plan is sent back', async () => {
    const x = await setup();
    x.host.addUser('I wait at the dock. (OOC: if the guard attacks, I punch him)');
    x.model.draft('The guard lunges; you punch him. [O3]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[O3]'), { player_actions: [{ quote: 'you punch him', authorized_by_quote: 'if the guard attacks, I punch him', category: 'combat' }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('draft')).toHaveLength(1); // combat is left to the player by default, but they ordered it

    x.host.addUser('I keep waiting. (OOC: if the guard attacks, I punch him)');
    x.model.draft('You think: if the guard attacks, I will punch him. [O4]', 'You keep waiting. [O5]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[O4]'), { violations: [{ code: 'ooc_leak', quote: 'You think: if the guard attacks, I will punch him.', detail: 'narrates the player\'s conditional plan', blocking: true }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/gives away the player's out-of-character instructions[^]*Apply them silently/);
  });

  it('OOC6 with no OOC directions this turn, an "ooc_leak" complaint (a preset preamble) is a note, not a rewrite', async () => {
    const x = await setup();
    x.engine.settings.debug = true; // keep warnings in the trace
    x.host.addUser('I wait at the dock.');
    x.model.draft('好的，这是你需求的最终输出：\n\nYou wait at the dock. [O6]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[O6]'), { violations: [{ code: 'ooc_leak', quote: '好的，这是你需求的最终输出：', detail: 'meta wording addressed to the player', blocking: true }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('draft')).toHaveLength(1);
    expect(x.engine.lastTrace!.attempts[0].warnings!.join(' ')).toMatch(/ooc_leak" ignored: the player gave no out-of-character directions/);
  });

  it('OOC5 the analysis prompts know the OOC inputs; the note exists only with directions', () => {
    expect(PROMPTS.extract_user).toMatch(/ooc_parts, when given[^]*never asserted_fact, attempted_action, spoken_dialogue/);
    expect(PROMPTS.extract_user).toMatch(/"kind":"[^"]*ooc_direction/);
    expect(PROMPTS.evaluate).toMatch(/player_ooc_instructions, when given[^]*only when its condition actually happens/);
    expect(PROMPTS.evaluate).toMatch(/code "ooc_leak"/);
    expect(oocNote([])).toBe('');
  });
});
