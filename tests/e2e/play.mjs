// Canon Engine Play (the web host, src/hosts/web) end to end, with no SillyTavern: the built site served here, the
// mock model server (node tests/e2e/mockServer.mjs 5555) as the player's API. Run after node scripts/build-site.mjs.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { ROOT, MOCK_URL, mock, sleep } from './lib.mjs';

const require = createRequire(process.env.PLAYWRIGHT_PATH || 'C:/Users/agent/e2e-tools/package.json');
const { chromium } = require('playwright');
const SITE = join(ROOT, 'site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const p = normalize(join(SITE, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html')));
  if (!p.startsWith(SITE)) { res.writeHead(403); return res.end(); }
  try { const b = await readFile(p); res.writeHead(200, { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
}).listen(8766, '127.0.0.1');

const results = [];
const check = (id, ok, detail = '') => { results.push({ id, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}${detail ? `  — ${detail}` : ''}`); };
const logs = async () => (await fetch(`${MOCK_URL}/logs`)).json();

const browser = await chromium.launch();
const errors = [];
try {
  await mock('/reset', {});
  await mock('/control', { mainQueue: ['港口的晨雾里，钟声缓缓响起。远处传来商贩的叫卖。你要做什么？', '你沿着码头走去，几艘渔船正在卸货。', '雾更浓了，码头上的人影一个个隐没。'] });
  const page = await (await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 860 } })).newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:8766/play/?base=${encodeURIComponent(MOCK_URL + '/v1')}&model=mock-main&key=test`, { waitUntil: 'load' });

  // a new game
  await page.selectOption('#pack', '../data/demo.canon.json');
  await page.waitForFunction(() => !document.querySelector('#start').disabled, null, { timeout: 30000 });
  const starts = await page.$$eval('#start option', (o) => o.length);
  check('PL01 a pack offers its arcs as start points', starts > 0, `${starts} arcs`);
  await page.fill('#pname', '林');
  await page.fill('#pdesc', '一名在港口城镇长大的年轻制图师，熟悉每一条小巷。');
  await page.click('#go');
  await page.waitForSelector('#chat', { timeout: 60000 });
  const bound = await page.evaluate(() => { const c = globalThis.CanonPlay.engine.campaign(); return { enabled: c?.enabled, pack: c?.packHash?.slice(0, 8), rec: c?.recoveryState?.status }; });
  check('PL02 the game is bound to the pack in the browser (no SillyTavern)', bound.enabled === true && !!bound.pack && bound.rec === 'ok', JSON.stringify(bound));

  // a turn
  await mock('/control', { clearLogs: true });
  await page.fill('#input', '我走向码头，观察来往的船只。');
  await page.click('#send');
  await page.waitForSelector('.msg.gm', { timeout: 90000 });
  const gm = await page.textContent('.msg.gm .text');
  check('PL03 a turn runs the engine and publishes the GM reply', /钟声/.test(gm || ''), (gm || '').slice(0, 40));
  const l1 = await logs();
  const tasks = [...new Set(l1.filter((x) => x.type === 'task').map((x) => x.task))];
  const main = l1.filter((x) => x.type === 'main');
  check('PL04 the analysis tasks ran (Persona read, the player message, the plan, the review)', ['profile', 'extract_user', 'plan', 'evaluate'].every((t) => tasks.includes(t)), tasks.join(','));
  const prompt = main[0] ? main[0].messages.map((m) => `${m.role}: ${m.content}`).join('\n') : '';
  check('PL05 the GM prompt: instructions, the player character, the engine context before the latest message', /主持人（GM）/.test(prompt) && /PLAYER CHARACTER/.test(prompt) && /林/.test(prompt) && (() => { const m = main[0].messages, u = m.map((x) => x.role).lastIndexOf('user'); return u > 0 && /\[CANON ENGINE CONTEXT/.test(m[u - 1].content); })(), `${main[0]?.messages.map((x) => x.role).join(',')}`);
  const st1 = await page.evaluate(() => ({ rec: globalThis.CanonPlay.engine.campaign().recoveryState.status, profile: !!globalThis.CanonPlay.engine.playerProfile() }));
  check('PL06 the turn committed and the player has a profile', st1.rec === 'ok' && st1.profile, JSON.stringify(st1));

  // another reply in place of the last
  await page.click('#reroll');
  await page.waitForFunction(() => document.querySelector('.msg.gm .tools span')?.textContent === '2/2', null, { timeout: 90000 });
  check('PL07 another reply keeps the first as an alternative (2/2)', /码头/.test(await page.textContent('.msg.gm .text') || ''));

  // an edit of the player's message: the world is rebuilt from it
  await mock('/control', { clearLogs: true });
  await page.hover('.msg.user');
  await page.click('.msg.user [data-edit]');
  await page.fill('.msg.user textarea', '我走向码头，向一位渔夫打听今天的船期。');
  await page.click('.msg.user [data-ok]');
  await page.waitForFunction(() => !globalThis.CanonPlay.engine.isBusy(), null, { timeout: 90000 });
  await sleep(500);
  const reread = (await logs()).filter((x) => x.type === 'task' && x.task === 'extract_user').length;
  const st2 = await page.evaluate(() => globalThis.CanonPlay.engine.campaign().recoveryState.status);
  check('PL08 editing a message re-reads it and rebuilds the world', reread >= 1 && st2 === 'ok', `extract_user ×${reread}, ${st2}`);

  // the saved game survives a reload
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('[data-open]');
  await page.click('[data-open]');
  await page.waitForSelector('.msg.gm', { timeout: 30000 });
  const after = await page.evaluate(() => ({ msgs: document.querySelectorAll('.msg').length, rev: globalThis.CanonPlay.engine.campaign()?.revision, rec: globalThis.CanonPlay.engine.campaign()?.recoveryState.status }));
  check('PL09 the game is kept in the browser and opens again', after.msgs === 2 && after.rec === 'ok', JSON.stringify(after));

  // the engine's own panels
  await page.click('#tl');
  await page.waitForSelector('.canon-graph-panel .cg-node', { timeout: 15000 });
  const nodes = await page.$$eval('.canon-graph-panel .cg-node', (n) => n.length);
  check('PL10 the timeline window opens with the game\'s events', nodes > 0, `${nodes} boxes`);
  await page.click('.canon-graph-panel [data-act="close"]');
  await page.click('#insp');
  await page.waitForFunction(() => [...document.querySelectorAll('[class*="ci-"]')].some((e) => e.offsetParent !== null), null, { timeout: 15000 });
  check('PL11 the inspector opens', true);

  // a second turn after the reload
  await page.fill('#input', '我谢过渔夫，沿着码头继续往前走。');
  await page.click('#send');
  await page.waitForFunction(() => document.querySelectorAll('.msg.gm').length === 2, null, { timeout: 90000 });
  check('PL12 play goes on after the reload', /雾/.test((await page.$$eval('.msg.gm .text', (e) => e.at(-1).textContent)) || ''));
  await page.screenshot({ path: join(ROOT, 'tests', 'e2e', 'out', 'play-01.png') });
  check('PL13 no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
} catch (e) {
  console.error(e);
  check('PL99 the run finished', false, String(e).slice(0, 300));
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
