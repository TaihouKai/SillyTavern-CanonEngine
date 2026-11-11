// Audit 2026-11: what a failing or wrong model can put into the ledger.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;
const st = (x: X) => x.engine.current!.replay.state;
async function setup(text = demo, start = tick(1, 9, 30)) {
  const x = makeEngine();
  await x.engine.bind(text, { startTick: start, mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}

describe('audit: model output', () => {
  it('M1 (ACCEPTANCE I13; WORLD_STATE_CONTEXT_CONTRACT §4 "Missing data is not proof of … non-occurrence"): an adjudication the model never answered validly decides nothing', async () => {
    // the pack does not say whether Mira is alive at the start: the ambush (FREE) needs the model
    const p = JSON.parse(demo);
    p.initial_state.facts = p.initial_state.facts.filter((f: any) => !(f.fact.entity_id === 'mira' && f.fact.predicate === 'alive'));
    const x = await setup(JSON.stringify(p));
    x.host.addUser('I wait an hour.');
    x.model.draft('It is 10:30 when you look up again. [W]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[W]'), { scene_end: at(1, 10, 30) });
    x.model.rules.unshift({ task: 'adjudicate', respond: () => ({}), raw: 'not json at all' });
    const ok = await x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 20));
    expect(x.model.tasks('adjudicate').length).toBe(3); // asked, and asked again
    // either the turn fails with an error the player can retry, or the event stays open; it is not recorded as "did not happen"
    const d = x.engine.current ? st(x).dispositions.get('medic-ambush')?.disposition : undefined;
    expect({ turn: ok, disposition: d }).not.toEqual({ turn: true, disposition: 'omitted' });
  });

  // The code reads a reply's own clock ("it's already 9:45", clockReadings) and caps a reply that says nothing about
  // time at +20 minutes (UNTIMED_ADVANCE_MAX). Any other mention of a clock time (TIME_ANCHOR) lifts the cap, and the
  // reviewer's estimate is then taken as it is.
  async function wrongEstimate(draft: string) {
    const x = await setup();
    x.host.addUser('I look around.');
    x.model.draft(draft);
    x.model.on('evaluate', (i) => String(i.candidate).includes('[T]'), { scene_end: at(3, 12, 0) }); // the reviewer is wrong about the time
    await x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 20));
    return { sameDay: st(x).clock.lo < tick(2, 0, 0), adjudicated: [...st(x).dispositions.keys()] };
  }
  it('D1 control: a reply that says nothing about time → the wrong estimate is cut to +20 minutes', async () => {
    expect(await wrongEstimate('You wait on the pier. [T]')).toEqual({ sameDay: true, adjudicated: [] });
  });
  it('D1 (design: structure over model): a reply in which someone names a time ("see you at 8:00 tomorrow") → the same', async () => {
    expect(await wrongEstimate('"See you at 8:00 tomorrow," she says, and leaves. [T]')).toEqual({ sameDay: true, adjudicated: [] });
  });

});
