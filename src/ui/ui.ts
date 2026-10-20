// Small persistent UI: status pill near the composer, settings drawer, binding wizard,
// on-demand inspector (spoilers behind a toggle), per-variant banners and conflict markers.
import type { CanonEngine, EngineSettings } from '../runtime/engine';
import { labelForError, formatUsd } from '../runtime/engine';
import type { StHost } from '../adapters/st';
import { ctx, NS, gen } from '../adapters/st';
import { HoraeAdapter } from '../adapters/horae';
import type { WriterLock } from '../adapters/lock';
import { interpretationsFor, baseKey } from '../runtime/replay';
import { parseTickLabel, parseDateLabel, parseOriginLabel, formatTick } from '../domain/time';
import { t, setLang } from './i18n';
import { primeNotifications, systemNotificationsAvailable } from './notify';
import { GraphPanel, packGraph, currentGraph } from './graph';
import { listLibrary, saveToLibrary, loadFromLibrary, removeFromLibrary, type LibraryEntry } from './library';

export { t };

/* eslint-disable @typescript-eslint/no-explicit-any */
let E: CanonEngine;
let H: StHost;
/** taskProfileId value for "analysis uses the chat's own connection", chosen explicitly ('' = not chosen yet). */
export const CHAT_PROFILE = '__chat__';
let getSettings: () => EngineSettings & { inspectorOpen: boolean; uiLang?: string };
let getLock: () => WriterLock | null;
let inspectorEl: HTMLElement | null = null;
let inspectorTab = 'overview';
let graphPanel: GraphPanel | null = null;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function mountUi(engine: CanonEngine, host: StHost, settings: typeof getSettings, lock: typeof getLock) {
  E = engine; H = host; getSettings = settings; getLock = lock;
  const s = getSettings();
  setLang(s.uiLang === 'en' ? 'en' : 'zh');
  mountSettings();
  mountStatus();
  mountTopButton();
  refreshUi();
}

// ---------------------------------------------------------------------------------------------
// Top-bar button + history graph panel
function mountTopButton() {
  if (document.getElementById('canon-engine-top-button')) return;
  graphPanel = new GraphPanel((sp) => {
    void sp;
    const src = (() => { try { return E.graphSource(); } catch { return null; } })();
    const camp = E.campaign();
    const spoilers = !!camp?.uiPreferences.spoilers;
    if (!src) return { pack: null, current: null, spoilers };
    const now = src.state ? (E.storyNow() ?? src.state.clock.lo) : null;
    const pg = packGraph(src.pack, src.origin); pg.nowTick = now;
    const cur = src.state ? currentGraph(src.pack, src.state, src.origin, spoilers, E.digestGroups()) : null;
    if (cur && now !== null) cur.nowTick = now;
    if (cur) { const f = E.focusEvents(); for (const n of cur.nodes) if (f.has(n.id) && (n.status === 'future' || n.status === 'pending')) { n.focused = true; n.title = '★ ' + n.title; } }
    if (cur) for (const n of cur.nodes) if ((n.status === 'occurred' || n.status === 'diverged') && E.reanalyzableSource(n.id)) n.reanalyzable = true;
    return { pack: pg, current: cur, spoilers, digested: !!camp?.eventDigest };
  }, (v) => { const camp = E.campaign(); if (camp) camp.uiPreferences.spoilers = v; }, async (act, id, ids) => {
    try {
      if (act === 'force') await E.forceComplete(id);
      else if (act === 'focus') await E.toggleFocus(id);
      else if (act === 'digest') { const r = await E.digestEvents(); toast('info', t('digestDone').replace('{n}', String(r.events)).replace('{g}', String(r.groups))); }
      else if (act === 'undigest') await E.clearDigest();
      else if (act === 'link-occurred' || act === 'link-diverged') { await E.linkEvent(id, ids || [], act === 'link-occurred' ? 'occurred' : 'diverged'); toast('info', t('linkDone')); }
      else if (act === 'reanalyze') { const st = await E.reanalyzeEvent(id); toast('info', t('reanalyzeDone').replace('{s}', t('reanalyzeStatus_' + st))); }
      else await E.undoForce(id);
    } catch (e) { toast('error', (e as Error).message); }
  }, (id) => { try { return E.linkCandidates(id); } catch { return []; } });
  const holder = document.getElementById('top-settings-holder');
  const btn = document.createElement('div');
  btn.id = 'canon-engine-top-button';
  btn.className = 'drawer';
  btn.innerHTML = `<div class="drawer-toggle drawer-header canon-top-toggle"><div class="drawer-icon fa-solid fa-diagram-project fa-fw closedIcon" title="${t('graphTitle')}"></div></div>`;
  btn.querySelector('.canon-top-toggle')!.addEventListener('click', (ev) => { ev.stopPropagation(); graphPanel!.toggle(); btn.querySelector('.drawer-icon')!.classList.toggle('openIcon', graphPanel!.isOpen()); btn.querySelector('.drawer-icon')!.classList.toggle('closedIcon', !graphPanel!.isOpen()); });
  // Sit immediately left of the Persona and Character icons when they exist.
  const before = document.getElementById('persona-management-button') || document.getElementById('rightNavHolder');
  if (holder && before?.parentElement === holder) holder.insertBefore(btn, before);
  else if (holder) holder.appendChild(btn);
  else document.body.appendChild(btn);
}

export function openGraph() { graphPanel?.toggle(true); }

// ---------------------------------------------------------------------------------------------
function mountStatus() {
  if (document.getElementById('canon-engine-status')) return;
  const el = document.createElement('div');
  el.id = 'canon-engine-status';
  el.className = 'canon-status';
  const anchor = document.getElementById('send_form');
  if (anchor?.parentElement) anchor.parentElement.insertBefore(el, anchor);
  else document.body.appendChild(el);
  el.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'inspect') toggleInspector(true);
    if (act === 'cancel') E.cancel();
    if (act === 'retry') void E.retry().finally(refreshUi);
    if (act === 'details') showFailureReport();
    if (act === 'goto') gotoConflict();
    if (act === 'branch') void branchFromConflict();
  });
}

/** " · $0.0352" when the provider reported what the turn cost ("+" when some calls reported nothing). */
function costPart(tk: import('../runtime/model').TokenUsage): string {
  if (!tk.costUsd && !tk.diem) return '';
  return ` · ${formatUsd(tk.costUsd || 0)}${tk.costUnreported ? '+' : ''}${tk.diem ? ` · ${tk.diem} DIEM` : ''}`;
}
function costLines(tk: import('../runtime/model').TokenUsage): string[] {
  if (!tk.costUsd && !tk.diem) return tk.calls ? [t('costNone')] : [];
  return [
    `${t('costLabel')} ${formatUsd(tk.costUsd || 0)}${tk.storyCostUsd !== undefined ? ` — ${t('tokStory')} ${formatUsd(tk.storyCostUsd || 0)} · ${t('tokAnalysis')} ${formatUsd((tk.costUsd || 0) - (tk.storyCostUsd || 0))}` : ''}${tk.diem ? ` · ${tk.diem} DIEM` : ''}`,
    ...(tk.costUnreported ? [t('costUnreported').replace('{n}', String(tk.costUnreported))] : []),
  ];
}

function renderStatus() {
  const el = document.getElementById('canon-engine-status');
  if (!el) return;
  const camp = E.campaign();
  if (!camp) { el.style.display = 'none'; return; }
  el.style.display = '';
  const st = E.status;
  const phase = camp.enabled ? (H.isGroup() ? 'disabled' : st.phase) : 'disabled';
  const busy = E.isBusy() || !!st.canCancel || st.phase === 'reconciling';
  const lockOk = getLock()?.isOwner() ?? true;
  const conflict = camp.recoveryState.status === 'conflict';
  // The previous turn's failure stays in recoveryState until a turn succeeds; while a new operation runs,
  // show its progress, not the old error (live finding: "生成中" next to the last turn's Gateway Timeout).
  const err = phase === 'error' || (!busy && (camp.recoveryState.status === 'error' || camp.recoveryState.status === 'unsaved'));
  let msg = '';
  if (!lockOk) msg = t('notWriter');
  else if (conflict) msg = t('conflictMarker') + (camp.recoveryState.reason ? ` (${camp.recoveryState.reason.slice(0, 160)})` : '');
  else if (err) msg = `${labelForError(camp.recoveryState.errorKind || st.errorKind || '')}: ${(camp.recoveryState.reason || st.message || '').slice(0, 220)}`;
  else if (busy) msg = st.message;
  const tm = E.lastTimings;
  const dur = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.max(1, Math.round(ms / 1000))}s`);
  const rp = tm?.reply;
  const replyBits = rp ? [
    rp.outputTokens ? `${t('outTokens')} ${rp.outputTokens}${rp.reasoningTokens ? ` (${t('thinking')} ${rp.reasoningTokens})` : ''}${rp.maxTokens ? ` / ${t('limit')} ${rp.maxTokens}` : ''}` : '',
    rp.finish ? `finish_reason: ${rp.finish}` : '',
  ].filter(Boolean).join('\n') : '';
  const replyPart = rp ? ` · <span class="canon-reply${rp.finish === 'length' ? ' cut' : ''}" title="${esc(replyBits)}">${t('replyLen')} ${rp.chars}${t('charsUnit')}${rp.finish === 'length' ? ` ${t('cutOff')}` : ''}</span>` : '';
  const tk = tm?.tokens;
  const tokenPart = tk && tk.calls && tk.input + tk.output > 0 ? ` · <span class="canon-tokens" title="${esc([`${t('tokIn')} ${tk.input.toLocaleString()} · ${t('tokOut')} ${tk.output.toLocaleString()} · ${tk.calls} ${t('tokCalls')}`, ...(tk.storyInput !== undefined ? [`${t('tokStory')} ${((tk.storyInput || 0) + (tk.storyOutput || 0)).toLocaleString()} · ${t('tokAnalysis')} ${(tk.input + tk.output - (tk.storyInput || 0) - (tk.storyOutput || 0)).toLocaleString()}`] : []), ...(tk.unreported ? [t('tokUnreported').replace('{n}', String(tk.unreported))] : []), ...costLines(tk), t('tokNote')].join('\n'))}">${t('tokUsed')} ${(tk.input + tk.output).toLocaleString()} Token${tk.unreported ? '+' : ''}${costPart(tk)}</span>` : '';
  const timing = !busy && !conflict && tm && tm.steps.length
    ? `<span class="canon-timing" title="${esc([...tm.steps.map((s) => `${t('step_' + s.step)}: ${dur(s.ms)}${s.count > 1 ? ` ×${s.count}` : ''}${s.retries ? ` (${t('resent')} ${s.retries})` : ''}`), ...(tm.rejects?.length ? ['', `${t('resentWhy')}:`, ...tm.rejects] : []), ...(tm.fixes?.length ? ['', `${t('fixedWhy')}:`, ...tm.fixes] : [])].join('\n'))}">${t('lastTurn')} ${dur(tm.totalMs)}：${tm.steps.slice().sort((a, b) => b.ms - a.ms).map((s) => `${esc(t('step_' + s.step))} ${dur(s.ms)}${s.count > 1 ? `×${s.count}` : ''}${s.retries ? `（${esc(t('resent'))}${s.retries}）` : ''}`).join(' · ')}${replyPart}${tokenPart}</span>`
    : '';
  el.dataset.phase = conflict ? 'conflict' : phase;
  el.innerHTML = `<span class="canon-dot"></span><b>Canon</b> <span class="canon-phase">${esc(t('phase_' + (conflict ? 'conflict' : phase)))}</span>
    <span class="canon-msg" title="${esc(msg)}">${esc(msg)}</span>${timing}
    <span class="canon-actions">
      ${busy && st.canCancel !== false ? `<button class="menu_button canon-btn" data-act="cancel">${t('cancel')}</button>` : ''}
      ${!busy && (err || conflict) ? `<button class="menu_button canon-btn" data-act="retry">${t('retry')}</button>` : ''}
      ${!busy && err && camp.recoveryState.details ? `<button class="menu_button canon-btn" data-act="details">${t('details')}</button>` : ''}
      ${conflict ? `<button class="menu_button canon-btn" data-act="goto">${t('editIt')}</button><button class="menu_button canon-btn" data-act="branch">${t('branchRegen')}</button>` : ''}
      <button class="menu_button canon-btn" data-act="inspect">${t('inspect')}</button>
    </span>`;
}

// ---------------------------------------------------------------------------------------------
function mountSettings() {
  const root = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
  if (!root || document.getElementById('canon-engine-settings')) return;
  const wrap = document.createElement('div');
  wrap.id = 'canon-engine-settings';
  wrap.innerHTML = `<div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header"><b>${t('title')}</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
    <div class="inline-drawer-content canon-settings-body"></div></div>`;
  root.appendChild(wrap);
  installTips();
  wrap.addEventListener('click', onSettingsClick);
  wrap.addEventListener('change', onSettingsChange);
  // The file input lives outside the re-rendered drawer body: the drawer is redrawn while the
  // OS file dialog is open, which would otherwise detach the input and lose the selection.
  if (!document.getElementById('canon-engine-file')) {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.json,application/json'; fi.id = 'canon-engine-file'; fi.style.display = 'none';
    fi.addEventListener('change', () => { void onFileChosen(fi); });
    document.body.appendChild(fi);
  }
}

function renderSettings() {
  const body = document.querySelector('#canon-engine-settings .canon-settings-body') as HTMLElement | null;
  if (!body) return;
  const camp = E.campaign();
  const s = getSettings();
  const hd = HoraeAdapter.diagnose();
  const profileOk = !!s.taskProfileId;
  const out: string[] = [];
  if (H.isGroup()) out.push(`<div class="canon-note warn">${t('groupUnsupported')}</div>`);
  const comp = detectCompetingLore();
  if (comp.books.length) out.push(`<div class="canon-note warn">${t('competing')} ${comp.books.map(esc).join(', ')} ${tip('competingHint')}</div>`);
  if (comp.gmRule) out.push(`<div class="canon-note warn">${t('gmConflictShort')} ${tip('gmConflict')}</div>`);
  if (hd.version && !hd.ok) out.push(`<div class="canon-note warn">${t('unsupportedHorae')}: ${esc(hd.missing.join(', '))}</div>`);

  // ---- this chat
  const lib = listLibrary();
  const libRows = (mode: 'enable' | 'update' | 'none') => lib.map((e, i) => `<div class="canon-lib-row"><span class="canon-lib-name" title="${esc(e.file)}"><b>${esc(e.title)}</b> v${esc(e.version)} · ${Math.round(e.size / 1024)} KB</span>
      ${mode === 'update' ? `<button class="menu_button canon-btn" data-act="lib-update" data-i="${i}">${t('libUpdate')}</button>` : ''}
      ${mode === 'enable' ? `<button class="menu_button canon-btn" data-act="lib-enable" data-i="${i}" ${profileOk ? '' : 'disabled'}>${t('libEnable')}</button>` : ''}
      <button class="menu_button canon-btn" data-act="lib-del" data-i="${i}" title="${t('libDelete')}">✕</button></div>`).join('');
  const chat: string[] = [];
  if (!H.chatId()) {
    chat.push(`<div class="canon-hint">${t('noChat')}</div>`);
    if (lib.length) chat.push(`<details class="canon-lib"><summary>${t('library')} (${lib.length}) ${tip('libraryTip')}</summary>${libRows('none')}</details>`);
  } else if (!camp) {
    chat.push(`<div class="canon-hint">${t('notBound')}</div>`);
    if (!profileOk) chat.push(`<div class="canon-note warn">${t('needProfileFirst')}</div>`);
    chat.push(`<div class="canon-lib"><div class="canon-lib-head">${t('library')} ${tip('libraryTip')}</div>${lib.length ? libRows('enable') : `<div class="canon-hint">${t('libEmpty')}</div>`}</div>`);
    chat.push(`<div class="canon-btns"><button class="menu_button" data-act="enable" ${profileOk ? '' : 'disabled'}>${t('enable')}</button></div>`);
  } else {
    chat.push(`<div class="canon-pack"><b>${esc(camp.packSnapshot.title)}</b> <span>v${esc(camp.packVersion)}</span>${camp.enabled ? '' : ` <span class="canon-tag">${t('phase_disabled')}</span>`}</div>`);
    if (!profileOk) chat.push(`<div class="canon-note warn">${t('needProfileTurns')}</div>`);
    const btn = (act: string, label: string, tipKey: string, cls = '') => `<button class="menu_button ${cls}" data-act="${act}" title="${esc(t(tipKey))}">${label}</button>`;
    chat.push(`<div class="canon-btns">
      ${btn('inspect', t('inspect'), 'inspectTip')}${btn('retry', t('retry'), 'retryTip')}${btn('rebuild', t('rebuild'), 'rebuildTip')}</div>
      <div class="canon-btns">${btn('export', t('exportBackup'), 'exportTip')}${btn('import', t('importBackup'), 'importTip')}${btn('update', t('updatePack'), 'updateTip')}</div>
      <div class="canon-btns">${btn('toggle', camp.enabled ? t('disable') : t('reenable'), 'toggleTip')}${btn('unbind', t('unbindShort'), 'unbindTip', 'canon-danger')}</div>`);
    if (lib.length) chat.push(`<details class="canon-lib"><summary>${t('library')} (${lib.length}) ${tip('libraryTip')}</summary>${libRows('update')}</details>`);
  }
  out.push(card(t('secChat'), 'secChatTip', chat.join('')));

  // ---- model and replies
  out.push(card(t('secModel'), '', profileField(s.taskProfileId || '') +
    field(t('replyLength'), 'replyLengthTip', `<input type="text" class="text_pole" data-set="replyLength" value="${esc(String(s.replyLength || ''))}" placeholder="${esc(t('replyLengthPlaceholder'))}">`, t('replyLengthShort')) +
    check('notifyDone', s.notifyDone !== false, t('notifyDone'), 'notifyDoneTip') +
    (s.notifyDone !== false ? check('notifySound', s.notifySound !== false, t('notifySound'), 'notifySoundTip') + notifyNote() : '')));

  // ---- event log
  out.push(card(t('secEvents'), '', check('sceneGrouping', !!s.sceneGrouping, t('sceneGrouping'), 'sceneGroupingTip') + check('followHoraeTime', s.followHoraeTime !== false, t('followHoraeTime'), 'followHoraeTimeTip')));

  // ---- advanced
  const adv = [num('maxRepairs', s.maxRepairs), num('maxOrdinaryPlanner', s.maxOrdinaryPlanner), check('forcedPlannerAttempt', !!s.forcedPlannerAttempt, t('adv_forcedPlannerAttempt'), 'adv_forcedPlannerAttemptTip'),
    num('budgetChars', s.budgetChars), num('horizonMinutes', s.horizonMinutes), num('taskTimeoutMs', s.taskTimeoutMs), num('draftTimeoutMs', s.draftTimeoutMs), num('taskTemperature', s.taskTemperature),
    check('debug', !!s.debug, t('debug'), 'debugTip'),
    `<div class="canon-frow"><span class="canon-lbl">${t('uiLang')}</span><select class="text_pole canon-small" data-set="uiLang"><option value="zh" ${s.uiLang !== 'en' ? 'selected' : ''}>中文</option><option value="en" ${s.uiLang === 'en' ? 'selected' : ''}>English</option></select></div>`];
  out.push(`<details class="canon-card canon-adv"><summary class="canon-card-title">${t('advanced')} <span class="canon-sub">${t('advancedShort')}</span></summary>${adv.join('')}</details>`);
  body.innerHTML = out.join('');
}

/** An (i) icon; its text shows on hover, focus or tap (see installTips). */
function tip(key: string): string {
  return key ? `<span class="canon-info" tabindex="0" role="button" aria-label="${esc(t(key))}" data-tip="${esc(t(key))}"><i class="fa-solid fa-circle-info"></i></span>` : '';
}

function card(title: string, tipKey: string, inner: string): string {
  return `<div class="canon-card"><div class="canon-card-title">${title} ${tip(tipKey)}</div>${inner}</div>`;
}

function field(label: string, tipKey: string, control: string, hint = ''): string {
  return `<div class="canon-field"><div class="canon-lbl">${label} ${tip(tipKey)}</div>${control}${hint ? `<div class="canon-hint">${hint}</div>` : ''}</div>`;
}

const CHROME_FLAG = 'chrome://flags/#unsafely-treat-insecure-origin-as-secure';

/** Why system notifications will not appear on this page, if they will not. */
function notifyNote(): string {
  if (!systemNotificationsAvailable()) {
    // chrome:// pages cannot be opened from a web page, so both values are one click to copy.
    const row = (label: string, value: string) => `<div class="canon-copyrow"><span>${esc(label)}</span><code>${esc(value)}</code><button class="menu_button canon-btn" data-act="copyValue" data-value="${esc(value)}">${t('copy')}</button></div>`;
    return `<div class="canon-note">${esc(t('notifyInsecure'))}${row(t('notifyFlagPage'), CHROME_FLAG)}${row(t('notifyFlagValue'), location.origin)}</div>`;
  }
  if (Notification.permission === 'denied') return `<div class="canon-note warn">${esc(t('notifyBlocked'))}</div>`;
  return '';
}

function check(key: string, on: boolean, label: string, tipKey: string): string {
  return `<div class="canon-frow"><label class="checkbox_label canon-check"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''}><span>${label}</span></label>${tip(tipKey)}</div>`;
}

function num(key: string, v: number) {
  return `<div class="canon-frow"><span class="canon-lbl">${t('adv_' + key)} ${tip('adv_' + key + 'Tip')}</span><input type="number" class="text_pole canon-small" data-set="${key}" value="${v}"></div>`;
}

function profileField(current: string): string {
  let profiles: { id: string; name: string; model?: string }[] = [];
  try { profiles = (ctx() as any).ConnectionManagerRequestService?.getSupportedProfiles?.() || []; } catch { profiles = []; }
  const missing = current && current !== CHAT_PROFILE && !profiles.some((p) => p.id === current);
  const opts = [`<option value="" ${current ? '' : 'selected'} disabled>${t('taskProfilePick')}</option>`]
    .concat(profiles.map((p) => `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.name)}${p.model ? ` · ${esc(p.model)}` : ''}</option>`))
    .concat(missing ? [`<option value="${esc(current)}" selected>⚠ ${esc(current)}</option>`] : [])
    .concat([`<option value="${CHAT_PROFILE}" ${current === CHAT_PROFILE ? 'selected' : ''}>${t('taskProfileSame')}</option>`]);
  const hint = !current ? `<div class="canon-hint warn">${profiles.length ? t('taskProfileMissing') : t('taskProfileNone')}</div>`
    : current === CHAT_PROFILE ? `<div class="canon-hint warn">${t('taskProfileSameWarn')}</div>` : `<div class="canon-hint">${t('taskProfileShort')}</div>`;
  const extra = String((getSettings() as any).taskExtraBody || '');
  const profileUsed = current && current !== CHAT_PROFILE;
  return `<div class="canon-field canon-profile${current ? '' : ' canon-required'}"><div class="canon-lbl">${t('taskProfile')} ${tip('taskProfileTip')}</div>
    <select class="text_pole" data-set="taskProfileId">${opts.join('')}</select>${hint}</div>
    ${profileUsed ? field(t('taskExtraBody'), 'taskExtraBodyTip', `<textarea class="text_pole canon-extra" rows="1" data-set="taskExtraBody" placeholder="venice_parameters: {disable_thinking: true}">${esc(extra)}</textarea>`, t('taskExtraBodyShort')) : ''}`;
}

let tipEl: HTMLElement | null = null;
let tipFor: HTMLElement | null = null;
/** One floating tooltip for every (i) icon: hover or keyboard focus shows it, a tap toggles it. */
function installTips() {
  if (tipEl) return;
  tipEl = document.createElement('div');
  tipEl.className = 'canon-tip';
  tipEl.style.display = 'none';
  document.body.appendChild(tipEl);
  const show = (el: HTMLElement) => {
    tipFor = el;
    tipEl!.textContent = el.dataset.tip || '';
    tipEl!.style.display = 'block';
    const r = el.getBoundingClientRect(), w = tipEl!.offsetWidth, h = tipEl!.offsetHeight;
    const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
    const top = r.bottom + 6 + h > window.innerHeight - 8 ? r.top - h - 6 : r.bottom + 6;
    tipEl!.style.left = `${left}px`;
    tipEl!.style.top = `${Math.max(8, top)}px`;
  };
  const hide = () => { tipFor = null; tipEl!.style.display = 'none'; };
  const icon = (ev: Event) => (ev.target as HTMLElement | null)?.closest?.('.canon-info') as HTMLElement | null;
  document.addEventListener('mouseover', (ev) => { const el = icon(ev); if (el) show(el); });
  document.addEventListener('mouseout', (ev) => { if (icon(ev) && tipFor && !tipFor.contains(document.activeElement)) hide(); });
  document.addEventListener('focusin', (ev) => { const el = icon(ev); if (el) show(el); });
  document.addEventListener('focusout', (ev) => { if (icon(ev)) hide(); });
  document.addEventListener('click', (ev) => {
    const el = icon(ev);
    if (el) { ev.preventDefault(); ev.stopPropagation(); if (tipFor === el && tipEl!.style.display === 'block') hide(); else show(el); }
    else if (tipFor) hide();
  }, true);
  window.addEventListener('scroll', hide, true);
}

let fileMode: 'enable' | 'import' | 'update' = 'enable';
async function onSettingsClick(ev: Event) {
  const b = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!b) return;
  const act = b.dataset.act;
  const file = document.getElementById('canon-engine-file') as HTMLInputElement;
  const libEntry = (): LibraryEntry | undefined => listLibrary()[Number(b.dataset.i)];
  try {
    if (act === 'copyValue') { if (copyText(b.dataset.value || '')) b.textContent = t('copied'); return; }
    if (act === 'enable' || act === 'import' || act === 'update') {
      if (!H.chatId()) { toast('error', t('noChat')); return; }
      if (H.isGroup()) { toast('error', t('groupUnsupported')); return; }
      fileMode = act as typeof fileMode;
      file.value = '';
      file.click();
    } else if (act === 'lib-enable' || act === 'lib-update') {
      const e = libEntry(); if (!e) return;
      if (!H.chatId()) { toast('error', t('noChat')); return; }
      if (H.isGroup()) { toast('error', t('groupUnsupported')); return; }
      const text = await loadFromLibrary(e);
      if (act === 'lib-enable') openBindWizard(text); else openUpdateWizard(text);
    } else if (act === 'lib-del') {
      const e = libEntry(); if (!e) return;
      if (!confirm(`${t('libDelete')}: ${e.title} v${e.version}?`)) return;
      await removeFromLibrary(e);
    } else if (act === 'inspect') toggleInspector(true);
    else if (act === 'rebuild') { await E.reconcile('manual_rebuild'); toast('info', 'OK'); }
    else if (act === 'retry') await E.retry();
    else if (act === 'export') {
      if (!confirm(t('backupWarning'))) return;
      download(`canon-backup-${(H.chatId() || 'chat').replace(/[^\w.-]+/g, '_')}.json`, E.exportBackup());
    } else if (act === 'toggle') { const c = E.campaign(); if (c) await E.setEnabled(!c.enabled); }
    else if (act === 'unbind') {
      if (!confirm(t('unbind') + '?')) return;
      H.setCampaign(null);
      await H.save();
    }
  } catch (e) {
    toast('error', (e as Error).message);
  }
  refreshUi();
}

async function onSettingsChange(ev: Event) {
  const tgt = ev.target as HTMLInputElement;
  const key = tgt.dataset.set;
  if (!key) return;
  const s = getSettings() as any;
  s[key] = tgt.type === 'checkbox' ? tgt.checked : tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA' || tgt.type === 'text' ? tgt.value : Number(tgt.value);
  if (key === 'uiLang') setLang(tgt.value === 'en' ? 'en' : 'zh');
  if (key === 'notifyDone' && tgt.checked) primeNotifications(); // the click is the user gesture permission prompts want
  Object.assign(E.settings, s);
  ctx().saveSettingsDebounced?.();
  refreshUi();
}

async function onFileChosen(fi: HTMLInputElement) {
  const f = fi.files?.[0];
  if (!f) return;
  try {
    const text = await f.text();
    if (fileMode === 'import') {
      const r = await E.importBackup(text);
      toast('info', `${r.matchedMessages}/${r.total}`);
    } else {
      // Keep valid packs in the library so later chats can pick them without re-uploading.
      const p = E.previewPack(text);
      if (p.ok && p.summary) {
        try { await saveToLibrary(text, p.summary); } catch (e) { toast('warning', (e as Error).message); }
      }
      if (fileMode === 'enable') openBindWizard(text); else openUpdateWizard(text);
    }
  } catch (e) {
    toast('error', (e as Error).message);
  } finally {
    fi.value = '';
    refreshUi();
  }
}

// ---------------------------------------------------------------------------------------------
function modal(html: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'canon-modal-backdrop';
  el.innerHTML = `<div class="canon-modal">${html}</div>`;
  document.body.appendChild(el);
  el.addEventListener('click', (ev) => { if ((ev.target as HTMLElement).closest('[data-close]')) el.remove(); });
  return el;
}

function openBindWizard(text: string) {
  const p = E.previewPack(text);
  const chatLen = H.readTranscript().filter((e) => e.role !== 'system').length;
  const existing = chatLen > 1;
  const horae = H.horae?.status().scene;
  if (!p.ok || !p.summary) {
    modal(`<h3>${t('wizardTitle')}</h3><div class="canon-note err">${t('validation')}: ${t('failed')}</div><ul class="canon-list">${p.errors.slice(0, 40).map((e) => `<li><code>${esc(e.path)}</code> ${esc(e.message)}</li>`).join('')}</ul><button class="menu_button" data-close>${t('close')}</button>`);
    return;
  }
  const S = p.summary;
  // Default: the pack's day-0 date (from its calendar label) and day 0 08:00 when covered.
  const origin0 = parseOriginLabel(S.originLabel);
  const covStart = parseCoverageStart(S.coverage);
  const defTick = covStart <= 480 ? 480 : covStart;
  const startDefault = formatTick(defTick, origin0).replace(/ \(D-?\d+\)$/, '');
  const originDefault = origin0 ? `${origin0.y}-${String(origin0.m).padStart(2, '0')}-${String(origin0.d).padStart(2, '0')}` : '';
  const evOptions = E.previewEvents(text).map((e) => `<option value="${e.lo - 1}">${esc(e.title)} (${esc(formatTick(e.lo, origin0))})</option>`).join('');
  const el = modal(`<h3>${t('wizardTitle')}</h3>
    <div><b>${esc(S.title)}</b> v${esc(S.version)} <small>(${esc(S.packId)}, ${esc(S.hash.slice(0, 12))})</small></div>
    <div>${t('validation')}: <b>${t('ok')}</b> · ${t('coverage')}: ${esc(S.coverage)} · ${t('hardCount')}: ${S.hardCount}</div>
    ${p.warnings.length ? `<details><summary>${t('warnings')} (${p.warnings.length})</summary><ul class="canon-list">${p.warnings.map((w) => `<li>${esc(w.path)} ${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
    ${horae && (horae.date || horae.time) ? `<div class="canon-note">${t('horaeDetected')}: ${esc(horae.date || '')} ${esc(horae.time || '')} ${esc(horae.location || '')}</div>` : ''}
    ${existing ? `<div class="canon-note">${t('existingChat')}</div>` : ''}
    <label>${t('startTime')} <input class="text_pole canon-start" value="${esc(startDefault)}" placeholder="D0 08:00 或 2020-07-20 08:00（需填写下方第0天日期）"></label>
    <label>${t('startBefore')} <select class="canon-start-ev"><option value="">—</option>${evOptions}</select></label>
    <label>${t('originDate')} <input class="text_pole canon-origin" placeholder="YYYY-MM-DD" value="${esc(originDefault)}"></label>
    ${S.originLabel ? `<div class="canon-note">${t('packOrigin')}: ${esc(S.originLabel)}</div>` : ''}
    <div class="canon-row"><button class="menu_button canon-confirm">${t('confirmBind')}</button><button class="menu_button" data-close>${t('close')}</button></div>
    <div class="canon-wizard-status"></div>`);
  el.querySelector('.canon-start-ev')!.addEventListener('change', (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (!v) return;
    const om = (el.querySelector('.canon-origin') as HTMLInputElement).value.trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/);
    const og = om ? { y: Number(om[1]), m: Number(om[2]), d: Number(om[3]) } : null;
    (el.querySelector('.canon-start') as HTMLInputElement).value = formatTick(Number(v), og).replace(/ \(D-?\d+\)$/, '');
  });
  el.querySelector('.canon-confirm')!.addEventListener('click', async () => {
    const o = (el.querySelector('.canon-origin') as HTMLInputElement).value.trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/);
    const startRaw = (el.querySelector('.canon-start') as HTMLInputElement).value;
    if (origin0 && o && (Number(o[1]) !== origin0.y || Number(o[2]) !== origin0.m || Number(o[3]) !== origin0.d) && !confirm(t('originMismatch'))) return;
    const startTick = parseTickLabel(startRaw) ?? parseDateLabel(startRaw, o ? { y: Number(o[1]), m: Number(o[2]), d: Number(o[3]) } : null);
    const status = el.querySelector('.canon-wizard-status') as HTMLElement;
    if (startTick === null) { status.innerHTML = `<div class="canon-note err">${t('startTime')}?</div>`; return; }
    try {
      status.textContent = t('rebuilding');
      const res = await E.bind(text, { startTick, originDate: o ? { y: Number(o[1]), m: Number(o[2]), d: Number(o[3]) } : null, mode: existing ? 'existing' : 'new' });
      getLock()?.setCampaign(E.campaign()!.sessionId);
      await E.reconcile('binding');
      const insp = E.inspector(false);
      const camp = E.campaign()!;
      el.querySelector('.canon-modal')!.innerHTML = `<h3>${t('bindingSummary')}</h3>
        <div>${t('startTime')}: ${esc(camp.binding.startLabel)} · ${esc(camp.packSnapshot.pack_id)}@${esc(camp.packVersion)}</div>
        <div>${t('examined')}: ${res.examined}</div>
        <div>${t('deviations')}: ${insp?.deviations.length ? insp.deviations.map((d) => esc(`${d.title}: ${d.disposition}`)).join('; ') : '—'}</div>
        <div>${t('unresolved')}: ${[...res.unresolved, camp.recoveryState.status !== 'ok' ? camp.recoveryState.reason : ''].filter(Boolean).map(esc).join('; ') || '—'}</div>
        <div class="canon-row"><button class="menu_button" data-close>${t('keep')}</button><button class="menu_button canon-undo">${t('undoBind')}</button></div>`;
      el.querySelector('.canon-undo')!.addEventListener('click', async () => { H.setCampaign(null); await H.save(); el.remove(); refreshUi(); });
    } catch (e) {
      status.innerHTML = `<div class="canon-note err">${esc((e as Error).message)}</div>`;
    }
    refreshUi();
  });
}

function parseCoverageStart(cov: string): number {
  const m = cov.split('–')[0].trim();
  return parseTickLabel(m) ?? 0;
}

function openUpdateWizard(text: string) {
  const d = E.diffPack(text);
  if (!d.ok) { modal(`<div class="canon-note err">${d.errors.map((e) => esc(e.message)).join('<br>')}</div><button class="menu_button" data-close>${t('close')}</button>`); return; }
  const el = modal(`<h3>${t('updatePack')}</h3><div class="canon-note">${t('updatePreview')}</div>
    <div>changed: ${esc(d.changed.join(', ') || '—')}</div><div>deleted: ${esc(d.deleted.join(', ') || '—')}</div><div>added: ${esc(d.added.join(', ') || '—')}</div>
    <div><b>HARD contract changes:</b> ${esc(d.hardChanged.join(', ') || '—')}</div>
    <div class="canon-row"><button class="menu_button canon-exp">${t('exportBackup')}</button><button class="menu_button canon-apply" disabled>${t('applyUpdate')}</button><button class="menu_button" data-close>${t('close')}</button></div>`);
  el.querySelector('.canon-exp')!.addEventListener('click', () => {
    download(`canon-backup-before-update-${Date.now()}.json`, E.exportBackup());
    (el.querySelector('.canon-apply') as HTMLButtonElement).disabled = false;
  });
  el.querySelector('.canon-apply')!.addEventListener('click', async () => {
    try { await E.applyPackUpdate(text); el.remove(); } catch (e) { toast('error', (e as Error).message); }
    refreshUi();
  });
}

// ---------------------------------------------------------------------------------------------
export function toggleInspector(open: boolean) {
  const s = getSettings();
  s.inspectorOpen = open;
  const camp = E.campaign();
  if (camp) camp.uiPreferences.inspectorOpen = open;
  ctx().saveSettingsDebounced?.();
  renderInspector();
}

function renderInspector() {
  const s = getSettings();
  const camp = E.campaign();
  const open = !!(camp?.uiPreferences.inspectorOpen ?? s.inspectorOpen) && !!camp;
  if (!open) { inspectorEl?.remove(); inspectorEl = null; return; }
  if (!inspectorEl) {
    inspectorEl = document.createElement('div');
    inspectorEl.id = 'canon-inspector';
    inspectorEl.className = 'canon-inspector';
    document.body.appendChild(inspectorEl);
    inspectorEl.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-tab],[data-act]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.tab) { inspectorTab = b.dataset.tab; renderInspector(); }
      if (b.dataset.act === 'close') toggleInspector(false);
    });
    inspectorEl.addEventListener('change', (ev) => {
      const tg = ev.target as HTMLInputElement;
      if (tg.dataset.act === 'spoilers' && camp) { camp.uiPreferences.spoilers = tg.checked; renderInspector(); }
    });
  }
  const spoilers = !!camp?.uiPreferences.spoilers;
  const d = E.inspector(spoilers);
  const tabs = ['overview', 'facts', 'history', 'deviations', 'anchors', 'plan', ...(E.settings.debug ? ['debug'] : [])];
  const tabName: Record<string, string> = { overview: t('tabOverview'), facts: t('tabFacts'), history: t('tabHistory'), deviations: t('tabDeviations'), anchors: t('tabAnchors'), plan: t('tabPlan'), debug: t('tabDebug') };
  let body = '';
  if (!d) body = `<div>${esc(E.status.message || t('phase_reconciling'))}</div>`;
  else if (inspectorTab === 'overview') {
    body = `<div><b>${esc(d.title)}</b> · hash ${esc(d.packHash)}</div><div>⏱ ${esc(d.time)}</div><div>rev ${d.revision} · branch ${esc(d.branchId.slice(0, 12))}</div>
      <div>${esc(d.recovery.status)} ${esc(d.recovery.reason || '')}</div>
      <ul class="canon-list">${d.notices.map((n) => `<li class="${n.level}">${esc(n.text)}</li>`).join('')}</ul>`;
  } else if (inspectorTab === 'facts') {
    body = `<table class="canon-table"><tr><th>entity</th><th>predicate</th><th>value</th><th>since</th><th>source</th></tr>${d.facts.map((f: any) => `<tr><td>${esc(f.entity)}</td><td>${esc(f.predicate)}</td><td>${esc(f.value)}</td><td>${esc(f.since)}</td><td>${esc(f.source)}</td></tr>`).join('')}</table>`;
  } else if (inspectorTab === 'history') {
    body = `<ul class="canon-list">${d.occurrences.map((o) => `<li><b>${esc(o.time)}</b> ${esc(o.title)} <small>(${esc(o.origin)})</small><br><small>${esc(o.account)}</small></li>`).join('')}</ul>`;
  } else if (inspectorTab === 'deviations') {
    body = `<ul class="canon-list">${d.deviations.map((x) => `<li>${esc(x.title)}: <b>${esc(x.disposition)}</b> — ${esc(x.reason)}</li>`).join('') || '<li>—</li>'}</ul>`;
  } else if (inspectorTab === 'anchors') {
    body = `<ul class="canon-list">${d.anchors.map((a) => `<li>${esc(spoilers ? a.title : '•••')} — <b>${esc(a.status)}</b> ${esc(a.when)}<br><small>${esc(a.required)}</small></li>`).join('')}</ul>`;
  } else if (inspectorTab === 'plan') {
    body = `<pre class="canon-pre">${esc(JSON.stringify(d.plan, null, 1))}</pre>`;
  } else if (inspectorTab === 'debug') {
    body = `<h4>Last operation</h4><pre class="canon-pre">${esc(JSON.stringify(d.lastTrace, null, 1))}</pre>
      <h4>Final draft prompt (as sent)</h4><pre class="canon-pre">${esc(JSON.stringify(gen.lastDraftPrompt, null, 1))}</pre>
      <h4>Coverage manifests</h4><pre class="canon-pre">${esc(JSON.stringify(d.manifests, null, 1))}</pre>
      <h4>Raw campaign JSON</h4><pre class="canon-pre">${esc(JSON.stringify({ ...camp, packSnapshot: '[omitted]' }, null, 1)).slice(0, 200000)}</pre>`;
  }
  inspectorEl.innerHTML = `<div class="canon-insp-head"><b>${t('inspect')}</b>
      <label><input type="checkbox" data-act="spoilers" ${spoilers ? 'checked' : ''}> ${t('spoilers')}</label>
      <button class="menu_button" data-act="close">✕</button></div>
    <div class="canon-tabs">${tabs.map((x) => `<button class="menu_button ${x === inspectorTab ? 'active' : ''}" data-tab="${x}">${tabName[x]}</button>`).join('')}</div>
    <div class="canon-insp-body">${body}</div>`;
}

// ---------------------------------------------------------------------------------------------
/** Banners/conflict markers keyed to the message variant's accepted commit (plugin UI, not prose). */
export function renderMessageDecorations() {
  document.querySelectorAll('.canon-banner, .canon-conflict').forEach((n) => n.remove());
  const camp = E?.campaign();
  if (!camp || !camp.enabled) return;
  const chat: any[] = ctx().chat || [];
  const entries = H.readTranscript();
  for (const e of entries) {
    const el = document.querySelector(`#chat .mes[mesid="${e.index}"] .mes_block`);
    if (!el) continue;
    if (e.role === 'gm') {
      const interp = interpretationsFor(camp.interpretations as any, baseKey(e)).find((x) => x.banner);
      if (interp?.banner) {
        const b = document.createElement('div');
        b.className = 'canon-banner';
        b.textContent = interp.banner.text;
        el.appendChild(b);
      }
    }
    if (camp.recoveryState.status === 'conflict' && camp.recoveryState.messageId === e.messageId) {
      const b = document.createElement('div');
      b.className = 'canon-conflict';
      b.textContent = t('conflictMarker');
      el.appendChild(b);
    }
  }
  void chat;
}

function gotoConflict() {
  const camp = E.campaign();
  const idx = camp?.recoveryState.messageIndex;
  if (idx === undefined) return;
  document.querySelector(`#chat .mes[mesid="${idx}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Native branch at the message before the conflict, then regenerate in the new branch. */
async function branchFromConflict() {
  const camp = E.campaign();
  const idx = camp?.recoveryState.messageIndex;
  if (idx === undefined || idx < 1) return;
  try {
    const bmUrl = '/scripts/bookmarks.js';
    const bookmarks = await import(/* @vite-ignore */ bmUrl);
    const name = await bookmarks.branchChat(idx - 1);
    if (!name) return;
    await new Promise((r) => setTimeout(r, 1500));
    const chat = ctx().chat || [];
    const last = chat[chat.length - 1];
    if (last && last.is_user) await ctx().generate('normal');
    else await ctx().generate('regenerate');
  } catch (e) {
    toast('error', (e as Error).message);
  }
}

// ---------------------------------------------------------------------------------------------
function detectCompetingLore(): { books: string[]; gmRule: boolean } {
  const books = new Set<string>();
  try {
    const c = ctx();
    const re = /(历史|時間線|时间线|年表|history|timeline|chronolog)/i;
    const sel: string[] = c.chatMetadata?.world_info ? [c.chatMetadata.world_info] : [];
    const global = (c as any).worldInfo?.globalSelect || [];
    const charBook = c.characters?.[c.characterId]?.data?.extensions?.world;
    for (const b of [...sel, ...global, charBook].filter(Boolean)) if (re.test(String(b))) books.add(String(b));
    const ch = c.characters?.[c.characterId];
    const card = `${ch?.description || ''}\n${ch?.data?.system_prompt || ''}\n${ch?.personality || ''}\n${ch?.scenario || ''}`;
    const gmRule = /(世界书|World ?Info|lorebook)[^\n]{0,40}(历史|时间线|history|timeline)|(历史|时间线|history|timeline)[^\n]{0,40}(世界书|World ?Info|lorebook)/i.test(card);
    return { books: [...books], gmRule };
  } catch {
    return { books: [...books], gmRule: false };
  }
}

function toast(level: 'info' | 'error' | 'warning', msg: string) {
  const tr = (globalThis as any).toastr;
  // Errors stay until closed (a long turn often fails while nobody is watching); warnings linger longer than info.
  const opts = level === 'error' ? { timeOut: 0, extendedTimeOut: 0, closeButton: true, tapToDismiss: false } : level === 'warning' ? { timeOut: 15000, closeButton: true } : {};
  if (tr) tr[level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info'](msg, 'Canon Engine', opts);
  else console.log('[CanonEngine]', msg);
}

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Copy text. navigator.clipboard only exists on https/localhost; a Tavern on plain http over the LAN
 *  needs the selection + execCommand route. */
function copyText(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  if (!ok) try { void navigator.clipboard?.writeText(text); ok = !!navigator.clipboard; } catch { /* ignore */ }
  return ok;
}

/** Full report of the last failed turn, readable and copyable at any time (it is saved with the chat). */
function showFailureReport() {
  const text = E.campaign()?.recoveryState.details;
  if (!text) return;
  document.getElementById('canon-report')?.remove();
  const box = document.createElement('div');
  box.id = 'canon-report';
  box.className = 'canon-report';
  box.innerHTML = `<div class="canon-report-card"><div class="canon-report-head"><b>${t('details')}</b>
    <span><button class="menu_button canon-btn" data-r="copy">${t('copy')}</button><button class="menu_button canon-btn" data-r="close">${t('close')}</button></span></div>
    <pre class="canon-report-text"></pre></div>`;
  (box.querySelector('.canon-report-text') as HTMLElement).textContent = text;
  box.addEventListener('click', (ev) => {
    const r = (ev.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
    if (ev.target === box || r?.dataset.r === 'close') box.remove();
    else if (r?.dataset.r === 'copy') { if (copyText(text)) r.textContent = t('copied'); }
  });
  document.body.appendChild(box);
}

// A long turn usually finishes while the user is elsewhere: mark the browser tab until they come back.
let wasBusy = false;
let baseTitle = '';
function markTab() {
  const tm = E.lastTimings;
  if (!tm || tm.totalMs < 30000 || !document.hidden) return;
  baseTitle = baseTitle || document.title;
  document.title = `${tm.ok ? '✔' : '✖'} Canon ${tm.ok ? t('tabDone') : t('tabFailed')} · ${baseTitle}`;
  const restore = () => { if (!document.hidden) { document.title = baseTitle; baseTitle = ''; document.removeEventListener('visibilitychange', restore); } };
  document.addEventListener('visibilitychange', restore);
}

let lastNoticeCount = 0;
export function refreshUi() {
  if (!E) return;
  const busyNow = E.isBusy();
  if (wasBusy && !busyNow) markTab();
  wasBusy = busyNow;
  renderStatus();
  renderSettings();
  renderInspector();
  renderMessageDecorations();
  if (graphPanel) { const c = E.campaign(); const st = (() => { try { return E.graphSource()?.state; } catch { return null; } })(); graphPanel.refreshIfChanged(`${c?.packHash || ''}|${st?.lastSeq ?? ''}|${st?.clock.lo ?? ''}|${c?.uiPreferences.spoilers ? 1 : 0}`); }
  if (E.noticeSeq > lastNoticeCount) {
    const fresh = Math.min(E.noticeSeq - lastNoticeCount, E.notices.length);
    for (const n of E.notices.slice(-fresh)) toast(n.level === 'warn' ? 'warning' : n.level, n.text);
  }
  lastNoticeCount = E.noticeSeq;
  void NS;
}
