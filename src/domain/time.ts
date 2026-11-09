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

const CN_DIGIT: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
/** "十一", "二十三", "两", "11" → number (null when not a plain number up to 99). */
export function cnNumber(s: string): number | null {
  if (/^\d{1,2}$/.test(s)) return Number(s);
  const m = s.match(/^([零〇一二两三四五六七八九])?(十)?([零〇一二两三四五六七八九])?$/);
  if (!m || !s) return null;
  if (!m[2]) return m[1] && !m[3] ? CN_DIGIT[m[1]] : null;
  return (m[1] ? CN_DIGIT[m[1]] : 1) * 10 + (m[3] ? CN_DIGIT[m[3]] : 0);
}

/** Clock times a text reads as the time NOW — "都快十一点了", "已经三点半了", "现在十点二十了", "it's already 11:30" — as
 *  hour (0–24, as written) and minute; "nearly" (快/将近/差不多/almost) when it is not there yet. Appointments and
 *  plans ("明天八点开幕式", "五点半就得起来") are not readings: a Chinese reading ends in 了 or follows 现在. */
export function clockReadings(text: string): { hour: number; minute: number; nearly: boolean; quote: string }[] {
  const out: { hour: number; minute: number; nearly: boolean; quote: string }[] = [];
  const N = '[零〇一二两三四五六七八九十0-9]{1,3}';
  const zh = new RegExp(`(都|已经|已|现在|这都|眼看)?(快|快要|将近|差不多|就要)?(${N})点(?:(半)|(一刻)|(三刻)|零?(${N})分?)?(?:多|左右|钟)?(了)?`, 'g');
  for (const m of String(text).matchAll(zh)) {
    if (!m[8] && m[1] !== '现在') continue;
    if (!m[1] && !m[2]) continue;
    const hour = cnNumber(m[3]);
    const minute = m[4] ? 30 : m[5] ? 15 : m[6] ? 45 : m[7] ? cnNumber(m[7]) : 0;
    if (hour === null || hour > 24 || minute === null || minute > 59) continue;
    out.push({ hour, minute, nearly: !!m[2], quote: m[0] });
  }
  const en = /\b(?:it'?s|it is|already|now)\s+(nearly\s+|almost\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:o'?clock|a\.?m\.?|p\.?m\.?)?/gi;
  for (const m of String(text).matchAll(en)) {
    const hour = Number(m[2]), minute = m[3] ? Number(m[3]) : 0;
    if (!m[3] && !/o'?clock|[ap]\.?m/i.test(m[0])) continue;
    if (hour > 24 || minute > 59) continue;
    out.push({ hour: /p\.?m/i.test(m[0]) && hour < 12 ? hour + 12 : hour, minute, nearly: !!m[1], quote: m[0] });
  }
  return out;
}

/** The tick a clock reading means near `from`: the hour as written or 12 hours on, the first at most an hour before
 *  `from` and within the next 12 hours (null when none is). */
export function readingTick(r: { hour: number; minute: number }, from: number): number | null {
  const day = Math.floor(from / DAY) * DAY;
  const hours = r.hour >= 13 ? [r.hour] : [r.hour % 12, (r.hour % 12) + 12];
  const ticks = [-1, 0, 1].flatMap((d) => hours.map((h) => day + d * DAY + h * 60 + r.minute)).filter((x) => x >= from - 60 && x <= from + 720).sort((a, b) => a - b);
  return ticks.length ? ticks[0] : null;
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
