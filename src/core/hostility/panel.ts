// 主动敌对 as the panel shows it: the switch and the danger level (the settings), who holds a grudge against the
// player (why, since when, when they come), the dangers where the player is now, the dangers that came; and the
// player's corrections (take a grudge away, add one), each a record like any other.
import type { Id, StoryTime } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { formatTick } from '../domain/time';
import type { RecordDraft } from '../runtime/types';
import { hostilityRecord } from './record';
import { dangersAt, grudgesNow } from './state';
import { defaultComes } from './review';

export interface HostilityViewData {
  grudges: { holder: Id; name: string; why: string; quote: string; since: string; comes: string; due: boolean; source: 'play' | 'ui' }[];
  /** the dangers linked from where the player is (and their organizations), at any hour, with whether they hold now */
  here: { node: Id; name: string; gist: string; frequency: string; hours: string; now: boolean; from: string }[];
  /** the dangers that came, newest first */
  came: { name: string; when: string; place: string }[];
}

export function hostilityView(idx: WorldIndex, origin: { y: number; m: number; d: number } | null, where: Id[]): HostilityViewData {
  const st = idx.state;
  const tick = st.clock.lo;
  const anyHour = dangersAt(idx.pack, st, where, -1, true);
  const nowIds = new Set(dangersAt(idx.pack, st, where, tick).map((d) => d.node.id));
  return {
    grudges: grudgesNow(st, tick).map((g) => ({ holder: g.holder, name: idx.entityName(g.holder), why: g.why, quote: g.quote, since: formatTick(g.since, origin), comes: formatTick(g.comes, origin), due: g.comes <= tick, source: g.source })),
    here: anyHour.map((d) => ({ node: d.node.id, name: d.node.name, gist: d.node.gist, frequency: d.node.frequency || 'rare', hours: d.node.hours ? `${d.node.hours.from}–${d.node.hours.to}` : '', now: nowIds.has(d.node.id), from: idx.entityName(d.from) })),
    came: st.hostility.dangers.slice().reverse().slice(0, 10).map((d) => ({ name: idx.pack.combat.nodes.get(d.node)?.name || d.node, when: formatTick(d.tick, origin), place: d.place ? idx.entityName(d.place) : '' })),
  };
}

/** A correction from the panel: take a grudge away, or add one (someone by name, why). */
export type HostilityChange = { end: Id } | { add: { name: string; why: string } };

export function hostilityPanelRecord(idx: WorldIndex, change: HostilityChange, tick: number, player: Id | null): RecordDraft | null {
  const st: StoryTime = { lo: tick, hi: tick, precision: 'minute' };
  if ('end' in change) {
    const g = grudgesNow(idx.state, tick).find((x) => x.holder === change.end);
    if (!g) return null;
    return hostilityRecord(st, [], `${idx.entityName(g.holder)}: grudge taken away (Canon Engine panel)`, { grudges: [{ holder: g.holder, why: g.why, quote: g.quote, comes: g.comes, ended: 'ui', source: 'ui' }] });
  }
  const name = change.add.name.trim();
  const ids = idx.resolveEntity(name).ids.filter((id) => id !== player && idx.entityKind(id) === 'person');
  if (ids.length !== 1 || !change.add.why.trim()) return null;
  return hostilityRecord(st, [], `${idx.entityName(ids[0])}: grudge against the player (Canon Engine panel)`, { grudges: [{ holder: ids[0], why: change.add.why.trim().slice(0, 200), quote: '', comes: defaultComes(tick), source: 'ui' }] });
}
