// 叙事融入 tab: the 小任务 checkbox switches small jobs on and off — the same setting as in the settings panel.
// Usage: node tests/e2e/jobs-toggle.mjs
import { launch, openST, newChat, bind, packText, sleep } from './lib.mjs';

let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const state = (page) => page.evaluate(() => ({
  tab: document.querySelector('#canon-inspector [data-act="ni-jobs"]')?.checked ?? null,
  card: document.querySelector('#canon-engine-settings [data-set="quietDayJobs"]')?.checked ?? null,
  saved: SillyTavern.getContext().extensionSettings.canonEngine?.quietDayJobs,
}));

const { browser, page } = await launch();
try {
  await openST(page);
  await newChat(page);
  await bind(page, packText(), 600);
  await page.click('#canon-engine-status [data-act="inspect"]');
  await page.waitForSelector('#canon-inspector');
  await page.click('#canon-inspector [data-tab="player"]');
  await sleep(500);
  let s = await state(page);
  check('JT01 the 叙事融入 tab has the 小任务 checkbox, on by default like the setting', s.tab === true && s.card !== false, JSON.stringify(s));
  await page.click('#canon-inspector [data-act="ni-jobs"]');
  await sleep(500);
  s = await state(page);
  check('JT02 unchecking it turns small jobs off (saved setting and the settings panel follow)', s.tab === false && s.saved === false && s.card === false, JSON.stringify(s));
  await page.click('#canon-inspector [data-act="ni-jobs"]');
  await sleep(500);
  s = await state(page);
  check('JT03 checking it again turns them back on', s.tab === true && s.saved === true && s.card === true, JSON.stringify(s));
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
