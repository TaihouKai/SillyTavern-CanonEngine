// Stable public API for other extensions (window.CanonEngine.api). Read-only.
import type { CanonEngine } from './runtime/engine';
import { fromTick, formatTick } from './domain/time';

export interface CanonClock {
  /** false when no chat is bound or the engine is disabled for this chat. */
  active: boolean;
  packId?: string;
  /** Committed story time in pack ticks (minutes since day 0, 00:00); tickHi > tick when uncertain. */
  tick?: number;
  tickHi?: number;
  precision?: string;
  /** Pack day number (day 0 = the pack's origin) and minute of day. */
  day?: number;
  minute?: number;
  /** Calendar date "YYYY/MM/DD" when the chat has a day-0 date, else null. */
  date?: string | null;
  /** "HH:MM" */
  time?: string;
  /** Weekday 0–6 (Sunday = 0) when a calendar date is known, else null. */
  weekday?: number | null;
  /** Human-readable label, e.g. "2020-09-18 20:00 (D61)". */
  label?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function publicClock(engine: CanonEngine): CanonClock {
  const c = engine.campaign();
  const st = engine.current?.replay.state;
  if (!c || !c.enabled || !st) return { active: false };
  const origin = c.binding.originDate || null;
  const lo = st.clock.lo;
  const t = fromTick(lo);
  let date: string | null = null;
  let weekday: number | null = null;
  if (origin) {
    const d = new Date(Date.UTC(origin.y, origin.m - 1, origin.d) + t.day * 86400000);
    date = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
    weekday = d.getUTCDay();
  }
  return {
    active: true, packId: c.packSnapshot.pack_id, tick: lo, tickHi: st.clock.hi, precision: st.clock.precision,
    day: t.day, minute: t.minute, date, time: `${pad(Math.floor(t.minute / 60))}:${pad(t.minute % 60)}`, weekday,
    label: formatTick(lo, origin),
  };
}

/** Emits `canon-engine:clock` on document whenever the committed clock (or binding) changes. */
export function installClockEvents(engine: CanonEngine) {
  let last = '';
  engine.onChange(() => {
    const clk = publicClock(engine);
    const sig = JSON.stringify(clk);
    if (sig === last) return;
    last = sig;
    try { document.dispatchEvent(new CustomEvent('canon-engine:clock', { detail: clk })); } catch { /* ignore */ }
  });
}
