// Audit 2026-11: operations — continue, cancel, save failures after publication, retry.
// Each test states the expected behaviour with its source; they failed on 1.31.0 and pass since 1.32.0.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, deferred, legacyCampaign } from './fake';
import { factAt } from '../../src/core/domain/reducer';
import { ROOT } from './helpers';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
type X = ReturnType<typeof makeEngine>;
const st = (x: X) => x.engine.current!.replay.state;

async function setup(start = tick(1, 9, 30)) {
  const x = makeEngine();
  await x.engine.bind(demo, { startTick: start, mode: 'new' });
  await x.engine.reconcile('t');
  return x;
}
async function turn(x: X, user: string, draft: string, evalPatch: any = {}) {
  x.host.addUser(user);
  x.model.draft(draft);
  const marker = draft.slice(-6);
  x.model.on('evaluate', (i) => String(i.candidate).includes(marker), evalPatch);
  return x.engine.runOperation('normal');
}
const gmCount = (x: X) => x.host.chat.filter((m) => m.role === 'gm').length;

describe('audit: continue', () => {
  it('A1 (R03, E04): continuing a reply keeps the time and the offscreen events its first part crossed', async () => {
    const x = await setup();
    expect(await turn(x, 'I wait in the square until after noon.', 'It is 12:30 when you stop waiting in the square. [C1]', { scene_end: at(1, 12, 30) })).toBe(true);
    expect(st(x).clock.lo).toBe(tick(1, 12, 30));
    expect(st(x).dispositions.get('council-broadcast')?.disposition).toBeTruthy();
    const before = { clock: st(x).clock.lo, broadcast: factAt(st(x), 'council', 'broadcast')?.value, disp: st(x).dispositions.get('council-broadcast')?.disposition };

    // the continuation adds a sentence in the same scene: no time passes
    x.model.draft('The gulls keep circling overhead. [C2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[C2]'), { scene_end: at(1, 12, 30) });
    expect(await x.engine.runOperation('continue')).toBe(true);
    expect(x.host.chat[x.host.chat.length - 1].text).toContain('[C1]');
    expect(x.host.chat[x.host.chat.length - 1].text).toContain('[C2]');

    const after = { clock: st(x).clock.lo, broadcast: factAt(st(x), 'council', 'broadcast')?.value, disp: st(x).dispositions.get('council-broadcast')?.disposition };
    expect(after).toEqual(before);
  });
});

describe('audit: cancel', () => {
  it('A2 (GM_INTEGRATION_RULES §5, R17): stopping a turn while the player message is being read is not an error state', async () => {
    const x = await setup();
    x.host.addUser('I look around the harbor.');
    const gate = deferred();
    x.model.taskGate.extract_user = () => gate.promise;
    const p = x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 20));
    x.engine.cancel();
    gate.resolve();
    expect(await p).toBe(false);
    await new Promise((r) => setTimeout(r, 20));
    await x.engine.reconcile('settle', { allowModel: false }).catch(() => undefined);
    // a cancelled turn that failed later (draft, review) leaves recoveryState ok; the same must hold here
    expect(x.engine.campaign()!.recoveryState.errorKind).not.toBe('cancelled');
    expect(x.engine.campaign()!.recoveryState.status).not.toBe('error');
  });
});

describe('audit: a save fails after the reply was published', () => {
  // R11, R12, RUNTIME_SCHEMAS §6: whichever save of the turn fails from the publication on, there is one reply; the
  // state is `unsaved` exactly when what a reload would see is behind; Retry saves and writes nothing; a reload agrees.
  async function run(op: 'normal' | 'regenerate', failAt: number) {
    const x = await setup();
    legacyCampaign(x);
    let prior: any;
    if (op === 'regenerate') {
      expect(await turn(x, 'I look around the harbor.', 'The harbor is busy this morning. [OLD]')).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      prior = x.host.chat.pop()!;
    } else x.host.addUser('I look around the harbor.');
    x.model.draft('Fishing boats crowd the pier. [NEW]');
    let published = false, after = 0;
    x.host.publishHook = async () => { published = true; };
    x.host.saveDelay = async () => { if (published && ++after === failAt) throw new Error('simulated save failure'); };
    const ok = await x.engine.runOperation(op, op === 'regenerate' ? { message: prior } : undefined);
    await new Promise((r) => setTimeout(r, 20));
    x.host.saveDelay = null; x.host.publishHook = null;
    return { x, ok, savesAfterPublication: after };
  }
  const roles = (x: X) => x.host.chat.map((m) => m.role).join(',');
  const behind = (x: X) => x.host.persisted.campaign?.acceptedHead !== x.engine.campaign()!.acceptedHead || !x.host.persisted.chat.some((m) => m.text.includes('[NEW]'));

  for (const op of ['normal', 'regenerate'] as const) {
    it(`A3/A5 ${op}: every save from the publication on`, async () => {
      const clean = await run(op, 0);
      expect(clean.ok).toBe(true);
      expect(clean.savesAfterPublication).toBeGreaterThanOrEqual(2);
      for (let failAt = 1; failAt <= clean.savesAfterPublication; failAt++) {
        const { x, ok } = await run(op, failAt);
        const rec = x.engine.campaign()!.recoveryState;
        const label = `${op}, save ${failAt} of ${clean.savesAfterPublication} after publication: ${x.host.chat.map((m) => `${m.role}:${m.text.slice(-5)}`).join(' | ')} / ${rec.status} ${rec.errorKind || ''} ${rec.reason || ''}`;
        // the published reply is in the chat; a replaced one is not put back next to it
        expect(roles(x), label).toBe('gm,user,gm');
        expect(x.host.chat[2].text, label).toContain('[NEW]');
        expect(rec.status === 'unsaved', label).toBe(behind(x));
        if (behind(x)) { expect(ok, label).toBe(false); expect(x.engine.status.phase, label).toBe('error'); }
        // Retry saves; it does not write another reply
        x.model.draft('A second, unasked reply. [TWO]');
        await x.engine.retry();
        await new Promise((r) => setTimeout(r, 20));
        expect({ roles: roles(x), recovery: x.engine.campaign()!.recoveryState.status, behind: behind(x) }, label).toEqual({ roles: 'gm,user,gm', recovery: 'ok', behind: false });
        // and a reload sees the same game, without a model
        const head = x.engine.campaign()!.acceptedHead;
        const evals = x.model.tasks('evaluate').length;
        x.host.reload();
        await x.engine.onChatLoaded();
        await new Promise((r) => setTimeout(r, 20));
        expect({ roles: roles(x), head: x.engine.campaign()!.acceptedHead, reExamined: x.model.tasks('evaluate').length - evals }, label).toEqual({ roles: 'gm,user,gm', head, reExamined: 0 });
      }
    });
  }
});

describe('audit: retry', () => {
  it('A4 (R17): Retry after a failed regeneration regenerates; it does not add a second reply after the restored one', async () => {
    const x = await setup();
    expect(await turn(x, 'I look around the harbor.', 'The harbor is busy this morning. [OLD]')).toBe(true);
    await new Promise((r) => setTimeout(r, 20));
    const prior = x.host.chat.pop()!;
    x.model.failTask.draft = 1;
    expect(await x.engine.runOperation('regenerate', { message: prior })).toBe(false);
    expect(gmCount(x)).toBe(2); // greeting + the restored reply
    await new Promise((r) => setTimeout(r, 20));
    x.model.draft('Fishing boats crowd the pier. [NEW]');
    await x.engine.retry();
    await new Promise((r) => setTimeout(r, 20));
    const roles = x.host.chat.map((m) => m.role).join(',');
    expect(roles).toBe('gm,user,gm');
  });
});

describe('audit: journal recovery after a reload', () => {
  // RUNTIME_SCHEMAS §6: "if a message with the journaled variant id exists the commit is finalized, otherwise discarded".
  // commit() itself binds the interpretation to the landed text by variant id ("the host may normalize whitespace").
  async function crashAfterPublish(normalize: boolean, op: 'normal' | 'regenerate') {
    const x = await setup();
    legacyCampaign(x);
    let prior: any;
    if (op === 'regenerate') {
      expect(await turn(x, 'I look around the harbor.', 'The harbor is busy this morning. [OLD]')).toBe(true);
      await new Promise((r) => setTimeout(r, 20));
      prior = x.host.chat.pop()!;
    } else x.host.addUser('I look around the harbor.');
    x.model.draft('Fishing boats  crowd the pier. [NEW]'); // two spaces
    if (normalize) {
      const publish = x.host.publish.bind(x.host);
      x.host.publish = (req, i) => publish({ ...req, text: req.text.replace(/ {2,}/g, ' ') }, i);
    }
    // the tab dies right after the reply was published and saved with its journal
    let published = false, after = 0;
    x.host.publishHook = async () => { published = true; };
    x.host.saveDelay = async () => { if (published && ++after >= 2) throw new Error('tab closed'); };
    await x.engine.runOperation(op, op === 'regenerate' ? { message: prior } : undefined);
    x.host.saveDelay = null; x.host.publishHook = null;
    const evalsBefore = x.model.tasks('evaluate').length;
    x.host.reload();
    expect(x.host.campaignData!.pendingTransaction).toBeTruthy();
    await x.engine.onChatLoaded();
    await new Promise((r) => setTimeout(r, 20));
    return { roles: x.host.chat.map((m) => m.role).join(','), reExamined: x.model.tasks('evaluate').length - evalsBefore, recovery: x.engine.campaign()!.recoveryState.status };
  }
  it('C13 control: the reply landed as written → the journaled commit is finalized without a model', async () => {
    expect(await crashAfterPublish(false, 'normal')).toEqual({ roles: 'gm,user,gm', reExamined: 0, recovery: 'ok' });
  });
  it('C13a: the host normalized the text → the commit is finalized all the same (same variant id)', async () => {
    expect(await crashAfterPublish(true, 'normal')).toEqual({ roles: 'gm,user,gm', reExamined: 0, recovery: 'ok' });
  });
  it('C13b: the same after a regeneration → the replaced reply is not put back beside the new one', async () => {
    expect(await crashAfterPublish(true, 'regenerate')).toEqual({ roles: 'gm,user,gm', reExamined: 0, recovery: 'ok' });
  });
});

describe('audit: changes from outside a turn', () => {
  it('S3a: a chat changed under a regeneration gets nothing of it — not the reply it replaced, not its failure', async () => {
    const x = await setup();
    expect(await turn(x, 'I look around.', 'Gulls circle the harbor. [K1]', { scene_end: at(1, 9, 40) })).toBe(true);
    const chatA = x.host.chat, campA = x.host.campaignData;
    const prior = await x.host.removeLastReply(); // the host took the reply out, as a native regenerate does
    const gate = deferred();
    x.model.taskGate.draft = () => gate.promise;
    x.model.draft('Another reply. [K2]');
    const op = x.engine.runOperation('regenerate', prior);
    await new Promise((r) => setTimeout(r, 20));
    // the player opens another chat (no campaign there) while the reply is being written
    x.host.chatIdValue = 'chat-2'; x.host.integrityValue = 'int-2';
    x.host.chat = []; x.host.campaignData = null;
    x.engine.sourceChanged('chat_changed');
    const loaded = x.engine.onChatLoaded();
    gate.resolve();
    expect(await op).toBe(false);
    await loaded;
    await new Promise((r) => setTimeout(r, 20));
    expect(x.host.chat).toEqual([]);
    expect(x.host.campaignData).toBeNull();
    expect(campA!.recoveryState.status).toBe('ok');
    expect(chatA.length).toBe(2); // greeting and the player's message; nothing written after the switch
    expect(x.engine.isBusy()).toBe(false);
  });

  it('S3b: a pack update waits for the rebuild that is running, which is cancelled, and no rebuild runs across it', async () => {
    const x = await setup();
    expect(await turn(x, 'I look around.', 'Gulls circle the harbor. [K3]', { scene_end: at(1, 9, 40) })).toBe(true);
    x.host.edit(x.host.chat.length - 1, 'Gulls circle the quiet harbor, and Mira waves. [K3]'); // the reply is examined again
    const gate = deferred();
    let asked = 0;
    x.model.taskGate.evaluate = () => { asked++; return asked === 1 ? gate.promise : Promise.resolve(); };
    x.engine.sourceChanged('edit');
    const running = x.engine.reconcile('edit');
    await new Promise((r) => setTimeout(r, 20));
    expect(asked).toBe(1);
    const order: string[] = [];
    void running.then(() => order.push('rebuild ended'), () => order.push('rebuild ended'));
    const upd = x.engine.applyPackUpdate(demo.replace('"pack_version": "1.0.0"', '"pack_version": "9.0.0"')).then(() => order.push('pack updated'));
    gate.resolve();
    await upd; await running.catch(() => undefined);
    expect(order).toEqual(['rebuild ended', 'pack updated']);
    expect(x.engine.campaign()!.packVersion.startsWith('9.')).toBe(true);
    expect(x.engine.current!.replay.issue).toBeFalsy();
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
  });

  it('S3c: the same changes are refused while a reply is being made', async () => {
    const x = await setup();
    const gate = deferred();
    x.model.taskGate.draft = () => gate.promise;
    x.host.addUser('I look around.');
    x.model.draft('Gulls. [K4]');
    const op = x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 20));
    await expect(x.engine.applyPackUpdate(demo)).rejects.toThrow(/working on a reply/);
    await expect(x.engine.importBackup('{}')).rejects.toThrow(/working on a reply/);
    await expect(x.engine.setEnabled(false)).rejects.toThrow(/working on a reply/);
    gate.resolve();
    expect(await op).toBe(true);
  });
});
