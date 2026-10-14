// Quick smoke: extension loads, binds, one managed turn commits.
import { launch, openST, newChat, packText, bind, send, chat, engineState, mock, mainLogs, taskLogs, promptText } from './lib.mjs';

const { browser, page, consoleLines } = await launch();
try {
  await mock('/reset', {});
  await openST(page);
  await newChat(page);
  const r = await bind(page, packText(), 480);
  console.log('bind', JSON.stringify(r));
  await mock('/control', { mainQueue: ['港口的晨雾里，钟声缓缓响起。远处传来商贩的叫卖。你要做什么？'], clearLogs: true });
  await send(page, '我走向码头，观察来往的船只。');
  console.log(JSON.stringify(await chat(page), null, 1).slice(0, 3000));
  const st = await engineState(page);
  console.log('status', JSON.stringify(st?.status), 'recovery', JSON.stringify(st?.recovery), 'notices', JSON.stringify(st?.notices));
  const ml = await mainLogs();
  console.log('main requests', ml.length, ml.map((m) => m.stream));
  if (ml[0]) console.log(promptText(ml[0]).slice(0, 4000));
  console.log('tasks', (await taskLogs()).map((t) => t.task));
} catch (e) {
  console.error('ERROR', e);
} finally {
  console.log(consoleLines.filter((l) => /CanonEngine|pageerror|error/i.test(l)).slice(-40).join('\n'));
  await browser.close();
}
