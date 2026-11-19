// 主动敌对 before the reply: whether someone with a grudge comes for the player now (decided by code: their time has
// come), or the setting's own danger where the player is reaches them (decided by code, replayably: how common it is
// and the danger level), and what the game master is told. The GM writes up to where the attack begins and stops:
// the fight is then judged like any other (战斗分析).
import type { CombatNode, DangerFrequency, Id } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { sha256 } from '../domain/util';
import { fightNow } from '../combat';
import { dangersAt, grudgesNow, type Grudge } from './state';

export type DangerLevel = 'low' | 'medium' | 'high';
export const DANGER_LEVELS: DangerLevel[] = ['low', 'medium', 'high'];

/** The chance that someone at a danger's place in its hours meets it in one three-hour stretch, by how common it is;
 *  times the danger level. */
export const DANGER_CHANCE: Record<DangerFrequency, number> = { common: 0.35, occasional: 0.12, rare: 0.03 };
export const LEVEL_FACTOR: Record<DangerLevel, number> = { low: 0.5, medium: 1, high: 2 };
/** One stretch of the day a danger is rolled for (minutes): within it the answer stays the same, whatever is redone. */
export const DANGER_STRETCH = 180;

export type HostileDue =
  | { kind: 'grudge'; grudge: Grudge }
  | { kind: 'danger'; node: CombatNode; from: Id };

/** A roll in [0, 1) from fixed inputs: the same game, danger and stretch of story time always give the same answer
 *  (a swipe, a redo or a reload does not draw again). */
export function roll(seed: string, node: Id, tick: number): number {
  return parseInt(sha256(`${seed}|${node}|${Math.floor(tick / DANGER_STRETCH)}`).slice(0, 8), 16) / 0x100000000;
}

/** What comes for the player in this reply, at most one: a grudge whose time has come (the earliest), else a danger
 *  of where they are that the roll lets through — never while a fight is under way, and a danger at most once a
 *  story day. Grudges come whatever the danger switch says. */
export function hostileDue(a: {
  index: WorldIndex; tick: number; playerId: Id;
  /** where the player is (places of the scene) and the organizations they belong to: the dangers linked from them */
  places: Id[]; orgs: Id[];
  dangers: { on: boolean; level: DangerLevel }; seed: string;
}): HostileDue | null {
  const st = a.index.state;
  if (a.index.pack.combat.none !== null) return null;
  if (fightNow(st).ongoing) return null;
  const grudge = grudgesNow(st, a.tick).find((g) => g.comes <= a.tick);
  if (grudge) return { kind: 'grudge', grudge };
  if (!a.dangers.on) return null;
  const day = Math.floor(a.tick / 1440);
  if (st.hostility.dangers.some((d) => Math.floor(d.tick / 1440) === day)) return null;
  for (const d of dangersAt(a.index.pack, st, [...a.places, ...a.orgs], a.tick)) {
    const p = Math.min(0.9, DANGER_CHANCE[d.node.frequency || 'rare'] * LEVEL_FACTOR[a.dangers.level]);
    if (roll(a.seed, d.node.id, a.tick) < p) return { kind: 'danger', node: d.node, from: d.from };
  }
  return null;
}

const STOP = 'Bring it after what the player does in this reply, or interrupting it. Write up to the moment the attack begins and stop there — the blow coming, the surrounding, the first shot — with the player character still to act: how it goes is judged on the next turn (Canon Engine judges fights). Never decide what the player character does about it.';

/** What the game master is told. */
export function hostileSection(index: WorldIndex, due: HostileDue, player: { name: string; looks: string }): string {
  if (due.kind === 'grudge') {
    const g = due.grudge;
    return `HOSTILE — REQUIRED (someone with a grudge against the player character comes for them in THIS reply): ${index.entityName(g.holder)} — ${g.why}${g.quote ? ` («${g.quote}»)` : ''}. They come where the player character is, as they can: waiting on the way, at a door, catching up with them in the street; with the others they said they would bring. Keep them in character and as strong as they are. ${STOP}`;
  }
  const n = due.node;
  return `DANGER HERE — REQUIRED (the setting's own danger at ${index.entityName(due.from)} at this hour reaches the player character in THIS reply): ${n.name}: ${n.text} Who comes is the kind of people it says — new people of that sort (describe them), not anyone already known — and they pick the player character for what they see: ${player.name}, ${player.looks}. ${STOP}`;
}
