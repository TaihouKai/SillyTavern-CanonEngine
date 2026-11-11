// Canon Engine Play: the web host's page. A title screen (new game, saved games), the game (the conversation, the
// composer, the turn's status) and the engine's own timeline window and inspector. Everything stays in the browser.
import {
  CanonEngine, DEFAULT_SETTINGS, GraphPanel, createInspector, formatTick, formatUsd, labelForError, parseOriginLabel, setLang, t as coreT, timelineData,
  type ChatMsg, type EngineSettings,
} from '../../core';
import { WebHost } from './host';
import { PROVIDERS, WebModel, type Connection } from './model';
import { GM_PROMPT_EN, GM_PROMPT_ZH } from './gm';
import { saves, type Save } from './store';
import { WriterLock } from '../browser/lock';

// ------------------------------------------------------------------------------------------------ texts
const TEXT = {
  en: {
    brand: 'Play', newGame: 'New game', games: 'Saved games', noGames: 'No saved games yet.', continue: 'Continue', del: 'Delete', delAsk: 'Delete this game? This cannot be undone.',
    pack: 'History pack', packExample: 'Example: A Certain Magical Index (7 MB)', packDemo: 'Example: a tiny harbor town', packFile: 'Your own .canon.json…', packLoading: 'Loading the pack…',
    startAt: 'Start at', persona: 'Your character', personaName: 'Name', personaDesc: 'Who they are: background, abilities, what they belong to, their secrets…',
    worldNotes: 'World notes (optional)', worldNotesPh: 'Anything the GM should know about this game’s world that is not in the pack.',
    start: 'Start the game', starting: 'Setting up the world…', needConn: 'Connect a model first (Settings).',
    settings: 'Settings', timeline: 'Timeline', inspector: 'Inspector', send: 'Send', reroll: 'Another reply', cont: 'Continue', stop: 'Stop', retry: 'Retry',
    composer: 'What do you do or say?', firstHint: 'The world is ready. Write what your character does first — where they are, what they are doing.',
    edit: 'Edit', save: 'Save', cancel: 'Cancel', remove: 'Delete',
    story: 'Story model', tasks: 'Analysis model', sameAsStory: 'Same as the story model', provider: 'Provider', custom: 'Custom', baseUrl: 'API base URL', apiKey: 'API key', model: 'Model',
    temperature: 'Temperature', maxTokens: 'Max reply tokens', extraBody: 'Extra request parameters (JSON)', replyLength: 'Reply length (e.g. “about 800 words”)', language: 'Language', gmPrompt: 'GM instructions',
    keyNote: 'Your key and games stay in this browser; requests go straight from this page to the provider.', close: 'Close', cost: 'This turn', ready: 'Ready',
    openElsewhere: 'This game is open in another tab. Close it there first.',
  },
  zh: {
    brand: '游玩', newGame: '新游戏', games: '存档', noGames: '还没有存档。', continue: '继续', del: '删除', delAsk: '删除这个存档？无法恢复。',
    pack: '历史包', packExample: '示例：魔法禁书目录（7 MB）', packDemo: '示例：海港小镇', packFile: '自己的 .canon.json…', packLoading: '正在载入历史包…',
    startAt: '开局时间', persona: '你的角色', personaName: '名字', personaDesc: '是谁：背景、能力、所属、秘密……',
    worldNotes: '世界说明（可选）', worldNotesPh: '这一局的世界里 GM 应该知道、而历史包里没有的事。',
    start: '开始游戏', starting: '正在搭建世界……', needConn: '先连接一个模型（设置）。',
    settings: '设置', timeline: '时间线', inspector: '检查面板', send: '发送', reroll: '换一个回复', cont: '继续写', stop: '停止', retry: '重试',
    composer: '你做什么、说什么？', firstHint: '世界已经就绪。写下你的角色最先做的事——在哪里、在做什么。',
    edit: '编辑', save: '保存', cancel: '取消', remove: '删除',
    story: '剧情模型', tasks: '分析模型', sameAsStory: '与剧情模型相同', provider: '服务商', custom: '自定义', baseUrl: 'API 地址', apiKey: 'API key', model: '模型',
    temperature: '温度', maxTokens: '回复最大 token', extraBody: '额外请求参数（JSON）', replyLength: '回复长度（例如「正文约800~1200字」）', language: '语言', gmPrompt: 'GM 指令',
    keyNote: 'key 和存档只保存在这个浏览器里；请求从本页直接发往服务商。', close: '关闭', cost: '本回合', ready: '就绪',
    openElsewhere: '这个存档正在另一个标签页里打开，先在那边关掉。',
  },
};
type Key = keyof typeof TEXT.en;
let lang: 'en' | 'zh' = 'en';
const L = (k: Key) => TEXT[lang][k] ?? TEXT.en[k];
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;

// ------------------------------------------------------------------------------------------------ settings (this browser)
interface PlaySettings { story: Connection; tasks: Connection | null; engine: Partial<EngineSettings>; lang?: 'en' | 'zh'; gmPrompt?: string; inspectorOpen: boolean }
const SKEY = 'canon-play-settings';
const blankConn = (): Connection => ({ baseUrl: PROVIDERS[0].baseUrl, apiKey: '', model: PROVIDERS[0].model, temperature: 0.8, maxTokens: 4096, extraBody: '' });
function loadSettings(): PlaySettings {
  let s: Partial<PlaySettings> = {};
  try { s = JSON.parse(localStorage.getItem(SKEY) || '{}'); } catch { /* blocked or broken: defaults */ }
  return { story: { ...blankConn(), ...(s.story || {}) }, tasks: s.tasks ? { ...blankConn(), ...s.tasks } : null, engine: s.engine || {}, lang: s.lang, gmPrompt: s.gmPrompt, inspectorOpen: !!s.inspectorOpen };
}
let settings = loadSettings();
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch { /* the session keeps them */ } };
// lets a test or a link point the page at a server: ?base=…&model=…&key=…
{
  const q = new URLSearchParams(location.search);
  if (q.get('base')) { settings.story = { ...settings.story, baseUrl: q.get('base')!, model: q.get('model') || settings.story.model, apiKey: q.get('key') ?? settings.story.apiKey }; settings.tasks = null; }
}
lang = settings.lang || ((navigator.languages || [navigator.language]).some((l) => /^zh\b/i.test(l)) ? 'zh' : 'en');
setLang(lang);
const gmPrompt = () => settings.gmPrompt?.trim() || (lang === 'zh' ? GM_PROMPT_ZH : GM_PROMPT_EN);

// ------------------------------------------------------------------------------------------------ the engine in this page
const model = new WebModel(() => settings.story, () => settings.tasks, () => ({
  gmPrompt: gmPrompt(), persona: host.game?.persona || { name: 'Player', description: '' }, worldNotes: host.game?.worldNotes || '',
  history: (host.game?.chat || []).map((m): ChatMsg => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
}));
const host = new WebHost(model);
const engine = new CanonEngine(host, { ...DEFAULT_SETTINGS, ...settings.engine });
// one tab plays a saved game at a time: two would each write the whole save over the other's
const lock = new WriterLock(crypto.randomUUID());
host.writerCheck = () => lock.isOwner();
(globalThis as any).CanonPlay = { engine, host, model };

// ------------------------------------------------------------------------------------------------ toasts
function toast(level: 'info' | 'error' | 'warning', msg: string) {
  const el = document.createElement('div');
  el.className = `toast ${level}`;
  el.textContent = msg;
  el.addEventListener('click', () => el.remove());
  $('#toasts').appendChild(el);
  if (level !== 'error') setTimeout(() => el.remove(), level === 'warning' ? 12000 : 5000);
}
let noticesSeen = 0;
engine.onChange(() => {
  if (engine.noticeSeq > noticesSeen) {
    for (const n of engine.notices.slice(-(engine.noticeSeq - noticesSeen))) toast(n.level === 'warn' ? 'warning' : n.level, n.text);
    noticesSeen = engine.noticeSeq;
  }
  renderStatus();
  inspector.render();
  graph.refreshIfChanged(`${engine.campaign()?.revision}|${host.game?.chat.length}|${engine.status.phase}`);
});

// ------------------------------------------------------------------------------------------------ the engine's own panels
const graph = new GraphPanel(() => timelineData(engine), (v) => { const camp = engine.campaign(); if (camp) { camp.uiPreferences.spoilers = v; void host.save(); } }, async (act, id, ids) => {
  try {
    if (act === 'force') await engine.forceComplete(id);
    else if (act === 'focus') await engine.toggleFocus(id);
    else if (act === 'digest') await engine.digestEvents();
    else if (act === 'undigest') await engine.clearDigest();
    else if (act === 'set-frame') await engine.setSceneFrame(id);
    else if (act === 'link-occurred' || act === 'link-diverged') await engine.linkEvent(id, ids || [], act === 'link-occurred' ? 'occurred' : 'diverged');
    else if (act === 'conclude') await engine.concludeEvent(id);
    else if (act === 'reanalyze' && ids?.length) await engine.reanalyzeOccurrences(ids);
    else if (act === 'reanalyze') await engine.reanalyzeEvent(id);
    else await engine.undoForce(id);
  } catch (e) { toast('error', (e as Error).message); }
}, (id) => { try { return engine.linkCandidates(id); } catch { return []; } },
() => { try { return engine.membershipView(!!engine.campaign()?.uiPreferences.spoilers); } catch { return null; } },
() => { try { return engine.natureView(!!engine.campaign()?.uiPreferences.spoilers); } catch { return null; } });

const inspector = createInspector({
  engine: () => engine,
  settings: () => ({ inspectorOpen: settings.inspectorOpen, quietDayJobs: engine.settings.quietDayJobs }),
  saveSettings: () => { settings.inspectorOpen = !!(engine.settings as any).inspectorOpen || settings.inspectorOpen; saveSettings(); },
  refreshUi: () => render(),
  toast,
  tip: (key) => (key ? `<span class="tip" title="${esc(coreT(key))}">ⓘ</span>` : ''),
  lastDraftPrompt: () => model.lastDraftPrompt,
});

// ------------------------------------------------------------------------------------------------ title screen
async function renderTitle() {
  const list = await saves.list();
  $('#app').innerHTML = `
    <section class="title">
      <div class="card new">
        <h2>${L('newGame')}</h2>
        <label>${L('pack')}<select id="pack"><option value="">—</option><option value="../data/toaru-index.canon.json">${L('packExample')}</option><option value="../data/demo.canon.json">${L('packDemo')}</option><option value="file">${L('packFile')}</option></select></label>
        <input type="file" id="packfile" accept=".json" hidden>
        <div id="packinfo" class="muted"></div>
        <label>${L('startAt')}<select id="start" disabled></select></label>
        <fieldset><legend>${L('persona')}</legend>
          <label>${L('personaName')}<input id="pname" autocomplete="off"></label>
          <label><textarea id="pdesc" rows="5" placeholder="${esc(L('personaDesc'))}"></textarea></label>
        </fieldset>
        <label>${L('worldNotes')}<textarea id="wnotes" rows="2" placeholder="${esc(L('worldNotesPh'))}"></textarea></label>
        <button class="btn primary" id="go" disabled>${L('start')}</button>
        <div id="gostatus" class="muted"></div>
      </div>
      <div class="card games">
        <h2>${L('games')}</h2>
        ${list.length ? list.map((g) => `<div class="game" data-id="${esc(g.id)}"><div><b>${esc(g.title)}</b><small>${new Date(g.updatedAt).toLocaleString()} · ${g.chat.length}</small></div><div><button class="btn" data-open="${esc(g.id)}">${L('continue')}</button><button class="btn ghost" data-del="${esc(g.id)}">${L('del')}</button></div></div>`).join('') : `<p class="muted">${L('noGames')}</p>`}
      </div>
    </section>`;
  let packText = '';
  const packSel = $<HTMLSelectElement>('#pack'), startSel = $<HTMLSelectElement>('#start'), info = $('#packinfo'), go = $<HTMLButtonElement>('#go');
  const usePack = (text: string) => {
    packText = text;
    const p = engine.previewPack(text);
    if (!p.ok || !p.summary) { info.textContent = p.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; '); go.disabled = true; return; }
    const S = p.summary, origin = parseOriginLabel(S.originLabel);
    info.textContent = `${S.title} · ${S.events} · ${S.hardCount} HARD`;
    startSel.innerHTML = S.arcs.map((a) => `<option value="${a.lo - 1}">${esc(formatTick(a.lo, origin).replace(/\s*\(D-?\d+\)$/, ''))} — ${esc(a.title)}</option>`).join('');
    const story = S.arcs.findIndex((a) => a.lo >= 0);
    startSel.selectedIndex = Math.max(0, story);
    startSel.disabled = false; go.disabled = false;
  };
  packSel.addEventListener('change', async () => {
    go.disabled = true; startSel.disabled = true; info.textContent = '';
    if (packSel.value === 'file') { $<HTMLInputElement>('#packfile').click(); return; }
    if (!packSel.value) return;
    info.textContent = L('packLoading');
    try { usePack(await (await fetch(packSel.value)).text()); } catch (e) { info.textContent = (e as Error).message; }
  });
  $<HTMLInputElement>('#packfile').addEventListener('change', async (ev) => {
    const f = (ev.target as HTMLInputElement).files?.[0];
    if (f) usePack(await f.text());
  });
  go.addEventListener('click', async () => {
    if (!settings.story.baseUrl || !settings.story.model) { toast('warning', L('needConn')); openSettings(); return; }
    const name = $<HTMLInputElement>('#pname').value.trim() || 'Player';
    const p = engine.previewPack(packText);
    const game: Save = {
      id: crypto.randomUUID(), title: `${name} · ${p.summary?.title || ''}`, createdAt: Date.now(), updatedAt: Date.now(), integrity: crypto.randomUUID(),
      persona: { name, description: $<HTMLTextAreaElement>('#pdesc').value.trim() }, worldNotes: $<HTMLTextAreaElement>('#wnotes').value.trim(), chat: [], campaign: null,
    };
    go.disabled = true;
    $('#gostatus').textContent = L('starting');
    try {
      host.game = game;
      lock.setCampaign(game.id);
      await host.save();
      const origin = parseOriginLabel(p.summary!.originLabel);
      await engine.bind(packText, { startTick: Number(startSel.value), originDate: origin, mode: 'new' });
      await engine.reconcile('binding');
      await openGame(game.id);
    } catch (e) {
      await leaveGame();
      await saves.delete(game.id);
      $('#gostatus').textContent = (e as Error).message;
      go.disabled = false;
    }
  });
  for (const b of document.querySelectorAll<HTMLElement>('[data-open]')) b.addEventListener('click', () => openGame(b.dataset.open!));
  for (const b of document.querySelectorAll<HTMLElement>('[data-del]')) b.addEventListener('click', async () => {
    if (!confirm(L('delAsk'))) return;
    const id = b.dataset.del!;
    // not from under the tab that is playing it (its next save would bring it back)
    if (!(await lock.acquire(id))) { lock.setCampaign(null); toast('warning', L('openElsewhere')); return; }
    await saves.delete(id);
    lock.setCampaign(null);
    renderTitle();
  });
  renderTop();
}

/** Back to no game: what the engine was doing for the game ends first, then the game is let go for other tabs. */
async function leaveGame() {
  host.game = null;
  engine.sourceChanged('chat_changed');
  try { await engine.onChatLoaded(); } catch { /* nothing is open */ }
  lock.setCampaign(null);
}

// ------------------------------------------------------------------------------------------------ the game
async function openGame(id: string) {
  if (!(await lock.acquire(id))) {
    lock.setCampaign(null);
    toast('warning', L('openElsewhere'));
    if (host.game) await leaveGame();
    return renderTitle();
  }
  const g = await saves.get(id);
  if (!g) { await leaveGame(); return renderTitle(); }
  host.game = g;
  $('#app').innerHTML = `
    <section class="play">
      <div class="chat" id="chat"></div>
      <div class="statusline" id="status"></div>
      <div class="composer">
        <textarea id="input" rows="3" placeholder="${esc(L('composer'))}"></textarea>
        <div class="actions">
          <button class="btn primary" id="send">${L('send')}</button>
          <button class="btn ghost" id="reroll">${L('reroll')}</button>
          <button class="btn ghost" id="cont">${L('cont')}</button>
          <button class="btn ghost" id="stop" hidden>${L('stop')}</button>
        </div>
      </div>
    </section>`;
  const input = $<HTMLTextAreaElement>('#input');
  $('#send').addEventListener('click', () => send());
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });
  $('#reroll').addEventListener('click', () => run('swipe'));
  $('#cont').addEventListener('click', () => run('continue'));
  $('#stop').addEventListener('click', () => engine.cancel());
  renderTop();
  renderChat();
  renderStatus();
  try { await engine.onChatLoaded(); } catch (e) { toast('error', (e as Error).message); }
  render();
}

async function send() {
  const input = $<HTMLTextAreaElement>('#input');
  const text = input.value.trim();
  if (!text || engine.isBusy()) return;
  input.value = '';
  host.addUser(text);
  await host.save();
  renderChat();
  await run('normal');
}
async function run(op: 'normal' | 'swipe' | 'continue') {
  if (engine.isBusy()) return;
  const last = host.game?.chat.at(-1);
  if (op !== 'normal' && last?.role !== 'gm') return;
  if (op === 'normal' && last?.role !== 'user') return;
  await engine.runOperation(op);
  const tm = engine.lastTimings;
  if (tm?.tokens?.costUsd) toast('info', `${L('cost')}: ${formatUsd(tm.tokens.costUsd)}`);
  render();
}
async function changed(reason: string) {
  const game = host.game;
  try {
    await host.save();
    renderChat();
    engine.sourceChanged(reason);
    await engine.reconcile(reason);
  } catch (e) { if (host.game === game) toast('error', (e as Error).message); } // not for a game that was left meanwhile
  render();
}

function paragraphs(text: string) {
  return esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
}
let chatSig = '';
function renderChat(force = false) {
  const el = $('#chat');
  if (!el || !host.game) return;
  const chat = host.game.chat;
  const sig = chat.map((m) => `${m.vid}:${m.text.length}`).join('|');
  if (sig === chatSig && !force) return;
  chatSig = sig;
  el.innerHTML = chat.length ? chat.map((m, i) => `
    <article class="msg ${m.role}" data-i="${i}">
      <div class="who">${esc(m.role === 'user' ? host.game!.persona.name : 'GM')}</div>
      <div class="text">${paragraphs(m.text)}</div>
      <div class="tools">
        ${m.swipes && m.swipes.length > 1 ? `<button data-sw="-1">‹</button><span>${(m.swipeId ?? 0) + 1}/${m.swipes.length}</span><button data-sw="1">›</button>` : ''}
        <button data-edit>${L('edit')}</button>${i === chat.length - 1 ? `<button data-rm>${L('remove')}</button>` : ''}
      </div>
    </article>`).join('') : `<p class="hint">${L('firstHint')}</p>`;
  el.scrollTop = el.scrollHeight;
  for (const a of el.querySelectorAll<HTMLElement>('.msg')) {
    const i = Number(a.dataset.i);
    a.querySelector('[data-edit]')?.addEventListener('click', () => {
      if (engine.isBusy()) return;
      const box = a.querySelector('.text')!;
      box.innerHTML = `<textarea rows="6">${esc(host.game!.chat[i].text)}</textarea><div class="actions"><button class="btn primary" data-ok>${L('save')}</button><button class="btn ghost" data-no>${L('cancel')}</button></div>`;
      box.querySelector('[data-no]')!.addEventListener('click', () => renderChat(true));
      box.querySelector('[data-ok]')!.addEventListener('click', () => { host.edit(i, (box.querySelector('textarea') as HTMLTextAreaElement).value); void changed('message_edited'); });
    });
    a.querySelector('[data-rm]')?.addEventListener('click', () => { if (engine.isBusy()) return; host.remove(i); void changed('message_deleted'); });
    for (const b of a.querySelectorAll<HTMLElement>('[data-sw]')) b.addEventListener('click', () => {
      if (engine.isBusy()) return;
      const m = host.game!.chat[i], k = ((m.swipeId ?? 0) + Number(b.dataset.sw) + m.swipes!.length) % m.swipes!.length;
      host.selectSwipe(i, k); void changed('swipe_selected');
    });
  }
}

function renderStatus() {
  const el = $('#status');
  if (!el) return;
  const s = engine.status, busy = engine.isBusy();
  const rec = engine.campaign()?.recoveryState;
  const err = !busy && (s.phase === 'error' || s.phase === 'conflict' || (rec && rec.status !== 'ok'));
  el.className = `statusline ${busy ? 'busy' : err ? 'err' : ''}`;
  el.innerHTML = busy ? `<i class="spin"></i>${esc(s.message || s.phase)}`
    : err ? `${esc(rec?.reason || s.message || labelForError(String(rec?.errorKind || 'error')))} ${s.canRetry || rec?.status !== 'ok' ? `<button class="btn" id="retry">${L('retry')}</button>` : ''}`
    : '';
  $('#retry')?.addEventListener('click', async () => { await engine.retry(); render(); });
  const stop = $('#stop'); if (stop) stop.hidden = !busy;
  // while a reply is being made the game is not left and not opened again (both would take it from under the turn)
  for (const id of ['send', 'reroll', 'cont', 'home', 'lang']) { const b = $<HTMLButtonElement>('#' + id); if (b) b.disabled = busy; }
}

function render() { renderChat(); renderTop(); renderStatus(); document.body.classList.toggle('insp-open', !!host.game && settings.inspectorOpen); }

// ------------------------------------------------------------------------------------------------ top bar and settings
function renderTop() {
  const inGame = !!host.game && !!$('#chat');
  $('#top').innerHTML = `
    <a class="brand" href="../"><img src="../assets/mark.svg" alt=""><span>CANON<b>ENGINE</b></span><i>${L('brand')}</i></a>
    <div class="gtitle">${inGame ? esc(host.game!.title) : ''}</div>
    <nav>
      ${inGame ? `<button class="btn ghost" id="tl">${L('timeline')}</button><button class="btn ghost" id="insp">${L('inspector')}</button><button class="btn ghost" id="home">${L('games')}</button>` : ''}
      <button class="btn ghost" id="set">${L('settings')}</button>
      <button class="btn ghost" id="lang">${lang === 'zh' ? 'EN' : '中文'}</button>
    </nav>`;
  $('#tl')?.addEventListener('click', () => graph.toggle());
  $('#insp')?.addEventListener('click', () => { settings.inspectorOpen = !settings.inspectorOpen; saveSettings(); inspector.toggle(settings.inspectorOpen); render(); });
  $('#home')?.addEventListener('click', async () => {
    if (engine.isBusy()) return;
    graph.toggle(false); inspector.toggle(false); chatSig = ''; document.body.classList.remove('insp-open');
    await leaveGame();
    void renderTitle();
  });
  $('#set').addEventListener('click', openSettings);
  $('#lang').addEventListener('click', () => {
    if (engine.isBusy()) return;
    lang = lang === 'zh' ? 'en' : 'zh'; settings.lang = lang; saveSettings(); setLang(lang);
    if (host.game && $('#chat')) { chatSig = ''; void openGame(host.game.id); } else void renderTitle();
  });
}

function connFields(id: string, c: Connection) {
  const prov = PROVIDERS.find((p) => p.baseUrl === c.baseUrl)?.id || 'custom';
  return `<div class="conn" data-conn="${id}">
    <label>${L('provider')}<select data-k="provider">${PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === prov ? 'selected' : ''}>${p.label}</option>`).join('')}<option value="custom" ${prov === 'custom' ? 'selected' : ''}>${L('custom')}</option></select></label>
    <label>${L('baseUrl')}<input data-k="baseUrl" value="${esc(c.baseUrl)}"></label>
    <label>${L('apiKey')}<input data-k="apiKey" type="password" value="${esc(c.apiKey)}" autocomplete="off"></label>
    <label>${L('model')}<input data-k="model" value="${esc(c.model)}"></label>
    <div class="row"><label>${L('temperature')}<input data-k="temperature" type="number" step="0.1" value="${c.temperature}"></label><label>${L('maxTokens')}<input data-k="maxTokens" type="number" step="256" value="${c.maxTokens}"></label></div>
    <label>${L('extraBody')}<input data-k="extraBody" value="${esc(c.extraBody)}" placeholder='{"reasoning_effort": "low"}'></label>
  </div>`;
}
function readConn(root: HTMLElement): Connection {
  const v = (k: string) => (root.querySelector(`[data-k="${k}"]`) as HTMLInputElement).value;
  return { baseUrl: v('baseUrl').trim(), apiKey: v('apiKey').trim(), model: v('model').trim(), temperature: Number(v('temperature')) || 0, maxTokens: Number(v('maxTokens')) || 4096, extraBody: v('extraBody') };
}
function openSettings() {
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="sheet">
    <h2>${L('settings')}</h2>
    <h3>${L('story')}</h3>${connFields('story', settings.story)}
    <h3>${L('tasks')}</h3><label class="check"><input type="checkbox" id="same" ${settings.tasks ? '' : 'checked'}>${L('sameAsStory')}</label>
    <div id="taskconn" ${settings.tasks ? '' : 'hidden'}>${connFields('tasks', settings.tasks || { ...settings.story, temperature: 0.2 })}</div>
    <label>${L('replyLength')}<input id="rlen" value="${esc(settings.engine.replyLength || '')}"></label>
    <label>${L('gmPrompt')}<textarea id="gmp" rows="6">${esc(gmPrompt())}</textarea></label>
    <p class="muted">${L('keyNote')}</p>
    <div class="actions"><button class="btn primary" id="ok">${L('save')}</button><button class="btn ghost" id="no">${L('close')}</button></div>
  </div>`;
  document.body.appendChild(m);
  for (const c of m.querySelectorAll<HTMLElement>('.conn')) {
    c.querySelector('[data-k="provider"]')!.addEventListener('change', (e) => {
      const p = PROVIDERS.find((x) => x.id === (e.target as HTMLSelectElement).value);
      if (p) { (c.querySelector('[data-k="baseUrl"]') as HTMLInputElement).value = p.baseUrl; (c.querySelector('[data-k="model"]') as HTMLInputElement).value = p.model; }
    });
  }
  $('#same', m).addEventListener('change', (e) => { $('#taskconn', m).hidden = (e.target as HTMLInputElement).checked; });
  $('#no', m).addEventListener('click', () => m.remove());
  $('#ok', m).addEventListener('click', () => {
    settings.story = readConn($('[data-conn="story"]', m));
    settings.tasks = ($('#same', m) as HTMLInputElement).checked ? null : readConn($('[data-conn="tasks"]', m));
    settings.engine.replyLength = ($('#rlen', m) as HTMLInputElement).value.trim();
    const g = ($('#gmp', m) as HTMLTextAreaElement).value.trim();
    settings.gmPrompt = g && g !== GM_PROMPT_ZH && g !== GM_PROMPT_EN ? g : undefined;
    Object.assign(engine.settings, settings.engine);
    saveSettings();
    m.remove();
  });
}

// ------------------------------------------------------------------------------------------------ start
void renderTitle();
