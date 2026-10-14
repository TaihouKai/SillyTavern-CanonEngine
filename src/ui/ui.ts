// Small persistent UI: status pill near the composer, settings drawer, binding wizard,
// on-demand inspector (spoilers behind a toggle), per-variant banners and conflict markers.
import type { CanonEngine, EngineSettings } from '../runtime/engine';
import { labelForError } from '../runtime/engine';
import type { StHost } from '../adapters/st';
import { ctx, NS, gen } from '../adapters/st';
import { HoraeAdapter } from '../adapters/horae';
import type { WriterLock } from '../adapters/lock';
import { interpretationsFor, baseKey } from '../runtime/replay';
import { parseTickLabel, formatTick } from '../domain/time';
import { t, setLang } from './i18n';

export { t };

/* eslint-disable @typescript-eslint/no-explicit-any */
let E: CanonEngine;
let H: StHost;
let getSettings: () => EngineSettings & { inspectorOpen: boolean; uiLang?: string };
let getLock: () => WriterLock | null;
let inspectorEl: HTMLElement | null = null;
let inspectorTab = 'overview';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function mountUi(engine: CanonEngine, host: StHost, settings: typeof getSettings, lock: typeof getLock) {
  E = engine; H = host; getSettings = settings; getLock = lock;
  const s = getSettings();
  setLang(s.uiLang === 'en' ? 'en' : 'zh');
  mountSettings();
  mountStatus();
  refreshUi();
}

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
    if (act === 'goto') gotoConflict();
    if (act === 'branch') void branchFromConflict();
  });
}

function renderStatus() {
  const el = document.getElementById('canon-engine-status');
  if (!el) return;
  const camp = E.campaign();
  if (!camp) { el.style.display = 'none'; return; }
  el.style.display = '';
  const st = E.status;
  const phase = camp.enabled ? (H.isGroup() ? 'disabled' : st.phase) : 'disabled';
  const busy = E.isBusy();
  const lockOk = getLock()?.isOwner() ?? true;
  const conflict = camp.recoveryState.status === 'conflict';
  const err = phase === 'error' || camp.recoveryState.status === 'error' || camp.recoveryState.status === 'unsaved';
  let msg = '';
  if (!lockOk) msg = t('notWriter');
  else if (conflict) msg = t('conflictMarker') + (camp.recoveryState.reason ? ` (${camp.recoveryState.reason.slice(0, 160)})` : '');
  else if (err) msg = `${labelForError(camp.recoveryState.errorKind || st.errorKind || '')}: ${(camp.recoveryState.reason || st.message || '').slice(0, 220)}`;
  else if (busy) msg = st.message;
  el.dataset.phase = conflict ? 'conflict' : phase;
  el.innerHTML = `<span class="canon-dot"></span><b>Canon</b> <span class="canon-phase">${esc(t('phase_' + (conflict ? 'conflict' : phase)))}</span>
    <span class="canon-msg" title="${esc(msg)}">${esc(msg)}</span>
    <span class="canon-actions">
      ${busy ? `<button class="menu_button canon-btn" data-act="cancel">${t('cancel')}</button>` : ''}
      ${!busy && (err || conflict) ? `<button class="menu_button canon-btn" data-act="retry">${t('retry')}</button>` : ''}
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
  wrap.addEventListener('click', onSettingsClick);
  wrap.addEventListener('change', onSettingsChange);
}

function renderSettings() {
  const body = document.querySelector('#canon-engine-settings .canon-settings-body') as HTMLElement | null;
  if (!body) return;
  const camp = E.campaign();
  const s = getSettings();
  const hd = HoraeAdapter.diagnose();
  const lines: string[] = [];
  if (H.isGroup()) lines.push(`<div class="canon-note warn">${t('groupUnsupported')}</div>`);
  if (!camp) {
    lines.push(`<div>${t('notBound')}</div><button class="menu_button" data-act="enable">${t('enable')}</button>`);
  } else {
    let title = camp.packSnapshot.title;
    lines.push(`<div><b>${esc(title)}</b> v${esc(camp.packVersion)} · hash ${esc(camp.packHash.slice(0, 10))} · rev ${camp.revision}${camp.enabled ? '' : ' · ' + t('phase_disabled')}</div>`);
    lines.push(`<div class="canon-row">
      <button class="menu_button" data-act="inspect">${t('inspect')}</button>
      <button class="menu_button" data-act="rebuild">${t('rebuild')}</button>
      <button class="menu_button" data-act="retry">${t('retry')}</button>
      <button class="menu_button" data-act="export">${t('exportBackup')}</button>
      <button class="menu_button" data-act="import">${t('importBackup')}</button>
      <button class="menu_button" data-act="update">${t('updatePack')}</button>
      <button class="menu_button" data-act="toggle">${camp.enabled ? t('disable') : t('reenable')}</button>
      <button class="menu_button" data-act="unbind">${t('unbind')}</button></div>`);
  }
  const comp = detectCompetingLore();
  if (comp.books.length) lines.push(`<div class="canon-note warn">${t('competing')} ${comp.books.map(esc).join(', ')}<br>${t('competingHint')}</div>`);
  if (comp.gmRule) lines.push(`<div class="canon-note warn">${t('gmConflict')}</div>`);
  if (hd.version && !hd.ok) lines.push(`<div class="canon-note warn">${t('unsupportedHorae')}: ${esc(hd.missing.join(', '))}</div>`);
  lines.push(`<details><summary>${t('advanced')}</summary><div class="canon-adv">
    ${num('maxRepairs', s.maxRepairs)}${num('maxOrdinaryPlanner', s.maxOrdinaryPlanner)}${num('budgetChars', s.budgetChars)}${num('taskTimeoutMs', s.taskTimeoutMs)}${num('draftTimeoutMs', s.draftTimeoutMs)}${num('horizonMinutes', s.horizonMinutes)}
    <label><input type="checkbox" data-set="forcedPlannerAttempt" ${s.forcedPlannerAttempt ? 'checked' : ''}> forcedPlannerAttempt</label>
    <label><input type="checkbox" data-set="debug" ${s.debug ? 'checked' : ''}> ${t('debug')}</label>
    <label>UI <select data-set="uiLang"><option value="zh" ${s.uiLang !== 'en' ? 'selected' : ''}>中文</option><option value="en" ${s.uiLang === 'en' ? 'selected' : ''}>English</option></select></label>
    </div></details>`);
  lines.push('<input type="file" accept=".json,application/json" class="canon-file" style="display:none">');
  body.innerHTML = lines.join('');
}

function num(key: string, v: number) {
  return `<label class="canon-num">${key} <input type="number" class="text_pole" data-set="${key}" value="${v}"></label>`;
}

let fileMode: 'enable' | 'import' | 'update' = 'enable';
async function onSettingsClick(ev: Event) {
  const b = (ev.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
  if (!b) return;
  const act = b.dataset.act;
  const file = document.querySelector('#canon-engine-settings .canon-file') as HTMLInputElement;
  try {
    if (act === 'enable' || act === 'import' || act === 'update') {
      if (H.isGroup()) { toast('error', t('groupUnsupported')); return; }
      fileMode = act as typeof fileMode;
      file.value = '';
      file.click();
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
  if (tgt.classList.contains('canon-file')) {
    const f = tgt.files?.[0];
    if (!f) return;
    const text = await f.text();
    if (fileMode === 'enable') openBindWizard(text);
    else if (fileMode === 'import') {
      try { const r = await E.importBackup(text); toast('info', `${r.matchedMessages}/${r.total}`); } catch (e) { toast('error', (e as Error).message); }
    } else openUpdateWizard(text);
    refreshUi();
    return;
  }
  const key = tgt.dataset.set;
  if (!key) return;
  const s = getSettings() as any;
  s[key] = tgt.type === 'checkbox' ? tgt.checked : tgt.tagName === 'SELECT' ? tgt.value : Number(tgt.value);
  if (key === 'uiLang') setLang(tgt.value === 'en' ? 'en' : 'zh');
  Object.assign(E.settings, s);
  ctx().saveSettingsDebounced?.();
  refreshUi();
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
  const startDefault = formatTick(parseCoverageStart(S.coverage));
  const evOptions = E.previewEvents(text).map((e) => `<option value="${e.lo - 1}">${esc(e.title)} (${esc(formatTick(e.lo))})</option>`).join('');
  const el = modal(`<h3>${t('wizardTitle')}</h3>
    <div><b>${esc(S.title)}</b> v${esc(S.version)} <small>(${esc(S.packId)}, ${esc(S.hash.slice(0, 12))})</small></div>
    <div>${t('validation')}: <b>${t('ok')}</b> · ${t('coverage')}: ${esc(S.coverage)} · ${t('hardCount')}: ${S.hardCount}</div>
    ${p.warnings.length ? `<details><summary>${t('warnings')} (${p.warnings.length})</summary><ul class="canon-list">${p.warnings.map((w) => `<li>${esc(w.path)} ${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
    ${horae && (horae.date || horae.time) ? `<div class="canon-note">${t('horaeDetected')}: ${esc(horae.date || '')} ${esc(horae.time || '')} ${esc(horae.location || '')}</div>` : ''}
    ${existing ? `<div class="canon-note">${t('existingChat')}</div>` : ''}
    <label>${t('startTime')} <input class="text_pole canon-start" value="${esc(startDefault)}" placeholder="D0 08:00"></label>
    <label>${t('startBefore')} <select class="canon-start-ev"><option value="">—</option>${evOptions}</select></label>
    <label>${t('originDate')} <input class="text_pole canon-origin" placeholder="YYYY-MM-DD"></label>
    <div class="canon-row"><button class="menu_button canon-confirm">${t('confirmBind')}</button><button class="menu_button" data-close>${t('close')}</button></div>
    <div class="canon-wizard-status"></div>`);
  el.querySelector('.canon-start-ev')!.addEventListener('change', (ev) => {
    const v = (ev.target as HTMLSelectElement).value;
    if (v) (el.querySelector('.canon-start') as HTMLInputElement).value = formatTick(Number(v));
  });
  el.querySelector('.canon-confirm')!.addEventListener('click', async () => {
    const startTick = parseTickLabel((el.querySelector('.canon-start') as HTMLInputElement).value);
    const o = (el.querySelector('.canon-origin') as HTMLInputElement).value.trim().match(/^(\d{1,6})-(\d{1,2})-(\d{1,2})$/);
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
  if (tr) tr[level === 'error' ? 'error' : level === 'warning' ? 'warning' : 'info'](msg, 'Canon Engine');
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

let lastNoticeCount = 0;
export function refreshUi() {
  if (!E) return;
  renderStatus();
  renderSettings();
  renderInspector();
  renderMessageDecorations();
  if (E.noticeSeq > lastNoticeCount) {
    const fresh = Math.min(E.noticeSeq - lastNoticeCount, E.notices.length);
    for (const n of E.notices.slice(-fresh)) toast(n.level === 'warn' ? 'warning' : n.level, n.text);
  }
  lastNoticeCount = E.noticeSeq;
  void NS;
}
