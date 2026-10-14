// Playwright helpers driving the real SillyTavern front end.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.PLAYWRIGHT_PATH || 'C:/Users/agent/e2e-tools/package.json');
const { chromium } = require('playwright');

export const ST_URL = process.env.ST_URL || 'http://127.0.0.1:8000';
export const MOCK_URL = process.env.MOCK_URL || 'http://127.0.0.1:5555';
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function mock(path, body) {
  const resp = await fetch(MOCK_URL + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return resp.json();
}

export async function launch() {
  const browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const page = await context.newPage();
  const consoleLines = [];
  page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => consoleLines.push(`[pageerror] ${e.message}`));
  page.on('dialog', (d) => d.accept());
  return { browser, context, page, consoleLines };
}

export async function openST(page) {
  await page.goto(ST_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.SillyTavern?.getContext && !!window.CanonEngine?.engine, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  for (let k = 0; k < 5; k++) {
    const b = await page.$('dialog[open] .popup-button-ok');
    if (!b) break;
    await b.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await connect(page);
}

export async function connect(page) {
  await page.evaluate(async (mockUrl) => {
    const $ = window.jQuery;
    $('#main_api').val('openai').trigger('change');
    await new Promise((r) => setTimeout(r, 200));
    $('#chat_completion_source').val('custom').trigger('change');
    await new Promise((r) => setTimeout(r, 200));
    $('#custom_api_url_text').val(mockUrl + '/v1').trigger('input').trigger('change');
    $('#custom_model_id').val('mock-main').trigger('input').trigger('change');
  }, MOCK_URL);
  for (let k = 0; k < 4; k++) {
    const st = await page.evaluate(() => SillyTavern.getContext().onlineStatus);
    if (st && st !== 'no_connection') return st;
    await page.evaluate(() => document.querySelector('#api_button_openai')?.click());
    await page.waitForTimeout(2000);
  }
  return page.evaluate(() => SillyTavern.getContext().onlineStatus);
}

export async function newChat(page, name = 'Seraphina') {
  await page.evaluate(async (name) => {
    const ctx = SillyTavern.getContext();
    let id = ctx.characters.findIndex((c) => c.name === name);
    if (id < 0) id = 0;
    if (String(ctx.characterId) !== String(id)) await ctx.selectCharacterById(id);
  }, name);
  await page.waitForTimeout(1200);
  await page.evaluate(async () => { const m = await import('/script.js'); await m.doNewChat({ deleteCurrentChat: false }); });
  await page.waitForTimeout(2000);
}

export function packText(name = 'demo.canon.json') {
  return readFileSync(join(ROOT, 'examples', name), 'utf8');
}

/** Programmatic binding through the engine API (the wizard calls the same functions). */
export async function bind(page, text, startTick) {
  return page.evaluate(async ({ text, startTick }) => {
    const E = window.CanonEngine.engine;
    const r = await E.bind(text, { startTick, mode: SillyTavern.getContext().chat.length > 1 ? 'existing' : 'new' });
    await E.reconcile('test_bind');
    return r;
  }, { text, startTick });
}

export async function waitIdle(page, timeout = 90000) {
  await page.waitForFunction(() => { const E = window.CanonEngine.engine; return !E.isBusy() && !['reconciling', 'planning', 'generating', 'validating', 'committing'].includes(E.status.phase); }, null, { timeout, polling: 200 });
  await page.waitForTimeout(300);
}

/** Type into the native composer and press Send (native workflow). */
export async function send(page, text) {
  const before = await page.evaluate(() => SillyTavern.getContext().chat.length);
  await page.fill('#send_textarea', text);
  await page.click('#send_but');
  // Native send may be held by other extensions (e.g. Horae's wait-before-send) before our interceptor runs.
  await page.waitForFunction((n) => SillyTavern.getContext().chat.length > n || window.CanonEngine.engine.isBusy(), before, { timeout: 90000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(400);
  await waitIdle(page);
}

export async function chat(page) {
  return page.evaluate(() => SillyTavern.getContext().chat.map((m, i) => ({ i, is_user: m.is_user, is_system: m.is_system, mes: m.mes, swipe_id: m.swipe_id, swipes: m.swipes?.length || 0, ce: m.extra?.canonEngine || null, bg: m.horae_meta?._bg || null })));
}

export async function campaign(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(SillyTavern.getContext().chatMetadata.canonEngine || null)));
}

export async function engineState(page) {
  return page.evaluate(() => {
    const E = window.CanonEngine.engine;
    const s = E.current?.replay.state;
    if (!s) return null;
    const facts = {};
    for (const [k, list] of s.facts) { const last = list[list.length - 1]; facts[k] = last.op === 'set' ? last.value : null; }
    return { status: E.status, facts, clock: s.clock, dispositions: Object.fromEntries([...s.dispositions].map(([k, v]) => [k, v.disposition])), occurrences: [...s.occurrences.values()].map((o) => ({ id: o.occurrenceId, title: o.title, account: o.account, packEventId: o.packEventId || null, origin: o.origin })), recovery: E.campaign()?.recoveryState, notices: E.notices.slice(-5), trace: E.lastTrace };
  });
}

export function check(results, name, cond, detail = '') {
  results.push({ name, pass: !!cond, detail: String(detail).slice(0, 600) });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 300) : ''}`);
}

export async function logs() { return mock('/logs'); }
export const mainLogs = async () => (await logs()).filter((l) => l.type === 'main');
export const taskLogs = async (task) => (await logs()).filter((l) => l.type === 'task' && (!task || l.task === task));
export const auxLogs = async () => (await logs()).filter((l) => l.type === 'aux');
export const promptText = (entry) => entry.messages.map((m) => `[${m.role}] ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n');
