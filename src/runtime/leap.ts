// Time leap: the player's message carries {{time_leap:<time>}} and moves story time to that time in one reply.
// The directive is part of the message, so edits, swipes, deletes and regenerations follow it like any other turn.
// The leap planner decides only what the player's description changes; every other canon event of the span is
// settled by the ordinary offscreen adjudication (original route when its preconditions hold).
import type { Id, Occurrence, StoryTime } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { withOutcomes } from '../domain/delta';
import type { WorldState } from '../domain/reducer';
import { adjudicateDefault, causeOf, effectsToDeltas, occurrenceWindow } from '../domain/schedule';
import { DAY, formatTick, parseDateLabel, parseTickLabel } from '../domain/time';
import { newId, uniq } from '../domain/util';
import { WorldIndex } from '../domain/world-query';
import type { RecordDraft } from './types';
import { VOICE_KINDS, VOICE_TEXT, type PlayerVoice } from './voice';
import { orgsOf } from './integration';

/** {{time_leap:2004-10-10 08:00}} / {{time_leap:D1500 08:00}} (also with a full-width colon); one chapter of a longer
 *  leap: {{time_leap:2020-10-01 08:00 → 2024-10-10 08:00}} (this reply goes to the first time, the leap to the second). */
export const LEAP_RE = /\{\{\s*time_leap\s*[:：]\s*([^}]*?)\s*\}\}/i;

/** A leap to a date without a clock time lands at this time of day. */
export const LEAP_DEFAULT_MINUTE = 8 * 60;

export interface LeapDirective { raw: string; label: string; target: number | null; final: number | null }

/** The directive in a message (the first one), with its target time and, for a chapter, the whole leap's; null when
 *  the message has none. */
export function parseLeap(text: string, origin: { y: number; m: number; d: number } | null): LeapDirective | null {
  const m = String(text || '').match(LEAP_RE);
  if (!m) return null;
  const [a, b] = m[1].split(/\s*(?:→|->|＞)\s*/);
  const target = parseLeapTime(a, origin);
  const final = b !== undefined ? parseLeapTime(b, origin) : null;
  return { raw: m[0], label: m[1], target, final: final !== null && target !== null && final > target ? final : null };
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
  if (d.target === null || (/→|->|＞/.test(d.label) && d.final === null && parseLeapTime(d.label.split(/\s*(?:→|->|＞)\s*/)[1] || '', origin) === null)) return `Time leap "${d.label}" is not a time Canon can read. Use the start-time format: "D1500 08:00"${origin ? ' or "2004-10-10 08:00"' : ''}. Edit your message.`;
  if (d.target <= now) return `Time leap to ${formatTick(d.target, origin)} goes ${d.target === now ? 'nowhere: that is the current story time' : `back in time (the story is at ${formatTick(now, origin)})`}. A leap only goes forward; edit your message.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// Chapters: a leap across a lot of story is sent as a few chapters, one reply each (the player sends each with 下一章).
// Measured by how much happens, never by calendar time (a summer holds hundreds of events in one pack, a century a
// dozen in another): the pack's own arcs are the units, a chapter ends where arcs end, and it is never short — at
// least LEAP_CHAPTER_MIN_ARCS whole arcs and half the chapter's share of events. A leap with few events (free time
// past the pack's end, a quiet span) is one reply whatever its length. A pack without arcs is cut after HARD events.

/** About this many crossed events per chapter; fewer than 1.5 times this is one reply. */
export const LEAP_CHAPTER_EVENTS = 120;
export const LEAP_CHAPTERS_MAX = 6;
export const LEAP_CHAPTER_MIN_ARCS = 2;

export interface LeapChapter { to: number; after: string | null }

export function leapChapters(pack: LoadedPack, state: WorldState, from: number, to: number): LeapChapter[] {
  const list = leapEvents(pack, state, from, to);
  const arcOf = (id: Id) => pack.events.get(id)!.arc_id;
  const arcIds = uniq(list.map((x) => arcOf(x.id)).filter(Boolean) as Id[]);
  const byArcs = arcIds.length >= LEAP_CHAPTER_MIN_ARCS * 2;
  let n = Math.min(LEAP_CHAPTERS_MAX, Math.round(list.length / LEAP_CHAPTER_EVENTS));
  if (byArcs) n = Math.min(n, Math.floor(arcIds.length / LEAP_CHAPTER_MIN_ARCS));
  if (n <= 1) return [{ to, after: null }];
  // where a chapter may end: where an arc ends (the last of its crossed events), else after a HARD event
  const span = new Map<Id, { lo: number; hi: number }>();
  for (const x of list) { const a = arcOf(x.id); if (!a) continue; const v = span.get(a); span.set(a, v ? { lo: Math.min(v.lo, x.lo), hi: Math.max(v.hi, x.hi) } : { lo: x.lo, hi: x.hi }); }
  const cuts = byArcs
    ? [...span].map(([id, v]) => ({ t: v.hi, after: pack.pack.arcs.find((a) => a.id === id)?.title || null }))
    : list.filter((x) => x.cls === 'HARD').map((x) => ({ t: x.hi, after: pack.events.get(x.id)!.title }));
  const before = (t: number) => list.filter((x) => x.lo <= t).length;
  const arcsEnded = (a: number, b: number) => [...span.values()].filter((v) => v.hi > a && v.hi <= b).length;
  // arcs still running at a cut: fewer is a cleaner place to end
  const straddle = (t: number) => [...span.values()].filter((v) => v.lo <= t && v.hi > t).length;
  const share = list.length / n;
  const out: LeapChapter[] = [];
  let prevT = from, prevN = 0;
  for (let k = 1; k < n; k++) {
    const quota = k * share;
    const ok = cuts.filter((c) => c.t > prevT && c.t < to && before(c.t) - prevN >= share / 2 && list.length - before(c.t) >= share / 2
      && (!byArcs || (arcsEnded(prevT, c.t) >= LEAP_CHAPTER_MIN_ARCS && arcsEnded(c.t, to) >= LEAP_CHAPTER_MIN_ARCS)));
    const best = ok.sort((x, y) => (Math.abs(before(x.t) - quota) + straddle(x.t) * share * 0.05) - (Math.abs(before(y.t) - quota) + straddle(y.t) * share * 0.05))[0];
    if (!best) continue;
    // land the next morning (what starts before then is settled in this chapter)
    const land = (Math.floor(best.t / DAY) + 1) * DAY + LEAP_DEFAULT_MINUTE;
    if (land >= to) continue;
    out.push({ to: land, after: best.after });
    prevT = best.t; prevN = before(best.t);
  }
  out.push({ to, after: null });
  return out;
}

/** The directive for the next reply of a leap to `final` from `from`: its first chapter (with the whole leap's end when
 *  there are more), as the player would type it. */
export function leapDirective(pack: LoadedPack, state: WorldState, from: number, final: number, origin: { y: number; m: number; d: number } | null): string {
  const label = (t: number) => formatTick(t, origin).replace(/ \(D-?\d+\)$/, '');
  const ch = leapChapters(pack, state, from, final);
  return ch.length > 1 ? `{{time_leap:${label(ch[0].to)} → ${label(final)}}}` : `{{time_leap:${label(final)}}}`;
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
export function leapEventInput(index: WorldIndex, list: LeapEvent[], origin: { y: number; m: number; d: number } | null, focus: Set<Id> = new Set(), playerId: Id | null = null) {
  const pack = index.pack;
  const when = (x: LeapEvent) => x.lo === x.hi ? formatTick(x.lo, origin) : `${formatTick(x.lo, origin)} – ${formatTick(x.hi, origin)}`;
  // the player's own organizations that take part (members facts at the event's time): the player is in it as a member
  const myOrgs = (x: LeapEvent) => { if (!playerId) return []; const ev = pack.events.get(x.id)!; const there = new Set([...ev.entity_ids, ...(ev.cast || []).map((m) => m.entity_id)]); return orgsOf(index, playerId, x.lo).filter((o) => there.has(o)); };
  const touches = (x: LeapEvent) => { const ev = pack.events.get(x.id)!; return [...ev.entity_ids, ...ev.location_ids].some((id) => focus.has(id)) || myOrgs(x).length > 0; };
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
      ...(myOrgs(x).length ? { player_org: myOrgs(x).map((o) => index.entityName(o)).join(', ') } : {}),
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

/** The crossed events in planner batches (time order), each small enough to be read in full. */
export function leapBatches(list: LeapEvent[]): LeapEvent[][] {
  if (list.length <= LEAP_DETAILED_MAX) return [list];
  const n = Math.ceil(list.length / LEAP_DETAILED_MAX), size = Math.ceil(list.length / n);
  return Array.from({ length: n }, (_, i) => list.slice(i * size, (i + 1) * size));
}

/** The batches' plans as one: their events and impossibilities; the mentions shared out; the life and the landing
 *  from the batches that give them (the last one, as the planner is told). */
export function mergeLeapPlans(outs: LeapPlanOut[]): LeapPlanOut {
  if (outs.length === 1) return outs[0];
  const each = Math.ceil(12 / outs.length);
  return {
    events: outs.flatMap((o) => o.events || []),
    impossible: outs.flatMap((o) => o.impossible || []),
    mention: outs.flatMap((o) => (o.mention || []).slice(0, each)),
    life: uniq(outs.flatMap((o) => o.life || [])),
    landing: [...outs].reverse().find((o) => String(o.landing || '').trim())?.landing || '',
  };
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
  if (event.classification === 'HARD') withOutcomes(deltas, event.outcomes);
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
  /** One chapter of a leap to this time: the next chapter is a later reply. */
  final?: number | null;
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
  const chapter = a.final && a.final > a.to;
  return [
    `TIME LEAP (this reply): the player's message leaps story time from ${formatTick(a.from, origin)} to ${formatTick(a.to, origin)} (${span})${chapter ? `; this reply is one chapter of their leap to ${formatTick(a.final!, origin)}, and the next chapter is a later reply (what their message says about the time after ${formatTick(a.to, origin)} belongs to it)` : ''}. Write this reply as a time skip with the length of a full reply: tell the time in between in time order — the player character's life as the player's message describes it, and the world's main events — with its main episodes as short scenes (a few exchanges of dialogue where they matter), not a bare list of happenings; ${chapter ? `then end at ${formatTick(a.to, origin)} with a short moment that leads on into the next chapter (it does not wait for a decision of the player).` : `then land in one concrete scene at ${formatTick(a.to, origin)} and end there, leaving the next move to the player.`}`,
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
