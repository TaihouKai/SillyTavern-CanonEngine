// CO: a task's request is laid out for the provider's prompt cache (model.ts cacheOrdered), which serves only the
// start a request shares with an earlier one. Live (2026-11-25, DeepSeek): a normal turn paid 85–98% of its input in
// full, because each request began with what changes every call (the reply being checked, the time) and the context
// that is mostly the same from call to call came after it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cacheOrdered, taskMessages } from '../../src/core/runtime/model';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

describe('requests laid out for the prompt cache', () => {
  it('CO1 what holds for the game first, the large context next, what changes every call after it, the subject last; nothing lost', () => {
    const input = { mode: 'draft', candidate: 'the reply', current_time: { day: 1 }, retrieved_context: 'CTX', claims: [1], due_hard: [2], something_new: 3, registry: [4] };
    const out = cacheOrdered(input) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual(['due_hard', 'retrieved_context', 'something_new', 'registry', 'claims', 'candidate', 'mode', 'current_time']);
    expect(out).toEqual(input);
    // lists and plain values are as they are
    expect(cacheOrdered([3, 1])).toEqual([3, 1]);
    expect(cacheOrdered('x')).toBe('x');
    // two checks of different replies against the same context share everything up to the reply
    const a = taskMessages('evaluate', 'SYS', { ...input, candidate: 'first draft' })[1].content;
    const b = taskMessages('evaluate', 'SYS', { ...input, candidate: 'the rewrite' })[1].content;
    let n = 0;
    while (a[n] === b[n]) n++;
    expect(a.slice(0, n)).toContain('"retrieved_context":"CTX"');
    expect(a.slice(0, n)).toContain('"claims"');
  });

  it("CO2 the review's instructions are the same on a turn with a companion's chance event and on one without", async () => {
    const x = makeEngine();
    x.model.on('foreknow', null, { judgements: [{ id: 'k1', knows: false, how: 'chance' }] });
    await x.engine.bind(demo, { startTick: tick(1, 8, 30), mode: 'new' });
    await x.engine.reconcile('test');
    for (const [u, d] of [['I look around.', 'Quiet morning. [CO2a]'], ['I walk with Mira.', 'Mira walks beside me. [CO2b]'], ['We keep walking.', 'The road goes on. [CO2c]']]) {
      x.host.addUser(u);
      x.model.draft(d);
      x.model.on('evaluate', (i) => String(i.candidate).includes(d.slice(-6)), { scene_entities: d.includes('Mira') ? ['mira'] : [] });
      expect(await x.engine.runOperation('normal')).toBe(true);
    }
    const reviews = x.model.tasks('evaluate');
    expect(reviews.length).toBeGreaterThanOrEqual(3);
    expect(reviews.some((r) => r.input.chance_events_with_companion?.length)).toBe(true);
    expect(reviews.some((r) => !r.input.chance_events_with_companion?.length)).toBe(true);
    expect(new Set(reviews.map((r) => r.messages![0].content)).size).toBe(1);
  });
});
