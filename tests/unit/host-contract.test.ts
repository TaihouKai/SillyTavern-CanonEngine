// What the engine takes for granted of every host (src/core/runtime/host.ts), checked for each of them: a save that
// returns is durable and one that could not be written throws; a published reply is found again under the ids and the
// hash the engine gave it; reading the conversation twice gives the same identities.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HostPort, Interpretation, PublishRequest } from '../../src/core';
import { FakeHost } from './fake';
import { WebHost } from '../../src/hosts/web/host';
import { StHost } from '../../src/hosts/sillytavern/st';

/** IndexedDB as far as the web host's store uses it: object stores with put/get/delete/getAll inside transactions. */
function fakeIndexedDB(opts: { failWrites: () => boolean; failOpen?: () => boolean }) {
  const stores: Record<string, Map<string, unknown>> = { saves: new Map(), packs: new Map() };
  const db = {
    createObjectStore: () => undefined, close: () => undefined,
    transaction(name: string, mode: string) {
      const t: any = { error: null };
      let fail = false;
      const req = (run: () => unknown) => { const r: any = {}; try { r.result = run(); } catch (e) { fail = true; t.error = e; } return r; };
      t.objectStore = () => ({
        put: (v: any, k?: string) => req(() => { if (mode === 'readwrite' && opts.failWrites()) throw new Error('QuotaExceededError'); stores[name].set(k ?? v.id, structuredClone(v)); }),
        get: (k: string) => req(() => stores[name].get(k)),
        delete: (k: string) => req(() => void stores[name].delete(k)),
        getAll: () => req(() => [...stores[name].values()]),
      });
      queueMicrotask(() => (fail ? t.onabort?.() : t.oncomplete?.()));
      return t;
    },
  };
  return {
    stores,
    open() {
      const r: any = { result: db, error: new Error('the database could not be opened') };
      queueMicrotask(() => (opts.failOpen?.() ? r.onerror?.() : r.onsuccess?.()));
      return r;
    },
  };
}

interface Kit { host: HostPort; addUser(text: string): void; breakSaves(n: number): void; durable(): { chat: number; campaign: unknown } | Promise<{ chat: number; campaign: unknown }> }
const req = (text: string, op: PublishRequest['op'] = 'normal'): PublishRequest => ({ op, text, messageId: `msg_${text.length}_${Math.random().toString(36).slice(2)}`, variantId: `var_${Math.random().toString(36).slice(2)}` } as PublishRequest);
const interp = {} as Interpretation;

const kits: Record<string, () => Promise<Kit>> = {
  FakeHost: async () => {
    const host = new FakeHost();
    host.setCampaign({ sessionId: 's' } as any);
    return { host, addUser: (t) => void host.addUser(t), breakSaves: (n) => { host.failNextSaves = n; }, durable: () => ({ chat: host.persisted.chat.length, campaign: host.persisted.campaign }) };
  },
  WebHost: async () => {
    let failing = 0;
    const idb = fakeIndexedDB({ failWrites: () => failing-- > 0 });
    vi.stubGlobal('indexedDB', idb);
    vi.resetModules();
    const { WebHost: Fresh } = await import('../../src/hosts/web/host'); // with a store of its own (the store keeps its database open)
    const host: WebHost = new Fresh({} as any);
    host.game = { id: 'g1', title: 't', createdAt: 1, updatedAt: 1, integrity: 'i1', persona: { name: 'P', description: '' }, worldNotes: '', chat: [], campaign: null };
    host.setCampaign({ sessionId: 's' } as any);
    return { host, addUser: (t) => void host.addUser(t), breakSaves: (n) => { failing = n; }, durable: () => { const g = idb.stores.saves.get('g1') as any; return { chat: g?.chat.length ?? 0, campaign: g?.campaign ?? null }; } };
  },
};

describe.each(Object.keys(kits))('the host contract: %s', (name) => {
  let k: Kit;
  beforeEach(async () => { k = await kits[name](); });
  afterEach(() => vi.unstubAllGlobals());

  it('a save that returns is durable; a save that could not be written throws, and the next one works', async () => {
    k.addUser('I look around.');
    await k.host.save();
    const before = await k.durable();
    expect(before.chat).toBeGreaterThan(0);
    expect(before.campaign).toBeTruthy();
    k.addUser('I walk on.');
    k.breakSaves(1);
    await expect(k.host.save()).rejects.toThrow();
    expect((await k.durable()).chat).toBe(before.chat);
    await k.host.save();
    expect((await k.durable()).chat).toBe(before.chat + 1);
  });

  it('a published reply is read back under the ids it was given and the hash the engine computes for its text', async () => {
    k.addUser('I look around.');
    for (const [op, text] of [['normal', 'Gulls circle the harbor.'], ['swipe', 'The harbor is quiet.'], ['continue', 'The harbor is quiet. A bell rings.']] as const) {
      const r = req(text, op);
      await k.host.publish(r, interp);
      const last = k.host.readTranscript().at(-1)!;
      expect({ role: last.role, text: last.text, variantId: last.variantId, contentHash: last.contentHash }).toEqual({ role: 'gm', text, variantId: r.variantId, contentHash: k.host.hashAssistant(text) });
      if (op === 'normal') expect(last.messageId).toBe(r.messageId);
    }
    // one reply all along: a swipe and a continuation replace it
    expect(k.host.readTranscript().filter((e) => e.role === 'gm' && /Gulls|quiet/.test(e.text)).length).toBe(1);
  });

  it('reading the conversation changes nothing: the same identities and hashes every time', async () => {
    k.addUser('I look around.');
    await k.host.publish(req('Gulls circle the harbor.'), interp);
    k.addUser('I walk on.');
    const a = k.host.readTranscript(), b = k.host.readTranscript();
    expect(b).toEqual(a);
    expect(new Set(a.map((e) => e.messageId)).size).toBe(a.length);
  });

  it('a failed re-roll leaves the reply it would have replaced, once', async () => {
    k.addUser('I look around.');
    await k.host.publish(req('Gulls circle the harbor.'), interp);
    const before = k.host.readTranscript();
    const prior = (await k.host.removeLastReply?.()) ?? null; // hosts that take the reply out for a re-roll
    await k.host.restorePrior('regenerate', prior);
    expect(k.host.readTranscript()).toEqual(before);
  });
});

describe('the host contract: WebHost alone', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('nothing open: a save throws instead of returning as if written', async () => {
    const host = new WebHost({} as any);
    await expect(host.save()).rejects.toThrow(/No game is open/);
    expect(() => host.setCampaign({ sessionId: 's' } as any)).toThrow(/No game is open/);
    expect(() => host.setCampaign(null)).not.toThrow();
  });
  it('a database that could not be opened once is opened again by the next save', async () => {
    let bad = 1;
    const idb = fakeIndexedDB({ failWrites: () => false, failOpen: () => bad-- > 0 });
    vi.stubGlobal('indexedDB', idb);
    vi.resetModules();
    const { WebHost: Fresh } = await import('../../src/hosts/web/host');
    const host: WebHost = new Fresh({} as any);
    host.game = { id: 'g2', title: 't', createdAt: 1, updatedAt: 1, integrity: 'i', persona: { name: 'P', description: '' }, worldNotes: '', chat: [], campaign: null };
    await expect(host.save()).rejects.toThrow();
    await host.save();
    expect(idb.stores.saves.has('g2')).toBe(true);
  });
});

describe('the host contract: StHost (what needs no server)', () => {
  // SillyTavern's context as far as reading the conversation goes
  const st = (chat: any[]) => { (globalThis as any).SillyTavern = { getContext: () => ({ chat, name2: 'GM', chatMetadata: {}, extensionSettings: {}, getCurrentChatId: () => 'chat-1' }) }; return new StHost({} as any); };
  const gm = (mes: string, extra: any = {}) => ({ name: 'GM', is_user: false, mes, extra });
  const user = (mes: string) => ({ name: 'P', is_user: true, mes, extra: {} });

  it('reading twice gives the same identities, and a reply hashes as hashAssistant says', () => {
    const host = st([gm('Welcome.'), user('I look around.'), gm('Gulls circle the harbor.')]);
    const a = host.readTranscript(), b = host.readTranscript();
    expect(b).toEqual(a);
    expect(a[2].contentHash).toBe(host.hashAssistant('Gulls circle the harbor.'));
    expect(new Set(a.map((e) => e.messageId)).size).toBe(3);
  });

  it('S12 (seen in a real SillyTavern): a native copy carries the original\'s identity and stands after it; the original keeps it, the copy gets its own', () => {
    const chat = [gm('Welcome.'), user('I look around.'), gm('Gulls circle the harbor.')];
    const host = st(chat);
    const before = host.readTranscript();
    chat.splice(3, 0, structuredClone(chat[2])); // what "Create a copy of this message" does
    const after = host.readTranscript();
    expect(after.slice(0, 3)).toEqual(before);
    expect(after[3].messageId).not.toBe(before[2].messageId);
    expect(host.readTranscript()).toEqual(after);
  });
});
