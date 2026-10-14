/**
 * Real SillyTavern + Horae integration proof (M0 / acceptance I01–I13, lifecycle R/E cases, W20).
 * Prereqs: ST at ST_URL with this extension installed (third-party), Horae fork installed,
 * mock server: node tests/e2e/mockServer.mjs 5555.  Run: node tests/e2e/integration.mjs [section...]
 * Writes tests/e2e/out/integration-results.json.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openST, connect, newChat, packText, bind, send, chat, campaign, engineState, mock, mainLogs, taskLogs, auxLogs, logs, promptText, check, waitIdle, sleep, ROOT } from './lib.mjs';

const results = [];
const only = process.argv.slice(2);
const want = (s) => !only.length || only.includes(s);
const D = (day, h, m = 0) => ({ day, minute: h * 60 + m });
const tick = (day, h, m = 0) => day * 1440 + h * 60 + m;
const rule = (task, match, patch, extra = {}) => ({ task, match, patch, ...extra });
const section = (text, start, end) => { const i = text.indexOf(start); if (i < 0) return ''; const j = text.indexOf(end, i + start.length); return text.slice(i, j < 0 ? undefined : j); };
const HIST = (p) => section(p, 'ACTUAL HISTORY (retrieved', 'ENTITY / SCENE STATE');
const STATE = (p) => section(p, 'ENTITY / SCENE STATE', '\n\n');

const { browser, context, page, consoleLines } = await launch();
async function freshChat(pack = 'demo.canon.json', start = tick(0, 8)) {
  await mock('/control', { mainQueue: [], mainRules: [], taskRules: [], auxRules: [], mainDelayMs: 0, taskDelayMs: 0, auxDelayMs: 0, malformedNext: {}, clearLogs: true });
  await newChat(page);
  await bind(page, packText(pack), start);
  await mock('/control', { clearLogs: true });
}
const lastAi = async () => (await chat(page)).filter((m) => !m.is_user && !m.is_system).slice(-1)[0];
async function editMessage(idx, text) {
  await page.evaluate(async ({ idx, text }) => {
    const el = document.querySelector(`#chat .mes[mesid="${idx}"]`);
    el.querySelector('.mes_edit').click();
    await new Promise((r) => setTimeout(r, 400));
    const ta = document.querySelector('#curEditTextarea');
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector(`#chat .mes[mesid="${idx}"] .mes_edit_done`).click();
  }, { idx, text });
  await sleep(1200);
  await waitIdle(page);
}
async function deleteMessage(idx) {
  await page.evaluate(async (idx) => { await SillyTavern.getContext().deleteMessage(idx); }, idx);
  await sleep(1200);
  await waitIdle(page);
}

try {
  await mock('/reset', {});
  await openST(page);
  const U = await page.evaluate(() => SillyTavern.getContext().name1);

  // ---------------------------------------------------------------------------------------------
  if (want('S1')) {
    console.log('\n== S1 native send, prompt preservation, isolation, publication ==');
    await freshChat();
    await page.evaluate(async () => {
      const c = SillyTavern.getContext();
      c.powerUserSettings.persona_description = 'PERSONA_MARKER_5512 a wandering cartographer';
      await c.executeSlashCommandsWithOptions('/note AN_MARKER_7731');
    });
    const streamBefore = await page.evaluate(() => SillyTavern.getContext().chatCompletionSettings.stream_openai);
    await mock('/control', { mainQueue: ['晨雾笼罩着森林边缘的小屋，Seraphina 为你端来热茶。你打算怎么做？'], auxRules: [{ match: '端来热茶', response: '<horae>\ntime:2004/2/1 08:10\nlocation:森林小屋\n</horae>' }], clearLogs: true });
    const before = (await chat(page)).length;
    await send(page, '我望向窗外的 forest，问她这里安全吗？');
    const after = await chat(page);
    const ml = await mainLogs();
    const p = ml[0] ? promptText(ml[0]) : '';
    check(results, 'I01 draft uses ST full prompt: card + persona + Author\'s Note + keyword lore + Horae + engine context', ml.length === 1 && p.includes('Seraphina') && p.includes('PERSONA_MARKER_5512') && p.includes('AN_MARKER_7731') && p.includes('What is Eldoria') && p.includes('[CANON ENGINE CONTEXT') && p.includes('Current State Snapshot'), `main=${ml.length}`);
    check(results, 'I09 private draft request is not streamed; global streaming setting untouched', ml[0] && ml[0].stream === false && streamBefore === true && (await page.evaluate(() => SillyTavern.getContext().chatCompletionSettings.stream_openai)) === true);
    const tl = await taskLogs();
    check(results, 'I08 internal tasks are isolated (2 messages; no card/AN/lore/Horae injection; Persona only as an explicit extractor input; no recursive story turn)', tl.length >= 3 && tl.every((t) => t.messages.length === 2 && !promptText(t).includes("Seraphina's Personality") && !promptText(t).includes('AN_MARKER_7731') && !promptText(t).includes('What is Eldoria') && !promptText(t).includes('Current State Snapshot')) && tl.filter((t) => promptText(t).includes('PERSONA_MARKER_5512')).every((t) => t.task === 'extract_user' && JSON.stringify(t.input.persona).includes('PERSONA_MARKER_5512')) && ml.length === 1, tl.map((t) => `${t.task}:${t.messages.length}`).join(','));
    check(results, 'I03 accepted reply published once through native lifecycle', after.length === before + 2 && after[after.length - 1].ce?.commitId && after.filter((m) => m.mes?.includes('端来热茶')).length === 1);
    await page.waitForFunction(() => { const c = SillyTavern.getContext().chat; return c[c.length - 1]?.horae_meta?._bg?.status; }, null, { timeout: 30000 }).catch(() => {});
    const al = await auxLogs();
    check(results, 'I03 Horae analyzes only the accepted text', al.length >= 1 && al.every((a) => a.story.includes('端来热茶')), al.map((a) => a.story.slice(0, 30)).join('|'));
    await page.evaluate(async () => { await SillyTavern.getContext().executeSlashCommandsWithOptions('/note'); });
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S2')) {
    console.log('\n== S2 rejected draft isolation (sentinel) ==');
    await freshChat();
    await mock('/control', {
      mainQueue: ['塔楼轰然倒塌。SENTINEL_EVENT_42 烟尘四起。', '风吹过林间，一切如常。你要做什么？'],
      taskRules: [rule('evaluate', 'SENTINEL_EVENT_42', { decision: 'repair', violations: [{ code: 'sentinel', quote: 'SENTINEL_EVENT_42', detail: 'sentinel event must be rejected' }] })],
      clearLogs: true,
    });
    await send(page, '我在林间散步。');
    await page.waitForFunction(() => { const c = SillyTavern.getContext().chat; return c[c.length - 1]?.horae_meta?._bg?.status; }, null, { timeout: 30000 }).catch(() => {});
    await sleep(1500);
    const all = JSON.stringify(await page.evaluate(() => SillyTavern.getContext().chat));
    const camp = await campaign(page);
    check(results, 'I02 sentinel absent from chat and Horae metadata', !all.includes('SENTINEL_EVENT_42'));
    check(results, 'I02 sentinel absent from the active ledger and stored manifests', !JSON.stringify(camp.ledgerRecords).includes('SENTINEL') && !JSON.stringify(camp.manifests).includes('SENTINEL') && !JSON.stringify(camp.interpretations).includes('SENTINEL'));
    const al = await auxLogs();
    const emb = (await logs()).filter((l) => l.type === 'embed');
    check(results, 'I02 sentinel never reached Horae analysis or vector embedding', !al.some((a) => JSON.stringify(a.messages).includes('SENTINEL')) && !emb.some((e) => JSON.stringify(e.input).includes('SENTINEL')), `aux=${al.length} embed=${emb.length}`);
    const repairPrompt = (await mainLogs())[1];
    check(results, 'I02 repair request is private and cites the violation', !!repairPrompt && promptText(repairPrompt).includes('sentinel event must be rejected'));
    await mock('/control', { mainQueue: ['你继续前行。'], clearLogs: true });
    await send(page, '我继续走。');
    const next = (await mainLogs())[0];
    check(results, 'I02 sentinel absent from the next real prompt', !!next && !promptText(next).includes('SENTINEL'));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S3')) {
    console.log('\n== S3 swipe / select swipe / regenerate / continue / cancel ==');
    await freshChat('demo.canon.json', tick(1, 9, 30));
    const ambush = (disp, alive, quote) => ({
      scene_end: { lo: D(1, 10, 5), hi: D(1, 10, 5), precision: 'minute' },
      occurrences: [{ ref: 'o1', title: 'Ambush of Mira', account: alive ? 'The ambush happened; the player shielded Mira and she survived.' : 'The ambush happened; Mira was killed.', actors: ['mira', 'council'], affected: ['mira'], locations: ['harbor'], time: null, causes: [], quote, pack_event_id: 'medic-ambush', disposition: disp, ref_phrases: ['the ambush'], visibility: 'public', knowers: [], origin: alive ? 'player' : 'gm' }],
      transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: alive, quote, occurrence_ref: 'o1' }],
    });
    await mock('/control', {
      mainQueue: ['伏击者的弩箭擦过你的肩头，Mira 在你身后安然无恙。VARIANT_A'],
      taskRules: [
        rule('evaluate', 'VARIANT_A', ambush('diverged', true, 'Mira 在你身后安然无恙')),
        rule('evaluate', 'VARIANT_B', ambush('occurred', false, '弩箭穿透了 Mira 的胸口')),
        rule('evaluate', 'VARIANT_C', ambush('diverged', true, 'Mira 被你护在身后')),
      ],
      clearLogs: true,
    });
    await send(page, '我挡在 Mira 身前，保护她躲开伏击。');
    let st = await engineState(page);
    check(results, 'R01 swipe A committed: Mira alive, ambush diverged', st.facts['mira|alive'] === true && st.dispositions['medic-ambush'] === 'diverged', JSON.stringify(st.dispositions));
    // native overswipe -> managed swipe
    await mock('/control', { mainQueue: ['弩箭穿透了 Mira 的胸口，她倒在你怀里。VARIANT_B'], clearLogs: true });
    await page.evaluate(async () => { await SillyTavern.getContext().swipe.right(); });
    await sleep(800);
    await waitIdle(page);
    let msgs = await chat(page);
    let last = msgs[msgs.length - 1];
    const swipePrompt = (await mainLogs())[0];
    check(results, 'Swipe: new variant generated privately and published as swipe #2 with new variant id', last.swipes === 2 && last.swipe_id === 1 && last.mes.includes('VARIANT_B'), `swipes=${last.swipes} id=${last.swipe_id}`);
    check(results, 'Swipe: replaced reply is not in the new candidate prompt', !!swipePrompt && !promptText(swipePrompt).includes('VARIANT_A'));
    st = await engineState(page);
    check(results, 'R01 swipe B selected: Mira dead', st.facts['mira|alive'] === false && st.dispositions['medic-ambush'] === 'occurred');
    await mock('/control', { clearLogs: true });
    await page.evaluate(async () => { await SillyTavern.getContext().swipe.left(); });
    await sleep(1000);
    await waitIdle(page);
    st = await engineState(page);
    const tlSwitch = await taskLogs();
    check(results, 'R01 switching back to swipe A restores its state without model calls', st.facts['mira|alive'] === true && st.dispositions['medic-ambush'] === 'diverged' && tlSwitch.length === 0, `tasks=${tlSwitch.length}`);
    // regenerate
    await mock('/control', { mainQueue: ['Mira 被你护在身后，伏击者仓皇撤退。VARIANT_C'], clearLogs: true });
    await page.evaluate(() => document.querySelector('#option_regenerate').click());
    await sleep(800);
    await waitIdle(page);
    msgs = await chat(page);
    last = msgs[msgs.length - 1];
    const regenPrompt = (await mainLogs())[0];
    check(results, 'R02 regenerate replaces the reply; old variants are not in the candidate prompt', last.mes.includes('VARIANT_C') && last.swipes === 1 && !!regenPrompt && !promptText(regenPrompt).includes('VARIANT_A') && !promptText(regenPrompt).includes('VARIANT_B'));
    st = await engineState(page);
    check(results, 'R02 regenerated reply starts from the pre-response world (one ambush disposition)', st.dispositions['medic-ambush'] === 'diverged' && st.occurrences.filter((o) => o.packEventId === 'medic-ambush').length === 1);
    // continue
    await mock('/control', { mainQueue: ['她低声向你道谢。CONT_D'], taskRules: [rule('evaluate', 'CONT_D', ambush('diverged', true, 'Mira 被你护在身后'))], clearLogs: true });
    await page.evaluate(() => document.querySelector('#option_continue').click());
    await sleep(800);
    await waitIdle(page);
    msgs = await chat(page);
    last = msgs[msgs.length - 1];
    const evalInputs = (await taskLogs('evaluate')).map((t) => t.input.candidate);
    st = await engineState(page);
    check(results, 'R03 continue revises the same reply; whole revised message validated; effects not double counted', last.mes.includes('VARIANT_C') && last.mes.includes('CONT_D') && evalInputs.some((c) => c.includes('VARIANT_C') && c.includes('CONT_D')) && st.occurrences.filter((o) => o.packEventId === 'medic-ambush').length === 1, last.mes);
    // cancel a regenerate -> prior reply restored
    await mock('/control', { mainDelayMs: 5000, mainQueue: ['LATE_REPLY_SHOULD_NOT_APPEAR'], clearLogs: true });
    const beforeCancel = (await chat(page)).length;
    await page.evaluate(() => document.querySelector('#option_regenerate').click());
    await sleep(1500);
    await page.evaluate(() => window.CanonEngine.engine.cancel());
    await waitIdle(page);
    await sleep(5000);
    msgs = await chat(page);
    check(results, 'R17 cancelled regenerate restores the prior reply; no empty/late message', msgs.length === beforeCancel && msgs[msgs.length - 1].mes.includes('CONT_D') && !JSON.stringify(msgs).includes('LATE_REPLY'), `len ${beforeCancel}->${msgs.length}`);
    await mock('/control', { mainDelayMs: 0 });
    // cancel a normal send -> user input preserved, no empty GM message
    await mock('/control', { mainDelayMs: 4000, mainQueue: ['LATE_NORMAL'], clearLogs: true });
    const b2 = (await chat(page)).length;
    await page.fill('#send_textarea', '我等待着。');
    await page.click('#send_but');
    await sleep(1500);
    await page.click('#mes_stop').catch(() => page.evaluate(() => window.CanonEngine.engine.cancel()));
    await waitIdle(page);
    await sleep(4500);
    msgs = await chat(page);
    check(results, 'Cancel: user message preserved, no GM message created, late result discarded', msgs.length === b2 + 1 && msgs[msgs.length - 1].is_user && !JSON.stringify(msgs).includes('LATE_NORMAL'));
    await mock('/control', { mainDelayMs: 0 });
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S4')) {
    console.log('\n== S4 edit/delete detection, timeskip rollback, reload/durability ==');
    await freshChat('demo.canon.json', tick(0, 8));
    await mock('/control', {
      mainQueue: ['你一觉睡到第二天上午，港口方向传来炮声。TIMESKIP_X'],
      taskRules: [rule('evaluate', 'TIMESKIP_X', { scene_end: { lo: D(2, 10), hi: D(2, 10), precision: 'minute' } })],
      clearLogs: true,
    });
    await send(page, '我回旅店睡觉，一直睡到后天上午。');
    let st = await engineState(page);
    check(results, 'P13/C01 timeskip adjudicates every crossed event in order (HARD begins offscreen)', st.dispositions['medic-ambush'] === 'occurred' && st.dispositions['council-broadcast'] === 'occurred' && st.dispositions['conflict-begins'] === 'occurred' && st.facts['conflict|active'] === true && st.clock.lo === tick(2, 10), JSON.stringify(st.dispositions));
    await mock('/control', { mainQueue: ['街上弥漫着硝烟。'], clearLogs: true });
    await send(page, '我走上街头。');
    const camp1 = await campaign(page);
    // E06: edit message content only (same count, same timestamps)
    await mock('/control', { clearLogs: true });
    await editMessage(3, '我小心地走上街头。');
    const tlE = await taskLogs();
    const camp2 = await campaign(page);
    check(results, 'E06 content-only edit detected by hash; user message re-extracted', camp2.revision > camp1.revision && tlE.some((t) => t.task === 'extract_user' && t.input.message === '我小心地走上街头。'), `rev ${camp1.revision}->${camp2.revision}`);
    // E04: delete the GM timeskip reply -> offscreen consequences roll back
    await mock('/control', { clearLogs: true });
    await deleteMessage(2);
    st = await engineState(page);
    check(results, 'E04 deleting the GM timeskip removes its offscreen events and time advance', !st.dispositions['conflict-begins'] && !st.dispositions['medic-ambush'] && st.clock.lo === tick(0, 8) && st.facts['conflict|active'] === false, JSON.stringify({ d: st.dispositions, c: st.clock }));
    // durability + reload
    await page.evaluate(() => { const c = SillyTavern.getContext().chatMetadata.canonEngine; c.uiPreferences.inspectorOpen = true; });
    await page.evaluate(async () => { const m = await import('/script.js'); await m.saveChat(); });
    const before = await campaign(page);
    await mock('/control', { clearLogs: true });
    const ref = await page.evaluate(() => ({ chatId: SillyTavern.getContext().getCurrentChatId(), characterId: SillyTavern.getContext().characterId }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.CanonEngine?.engine, null, { timeout: 90000 });
    await sleep(2000);
    await page.evaluate(async (ref) => {
      const ctx = SillyTavern.getContext();
      if (String(ctx.characterId) !== String(ref.characterId)) await ctx.selectCharacterById(Number(ref.characterId));
      await new Promise((r) => setTimeout(r, 1000));
      if (ctx.getCurrentChatId() !== ref.chatId) await SillyTavern.getContext().openCharacterChat(ref.chatId);
    }, ref);
    await page.waitForFunction(() => !!SillyTavern.getContext().chatMetadata?.canonEngine, null, { timeout: 60000 });
    await connect(page);
    await sleep(3000);
    await waitIdle(page);
    const afterReload = await campaign(page);
    await page.waitForSelector('#canon-inspector', { timeout: 15000 }).catch(() => {});
    const pill = await page.$eval('#canon-engine-status', (e) => getComputedStyle(e).display !== 'none').catch(() => false);
    const insp = await page.$('#canon-inspector');
    const tlR = await taskLogs();
    check(results, 'R13 metadata durable across reload (pack snapshot, hash, interpretations)', afterReload && afterReload.packHash === before.packHash && Object.keys(afterReload.interpretations).length === Object.keys(before.interpretations).length);
    check(results, 'I10 compact status and inspector preference restored after reload', pill && !!insp, `pill=${pill} insp=${!!insp}`);
    check(results, 'Deterministic replay on reload needs no model calls', tlR.length === 0, `tasks=${tlR.length}`);
    await page.evaluate(() => { const c = SillyTavern.getContext().chatMetadata.canonEngine; c.uiPreferences.inspectorOpen = false; });
    // R14: tamper the stored fingerprint + edit chat offline -> mismatch detected before trusting caches
    await page.evaluate(() => { const c = SillyTavern.getContext(); c.chat[1].mes = c.chat[1].mes + '（外部修改）'; });
    await mock('/control', { clearLogs: true });
    await page.evaluate(async () => { await window.CanonEngine.engine.reconcile('test_external_edit'); });
    const tlX = await taskLogs();
    check(results, 'R14 externally edited chat detected by manifest comparison before caches are trusted', tlX.some((t) => t.task === 'extract_user' && t.input.message.includes('外部修改')));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S5')) {
    console.log('\n== S5 actual-history retrieval in the real prompt (W05/W06/W07/W08/W09/W04/W01, W20) ==');
    await freshChat('unrelated-history.canon.json', tick(1, 7));
    await mock('/control', { mainQueue: ['你在旅店睡到了第二天清晨。TIMESKIP_M'], taskRules: [rule('evaluate', 'TIMESKIP_M', { scene_end: { lo: D(2, 8), hi: D(2, 8), precision: 'minute' } })], clearLogs: true });
    await send(page, '我在旅店睡到第二天早上。');
    let st = await engineState(page);
    const md = st.occurrences.find((o) => o.packEventId === 'market-destruction');
    check(results, 'W05 unrelated FREE market destruction adjudicated while the player was elsewhere; persists with offscreen provenance', st.facts['old-market|condition'] === 'destroyed' && md && md.origin === 'offscreen');
    // draft-only market introduction + ordinary shopping -> must be caught before publication
    await mock('/control', {
      mainQueue: ['你抄近路穿过旧市场，摊贩们正热闹地叫卖，你顺手买了一个苹果。MARKET_SHOP', '你抄近路经过旧市场，只见焦黑的断梁与瓦砾，你想起昨天信使偷走了档案室钥匙。RUINS_THEFT', '你抄近路经过旧市场，焦黑的断梁间空无一人。RUINS_OK'],
      taskRules: [
        rule('discover', 'MARKET_SHOP', { references: [{ id: 'r1', quote: '旧市场', phrase: '旧市场', ref_kind: 'place', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: ['old-market'] }], claims: [{ id: 'c1', quote: '摊贩们正热闹地叫卖', kind: 'operation', entity_phrases: ['旧市场'], assertion: 'narrator', expected: { entity_id: 'old-market', predicate: 'condition', value: 'intact' } }] }),
        rule('discover', 'RUINS_THEFT', { references: [{ id: 'r1', quote: '旧市场', phrase: '旧市场', ref_kind: 'place', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: ['old-market'] }, { id: 'r2', quote: '信使偷走了档案室钥匙', phrase: '档案室钥匙', ref_kind: 'event', mode: 'indirect', assertion: 'narrator', temporal: 'past', candidate_ids: [] }], claims: [{ id: 'c1', quote: '焦黑的断梁与瓦砾', kind: 'state', entity_phrases: ['旧市场'], assertion: 'narrator', expected: { entity_id: 'old-market', predicate: 'condition', value: 'destroyed' } }, { id: 'c2', quote: '信使偷走了档案室钥匙', kind: 'recollection', entity_phrases: ['信使', '档案室钥匙'], assertion: 'narrator', expected: null }] }),
        rule('evaluate', 'RUINS_THEFT', { claim_checks: [{ claim_id: 'c1', verdict: 'consistent', record_ids: [], note: '' }, { claim_id: 'c2', verdict: 'contradiction', record_ids: [], note: 'the courier borrowed the key with permission and returned it at 08:30; no theft' }] }),
        rule('discover', 'RUINS_OK', { references: [{ id: 'r1', quote: '旧市场', phrase: '旧市场', ref_kind: 'place', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: ['old-market'] }], claims: [{ id: 'c1', quote: '焦黑的断梁间空无一人', kind: 'state', entity_phrases: ['旧市场'], assertion: 'narrator', expected: { entity_id: 'old-market', predicate: 'condition', value: 'destroyed' } }] }),
      ],
      clearLogs: true,
    });
    await send(page, '我出发去港口找信使，抄近路。');
    const msgs = await chat(page);
    const last = msgs[msgs.length - 1];
    const evals = await taskLogs('evaluate');
    const mls = await mainLogs();
    check(results, 'W07 draft-only market + shopping rejected; accepted narration respects the ruins', last.mes.includes('RUINS_OK') && !JSON.stringify(msgs).includes('MARKET_SHOP') && !JSON.stringify(msgs).includes('RUINS_THEFT'));
    const ctx0 = evals[0]?.input.retrieved_context || '';
    check(results, 'W07 fresh lookup: evaluator received the destroyed condition and the destruction record', STATE(ctx0).includes('condition=destroyed') && /market/i.test(HIST(ctx0)), HIST(ctx0).slice(0, 300));
    check(results, 'W07 corrected history reached the repair generation prompt (before publication)', !!mls[1] && STATE(promptText(mls[1])).includes('condition=destroyed') && /market/i.test(HIST(promptText(mls[1]))));
    const h1 = HIST(evals[1]?.input.retrieved_context || '');
    check(results, 'W08/W09 repair introduced a new anecdote; it was discovered, looked up (loan + return records) and checked again', /loan|lend|lent/i.test(h1) && /return/i.test(h1) && evals.length >= 3, `evals=${evals.length} ${h1.slice(0, 300)}`);
    const camp = await campaign(page);
    const man = Object.values(camp.manifests).slice(-1)[0];
    check(results, 'W20 accepted reply carries a content-bound coverage manifest', man && man.complete && man.candidateHash && man.entries.some((e) => e.resolved.entityIds.includes('old-market')));
    // W04: mention of the loan after the return
    await mock('/control', {
      mainQueue: ['信使挠挠头：“我只是借了一会儿，半小时后就还给管理员了。”'],
      taskRules: [rule('extract_user', '借档案室钥匙', { statements: [{ kind: 'spoken_dialogue', quote: '你昨天借档案室钥匙的时候发生了什么', summary: 'asks the courier about the key loan', entities: ['courier'], facts: [], event_id: null, time: null, ambiguous: false }], references: [{ phrase: '借档案室钥匙', quote: '借档案室钥匙', kind: 'event', mode: 'direct', candidates: [] }] })],
      clearLogs: true,
    });
    await send(page, '我找到信使，问他：“你昨天借档案室钥匙的时候发生了什么？”');
    const p4 = promptText((await mainLogs())[0]);
    check(results, 'W04 mention alone retrieves both the loan and the later return into the real GM prompt', /loan|lend|lent/i.test(HIST(p4)) && /return/i.test(HIST(p4)), HIST(p4).slice(0, 500));
    // W01: player theft (runtime event), later causal retrieval without mention
    await mock('/control', {
      mainQueue: ['你趁管理员转身，把档案室钥匙藏进了口袋。THEFT_DONE', '你回到档案室门口，管理员正焦急地翻找抽屉。'],
      taskRules: [rule('evaluate', 'THEFT_DONE', {
        new_entities: [{ ref: 'pl', name: '旅人', kind: 'person', description: 'the player character', quote: '把档案室钥匙藏进了口袋' }],
        occurrences: [{ ref: 'o1', title: 'Player stole the archive key', account: 'The player secretly took the archive key while the archivist turned away.', actors: ['pl'], affected: ['archive-key', 'archivist'], locations: [], time: null, causes: [], quote: '把档案室钥匙藏进了口袋', pack_event_id: null, disposition: null, ref_phrases: ['钥匙失窃', 'the key theft'], visibility: 'secret', knowers: ['pl'], origin: 'player' }],
        transitions: [{ op: 'set', entity_id: 'archive-key', predicate: 'holder', value: 'pl', quote: '把档案室钥匙藏进了口袋', occurrence_ref: 'o1' }],
        scene_entities: ['archive-key', 'archivist'],
      })],
      clearLogs: true,
    });
    await send(page, '我趁管理员不注意，偷偷拿走他桌上的档案室钥匙。');
    st = await engineState(page);
    check(results, 'Runtime player event committed with code-assigned runtime entity id', String(st.facts['archive-key|holder']).startsWith('rt.') && st.occurrences.some((o) => o.title === 'Player stole the archive key'));
    await mock('/control', { clearLogs: true });
    await send(page, '我回到档案室门口。');
    const p5 = promptText((await mainLogs())[0]);
    check(results, 'W01 causal retrieval without mention: the player theft enters the next GM prompt', HIST(p5).includes('Player stole the archive key'), HIST(p5).slice(0, 500));
    check(results, 'W12 knowledge boundary labeled for the secret theft', /KNOWLEDGE BOUNDARIES[\s\S]*Player stole the archive key/.test(p5));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S6')) {
    console.log('\n== S6 guards: malformed JSON, extra fields, Horae diagnosis, Hard pre-set ==');
    await freshChat();
    await mock('/control', { malformedNext: { extract_user: 3 }, mainQueue: ['NEVER_SHOWN_1'], clearLogs: true });
    const b = (await chat(page)).length;
    await send(page, '我向前走。');
    let msgs = await chat(page);
    let st = await engineState(page);
    check(results, 'I13 malformed model JSON: bounded retry then actionable error; user input kept; no GM message', msgs.length === b + 1 && msgs[msgs.length - 1].is_user && st.recovery.status === 'error' && /invalid_model_json/.test(st.recovery.errorKind || ''), JSON.stringify(st.recovery));
    await mock('/control', { mainQueue: ['你向前走去。'], clearLogs: true });
    await page.evaluate(async () => { await window.CanonEngine.engine.retry(); });
    await waitIdle(page);
    msgs = await chat(page);
    check(results, 'Retry after failure completes the turn', !msgs[msgs.length - 1].is_user && msgs[msgs.length - 1].mes.includes('你向前走去'));
    // extra mutation field rejected
    await mock('/control', { mainQueue: ['议会宣布开战。PRESET_HARD', '风平浪静。'], taskRules: [rule('evaluate', 'PRESET_HARD', null, { raw: JSON.stringify({ decision: 'retain', scene_end: null, claim_checks: [], transitions: [], occurrences: [], state_claims: [], player_actions: [], violations: [], hard_checks: [], drop_anchor: 'conflict-begins' }) })], clearLogs: true });
    await send(page, '我看向港口。');
    const ev = await taskLogs('evaluate');
    msgs = await chat(page);
    check(results, 'I13/C06 extra mutation fields (drop_anchor) rejected by schema; never applied', ev.filter((e) => e.response?.includes('drop_anchor')).length >= 1 && !msgs.some((m) => m.mes?.includes('PRESET_HARD')) && (await engineState(page)).dispositions['conflict-begins'] === undefined);
    // C17: pre-setting a HARD outcome without the event
    await mock('/control', { mainQueue: ['战争状态被宣告。PRESET2', '一切如常。'], taskRules: [rule('evaluate', 'PRESET2', { transitions: [{ op: 'set', entity_id: 'conflict', predicate: 'active', value: true, quote: '战争状态被宣告', occurrence_ref: null }] })], clearLogs: true });
    await send(page, '我等待消息。');
    st = await engineState(page);
    const evs2 = await taskLogs('evaluate');
    check(results, 'C17 setting conflict.active without enacting the HARD event is rejected', st.facts['conflict|active'] === false && evs2.length >= 2 && !(await chat(page)).some((m) => m.mes?.includes('PRESET2')));
    const diag = await page.evaluate(async () => {
      const keep = window.Horae;
      window.Horae = undefined;
      const mod = window.CanonEngine.diagnoseHorae();
      window.Horae = keep;
      return mod;
    });
    check(results, 'I12 missing Horae API gives a compatibility diagnosis (no guessed private writes)', diag && diag.ok === false && diag.missing.includes('window.Horae'));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S7')) {
    console.log('\n== S7 retained-suffix conflict, recovery by edit, branch isolation ==');
    await freshChat('demo.canon.json', tick(1, 9, 30));
    await mock('/control', {
      mainQueue: ['你拉着 Mira 冲出包围，她安全了。RESCUE_G', 'Mira 低声说她看见了议会的人。MIRA_TALKS'],
      taskRules: [
        rule('evaluate', 'RESCUE_G', { scene_end: { lo: D(1, 10, 10), hi: D(1, 10, 10), precision: 'minute' }, player_actions: [{ quote: '你拉着 Mira 冲出包围', authorized_by_quote: '我把 Mira 从伏击中救出来' }], occurrences: [{ ref: 'o1', title: 'Ambush of Mira', account: 'The player pulled Mira out of the ambush; she survived.', actors: ['mira'], affected: ['mira'], locations: ['harbor'], time: null, causes: [], quote: '你拉着 Mira 冲出包围', pack_event_id: 'medic-ambush', disposition: 'diverged', ref_phrases: [], visibility: 'public', knowers: [], origin: 'player' }], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: '她安全了', occurrence_ref: 'o1' }] }, { notMatch: '"mode":"retained"' }),
        rule('evaluate', '"mode":"retained"', { decision: 'conflict', violations: [{ code: 'agency', quote: '你拉着 Mira 冲出包围', detail: 'the rescue is not authorized by the edited user message and no separate cause is described' }] }, { match: 'RESCUE_G' }),
        rule('evaluate', 'MIRA_TALKS', { state_claims: [{ entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira 低声说' }] }),
      ],
      clearLogs: true,
    });
    // note: the second rule's match is overridden by extra.match; build it explicitly
    await mock('/control', { taskRules: [
      rule('evaluate', '/"mode":"retained"[\\s\\S]*RESCUE_G|RESCUE_G[\\s\\S]*"mode":"retained"/', { decision: 'conflict', violations: [{ code: 'agency', quote: '你拉着 Mira 冲出包围', detail: 'the rescue is not authorized by the edited user message and no separate cause is described' }] }),
      rule('evaluate', 'RESCUE_G', { scene_end: { lo: D(1, 10, 10), hi: D(1, 10, 10), precision: 'minute' }, player_actions: [{ quote: '你拉着 Mira 冲出包围', authorized_by_quote: '我把 Mira 从伏击中救出来' }], occurrences: [{ ref: 'o1', title: 'Ambush of Mira', account: 'The player pulled Mira out of the ambush; she survived.', actors: ['mira'], affected: ['mira'], locations: ['harbor'], time: null, causes: [], quote: '你拉着 Mira 冲出包围', pack_event_id: 'medic-ambush', disposition: 'diverged', ref_phrases: [], visibility: 'public', knowers: [], origin: 'player' }], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: '她安全了', occurrence_ref: 'o1' }] }),
      rule('evaluate', 'MIRA_TALKS', { state_claims: [{ entity_id: 'mira', predicate: 'alive', value: true, quote: 'Mira 低声说' }] }),
    ] });
    await send(page, '我把 Mira 从伏击中救出来，带她去避难所。');
    await send(page, '我问她看到了什么。');
    let st = await engineState(page);
    check(results, 'Setup: rescue committed with authorized player action', st.facts['mira|alive'] === true && st.dispositions['medic-ambush'] === 'diverged');
    await mock('/control', { clearLogs: true });
    await editMessage(1, '我转身离开，没有干预。');
    st = await engineState(page);
    const msgs = await chat(page);
    const marker = await page.$('#chat .mes[mesid="2"] .canon-conflict');
    check(results, 'E02/E12 edited user message: retained GM rescue exposed as the first conflict; text preserved; no invented rescue', st.recovery.status === 'conflict' && st.recovery.messageIndex === 2 && msgs.length === 5 && msgs[2].mes.includes('RESCUE_G') && !!marker, JSON.stringify(st.recovery));
    await mock('/control', { mainQueue: ['NOT_ALLOWED'], clearLogs: true });
    await send(page, '我继续走。');
    const blocked = (await mainLogs()).length === 0;
    check(results, 'Advancement frozen while the conflict is unresolved (no generation)', blocked && !(await chat(page)).some((m) => m.mes?.includes('NOT_ALLOWED')));
    // delete the dangling user message created by the blocked attempt + the dependent suffix, then edit the conflicting reply
    const len = (await chat(page)).length;
    for (let i = len - 1; i >= 3; i--) await deleteMessage(i);
    await mock('/control', { taskRules: [rule('evaluate', 'EDITED_G', { scene_end: { lo: D(1, 10, 10), hi: D(1, 10, 10), precision: 'minute' }, occurrences: [{ ref: 'o1', title: 'Ambush of Mira', account: 'The ambush happened after the player left; Mira was killed.', actors: ['mira', 'council'], affected: ['mira'], locations: ['harbor'], time: null, causes: [], quote: '远处传来伏击的喧嚣', pack_event_id: 'medic-ambush', disposition: 'occurred', ref_phrases: [], visibility: 'public', knowers: [], origin: 'gm' }], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: false, quote: '远处传来伏击的喧嚣', occurrence_ref: 'o1' }] })], clearLogs: true });
    await editMessage(2, '你离开后，远处传来伏击的喧嚣。EDITED_G');
    st = await engineState(page);
    check(results, 'E13 resolving the conflict by editing the identified reply clears recovery', st.recovery.status === 'ok' && st.facts['mira|alive'] === false, JSON.stringify(st.recovery));
    // E14/R05: branch and diverge
    const parent = await campaign(page);
    const parentChat = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    await page.evaluate(async () => { const b = await import('/scripts/bookmarks.js'); await b.branchChat(1); });
    await sleep(3000);
    await waitIdle(page);
    const child = await campaign(page);
    check(results, 'R05/E14 branch gets a new branch identity and an isolated copy of the shared prefix', child && child.branchId !== parent.branchId && child.parentBranch === parent.branchId && child.sessionId === parent.sessionId);
    await mock('/control', { mainQueue: ['（分支）你停下脚步，回望伏击的方向。BRANCH_REPLY'], clearLogs: true });
    await page.evaluate(async () => { await SillyTavern.getContext().generate('normal'); });
    await sleep(800);
    await waitIdle(page);
    const childMsgs = await chat(page);
    check(results, 'E14 regenerating in the branch produces a fresh suffix', childMsgs[childMsgs.length - 1].mes.includes('BRANCH_REPLY'));
    await page.evaluate(async (id) => { await SillyTavern.getContext().openCharacterChat(id); }, parentChat);
    await sleep(3000);
    await waitIdle(page);
    const parentAfter = await chat(page);
    check(results, 'R05 parent branch unaffected by the child branch', !parentAfter.some((m) => m.mes?.includes('BRANCH_REPLY')) && parentAfter.some((m) => m.mes?.includes('EDITED_G')));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S8')) {
    console.log('\n== S8 races: chat switch during generation, second writer tab, group guard ==');
    await freshChat();
    const chatA = await page.evaluate(() => SillyTavern.getContext().getCurrentChatId());
    await mock('/control', { mainDelayMs: 5000, mainQueue: ['LATE_FOR_OTHER_CHAT'], clearLogs: true });
    await page.fill('#send_textarea', '我推开门。');
    await page.click('#send_but');
    await sleep(1500);
    await newChat(page);
    await sleep(6000);
    await waitIdle(page);
    const chatBMsgs = await chat(page);
    await page.evaluate(async (id) => { await SillyTavern.getContext().openCharacterChat(id); }, chatA);
    await sleep(3000);
    const chatAMsgs = await chat(page);
    check(results, 'R07 late result after chat switch is discarded (neither chat receives it)', !JSON.stringify(chatBMsgs).includes('LATE_FOR_OTHER_CHAT') && !JSON.stringify(chatAMsgs).includes('LATE_FOR_OTHER_CHAT'));
    await mock('/control', { mainDelayMs: 0 });
    // second tab
    const page2 = await context.newPage();
    await page2.goto((await import('./lib.mjs')).ST_URL, { waitUntil: 'domcontentloaded' });
    await page2.waitForFunction(() => !!window.CanonEngine?.engine, null, { timeout: 90000 });
    await sleep(3000);
    const charId = await page.evaluate(() => SillyTavern.getContext().characterId);
    await page2.evaluate(async ({ id, charId }) => {
      const ctx = SillyTavern.getContext();
      if (String(ctx.characterId) !== String(charId)) await ctx.selectCharacterById(Number(charId));
      await new Promise((r) => setTimeout(r, 1000));
      if (SillyTavern.getContext().getCurrentChatId() !== id) await SillyTavern.getContext().openCharacterChat(id);
    }, { id: chatA, charId });
    await sleep(2500);
    const owner2 = await page2.evaluate(() => window.CanonEngine.lock?.isOwner?.() ?? null);
    check(results, 'R15 second tab for the same campaign is not the writer', owner2 === false, `owner2=${owner2}`);
    await page2.close();
    // group guard
    const gid = await page.evaluate(async () => {
      const ctx = SillyTavern.getContext();
      const r = await fetch('/api/groups/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ name: 'CanonGroupTest', members: ['default_Seraphina.png', 'default_Assistant.png'], activation_strategy: 1, generation_mode: 0 }) });
      return (await r.json()).id;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openST(page);
    await page.evaluate(async (id) => { const gm = await import('/scripts/group-chats.js'); await gm.openGroupById(id); }, gid);
    await sleep(3000);
    const inGroup = await page.evaluate(() => SillyTavern.getContext().groupId);
    const g = await page.evaluate(async (text) => { try { await window.CanonEngine.engine.bind(text, { startTick: 480, mode: 'new' }); return 'bound'; } catch (e) { return e.message; } }, packText());
    check(results, 'I11 group chat: explicit activation guard, no enforcement claim', !!inGroup && /Group chats are not supported/.test(g), `group=${inGroup} ${g}`);
    await page.evaluate(async (id) => { await fetch('/api/groups/delete', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify({ id }) }); }, gid);
  }
  // ---------------------------------------------------------------------------------------------
  if (want('S9')) {
    console.log('\n== S9 Horae memory: existing-chat bind, stale memory after edits, freshness barrier, lore, first message ==');
    await mock('/control', { mainQueue: [], mainRules: [], taskRules: [], auxRules: [], mainDelayMs: 0, auxDelayMs: 0, auxFailNext: 0, malformedNext: {}, clearLogs: true });
    await newChat(page);
    // native play before binding (engine not active): Horae records an item
    await mock('/control', {
      mainQueue: ['你在路边的草丛里捡起了一枚银色徽章。', '你把徽章收进口袋，继续赶路。'],
      auxRules: [{ match: '银色徽章', response: `<horae>\nitem!:🏅银色徽章|刻有十字的银色徽章=${U}@口袋\n</horae>` }],
    });
    await send(page, '我在路边搜寻。');
    await page.waitForFunction(() => window.Horae.background.waitForIdle(20000), null, { timeout: 30000 }).catch(() => {});
    await send(page, '我继续赶路。');
    await page.evaluate(() => window.Horae.background.waitForIdle(20000));
    const itemsBefore = await page.evaluate(() => Object.keys(window.Horae.getLatestState()?.items || {}));
    const pbBefore = await page.evaluate(() => JSON.stringify(window.Horae.persona.getRecord()));
    await mock('/control', { clearLogs: true });
    const r = await bind(page, packText(), tick(0, 8));
    const tlBind = await taskLogs();
    const itemsAfterBind = await page.evaluate(() => Object.keys(window.Horae.getLatestState()?.items || {}));
    check(results, 'Existing chat bootstrap: all persisted messages examined once (not just the last-N context)', r.examined === 5 && tlBind.filter((t) => t.task === 'extract_user').length === 2 && tlBind.filter((t) => t.task === 'evaluate').length >= 2, `examined=${r.examined} tasks=${tlBind.map((t) => t.task).join(',')}`);
    check(results, 'I06 binding does not reset Persona/inventory/Horae state', JSON.stringify(itemsAfterBind) === JSON.stringify(itemsBefore) && itemsBefore.some((k) => k.includes('银色徽章')) && JSON.stringify(await page.evaluate(() => window.Horae.persona.getRecord())) === pbBefore, JSON.stringify(itemsBefore));
    // I04 (exclusion path): edit the GM reply that produced the item; Horae re-analysis fails
    await mock('/control', { auxFailNext: 50, clearLogs: true });
    await editMessage(2, '你在路边的草丛里什么也没找到。');
    await page.evaluate(() => window.Horae.background.waitForIdle(20000));
    await mock('/control', { mainQueue: ['你望向远方的城墙。'], clearLogs: true });
    await send(page, '我抬头看路。');
    let p = promptText((await mainLogs())[0] || { messages: [] });
    let st = await engineState(page);
    check(results, 'I04 stale Horae memory after a GM edit: repair attempted, then excluded from the ACTUAL outgoing prompt', !p.includes('银色徽章') && !p.includes('Current State Snapshot') && st.notices.some((n) => /Horae memory is stale/.test(n.text)), `snapshot=${p.includes('Current State Snapshot')} badge=${p.includes('银色徽章')}`);
    // I04 (repair path): Horae available again -> barrier re-analyzes, prompt carries the fresh state
    await page.evaluate(() => window.Horae.background.waitForIdle(120000));
    await mock('/control', { auxFailNext: 0, mainQueue: ['城墙上的旗帜在风中翻飞。'], clearLogs: true });
    await send(page, '我走向城门。');
    p = promptText((await mainLogs())[0] || { messages: [] });
    const reanalyzed = (await auxLogs()).some((a) => a.story.includes('什么也没找到'));
    check(results, 'I04 repair: supported Horae re-analysis runs once and the prompt carries fresh state without the erased item', reanalyzed && p.includes('Current State Snapshot') && !p.includes('银色徽章'), `reanalyzed=${reanalyzed}`);
    // I05 freshness barrier: Horae still analyzing the accepted reply when Send is pressed
    await mock('/control', { auxDelayMs: 4000, auxRules: [{ match: '钟楼', response: '<horae>\nlocation:钟楼顶层\n</horae>' }], mainQueue: ['你登上了钟楼，风很大。', '你俯瞰整座城市。'], clearLogs: true });
    await send(page, '我登上钟楼。');
    await send(page, '我俯瞰城市。');
    const m2 = (await mainLogs())[1];
    const mlAll = await mainLogs();
    check(results, 'I05 next turn waits for Horae to finish the accepted reply (fresh location, no stale time)', !!m2 && promptText(m2).includes('钟楼顶层'), `main=${mlAll.length} chat=${JSON.stringify((await chat(page)).slice(-3).map((m) => m.mes))} snap=${m2 ? (promptText(m2).match(/Current State Snapshot[\s\S]{0,300}/) || [''])[0] : ''} notices=${JSON.stringify((await engineState(page)).notices)}`);
    await mock('/control', { auxDelayMs: 0 });
    // I07 stale lore claiming a later canon death cannot override current state
    await page.evaluate(async () => { await SillyTavern.getContext().executeSlashCommandsWithOptions('/note （设定集：Mira 在原作中于第1天死于伏击。）'); });
    await mock('/control', {
      mainQueue: ['你来到 Mira 的墓前，献上一束花。GRAVE_X', 'Mira 正在诊所里为伤员包扎。'],
      taskRules: [rule('discover', 'GRAVE_X', { references: [{ id: 'r1', quote: 'Mira', phrase: 'Mira', ref_kind: 'person', mode: 'direct', assertion: 'narrator', temporal: 'present', candidate_ids: ['mira'] }], claims: [{ id: 'c1', quote: 'Mira 的墓前', kind: 'state', entity_phrases: ['Mira'], assertion: 'narrator', expected: { entity_id: 'mira', predicate: 'alive', value: false } }] })],
      clearLogs: true,
    });
    await send(page, '我去找 Mira。');
    const msgs = await chat(page);
    const tl7 = await taskLogs();
    check(results, 'I07 lore saying a character later died cannot override the actual alive state; lore never enters extraction/evaluation as evidence', !msgs.some((m) => m.mes?.includes('GRAVE_X')) && msgs[msgs.length - 1].mes.includes('诊所') && tl7.every((t) => !promptText(t).includes('设定集')), `last=${msgs[msgs.length - 1].mes} tasks=${tl7.map((t) => t.task).join(',')} st=${JSON.stringify((await engineState(page)).recovery)} n=${JSON.stringify((await engineState(page)).notices)}`);
    await page.evaluate(async () => { await SillyTavern.getContext().executeSlashCommandsWithOptions('/note'); });
    // E08 first message edit: rebuild bootstrap-dependent facts, no duplicate RPG/Persona initialization
    const pb = await page.evaluate(() => JSON.stringify(window.Horae.persona.getRecord()));
    const rpgBefore = await page.evaluate(() => JSON.stringify(window.Horae.getRpgState?.() || null));
    await mock('/control', { clearLogs: true });
    await editMessage(0, 'You wake in the glade. (edited greeting)');
    st = await engineState(page);
    const pb2 = await page.evaluate(() => JSON.stringify(window.Horae.persona.getRecord()));
    const rpgAfter = await page.evaluate(() => JSON.stringify(window.Horae.getRpgState?.() || null));
    check(results, 'E08 first-message edit rebuilds from the binding seed; Persona/RPG not re-initialized', st.recovery.status !== 'error' && pb2 === pb && rpgAfter === rpgBefore, JSON.stringify(st.recovery));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S10')) {
    console.log('\n== S10 separate analysis connection profile ==');
    // A saved ST connection profile for analysis (same mock server, different model id).
    await page.evaluate((url) => {
      const c = SillyTavern.getContext();
      const cm = c.extensionSettings.connectionManager || (c.extensionSettings.connectionManager = { profiles: [] });
      cm.profiles = (cm.profiles || []).filter((p) => p.id !== 'canon-e2e-analysis');
      cm.profiles.push({ id: 'canon-e2e-analysis', name: 'Canon E2E analysis', mode: 'cc', api: 'custom', 'api-url': url + '/v1', model: 'mock-task' });
      c.extensionSettings.canonEngine.taskProfileId = 'canon-e2e-analysis';
    }, 'http://127.0.0.1:5555');
    await freshChat();
    await page.evaluate(() => { SillyTavern.getContext().chatCompletionSettings.temp_openai = 1; });
    await mock('/control', { mainQueue: ['海风吹过港口。PROFILE_OK'], clearLogs: true });
    await send(page, '我看向港口。');
    const tl = await taskLogs();
    const ml = await mainLogs();
    const opts = await page.$$eval('#canon-engine-settings [data-set="taskProfileId"] option', (o) => o.map((x) => x.textContent));
    check(results, 'P01 internal analysis tasks go to the analysis profile (model mock-task, temperature 0.2)', tl.length >= 2 && tl.every((t) => t.model === 'mock-task' && Number(t.temperature) === 0.2), tl.map((t) => `${t.task}:${t.model}:${t.temperature}`).join(' '));
    check(results, 'P02 the story draft stays on the chat connection (model mock-main, story temperature)', ml.length === 1 && ml[0].model === 'mock-main' && Number(ml[0].temperature) === 1 && (await lastAi()).mes.includes('PROFILE_OK'), ml.map((m) => `${m.model}:${m.temperature}`).join(' '));
    check(results, 'P03 the drawer lists the saved profile as an analysis connection', opts.some((o) => /Canon E2E analysis/.test(o)), opts.join(' | '));
    // extra body parameters (e.g. Venice disable_thinking) reach analysis requests only
    await page.evaluate(() => { SillyTavern.getContext().extensionSettings.canonEngine.taskExtraBody = 'venice_parameters:\n  disable_thinking: true'; });
    await mock('/control', { mainQueue: ['潮水退去。PROFILE_EXTRA'], clearLogs: true });
    await send(page, '我看向沙滩。');
    const tl2 = await taskLogs();
    const ml2 = await mainLogs();
    check(results, 'P05 extra request parameters are sent with analysis requests, not with the story request', tl2.length >= 2 && tl2.every((t) => t.venice?.disable_thinking === true) && ml2.length === 1 && !ml2[0].venice, `${tl2.map((t) => JSON.stringify(t.venice)).join(' ')} | main ${JSON.stringify(ml2[0]?.venice)}`);
    await page.evaluate(() => { SillyTavern.getContext().extensionSettings.canonEngine.taskExtraBody = ''; });
    // a deleted profile gives an actionable error instead of silently using the main model
    await page.evaluate(() => { const c = SillyTavern.getContext(); c.extensionSettings.connectionManager.profiles = c.extensionSettings.connectionManager.profiles.filter((p) => p.id !== 'canon-e2e-analysis'); });
    await mock('/control', { mainQueue: ['NEVER_SHOWN_P'], clearLogs: true });
    await send(page, '我继续看。');
    const stP = await engineState(page);
    check(results, 'P04 a missing analysis profile stops the turn with an actionable error', stP.recovery.status === 'error' && /no longer exists/.test(stP.recovery.reason || ''), JSON.stringify(stP.recovery));
    await page.evaluate(() => { SillyTavern.getContext().extensionSettings.canonEngine.taskProfileId = ''; SillyTavern.getContext().saveSettingsDebounced(); });
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S11')) {
    console.log('\n== S11 slow analysis: progress, cancel, per-call timeout ==');
    await freshChat();
    await mock('/control', { mainQueue: ['你望向港口。SLOW_A'], clearLogs: true });
    await send(page, '我看向港口。');
    await mock('/control', { mainQueue: ['海鸥在头顶盘旋。SLOW_B'], clearLogs: true });
    await send(page, '我继续看。');
    // Edit the first player message: the dependent messages must be re-examined by the (slow) model.
    await mock('/control', { taskDelayMs: 1500, clearLogs: true });
    const userIdx = (await chat(page)).findIndex((m) => m.is_user);
    await page.evaluate(({ idx }) => {
      const el = document.querySelector(`#chat .mes[mesid="${idx}"]`);
      el.querySelector('.mes_edit').click();
      setTimeout(() => {
        const ta = document.querySelector('#curEditTextarea');
        ta.value = '我看向远处的灯塔。';
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector(`#chat .mes[mesid="${idx}"] .mes_edit_done`).click();
      }, 400);
    }, { idx: userIdx });
    let seen = '';
    for (let i = 0; i < 40 && !/Examining message \d+\/\d+ \(.+\) · /.test(seen); i++) { await sleep(250); seen = await page.$eval('#canon-engine-status', (e) => e.innerText).catch(() => ''); }
    check(results, 'T01 a slow reconcile shows which message and which step it is on', /Examining message \d+\/\d+ \((player|GM)\) · (reading the player message|finding references|checking consistency)/.test(seen), seen.replace(/\s+/g, ' ').slice(0, 200));
    const hasCancel = await page.$('#canon-engine-status [data-act="cancel"]');
    if (hasCancel) await hasCancel.click();
    await waitIdle(page, 30000).catch(() => {});
    let st = await engineState(page);
    check(results, 'T02 a background reconcile can be cancelled from the status bar', !!hasCancel && st.recovery.status === 'error' && /cancel/i.test(`${st.recovery.errorKind} ${st.recovery.reason}`), JSON.stringify(st.recovery));
    // Per-call timeout: one hung call fails fast with a clear message; the next turn is not blocked.
    await page.evaluate(() => { window.CanonEngine.engine.settings.taskTimeoutMs = 2000; });
    await mock('/control', { taskDelayMs: 6000, clearLogs: true });
    const t0 = Date.now();
    await page.evaluate(async () => { await window.CanonEngine.engine.retry().catch(() => {}); });
    await waitIdle(page, 60000).catch(() => {});
    st = await engineState(page);
    check(results, 'T03 a hung analysis call times out per call with an actionable message', st.recovery.status === 'error' && /timed out after 2s \(one call, via the chat's own connection \(mock-main\)\)/.test(st.recovery.reason || '') && Date.now() - t0 < 20000, `${Date.now() - t0}ms ${JSON.stringify(st.recovery).slice(0, 220)}`);
    await page.evaluate(() => { window.CanonEngine.engine.settings.taskTimeoutMs = 300000; });
    await mock('/control', { taskDelayMs: 0, mainQueue: ['灯塔的光扫过海面。SLOW_C'], clearLogs: true });
    await page.evaluate(async () => { await window.CanonEngine.engine.retry().catch(() => {}); });
    await waitIdle(page, 60000).catch(() => {});
    st = await engineState(page);
    check(results, 'T04 after the timeout, Retry completes normally (nothing left blocking the queue)', st.recovery.status === 'ok', JSON.stringify(st.recovery).slice(0, 200));
  }

  // ---------------------------------------------------------------------------------------------
  if (want('S12')) {
    console.log('\n== S12 public clock API and turn timings ==');
    await mock('/control', { mainQueue: [], mainRules: [], taskRules: [], taskDelayMs: 0, clearLogs: true });
    await newChat(page);
    await page.evaluate(() => { window.__clockEvents = []; document.addEventListener('canon-engine:clock', (e) => window.__clockEvents.push(e.detail)); });
    await bind(page, packText('demo.canon.json'), tick(1, 9, 30), { y: 2020, m: 7, d: 19 });
    await mock('/control', { mainQueue: ['港口的钟敲了十下。CLOCK_A'], taskRules: [rule('evaluate', 'CLOCK_A', { scene_end: { lo: D(1, 10), hi: D(1, 10), precision: 'minute' } })], clearLogs: true });
    await send(page, '我等到十点。');
    const clk = await page.evaluate(() => window.CanonEngine.api.getClock());
    const evs = await page.evaluate(() => window.__clockEvents);
    check(results, 'K01 window.CanonEngine.api.getClock() returns the committed clock with a calendar date', clk.active && clk.date === '2020/07/20' && clk.time === '10:00' && clk.day === 1, JSON.stringify(clk));
    check(results, 'K02 a canon-engine:clock event fires when the clock changes', evs.some((e) => e.active && e.time === '10:00'), JSON.stringify(evs.slice(-2)));
    const timing = await page.$eval('#canon-engine-status .canon-timing', (e) => e.innerText).catch(() => '');
    check(results, 'K03 the status bar shows the last turn\'s step timings', /上一回合|Last turn/.test(timing) && /(生成回复|story reply)/.test(timing), timing);
    check(results, 'K04 an idle status bar offers no Cancel button', !(await page.$('#canon-engine-status [data-act="cancel"]')));
    await page.screenshot({ path: join(ROOT, 'tests', 'e2e', 'out', 'k-timing.png'), clip: { x: 300, y: 880, width: 800, height: 120 } }).catch(() => {});
  }
} catch (e) {
  console.error('FATAL', e);
  try { await page.screenshot({ path: join(ROOT, 'tests', 'e2e', 'out', 'fatal.png') }); } catch { /* ignore */ }
  try { console.error('dialogs:', await page.$$eval('dialog[open]', (d) => d.map((x) => x.innerText.slice(0, 300)))); } catch { /* ignore */ }
  results.push({ name: 'FATAL', pass: false, detail: String(e?.stack || e).slice(0, 1000) });
} finally {
  mkdirSync(join(ROOT, 'tests', 'e2e', 'out'), { recursive: true });
  writeFileSync(join(ROOT, 'tests', 'e2e', 'out', 'integration-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  writeFileSync(join(ROOT, 'tests', 'e2e', 'out', 'last-console.log'), consoleLines.join('\n'));
  const pass = results.filter((r) => r.pass).length;
  console.log(`\n${pass}/${results.length} passed`);
  await browser.close();
}
