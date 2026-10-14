// Canon Engine v1 — SillyTavern extension entry point.
import { CanonEngine, DEFAULT_SETTINGS, type EngineSettings } from './runtime/engine';
import { StHost, StModel, ctx, gen, promptReadyFirst, promptReadyLast, loadStModule, NS } from './adapters/st';
import { HoraeAdapter } from './adapters/horae';
import { WriterLock } from './adapters/lock';
import { mountUi, refreshUi, renderMessageDecorations, t } from './ui/ui';
import type { OpType } from './runtime/types';
import { deepClone } from './domain/util';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SETTINGS_KEY = 'canonEngine';
let engine: CanonEngine | null = null;
let host: StHost | null = null;
let lock: WriterLock | null = null;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
let lastGenStart: { type: string; params: any; prior: any } | null = null;

export function globalSettings(): EngineSettings & { inspectorOpen: boolean } {
  const es = ctx().extensionSettings;
  es[SETTINGS_KEY] = { ...DEFAULT_SETTINGS, inspectorOpen: false, ...(es[SETTINGS_KEY] || {}) };
  return es[SETTINGS_KEY];
}

export function getEngine(): CanonEngine | null { return engine; }
export function getLock(): WriterLock | null { return lock; }

function scheduleReconcile(reason: string) {
  if (!engine) return;
  engine.sourceChanged(reason);
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    if (!engine?.isActive()) { refreshUi(); return; }
    engine.reconcile(reason).catch((e) => console.warn('[CanonEngine] reconcile failed', e)).finally(() => refreshUi());
  }, 400);
}

/**
 * generate_interceptor (manifest). Runs after ST added the user's message and before prompt
 * assembly. For a bound chat, native story turns are aborted and replaced by the managed op.
 */
async function interceptor(chat: any[], _contextSize: number, abort: (immediate: boolean) => void, type: string) {
  try {
    if (gen.draft) {
      // Our private draft: operation-scoped projection (the replaced swipe is not established history).
      if (gen.draft.excludeLastAssistant && chat.length && !chat[chat.length - 1].is_user) chat.pop();
      return;
    }
    if (!engine || !engine.isActive()) return;
    if (type === 'impersonate') return;
    if (type === 'quiet') {
      if (lastGenStart?.params?.quietToLoud) {
        abort(true);
        engine.notice('warn', t('blockedLoud'));
      }
      return; // other extensions' background work is not a story turn
    }
    abort(true);
    const op: OpType = type === 'regenerate' ? 'regenerate' : type === 'swipe' ? 'swipe' : type === 'continue' ? 'continue' : 'normal';
    const prior = lastGenStart && lastGenStart.type === type ? lastGenStart.prior : undefined;
    if (lock && !lock.isOwner()) {
      engine.notice('error', t('notWriter'));
      if (prior) setTimeout(() => host?.restorePrior(op, prior), 0);
      return;
    }
    if (engine.isBusy()) {
      engine.notice('warn', t('busy'));
      if (prior) setTimeout(() => host?.restorePrior(op, prior), 0);
      return;
    }
    // Start only after the native call unwinds.
    setTimeout(() => {
      ctx().deactivateSendButtons?.();
      engine!.runOperation(op, prior).finally(() => {
        try { ctx().activateSendButtons?.(); } catch { /* ignore */ }
        refreshUi();
      });
    }, 0);
  } catch (e) {
    console.error('[CanonEngine] interceptor error', e);
  }
}

function captureGenerationStart(type: string, params: any, dryRun: boolean) {
  if (dryRun || gen.draft || !engine?.isActive()) return;
  const chat = ctx().chat || [];
  let prior: any;
  if (type === 'regenerate') {
    const last = chat[chat.length - 1];
    if (last && !last.is_user && !last.is_system) prior = { message: deepClone(last) };
  } else if (type === 'swipe') {
    const mesId = chat.length - 1;
    const m = chat[mesId];
    if (m && Array.isArray(m.swipes)) prior = { mesId, swipeId: Math.max(0, m.swipes.length - 1) };
  }
  lastGenStart = { type, params, prior };
}

/** Block generation triggers in the UI while an operation runs (interceptor is the fallback). */
function installUiGuards() {
  const busy = () => !!engine?.isBusy();
  document.addEventListener('click', (ev) => {
    if (!busy()) return;
    const tgt = ev.target as HTMLElement | null;
    if (!tgt) return;
    if (tgt.closest('#send_but, #option_regenerate, #option_continue, .swipe_right, #mes_continue, #mes_impersonate')) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      engine?.notice('warn', t('busy'));
      refreshUi();
    }
    if (tgt.closest('#mes_stop')) engine?.cancel();
  }, true);
  document.addEventListener('keydown', (ev) => {
    if (!busy()) return;
    const tgt = ev.target as HTMLElement | null;
    if (ev.key === 'Enter' && !ev.shiftKey && tgt?.id === 'send_textarea') {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      engine?.notice('warn', t('busy'));
    }
  }, true);
}

async function init() {
  const c = ctx();
  await loadStModule();
  const model = new StModel();
  host = new StHost(model);
  model.horaePresent = !!HoraeAdapter.detect();
  engine = new CanonEngine(host, globalSettings());
  lock = new WriterLock(engine.instanceId);
  host.writerCheck = () => lock!.isOwner();
  (globalThis as any).canonEngineGenerateInterceptor = interceptor;
  (globalThis as any).CanonEngine = { engine, host, gen, lock, diagnoseHorae: () => HoraeAdapter.diagnose(), version: '1.1.4' };

  const es = c.eventSource;
  const et = c.eventTypes || c.event_types;
  const first = (ev: string, fn: (...a: any[]) => any) => (typeof es.makeFirst === 'function' ? es.makeFirst(ev, fn) : es.on(ev, fn));
  first(et.GENERATION_STARTED, captureGenerationStart);
  first(et.MESSAGE_RECEIVED, (id: number) => host?.stampReceived(id));
  first(et.CHAT_COMPLETION_PROMPT_READY, promptReadyFirst);
  // last listener: re-append on app ready so it runs after other extensions' prompt hooks
  const registerLast = () => { try { es.removeListener(et.CHAT_COMPLETION_PROMPT_READY, promptReadyLast); } catch { /* ignore */ } es.on(et.CHAT_COMPLETION_PROMPT_READY, promptReadyLast); };
  registerLast();
  es.on(et.APP_READY, registerLast);
  es.on(et.GENERATION_STOPPED, () => { if (engine?.isBusy() && !gen.draft) engine.cancel(); });
  es.on(et.CHAT_CHANGED, async () => {
    if (!engine) return;
    engine.sourceChanged('chat_changed');
    host!.horae = HoraeAdapter.detect();
    model.horaePresent = !!host!.horae;
    const camp = engine.campaign();
    lock?.setCampaign(camp?.enabled ? camp.sessionId : null);
    try { await engine.onChatLoaded(); } catch (e) { console.warn('[CanonEngine] chat load reconcile failed', e); }
    refreshUi();
  });
  for (const ev of [et.MESSAGE_EDITED, et.MESSAGE_DELETED, et.MESSAGE_SWIPED, et.MESSAGE_SWIPE_DELETED, et.MESSAGE_UPDATED]) {
    if (ev) es.on(ev, () => scheduleReconcile(String(ev)));
  }
  for (const ev of [et.CHARACTER_MESSAGE_RENDERED, et.USER_MESSAGE_RENDERED, et.MORE_MESSAGES_LOADED, et.MESSAGE_SWIPED]) {
    if (ev) es.on(ev, () => setTimeout(renderMessageDecorations, 50));
  }
  engine.onChange(() => refreshUi());
  installUiGuards();
  mountUi(engine, host, () => globalSettings(), () => lock);
  if (c.getCurrentChatId?.()) {
    const camp = engine.campaign();
    lock.setCampaign(camp?.enabled ? camp.sessionId : null);
    engine.onChatLoaded().catch(() => undefined).finally(() => refreshUi());
  }
  console.log('[CanonEngine] v1.1.4 loaded');
}

// ST loads extension modules after the app initializes; init immediately when possible.
(async () => {
  try {
    const c = ctx();
    if (c?.eventSource) await init();
  } catch (e) {
    console.error('[CanonEngine] failed to initialize', e);
  }
})();

export { NS };
