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

  it('a capacity error says how large the budget needs to be', () => {
    const { args } = setup();
    expect(() => buildPacket({ ...args, budgetChars: 500 })).toThrow(/raise budgetChars .* to at least \d+0000/);
  });
});
