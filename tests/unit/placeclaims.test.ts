// PC1–PC4: state claims about places (free-text conditions, places the text never names).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { claimMatches } from '../../src/domain/pack';
import { factAt } from '../../src/domain/reducer';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;

const withCondition = () => {
  const p = JSON.parse(demo);
  p.predicates.push({ id: 'condition', description: 'Physical condition of a place.', value_type: 'string', allowed_values: ['完好', '受损', '毁坏'] });
  return JSON.stringify(p);
};
// Live, the detailed value came from the player's own assertion ("火雨把公园砸出坑").
async function setup() {
  const x = makeEngine();
  await x.engine.bind(withCondition(), { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('t');
  const quote = 'A blast left a crater in the Harbor';
  x.model.on('extract_user', (i) => String(i.message).includes(quote), { statements: [{ kind: 'asserted_fact', quote, summary: 'harbor damaged', entities: ['harbor'], facts: [{ entity_id: 'harbor', predicate: 'condition', value: '受损（码头被炸出一个坑）' }], event_id: null, time: null, ambiguous: false }] });
  expect(await turn(x, `${quote}.`, 'You see the crater. [PC0]', {})).toBe(true);
  expect(factAt(x.engine.current!.replay.state, 'harbor', 'condition').value).toBe('受损（码头被炸出一个坑）');
  x.model.calls.length = 0;
  return x;
}
async function turn(x: X, user: string, draft: string, evalPatch: any) {
  x.host.addUser(user);
  x.model.draft(draft);
  x.model.on('evaluate', (i) => String(i.candidate).includes(draft.slice(-6)), evalPatch);
  return x.engine.runOperation('normal');
}
const claim = (value: string, quote: string) => ({ state_claims: [{ entity_id: 'harbor', predicate: 'condition', value, quote, at: null }] });

describe('state claims about places', () => {
  it('PC1 a claim agreeing with a more detailed actual value is not a contradiction ("受损" vs "受损（码头被炸出一个坑）")', async () => {
    const x = await setup();
    expect(await turn(x, 'I look around.', 'The Harbor is still damaged. [PC1]', claim('受损', 'The Harbor is still damaged'))).toBe(true);
    expect(x.model.tasks('draft').length).toBe(1);
  });

  it("PC2 a claim filed on a place the quote never names is ignored (live: a mansion's door filed as its district's condition)", async () => {
    const x = await setup();
    expect(await turn(x, 'I wait by the door.', 'The whole iron door is blasted open from outside. [PC2]', claim('完好', 'The whole iron door is blasted open from outside'))).toBe(true);
    expect(x.model.tasks('draft').length).toBe(1);
  });

  it('PC3 a real contradiction that names the place is still caught', async () => {
    const x = await setup();
    await turn(x, 'I look around.', 'The Harbor looks untouched. [PC3a]', claim('完好', 'The Harbor looks untouched'));
    expect(x.engine.lastTrace!.attempts[0].violations.join(' ')).toMatch(/presupposes Harbor\.condition="完好"/);
  });

  it('PC4 claimMatches: the same value with a detail added agrees; a different base value does not', () => {
    expect(claimMatches('受损（公园被火雨砸出坑）', '受损')).toBe(true);
    expect(claimMatches('受损，大门被炸开', '受损')).toBe(true);
    expect(claimMatches('毁坏（公园被火雨砸出坑）', '受损')).toBe(false);
    expect(claimMatches(true, false)).toBe(false);
  });
});
