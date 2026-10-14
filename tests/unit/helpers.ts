import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validatePack, type LoadedPack } from '../../src/domain/pack';
import type { CanonPack } from '../../src/domain/types';

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
