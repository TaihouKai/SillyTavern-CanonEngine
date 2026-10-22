// PV: what the GM may write for the player character (settings: playerVoice). Live finding: the built-in rule
// "do not supply player dialogue or actions" made the reviewer send back drafts for "she takes the juice and drinks"
// and every line of the player character's dialogue, though the user wants the GM to voice their character.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { gmRulesFor } from '../../src/runtime/prompts';
import { DEFAULT_PLAYER_VOICE, playerVoice, VOICE_KINDS } from '../../src/runtime/voice';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup(voice?: Partial<typeof DEFAULT_PLAYER_VOICE>) {
  const x = makeEngine();
  if (voice) x.engine.settings.playerVoice = playerVoice({ ...DEFAULT_PLAYER_VOICE, ...voice });
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}
const act = (quote: string, category: string | null) => ({ quote, authorized_by_quote: null, category });

describe('what the GM may write for the player character', () => {
  it('PV1 the GM is told what it may write and what is left to the player; with nothing ticked, the old strict rule', () => {
    const r = gmRulesFor(DEFAULT_PLAYER_VOICE);
    expect(r).toMatch(/the player wants you to write these for their character[^]*dialogue — what the player character says[^]*small actions/);
    expect(r).toMatch(/Leave these to the player[^]*combat — attacking[^]*decisions — accepting or refusing/);
    expect(r).not.toMatch(/\{\{PLAYER_VOICE\}\}/);
    const none = gmRulesFor(playerVoice(Object.fromEntries(VOICE_KINDS.map((k) => [k, false]))));
    expect(none).toMatch(/Do not supply new voluntary player actions, decisions, dialogue/);
  });

  it('PV2 by default the player character\'s lines and small acts pass the review; combat, decisions and acts without a kind are sent back', async () => {
    const x = await setup();
    x.host.addUser('I sit with Mira.');
    x.model.draft('"Long day," you say, and sip your tea. [V1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[V1]'), { player_actions: [act('"Long day," you say', 'dialogue'), act('sip your tea', 'actions')] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('draft')).toHaveLength(1); // no repair
    expect(x.model.tasks('evaluate').slice(-1)[0].input.player_voice.gm_may_write).toEqual(['dialogue', 'reactions', 'actions']);
    expect(String(x.model.tasks('draft')[0].input.engineContext)).toMatch(/the player wants you to write these for their character/);

    x.host.addUser('I watch the dock.');
    x.model.draft('You punch the guard. [V2]', 'You watch the dock. [V3]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[V2]'), { player_actions: [act('You punch the guard', 'combat')] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/did not write and leaves to themselves \(combat\): "You punch the guard"/);

    x.host.addUser('I wait.');
    x.model.draft('You agree to help. [V4]', 'You wait. [V5]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[V4]'), { player_actions: [act('You agree to help', null)] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/did not write and leaves to themselves: "You agree to help"/);
  });

  it('PV3 unticking dialogue makes the GM leave the player character\'s lines to the player again', async () => {
    const x = await setup({ dialogue: false });
    x.host.addUser('I sit with Mira.');
    x.model.draft('"Long day," you say. [V6]', 'Mira nods. [V7]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[V6]'), { player_actions: [act('"Long day," you say', 'dialogue')] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/leaves to themselves \(dialogue\)/);
    expect(String(x.model.tasks('draft')[0].input.engineContext)).toMatch(/Leave these to the player[^]*dialogue — what the player character says/);
  });
});
