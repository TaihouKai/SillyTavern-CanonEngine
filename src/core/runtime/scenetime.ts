// How far a reply moves story time. The reviewer reads the text: it lists each time expression of the reply and the
// player's message as evidence (time_evidence) — a time the story reaches ("now"), a stated amount of time that passes
// ("elapsed"), or a time that is only spoken of ("mentioned": a plan, an appointment, another day) — and estimates the
// end (scene_end). Whether a time is reached or only spoken of is a reading of the text, so it is the reviewer's; code
// checks each item against the text (the quote is there, its clock or duration is the one the item gives) and works
// out from the checked items how late the reply can end. An estimate past that is taken back: an overestimate is
// permanent (the clock never goes back), an underestimate is corrected by Horae's time next turn.
import type { PackTime, StoryTime } from '../domain/types';
import { formatTick, toTick } from '../domain/time';
import { normalizeText } from '../domain/util';

/** Most a reply may advance the clock beyond what its checked evidence states (live finding: 12:10 -> 14:43 over 11
 *  short continuous replies, +20–40 min each). */
export const UNTIMED_ADVANCE_MAX = 20;
/** Minutes a reply may run on after a time it reaches before its estimated end is taken back (live: a reply ending a
 *  meal, with "都快十一点了" in it, was given 23:20). */
export const CLOCK_READING_SLACK = 10;
/** How far a stated clock may lie from the time an item gives it ("八点二十出头" is 8:20 to 8:35, not 8:50). */
const CLOCK_TOLERANCE = 15;

export interface TimeEvidence {
  quote: string;
  kind: 'now' | 'elapsed' | 'mentioned';
  /** now: the time the story reaches there (a part of the day as its span) */
  at?: { lo: PackTime; hi: PackTime } | null;
  /** elapsed: the minutes that pass */
  minutes?: number | null;
}

/** A checked item, at its place in the told order (the player's message first, then the reply). */
export interface CheckedTime { pos: number; quote: string; kind: 'now' | 'elapsed'; lo: number; hi: number; minutes: number }

const HALF_DAY = 720;

/** Clock times written in a text, as minutes on a 12-hour dial ("八点二十" 500, "11:30 pm" 690, "三点半" 210). Only used
 *  to check the clock an item gives against its own quote; it decides nothing about whether the time is reached. */
export function dialClocks(text: string): number[] {
  const t = String(text).normalize('NFKC');
  const out: number[] = [];
  const num = (s: string): number | null => {
    if (/^\d{1,2}$/.test(s)) return Number(s);
    const d: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const m = s.match(/^([零〇一二两三四五六七八九])?(十)?([零〇一二两三四五六七八九])?$/);
    if (!m || !s) return null;
    if (!m[2]) return m[1] && !m[3] ? d[m[1]] : null;
    return (m[1] ? d[m[1]] : 1) * 10 + (m[3] ? d[m[3]] : 0);
  };
  const push = (h: number | null, m: number | null) => { if (h !== null && m !== null && h <= 24 && m <= 59) out.push(((h % 12) * 60 + m) % HALF_DAY); };
  for (const m of t.matchAll(/(\d{1,2})\s*[:：]\s*(\d{2})/g)) push(Number(m[1]), Number(m[2]));
  const N = '[零〇一二两三四五六七八九十0-9]{1,3}';
  for (const m of t.matchAll(new RegExp(`(${N})点(?:(半)|(一刻)|(三刻)|零?(${N})分?)?`, 'g'))) push(num(m[1]), m[2] ? 30 : m[3] ? 15 : m[4] ? 45 : m[5] ? num(m[5]) : 0);
  for (const m of t.matchAll(/\b(\d{1,2})\s*(?:o'?clock|a\.?m\.?|p\.?m\.?)/gi)) push(Number(m[1]), 0);
  return out;
}

/** Minutes the durations written in a text add up to ("走了十分钟" 10, "一个半小时" 90, "half an hour" 30); null when the
 *  text has no unit of time. Only used to check an item's minutes against its own quote. */
export function writtenMinutes(text: string): number | null {
  const t = String(text).normalize('NFKC');
  if (!/分钟|分|小时|钟头|天|夜|周|星期|月|minute|hour|day|night|week|month/i.test(t)) return null;
  const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5, 几: 3 };
  const n = (s: string): number => {
    if (/^\d+$/.test(s)) return Number(s);
    if (s.includes('十')) { const [a, b] = s.split('十'); return (a ? cn[a] ?? 1 : 1) * 10 + (b ? cn[b] ?? 0 : 0); }
    return cn[s] ?? 0;
  };
  const unit: Record<string, number> = { 分钟: 1, 小时: 60, 钟头: 60, 天: 1440, 周: 10080, 星期: 10080, 月: 43200, minute: 1, hour: 60, day: 1440, week: 10080, month: 43200 };
  const en: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twenty: 20, thirty: 30, several: 3, 'a few': 3 };
  let sum = 0;
  for (const m of t.matchAll(/(\d+|[一二两三四五六七八九十半几]+)\s*(?:个)?(半)?(分钟|小时|钟头|天|周|星期|月)(半)?|半(小时)/g)) {
    if (m[3]) sum += (n(m[1]) + (m[2] || m[4] ? 0.5 : 0)) * unit[m[3]];
    else if (m[5]) sum += 30;
  }
  for (const m of t.matchAll(/\b(\d+|an?|one|two|three|four|five|six|ten|twenty|thirty|several|a few) (minute|hour|day|week|month)s?\b|\b(half an hour)\b/gi)) {
    if (m[3]) sum += 30;
    else sum += (/^\d+$/.test(m[1]) ? Number(m[1]) : en[m[1].toLowerCase()] ?? 1) * unit[m[2].toLowerCase()];
  }
  return Math.round(sum);
}

const tickOf = (t: unknown): number | null => {
  const x = t as PackTime | null | undefined;
  return x && Number.isFinite(x.day) && Number.isFinite(x.minute) ? toTick(x) : null;
};

/** The reviewer's items checked against the text. An item whose quote is not in the player's message or the reply,
 *  whose clock is not the one its quote writes, or whose minutes are not a written amount of time, is left out (and
 *  said so): it then lifts nothing. */
export function checkTimeEvidence(list: unknown, replyText: string, playerText: string, clockTick: number): { items: CheckedTime[]; mentioned: string[]; warnings: string[] } {
  const items: CheckedTime[] = [];
  const mentioned: string[] = [];
  const warnings: string[] = [];
  const player = normalizeText(playerText).toLowerCase();
  const reply = normalizeText(replyText).toLowerCase();
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as TimeEvidence;
    const quote = normalizeText(String(e.quote || '')).slice(0, 200);
    const q = quote.toLowerCase();
    if (e.kind === 'mentioned') { if (quote) mentioned.push(quote); continue; }
    if (e.kind !== 'now' && e.kind !== 'elapsed') continue;
    const inPlayer = q.length >= 2 ? player.indexOf(q) : -1;
    const inReply = q.length >= 2 ? reply.indexOf(q) : -1;
    if (inPlayer < 0 && inReply < 0) { warnings.push(`time evidence 「${quote}」 (${e.kind}) left out: not in the reply or the player's message`); continue; }
    const pos = inPlayer >= 0 ? inPlayer : player.length + 1 + inReply;
    if (e.kind === 'now') {
      let lo = tickOf(e.at?.lo), hi = tickOf(e.at?.hi);
      if (lo === null && hi === null) { warnings.push(`time evidence 「${quote}」 (now) left out: no time given`); continue; }
      lo ??= hi!; hi ??= lo;
      if (hi < lo) [lo, hi] = [hi, lo];
      const clocks = dialClocks(quote);
      const fits = (c: number) => {
        if (hi! - lo! >= HALF_DAY) return true;
        const off = (((c - lo!) % HALF_DAY) + HALF_DAY) % HALF_DAY;
        return off <= hi! - lo! + CLOCK_TOLERANCE || off >= HALF_DAY - CLOCK_TOLERANCE;
      };
      if (clocks.length && !clocks.some(fits)) { warnings.push(`time evidence 「${quote}」 (now) left out: ${formatTick(lo)}–${formatTick(hi)} is not the clock it writes`); continue; }
      if (hi < clockTick - 60) { warnings.push(`time evidence 「${quote}」 (now) left out: ${formatTick(hi)} is before the current time ${formatTick(clockTick)}`); continue; }
      items.push({ pos, quote, kind: 'now', lo: Math.max(lo, clockTick), hi: Math.max(hi, clockTick), minutes: 0 });
    } else {
      const minutes = Math.round(Number(e.minutes));
      if (!Number.isFinite(minutes) || minutes <= 0) continue;
      const written = writtenMinutes(quote);
      if (written === null) { warnings.push(`time evidence 「${quote}」 (elapsed ${minutes}) left out: the quote writes no amount of time`); continue; }
      if (written > 0 && minutes > written * 1.5 + 5) { warnings.push(`time evidence 「${quote}」 (elapsed ${minutes}) left out: the quote writes ${written} minutes`); continue; }
      items.push({ pos, quote, kind: 'elapsed', lo: 0, hi: 0, minutes });
    }
  }
  items.sort((a, b) => a.pos - b.pos);
  return { items, mentioned, warnings };
}

/** The end of a reply from the reviewer's estimate and the checked evidence. The evidence, in told order from where the
 *  reply starts (Horae's time when later than the clock), gives the latest time the text accounts for: a time reached
 *  sets it, a stated amount adds to it. The estimate may run UNTIMED_ADVANCE_MAX past that (CLOCK_READING_SLACK after a
 *  time reached) and not further; it is never earlier than where the reply starts, unless a time the reply reaches is
 *  earlier than Horae's (the reply's own text wins). `bound` is that latest end when the text reaches a time (kept with
 *  the reply: Horae later than it is not followed). A flashback is left as it is; a time leap starts at its target. */
export function settleSceneEnd(a: { estimate: StoryTime | null; items: CheckedTime[]; clockTick: number; floor: number | null; flashback: boolean; leap: boolean }): { end: StoryTime | null; bound: number | null; note: string | null } {
  const est = a.estimate;
  if (a.flashback) return { end: est, bound: null, note: null };
  const floor = a.floor !== null && a.floor > a.clockTick ? a.floor : null;
  if (a.leap) {
    if (floor === null || (est && est.lo >= floor)) return { end: est, bound: null, note: null };
    return { end: { lo: floor, hi: Math.max(est?.hi ?? floor, floor), precision: 'approx' }, bound: null, note: `scene end from the time leap: ${formatTick(floor)}` };
  }
  const start = floor ?? a.clockTick;
  let lo = start, hi = start;
  const reached = a.items.some((x) => x.kind === 'now');
  for (const x of a.items) {
    if (x.kind === 'now') { lo = x.lo; hi = x.hi; } else { lo += x.minutes; hi += x.minutes; }
  }
  const upper = hi + (reached ? CLOCK_READING_SLACK : UNTIMED_ADVANCE_MAX);
  const lower = floor === null ? null : reached ? Math.max(a.clockTick, Math.min(floor, upper)) : floor;
  const e = est ?? { lo: a.clockTick, hi: a.clockTick, precision: 'approx' as const };
  let endLo = lower !== null ? Math.max(e.lo, lower) : e.lo;
  if (endLo > upper) endLo = upper;
  const bound = reached ? upper : null;
  if (endLo === e.lo && est) return { end: est, bound, note: null };
  const endHi = Math.max(endLo, Math.min(Math.max(e.hi, endLo), upper + UNTIMED_ADVANCE_MAX));
  const why = endLo < e.lo ? `estimate ${formatTick(e.lo)} is past what the text accounts for (${formatTick(upper)})` : `the reply starts at ${formatTick(endLo)} (Horae)`;
  return { end: { lo: endLo, hi: endHi, precision: 'approx' }, bound, note: `scene end ${formatTick(endLo)}: ${why}` };
}

/** For a debug line: the checked items in told order. */
export const evidenceLine = (items: CheckedTime[]) => items.map((x) => x.kind === 'now' ? `「${x.quote}」 now ${formatTick(x.lo)}` : `「${x.quote}」 +${x.minutes}`).join('; ');
