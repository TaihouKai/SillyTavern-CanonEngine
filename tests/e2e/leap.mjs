// 时间跳跃: the status-bar button writes {{time_leap:…}} and the description into the reply box; SillyTavern keeps the
// directive when the message is sent; the turn leaps the clock and settles the crossed canon events.
// Usage (st-test server + mock on 5555): node tests/e2e/leap.mjs
import { launch, openST, newChat, bind, packText, send, engineState, mock, logs, sleep, waitIdle } from './lib.mjs';

let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };

const { browser, page } = await launch();
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  await bind(page, packText(), 480);
  const kept = await page.evaluate(() => SillyTavern.getContext().substituteParams('{{time_leap:2004-10-10 08:00}}\nI wait.'));
  check('LE01 SillyTavern keeps the directive through macro substitution', kept.startsWith('{{time_leap:2004-10-10 08:00}}'), JSON.stringify(kept));
  await page.click('#canon-engine-status [data-act="leap"]');
  await page.waitForSelector('.canon-leap-to');
  await page.fill('.canon-leap-to', 'D0 07:00');
  const back = await page.evaluate(() => ({ msg: document.querySelector('.canon-leap-check')?.textContent, disabled: document.querySelector('.canon-leap-ok')?.disabled }));
  check('LE02 a time before now is refused in the dialog', back.disabled === true && /往后|forward/.test(back.msg || ''), JSON.stringify(back));
  await page.fill('.canon-leap-to', 'D5 08:00');
  await page.fill('.canon-leap-desc', 'I spend the days mapping the coast.');
  await page.click('.canon-leap-ok');
  await sleep(300);
  const box = await page.evaluate(() => document.getElementById('send_textarea').value);
  check('LE03 the dialog writes the directive and the description into the reply box', box === '{{time_leap:D5 08:00}}\nI spend the days mapping the coast.', JSON.stringify(box));
  await send(page, box);
  await waitIdle(page);
  const s = await engineState(page);
  const mes = await page.evaluate(() => SillyTavern.getContext().chat.filter((m) => m.is_user).map((m) => m.mes).pop());
  check('LE04 the sent message keeps the directive', /^\{\{time_leap:D5 08:00\}\}/.test(mes || ''), JSON.stringify(mes));
  const settled = ['medic-ambush', 'council-broadcast', 'conflict-begins', 'harbor-festival', 'conflict-ends'].every((id) => s.dispositions[id]);
  check('LE05 the turn leaps the clock to the target and settles every crossed canon event', s.clock.lo >= 5 * 1440 + 480 && settled, JSON.stringify({ clock: s.clock, d: s.dispositions, rec: s.recovery?.status }));
  const leapTasks = (await logs()).filter((l) => l.type === 'task' && l.task === 'leap').length;
  check('LE06 one leap plan call', leapTasks === 1, String(leapTasks));
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
