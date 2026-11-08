// 本局设定 in the real SillyTavern front end (mock model): a Persona line marked "(本局设定)", a chat lorebook entry
// that contradicts it, Canon's check rewriting it, and SillyTavern's own World Info scan — and the GM's prompt —
// carrying the rewritten entry instead of the original (the lorebook file unchanged).
// Usage (st-test server + mock on 5555): node tests/e2e/worldset.mjs
import { launch, openST, newChat, bind, packText, send, mock, logs, waitIdle, campaign } from './lib.mjs';

let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const BOOK = 'CanonWS Test';
const OLD = '学园都市的Level 5共有七人。';
const NEW = '学园都市的Level 5共有八人，第八位是田中太郎。';

const { browser, page } = await launch();
let persona0 = '';
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  persona0 = await page.evaluate(async ({ BOOK, OLD }) => {
    const c = SillyTavern.getContext();
    const wi = await import('/scripts/world-info.js');
    const entry = (uid, key, content) => ({ ...wi.newWorldInfoEntryTemplate, uid, key, comment: key[0], content, selective: false });
    await wi.saveWorldInfo(BOOK, { entries: { 0: entry(0, ['Level 5'], OLD), 1: entry(1, ['风纪委员'], '学生组成的治安组织。') } }, true);
    c.chatMetadata.world_info = BOOK;
    await c.saveMetadata();
    const before = c.powerUserSettings.persona_description;
    c.powerUserSettings.persona_description = '姓名：田中太郎\n能力：Level 5 火焰能力者\n身份: 第8位Level 5 (本局设定)';
    return before;
  }, { BOOK, OLD });
  await mock('/control', { taskRules: [
    { task: 'profile', patch: { world_changes: [{ text: '身份：第8位Level 5', terms: ['Level 5'] }] } },
    { task: 'world_check', match: 'Level 5', patch: { items: [{ ref: 'l1', action: 'replace', untrue: ['共有七人'], content: NEW, reason: '第8位Level 5' }] } },
  ], clearLogs: true });
  await bind(page, packText(), 480);
  await send(page, '我在街上听人聊起Level 5的排名。');
  await waitIdle(page);
  const c = await campaign(page);
  const ws = c?.worldSettings;
  check('WE01 the Persona read checks the lorebook: the contradicted entry is rewritten for this game', ws?.overrides?.length === 1 && ws.overrides[0].content === NEW && ws.overrides[0].book === BOOK, JSON.stringify(ws?.overrides?.map((o) => [o.book, o.uid, o.action])));
  const scan = await page.evaluate(async () => {
    const wi = await import('/scripts/world-info.js');
    const r = await wi.getWorldInfoPrompt(['我在街上听人聊起Level 5的排名。'], 8000, true);
    return { text: r.worldInfoString, applied: window.CanonEngine.engine.loreApplied, hook: window.CanonEngine.engine.loreHook };
  });
  check('WE02 SillyTavern\'s own scan carries the rewritten entry, not the original', scan.text.includes(NEW) && !scan.text.includes(OLD) && scan.hook === true && scan.applied?.applied === 1, JSON.stringify(scan).slice(0, 300));
  const main = (await logs()).filter((l) => l.type === 'main').map((l) => (l.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
  const last = main.at(-1) || '';
  check('WE03 the GM\'s prompt has the rewritten entry and no extra section about it', last.includes(NEW) && !last.includes(OLD) && !/LOREBOOK IN THIS GAME/.test(last), `${last.length} chars`);
  const file = await page.evaluate(async (BOOK) => { const wi = await import('/scripts/world-info.js'); return (await wi.loadWorldInfo(BOOK))?.entries?.[0]?.content; }, BOOK);
  check('WE04 the lorebook file is unchanged', file === OLD, file);
  // the panel lists it
  await page.evaluate(() => window.CanonEngine.engine.campaign().uiPreferences.inspectorOpen = true);
  const panel = await page.evaluate(() => { const v = window.CanonEngine.engine.worldView(); return { changes: v.changes.map((x) => [x.source, x.text]), overrides: v.overrides.map((o) => o.title) }; });
  check('WE05 the panel data: the marked change and the rewritten entry', panel.changes[0]?.[0] === 'marked' && panel.overrides[0] === 'Level 5', JSON.stringify(panel));
  // the 叙事融入 tab shows them; an edit by hand there takes effect in the next scan
  await page.evaluate(() => (document.querySelector('[data-act="inspect"]'))?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => (document.querySelector('#canon-inspector [data-tab="world"]'))?.click());
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => { const el = document.querySelector('#canon-inspector'); return { text: el?.textContent || '', edits: el?.querySelectorAll('.canon-ws-edit').length || 0 }; });
  check('WE06 the 叙事融入 tab lists 本局设定, the change and the rewritten entry', /本局设定/.test(shown.text) && shown.text.includes('身份: 第8位Level 5') && shown.text.includes(NEW) && shown.edits === 1, shown.text.slice(0, 200));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
  await page.evaluate((v) => { const t = document.querySelector('#canon-inspector .canon-ws-edit'); t.value = v; document.querySelector('#canon-inspector [data-act="ws-save"]').click(); }, '学园都市的Level 5共有八人（手改）。');
  await page.waitForTimeout(1500);
  const scan2 = await page.evaluate(async () => { const wi = await import('/scripts/world-info.js'); return (await wi.getWorldInfoPrompt(['Level 5'], 8000, true)).worldInfoString; });
  check('WE07 an edit by hand takes effect in the next scan', scan2.includes('八人（手改）'), scan2);
} finally {
  await page.evaluate(async ({ persona0, BOOK }) => {
    const c = SillyTavern.getContext();
    c.powerUserSettings.persona_description = persona0;
    try { const wi = await import('/scripts/world-info.js'); await wi.deleteWorldInfo?.(BOOK); } catch { /* test server */ }
  }, { persona0, BOOK }).catch(() => undefined);
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
