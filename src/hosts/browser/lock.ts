// Single-writer ownership per campaign within one browser profile, for the hosts that run in a browser.
// Web Locks decide where the browser has them: one context holds a campaign's lock, the others are told so at once
// (atomic across the tabs of an origin), and the browser releases it when the holder's tab goes away. Without Web
// Locks, and until the first answer arrives, a localStorage heartbeat decides (read, then write: two tabs starting in
// the same instant can both think they own it until the next beat).
// This is browser-local only; it is NOT server-wide concurrency protection (see COMPATIBILITY.md).
const PREFIX = 'canonEngine.writer.';
const STALE_MS = 6000;

interface LockManagerLike { request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => unknown): Promise<unknown> }
const lockManager = (): LockManagerLike | null => (typeof navigator !== 'undefined' && (navigator as unknown as { locks?: LockManagerLike }).locks) || null;

export class WriterLock {
  private instanceId: string;
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The heartbeat's answer. */
  private owner = true;
  /** The Web Lock's answer: held here, held by another context, or none yet (also: no Web Locks). */
  private held: boolean | null = null;
  private letGo: (() => void) | null = null;
  private asking: Promise<void> | null = null;
  /** Changes with the campaign: an answer for an earlier one is dropped. */
  private epoch = 0;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.release());
  }

  private read(): { id: string; ts: number } | null {
    try { const v = localStorage.getItem(PREFIX + this.sessionId); return v ? JSON.parse(v) : null; } catch { return null; }
  }

  /** Ask for the campaign's Web Lock (kept until release); told at once when another context holds it. */
  private ask(): Promise<void> {
    const locks = lockManager();
    if (!locks || !this.sessionId || this.held) return Promise.resolve();
    if (this.asking) return this.asking;
    const epoch = this.epoch;
    const asking: Promise<void> = new Promise<void>((answered) => {
      locks.request(PREFIX + this.sessionId, { ifAvailable: true }, (lock) => {
        if (epoch !== this.epoch) { answered(); return undefined; } // for a campaign left meanwhile: given back at once
        this.held = !!lock;
        answered();
        return lock ? new Promise<void>((release) => { this.letGo = release; }) : undefined;
      }).catch(() => { if (epoch === this.epoch) this.held = null; answered(); });
    }).then(() => { if (this.asking === asking) this.asking = null; });
    this.asking = asking;
    return asking;
  }

  private beat() {
    if (!this.sessionId) return;
    if (this.held !== true) void this.ask();
    if (this.held === false) { this.owner = false; return; }
    const cur = this.read();
    if (!cur || cur.id === this.instanceId || this.held === true || Date.now() - cur.ts > STALE_MS) {
      try { localStorage.setItem(PREFIX + this.sessionId, JSON.stringify({ id: this.instanceId, ts: Date.now() })); } catch { /* storage unavailable: assume owner */ }
      this.owner = true;
    } else {
      this.owner = false;
    }
  }

  setCampaign(sessionId: string | null) {
    if (this.sessionId === sessionId) return;
    this.release();
    this.sessionId = sessionId;
    if (!sessionId) { this.owner = true; return; }
    this.beat();
    this.timer = setInterval(() => this.beat(), 2000);
  }

  /** setCampaign, and the answer once it is known (the Web Lock's where there is one). */
  async acquire(sessionId: string): Promise<boolean> {
    this.setCampaign(sessionId);
    await this.ask();
    return this.isOwner();
  }

  isOwner(): boolean {
    if (!this.sessionId) return true;
    this.beat();
    return this.held ?? this.owner;
  }

  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.epoch++;
    this.letGo?.();
    this.letGo = null;
    this.held = null;
    this.asking = null;
    if (this.sessionId) {
      const cur = this.read();
      if (cur?.id === this.instanceId) try { localStorage.removeItem(PREFIX + this.sessionId); } catch { /* ignore */ }
    }
    this.sessionId = null;
  }
}
