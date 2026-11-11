// Audit 2026-11: the hosts' adaptation layer.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WriterLock } from '../../src/hosts/browser/lock';

describe('audit: SillyTavern settings', () => {
  it('H1: a timeout or budget the user chose is kept when the settings are read again', async () => {
    const saved: Record<string, any> = {};
    (globalThis as any).SillyTavern = { getContext: () => ({ extensionSettings: saved }) };
    const { globalSettings } = await import('../../src/hosts/sillytavern/index');
    const s = globalSettings();
    // the user sets both in the settings drawer (number fields, any value is allowed)
    s.taskTimeoutMs = 180000;
    s.budgetChars = 24000;
    const again = globalSettings(); // every read of the settings goes through this
    expect({ taskTimeoutMs: again.taskTimeoutMs, budgetChars: again.budgetChars }).toEqual({ taskTimeoutMs: 180000, budgetChars: 24000 });
  });
});

// What the tabs of one origin share: localStorage, and the Web Locks manager (one holder per name; the others are told at once).
function sharedStorage(opts: { blind?: boolean } = {}) {
  const data = new Map<string, string>();
  return { data, getItem: (k: string) => (opts.blind ? null : data.get(k) ?? null), setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
}
function sharedLocks() {
  const held = new Set<string>();
  return {
    held,
    async request(name: string, _o: { ifAvailable: boolean }, cb: (lock: unknown) => unknown) {
      await Promise.resolve();
      if (held.has(name)) return cb(null);
      held.add(name);
      try { return await cb({ name }); } finally { held.delete(name); }
    },
  };
}
const settle = () => new Promise((r) => setTimeout(r, 5));

describe('audit: the writer lock of the browser hosts', () => {
  const tabs: WriterLock[] = [];
  const tab = (id: string) => { const l = new WriterLock(id); tabs.push(l); return l; };
  afterEach(() => { for (const l of tabs.splice(0)) l.release(); vi.unstubAllGlobals(); });

  it('L1: one tab holds a campaign; the other is told so, and gets it when the first lets go', async () => {
    vi.stubGlobal('localStorage', sharedStorage());
    vi.stubGlobal('navigator', { locks: sharedLocks() });
    const a = tab('A'), b = tab('B');
    expect(await a.acquire('s1')).toBe(true);
    expect(await b.acquire('s1')).toBe(false);
    expect([a.isOwner(), b.isOwner()]).toEqual([true, false]);
    expect(await b.acquire('s2')).toBe(true); // another campaign is free
    b.setCampaign('s1');
    await settle();
    expect(b.isOwner()).toBe(false);
    a.setCampaign(null);
    await settle();
    b.isOwner(); // every look asks again while it is not held here
    await settle();
    expect(b.isOwner()).toBe(true);
    expect(await a.acquire('s1')).toBe(false);
  });

  it('L2: two tabs starting in the same instant, each reading the heartbeat before the other wrote it: one owner, not two', async () => {
    vi.stubGlobal('localStorage', sharedStorage({ blind: true })); // neither sees the other's heartbeat
    vi.stubGlobal('navigator', { locks: sharedLocks() });
    const a = tab('A'), b = tab('B');
    a.setCampaign('s1'); b.setCampaign('s1');
    await settle();
    expect([a.isOwner(), b.isOwner()].filter(Boolean).length).toBe(1);
  });

  it('L3: a campaign left before its lock was answered is not kept', async () => {
    vi.stubGlobal('localStorage', sharedStorage());
    const locks = sharedLocks();
    vi.stubGlobal('navigator', { locks });
    const a = tab('A'), b = tab('B');
    a.setCampaign('s1'); a.setCampaign('s2');
    await settle();
    expect([...locks.held]).toEqual(['canonEngine.writer.s2']);
    expect(await b.acquire('s1')).toBe(true);
  });

  it('L4: without Web Locks the heartbeat decides, as before', async () => {
    vi.stubGlobal('localStorage', sharedStorage());
    vi.stubGlobal('navigator', {});
    const a = tab('A'), b = tab('B');
    expect(await a.acquire('s1')).toBe(true);
    expect(await b.acquire('s1')).toBe(false);
    a.setCampaign(null);
    expect(b.isOwner()).toBe(true);
  });
});
