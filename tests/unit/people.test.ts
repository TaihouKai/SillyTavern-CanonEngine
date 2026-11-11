// PP: characters act like people. Live (user report 2026-11-08): 白井 kept questioning the player about 暗部 company,
// asked for statements and signatures, and after a refusal left with "if not today, then tomorrow"; 食蜂 called
// herself 本女王 for a whole game. Re-asking an answered question had silently stopped being enforced (only binding
// refusals were), the one in-character reaction to a refusal was used to ask again, an in-scene demand was not a
// contact (so a refusal was not tied to it), and nothing told the GM or the reviewer about caricature.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { PROMPTS, GM_INTEGRATION_RULES } from '../../src/core/runtime/prompts';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;
const PROFILE = { player: { name: 'Ash', aliases: [], summary: 'a dock worker', public_identity: '' }, affiliations: [], places: [], capabilities: [], resources: [], goals: [], relationships: [], knowers: [], uncertain: [] };

async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Ash', description: 'Ash, a dock worker.' });
  x.model.on('profile', null, PROFILE);
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
const st = (x: X) => x.engine.current!.replay.state;
const answer = (quote: string, contactId: string, stance: string) => ({ statements: [{ kind: 'engagement', quote, summary: stance, entities: [], facts: [], event_id: null, time: null, ambiguous: false, stance, scope_kind: 'contact', scope_ref: contactId, scope_label: null, until: null }], references: [], scene_entities: [] });

describe('characters act like people', () => {
  it('PP1 the rules: people, not tropes; a refusal is not renewed in another form; an in-scene demand is a contact; caricature is reviewed', () => {
    expect(GM_INTEGRATION_RULES).toMatch(/CHARACTERS AS PEOPLE: [^\n]*A title or nickname others use for someone[^\n]*is not how they speak of themselves[^\n]*only with the authority they really have[^\n]*in proportion/);
    expect(GM_INTEGRATION_RULES).toMatch(/PLAYER'S ANSWERS:[^\n]*no deadline or later appointment[^\n]*veiled threat[^\n]*After a no, they let it go/);
    expect(PROMPTS.evaluate).toMatch(/A demand or request from someone present that asks the player character to do something beyond the conversation[^\n]*is a contact/);
    expect(PROMPTS.evaluate).toMatch(/a reaction that renews the demand in another form[^)]*is asking again/);
    expect(PROMPTS.evaluate).toMatch(/Caricature \(code "character_caricature", blocking\)/);
  });

  it('PP2 asking an answered question again is sent back, also when the player made no binding decision; the GM is told not to renew it', async () => {
    const x = await setup();
    x.host.addUser('I eat a crepe with a friend.');
    x.model.draft('An officer stops you: come to the branch and give a statement. [Q1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[Q1]'), { contacts: [{ quote: 'come to the branch and give a statement', actors: ['council'], kind: 'request', scope_kind: 'storyline', scope_ref: 'statement', scope_label: 'a statement at the branch', opportunity_id: null }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    const q = st(x).contacts.at(-1)!;
    x.host.addUser('No. I did nothing wrong.');
    x.model.on('extract_user', (i) => String(i.message).includes('No. I did'), answer('No. I did nothing wrong', q.recordId, 'refused'), true);
    x.model.draft('"Then tomorrow at the branch, and I will be watching you." [Q2]', 'She frowns, then lets you go. [Q3]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[Q2]'), { violations: [{ code: 'engagement_pressure', quote: 'Then tomorrow at the branch', detail: 'renews the refused demand with a deadline', blocking: true }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/pulls the player toward something they declined/);
    expect(String(x.model.tasks('draft').at(-1)!.input.engineContext)).toMatch(/refused to answer: [^\n]*no deadline or later appointment/);
  });

  it('PP3 a caricature is sent back once; a rewrite that keeps it stands', async () => {
    const x = await setup();
    x.host.addUser('I greet her.');
    x.model.draft('"本女王 is pleased," she says. [C1]', '"本女王 is still pleased." [C2]');
    x.model.on('evaluate', (i) => /\[C[12]\]/.test(String(i.candidate)), { violations: [{ code: 'character_caricature', quote: '本女王', detail: 'calls herself by the nickname others use', blocking: true }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    const t = x.engine.lastTrace!;
    expect(t.attempts[0].violations.join(' ')).toMatch(/A character acts as a caricature of themselves/);
    expect(t.attempts.length).toBe(2);
    expect(t.attempts[1].violations).toEqual([]);
  });
});
