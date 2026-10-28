// Time frames in the real SillyTavern front end (mock model): bind the frames example pack, travel to another
// frame and back, check the GM's prompt, the timeline (frame stripes, local time, 现在, 当前时空) and the manual
// frame switch. Usage: node tests/e2e/frames.mjs [screenshot-dir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, openST, newChat, bind, send, mock, logs, engineState, ROOT } from './lib.mjs';

const shots = process.argv[2] || null;
const D = (day, h, m = 0) => ({ day, minute: h * 60 + m });
const end = (day, h, m = 0) => ({ scene_end: { lo: D(day, h, m), hi: D(day, h, m), precision: 'minute' } });
const rule = (task, match, patch) => ({ task, match, patch });
const pack = readFileSync(join(ROOT, 'examples', 'frames-demo.canon.json'), 'utf8');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); ok ? pass++ : fail++; };
const draftPrompts = async () => (await logs()).filter((l) => l.type !== 'task' && l.type !== 'aux' && l.type !== 'embed').map((l) => (l.messages || []).map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));

const { browser, page, consoleLines } = await launch();
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  const r = await bind(page, pack, 13 * 60 + 50 + 1440, { y: 2031, m: 3, d: 2 });
  check('FX01 the frames example pack binds', !!r && !r.unresolved?.length && !!(await page.evaluate(() => window.CanonEngine.engine.campaign())), JSON.stringify(r).slice(0, 160));

  await mock('/control', { mainQueue: ['转移室的指示灯一盏盏亮起。FX_A'], taskRules: [rule('evaluate', 'FX_A', end(1, 13, 55))], clearLogs: true });
  await send(page, '我们去转移室准备出发。');
  const p1 = (await draftPrompts()).slice(-1)[0] || '';
  check('FX02 the GM prompt has TIME FRAMES with the harbor\'s local time and the scene in the main frame',
    /TIME FRAMES: every story time in this context is on the main clock \(时序管理局本部\)/.test(p1) && /1600年的港城 \[harbor-1600\]: local time now 1600-04-12 13:50/.test(p1) && /The scene is in 时序管理局本部/.test(p1),
    (p1.match(/TIME FRAMES[^\n]*\n[^\n]*/) || [''])[0].slice(0, 200));
  const ev1 = (await logs()).filter((l) => l.type === 'task' && l.task === 'evaluate').slice(-1)[0]?.input;
  check('FX03 the reviewer is asked for scene_frame', ev1?.time_frames?.scene_frame_now === 'main' && /scene_frame/.test(ev1?.time_frames?.rule || ''));

  await mock('/control', { mainQueue: ['光芒散去，海风扑面，你们站在1600年港城的码头上。FX_B'], taskRules: [rule('evaluate', 'FX_B', { ...end(1, 14, 5), scene_frame: 'harbor-1600' })], clearLogs: true });
  await send(page, '启动转移。');
  let st = await engineState(page);
  const frame1 = await page.evaluate(() => window.CanonEngine.engine.sceneFrameNow());
  check('FX04 the reviewer\'s scene_frame moves the scene to the harbor', frame1?.id === 'harbor-1600' && frame1?.local === '1600-04-12 14:05', JSON.stringify(frame1));

  await mock('/control', { mainQueue: ['你们沿着石阶走向高处的教堂。FX_C'], taskRules: [rule('evaluate', 'FX_C', end(1, 14, 30))], clearLogs: true });
  await send(page, '我们去教堂打听消息。');
  const p3 = (await draftPrompts()).slice(-1)[0] || '';
  check('FX05 the next GM prompt says the scene is in the harbor with its local time', /The scene is in 1600年的港城: local time now 1600-04-12 14:05/.test(p3));

  // timeline
  await page.evaluate(() => { const c = window.CanonEngine.engine.campaign(); c.uiPreferences.spoilers = true; document.querySelector('#canon-engine-top-button .canon-top-toggle')?.click(); });
  await page.waitForSelector('#canon-graph-panel .cg-svg', { timeout: 15000 });
  const ui = await page.evaluate(() => {
    const el = document.querySelector('#canon-graph-panel');
    return {
      now: el.querySelector('.cg-now-label')?.textContent,
      sel: el.querySelector('.cg-frame-sel')?.value,
      opts: [...el.querySelectorAll('.cg-frame-sel option')].map((o) => o.textContent),
      stripes: el.querySelectorAll('.cg-frame').length,
      legend: [...el.querySelectorAll('.cg-fkey')].map((x) => x.textContent),
      subs: [...el.querySelectorAll('.cg-node-sub')].map((x) => x.textContent).filter((t) => /港城|妖精丘|梦之庭/.test(t)),
    };
  });
  const fNow = await page.evaluate(() => window.CanonEngine.engine.sceneFrameNow());
  check('FX06 timeline: 现在 names the harbor and its local time; 当前时空 shows it', ui.now === `现在 · 1600年的港城 ${fNow.local}` && /^1600-04-12 14:/.test(fNow.local) && ui.sel === 'harbor-1600' && ui.opts.length === 4, JSON.stringify({ now: ui.now, sel: ui.sel, opts: ui.opts }));
  check('FX07 timeline: events in other frames carry a colored stripe, local dates and a legend', ui.stripes >= 5 && ui.legend.length === 3 && ui.subs.some((t) => /1600年的港城 1600-04-12/.test(t)), JSON.stringify({ stripes: ui.stripes, legend: ui.legend, subs: ui.subs.slice(0, 4) }));
  // the details panel of an event in the harbor
  await page.evaluate(() => document.querySelector('#canon-graph-panel .cg-node[data-id="church"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await page.waitForTimeout(300);
  const detail = await page.evaluate(() => document.querySelector('#canon-graph-panel .cg-detail')?.textContent || '');
  check('FX08 the details panel shows the frame and local time span', /时空：1600年的港城（当地 1600-04-12 16:00 起，至 1600-04-12 20:00）/.test(detail));
  if (shots) await page.screenshot({ path: join(shots, 'frames-timeline.png') });

  // manual switch back to the main frame
  await page.selectOption('#canon-graph-panel .cg-frame-sel', 'main');
  await page.waitForFunction(() => window.CanonEngine.engine.sceneFrameNow()?.id === 'main', null, { timeout: 15000 }).catch(() => {});
  const frame2 = await page.evaluate(() => window.CanonEngine.engine.sceneFrameNow());
  check('FX09 当前时空 switches the scene back by hand', frame2?.id === 'main', JSON.stringify(frame2));
  await page.waitForTimeout(500);
  const now2 = await page.evaluate(() => document.querySelector('#canon-graph-panel .cg-now-label')?.textContent);
  check('FX10 现在 follows', now2 === '现在 · 时序管理局本部', now2);
  st = await engineState(page);
  check('FX11 no engine errors', !st?.status?.errorKind, JSON.stringify(st?.status).slice(0, 200));
  if (shots) await page.screenshot({ path: join(shots, 'frames-main.png') });
} catch (e) {
  console.error('ERROR', e);
  fail++;
} finally {
  const errs = consoleLines.filter((l) => /pageerror/i.test(l));
  if (errs.length) console.log(errs.slice(-10).join('\n'));
  console.log(`\n${pass}/${pass + fail} passed`);
  await browser.close();
}
process.exit(fail ? 1 : 0);
