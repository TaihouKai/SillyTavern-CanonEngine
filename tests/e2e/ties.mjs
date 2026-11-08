// Relationships and who knows what, kept up in play, in the real SillyTavern front end (mock model): the Persona's
// friend, a reply in which the friendship breaks and a secret comes out, the GM's next prompt with how things stand
// now, and the 叙事融入 panel where the user adds a relationship by hand.
// Usage (st-test server + mock on 5555): node tests/e2e/ties.mjs
import { launch, openST, newChat, bind, packText, send, mock, logs, waitIdle, campaign } from './lib.mjs';

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
    c.powerUserSettings.persona_description = 'Ash, a dock worker. Mira is a childhood friend.';
    return before;
  });
  await mock('/control', {
    mainQueue: ['米拉看完账本，明白了你夜里真正在做什么。她转身离开，这段友谊到此为止。TI_A', '码头上很安静。TI_B'],
    taskRules: [
      { task: 'profile', patch: { relationships: [{ name: 'Mira', existing_id: 'mira', relation: '青梅竹马的好友', basis: 'persona_stated' }] } },
      { task: 'evaluate', match: 'TI_A', patch: { player_ties: [
        { tie: 'relation', who: 'Mira', existing_id: 'mira', relation: '因账本一事绝交的旧友', quote: '这段友谊到此为止' },
        { tie: 'knows', who: 'Mira', existing_id: 'mira', level: 'secrets', about: 'Ash夜里替走私船干活', quote: '明白了你夜里真正在做什么' },
      ] } },
      { task: 'evaluate', match: 'TI_B', patch: { contacts: [{ quote: '码头上很安静', actors: ['mira'], kind: 'request', scope_kind: 'storyline', scope_ref: '', scope_label: '码头的活', opportunity_id: null }] } },
    ],
    clearLogs: true,
  });
  await bind(page, packText(), 480);
  await send(page, '我把账本给米拉看。');
  await waitIdle(page);
  const c1 = await campaign(page);
  const ties = await page.evaluate(() => window.CanonEngine.engine.current.replay.state.ties.map((t) => [t.kind, t.name, t.relation || t.about]));
  check('TI01 the reply\'s changes are recorded with their quote', ties.length === 2 && ties[0][2] === '因账本一事绝交的旧友', JSON.stringify(ties) + (c1 ? '' : ' (no campaign)'));
  await send(page, '我回到码头。');
  await waitIdle(page);
  const main = (await logs()).filter((l) => l.type === 'main').map((l) => (l.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
  const last = main.at(-1) || '';
  check('TI02 the GM\'s next prompt has the relationship as it stands now and the Persona\'s start', /connection: Mira \[mira\] — 因账本一事绝交的旧友 \(as it stands since [^)]*Persona at the start: 青梅竹马的好友\)/.test(last), (last.match(/connection: Mira[^\n]*/) || [''])[0]);
  check('TI03 …and Mira among those who know the secret', /who knows: Mira knows: Ash夜里替走私船干活 \(from play/.test(last), (last.match(/who knows: Mira[^\n]*/) || [''])[0]);
  // the 叙事融入 tab: the list, and a relationship added by hand
  await page.evaluate(() => (document.querySelector('[data-act="inspect"]'))?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => (document.querySelector('#canon-inspector [data-tab="ties"]'))?.click());
  await page.waitForTimeout(500);
  const shown = await page.evaluate(() => document.querySelector('#canon-inspector')?.textContent || '');
  check('TI04 the panel lists the changed relationship with its start and the new knower', shown.includes('因账本一事绝交的旧友') && shown.includes('青梅竹马的好友') && shown.includes('Ash夜里替走私船干活'), shown.slice(0, 200));
  await page.evaluate(() => {
    const root = document.querySelector('#canon-inspector');
    root.querySelector('.canon-tie-name[data-kind="relation"][data-i="new"]').value = '老托马斯';
    root.querySelector('.canon-tie-text[data-kind="relation"][data-i="new"]').value = '帮你补网的老渔夫，答应替你保密';
    root.querySelector('[data-act="tie-save"][data-kind="relation"][data-i="new"]').click();
  });
  await page.waitForTimeout(1500);
  const added = await page.evaluate(() => window.CanonEngine.engine.integrationView(true).profile.relationships.map((r) => [r.name, r.text, r.basis]));
  check('TI05 a relationship added in the panel is kept as the user\'s own', added.some((r) => r[0] === '老托马斯' && r[2] === 'ui'), JSON.stringify(added));
  // a contact answered by hand: 接受 → 完成
  const answer = () => page.evaluate(() => window.CanonEngine.engine.integrationView(true).contacts.map((k) => k.answer));
  const click = async (sel) => { await page.evaluate((sel) => document.querySelector(`#canon-inspector ${sel}`)?.click(), sel); await page.waitForTimeout(1500); };
  const btns = () => page.evaluate(() => [...document.querySelectorAll('#canon-inspector [data-act="ni-answer"]')].map((b) => `${b.dataset.stance}:${b.textContent}`));
  await page.evaluate(() => (document.querySelector('#canon-inspector [data-tab="contacts"]'))?.click());
  await page.waitForTimeout(500);
  const b0 = await btns();
  await click('[data-act="ni-answer"][data-stance="accepted"]');
  const a1 = await answer(), b1 = await btns();
  await click('[data-act="ni-answer"][data-stance="done"]');
  const a2 = await answer(), b2 = await btns();
  check('TI06 an unanswered contact has 接受/拒绝; accepted it has 完成; done it has none', JSON.stringify(b0) === JSON.stringify(['accepted:接受', 'declined:拒绝']) && a1[0] === 'accepted' && JSON.stringify(b1) === JSON.stringify(['done:完成']) && a2[0] === 'done' && b2.length === 0, JSON.stringify([b0, a1, b1, a2, b2]));
  if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
} finally {
  await page.evaluate((persona0) => { SillyTavern.getContext().powerUserSettings.persona_description = persona0; }, persona0).catch(() => undefined);
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
