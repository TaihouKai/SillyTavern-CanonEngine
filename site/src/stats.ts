// The example pack's numbers as the engine loads it: the home page's counters and the build log. The live demo
// computes them in the browser; scripts/build-site.mjs computes them at build time (site/data/stats.json) so the
// page shows them at once, before the 7 MB pack is fetched.
import { aspectWritten, type PackValidationResult } from '../../src/core';

// the counters read 常态 and 思考方式
const WRITTEN = aspectWritten(['nature', 'mind'] as const);

export interface PackStats { events: number; entities: number; people: number; orgs: number; arcs: number; hard: number; natures: number; minds: number; title: string; errors: number; warnings: number }

export function statsOf(r: PackValidationResult): PackStats {
  const L = r.loaded!;
  const ents = [...L.entities.values()];
  const src = { pack: L, state: { runtimeEntities: new Map(), dispositions: new Map() } };
  return {
    title: L.pack.title, events: L.events.size, entities: L.entities.size, people: ents.filter((e) => e.kind === 'person').length,
    orgs: ents.filter((e) => e.kind === 'organization').length, arcs: L.pack.arcs.length, hard: L.hardEvents.length,
    natures: ents.filter((e) => WRITTEN(src, e.id).nature?.length).length, minds: ents.filter((e) => WRITTEN(src, e.id).mind).length,
    errors: r.errors.length, warnings: r.warnings.length,
  };
}
