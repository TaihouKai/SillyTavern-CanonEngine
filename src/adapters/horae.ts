// Read-only Horae adapter (public window.Horae API only; never writes private fields).
// Verified against Horae 1.15.1 (TaihouKai/SillyTavern-Horae-Metadata fork, metadata mode).
import type { HoraePort, HoraeStatus } from '../runtime/host';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const SillyTavern: { getContext(): any };

export interface HoraeDiagnosis { ok: boolean; version: string | null; missing: string[]; mode: string | null }

export class HoraeAdapter implements HoraePort {
  private api: any;
  constructor(api: any) { this.api = api; }

  static diagnose(): HoraeDiagnosis {
    const api = (globalThis as any).Horae;
    if (!api) return { ok: false, version: null, missing: ['window.Horae'], mode: null };
    const missing: string[] = [];
    for (const k of ['getLatestState', 'getStateMode']) if (typeof api[k] !== 'function') missing.push(k);
    for (const k of ['getStatus', 'isBusy', 'waitForIdle', 'reanalyze']) if (typeof api.background?.[k] !== 'function') missing.push('background.' + k);
    let mode: string | null = null;
    try { mode = api.getStateMode?.() || null; } catch { /* ignore */ }
    return { ok: missing.length === 0, version: api.version || null, missing, mode };
  }

  static detect(): HoraeAdapter | null {
    const api = (globalThis as any).Horae;
    return api ? new HoraeAdapter(api) : null;
  }

  status(): HoraeStatus {
    const d = HoraeAdapter.diagnose();
    const api = this.api;
    if (!api || !(api.isEnabled?.() ?? true)) return { available: false, version: d.version, mode: d.mode, staleIndexes: [], busy: false, scene: null };
    const staleIndexes: number[] = [];
    let busy = false;
    if (d.ok) {
      try { busy = !!api.background.isBusy(); } catch { /* ignore */ }
      const chat: any[] = SillyTavern.getContext().chat || [];
      for (let i = 0; i < chat.length; i++) {
        const m = chat[i];
        if (!m || m.is_user || m.is_system) continue;
        let st: string | null = null;
        try { st = api.background.getStatus(i); } catch { st = null; }
        if (st === 'outdated' || st === 'failed') staleIndexes.push(i);
      }
    }
    let scene: HoraeStatus['scene'] = null;
    try {
      const s = api.getLatestState?.();
      if (s) scene = { date: s.timestamp?.story_date, time: s.timestamp?.story_time, location: s.scene?.location, characters: s.scene?.characters_present || [] };
      if (scene) Object.assign(scene, HoraeAdapter.latestTime(api.getChat?.() || SillyTavern.getContext().chat || []));
    } catch { /* ignore */ }
    return { available: d.ok, version: d.version, mode: d.mode, staleIndexes, busy, scene };
  }

  /** Story date and time from the latest message that records either — both from that one message.
   *  getLatestState() carries each field forward on its own, so a reply with a date but no clock time
   *  ("2020/10/9 上午") was joined with the previous evening's time ("21:30") into a wrong "10/9 21:30".
   *  A time without a date keeps the last recorded date (same day); a date without a time gives no time. */
  static latestTime(chat: any[]): { date?: string; time?: string } {
    for (let i = chat.length - 1; i >= 0; i--) {
      const ts = chat[i]?.horae_meta && !chat[i].horae_meta._skipHorae ? chat[i].horae_meta.timestamp : null;
      const date = ts?.story_date || '', time = ts?.story_time || '';
      if (!date && !time) continue;
      if (date) return { date, time: time || undefined };
      for (let j = i - 1; j >= 0; j--) {
        const d = chat[j]?.horae_meta && !chat[j].horae_meta._skipHorae ? chat[j].horae_meta.timestamp?.story_date : '';
        if (d) return { date: d, time };
      }
      return { date: undefined, time };
    }
    return { date: undefined, time: undefined };
  }

  async waitForIdle(timeoutMs: number): Promise<boolean> {
    try { return !!(await this.api?.background?.waitForIdle?.(timeoutMs)); } catch { return false; }
  }

  async reanalyze(index: number): Promise<void> {
    await this.api?.background?.reanalyze?.(index);
  }
}
