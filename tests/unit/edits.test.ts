// E01–E16 (both roles, any position) and R08–R17 (races, persistence, recovery).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick, at, occ, deferred } from './fake';
import { factAt } from '../../src/domain/reducer';
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
const assertAlive = (alive: boolean, quote: string) => ({ statements: [{ kind: 'asserted_fact', quote, summary: `Mira alive=${alive}`, entities: ['mira'], facts: [{ entity_id: 'mira', predicate: 'alive', value: alive }], event_id: null, time: null, ambiguous: false }] });

describe('edits and deletions of both roles', () => {
  it('E01 editing an old user assertion replaces its evidence and revalidates dependents', async () => {
    const x = await setup(tick(0, 8));
    x.model.on('extract_user', (i) => i.message.includes('alive and well'), assertAlive(true, 'Mira is alive and well'));
    x.model.on('extract_user', (i) => i.message.includes('lies dead'), assertAlive(false, 'Mira lies dead'));
    await turn(x, 'Mira is alive and well.', 'You see Mira at the clinic. [E1a]', { state_claims: [{ entity_id: 'mira', predicate: 'alive', value: true, quote: 'You see Mira at the clinic' }] });
    expect(factAt(st(x), 'mira', 'alive').supportRecordId).toBeTruthy();
    x.host.edit(1, 'Mira lies dead in the street.');
    x.model.on('evaluate', (i) => i.mode === 'retained' && String(i.candidate).includes('[E1a]'), { decision: 'conflict', violations: [{ code: 'state', quote: 'You see Mira at the clinic', detail: 'Mira is dead in the edited history' }] });
    await x.engine.reconcile('edit');
    const c = x.engine.campaign()!;
    expect(c.recoveryState.status).toBe('conflict');
    expect(c.recoveryState.messageIndex).toBe(2);
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false);
    const rec = st(x).recordById.get(factAt(st(x), 'mira', 'alive').supportRecordId!)!;
    expect(rec.sourceRefs[0].spans[0].quote).toBe('Mira lies dead');
  });

  it('E02 deleting the user rescue leaves no phantom rescue and exposes the retained GM text', async () => {
    const x = await setup();
    await turn(x, 'I pull Mira out of the ambush.', 'You drag Mira clear; she lives. [E2a]', { scene_end: at(1, 10, 5), player_actions: [{ quote: 'You drag Mira clear', authorized_by_quote: 'I pull Mira out of the ambush' }], occurrences: [occ('o1', 'Ambush of Mira', 'You drag Mira clear', { pack_event_id: 'medic-ambush', disposition: 'diverged', origin: 'player' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'she lives', occurrence_ref: 'o1' }] });
    x.host.remove(1);
    x.model.on('evaluate', (i) => i.mode === 'retained', { decision: 'conflict', violations: [{ code: 'agency', quote: 'You drag Mira clear', detail: 'no authorizing user action remains' }] });
    await x.engine.reconcile('delete');
    expect(x.engine.campaign()!.recoveryState.status).toBe('conflict');
    expect(st(x).dispositions.has('medic-ambush')).toBe(false);
    expect(x.host.chat.some((m) => m.text.includes('[E2a]'))).toBe(true); // text preserved
  });

  it('E03 editing an old GM reply to remove a death removes the death and dependent facts', async () => {
    const x = await setup();
    await turn(x, 'I watch.', 'A bolt strikes Mira; she dies. [E3a]', { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'she dies', { pack_event_id: 'medic-ambush', disposition: 'occurred' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false, quote: 'she dies', occurrence_ref: 'o1' }] });
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false);
    x.host.edit(2, 'A bolt misses Mira; she runs away unhurt. [E3b]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[E3b]'), { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'she runs away unhurt', { pack_event_id: 'medic-ambush', disposition: 'diverged' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'she runs away unhurt', occurrence_ref: 'o1' }] });
    await x.engine.reconcile('edit');
    expect(factAt(st(x), 'mira', 'alive').value).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
  });

  it('E05 deleting the latest user message is detected and invalidates its provenance and any outstanding request', async () => {
    const x = await setup();
    x.model.on('extract_user', (i) => i.message.includes('storm'), { statements: [{ kind: 'asserted_fact', quote: 'the planet is gone', summary: 'world gone', entities: ['planet'], facts: [{ entity_id: 'planet', predicate: 'exists', value: false }], event_id: null, time: null, ambiguous: false }] });
    x.host.addUser('A storm rises and the planet is gone.');
    await x.engine.reconcile('send');
    expect(factAt(st(x), 'planet', 'exists').value).toBe(false);
    x.host.remove(1);
    await x.engine.reconcile('delete');
    expect(factAt(st(x), 'planet', 'exists').value).toBe(true);
  });

  it('E06 content-only edit with identical counts is detected by hash; E09 an irrelevant wording change keeps compatible facts', async () => {
    const x = await setup();
    await turn(x, 'I look at the sea.', 'Waves roll. [E6a]', {});
    const rev = x.engine.campaign()!.revision;
    const extractBefore = x.model.tasks('extract_user').length;
    x.host.edit(1, 'I look at the sea calmly.');
    await x.engine.reconcile('edit');
    expect(x.engine.campaign()!.revision).toBeGreaterThan(rev);
    expect(x.model.tasks('extract_user').length).toBe(extractBefore + 1);
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok'); // compatible: no forced plot event
  });

  it('E04/E07 bulk deletion of a middle/suffix range rebuilds before the earliest removed source; indexes do not inherit facts', async () => {
    const x = await setup(tick(0, 8));
    await turn(x, 'I sleep for two days.', 'You wake on day two at ten. [E7a]', { scene_end: at(2, 10) });
    await turn(x, 'I go out.', 'Smoke everywhere. [E7b]', {});
    expect(st(x).dispositions.get('conflict-begins')?.disposition).toBe('occurred');
    x.host.chat.splice(1, 4);
    await x.engine.reconcile('bulk');
    expect(st(x).dispositions.size).toBe(0);
    expect(st(x).clock.lo).toBe(tick(0, 8));
    expect(x.engine.campaign()!.ledgerRecords.every((r) => r.commitId === 'bootstrap' || r.sourceRefs.length === 0 || x.host.chat.some((m) => m.mid === r.sourceRefs[0]?.messageId))).toBe(true);
  });

  it('E08 deleting the first message rebuilds from the binding seed', async () => {
    const x = await setup();
    await turn(x, 'Hello.', 'Hi. [E8a]', {});
    x.host.remove(0);
    await x.engine.reconcile('delete-first');
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
    expect(x.engine.current!.replay.ledger.filter((r) => r.commitId === 'bootstrap').length).toBe(x.engine.campaign()!.bootstrapRecords.length);
  });

  it('E10 a surviving independent message keeps support; E11 a mere recollection of a deleted event is not independent evidence', async () => {
    const x = await setup(tick(0, 8));
    x.model.on('extract_user', (i) => i.message.includes('[S1]'), assertAlive(false, 'Mira is dead [S1]'));
    x.model.on('extract_user', (i) => i.message.includes('[S2]'), assertAlive(false, 'Mira is dead [S2]'));
    x.host.addUser('Mira is dead [S1]');
    x.host.addUser('Mira is dead [S2]');
    await x.engine.reconcile('x');
    x.host.remove(1);
    await x.engine.reconcile('delete');
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false); // still supported by [S2]
    // E11: deleting the only source; a later GM recollection is evaluated, not treated as support
    const y = await setup(tick(0, 8));
    y.model.on('extract_user', (i) => i.message.includes('[R1]'), assertAlive(false, 'Mira is dead [R1]'));
    y.host.addUser('Mira is dead [R1]');
    await y.engine.reconcile('x');
    await turn(y, 'I mourn.', 'You remember Mira, who died. [R2]', { state_claims: [{ entity_id: 'mira', predicate: 'alive', value: false, quote: 'You remember Mira, who died' }] });
    y.host.remove(1);
    y.model.on('evaluate', (i) => i.mode === 'retained', { decision: 'conflict', violations: [{ code: 'state', quote: 'You remember Mira, who died', detail: 'recollection without a surviving source' }] });
    await y.engine.reconcile('delete');
    expect(factAt(st(y), 'mira', 'alive').value).toBe(true);
    expect(y.engine.campaign()!.recoveryState.status).toBe('conflict');
  });

  it('E12/E13 contradictory suffix is preserved and located; editing the identified reply clears recovery', async () => {
    const x = await setup();
    await turn(x, 'I save Mira.', 'You save Mira. [C1]', { scene_end: at(1, 10, 5), player_actions: [{ quote: 'You save Mira', authorized_by_quote: 'I save Mira' }], occurrences: [occ('o1', 'Ambush of Mira', 'You save Mira', { pack_event_id: 'medic-ambush', disposition: 'diverged', origin: 'player' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'You save Mira', occurrence_ref: 'o1' }] });
    x.host.edit(1, 'I leave.');
    x.model.on('evaluate', (i) => i.mode === 'retained' && String(i.candidate).includes('[C1]'), { decision: 'conflict', violations: [{ code: 'agency', quote: 'You save Mira', detail: 'unauthorized rescue' }] });
    await x.engine.reconcile('edit');
    expect(x.engine.campaign()!.recoveryState.status).toBe('conflict');
    expect(x.host.chat.length).toBe(3);
    x.host.addUser('I walk on.');
    expect(await x.engine.runOperation('normal')).toBe(false); // frozen
    x.host.chat.pop();
    x.host.edit(2, 'You leave; the ambush happens behind you. [C2]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[C2]'), { scene_end: at(1, 10, 5) });
    await x.engine.reconcile('fix');
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
  });

  it('E12b agency loss after an edit is a deterministic conflict even if the reviewer says "retain"', async () => {
    const x = await setup();
    await turn(x, 'I save Mira.', 'You pull Mira to safety. [AG1]', { scene_end: at(1, 10, 5), player_actions: [{ quote: 'You pull Mira to safety', authorized_by_quote: 'I save Mira' }], occurrences: [occ('o1', 'Ambush of Mira', 'You pull Mira to safety', { pack_event_id: 'medic-ambush', disposition: 'diverged', origin: 'player' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'You pull Mira to safety', occurrence_ref: 'o1' }] });
    x.host.edit(1, 'I walk away.');
    // the reviewer (wrongly) keeps the reply and still cites the old authorization
    x.model.on('evaluate', (i) => i.mode === 'retained' && String(i.candidate).includes('[AG1]'), { decision: 'retain', player_actions: [{ quote: 'You pull Mira to safety', authorized_by_quote: 'I save Mira' }] });
    await x.engine.reconcile('edit');
    expect(x.engine.campaign()!.recoveryState.status).toBe('conflict');
    expect(x.engine.campaign()!.recoveryState.reason).toMatch(/not authorized by the edited user message/);
  });

  it('E14/R05 branching copies the shared prefix under a new branch identity and isolates later state', async () => {
    const x = await setup();
    await turn(x, 'I look.', 'Nothing. [B0]', {});
    const parent = JSON.parse(JSON.stringify(x.engine.campaign()));
    x.host.chatIdValue = 'chat-1 - Branch #1';
    x.host.integrityValue = 'int-2';
    await x.engine.onChatLoaded();
    const c = x.engine.campaign()!;
    expect(c.branchId).not.toBe(parent.branchId);
    expect(c.parentBranch).toBe(parent.branchId);
    expect(c.planRevisions.every((p) => p.status !== 'active')).toBe(true);
  });

  it('R04 deleting a swipe then generating another at the same index does not transfer its effects', async () => {
    const x = await setup();
    const evA = { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'Mira survives', { pack_event_id: 'medic-ambush', disposition: 'diverged' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira survives', occurrence_ref: 'o1' }] };
    const evB = { scene_end: at(1, 10, 5), occurrences: [occ('o1', 'Ambush of Mira', 'Mira dies', { pack_event_id: 'medic-ambush', disposition: 'occurred' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false, quote: 'Mira dies', occurrence_ref: 'o1' }] };
    await turn(x, 'I watch the ambush.', 'Mira survives. [SA]', evA);
    x.model.draft('Mira dies. [SB]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[SB]'), evB);
    expect(await x.engine.runOperation('swipe')).toBe(true);
    expect(factAt(st(x), 'mira', 'alive').value).toBe(false);
    // delete swipe B (index 1) natively: ST removes it and selects swipe A
    const m = x.host.chat[2];
    m.swipes!.splice(1, 1);
    x.host.selectSwipe(2, 0);
    x.engine.sourceChanged('swipe_deleted');
    await x.engine.reconcile('swipe_deleted');
    expect(factAt(st(x), 'mira', 'alive').value).toBe(true);
    // a new swipe C at the same numeric index 1 starts clean
    x.model.draft('The bolt misses; Mira hides. [SC]');
    x.model.on('evaluate', (i) => String(i.candidate).includes('[SC]'), { ...evA, occurrences: [occ('o1', 'Ambush of Mira', 'Mira hides', { pack_event_id: 'medic-ambush', disposition: 'diverged' })], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira hides', occurrence_ref: 'o1' }] });
    expect(await x.engine.runOperation('swipe')).toBe(true);
    expect(x.host.chat[2].swipes!.length).toBe(2);
    expect(factAt(st(x), 'mira', 'alive').value).toBe(true);
    expect(st(x).dispositions.get('medic-ambush')?.disposition).toBe('diverged');
    const vids = x.host.chat[2].swipes!.map((s) => s.vid);
    expect(new Set(vids).size).toBe(2);
  });

  it('P17 binding outside coverage is refused; advancing past coverage invents no canon and shows a notice', async () => {
    const x = makeEngine();
    await expect(x.engine.bind(demo, { startTick: tick(9, 0), mode: 'new' })).rejects.toThrow(/outside the pack coverage/);
    const y = await setup(tick(5, 23));
    await turn(y, 'I wait two days.', 'Two days pass. [CV1]', { scene_end: at(7, 12) });
    await turn(y, 'I look around.', 'Quiet streets. [CV2]', {});
    expect(y.engine.notices.some((n) => /coverage ended/i.test(n.text))).toBe(true);
    expect(String(y.model.tasks('draft').slice(-1)[0].input.engineContext)).toMatch(/PACK COVERAGE ENDED/);
  });

  it('R06 renaming a chat keeps campaign identity (no false branch)', async () => {
    const x = await setup();
    const b = x.engine.campaign()!.branchId;
    x.host.chatIdValue = 'renamed chat';
    await x.engine.onChatLoaded();
    expect(x.engine.campaign()!.branchId).toBe(b);
    expect(x.engine.campaign()!.chatId).toBe('renamed chat');
  });
});

describe('races, persistence and recovery', () => {
  it('R08 an edit during each async phase fails the fences before commit (delayed promises)', async () => {
    for (const phase of ['plan', 'draft', 'discover', 'evaluate'] as const) {
      const x = await setup();
      x.host.addUser('I look around.');
      const gate = deferred();
      let entered = false;
      x.model.taskGate[phase] = async () => { if (!entered) { entered = true; await gate.promise; } };
      const op = x.engine.runOperation('normal');
      await new Promise((r) => setTimeout(r, 30));
      expect(entered).toBe(true);
      x.host.edit(1, 'I look around nervously.');
      x.engine.sourceChanged('edit'); // native MESSAGE_EDITED
      gate.resolve();
      expect(await op).toBe(false);
      expect(x.host.chat.filter((m) => m.role === 'gm').length).toBe(1); // only the greeting
    }
  });

  it('R08 cancellation failure is irrelevant: a late draft for an edited source cannot commit even if not aborted', async () => {
    const x = await setup();
    x.host.addUser('I look.');
    const gate = deferred();
    x.model.taskGate.draft = () => gate.promise;
    const op = x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 30));
    x.host.edit(1, 'I look (edited).'); // no sourceChanged call: the event was "missed"
    gate.resolve();
    expect(await op).toBe(false); // manifest/fingerprint fence still catches it
  });

  it('R09 two rapid generations: one serialized operation, the second is refused', async () => {
    const x = await setup();
    x.host.addUser('I look.');
    const gate = deferred();
    x.model.taskGate.draft = () => gate.promise;
    const a = x.engine.runOperation('normal');
    await new Promise((r) => setTimeout(r, 30));
    const b = await x.engine.runOperation('normal');
    expect(b).toBe(false);
    gate.resolve();
    expect(await a).toBe(true);
    expect(x.host.chat.filter((m) => m.role === 'gm').length).toBe(2);
  });

  it('R10 duplicate lifecycle notifications are idempotent', async () => {
    const x = await setup();
    await turn(x, 'I look.', 'Waves. [D1]', { occurrences: [occ('o1', 'Waves', 'Waves')] });
    const n = st(x).occurrences.size;
    const retainedBefore = x.model.tasks('evaluate').filter((c) => c.input.mode === 'retained').length;
    await x.engine.reconcile('dup');
    await x.engine.reconcile('dup');
    expect(st(x).occurrences.size).toBe(n);
    expect(x.model.tasks('evaluate').filter((c) => c.input.mode === 'retained').length).toBe(retainedBefore);
  });

  it('R11 save failure after preparation: no success claim; journal kept; recovery on reload', async () => {
    const x = await setup();
    x.host.addUser('I look.');
    x.model.draft('Waves crash. [F1]');
    x.host.publishHook = async () => { x.host.failNextSaves = 5; }; // the publish save (and immediate re-saves) fail
    expect(await x.engine.runOperation('normal')).toBe(false);
    expect(x.engine.campaign()!.recoveryState.status).toBe('unsaved');
    expect(x.engine.status.phase).toBe('error');
    expect(x.host.persisted.chat.some((m) => m.text.includes('[F1]'))).toBe(false); // nothing claimed durable
    x.host.publishHook = null;
    x.host.failNextSaves = 0;
    await x.engine.retry(); // Retry saves again
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
    expect(x.host.persisted.chat.some((m) => m.text.includes('[F1]'))).toBe(true);
  });

  it('R12 crash at the commit boundary recovers one coherent revision', async () => {
    // (a) crash after the reply landed durably with the journal, before the engine delta was saved
    const x = await setup();
    x.host.addUser('I look.');
    x.model.draft('Gulls. [K1]');
    let n = 0;
    x.host.saveDelay = async () => { n++; if (n === 3) throw new Error('crash'); }; // 1 reconcile, 2 publish+journal, 3 engine delta
    await x.engine.runOperation('normal');
    x.host.saveDelay = null;
    x.host.reload();
    expect(x.host.campaignData!.pendingTransaction).not.toBeNull();
    await x.engine.reconcile('reload');
    expect(x.engine.campaign()!.pendingTransaction).toBeNull();
    expect(x.engine.current!.replay.applied.some((a) => a.interp.commitId === x.engine.campaign()!.acceptedHead)).toBe(true);
    // (b) crash before the reply landed: journal discarded, no partial state
    const y = await setup();
    y.host.addUser('I look.');
    y.engine.campaign()!.pendingTransaction = { commitId: 'cmt_x', operationId: 'op', predecessorRevision: 1, sourceFingerprint: 'f', targetHash: 'h', opType: 'normal', interpretation: { key: 'm:v:h', messageId: 'm', variantId: 'var_never', contentHash: 'h', role: 'gm', commitId: 'cmt_x', createdAt: 0, origin: 'engine_commit', records: [], intents: [], stateClaims: [], playerActions: [], dependsOn: [], sceneEnd: null, flashback: false, sceneEntities: [], offscreenBasis: [], warnings: [] }, phase: 'prepared' };
    await y.engine.reconcile('reload');
    expect(y.engine.campaign()!.pendingTransaction).toBeNull();
    expect(y.engine.campaign()!.acceptedHead).not.toBe('cmt_x');
  });

  it('R13 backup export/import restores the campaign without browser-only data', async () => {
    const x = await setup();
    await turn(x, 'I look.', 'Waves. [U1]', { occurrences: [occ('o1', 'Waves seen', 'Waves')] });
    const backup = x.engine.exportBackup();
    const facts = JSON.stringify([...st(x).facts.keys()]);
    x.host.campaignData = null;
    const r = await x.engine.importBackup(backup);
    expect(r.matchedMessages).toBe(x.host.chat.length);
    expect(JSON.stringify([...st(x).facts.keys()])).toBe(facts);
    expect(st(x).occurrences.size).toBeGreaterThan(0);
  });

  it('R15 a non-writer tab neither saves nor generates; a chat switch during reconciliation adopts nothing', async () => {
    const x = await setup();
    x.host.writer = false;
    const saves = x.host.saves;
    x.host.addUser('I look.');
    await x.engine.reconcile('read-only');
    expect(x.host.saves).toBe(saves);
    expect(await x.engine.runOperation('normal')).toBe(false);
    x.host.writer = true;
    // chat switch while a model call inside reconcile is pending
    const gate = deferred();
    x.model.taskGate.extract_user = () => gate.promise;
    x.host.addUser('Another message.');
    const p = x.engine.reconcile('switch').catch((e) => e.kind);
    await new Promise((r) => setTimeout(r, 20));
    const savesBefore = x.host.saves;
    x.host.chatIdValue = 'other-chat';
    gate.resolve();
    expect(await p).toBe('stale_response');
    expect(x.host.saves).toBe(savesBefore);
  });

  it('operational errors persist across rebuilds until Retry or a successful turn', async () => {
    const x = await setup();
    x.model.failTask.draft = 1;
    x.host.addUser('I look.');
    expect(await x.engine.runOperation('normal')).toBe(false);
    await x.engine.reconcile('post');
    expect(x.engine.campaign()!.recoveryState.status).toBe('error');
    expect(x.engine.status.phase).toBe('error');
    x.model.draft('Waves. [OK1]');
    await x.engine.retry();
    expect(x.engine.campaign()!.recoveryState.status).toBe('ok');
    expect(x.host.chat.slice(-1)[0].text).toContain('[OK1]');
  });

  it('R16 the bound snapshot is unchanged when the source pack changes; updates need explicit review', async () => {
    const x = await setup();
    const hash = x.engine.campaign()!.packHash;
    const changed = JSON.parse(demo);
    changed.events[4].outcomes[1].value = 'council';
    changed.events[4].canonical_effects[1].fact.value = 'council';
    changed.events[4].required_description = 'The conflict ends with the Council victorious.';
    changed.pack_version = '1.1.0';
    expect(x.engine.campaign()!.packHash).toBe(hash);
    const d = x.engine.diffPack(JSON.stringify(changed));
    expect(d.hardChanged).toContain('conflict-ends');
    await x.engine.applyPackUpdate(JSON.stringify(changed));
    expect(x.engine.campaign()!.packHash).not.toBe(hash);
    expect(x.engine.campaign()!.configRevisions.some((r) => /pack updated/.test(r.summary))).toBe(true);
  });

  it('R17 a failed regeneration restores the prior selected reply; user input preserved', async () => {
    const x = await setup();
    await turn(x, 'I look.', 'Waves. [P1]', {});
    const prior = x.host.chat.pop()!; // native regenerate removed it
    x.model.failTask.draft = 1;
    expect(await x.engine.runOperation('regenerate', { message: prior })).toBe(false);
    expect(x.host.chat.slice(-1)[0].text).toContain('[P1]');
  });
});
