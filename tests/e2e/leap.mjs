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
  // chapters: a pack with many events in arcs (the demo pack plus 12 arcs of 50 events)
  const big = (() => {
    const p = JSON.parse(packText());
    const base = p.events.find((e) => e.id === 'harbor-festival');
    let t = 6 * 1440 + 480;
    for (let a = 0; a < 12; a++) {
      const ids = [];
      for (let i = 0; i < 50; i++) { const id = `x-${a}-${i}`; const w = { day: Math.floor(t / 1440), minute: t % 1440 }; p.events.push({ ...base, id, title: `Arc ${a} event ${i}`, when: { ...base.when, earliest: w, latest: w, label: id }, arc_id: `arc-${a}`, outcomes: [], canonical_effects: [] }); ids.push(id); t += 360; }
      p.arcs.push({ id: `arc-${a}`, title: `Arc ${a}`, summary: 'a synthetic arc', event_ids: ids });
    }
    p.coverage.end = { day: 600, minute: 1439 };
    return JSON.stringify(p);
  })();
  await newChat(page);
  await bind(page, big, 480);
  await page.click('#canon-engine-status [data-act="leap"]');
  await page.waitForSelector('.canon-leap-to');
  await page.fill('.canon-leap-to', 'D200 08:00');
  await sleep(300);
  const ch = await page.evaluate(() => ({ items: [...document.querySelectorAll('.canon-leap-chapters li')].map((x) => x.textContent), split: document.querySelector('.canon-leap-split')?.checked }));
  check('LE07 a leap across many arcs is offered in chapters, split by default', ch.items.length > 1 && ch.split === true && /Arc \d+/.test(ch.items[0]), JSON.stringify(ch));
  await page.fill('.canon-leap-desc', 'I sail along the coast.');
  await page.click('.canon-leap-ok');
  await sleep(300);
  const box2 = await page.evaluate(() => document.getElementById('send_textarea').value);
  check('LE08 the reply box gets the first chapter with the end of the whole leap', /^\{\{time_leap:D\d+ 08:00 → D200 08:00\}\}\nI sail along the coast\.$/.test(box2), JSON.stringify(box2));
  await send(page, box2);
  await waitIdle(page);
  const next = await page.evaluate(() => !!document.querySelector('#canon-engine-status [data-act="leap-next"]'));
  check('LE09 after the chapter the status bar offers 下一章', next);
  await page.click('#canon-engine-status [data-act="leap-next"]');
  await page.waitForSelector('.canon-leap-to');
  const pre = await page.evaluate(() => ({ to: document.querySelector('.canon-leap-to').value, desc: document.querySelector('.canon-leap-desc').value }));
  check('LE10 下一章 fills in the end of the leap and the description', pre.to === 'D200 08:00' && pre.desc === 'I sail along the coast.', JSON.stringify(pre));
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
