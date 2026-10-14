/**
 * Representative story session driven ONLY through the user-facing UI (M4/M5):
 * wizard binding with a real file upload, native composer, banner, swipe arrow, editing an old
 * user message and deleting an old GM message with ST's own buttons, reload, continued play.
 * Model outputs come from the mock server (no live provider is configured on this machine).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openST, connect, newChat, send, chat, engineState, mock, check, sleep, waitIdle, ROOT } from './lib.mjs';

const OUT = join(ROOT, 'tests', 'e2e', 'out');
mkdirSync(OUT, { recursive: true });
const results = [];
const D = (day, h, m = 0) => ({ day, minute: h * 60 + m });
const at = (day, h, m = 0) => ({ lo: D(day, h, m), hi: D(day, h, m), precision: 'minute' });
const { browser, page, consoleLines } = await launch();
const shot = (name) => page.screenshot({ path: join(OUT, `story-${name}.png`) });

try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  // ---- bind through the wizard (file upload) ----
  await page.evaluate(() => document.querySelector('#canon-engine-settings .inline-drawer-toggle')?.click());
  await page.evaluate(() => document.querySelector('#extensionsMenuButton, #extensions-settings-button .drawer-toggle')?.click());
  // real user path: click the button, the drawer re-renders, then the file is chosen in the dialog
  await page.evaluate(async () => {
    const es = SillyTavern.getContext().extensionSettings.canonEngine;
    for (const e of es.library || []) await fetch('/api/files/delete', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify({ path: e.file }) });
    es.library = [];
  });
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.evaluate(() => document.querySelector('#canon-engine-settings [data-act="enable"]').click()),
  ]);
  await page.waitForTimeout(400); // let the drawer re-render while the dialog is "open"
  await chooser.setFiles(join(ROOT, 'examples', 'demo.canon.json'));
  await page.waitForSelector('.canon-modal .canon-confirm', { timeout: 15000 });
  const preview = await page.$eval('.canon-modal', (e) => e.innerText);
  check(results, 'Wizard preview shows title/version, validation, coverage and Hard count', /Harbor Convergence/.test(preview) && /1\.0\.0/.test(preview) && /HARD/.test(preview) && /2/.test(preview), preview.slice(0, 200));
  await page.fill('.canon-modal .canon-start', 'D1 09:00');
  await page.fill('.canon-modal .canon-origin', '2020-07-01');
  await shot('01-wizard');
  await page.click('.canon-modal .canon-confirm');
  await page.waitForSelector('.canon-modal .canon-undo', { timeout: 60000 });
  await shot('02-binding-summary');
  const summary = await page.$eval('.canon-modal', (e) => e.innerText);
  check(results, 'Binding summary shows start time, pack, examined messages and issues', /D1 09:00/.test(summary) && /demo-harbor@1\.0\.0/.test(summary), summary.slice(0, 300));
  await page.click('.canon-modal [data-close]');
  // ---- play with the native composer ----
  await mock('/control', {
    mainQueue: ['港口的风带来消息：有人计划在十点伏击诊所的医生 Mira。你要怎么做？', '弩箭从巷口射来，你及时把 Mira 拉到身后，她毫发无伤。', '你们穿过小巷来到避难所，Mira 松了一口气。', '（另一种可能）你们躲进了码头仓库，Mira 紧张地喘气。', '仓库外传来巡逻的脚步声。'],
    taskRules: [
      { task: 'evaluate', match: '毫发无伤', patch: { scene_end: at(1, 10, 5), player_actions: [{ quote: '你及时把 Mira 拉到身后', authorized_by_quote: '挡在 Mira 身前' }], occurrences: [{ ref: 'o1', title: 'Ambush of Mira', account: 'The player pulled Mira behind them; she survived the ambush.', actors: ['mira'], affected: ['mira'], locations: ['harbor'], time: null, causes: [], quote: '你及时把 Mira 拉到身后', pack_event_id: 'medic-ambush', disposition: 'diverged', ref_phrases: ['the ambush'], visibility: 'public', knowers: [], origin: 'player' }], transitions: [{ op: 'set', entity_id: 'mira', predicate: 'alive', value: true, quote: '她毫发无伤', occurrence_ref: 'o1' }] } },
      { task: 'impact', match: 'mira|alive', patch: { changed: [{ entity_id: 'mira', predicate: 'alive' }], affected_anchors: ['conflict-begins'], affected_steps: [], scope: 'local', severity: 'major', replan: true, explanation: 'original broadcast route invalidated' }, once: true },
    ],
    clearLogs: true,
  });
  await send(page, '我在港口闲逛，打听最近的消息。');
  await send(page, '我立刻赶到诊所门口，挡在 Mira 身前。');
  await sleep(500);
  const banner = await page.$('#chat .canon-banner');
  await shot('03-banner');
  check(results, 'Major deviation shows one spoiler-free red banner beside the reply (plugin UI, not prose)', !!banner && (await page.$$('#chat .canon-banner')).length === 1 && !(await chat(page)).some((m) => /严重历史偏离/.test(m.mes || '')));
  await send(page, '我带 Mira 去避难所。');
  // ---- swipe via the UI arrow ----
  await page.evaluate(() => { const last = document.querySelector('#chat .mes.last_mes'); last?.querySelector('.swipe_right')?.click(); });
  await sleep(1000);
  await waitIdle(page);
  let msgs = await chat(page);
  check(results, 'Swipe arrow produces a validated second variant', msgs[msgs.length - 1].swipes === 2 && msgs[msgs.length - 1].mes.includes('仓库'));
  // ---- inspector via the status pill ----
  await page.click('#canon-engine-status [data-act="inspect"]');
  await page.waitForSelector('#canon-inspector');
  await page.click('#canon-inspector [data-tab="facts"]');
  await shot('04-inspector-facts');
  const facts = await page.$eval('#canon-inspector', (e) => e.innerText);
  check(results, 'Inspector shows current facts with provenance', /mira|Mira/.test(facts) && /alive/.test(facts));
  await page.click('#canon-inspector [data-tab="anchors"]');
  const anchorsHidden = await page.$eval('#canon-inspector', (e) => e.innerText);
  check(results, 'Future anchors hidden behind the spoiler toggle by default', /hidden|enable spoilers|•••/.test(anchorsHidden) && !/Union victorious/.test(anchorsHidden));
  await page.click('#canon-inspector [data-act="close"]');
  // ---- edit an old user message through ST's editor ----
  await page.evaluate(async () => {
    const el = document.querySelector('#chat .mes[mesid="1"]');
    el.querySelector('.mes_edit').click();
    await new Promise((r) => setTimeout(r, 400));
    const ta = document.querySelector('#curEditTextarea');
    ta.value = '我在港口慢慢闲逛，向渔夫打听最近的消息。';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    el.querySelector('.mes_edit_done').click();
  });
  await sleep(1500);
  await waitIdle(page);
  let st = await engineState(page);
  check(results, 'Editing an old user message rebuilds silently (compatible edit, no conflict)', st.recovery.status === 'ok' && st.facts['mira|alive'] === true, JSON.stringify(st.recovery));
  // ---- delete an old GM message through ST's editor ----
  await page.evaluate(async () => {
    const el = document.querySelector('#chat .mes[mesid="2"]');
    el.querySelector('.mes_edit').click();
    await new Promise((r) => setTimeout(r, 400));
    el.querySelector('.mes_edit_delete').click();
  });
  await sleep(800);
  const ok = await page.$('dialog[open] .popup-button-ok');
  if (ok) await ok.click();
  await sleep(1500);
  await waitIdle(page);
  st = await engineState(page);
  msgs = await chat(page);
  check(results, 'Deleting an old GM message rebuilds from the remaining transcript; Mira still saved (independent source)', msgs.length === 6 && st.facts['mira|alive'] === true && st.dispositions['medic-ambush'] === 'diverged', `len=${msgs.length} ${JSON.stringify(st.recovery)}`);
  // ---- reload and continue ----
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
  await waitIdle(page);
  await sleep(1000);
  await shot('05-after-reload');
  const pillText = await page.$eval('#canon-engine-status', (e) => e.innerText).catch(() => '');
  check(results, 'After reload the compact status is visible and ready; banner restored with the variant', /Canon/.test(pillText) && (await page.$$('#chat .canon-banner')).length === 1, pillText);
  await send(page, '我们在仓库里等到天亮。');
  msgs = await chat(page);
  check(results, 'Play continues normally after reload', msgs[msgs.length - 1].mes.includes('巡逻'));
  await shot('06-continued');
  // ---- pack library: a new chat can bind the saved pack without re-uploading ----
  await newChat(page);
  await page.waitForTimeout(800);
  const libText = await page.$eval('#canon-engine-settings .canon-lib', (e) => e.innerText).catch(() => '');
  const libFile = await page.evaluate(() => (SillyTavern.getContext().extensionSettings.canonEngine.library || [])[0]?.file || '');
  check(results, 'Imported pack was saved to the library (ST user files) and is listed in a new chat', /Harbor Convergence/.test(libText) && /^\/?user\/files\/canon-pack-/.test(libFile), `${libFile} | ${libText.slice(0, 120)}`);
  await page.evaluate(() => document.querySelector('#canon-engine-settings [data-act="lib-enable"]').click());
  await page.waitForSelector('.canon-modal .canon-confirm', { timeout: 15000 });
  const libPreview = await page.$eval('.canon-modal', (e) => e.innerText);
  check(results, 'Choosing the saved pack opens the binding wizard', /Harbor Convergence/.test(libPreview));
  await shot('07-library');
  await page.click('.canon-modal [data-close]');
} catch (e) {
  console.error('FATAL', e);
  results.push({ name: 'FATAL', pass: false, detail: String(e?.stack || e).slice(0, 800) });
  try { await shot('fatal'); } catch { /* ignore */ }
} finally {
  writeFileSync(join(OUT, 'story-session-results.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
  writeFileSync(join(OUT, 'story-console.log'), consoleLines.join('\n'));
  console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
  await browser.close();
}
