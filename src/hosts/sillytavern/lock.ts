// Single-writer ownership per campaign within one browser profile (localStorage heartbeat).
// This is browser-local only; it is NOT server-wide concurrency protection (see COMPATIBILITY.md).
const PREFIX = 'canonEngine.writer.';
const STALE_MS = 6000;

export class WriterLock {
  private instanceId: string;
  private sessionId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private owner = true;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', () => this.release());
  }

  private read(): { id: string; ts: number } | null {
    try { const v = localStorage.getItem(PREFIX + this.sessionId); return v ? JSON.parse(v) : null; } catch { return null; }
  }

  private beat() {
    if (!this.sessionId) return;
    const cur = this.read();
    if (!cur || cur.id === this.instanceId || Date.now() - cur.ts > STALE_MS) {
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

  isOwner(): boolean {
    if (!this.sessionId) return true;
    this.beat();
    return this.owner;
  }

  release() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.sessionId) {
      const cur = this.read();
      if (cur?.id === this.instanceId) try { localStorage.removeItem(PREFIX + this.sessionId); } catch { /* ignore */ }
    }
  }
}
