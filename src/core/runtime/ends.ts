// How long a fact the models record holds. A history pack says it for every effect (checked by a person); the facts
// the analysis records during play — what a reply shows, how an offscreen event turned out, what the player asserts —
// say it too, so a state of a moment (knocked out, in hospital, at the fair) ends by itself instead of staying for
// the rest of the game. The analysis gives each one with the fact; code reads it, and a missing or unreadable one is
// asked again of the same model in its own conversation (it knows the scene and what it recorded), only those, as
// often as it takes within a few rounds. Only a model that keeps failing to answer fails the turn.
import type { FactDelta, Id, Until } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { EngineError } from '../domain/util';
import { callFollowUp, TASK_TAG, type ChatMsg, type ModelPort, type StructuredOpts } from './model';
import { UNTIL_RULE } from './prompts';

/** The ends the follow-up gives: {"ends": [{"n": 1, "until": ...}]}. */
interface EndsOut { ends: { n: number; until: unknown; why?: string }[] }

const UNIT: Record<string, number> = { m: 1, min: 1, mins: 1, minute: 1, minutes: 1, 分钟: 1, 分: 1, h: 60, hr: 60, hrs: 60, hour: 60, hours: 60, 小时: 60, 个小时: 60, d: 1440, day: 1440, days: 1440, 天: 1440, 日: 1440 };

/** A model's "until" as the engine keeps it, or null when it is missing or cannot be read: "lasting", minutes (also
 *  hours or days, as a number, "30m", "2小时", {"hours": 2}), or a canon event of the pack that is not over yet. */
export function readUntil(raw: unknown, pack: LoadedPack, isOpen: (eventId: Id) => boolean): Until | null {
  const mins = (n: number): Until | null => (Number.isFinite(n) && n > 0 ? { minutes: Math.max(1, Math.round(n)) } : null);
  const ev = (id: string): Until | null => (pack.events.has(id) && isOpen(id) ? { event: id } : null);
  if (raw == null) return null;
  if (typeof raw === 'number') return mins(raw);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^(lasting|permanent|forever|持续|永久|一直)$/i.test(s)) return 'lasting';
    const m = s.match(/^(\d+(?:\.\d+)?)\s*([a-z]+|分钟|分|个小时|小时|天|日)?$/i);
    if (m) { const f = m[2] ? UNIT[m[2].toLowerCase()] : 1; return f ? mins(Number(m[1]) * f) : null; }
    return ev(s);
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.event != null) return ev(String(o.event));
    for (const [k, f] of [['minutes', 1], ['hours', 60], ['days', 1440]] as const) if (o[k] != null) return mins(Number(o[k]) * f);
    if (o.until !== undefined) return readUntil(o.until, pack, isOpen);
  }
  return null;
}

/** A fact change that says how long it holds: a change of who belongs (add/remove) lasts by its nature; a value set
 *  needs its "until"; unset needs none. */
export const needsUntil = (op: string) => op === 'set';

/** One fact whose end the model is asked for: n, and how it reads in the question. */
export interface EndAsk { n: number; text: string }

/**
 * Asks the model, in the conversation where it recorded the facts, how long each of `items` holds; returns n -> end.
 * Answers it gives are kept round by round and only what is still missing is asked again (ROUNDS rounds, each with the
 * usual retries of an unreadable reply). What it cannot answer after all of them fails the turn: the analysis model
 * that recorded the facts is not working, and play does not go on with states that would never end.
 */
export async function askEnds(port: ModelPort, conversation: ChatMsg[], items: EndAsk[], read: (raw: unknown) => Until | null, opts: StructuredOpts & { what: string }): Promise<Map<number, Until>> {
  const got = new Map<number, Until>();
  let left = items;
  let lastErr = '';
  for (let round = 1; round <= ROUNDS && left.length; round++) {
    const question = `${TASK_TAG('ends')}
${round > 1 ? 'Some of the items below still have no readable "until". ' : ''}These facts you recorded do not say how long they hold. For each item give "until" as in the rules: ${UNTIL_RULE}
Judge from the scene. Items:
${left.map((x) => `${x.n}. ${x.text}`).join('\n')}
Reply with ONLY a JSON object {"ends":[{"n":1,"until":"lasting","why":"a few words"}]} with one entry for each of these items.`;
    try {
      const out = await callFollowUp<EndsOut>(port, 'ends', conversation, question, { ...opts, maxAttempts: 2, maxTokens: Math.min(4096, 200 + 60 * left.length) });
      for (const e of out.ends) {
        if (!left.some((x) => x.n === e.n)) continue;
        const u = read(e.until);
        if (u) got.set(e.n, u);
        else lastErr = `item ${e.n}: unreadable "until" ${JSON.stringify(e.until)}`;
      }
    } catch (e) {
      // a provider that cannot be reached (after its own waits and retries) or a cancelled turn: nothing to ask again
      if (e instanceof EngineError && e.kind !== 'invalid_model_json') throw e;
      lastErr = (e as Error).message;
    }
    left = left.filter((x) => !got.has(x.n));
  }
  if (left.length) {
    throw new EngineError('invalid_model_json', `${opts.what}: the analysis model did not say how long ${left.length} recorded fact${left.length === 1 ? '' : 's'} hold${left.length === 1 ? 's' : ''} after ${ROUNDS} questions (${left.slice(0, 3).map((x) => x.text).join('; ')})${lastErr ? ` — last: ${lastErr}` : ''}. Retry the turn; if it keeps failing, the analysis connection is not answering properly.`);
  }
  return got;
}
const ROUNDS = 3;

/** The end of a delta as the engine applies it (a lasting one carries none). */
export function withUntil<T extends FactDelta>(d: T, u: Until | null | undefined): T {
  if (d.op !== 'set' || !u || u === 'lasting') return d;
  return { ...d, until: u };
}
