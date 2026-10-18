// T01: small automatic fixes are grouped apart from resent outputs in the turn timing tooltip.
import { expect, it } from 'vitest';
import { splitRejects } from '../../src/runtime/engine';

it('T01 fixes are grouped by kind with a count; resends stay separate', () => {
  const r = splitRejects([
    'evaluate: kept after a fix: set occurrences/0/continues to null (must match pattern)',
    'evaluate: kept after a fix: set occurrences/3/continues to null (must match pattern)',
    'evaluate: invalid JSON, resent',
  ]);
  expect(r.rejects).toEqual(['evaluate: invalid JSON, resent']);
  expect(r.fixes).toEqual(['evaluate: set occurrences/#/continues to null (must match pattern) ×2']);
});

it('T02 one broken field is fixed and reported once, not once per schema error', async () => {
  const { callStructured, taskDefaults } = await import('../../src/runtime/model');
  const notes: string[] = [];
  taskDefaults.onReject = (t, e) => notes.push(`${t}: ${e}`);
  const occ = { id: 'o1', title: 't', account: 'a', quote: 'q', origin: 'gm', time: { start: '傍晚' } };
  const reply = { decision: 'retain', scene_end: null, transitions: [], occurrences: [occ], state_claims: [], player_actions: [], violations: [], hard_checks: [], claim_checks: [] };
  const port = { async runTask() { return JSON.stringify(reply); }, async generateDraft() { return ''; } } as any;
  try {
    await callStructured<any>(port, 'evaluate', 'sys', {});
  } catch { /* the rest of the made-up occurrence may still be invalid; only the notes matter */ }
  taskDefaults.onReject = null;
  expect(notes.filter((n) => /occurrences\/0\/time/.test(n)).length).toBe(1);
});
