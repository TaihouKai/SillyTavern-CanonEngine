// 战斗 for the game master: the ruling to write (binding), the rule that a fight the reply starts stops where it
// begins, and the people's states (状态).
import type { Id } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { uniq } from '../domain/util';
import { statusesOf } from './state';
import type { Ruling } from './judge';

/** The ruling for the game master: binding, in order, to be written as vividly as wanted, and nothing beyond. */
export function rulingSection(r: Ruling, names: (id: Id) => string): string {
  const lines = r.exchanges.map((x, i) => `${i + 1}. ${names(x.actor)}: ${x.text}`);
  const states = [...r.statuses.map((s) => `${names(s.entity)}: ${s.removed ? 'no longer ' : ''}${s.text}${s.count != null ? ` (${s.count} left)` : ''}`),
    ...(r.handovers || []).map((h) => (h.to ? `${names(h.to)} now holds ${names(h.object)}` : `nobody holds ${names(h.object)} now`))];
  return [
    'COMBAT RULING (binding — Canon Engine judged this turn of the fight before the reply. Write exactly these results, in this order, as vividly as you like: how it looks, sounds and feels is yours. Change no result; add no blow, hit, dodge or move that is not here; nobody wins, loses, is hurt or escapes otherwise. The player character does nothing beyond the player\'s message.)',
    ...lines,
    ...(states.length ? [`After this turn: ${states.join('; ')}.`] : []),
    ...r.outcomes.filter((o) => !o.stands).map((o) => `Does NOT happen as the player wrote «${o.quote}»: ${o.why}`),
    ...(r.stands.length ? [`The player's words stand as written: ${r.stands.map((q) => `«${q}»`).join(' ')}`] : []),
    r.over ? `The fight ends here${r.overWhy ? `: ${r.overWhy}` : ''}.` : `End the reply at this point${r.stopAt ? `: ${r.stopAt}` : ''} — the player character's next move is the player's.`,
  ].join('\n');
}

/** For the game master when no fight is under way (a pack with combat): a fight the reply starts stops where it begins. */
export const FIGHT_START_RULE = 'FIGHTS (Canon Engine judges every fight before it is written): if someone in your reply attacks someone or a fight breaks out, write up to the moment it begins — the attack comes, the first move is made — and end the reply there. Do not decide how it goes (who hits, who is hurt, who wins or escapes): Canon Engine judges it on the next turn, after the player has answered.';

/** People's states (状态) for the game master and the reviewer: those of the people here that hold now. */
export function statesSection(index: WorldIndex, ids: Id[], name: (id: Id) => string, tick = index.state.clock.lo): string {
  const lines = uniq(ids).map((id) => ({ id, s: statusesOf(index.state, id, tick) })).filter((x) => x.s.length)
    .map((x) => `- ${name(x.id)} [${x.id}]: ${x.s.map((s) => `${s.text}${s.count != null ? ` ×${s.count}` : ''}${s.endsAt ? ` (until ${Math.max(0, s.endsAt - tick)} min from now)` : ''}`).join('; ')}`);
  return lines.length ? `STATES (状态 of the people here as they stand now — injuries, conditions, what they carry; they hold until the story changes them: show them where they matter, and keep counts as given):\n${lines.join('\n')}` : '';
}
