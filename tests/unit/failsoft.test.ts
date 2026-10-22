// F01–F05: helper analysis degrades instead of failing the turn; the final review stays strict.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callStructured, salvageTruncatedJson } from '../../src/runtime/model';
import type { ModelPort } from '../../src/runtime/model';
import { makeEngine, tick, at, occ, defaultTask } from './fake';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');

function port(replies: string[]): ModelPort & { seen: number } {
  const p = { seen: 0, async runTask() { p.seen++; return replies.shift() ?? '{}'; }, async generateDraft() { return ''; } };
  return p as unknown as ModelPort & { seen: number };
}
const claim = (n: number) => `{"id":"c${n}","quote":"码头","kind":"state","entity_phrases":[],"assertion":"narrator","expected":null}`;

describe('fail-soft analysis', () => {
  it('F01 salvageTruncatedJson keeps complete items and closes the brackets', () => {
    expect(salvageTruncatedJson('{"references":[],"claims":[{"id":"c1"},{"id":"c2"},{"id":"c')).toEqual({ references: [], claims: [{ id: 'c1' }, { id: 'c2' }] });
    expect(salvageTruncatedJson('{"a":1}')).toBeNull(); // complete: not a truncation
    expect(salvageTruncatedJson('{"claims":[{"id":"c')).toBeNull(); // nothing complete
  });

  it('F02 a cut-off discovery reply keeps its complete claims without another call (real-model finding)', async () => {
    const cut = `{"references":[],"claims":[${claim(1)},${claim(2)},{"id":"c3","quo`;
    const p = port([cut]);
    const out = await callStructured<any>(p, 'discover', 'sys', {});
    expect(p.seen).toBe(1);
    expect(out.claims.map((c: any) => c.id)).toEqual(['c1', 'c2']);
    // cut inside the first list: the missing list becomes empty
    const q = port([`{"references":[{"id":"r1","quote":"码头","phrase":"码头","ref_kind":"place","mode":"direct","assertion":"narrator","temporal":"present","candidate_ids":[]},{"id":"r2","quo`]);
    const out2 = await callStructured<any>(q, 'discover', 'sys', {});
    expect(out2.references.length).toBe(1);
    expect(out2.claims).toEqual([]);
  });

  it('F03 the final review is never salvaged from a cut-off reply', async () => {
    const p = port(['{"decision":"retain","violations":[{"code":"x","quote":"q","detail":"d"},{"code', '{"decision":"retain"']);
    await expect(callStructured<any>(p, 'evaluate', 'sys', {}, { maxAttempts: 2 })).rejects.toThrow(/invalid structured output for evaluate/);
  });

  it('F04 unusable discovery falls back to built-in name matching; the turn still completes', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look at the harbor.');
    x.model.draft('Mira waves from the harbor. [D1]');
    (x.model as any).rules.unshift({ task: 'discover', raw: 'not json', once: false });
    expect(await x.engine.runOperation('normal')).toBe(true);
    const ev = x.model.tasks('evaluate').slice(-1)[0].input;
    expect(JSON.stringify(ev.references)).toMatch(/mira/i); // deterministic floor still looked Mira up
    expect(x.engine.lastTimings!.rejects!.join(' ')).toMatch(/discover: unusable after retries, used built-in name matching/);
  });

  it('F05 a malformed recorded item is dropped and reported; the rest of the review is kept', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I walk the docks.');
    x.model.draft('You walk the docks at dawn. [E1]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[E1]'), { scene_end: at(1, 9, 45), occurrences: [occ('o1', 'Dock walk', 'walk the docks', { origin: 'player' }), { ref: 'o2', account: 'no title' }] });
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect([...x.engine.current!.replay.state.occurrences.values()].some((o) => o.title === 'Dock walk')).toBe(true);
    expect(x.engine.lastTimings!.rejects!.join(' ')).toMatch(/evaluate: kept after a fix: dropped occurrences item/);
  });

  it('F07 a review that leaves out required lists is asked again naming them; they are never assumed empty (live: five-day skip)', async () => {
    const full = defaultTask('evaluate', { candidate: 'x' });
    const part = { ...full };
    for (const k of ['state_claims', 'player_actions', 'violations', 'hard_checks']) delete part[k];
    const seen: any[] = [];
    const p = { async runTask(_t: string, msgs: any[]) { seen.push(msgs.map((m) => m.content).join('\n')); return seen.length === 1 ? JSON.stringify(part) : JSON.stringify(full); }, async generateDraft() { return ''; } } as any;
    const out = await callStructured<any>(p, 'evaluate', 'sys', {});
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatch(/missing these required top-level fields: state_claims, player_actions, violations, hard_checks/);
    expect(out.violations).toEqual(full.violations);
  });

  it('F06 an empty draft is asked for once more; two empty drafts fail with the provider\'s reason (live: DeepSeek, no text)', async () => {
    const x = makeEngine();
    await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
    await x.engine.reconcile('t');
    x.host.addUser('I look at the harbor.');
    x.model.draft('', 'Mira waves from the harbor. [G1]');
    expect(await x.engine.runOperation('normal')).toBe(true);
    expect(x.model.tasks('draft')).toHaveLength(2);
    expect(x.engine.lastTimings!.rejects!.join(' ')).toMatch(/draft: empty reply resent once/);
    x.host.addUser('I wait.');
    (x.model as any).lastDraftInfo = () => ({ finish: 'length', outputTokens: 4000, reasoningTokens: 3990, maxTokens: 4000 });
    x.model.draft('', '   ');
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/empty reply twice \(last: finish reason length, 4000 output tokens of which 3990 reasoning, limit 4000\)\. The model spent its output on reasoning/);
  });
});
