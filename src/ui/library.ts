// Pack library: imported history packs are kept in the ST user's files folder
// (data/<user>/user/files/, inside ST's data directory, so Docker volumes and backups include it).
// The index lives in the extension settings (also under data/<user>/settings.json).
import { ctx } from '../adapters/st';

export interface LibraryEntry { file: string; title: string; packId: string; version: string; hash: string; size: number; added: number }

/* eslint-disable @typescript-eslint/no-explicit-any */
function settingsObj(): { library?: LibraryEntry[] } {
  const es = ctx().extensionSettings as any;
  return es.canonEngine || (es.canonEngine = {});
}

export function listLibrary(): LibraryEntry[] {
  return [...(settingsObj().library || [])].sort((a, b) => b.added - a.added);
}

function headers(): Record<string, string> {
  const h = ctx().getRequestHeaders?.() || {};
  return { ...h, 'Content-Type': 'application/json' };
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 60) || 'pack';

async function fileExists(file: string): Promise<boolean> {
  const r = await fetch('/' + file.replace(/^\/+/, ''), { method: 'HEAD', cache: 'no-store', headers: ctx().getRequestHeaders?.() || {} }).catch(() => null);
  return !!r?.ok;
}

/** Save a validated pack. Same content (hash) is stored once; an entry whose file was deleted is stored again. */
export async function saveToLibrary(text: string, meta: { title: string; packId: string; version: string; hash: string }): Promise<LibraryEntry> {
  let lib = settingsObj().library || [];
  const existing = lib.find((e) => e.hash === meta.hash);
  if (existing && await fileExists(existing.file)) return existing;
  if (existing) settingsObj().library = lib = lib.filter((e) => e !== existing);
  const name = `canon-pack-${safe(meta.packId)}-${safe(meta.version)}-${meta.hash.slice(0, 10)}.json`;
  const r = await fetch('/api/files/upload', { method: 'POST', headers: headers(), body: JSON.stringify({ name, data: toBase64(text) }) });
  if (!r.ok) throw new Error(`Saving the pack to the SillyTavern files folder failed (HTTP ${r.status}): ${(await r.text()).slice(0, 200)}`);
  const { path } = await r.json();
  const entry: LibraryEntry = { file: String(path), title: meta.title, packId: meta.packId, version: meta.version, hash: meta.hash, size: text.length, added: Date.now() };
  settingsObj().library = [...lib, entry];
  ctx().saveSettingsDebounced?.();
  return entry;
}

export async function loadFromLibrary(e: LibraryEntry): Promise<string> {
  const r = await fetch('/' + e.file.replace(/^\/+/, ''), { cache: 'no-store', headers: ctx().getRequestHeaders?.() || {} });
  if (!r.ok) throw new Error(`The saved pack file is missing (${e.file}, HTTP ${r.status}). Remove it from the list and import it again.`);
  return await r.text();
}

/** The engine's pack store: chats keep only a reference to their pack, the pack itself lives in the library. */
export const libraryPackStore = {
  save: async (text: string, meta: { title: string; packId: string; version: string; hash: string }) => ({ file: (await saveToLibrary(text, meta)).file }),
  load: async (ref: { hash: string; file?: string }): Promise<string | null> => {
    const files = [ref.file, ...(settingsObj().library || []).filter((e) => e.hash === ref.hash).map((e) => e.file)].filter((f, i, a): f is string => !!f && a.indexOf(f) === i);
    for (const f of files) {
      const r = await fetch('/' + f.replace(/^\/+/, ''), { cache: 'no-store', headers: ctx().getRequestHeaders?.() || {} }).catch(() => null);
      if (r?.ok) return await r.text();
    }
    return null;
  },
};

export async function removeFromLibrary(e: LibraryEntry): Promise<void> {
  await fetch('/api/files/delete', { method: 'POST', headers: headers(), body: JSON.stringify({ path: e.file }) }).catch(() => undefined);
  settingsObj().library = (settingsObj().library || []).filter((x) => x.hash !== e.hash);
  ctx().saveSettingsDebounced?.();
}
