// 战斗 in the review of a reply: the reviewer gets this turn's ruling and the code holds the reply to it; outside a
// ruling, a fight the reply itself decides is sent back (it stops where it begins); the states the reply shows are
// recorded every turn.
import type { Id, StatusChange, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import type { WorldIndex } from '../domain/world-query';
import { quoteInText, uniq } from '../domain/util';
import type { RecordDraft } from '../runtime/types';
import type { Ruling } from './judge';
import { cleanUntil, combatRecord } from './record';

/** What the reviewer (evaluate) reports about combat. */
export interface CombatEvalOut {
  /** States the reply shows changing. */
  statuses?: { who: string; text: string; count?: number | null; until?: unknown; removed?: boolean; quote: string }[];
  /** A fight the reply itself starts (and whether it then decides it). */
  fight?: { starts: boolean; participants?: string[]; resolved_unruled: boolean; quote?: string } | null;
  /** With a ruling: where the reply departs from it. */
  ruling_conflicts?: { quote: string; why: string }[];
}

/** How a reply is reviewed for combat (null: not at all — a pack without combat, a time leap, a reply checked again
 *  later). ruled: this turn's fight was judged (fighters: who is in it); failed: judging failed, so a fight the reply
 *  decides is not sent back. */
export interface CombatReview { ruled: boolean; fighters: Id[]; failed?: boolean }

export function combatReview(pack: LoadedPack, a: { leap: boolean; draft: boolean; ruling: Ruling | null; failed: boolean }): CombatReview | null {
  if (pack.combat.none !== null || a.leap || !a.draft) return null;
  return { ruled: !!a.ruling, fighters: a.ruling?.fighters || [], failed: a.failed };
}

/** The ruling as the reviewer gets it (evaluate input fight_ruling). */
export function rulingForReview(index: WorldIndex, r: Ruling): unknown {
  return {
    exchanges: r.exchanges.map((x) => `${index.entityName(x.actor)}: ${x.text}`),
    states: r.statuses.map((s) => `${index.entityName(s.entity)}: ${s.removed ? 'no longer ' : ''}${s.text}${s.count != null ? ` (${s.count} left)` : ''}`),
    stands: r.stands,
    player_words_that_do_not_happen: r.outcomes.filter((o) => !o.stands).map((o) => `«${o.quote}»: ${o.why}`),
    stop_at: r.over ? `the fight ends: ${r.overWhy}` : r.stopAt,
  };
}

/** States a review found in a reply, as the code accepts them (the fighters of a ruling have theirs from the ruling). */
function reviewStatuses(list: CombatEvalOut['statuses'], text: string, userText: string, resolve: (x: string) => Id | null, skip: Id[]): { statuses: StatusChange[]; warnings: string[] } {
  const statuses: StatusChange[] = [], warnings: string[] = [];
  for (const s of list || []) {
    if (!quoteInText(s.quote, text) && !quoteInText(s.quote, userText)) { warnings.push(`state "${s.text}" dropped: its words are not in the reply`); continue; }
    const who = resolve(s.who);
    const t = String(s.text || '').trim().slice(0, 120);
    if (!who || !t) { warnings.push(`state "${s.text}" dropped: unknown person "${s.who}"`); continue; }
    if (skip.includes(who)) continue;
    const count = typeof s.count === 'number' && Number.isFinite(s.count) ? Math.max(0, Math.round(s.count)) : null;
    const until = cleanUntil(s.until);
    statuses.push({ entity: who, text: t, ...(count !== null ? { count } : {}), ...(until ? { until } : {}), ...(s.removed ? { removed: true } : {}), source: 'play', quote: s.quote.slice(0, 300) });
  }
  return { statuses, warnings };
}

/** The gate's step for combat: the states this reply changes, the reply held to the ruling, and a fight it starts.
 *  story: whether words are about someone a canon event brings into this reply who is not in the fight (the story
 *  brings them, not the fight: live, 半藏 had to come to 滨面 in this reply and the review called his arrival, and the
 *  player character's answer to him, a departure from the ruling, so no draft could pass). */
export function gateCombat(c: CombatReview, ev: CombatEvalOut, text: string, userText: string, resolve: (x: string) => Id | null, sceneEnd: StoryTime, story: (words: string) => boolean = () => false): { records: RecordDraft[]; violations: string[]; warnings: string[] } {
  const records: RecordDraft[] = [], violations: string[] = [], warnings: string[] = [];
  const st = reviewStatuses(ev.statuses, text, userText, resolve, c.ruled ? c.fighters : []);
  if (st.statuses.length) records.push(combatRecord({ ...sceneEnd }, [], `States: ${st.statuses.map((s) => `${s.entity} ${s.removed ? '−' : ''}${s.text}`).join('; ')}`, { statuses: st.statuses }));
  if (c.ruled) {
    for (const x of ev.ruling_conflicts || []) if (quoteInText(x.quote, text) && story(`${x.quote} ${x.why}`)) warnings.push(`review's ruling departure about a canon event the story brings in ignored ("${x.quote.slice(0, 80)}"): ${String(x.why).slice(0, 160)}`);
    else if (quoteInText(x.quote, text)) violations.push(`The reply departs from the combat ruling ("${x.quote}"): ${x.why} Write the ruling's results as they are (embellish freely, change no result).`);
  } else if (ev.fight?.starts) {
    const ps = uniq((ev.fight.participants || []).map((x) => resolve(String(x))).filter((x): x is Id => !!x));
    if (ev.fight.resolved_unruled && !c.failed) violations.push(`The reply decides a fight Canon Engine has not judged${ev.fight.quote ? ` ("${ev.fight.quote}")` : ''}. Stop where it begins — the attack comes, the fight breaks out — and leave how it goes to the next turn: Canon Engine judges it then.`);
    else if (ps.length >= 2) records.push(combatRecord({ ...sceneEnd }, [], `A fight breaks out: ${ps.join(', ')}`, { fight: { ongoing: true, participants: ps, source: 'engine', why: String(ev.fight.quote || '').slice(0, 300) } }));
  }
  return { records, violations, warnings: [...st.warnings, ...warnings] };
}
