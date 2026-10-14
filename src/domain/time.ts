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

export function formatStoryTime(st: StoryTime | null | undefined, origin?: { y: number; m: number; d: number } | null): string {
  if (!st) return '?';
  if (st.lo === st.hi) return formatTick(st.lo, origin);
  return `${formatTick(st.lo, origin)} – ${formatTick(st.hi, origin)}`;
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
export function parseDateLabel(s: string, origin: { y: number; m: number; d: number } | null): number | null {
  if (!origin) return null;
  const m = String(s).trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const day = Math.round((Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(origin.y, origin.m - 1, origin.d)) / 86400000);
  const hh = m[4] ? Number(m[4]) : 0, mm = m[5] ? Number(m[5]) : 0;
  if (hh > 23 || mm > 59) return null;
  return day * DAY + hh * 60 + mm;
}
