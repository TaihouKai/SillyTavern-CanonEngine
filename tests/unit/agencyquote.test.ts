// AQ: live finding — the reviewer sent a reply back for "making the player go along with 美铃 without agreeing",
// quoting 美铃's own request, in a reply that ended on 食蜂 asking the player what she would do. A free-text complaint
// about the player character whose evidence neither is one of the reviewer's player_actions nor names the player
// character is someone else's line: a note, not a rewrite.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  (x.host as any).persona = () => ({ name: 'Vera Lantern', description: 'Vera owns a tea house.' });
  x.model.on('profile', null, { player: { name: 'Vera Lantern', aliases: [], summary: 'tea house owner' }, affiliations: [], relationships: [], knowers: [] });
  await x.engine.bind(demo, { startTick: tick(1, 7, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
const complaint = (quote: string) => ({ violations: [{ code: 'player_agency', quote, detail: '玩家角色既未答应也未拒绝，回复却替玩家做出了决定', blocking: true }] });

describe('reviewer complaints about the player character need the player character in their evidence', () => {
  it('AQ1 evidence that is another character\'s line is a note', async () => {
    const x = await setup();
    x.host.addUser('I listen.');
    x.model.draft('Mira falls in step behind the group, smiling. [AQ1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[AQ1]'), complaint('Mira falls in step behind the group'));
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts).toHaveLength(1);
  });

  it('AQ2 evidence naming the player character is sent back', async () => {
    const x = await setup();
    x.host.addUser('I listen.');
    x.model.draft('Vera agrees to take Mira there. [AQ2a]', 'Mira waits for an answer. [AQ2b]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[AQ2a]'), complaint('Vera agrees to take Mira there'));
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/替玩家做出了决定/);
  });
});
