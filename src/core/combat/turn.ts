// 战斗 before a reply: a fight under way is judged first and the game master writes the ruling; without one, a fight
// the reply starts stops where it begins (it is judged on the next turn).
import type { Id } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { EngineError } from '../domain/util';
import { fightNow } from './state';
import type { Ruling } from './judge';
import { FIGHT_START_RULE, rulingSection } from './reply';

export interface TurnCombat {
  ruling: Ruling | null;
  /** Why judging failed (the reply goes ahead without a ruling). */
  failed: string | null;
  /** The game master's combat section (null: none). */
  section: string | null;
}

/** active: the reply is one combat applies to (not a time leap, not a continuation). judge: the ruling of this turn,
 *  run only while a fight is under way (a cancel goes through). */
export async function combatBeforeReply(index: WorldIndex, active: boolean, judge: () => Promise<Ruling | null>, name: (id: Id) => string): Promise<TurnCombat> {
  if (index.pack.combat.none !== null || !active) return { ruling: null, failed: null, section: null };
  let ruling: Ruling | null = null, failed: string | null = null;
  if (fightNow(index.state).ongoing) {
    try { ruling = await judge(); } catch (e) {
      if (e instanceof EngineError && e.kind === 'cancelled') throw e;
      failed = (e as Error).message.slice(0, 160);
    }
  }
  return { ruling, failed, section: ruling ? rulingSection(ruling, name) : FIGHT_START_RULE };
}
