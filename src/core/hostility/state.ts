// 主动敌对 as this game has it: who holds a grudge against the player (from play and the panel) and the dangers of
// the setting that came to the player, replayed in record order; and the dangers that belong where the player is.
// Pure: pack + replayed state in, answers out.
import type { CombatNode, GrudgeChange, Id, LedgerRecord } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { factAt, type WorldState } from '../domain/reducer';

/** A change as replayed (record order). */
export type Replayed<T> = T & { recordId: string; seq: number; tick: number };

/** This game's hostility changes (WorldState.hostility). */
export interface HostilityState { grudges: Replayed<GrudgeChange>[]; dangers: Replayed<{ node: Id; place: Id | null }>[] }

export const emptyHostilityState = (): HostilityState => ({ grudges: [], dangers: [] });

export function applyHostility(hs: HostilityState, rec: LedgerRecord, tick: number): void {
  const at = { recordId: rec.recordId, seq: rec.sequence, tick };
  for (const g of rec.grudges || []) hs.grudges.push({ ...g, ...at });
  if (rec.danger) hs.dangers.push({ ...rec.danger, ...at });
}

/** A grudge in force: the latest change of its holder, not ended. since: when it began (the first change of this
 *  run of it); comes: the earliest story time they come. */
export interface Grudge { holder: Id; why: string; quote: string; comes: number; since: number; source: GrudgeChange['source']; recordId: string }

/** The grudges in force against the player at `tick` (latest change per holder; ended ones and the dead are out). */
export function grudgesNow(state: WorldState, tick: number = state.clock.lo): Grudge[] {
  const last = new Map<Id, { g: Replayed<GrudgeChange>; since: number }>();
  for (const g of state.hostility.grudges) {
    if (g.tick > tick) continue;
    const prev = last.get(g.holder);
    last.set(g.holder, { g, since: prev && !prev.g.ended ? prev.since : g.tick });
  }
  const out: Grudge[] = [];
  for (const { g, since } of last.values()) {
    if (g.ended) continue;
    const alive = factAt(state, g.holder, 'alive', { tick });
    if (alive.known && alive.value === false) continue;
    out.push({ holder: g.holder, why: g.why, quote: g.quote, comes: g.comes, since, source: g.source, recordId: g.recordId });
  }
  return out.sort((a, b) => a.comes - b.comes);
}

/** Minutes of the day ("HH:MM"). */
const hm = (x: string) => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };

/** Whether a danger's hours hold at `tick` (no hours: any time; from > to: across midnight). */
export function inHours(n: Pick<CombatNode, 'hours'>, tick: number): boolean {
  if (!n.hours) return true;
  const m = ((tick % 1440) + 1440) % 1440, a = hm(n.hours.from), b = hm(n.hours.to);
  return a < b ? m >= a && m < b : m >= a || m < b;
}

const occurred = (state: WorldState, e?: Id | null) => !!e && state.dispositions.get(e)?.disposition === 'occurred';

/** The dangers of the pack linked from these places or organizations now (in its versions), whose hours hold at
 *  `tick` (anyHour: at whatever hour), with where each comes from. */
export function dangersAt(L: LoadedPack, state: WorldState, from: Id[], tick: number, anyHour = false): { node: CombatNode; from: Id }[] {
  const out: { node: CombatNode; from: Id }[] = [];
  const seen = new Set<Id>();
  for (const e of from) for (const l of L.combat.linksFrom.get(e) || []) {
    const n = L.combat.nodes.get(l.to);
    if (!n || n.kind !== 'danger' || seen.has(n.id)) continue;
    if (l.from_event && !occurred(state, l.from_event)) continue;
    if (l.until_event && occurred(state, l.until_event)) continue;
    if (!anyHour && !inHours(n, tick)) continue;
    seen.add(n.id);
    out.push({ node: n, from: e });
  }
  return out;
}
