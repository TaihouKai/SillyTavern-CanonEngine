// QT: a call's time limit counts from when the host really sends it (model.ts runStructured, ModelPort.reportsStart).
// Live (2026-11-25, a new user's first turn): the SillyTavern host sends one call at a time, the 本局设定 check queues
// dozens of parts at once, and the later parts timed out while still waiting in the queue, never sent.
import { describe, expect, it } from 'vitest';
import { callStructured } from '../../src/core/runtime/model';

/** A host that sends one call at a time, each taking `ms`. */
function queued(ms: number, reportsStart: boolean) {
  let queue: Promise<unknown> = Promise.resolve();
  const port = {
    reportsStart,
    sent: 0,
    runTask(_t: string, _m: unknown, opts: { onStart?: () => void }) {
      const p = queue.then(async () => { opts.onStart?.(); port.sent++; await new Promise((r) => setTimeout(r, ms)); return JSON.stringify({ judgements: [] }); });
      queue = p.catch(() => undefined);
      return p;
    },
    async generateDraft() { return ''; },
  };
  return port;
}
const six = (port: any) => Promise.allSettled(Array.from({ length: 6 }, () => callStructured(port, 'foreknow', 'SYS', { pairs: [] }, { callTimeoutMs: 100, maxAttempts: 1 })));

describe('a call is timed from when it is sent', () => {
  it('QT1 six calls queued behind each other (40 ms each, 100 ms limit) all finish', async () => {
    const r = await six(queued(40, true));
    expect(r.map((x) => x.status)).toEqual(Array(6).fill('fulfilled'));
  });

  it('QT2 without the host saying when it sends (as before): the later ones time out in the queue', async () => {
    const r = await six(queued(40, false));
    expect(r.filter((x) => x.status === 'rejected').length).toBeGreaterThan(0);
    expect(String((r.find((x) => x.status === 'rejected') as PromiseRejectedResult).reason?.message)).toMatch(/timed out after/);
  });

  it('QT3 a call that hangs once sent still times out', async () => {
    const r = await Promise.allSettled([callStructured(queued(300, true) as any, 'foreknow', 'SYS', { pairs: [] }, { callTimeoutMs: 100, maxAttempts: 1 })]);
    expect(r[0].status).toBe('rejected');
  });
});
