// Time frames: parts of the world that keep their own local time (a past era reached by time travel, another world,
// a realm where time flows differently). The story clock is always the main clock and only moves forward; a frame
// says how local time reads there. A pack without frames has only the main frame and nothing here changes for it.
import type { Id, PackFrame } from './types';
import { formatTick, pad2, toTick } from './time';

/** The id of the main frame (the frame of the story clock). */
export const MAIN_FRAME = 'main';

export interface FrameIndex {
  frames: Map<Id, PackFrame>;
  /** Event id -> its frame (events in the main frame are not listed). */
  eventFrame: Map<Id, Id>;
  /** Place id -> its frame. */
  placeFrame: Map<Id, Id>;
  mainName: string;
}

interface FramedPack {
  frames?: PackFrame[];
  calendar: { main_frame_name?: string };
  entities: { id: Id; frame_id?: Id }[];
  events: { id: Id; frame_id?: Id; location_ids: Id[] }[];
}

/** An event's frame: its own frame_id, else the frame of its first place that has one, else the main frame. */
export function indexFrames(pack: FramedPack): FrameIndex {
  const frames = new Map((pack.frames || []).map((f) => [f.id, f]));
  const placeFrame = new Map<Id, Id>();
  for (const e of pack.entities) if (e.frame_id && frames.has(e.frame_id)) placeFrame.set(e.id, e.frame_id);
  const eventFrame = new Map<Id, Id>();
  for (const ev of pack.events) {
    const f = ev.frame_id && (ev.frame_id === MAIN_FRAME || frames.has(ev.frame_id)) ? ev.frame_id : ev.location_ids.map((l) => placeFrame.get(l)).find(Boolean);
    if (f && f !== MAIN_FRAME) eventFrame.set(ev.id, f);
  }
  return { frames, eventFrame, placeFrame, mainName: pack.calendar.main_frame_name || '' };
}

const LOCAL_RE = /^(-?\d{1,6})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?$/;

/** A linked frame's `local` as epoch minutes (proleptic Gregorian, astronomical years: 0 = 1 BC), or null.
 *  Without a clock time the local time of day is the main clock's at `at`. */
export function parseLocal(local: string, atMinute: number): number | null {
  const m = String(local).match(LOCAL_RE);
  if (!m) return null;
  const mo = Number(m[2]), d = Number(m[3]), hh = m[4] ? Number(m[4]) : Math.floor(atMinute / 60), mm = m[5] ? Number(m[5]) : atMinute % 60;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const dt = new Date(0);
  dt.setUTCFullYear(Number(m[1]), mo - 1, d);
  dt.setUTCHours(hh, mm, 0, 0);
  if (dt.getUTCDate() !== d) return null;
  return Math.round(dt.getTime() / 60000);
}

function formatLocalMinutes(min: number): string {
  const dt = new Date(min * 60000);
  const y = dt.getUTCFullYear();
  const ys = y <= 0 ? `BC${1 - y}` : String(y).padStart(4, '0');
  return `${ys}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())} ${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}`;
}

/** Local time in a frame at a main-clock tick: a date and clock time for a linked frame, the label otherwise. */
export function localTime(f: PackFrame, tick: number): string {
  if (f.clock.kind !== 'linked') return f.clock.label;
  const at = toTick(f.clock.at);
  const base = parseLocal(f.clock.local, f.clock.at.minute);
  if (base === null) return f.clock.local;
  return formatLocalMinutes(base + Math.round((tick - at) * (f.clock.rate ?? 1)));
}

/** How local time relates to the main clock, in words for the models (and the details panel): one pair of the same
 *  moment on both clocks and the speed. */
export function conversionText(f: PackFrame, tick: number, origin?: { y: number; m: number; d: number } | null): string {
  if (f.clock.kind !== 'linked' || parseLocal(f.clock.local, f.clock.at.minute) === null) return 'its local time does not convert to the main clock';
  const rate = f.clock.rate ?? 1;
  return `main ${formatTick(tick, origin)} = local ${localTime(f, tick)}; ${rate === 1 ? 'local time runs at the same speed as the main clock' : `local time runs ${+rate.toFixed(4)}× as fast as the main clock`}`;
}

export function frameName(fx: FrameIndex, id: Id | null | undefined, fallback: string): string {
  if (!id || id === MAIN_FRAME) return fx.mainName || fallback;
  return fx.frames.get(id)?.name || id;
}
