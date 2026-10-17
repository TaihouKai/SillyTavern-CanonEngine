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
