// NT1–NT4: 常态 (a person's power, condition or body in everyday scenes). The pack gives versions; the one in force in
// this branch goes to the story model for the people in the scene, as background, never as story; the timeline lists
// them all, versions still to come only with spoilers.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ } from './fake';
import { ROOT } from './helpers';
import { lintPack, validatePackText } from '../../src/core/domain/pack';

const base = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
const V1 = { from_event: null, habits: 'hums a sea shanty while she sews wounds shut', uses: 'mends anyone hurt near her', others: 'dockers trust her', limits: 'cannot mend what is already dead' };
const V2 = { from_event: 'conflict-begins', until_event: null, why: 'the war leaves her hands shaking', habits: 'hands tremble when she sews', uses: 'still mends, slower', others: 'dockers worry about her', limits: 'no fine work any more' };
function packWith(nature: unknown[]) {
  const p = structuredClone(base);
  p.entities.find((e: any) => e.id === 'mira').nature = nature;
  return p;
}

async function setup(nature: unknown[] = [V1, V2]) {
  const x = makeEngine();
  await x.engine.bind(JSON.stringify(packWith(nature)), { startTick: tick(2, 7, 0), mode: 'new' });
  await x.engine.reconcile('test');
  return x;
}
async function turn(x: ReturnType<typeof makeEngine>, user: string, draft: string, evalPatch: any = {}, scene: string[] = ['mira']) {
  x.model.on('extract_user', (i) => String(i.message ?? i.text ?? JSON.stringify(i)).includes(user.slice(0, 8)), { statements: [], references: [], scene_entities: scene }, true);
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  await x.engine.runOperation('normal');
  return x.model.tasks('draft').slice(-1)[0].input.engineContext as string;
}
const begins = {
  scene_end: at(2, 9, 10),
  occurrences: [occ('o1', 'The harbor fighting starts', 'Council militias storm the docks', { pack_event_id: 'conflict-begins', disposition: 'occurred', actors: ['council', 'union'] })],
  transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: 'Council militias storm the docks', occurrence_ref: 'o1' }],
  hard_checks: [{ event_id: 'conflict-begins', status: 'fulfilled', occurrence_ref: 'o1', quote: 'Council militias storm the docks' }],
};

describe('常态', () => {
  it('NT1 the pack format: valid with versions; the first holds at the start, later ones start at known events', () => {
    expect(validatePackText(JSON.stringify(packWith([V1, V2]))).ok).toBe(true);
    expect(lintPack(packWith([V1, V2])).errors).toEqual([]);
    const errs = lintPack(packWith([{ ...V1, from_event: 'conflict-begins' }, { ...V2, from_event: null }, { ...V2, until_event: 'no-such-event' }])).errors.map((e) => e.message).join(' ');
    expect(errs).toMatch(/first version holds at the story start/);
    expect(errs).toMatch(/from_event is missing/);
    expect(errs).toMatch(/unknown event "no-such-event"/);
  });

  it('NT2 the version in force goes to the story model for the people in the scene, as background; a later one once its event occurred', async () => {
    const x = await setup();
    const ctx1 = await turn(x, 'I talk with Mira at the harbor.', 'Mira looks up. [NT2a]');
    expect(ctx1).toMatch(/HOW THEY ARE \(常态[\s\S]*Background, not story[\s\S]*not "knowing what they could not know"/);
    expect(ctx1).toMatch(/Mira \[mira\]: habits: hums a sea shanty/);
    expect(ctx1).not.toMatch(/hands tremble/);
    expect(x.engine.current!.index.natureNow('mira')!.index).toBe(0);
    await turn(x, 'I walk down to the harbor.', 'I walk down; Council militias storm the docks. [NT2b]', begins);
    expect(x.engine.current!.replay.state.dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    expect(x.engine.current!.index.natureNow('mira')!.index).toBe(1);
    const ctx3 = await turn(x, 'I find Mira again.', 'Mira is sewing. [NT2c]');
    expect(ctx3).toMatch(/Mira \[mira\]: habits: hands tremble/);
  });

  it('NT3 nobody in the scene with a nature: no section', async () => {
    const x = await setup();
    const ctx = await turn(x, 'I look at the sea alone.', 'The sea is grey. [NT3]', {}, []);
    expect(ctx).not.toMatch(/HOW THEY ARE/);
  });

  it('NT4 the timeline view: the version in force marked; one still to come only with spoilers', async () => {
    const x = await setup();
    const hidden = x.engine.natureView(false)!;
    expect(hidden.people.map((p) => p.name)).toEqual(['Mira']);
    expect(hidden.people[0].versions.map((v) => v.state)).toEqual(['now']);
    expect(hidden.hidden).toBe(1);
    const shown = x.engine.natureView(true)!;
    expect(shown.people[0].versions.map((v) => v.state)).toEqual(['now', 'later']);
    expect(shown.people[0].versions[1].from).toMatch(/./);
  });
});
