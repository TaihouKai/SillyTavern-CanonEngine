// Story time: signed relative day + minute of day, normalized to an integer tick.
// Never uses Date.now(), the host timezone or the real calendar for story arithmetic.
import type { PackTime, PackWhen, StoryTime } from './types';

export const DAY = 1440;

export function toTick(t: PackTime): number {
  return t.day * DAY + t.minute;
}

export function fromTick(tick: number): PackTime {
  const day = Math.floor(tick / DAY);
  return { day, minute: tick - day * DAY };
}

export function pointTime(tick: number): StoryTime {
  return { lo: tick, hi: tick, precision: 'minute' };
}

export function whenToStoryTime(w: PackWhen): StoryTime | null {
  if (!w.earliest || !w.latest) return null;
  const lo = toTick(w.earliest);
  const hi = toTick(w.latest);
  return { lo, hi, precision: w.precision === 'minute' ? 'minute' : w.precision === 'day' ? 'day' : 'range' };
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "Day 3 16:00" style label. When an origin calendar date is bound, the date is shown too. */
export function formatTick(tick: number, origin?: { y: number; m: number; d: number } | null): string {
  const t = fromTick(tick);
  const hhmm = `${pad2(Math.floor(t.minute / 60))}:${pad2(t.minute % 60)}`;
  if (origin) {
    // Pure proleptic Gregorian arithmetic in UTC: independent of the host timezone.
    const base = Date.UTC(origin.y, origin.m - 1, origin.d);
    const d = new Date(base + t.day * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${hhmm} (D${t.day})`;
  }
  return `D${t.day} ${hhmm}`;
}

/** How long before `now` a time was, for a model reading history ("3 days ago", "about a year ago"): a day number
 *  alone does not show that something is long over (live: D-313 next to D61 was read as current). */
export function agoLabel(then: number, now: number): string {
  const d = Math.floor(now / DAY) - Math.floor(then / DAY);
  if (d < 0) return 'later';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 14) return `${d} days ago`;
  if (d < 60) return `about ${Math.round(d / 7)} weeks ago`;
  if (d < 365) return `about ${Math.round(d / 30)} months ago`;
  const y = Math.round(d / 365);
  return y === 1 ? 'about a year ago' : `about ${y} years ago`;
}

/** When an event happens, for a model or a reader: the time the pack gives, or — when it gives only when the event
 *  falls (a day, a part of it) — that span, never its start as if that were the time. */
export function eventTimeText(t: { lo: number; hi: number; exact: boolean }, origin?: { y: number; m: number; d: number } | null): string {
  if (!t.exact) return `some time between ${formatTick(t.lo, origin)} and ${formatTick(t.hi, origin)} (its exact time is not known)`;
  return t.lo === t.hi ? formatTick(t.lo, origin) : `${formatTick(t.lo, origin)} – ${formatTick(t.hi, origin)}`;
}

/** "starts <time>" for an event with a known time, else when it falls. */
export function startsText(t: { lo: number; hi: number; exact: boolean }, origin?: { y: number; m: number; d: number } | null): string {
  return t.exact ? `starts ${formatTick(t.lo, origin)}` : eventTimeText(t, origin);
}

export function formatStoryTime(st: StoryTime | null | undefined, origin?: { y: number; m: number; d: number } | null): string {
  if (!st) return '?';
  if (st.lo === st.hi) return formatTick(st.lo, origin);
  return `${formatTick(st.lo, origin)} – ${formatTick(st.hi, origin)}`;
}

/** When an occurrence happened, for display: an undated backstory is "some time before" its latest possible time. */
export function occurrenceTime(o: { time: StoryTime; undated?: true }, origin?: { y: number; m: number; d: number } | null, lang: 'en' | 'zh' = 'en'): string {
  if (!o.undated) return formatStoryTime(o.time, origin);
  return lang === 'zh' ? `${formatTick(o.time.hi, origin)} 之前某时（时间不详）` : `some time before ${formatTick(o.time.hi, origin)} (when is not given)`;
}

/** Parse "D3 16:00", "3 16:00", "day 3 16:00", "-1 08:30" into a tick. */
export function parseTickLabel(s: string): number | null {
  const m = String(s).trim().match(/^(?:d(?:ay)?\s*)?(-?\d+)(?:\s+|\s*[,/]\s*)(\d{1,2}):(\d{2})$/i);
  if (!m) return null;
  const day = Number(m[1]);
  const hh = Number(m[2]);
  const mm = Number(m[3]);
  if (hh > 23 || mm > 59) return null;
  return day * DAY + hh * 60 + mm;
}

/** Interval (a, b] intersects [lo, hi]? Used for crossed-interval collection. */
export function intervalCrosses(fromExclusive: number, toInclusive: number, lo: number, hi: number): boolean {
  return hi > fromExclusive && lo <= toInclusive;
}

export function compareStoryTime(a: StoryTime, b: StoryTime): number {
  return a.lo - b.lo || a.hi - b.hi;
}

/** Parse "YYYY-MM-DD HH:MM" (or "YYYY-MM-DD") relative to a display origin date for day 0. */
/** Find a calendar date for day 0 in a pack's free-text calendar label ("2020-07-19" or "2020年7月19日"). */
export function parseOriginLabel(label: string | undefined | null): { y: number; m: number; d: number } | null {
  const m = String(label || '').match(/(\d{3,6})\s*(?:-|\/|年)\s*(\d{1,2})\s*(?:-|\/|月)\s*(\d{1,2})/);
  if (!m) return null;
  const o = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  return o.m >= 1 && o.m <= 12 && o.d >= 1 && o.d <= 31 ? o : null;
}

export function parseDateLabel(s: string, origin: { y: number; m: number; d: number } | null): number | null {
  if (!origin) return null;
  const m = String(s).trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const day = Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(origin.y, origin.m - 1, origin.d)) / 86400000);
  const hh = m[4] ? Number(m[4]) : 0, mm = m[5] ? Number(m[5]) : 0;
  if (hh > 23 || mm > 59) return null;
  return day * DAY + hh * 60 + mm;
}
