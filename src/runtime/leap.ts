// Time leap: the player's message carries {{time_leap:<time>}} and moves story time to that time in one reply.
// The directive is part of the message, so edits, swipes, deletes and regenerations follow it like any other turn.
// The leap planner decides only what the player's description changes; every other canon event of the span is
// settled by the ordinary offscreen adjudication (original route when its preconditions hold).
import type { Id, Occurrence, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { adjudicateDefault, causeOf, effectsToDeltas, occurrenceWindow } from '../domain/schedule';
import { DAY, formatTick, parseDateLabel, parseTickLabel } from '../domain/time';
import { newId, uniq } from '../domain/util';
import { WorldIndex } from '../domain/world-query';
import type { RecordDraft } from './types';
import { VOICE_KINDS, VOICE_TEXT, type PlayerVoice } from './voice';

/** {{time_leap:2004-10-10 08:00}} / {{time_leap:D1500 08:00}} (also with a full-width colon). */
export const LEAP_RE = /\{\{\s*time_leap\s*[:：]\s*([^}]*?)\s*\}\}/i;

/** A leap to a date without a clock time lands at this time of day. */
export const LEAP_DEFAULT_MINUTE = 8 * 60;

export interface LeapDirective { raw: string; label: string; target: number | null }

/** The directive in a message (the first one), with its target time; null when the message has none. */
export function parseLeap(text: string, origin: { y: number; m: number; d: number } | null): LeapDirective | null {
  const m = String(text || '').match(LEAP_RE);
  if (!m) return null;
  return { raw: m[0], label: m[1], target: parseLeapTime(m[1], origin) };
}

/** The time formats of the start-time field: "D1500 08:00" or "2004-10-10 08:00" (also 2004年10月10日 08:00); a date
 *  alone lands at 08:00. */
export function parseLeapTime(s: string, origin: { y: number; m: number; d: number } | null): number | null {
  const t = String(s || '').trim().replace(/[：]/g, ':').replace(/\s+/g, ' ');
  const tick = parseTickLabel(t);
  if (tick !== null) return tick;
  const day = t.match(/^(?:d(?:ay)?\s*)?(-?\d+)$/i);
  if (day && /^d/i.test(t)) return Number(day[1]) * DAY + LEAP_DEFAULT_MINUTE;
  const cal = t.match(/^(\d{1,6})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})\s*[日号]?(?:\s*(\d{1,2}):(\d{2}))?$/);
  if (!cal) return null;
  const at = cal[4] !== undefined ? `${cal[4]}:${cal[5]}` : `${Math.floor(LEAP_DEFAULT_MINUTE / 60)}:00`;
  return parseDateLabel(`${cal[1]}-${cal[2]}-${cal[3]} ${at}`, origin);
}

/** The message without the directive (what the player wrote about the leap). */
export const leapText = (text: string) => String(text || '').replace(LEAP_RE, '').trim();

/** Why a leap cannot be used, or null. Checked before any model call. */
export function leapProblem(d: LeapDirective, now: number, origin: { y: number; m: number; d: number } | null): string | null {
  if (d.target === null) return `Time leap "${d.label}" is not a time Canon can read. Use the start-time format: "D1500 08:00"${origin ? ' or "2004-10-10 08:00"' : ''}. Edit your message.`;
  if (d.target <= now) return `Time leap to ${formatTick(d.target, origin)} goes ${d.target === now ? 'nowhere: that is the current story time' : `back in time (the story is at ${formatTick(now, origin)})`}. A leap only goes forward; edit your message.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Planning

export interface LeapPlanOut {
  events: { event_id: string; decision: 'occurred' | 'diverged' | 'omitted'; player_part: string; account: string }[];
  mention: string[];
  impossible: { event_id: string; why: string }[];
  landing: string;
  life: string[];
}

export interface LeapEvent { id: Id; lo: number; hi: number; cls: string }

/** The canon events the leap crosses: unsettled, window opening by the target (those still open at the target stay
 *  pending: the landing scene may be inside them). */
export function leapEvents(pack: LoadedPack, state: WorldState, from: number, to: number): LeapEvent[] {
  const out: LeapEvent[] = [];
  for (const t of pack.timeIndex) {
    if (t.lo > to) break;
    if (state.dispositions.has(t.id) || t.hi < from) continue;
    out.push({ id: t.id, lo: t.lo, hi: t.hi, cls: pack.events.get(t.id)!.classification });
  }
  return out;
}

/** Most events the planner gets with their summaries; the rest are one line each, up to LEAP_LINES_CHARS. */
export const LEAP_DETAILED_MAX = 150;
export const LEAP_LINES_CHARS = 40000;

/** The planner's input (a long leap crosses hundreds of events — 1700 in a large pack): HARD events and the events of
 *  the people, places and groups the player's message names or the player is linked to come with their summaries
 *  (the ones the message can touch); every other event is one line "id | when | title", in time order, as far as the
 *  budget goes (an event left out happens as in the original story, like any untouched one). */
export function leapEventInput(index: WorldIndex, list: LeapEvent[], origin: { y: number; m: number; d: number } | null, focus: Set<Id> = new Set()) {
  const pack = index.pack;
  const when = (x: LeapEvent) => x.lo === x.hi ? formatTick(x.lo, origin) : `${formatTick(x.lo, origin)} – ${formatTick(x.hi, origin)}`;
  const touches = (x: LeapEvent) => { const ev = pack.events.get(x.id)!; return [...ev.entity_ids, ...ev.location_ids].some((id) => focus.has(id)); };
  const ranked = [...list].sort((a, b) => Number(b.cls === 'HARD') - Number(a.cls === 'HARD') || Number(touches(b)) - Number(touches(a)) || a.lo - b.lo);
  const detailed = new Set((list.length <= LEAP_DETAILED_MAX ? list : ranked.filter((x) => x.cls === 'HARD' || touches(x)).slice(0, LEAP_DETAILED_MAX)).map((x) => x.id));
  const room = detailed.size > 80 ? 160 : 300;
  const crossed = list.filter((x) => detailed.has(x.id)).map((x) => {
    const ev = pack.events.get(x.id)!;
    const s = causeOf(ev) || ev.summary;
    const people = ev.entity_ids.filter((id) => index.entityKind(id) === 'person').slice(0, 6).map((id) => index.entityName(id));
    return {
      id: ev.id, title: ev.title, class: ev.classification, when: when(x),
      ...(people.length ? { people } : {}),
      original: s.length > room ? s.slice(0, room - 1) + '…' : s,
      ...(ev.classification === 'HARD' ? { required: ev.required_description } : {}),
    };
  });
  const other: string[] = [];
  let size = 0, left = 0;
  for (const x of list) {
    if (detailed.has(x.id)) continue;
    const line = `${x.id} | ${formatTick(x.lo, origin).replace(/ \(D-?\d+\)$/, '')} | ${pack.events.get(x.id)!.title}`;
    if (size + line.length > LEAP_LINES_CHARS) { left++; continue; }
    other.push(line);
    size += line.length + 1;
  }
  return { crossed_events: crossed, ...(other.length ? { other_events: other } : {}), ...(left ? { not_listed: `${left} more events of the leap are not listed; they happen as in the original story` } : {}) };
}

export interface LeapDecision { decision: 'occurred' | 'diverged' | 'omitted'; part: string; account: string }

export interface CheckedLeapPlan {
  decisions: Map<Id, LeapDecision>;
  mention: Id[];
  /** HARD events the player's description rules out (the player's message is sent back). */
  impossible: { id: Id; title: string; why: string }[];
  landing: string;
  life: string[];
  dropped: string[];
}

/** Keeps what fits: known crossed events only; a HARD event is never changed (it happens with its required result;
 *  "the player's description makes it impossible" sends the message back). */
export function checkLeapPlan(out: LeapPlanOut, pack: LoadedPack, list: LeapEvent[]): CheckedLeapPlan {
  const crossed = new Map(list.map((x) => [x.id, x]));
  const decisions = new Map<Id, LeapDecision>();
  const dropped: string[] = [];
  const impossible: CheckedLeapPlan['impossible'] = [];
  for (const i of out.impossible || []) {
    const ev = pack.events.get(i.event_id);
    if (!ev || !crossed.has(ev.id)) { dropped.push(`impossible: unknown or not crossed ${i.event_id}`); continue; }
    if (ev.classification !== 'HARD') { dropped.push(`impossible: ${ev.title} is ${ev.classification}, not HARD (it may simply not happen)`); continue; }
    impossible.push({ id: ev.id, title: ev.title, why: String(i.why || '').slice(0, 400) });
  }
  for (const e of out.events || []) {
    const ev = pack.events.get(e.event_id);
    if (!ev || !crossed.has(ev.id)) { dropped.push(`event: unknown or not crossed ${e.event_id}`); continue; }
    if (decisions.has(ev.id)) continue;
    if (ev.classification === 'HARD' && e.decision !== 'occurred') {
      if (!impossible.some((x) => x.id === ev.id)) impossible.push({ id: ev.id, title: ev.title, why: String(e.account || e.player_part || '').slice(0, 400) });
      continue;
    }
    if (!String(e.account || '').trim()) { dropped.push(`event: ${ev.title} without an account`); continue; }
    decisions.set(ev.id, { decision: e.decision, part: String(e.player_part || '').slice(0, 600), account: String(e.account).slice(0, 1500) });
  }
  const mention = uniq((out.mention || []).filter((id) => crossed.has(id) && !decisions.has(id))).slice(0, 15);
  return { decisions, mention, impossible, landing: String(out.landing || '').slice(0, 600), life: (out.life || []).map((x) => String(x).slice(0, 300)).slice(0, 20), dropped };
}

/** The record for an event the leap plan decided: the original route's effects when it occurred (and the HARD
 *  event's required outcome), the plan's account with the player's part, the player among its actors. */
export function leapRecord(pack: LoadedPack, state: WorldState, ev: LeapEvent, d: LeapDecision, playerId: Id | null): RecordDraft {
  const event = pack.events.get(ev.id)!;
  const when: StoryTime = occurrenceWindow({ event, lo: ev.lo, hi: ev.hi }, -Infinity, ev.hi);
  const base = adjudicateDefault(pack, state, { event, lo: ev.lo, hi: ev.hi }, when);
  const occurred = d.decision !== 'omitted';
  const deltas = d.decision === 'occurred' ? effectsToDeltas(event.canonical_effects) : [];
  if (event.classification === 'HARD') {
    for (const o of event.outcomes) if (!deltas.some((x) => x.op === 'set' && x.entity_id === o.entity_id && x.predicate === o.predicate)) deltas.push({ op: 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value });
  }
  const occId = newId('occ');
  const occ: Occurrence | undefined = occurred ? {
    occurrenceId: occId, title: event.title, account: d.part ? (/^zh/i.test(pack.pack.language) ? `${d.account}（玩家角色：${d.part}）` : `${d.account} (The player character: ${d.part})`) : d.account,
    actors: uniq([...event.entity_ids, ...(d.part && playerId ? [playerId] : [])]), affected: event.entity_ids, locations: event.location_ids, time: when, outcome: deltas,
    causes: [], refPhrases: [event.title], packEventId: event.id, origin: 'offscreen', visibility: event.visibility,
  } : undefined;
  return {
    recordId: newId('rec'), kind: occurred ? 'canon_occurrence' : 'canon_disposition', storyTime: when, sourceRefs: [], factsSetOrUnset: deltas,
    eventOccurrenceIds: occ ? [occId] : [], occurrences: occ ? [occ] : undefined, visibility: event.visibility,
    summary: `${event.title}: ${d.decision} (time leap)`, evidenceKind: 'adjudication', packEventId: event.id, disposition: d.decision,
    dispositionReason: `time leap (the player's description${base.precondition !== 'TRUE' ? `; original preconditions ${base.precondition}` : ''}): ${(d.part || d.account).slice(0, 300)}`,
  };
}

// ---------------------------------------------------------------------------------------------
// What the GM and the reviewer are told

/** All kinds of the player's voice: during a leap the GM writes the player character's life. */
export const LEAP_VOICE: PlayerVoice = Object.fromEntries(VOICE_KINDS.map((k) => [k, true])) as PlayerVoice;

export function leapSection(a: {
  index: WorldIndex; from: number; to: number; origin: { y: number; m: number; d: number } | null; plan: CheckedLeapPlan; list: LeapEvent[];
  settled: number; voice: PlayerVoice;
}): string {
  const { index, origin, plan } = a;
  const pack = index.pack;
  const at = (id: Id) => a.list.find((x) => x.id === id);
  const line = (id: Id) => { const x = at(id)!; const ev = pack.events.get(id)!; return `${formatTick(x.lo, origin).replace(/ \(D-?\d+\)$/, '')} ${ev.title}`; };
  const days = Math.round((a.to - a.from) / DAY);
  const span = days >= 730 ? `about ${Math.round(days / 365)} years` : days >= 60 ? `about ${Math.round(days / 30)} months` : days >= 2 ? `${days} days` : `${Math.round((a.to - a.from) / 60)} hours`;
  const own = [...plan.decisions].sort((x, y) => at(x[0])!.lo - at(y[0])!.lo)
    .map(([id, d]) => `- ${line(id)} — ${d.decision === 'occurred' ? 'happens' : d.decision === 'diverged' ? 'happens differently' : 'does not happen'}: ${d.account}${d.part ? ` (the player character: ${d.part})` : ''}`);
  const mention = plan.mention.slice().sort((x, y) => at(x)!.lo - at(y)!.lo).map((id) => `- ${line(id)}: ${causeOf(pack.events.get(id)!)}`);
  const limits = VOICE_KINDS.filter((k) => !a.voice[k]);
  return [
    `TIME LEAP (this reply): the player's message leaps story time from ${formatTick(a.from, origin)} to ${formatTick(a.to, origin)} (${span}). Write this reply as a time skip: first the time in between, told in summary in time order — the player character's life as the player's message describes it, and the world's main events — at the pace such a span needs (a few lines per stretch of time, not scene by scene); then land in one concrete scene at ${formatTick(a.to, origin)} and end there, leaving the next move to the player.`,
    `- During the leap the player character lives and acts on their own, as their Persona would: you write their life, words, decisions and actions freely (also what they keep secret or reveal), within everything the player's message says — never against it, and what it asks for happens. Small invented people and episodes of their life (classmates, a friend, a job) are fine.`,
    ...(plan.life.length ? ['- The player character\'s life during the leap (planned from the player\'s message):', ...plan.life.map((x) => `  - ${x}`)] : []),
    own.length ? `- Canon events this leap changes or the player character takes part in (decided; show them as stated):\n${own.join('\n')}` : '- The player\'s description changes no canon event.',
    `- All other canon events of the span (${a.settled}) happened as in the original story, offscreen; never contradict them.${mention.length ? ' Worth mentioning as the world\'s background (only what the player character would know of):\n' + mention.join('\n') : ''}`,
    ...(plan.landing ? [`- Landing at ${formatTick(a.to, origin)}: ${plan.landing}`] : []),
    `- The landing scene follows the player's usual limits again${limits.length ? `: leave these to the player there — ${limits.map((k) => VOICE_TEXT[k]).join('; ')}` : ''}.`,
  ].join('\n');
}

/** Notes for the reviewer (staged offscreen history): the decided events and a count of the rest. */
export function leapNotes(index: WorldIndex, plan: CheckedLeapPlan, list: LeapEvent[], records: RecordDraft[], origin: { y: number; m: number; d: number } | null): string[] {
  const pack = index.pack;
  const decided = [...plan.decisions].map(([id, d]) => `${formatTick(list.find((x) => x.id === id)!.lo, origin)} ${pack.events.get(id)!.title}: ${d.decision} (time leap) — ${(d.part || d.account).slice(0, 200)}`);
  const other = records.filter((r) => r.packEventId && !plan.decisions.has(r.packEventId));
  const shown = other.filter((r) => plan.mention.includes(r.packEventId!) || pack.events.get(r.packEventId!)?.classification === 'HARD' || r.disposition !== 'occurred')
    .map((r) => `${formatTick(r.storyTime.lo, origin)} ${pack.events.get(r.packEventId!)!.title}: ${r.disposition}${r.disposition !== 'occurred' ? ` — ${(r.dispositionReason || '').slice(0, 160)}` : ''}`);
  const rest = other.length - shown.length;
  return [...decided, ...shown.slice(0, 40), ...(rest > 0 ? [`${rest} other canon events of the leap occurred offscreen along their original routes`] : [])];
}
