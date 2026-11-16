// 画面 in the real SillyTavern front end (mock model): the button on a reply, the task's input (the reply, the
// Persona as the player character) and the popup with the prompts to copy.
// Usage (st-test server + mock on 5555): node tests/e2e/picture.mjs [screenshot.png]
import { launch, openST, newChat, bind, packText, send, mock, waitIdle, taskLogs } from './lib.mjs';

let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };

const { browser, page } = await launch();
let persona0 = '';
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  persona0 = await page.evaluate(() => {
    const c = SillyTavern.getContext();
    const before = c.powerUserSettings.persona_description;
    c.powerUserSettings.persona_description = 'Ash, a dock worker with black hair.';
    return before;
  });
  await mock('/control', { mainQueue: ['米拉在码头上朝你挥手，夕阳把海面染成金色。PI_A'], clearLogs: true });
  await bind(page, packText(), 480);
  await send(page, '我走向码头。');
  await waitIdle(page);
  const last = await page.evaluate(() => SillyTavern.getContext().chat.length - 1);
  const button = `#chat .mes[mesid="${last}"] .extraMesButtons .canon-picture`;
  check('PI01 a reply has the picture button among its message buttons', !!(await page.$(button)));
  check('PI02 a player message has none', !(await page.$(`#chat .mes[mesid="${last - 1}"] .canon-picture`)));
  await page.evaluate((sel) => document.querySelector(sel).click(), button);
  await page.waitForSelector('.canon-modal textarea', { timeout: 30000 });
  const input = JSON.parse((await taskLogs('picture')).at(-1)?.messages.at(-1).content.replace(/^INPUT[^\n]*\n/, '') || '{}');
  check('PI03 the task reads the reply and has the Persona as the player character', input.reply?.includes('PI_A') && input.people?.[0]?.player === true && input.people[0].description.includes('black hair'), JSON.stringify(input).slice(0, 300));
  const boxes = await page.evaluate(() => [...document.querySelectorAll('.canon-modal label')].map((l) => [l.firstChild.textContent, l.querySelector('textarea').value]));
  const text = Object.fromEntries(boxes);
  check('PI04 the popup has the NovelAI base prompt, a prompt per character with its place, and the single prompt',
    text['基础提示词（Base Prompt）'] === '1girl, 1boy, mock work, street, evening, cowboy shot'
    && text['角色 1（位置 A3）'] === 'girl, mock character, school uniform, smile, waving, source#pointing at another'
    && text['角色 2（位置 E3）'] === 'boy, black hair, hoodie, surprised, standing, target#pointing at another'
    && text['负面提示词（Undesired Content）'] === 'nsfw'
    && text['提示词']?.startsWith('1girl, 1boy, mock work, mock character'), JSON.stringify(boxes));
  const note = await page.evaluate(() => document.querySelector('.canon-modal .canon-note')?.textContent || '');
  check('PI05 what was left out is shown', note.includes('短发'), note);
  if (process.argv[2]) await page.locator('.canon-modal').screenshot({ path: process.argv[2] });
} finally {
  await page.evaluate((persona0) => { SillyTavern.getContext().powerUserSettings.persona_description = persona0; }, persona0).catch(() => undefined);
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
