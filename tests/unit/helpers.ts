import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePack, type LoadedPack } from '../../src/core/domain/pack';
import type { CanonPack } from '../../src/core/domain/types';

export const ROOT = join(__dirname, '..', '..');
export function demoRaw(): CanonPack {
  return JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
}
export function unrelatedRaw(): CanonPack {
  return JSON.parse(readFileSync(join(ROOT, 'examples', 'unrelated-history.canon.json'), 'utf8'));
}
export function load(raw: CanonPack): LoadedPack {
  const r = validatePack(raw);
  if (!r.ok || !r.loaded) throw new Error('pack invalid: ' + JSON.stringify(r.errors));
  return r.loaded;
}
export const T = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;
/** People a test adds to a pack with combat: 对抗倾向 "照常人" and the demo's ordinary-person node, for each person
 *  without them (the pack lint wants both). */
export function ordinary(p: CanonPack): CanonPack {
  const plain = '照常人';
  for (const e of p.entities) {
    if (e.kind !== 'person' || !p.combat || p.combat.none !== undefined) continue;
    const a = (e.aspects ||= {});
    a.combat_style ||= [{ from_event: null, start: plain, force: plain, response: plain, limit: plain, stop: plain }];
    const node = p.combat.nodes?.find((n) => n.kind === 'concept')?.id;
    if (node && !a.setting?.length && !a.abilities?.length) a.setting = [{ node, label: 'is, in a fight' }];
  }
  return p;
}
