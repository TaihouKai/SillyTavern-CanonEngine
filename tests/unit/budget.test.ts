import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validatePack } from '../../src/domain/pack';
import { buildBootstrap } from '../../src/domain/schedule';
import { replay } from '../../src/runtime/replay';
import { WorldIndex } from '../../src/domain/world-query';
import { retrieve, buildPacket } from '../../src/runtime/context';

function setup() {
  const L = validatePack(JSON.parse(readFileSync('examples/demo.canon.json', 'utf8'))).loaded!;
  const start = L.coverage.start + 60;
  const rr = replay({ pack: L, branchId: 'b', bootstrap: buildBootstrap(L, start).records, entries: [], store: {} });
  const index = new WorldIndex(L, rr.state);
  const ids = [...L.entities.keys()];
  const r = retrieve(index, { refs: [], claims: [], sceneEntityIds: ids, causalSeedEntityIds: [], freeText: [], checkpointTick: start });
  const args: any = { pack: L, index, retrieval: r, checkpointTick: start, origin: null, sceneLabel: '', playerScope: [], plan: null, forced: false, stagedNotes: [], opportunities: [], budgetChars: 1e7, horizon: 360 };
  return { args, ids };
}

describe('context budget', () => {
  it('compact form is shorter but still names every retrieved entity', () => {
    const { args, ids } = setup();
    const full = buildPacket(args);
    const compact = buildPacket(args, true);
    expect(compact.required).toBeLessThan(full.required);
    for (const id of ids) expect(compact.text).toContain(`[${id}]`);
  });

  it('falls back to the compact form when the full one does not fit', () => {
    const { args } = setup();
    const compact = buildPacket(args, true);
    const p = buildPacket({ ...args, budgetChars: compact.required + 10 });
    expect(p.required).toBe(compact.required);
  });

  it('B03 rules shared by every entity are stated once, not repeated per entity', () => {
    const { args } = setup();
    const t = buildPacket(args).text;
    expect(t).toContain('a property not listed for an entity is UNKNOWN');
    expect(t).not.toMatch(/\n  UNKNOWN \(/);
    expect(t.match(/No other supported change/g) || []).toHaveLength(0);
    expect(t.match(/no other supported change through/g) || []).toHaveLength(1);
    expect(t).not.toMatch(/retrieved because: /);
  });

  it('a capacity error says how large the budget needs to be', () => {
    const { args } = setup();
    expect(() => buildPacket({ ...args, budgetChars: 500 })).toThrow(/raise budgetChars .* to at least \d+0000/);
  });
});

import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

describe('repair context budget', () => {
  async function run(budgetChars: number) {
    const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
    const x = makeEngine({ budgetChars });
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look around.');
    x.model.draft('Everyone is here. [B1]', 'Gulls circle. [B2]');
    const ids = [...x.engine.current!.index.pack.entities.keys()];
    // the rejected first draft mentions every entity of the pack
    x.model.on('discover', null, { references: ids.map((id, i) => ({ id: `r${i}`, quote: 'Everyone', phrase: id, ref_kind: 'other', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: [id] })), claims: [] }, true);
    x.model.on('evaluate', null, { decision: 'repair', violations: [{ code: 'tone', quote: 'Everyone', detail: 'too crowded' }] }, true);
    const ok = await x.engine.runOperation('normal');
    const ctx = x.model.tasks('draft').map((d: any) => d.input.engineContext.length as number);
    return { x, ok, ctx };
  }

  it('B01 a repair whose added records do not fit uses the draft context instead of failing the turn', async () => {
    const big = await run(1e7);
    expect(big.ok).toBe(true);
    expect(big.ctx[1]).toBeGreaterThan(big.ctx[0]); // the repair context grew with the draft's mentions
    const rules = big.x.model.tasks('draft')[0].input.engineContext.indexOf('[CANON ENGINE CONTEXT');
    let fellBack = 0;
    for (let b = big.ctx[0] - rules; b > 1000; b -= 150) {
      const r = await run(b);
      if (!r.ctx.length) break; // even the first draft's context no longer fits: a real capacity error
      expect(r.ok).toBe(true); // once the draft's context fits, the repair never fails the turn on capacity
      if ((r.x.engine.lastTimings!.fixes || []).join(' ').includes('did not fit the context budget')) { fellBack++; expect(r.ctx[1]).toBeLessThanOrEqual(b + rules + 2); }
    }
    expect(fellBack).toBeGreaterThan(0);
  });
});

describe('scene entities do not snowball', () => {
  it('B02 a reply stores the scene the reviewer saw and what it names, not everything the review looked up', async () => {
    const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    for (let i = 0; i < 3; i++) {
      x.host.addUser(`I wait at the harbor. (${i})`);
      x.model.draft(`Waves. [S${i}]`);
      // the reviewer sees only the harbor in the scene; the review's lookups also pull in the planet etc.
      x.model.on('evaluate', null, { scene_entities: ['harbor'] }, true);
      // turn 1 only: the player's message brings Mira and the union into the lookup
      if (i === 0) x.model.on('extract_user', null, { scene_entities: ['mira', 'union'] }, true);
      expect(await x.engine.runOperation('normal')).toBe(true);
    }
    const c = x.engine.campaign()!;
    const last = c.manifest[c.manifest.length - 1];
    const interp = Object.values(c.interpretations).flat().find((v: any) => v.messageId === last.messageId) as any;
    expect(interp.sceneEntities).toEqual(['harbor']);
  });
});

describe('analysis inputs stay small', () => {
  it('B04 the registry lists the entities relevant to the text, not the whole cast; the reviewer copy drops duplicated sections', async () => {
    const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look for Mira.');
    x.model.draft('Mira waves from the pier. [R1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    const ev = x.model.tasks('evaluate').map((c: any) => c.input).find((v: any) => String(v.candidate).includes('Mira waves'));
    const all = x.engine.current!.index.pack.entities.size;
    expect(ev.registry.entities.some((e: string) => e.startsWith('mira |'))).toBe(true);
    expect(ev.registry.entities.length).toBeLessThan(all);
    expect(ev.registry.entities_note).toMatch(/exact name/);
    expect(ev.retrieved_context).not.toContain('PLAYER SCOPE');
    expect(ev.retrieved_context).not.toContain('FUTURE OBLIGATIONS');
    expect(ev.retrieved_context).not.toContain('WHERE OTHER CHARACTERS STAND');
    // the story model's own context keeps them
    const draft = x.model.tasks('draft')[0].input.engineContext;
    expect(draft).toContain('PLAYER SCOPE');
    expect(draft).toContain('FUTURE OBLIGATIONS');
  });
});
