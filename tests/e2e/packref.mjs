// The pack kept by reference in the real SillyTavern (mock model): a bound chat carries no copy of the pack, a page
// reload loads it from the pack library, a chat that still carries its pack moves it to the library, and a pack
// deleted from the library is reported and reconnected by choosing it again.
// Usage: node tests/e2e/packref.mjs [big-pack.json]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openST, newChat, bind, send, mock, engineState, ROOT } from './lib.mjs';

const demo = readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8');
const big = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : null;
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const meta = (page) => page.evaluate(() => { const c = SillyTavern.getContext().chatMetadata.canonEngine; return c ? { snapshot: !!c.packSnapshot, ref: c.packRef || null, size: JSON.stringify(c).length, hash: c.packHash } : null; });
const chatFileSize = (page) => page.evaluate(async () => { const c = SillyTavern.getContext(); const r = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), body: JSON.stringify({ ch_name: c.name2, file_name: c.chatId, avatar_url: c.characters[c.characterId].avatar }) }); return (await r.text()).length; });
const reopen = async (page) => {
  const { id, avatar } = await page.evaluate(() => { const c = SillyTavern.getContext(); return { id: c.chatId, avatar: c.characters[c.characterId].avatar }; });
  await openST(page);
  await page.evaluate(async ({ id, avatar }) => {
    const c = SillyTavern.getContext();
    if (c.characters[c.characterId]?.avatar !== avatar) { await c.selectCharacterById(c.characters.findIndex((x) => x.avatar === avatar)); await new Promise((r) => setTimeout(r, 2000)); }
    if (c.chatId !== id) await c.openCharacterChat(id);
  }, { id, avatar });
  await page.waitForFunction((id) => SillyTavern.getContext().chatId === id, id, { timeout: 60000 });
  await page.waitForFunction(() => { const E = window.CanonEngine.engine; return !E.isBusy() && ['idle', 'error', 'conflict'].includes(E.status.phase) && (E.current || E.status.phase === 'error'); }, null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
};

const { browser, page, consoleLines } = await launch();
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  await bind(page, demo, 600);
  let m = await meta(page);
  check('PK01 a new binding keeps only a reference to the pack in the chat', m && !m.snapshot && /canon-pack-demo-harbor/.test(m.ref?.file || ''), JSON.stringify(m?.ref));
  await mock('/control', { mainQueue: ['海鸥在港口上空盘旋。PK_A'], clearLogs: true });
  await send(page, '我走向港口。');
  check('PK02 a turn works', (await engineState(page))?.status?.phase === 'idle');

  await reopen(page);
  let st = await engineState(page);
  check('PK03 after a page reload the pack is loaded from the library', st?.status?.phase === 'idle' && (await page.evaluate(() => !!window.CanonEngine.engine.current)), JSON.stringify(st?.status));

  // a chat bound before 1.16: the pack inside the chat
  await page.evaluate(async () => {
    const E = window.CanonEngine.engine; const c = SillyTavern.getContext();
    const camp = c.chatMetadata.canonEngine; camp.packSnapshot = E.pack().pack; delete camp.packRef; await c.saveMetadata();
  });
  await reopen(page);
  m = await meta(page);
  check('PK04 a chat that carries its pack moves it to the library when opened', m && !m.snapshot && !!m.ref?.file, JSON.stringify(m?.ref));

  // the library file deleted
  await page.evaluate(async (file) => { const c = SillyTavern.getContext(); await fetch('/api/files/delete', { method: 'POST', headers: { ...c.getRequestHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file }) }); }, m.ref.file);
  await reopen(page);
  st = { status: await page.evaluate(() => window.CanonEngine.engine.status) };
  const missing = await page.evaluate(() => window.CanonEngine.engine.packMissing());
  check('PK05 a pack deleted from the library is reported (the engine stops)', missing && st?.status?.phase === 'error' && /not in the pack library any more/.test(st?.status?.message || ''), JSON.stringify({ missing, status: st?.status }).slice(0, 300));
  await page.evaluate(() => { document.querySelector('#extensions_settings2 .canon-settings, #canon-engine-settings')?.scrollIntoView(); });
  const note = await page.evaluate(() => [...document.querySelectorAll('.canon-note.err')].map((x) => x.textContent).join(' '));
  check('PK06 the settings show what to do', /历史包库里找不到了|no longer in the pack library/.test(note), note.slice(0, 80));
  // the button in the settings opens the file dialog; the same pack file reconnects the chat
  const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), page.evaluate(() => [...document.querySelectorAll('.canon-btns [data-act="update"]')].find((b) => /选择历史包文件|Choose the pack file/.test(b.textContent))?.click())]);
  await chooser.setFiles(join(ROOT, 'examples', 'demo.canon.json'));
  await page.waitForFunction(() => !window.CanonEngine.engine.packMissing() && window.CanonEngine.engine.status.phase === 'idle', null, { timeout: 60000 }).catch(() => {});
  st = await engineState(page);
  check('PK07 choosing the same pack again reconnects the chat', st?.status?.phase === 'idle' && !(await page.evaluate(() => window.CanonEngine.engine.packMissing())), JSON.stringify(st?.status));
  await mock('/control', { mainQueue: ['港口恢复了平静。PK_B'], clearLogs: true });
  await send(page, '我在码头坐下。');
  check('PK08 play continues', (await engineState(page))?.status?.phase === 'idle');

  if (big) {
    await newChat(page);
    await page.evaluate(() => { const $ = window.jQuery; $('#max_context_unlocked').prop('checked', true).trigger('change'); $('#openai_max_context').val(64000).trigger('input').trigger('change'); });
    const t0 = Date.now();
    await bind(page, big, 540, { y: 2015, m: 7, d: 30 });
    const bindMs = Date.now() - t0;
    await mock('/control', { mainQueue: ['玛修看向你。PK_C'], clearLogs: true });
    const t1 = Date.now();
    await send(page, '我问玛修发生了什么。');
    const turnMs = Date.now() - t1;
    const size = await chatFileSize(page);
    m = await meta(page);
    check('PK09 a big pack: the chat file stays small', size < 300000 && !m.snapshot, `chat file ${(size / 1024).toFixed(0)} KB, bind ${bindMs} ms, turn ${turnMs} ms`);
    await page.evaluate(() => { const $ = window.jQuery; $('#openai_max_context').val(8192).trigger('input').trigger('change'); $('#max_context_unlocked').prop('checked', false).trigger('change'); });
    await page.waitForTimeout(1500);
  }
} catch (e) {
  console.error('ERROR', e); fail++;
} finally {
  const errs = consoleLines.filter((l) => /pageerror/i.test(l));
  if (errs.length) console.log(errs.slice(-10).join('\n'));
  console.log(`\n${pass}/${pass + fail} passed`);
  await browser.close();
}
process.exit(fail ? 1 : 0);
