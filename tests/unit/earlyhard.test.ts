// EH1–EH2: live finding — a morning reply walked to the opening ceremony (08:00) and the reviewer's minimum estimate of
// the whole reply ended at 07:40; "depicted outside its authored bounds" sent three rewrites back. An estimated time a
// little before a canonical event's start is moved up to it; a stated time is still checked.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

async function setup() {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: tick(2, 7, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
const begins = (sceneEnd: any) => ({
  scene_end: sceneEnd,
  occurrences: [occ('o1', 'The harbor fighting starts', 'Council militias storm the docks', { pack_event_id: 'conflict-begins', disposition: 'occurred', actors: ['council', 'union'] })],
  transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: 'Council militias storm the docks', occurrence_ref: 'o1' }],
  hard_checks: [{ event_id: 'conflict-begins', status: 'fulfilled', occurrence_ref: 'o1', quote: 'Council militias storm the docks' }],
});
async function turn(x: ReturnType<typeof makeEngine>, draft: string, evalPatch: any) {
  x.host.addUser('I walk down to the harbor.');
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}

describe('a canonical event estimated a little before its start', () => {
  it('EH1 an estimate before the start is moved up to it; the clock reaches the start', async () => {
    const x = await setup();
    const est = { lo: at(2, 7, 30).lo, hi: at(2, 7, 40).hi, precision: 'approx' };
    expect(await turn(x, 'I walk down; Council militias storm the docks. [EH1]', begins(est))).toBe(true);
    const s = x.engine.current!.replay.state;
    expect(s.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(s.clock.lo).toBeGreaterThanOrEqual(tick(2, 9, 0));
    expect(x.engine.lastTrace!.attempts[0].violations).toEqual([]);
  });

  it('EH3 a story event setting exactly the HARD outcome within its window is that event (live: 开幕式现在开始)', async () => {
    const x = await setup();
    const loose = (sceneEnd: any) => ({
      scene_end: sceneEnd,
      occurrences: [occ('o1', 'Fighting at the docks', 'Council militias storm the docks', { actors: ['council', 'union'] })],
      transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: 'Council militias storm the docks', occurrence_ref: 'o1' }],
      hard_checks: [{ event_id: 'conflict-begins', status: 'not_due', occurrence_ref: null, quote: null }],
    });
    const est = { lo: at(2, 8, 50).lo, hi: at(2, 9, 0).hi, precision: 'approx' };
    expect(await turn(x, 'I walk down; Council militias storm the docks. [EH3]', loose(est))).toBe(true);
    expect(x.engine.lastTrace!.attempts[0].violations).toEqual([]);
    expect(x.engine.current!.replay.state.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    // far before the window it is not taken as the event: still a violation
    const y = await setup();
    await turn(y, 'At 07:30 Council militias storm the docks. [EH3b]', loose(at(2, 7, 30)));
    expect(y.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/required outcome of pending HARD/);
  });

  it('EH2 a time the text states before the start is still a violation', async () => {
    const x = await setup();
    await turn(x, 'At 07:40 Council militias storm the docks. [EH2]', begins(at(2, 7, 40)));
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/outside its authored bounds/);
  });
});
