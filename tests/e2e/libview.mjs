// 历史包库 → 查看 in the real SillyTavern (mock model): a library pack opens in the history graph without being
// enabled for the chat, and leaving the view brings back the chat's own graph.
// Usage: node tests/e2e/libview.mjs
import { launch, openST, newChat, bind, packText } from './lib.mjs';

let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const panel = (page) => page.evaluate(() => {
  const el = document.getElementById('canon-graph-panel');
  return {
    open: !!el && el.style.display !== 'none',
    preview: el?.querySelector('.cg-preview')?.textContent || '',
    nodes: el?.querySelectorAll('.cg-node').length || 0,
    currentDisabled: !!el?.querySelector('[data-mode="current"]')?.disabled,
    packActive: !!el?.querySelector('[data-mode="pack"].active'),
    empty: !!el?.querySelector('.cg-canvas .cg-empty'),
  };
});

const { browser, page, consoleLines } = await launch();
try {
  await openST(page);
  // put the demo pack in the library through a binding, then go to a chat without one
  await newChat(page);
  await bind(page, packText(), 600);
  await newChat(page);
  const bound = await page.evaluate(() => !!SillyTavern.getContext().chatMetadata.canonEngine);
  check('LV01 the second chat has no history pack', !bound);
  await page.evaluate(() => {
    const d = document.querySelector('#canon-engine-settings .inline-drawer-content, .canon-settings');
    document.querySelector('#canon-engine-settings .inline-drawer-toggle')?.click();
    void d;
    document.querySelectorAll('details.canon-lib').forEach((x) => { x.open = true; });
  });
  await page.waitForTimeout(500);
  const btn = await page.$('[data-act="lib-view"]');
  check('LV02 each library row has a 查看 button', !!btn);
  await page.evaluate(() => document.querySelector('[data-act="lib-view"]').click());
  await page.waitForTimeout(2000);
  let p = await panel(page);
  check('LV03 查看 opens the history graph with the pack', p.open && p.nodes > 0 && /demo|港|Harbor|v\d/i.test(p.preview), JSON.stringify(p));
  check('LV04 only the canon reference view (no chat state)', p.currentDisabled && p.packActive);
  check('LV05 the chat stays unbound', !(await page.evaluate(() => !!SillyTavern.getContext().chatMetadata.canonEngine)));
  await page.evaluate(() => document.querySelector('#canon-graph-panel [data-act="preview-exit"]').click());
  await page.waitForTimeout(800);
  p = await panel(page);
  check('LV06 退出查看 returns to the chat graph (none in this chat)', p.open && !p.preview && p.empty, JSON.stringify(p));
  await page.evaluate(() => document.querySelector('[data-act="lib-view"]').click());
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('#canon-graph-panel [data-act="close"]').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => window.CanonEngine && document.querySelector('#canon-engine-top-button .canon-top-toggle')?.click());
  await page.waitForTimeout(800);
  p = await panel(page);
  check('LV07 closing the panel ends the view', p.open && !p.preview, JSON.stringify(p));
  const errs = consoleLines.filter((l) => l.startsWith('[pageerror]'));
  check('LV08 no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
