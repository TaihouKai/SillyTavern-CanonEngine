// DR: debug mode shows why each draft was sent back for rewriting, with the drafts (user request: "I'd like to see
// why is it rejected/re-writing"). Without debug mode, drafts are not kept.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { DEFAULT_PLAYER_VOICE, playerVoice } from '../../src/runtime/voice';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function turn(debug: boolean) {
  const x = makeEngine();
  x.engine.settings.debug = debug;
  x.engine.settings.playerVoice = playerVoice(DEFAULT_PLAYER_VOICE);
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('t');
  x.host.addUser('I watch the dock.');
  x.model.draft('You punch the guard. [D1]', 'You watch the dock. [D2]');
  x.model.on('evaluate', (i) => String(i.candidate).includes('[D1]'), { player_actions: [{ quote: 'You punch the guard', authorized_by_quote: null, category: 'combat' }] });
  expect(await x.engine.runOperation('normal')).toBe(true);
  return x;
}

describe('debug report of a turn', () => {
  it('DR1 debug mode: the report lists why the first draft was sent back, with both drafts; the tooltip data has the reasons', async () => {
    const x = await turn(true);
    const r = x.engine.lastReport!;
    expect(r).toMatch(/Attempt 1 \(first draft\): 1 problem\(s\) — sent back\n {2}- .*\(combat\): "You punch the guard"/);
    expect(r).toMatch(/Draft:\n {4}\| You punch the guard\. \[D1\]/);
    expect(r).toMatch(/Attempt 2 \(repair 1\): no problems — accepted[^]*\| You watch the dock\. \[D2\]/);
    expect(x.engine.lastTimings!.repairs).toEqual([[expect.stringMatching(/\(combat\)/)]]);
  });

  it('DR2 without debug mode no report and no draft text is kept', async () => {
    const x = await turn(false);
    expect(x.engine.lastReport).toBeNull();
    expect(x.engine.lastTrace!.attempts[0].draft).toBeUndefined();
    expect(x.engine.lastTimings!.repairs).toHaveLength(1);
  });
});
