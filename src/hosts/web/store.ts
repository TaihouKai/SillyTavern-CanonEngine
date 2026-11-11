// Saved games and packs in the browser (IndexedDB: a game with its pack runs to megabytes, past localStorage).
// Nothing leaves the browser.

export interface Msg { role: 'user' | 'gm'; text: string; mid: string; vid: string; swipes?: { text: string; vid: string }[]; swipeId?: number }
export interface Save {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Changes when the game is replaced under the same id (an imported copy): a new branch for the engine. */
  integrity: string;
  persona: { name: string; description: string };
  /** What the setting is like, in the player's words (optional; given to the GM). */
  worldNotes: string;
  chat: Msg[];
  campaign: unknown;
}

const DB = 'canon-engine-play', VERSION = 1;
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  const p = new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, VERSION);
    r.onupgradeneeded = () => { r.result.createObjectStore('saves', { keyPath: 'id' }); r.result.createObjectStore('packs'); };
    r.onsuccess = () => {
      // closed under us (another tab upgrading, the browser clearing site data): the next call opens it again
      r.result.onclose = r.result.onversionchange = () => { r.result.close(); if (dbp === p) dbp = null; };
      res(r.result);
    };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('The saved games are held open by another tab of this page.'));
  });
  dbp = p;
  // an open that failed is not kept: the next save tries again (it used to fail for good until the page was reloaded)
  p.catch(() => { if (dbp === p) dbp = null; });
  return p;
}
async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

export const saves = {
  list: async (): Promise<Save[]> => ((await tx<Save[]>('saves', 'readonly', (s) => s.getAll() as IDBRequest<Save[]>)) || []).sort((a, b) => b.updatedAt - a.updatedAt),
  get: (id: string) => tx<Save | undefined>('saves', 'readonly', (s) => s.get(id) as IDBRequest<Save | undefined>),
  put: (save: Save) => tx('saves', 'readwrite', (s) => s.put(save)),
  delete: (id: string) => tx('saves', 'readwrite', (s) => s.delete(id)),
};
export const packs = {
  get: (hash: string) => tx<string | undefined>('packs', 'readonly', (s) => s.get(hash) as IDBRequest<string | undefined>),
  put: (hash: string, text: string) => tx('packs', 'readwrite', (s) => s.put(text, hash)),
};
