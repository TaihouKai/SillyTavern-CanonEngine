// PR1–PR8: with a pack store (ST: the pack library) a chat keeps only a reference to its pack. A 15 MB pack (FGO)
// made every chat file and every chat backup 15 MB. Chats that still carry the pack are moved to the store when
// opened; a pack missing from the store is reconnected by choosing the same pack again.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { CanonEngine } from '../../src/runtime/engine';
import { validatePackText } from '../../src/domain/pack';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const other = readFileSync(join(ROOT, 'examples', 'frames-demo.canon.json'), 'utf8');
const hashOf = (text: string) => validatePackText(text).loaded!.hash;

/** An in-memory pack library: file -> text. */
function store() {
  const files = new Map<string, string>();
  const s = {
    files,
    saves: 0,
    async save(text: string, meta: { hash: string }) { s.saves++; const file = `user/files/pack-${meta.hash.slice(0, 10)}.json`; files.set(file, text); return { file }; },
    async load(ref: { hash: string; file?: string }) {
      if (ref.file && files.has(ref.file)) return files.get(ref.file)!;
      for (const [, t] of files) if (hashOf(t) === ref.hash) return t;
      return null;
    },
  };
  return s;
}

async function bound(withStore = true) {
  const x = makeEngine();
  const st = store();
  if (withStore) x.host.packStore = st;
  await x.engine.bind(demo, { startTick: tick(1, 9, 30), mode: 'new' });
  await x.engine.reconcile('test');
  return { ...x, st };
}
const turn = async (x: Awaited<ReturnType<typeof bound>>, user: string, draft: string) => { x.host.addUser(user); x.model.draft(draft); return x.engine.runOperation('normal'); };

describe('pack kept by reference', () => {
  it('PR1 binding with a pack store keeps the pack in the store, only a reference in the chat', async () => {
    const x = await bound();
    const c = x.engine.campaign()!;
    expect(c.packSnapshot).toBeUndefined();
    expect(c.packRef).toMatchObject({ packId: 'demo-harbor', file: expect.stringMatching(/^user\/files\/pack-/) });
    expect(x.st.files.size).toBe(1);
    expect(JSON.stringify(c).length).toBeLessThan(JSON.stringify(validatePackText(demo).loaded!.pack).length);
    expect(await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR1]')).toBe(true);
    expect(x.engine.packInfo()).toMatchObject({ packId: 'demo-harbor', version: '1.0.0' });
  });

  it('PR2 reopening the chat (a new engine) loads the pack from the store', async () => {
    const x = await bound();
    await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR2a]');
    await x.host.save();
    x.host.reload();
    const y = new CanonEngine(x.host, { taskTimeoutMs: 5000, draftTimeoutMs: 5000 });
    const r = await y.reconcile('chat_changed');
    expect(r?.issue).toBeNull();
    expect(y.pack().hash).toBe(hashOf(demo));
    expect(y.current!.replay.state.occurrences.size).toBe(x.engine.current!.replay.state.occurrences.size);
  });

  it('PR3 a chat that carries its pack (bound before) moves it to the store when opened; the copy is dropped only after reading it back', async () => {
    const x = await bound(false);
    expect(x.engine.campaign()!.packSnapshot).toBeTruthy();
    await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR3a]');
    const st = store();
    x.host.packStore = st;
    await x.engine.reconcile('chat_changed');
    const c = x.engine.campaign()!;
    expect(c.packSnapshot).toBeUndefined();
    expect(c.packRef?.file).toBeTruthy();
    expect(hashOf(st.files.get(c.packRef!.file)!)).toBe(c.packHash);
    expect(x.host.persisted.campaign!.packSnapshot).toBeUndefined(); // saved
    // a store whose copy does not read back keeps the pack in the chat
    const z = await bound(false);
    z.host.packStore = { save: async () => ({ file: 'broken.json' }), load: async () => null };
    await z.engine.reconcile('chat_changed');
    expect(z.engine.campaign()!.packSnapshot).toBeTruthy();
    expect(z.engine.campaign()!.packRef).toBeUndefined();
  });

  it('PR4 a pack missing from the store stops the engine with a clear message; the same pack chosen again reconnects the chat', async () => {
    const x = await bound();
    await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR4a]');
    const occ = x.engine.current!.replay.state.occurrences.size;
    x.st.files.clear();
    x.host.reload();
    const y = new CanonEngine(x.host, { taskTimeoutMs: 5000, draftTimeoutMs: 5000 });
    await expect(y.reconcile('chat_changed')).rejects.toThrow(/not in the pack library any more.*Choose that pack file again/);
    expect(y.status.errorKind).toBe('pack_missing');
    expect(y.packMissing()).toBe(true);
    await expect(y.relinkPack(other)).rejects.toThrow(/not the pack this chat was bound to/);
    await y.relinkPack(demo);
    expect(y.packMissing()).toBe(false);
    expect(x.st.files.size).toBe(1);
    expect(y.current!.replay.state.occurrences.size).toBe(occ);
  });

  it('PR5 a backup carries its pack; importing it keeps the pack in the store', async () => {
    const x = await bound();
    await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR5a]');
    const backup = JSON.parse(x.engine.exportBackup());
    expect(hashOf(JSON.stringify(backup.campaign.packSnapshot))).toBe(x.engine.campaign()!.packHash);
    x.st.files.clear();
    await x.engine.importBackup(JSON.stringify(backup));
    expect(x.engine.campaign()!.packSnapshot).toBeUndefined();
    expect(x.st.files.size).toBe(1);
  });

  it('PR6 a pack update keeps the new version in the store', async () => {
    const x = await bound();
    const p = JSON.parse(demo);
    p.pack_version = '1.0.1';
    p.description += ' (updated)';
    await x.engine.applyPackUpdate(JSON.stringify(p));
    const c = x.engine.campaign()!;
    expect(c.packSnapshot).toBeUndefined();
    expect(c.packVersion).toBe('1.0.1');
    expect(x.st.files.size).toBe(2);
    expect(x.engine.pack().pack.pack_version).toBe('1.0.1');
  });

  it('PR7 without a pack store (other hosts) the pack stays in the chat as before', async () => {
    const x = await bound(false);
    expect(x.engine.campaign()!.packSnapshot).toBeTruthy();
    expect(x.engine.campaign()!.packRef).toBeUndefined();
    expect(await turn(x, 'I walk to the harbor.', 'Gulls cry. [PR7]')).toBe(true);
  });
});
