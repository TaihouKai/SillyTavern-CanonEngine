// 历史包备忘: model answers that depend only on what was asked, kept next to the pack in the host's pack library.
// A new game that asks the same question again (the same pack, the same Persona, the same lorebook entry) takes the
// answer it got before instead of paying for it again. Live (2026-11-23): checking the lorebook and the pack against
// a Persona's 本局设定 was 45–115 calls and most of a first turn's cost, and every new game with the same Persona
// asked exactly the same.
// Not history: each game still keeps what it used in its own chat, exactly as before; the memo only saves the call.
// A key is a hash of everything the question is made of, the task's instructions included, so a changed prompt, pack
// text, Persona or lorebook entry is a new question. Losing the file loses nothing but the saving.
import { deepClone, hashObject } from '../domain/util';

/** Where a pack's memo is kept (ST: a file in the user's files folder beside the pack). */
export interface MemoStore {
  load(packHash: string): Promise<string | null>;
  save(packHash: string, text: string): Promise<void>;
}

const VERSION = 1;
/** Entries kept per pack; the ones used longest ago go first. */
export const MEMO_MAX = 30000;

/** entries: t = the task that asked (older files have none); prompts: the task's instructions its answers were given
 *  under (a hash) */
interface MemoFile { v: number; pack: string; entries: Record<string, { at: number; out: unknown; t?: string }>; prompts?: Record<string, string> }

export const memoKey = (...parts: unknown[]) => hashObject(parts).slice(0, 32);

export class PackMemo {
  private data: MemoFile | null = null;
  private loading: Promise<void> | null = null;
  private dirty = false;
  /** Answers taken from the memo since this was made (for the turn's notes and tests). */
  hits = 0;
  /** Tasks whose kept answers were dropped because the engine now asks them differently (taken by takeStale). */
  private stale = new Set<string>();

  constructor(private store: MemoStore | undefined, readonly packHash: string, private now: () => number, private warn: (msg: string) => void) {}

  private ready(): Promise<void> {
    if (this.data) return Promise.resolve();
    return (this.loading ||= (async () => {
      let d: MemoFile | null = null;
      try {
        const t = this.store ? await this.store.load(this.packHash) : null;
        if (t) d = JSON.parse(t) as MemoFile;
      } catch (e) { this.warn(`the memo of this pack could not be read (${(e as Error).message}); it starts empty`); }
      this.data = d && d.v === VERSION && d.pack === this.packHash && d.entries && typeof d.entries === 'object' ? d : { v: VERSION, pack: this.packHash, entries: {} };
    })());
  }

  async get<T>(key: string): Promise<T | undefined> {
    await this.ready();
    const e = this.data!.entries[key];
    if (!e) return undefined;
    e.at = this.now();
    this.hits++;
    return deepClone(e.out) as T;
  }

  async put(key: string, out: unknown, task?: string): Promise<void> {
    await this.ready();
    this.data!.entries[key] = { at: this.now(), out: deepClone(out), ...(task ? { t: task } : {}) };
    this.dirty = true;
  }

  /** Said before a task's answers are looked up, with the instructions it is asked with. When they are not the ones
   *  the kept answers were given under (an engine update changed how the task is asked), none of those answers can be
   *  found again: they are dropped and the task is reported (takeStale), so that "nothing reused" has its reason. */
  async asking(task: string, instructions: string): Promise<void> {
    await this.ready();
    const h = hashObject(instructions).slice(0, 16);
    const prompts = (this.data!.prompts ||= {});
    if (prompts[task] === h) return;
    if (prompts[task] !== undefined) {
      let dropped = 0;
      for (const [k, e] of Object.entries(this.data!.entries)) if (e.t === task) { delete this.data!.entries[k]; dropped++; }
      if (dropped) this.stale.add(task);
    }
    prompts[task] = h;
    this.dirty = true;
  }

  /** The tasks found asked differently since the last call. */
  takeStale(): string[] { const s = [...this.stale]; this.stale.clear(); return s; }

  /** Write what was added (nothing new: no write). A failed write is reported and kept for the next one. */
  async flush(): Promise<void> {
    if (!this.dirty || !this.store || !this.data) return;
    const keys = Object.keys(this.data.entries);
    if (keys.length > MEMO_MAX) {
      keys.sort((a, b) => this.data!.entries[a].at - this.data!.entries[b].at);
      for (const k of keys.slice(0, keys.length - MEMO_MAX)) delete this.data.entries[k];
    }
    this.dirty = false;
    try { await this.store.save(this.packHash, JSON.stringify(this.data)); } catch (e) {
      this.dirty = true;
      this.warn(`the memo of this pack could not be saved (${(e as Error).message})`);
    }
  }
}
