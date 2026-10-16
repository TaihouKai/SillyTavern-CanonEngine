// SillyTavern adapter (verified against ST 1.19.0 @ 06bde939, see COMPATIBILITY.md).
// - managed generation: native Generate is intercepted for bound chats and aborted; the engine
//   then generates a PRIVATE draft with Generate('quiet') (full native prompt assembly, never
//   streamed, no MESSAGE_RECEIVED/CHARACTER_MESSAGE_RENDERED) and publishes only accepted text
//   through ST's own saveReply.
// - isolation: internal structured tasks use generateRaw; prompt hooks of other extensions are
//   neutralized by restoring the exact task messages at CHAT_COMPLETION_PROMPT_READY.
import type { HostPort, PublishRequest } from '../runtime/host';
import type { CampaignData, Interpretation, OpType, SourceEntry } from '../runtime/types';
import type { ChatMsg, DraftRequest, ModelPort, TaskName } from '../runtime/model';
import { TASK_TAG } from '../runtime/model';
import { newId, sha256, deepClone, EngineError } from '../domain/util';
import { HoraeAdapter } from './horae';
import { excludeHoraeForOperation } from '../runtime/engine';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const SillyTavern: { getContext(): any };

export const NS = 'canonEngine';
const EXT_PROMPT_KEY = 'canon_engine_context';
const EXT_LENGTH_KEY = 'canon_engine_length';
// Sorts before EXT_LENGTH_KEY (ST orders injections by key), so the length note stays last at depth 0.
const EXT_INSTRUCTION_KEY = 'canon_engine_instruction';
// The only Canon Engine injection that ST scans for World Info keys: a short list of this turn's relevant names.
const EXT_LORE_KEY = 'canon_engine_lore';

export interface StModule {
  saveChat: (o?: any) => Promise<void>;
  extension_prompt_types: { IN_PROMPT: number; IN_CHAT: number; BEFORE_PROMPT: number; NONE: number };
  extension_prompt_roles: { SYSTEM: number; USER: number; ASSISTANT: number };
  addOneMessage: (mes: any, opts?: any) => void;
  syncSwipeToMes?: (messageId?: number | null, swipeId?: number | null) => boolean;
  chat: any[];
}

let stModule: StModule | null = null;
export async function loadStModule(): Promise<StModule> {
  if (stModule) return stModule;
  // Same URL as ST's own module graph -> same module instance (versioned adapter dependency).
  const url = '/script.js';
  stModule = (await import(/* @vite-ignore */ url)) as StModule;
  return stModule;
}

let reasoningModule: any = null;
/** ST's reasoning helpers (same module instance as ST's own). Optional: missing exports mean no reasoning. */
async function loadReasoningModule(): Promise<any> {
  if (reasoningModule) return reasoningModule;
  const url = '/scripts/reasoning.js';
  try { reasoningModule = await import(/* @vite-ignore */ url); } catch { reasoningModule = {}; }
  return reasoningModule;
}

export function ctx(): any {
  return SillyTavern.getContext();
}

/** Operation-scoped flags read by the interceptor and the prompt hooks. */
export const gen = {
  draft: null as null | { token: string; excludeLastAssistant: boolean; captured: any[] | null; before: Set<any> | null; injectedRemoved: number },
  raw: null as null | { token: string; messages: ChatMsg[] },
  lastDraftPrompt: null as null | any[],
  /** Reasoning of the most recent private draft. ST's quiet generation drops it, so it is captured here
   * and attached when that draft is published (the accepted draft is always the latest one). */
  lastDraftReasoning: '',
  lastDraftInfo: null as null | import('../runtime/model').DraftInfo,
};

function attachmentIdentity(m: any): string {
  // ST >= 1.19 stores attachments in extra.files; extra.file is a deprecated getter that logs a
  // console trace when read, so only read it when it is a plain (pre-1.19) data property.
  const legacy = m?.extra ? Object.getOwnPropertyDescriptor(m.extra, 'file') : undefined;
  const files = Array.isArray(m?.extra?.files) ? m.extra.files : legacy && 'value' in legacy && legacy.value ? [legacy.value] : [];
  const media = Array.isArray(m?.extra?.media) ? m.extra.media : [];
  return [...files.map((f: any) => f?.url || f?.name || ''), ...media.map((x: any) => x?.url || '')].join('|');
}

/** A real system message (help, comment, narrator /sys, tool calls), as opposed to a player or GM
 *  message the user hid. ST's hide (eye icon, /hide, extensions that hide summarized messages) only
 *  sets is_system on the message; hiding keeps it out of the prompt but does not erase it from the story. */
export function isGenuineSystem(m: any): boolean {
  if (!m?.is_system) return false;
  if (m.is_user) return false;
  const x = m.extra || {};
  if (x.type || x.tool_invocations || x.isSmallSys) return true;
  if (m.name === 'SillyTavern System') return true;
  // a message Canon Engine already registered as a GM reply stays one when hidden
  if (x[NS]?.mid) return false;
  return !x.api && !x.model && !Array.isArray(m.swipes);
}

export function contentHashOf(role: string, name: string, text: string, attach: string): string {
  return sha256(`${role}\u0000${name}\u0000${text}\u0000${attach}`);
}

export class StHost implements HostPort {
  horae: HoraeAdapter | null;
  model: ModelPort;
  private saving: Promise<void> = Promise.resolve();
  pendingStamp: null | { messageId: string; variantId: string; commitId: string } = null;
  writerCheck: (() => boolean) | null = null;

  isWriter(): boolean { return this.writerCheck ? this.writerCheck() : true; }

  constructor(model: ModelPort) {
    this.model = model;
    this.horae = HoraeAdapter.detect();
  }

  chatId(): string | null {
    try { return ctx().getCurrentChatId?.() || null; } catch { return null; }
  }
  isGroup(): boolean { return !!ctx().groupId; }
  integrity(): string | null { return ctx().chatMetadata?.integrity || null; }

  /** Stable ids live in message.extra.canonEngine (per swipe via swipe_info[i].extra). */
  readTranscript(): SourceEntry[] {
    const c = ctx();
    const chat: any[] = c.chat || [];
    const out: SourceEntry[] = [];
    const seen = new Set<string>();
    chat.forEach((m, index) => {
      if (!m) return;
      const role: SourceEntry['role'] = isGenuineSystem(m) ? 'system' : m.is_user ? 'user' : 'gm';
      if (!m.extra || typeof m.extra !== 'object') m.extra = {};
      let id = m.extra[NS];
      if (!id || typeof id !== 'object' || !id.mid) {
        id = { mid: newId('msg'), vid: role === 'gm' ? newId('var') : 'v0' };
        m.extra[NS] = id;
        this.syncSwipeExtra(m);
      }
      if (seen.has(id.mid)) {
        // a native copy duplicated our identity: the later message gets a fresh identity
        id = { mid: newId('msg'), vid: role === 'gm' ? newId('var') : 'v0' };
        m.extra[NS] = id;
        this.syncSwipeExtra(m);
      }
      seen.add(id.mid);
      const text = String(m.mes ?? '');
      out.push({ index, messageId: id.mid, variantId: id.vid || 'v0', contentHash: contentHashOf(role, String(m.name || ''), text, attachmentIdentity(m)), role, name: String(m.name || ''), text });
    });
    return out;
  }

  private syncSwipeExtra(m: any) {
    if (typeof m.swipe_id === 'number' && Array.isArray(m.swipe_info) && m.swipe_info[m.swipe_id]) {
      const si = m.swipe_info[m.swipe_id];
      si.extra = si.extra && typeof si.extra === 'object' ? si.extra : {};
      si.extra[NS] = deepClone(m.extra[NS]);
    }
  }

  hashAssistant(text: string): string {
    return contentHashOf('gm', String(ctx().name2 || ''), text, '');
  }

  getCampaign(): CampaignData | null {
    if (!this.chatId()) return null; // ST keeps placeholder metadata while no chat is open
    const md = ctx().chatMetadata;
    return (md && md[NS]) || null;
  }
  setCampaign(data: CampaignData | null): void {
    const md = ctx().chatMetadata;
    if (!md || (data && !this.chatId())) return;
    if (data) md[NS] = data; else delete md[NS];
  }

  /**
   * Durable save. Uses ST's own serialized save path (saveChatConditional, which coordinates with
   * ST's and other extensions' saves - concurrent direct saves fail on Windows with EPERM during
   * the atomic rename) and then VERIFIES the result by reading the chat file back, because that
   * path swallows errors. Throws when the save cannot be verified.
   */
  async save(): Promise<void> {
    const run = async () => {
      if (this.isGroup()) throw new Error('group chats are not supported');
      const c = ctx();
      const camp = this.getCampaign();
      const token = newId('sv');
      if (camp) camp.saveToken = token;
      const seen: string[] = [];
      // A slow server (e.g. Docker on a NAS) or another extension's save can keep ST busy; ST then
      // silently skips our save. Retry with growing back-off (~10 s total) before reporting.
      const delays = [500, 1000, 2000, 3000, 4000];
      for (let attempt = 1; attempt <= delays.length + 1; attempt++) {
        const req = await this.watchSaveRequest(() => c.saveChat());
        if (!camp) return;
        const v = await this.verifySaved(token);
        if (v.ok) return;
        seen.push(`attempt ${attempt}: ${req}; read-back: ${v.detail}`);
        console.warn('[CanonEngine] save not verified', seen[seen.length - 1]);
        if (attempt > delays.length) break;
        await new Promise((r) => setTimeout(r, delays[attempt - 1]));
      }
      throw new Error(`the chat file could not be saved (server did not persist the engine state). ${saveHint(seen)} Details (${seen.length} attempts): ${[...new Set(seen.map((x) => x.replace(/^attempt \d+: /, '')))].join(' | ')}`);
    };
    const p = this.saving.then(run, run);
    this.saving = p.catch(() => undefined);
    return p;
  }

  /** Runs ST's save while recording what happened to its /api/chats/save request (ST swallows errors). */
  private async watchSaveRequest(run: () => Promise<unknown>): Promise<string> {
    const orig = window.fetch;
    let info = 'SillyTavern sent no save request (save skipped: another save still running, or no chat file)';
    const wrapped = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const isSave = /\/api\/chats\/save/.test(url);
      try {
        const r = await orig(input as RequestInfo, init);
        if (isSave) {
          const size = typeof init?.body === 'string' ? init.body.length : (init?.body as Blob | undefined)?.size ?? 0;
          let body = '';
          if (!r.ok) { try { body = (await r.clone().text()).slice(0, 160); } catch { /* ignore */ } }
          info = `save request HTTP ${r.status}${r.statusText ? ' ' + r.statusText : ''} (${Math.round(size / 1024)} KB${(init?.headers as any)?.['Content-Encoding'] ? ', compressed' : ''})${body ? ': ' + body : ''}`;
        }
        return r;
      } catch (e) {
        if (isSave) info = `save request failed: ${(e as Error).message}`;
        throw e;
      }
    };
    window.fetch = wrapped as typeof fetch;
    try { await run(); } finally { if (window.fetch === wrapped) window.fetch = orig; }
    return info;
  }

  private async verifySaved(token: string): Promise<{ ok: boolean; detail: string }> {
    const c = ctx();
    const ch = c.characters?.[c.characterId];
    if (!ch) return { ok: false, detail: 'no current character' };
    try {
      const resp = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), cache: 'no-cache', body: JSON.stringify({ ch_name: ch.name, file_name: String(ch.chat || '').replace(/\.jsonl$/, ''), avatar_url: ch.avatar }) });
      if (!resp.ok) return { ok: false, detail: `HTTP ${resp.status} reading chat "${ch.chat}"` };
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) return { ok: false, detail: `chat "${ch.chat}" not found on the server` };
      const saved = data[0]?.chat_metadata?.[NS];
      if (!saved) return { ok: false, detail: `chat "${ch.chat}" has no engine data` };
      return saved.saveToken === token ? { ok: true, detail: 'ok' } : { ok: false, detail: 'older engine data on the server' };
    } catch (e) {
      return { ok: false, detail: `read-back failed: ${(e as Error).message}` };
    }
  }

  async publish(req: PublishRequest, _interp: Interpretation): Promise<void> {
    const c = ctx();
    const chat: any[] = c.chat;
    this.pendingStamp = { messageId: req.messageId, variantId: req.variantId, commitId: req.commitId };
    const reasoning = gen.lastDraftReasoning;
    gen.lastDraftReasoning = '';
    try {
      if (req.op === 'swipe') {
        // ST reverts its own slot after the aborted native overswipe (endSwipe clamp), so the
        // managed swipe opens the new native slot itself, exactly as swipe() does before Generate.
        const last = chat[chat.length - 1];
        if (!last || last.is_user || last.is_system) throw new Error('the swiped reply is no longer the last message');
        if (!Array.isArray(last.swipes)) { last.swipes = [last.mes]; last.swipe_info = [{ send_date: last.send_date, gen_started: last.gen_started, gen_finished: last.gen_finished, extra: structuredClone(last.extra || {}) }]; last.swipe_id = 0; }
        await this.settleSwipe();
        try { (await loadStModule() as any).syncMesToSwipe?.(chat.length - 1); } catch { /* optional */ }
        last.swipe_id = last.swipes.length;
        await c.saveReply({ type: 'swipe', getMessage: req.text, reasoning });
      } else if (req.op === 'continue') {
        await c.saveReply({ type: 'appendFinal', getMessage: req.text });
      } else {
        await c.saveReply({ type: 'normal', getMessage: req.text, reasoning });
      }
      // Ensure the stamp landed (MESSAGE_RECEIVED hook) even if another listener replaced extra.
      const m = chat[chat.length - 1];
      if (m && !m.is_user) {
        m.extra = m.extra || {};
        m.extra[NS] = { mid: req.messageId, vid: req.variantId, commitId: req.commitId };
        this.syncSwipeExtra(m);
      }
    } finally {
      this.pendingStamp = null;
    }
    await this.save();
  }

  /** Wait (bounded) until ST's native swipe animation/revert has finished. */
  async settleSwipe(): Promise<void> {
    const c = ctx();
    for (let i = 0; i < 40; i++) {
      let st: unknown = 'none';
      try { st = c.swipe?.state?.(); } catch { /* ignore */ }
      if (!st || st === 'none' || st === 0) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  /** MESSAGE_RECEIVED (first listener): stamp identity before render/other extensions run. */
  stampReceived(messageId: number) {
    if (!this.pendingStamp) return;
    const m = ctx().chat?.[messageId];
    if (!m || m.is_user) return;
    m.extra = m.extra || {};
    m.extra[NS] = { mid: this.pendingStamp.messageId, vid: this.pendingStamp.variantId, commitId: this.pendingStamp.commitId };
  }

  async restorePrior(op: OpType, prior: any): Promise<void> {
    const c = ctx();
    const mod = await loadStModule();
    const chat: any[] = c.chat;
    if (op === 'regenerate' && prior?.message) {
      const last = chat[chat.length - 1];
      const lastId = last?.extra?.[NS]?.mid;
      if (lastId && lastId === prior.message?.extra?.[NS]?.mid) return; // already present
      chat.push(prior.message);
      mod.addOneMessage(prior.message);
      await this.save();
    } else if (op === 'swipe' && prior && typeof prior.mesId === 'number') {
      const m = chat[prior.mesId];
      if (!m) return;
      if (typeof m.swipe_id === 'number' && m.swipe_id >= (m.swipes?.length ?? 0)) {
        m.swipe_id = prior.swipeId;
        if (mod.syncSwipeToMes) mod.syncSwipeToMes(prior.mesId, prior.swipeId);
        else { m.mes = m.swipes[prior.swipeId]; m.extra = structuredClone(m.swipe_info?.[prior.swipeId]?.extra || m.extra); }
        mod.addOneMessage(m, { type: 'swipe', forceId: prior.mesId, scroll: true });
        try { c.swipe?.refresh?.(); } catch { /* cosmetic */ }
        await this.save();
      }
    }
  }

  async settle(): Promise<void> { await this.settleSwipe(); }

  persona(): { name: string; description: string } {
    const c = ctx();
    return { name: String(c.name1 || ''), description: String(c.powerUserSettings?.persona_description || '') };
  }

  now(): number { return Date.now(); }

  log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: unknown) {
    const f = level === 'error' ? console.error : level === 'warn' ? console.warn : level === 'debug' ? console.debug : console.log;
    f(`[CanonEngine] ${msg}`, data === undefined ? '' : data);
  }
}

// -------------------------------------------------------------------------------------------------
// Model port over ST's configured connection

export class StModel implements ModelPort {
  lastDraftInfo() { return gen.lastDraftInfo; }
  private queue: Promise<unknown> = Promise.resolve();
  horaePresent = false;
  /** Read at call time so the drawer setting applies immediately. */
  taskTemperature: () => number = () => 0.2;
  /** Connection profile for internal analysis tasks ('' = the chat's own connection). Story drafts never use it. */
  taskProfileId: () => string = () => '';
  /** Extra body parameters (YAML) for profile requests; overrides what the active chat settings would add. */
  taskExtraBody: () => string = () => '';

  /** Human-readable name of the connection internal tasks use (for error messages). */
  describeTaskConnection(): string {
    const id = this.taskProfileId();
    if (!id) {
      const cs = (ctx().chatCompletionSettings || {}) as Record<string, unknown>;
      return `the chat's own connection (${cs.custom_model || cs.openai_model || 'current model'})`;
    }
    try { const p = (ctx() as any).ConnectionManagerRequestService.getProfile(id); return `analysis profile "${p.name}" (${p.model || 'model not set'})`; } catch { return 'a missing analysis profile'; }
  }

  /** One internal-task completion, through the task profile when one is configured. */
  private async complete(msgs: ChatMsg[], budget: number, signal?: AbortSignal): Promise<string> {
    const c = ctx();
    const profileId = this.taskProfileId();
    if (profileId) {
      const svc = (c as any).ConnectionManagerRequestService;
      if (!svc) throw new Error('the analysis connection profile needs the SillyTavern Connection Manager (Connection Profiles), which is not available');
      let profile: any;
      try { profile = svc.getProfile(profileId); } catch { throw new Error('the connection profile chosen for Canon Engine analysis no longer exists; pick another one in the Canon Engine settings'); }
      try {
        // SillyTavern builds profile requests from the ACTIVE chat settings overlaid with the profile's
        // preset, so "Include Body Parameters" (e.g. Venice's disable_thinking) would otherwise come
        // from the story connection. taskExtraBody pins them for analysis requests.
        const extra = this.taskExtraBody().trim();
        const res = await svc.sendRequest(profileId, msgs, budget, { stream: false, signal: signal || null, extractData: true, includePreset: true }, { temperature: this.taskTemperature(), ...(extra ? { custom_include_body: extra } : {}) });
        const out = String((res as { content?: string })?.content ?? '').trim();
        if (!out) throw new Error('No message generated');
        return out;
      } catch (e) {
        const err = e as Error & { cause?: Error };
        if (/No message generated/.test(err.message)) throw err;
        throw new Error(`analysis profile "${profile?.name || profileId}": ${err.cause?.message || err.message}`);
      }
    }
    // Same connection as the chat: ST's generateRaw, at a temporarily lowered temperature.
    const cs = c.chatCompletionSettings as Record<string, unknown> | undefined;
    const savedTemp = cs?.temp_openai;
    if (cs && savedTemp !== undefined) cs.temp_openai = Math.min(Number(savedTemp), this.taskTemperature());
    try {
      return String((await c.generateRaw({ prompt: msgs, responseLength: budget, trimNames: false })) ?? '');
    } finally {
      if (cs && savedTemp !== undefined) cs.temp_openai = savedTemp;
    }
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => undefined);
    return p;
  }

  runTask(task: TaskName, messages: ChatMsg[], opts: { signal?: AbortSignal; maxTokens?: number }): Promise<string> {
    return this.serialize(async () => {
      if (opts.signal?.aborted) throw new Error('aborted');
      const c = ctx();
      const msgs = messages.map((m) => ({ ...m }));
      // Horae fork convention: skip its context injection / vector recall for this internal request.
      if (this.horaePresent) msgs[0].content += `\n[HORAE_INTERNAL:NO_CONTEXT_INJECTION:canon]\n[HORAE_INTERNAL:NO_VECTOR_RECALL:canon]`;
      const token = newId('raw');
      gen.raw = { token, messages: messages.map((m) => ({ ...m })) };
      // generateRaw has no signal parameter; ST aborts raw generations on GENERATION_STOPPED.
      const stopRaw = () => { if (!this.taskProfileId()) try { (c as any).eventSource?.emit((c as any).eventTypes?.GENERATION_STOPPED ?? 'generation_stopped'); } catch { /* ignore */ } };
      opts.signal?.addEventListener('abort', stopRaw, { once: true });
      try {
        // Empty replies are common with reasoning models (thinking uses up the budget) and with
        // provider content filters. Retry with a larger budget before giving up.
        let budget = opts.maxTokens || 4096;
        // Internal analysis runs near-deterministically (taskTemperature): at a story temperature
        // such as 1.0, models drift and emit broken or truncated JSON.
        for (let attempt = 1; ; attempt++) {
          try {
            return await this.complete(msgs, budget, opts.signal);
          } catch (e) {
            const empty = /No message generated/i.test((e as Error).message);
            if (!empty || opts.signal?.aborted) throw e;
            if (attempt >= 3) throw new Error(`the model returned an empty reply ${attempt} times (last budget ${budget} tokens). Usual causes: a reasoning/thinking model spending the whole budget on reasoning (lower its reasoning effort, or choose a fast non-reasoning model as the analysis connection in the Canon Engine settings), a provider content filter blocking the request, or a very small max response length.`);
            budget = Math.min(budget * 2, 16384);
          }
        }
      } finally {
        opts.signal?.removeEventListener('abort', stopRaw);
        if (gen.raw?.token === token) gen.raw = null;
      }
    });
  }

  generateDraft(req: DraftRequest): Promise<string> {
    return this.serialize(async () => {
      if (req.signal?.aborted) throw new Error('aborted');
      const c = ctx();
      const mod = await loadStModule();
      const token = newId('draft');
      gen.draft = { token, excludeLastAssistant: req.excludeLastAssistant, captured: null, before: null, injectedRemoved: 0 };
      const rmod = await loadReasoningModule();
      gen.lastDraftReasoning = '';
      gen.lastDraftInfo = null;
      // Quiet generations return only the text. Read the API's reasoning field from our own draft
      // request's response (identified by the engine context in its body), as ST does for normal replies.
      const origFetch = window.fetch;
      let apiReasoning: Promise<string> | null = null;
      const tap = async (input: RequestInfo | URL, init?: RequestInit) => {
        const res = await origFetch(input, init);
        try {
          const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
          if (url.includes('/api/backends/chat-completions/generate') && typeof init?.body === 'string' && init.body.includes('[CANON ENGINE CONTEXT') && res.ok) {
            let maxTokens: number | undefined;
            try { const b = JSON.parse(init.body); maxTokens = Number(b.max_tokens ?? b.max_completion_tokens) || undefined; } catch { /* stats are optional */ }
            apiReasoning = res.clone().json().then((d) => {
              const u = d?.usage || {};
              gen.lastDraftInfo = { finish: d?.choices?.[0]?.finish_reason || undefined, outputTokens: u.completion_tokens, reasoningTokens: u.completion_tokens_details?.reasoning_tokens, maxTokens };
              return String(rmod.extractReasoningFromData?.(d) || '');
            }).catch(() => '');
          }
        } catch { /* reasoning is optional */ }
        return res;
      };
      window.fetch = tap as typeof fetch;
      c.setExtensionPrompt(EXT_PROMPT_KEY, req.engineContext, mod.extension_prompt_types.IN_CHAT, 1, false, mod.extension_prompt_roles.SYSTEM);
      // Depth 0: after the latest message, so nothing sits between the length instruction and the reply.
      c.setExtensionPrompt(EXT_LENGTH_KEY, req.lengthNote || '', mod.extension_prompt_types.IN_CHAT, 0, false, mod.extension_prompt_roles.SYSTEM);
      // Continue/repair instructions go in as an unscanned injection, not as the quiet prompt: ST scans the
      // quiet prompt for World Info keys, and a repair's facts list names every pack entity (live finding:
      // a 1373-entry lorebook added ~50k tokens to one repair).
      c.setExtensionPrompt(EXT_INSTRUCTION_KEY, req.instruction || '', mod.extension_prompt_types.IN_CHAT, 0, false, mod.extension_prompt_roles.SYSTEM);
      // Lore for the characters the engine brings into play (e.g. a planned pursuer nobody named in the
      // last messages) comes from the user's lorebooks through this scanned line.
      const lore = (req.loreNames || []).length ? `[Canon Engine: relevant to this turn: ${req.loreNames!.join(', ')}]` : '';
      c.setExtensionPrompt(EXT_LORE_KEY, lore, mod.extension_prompt_types.IN_CHAT, 1, true, mod.extension_prompt_roles.SYSTEM);
      const onAbort = () => { try { c.stopGeneration?.(); } catch { /* ignore */ } };
      req.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const out = await c.generateQuietPrompt({ quietPrompt: '', removeReasoning: false, skipWIAN: false });
        if (req.signal?.aborted) throw new Error('aborted');
        // ST trims in-chat injections that do not fit the model's context size. Never accept a
        // draft whose final prompt lost the engine context.
        const captured = gen.draft?.token === token ? gen.draft.captured : null;
        if (captured && !captured.some((m: any) => typeof m.content === 'string' && m.content.includes('[CANON ENGINE CONTEXT'))) {
          throw new EngineError('capacity', 'SillyTavern dropped the Canon Engine context from the prompt because it did not fit the configured context size. Increase “Context Size (tokens)” in the API settings, or lower budgetChars in Canon Engine advanced settings.');
        }
        // Reasoning inside the text (auto-parse templates such as <think>): split it off as ST would.
        let text = String(out ?? '');
        let parsed = '';
        const stripped = typeof rmod.removeReasoningFromString === 'function' ? String(rmod.removeReasoningFromString(text)) : text;
        if (stripped !== text) { parsed = String(rmod.parseReasoningFromString?.(text)?.reasoning || ''); text = stripped; }
        gen.lastDraftReasoning = (apiReasoning ? await apiReasoning : '') || parsed;
        return text;
      } finally {
        if (window.fetch === (tap as typeof fetch)) window.fetch = origFetch;
        req.signal?.removeEventListener('abort', onAbort);
        c.setExtensionPrompt(EXT_PROMPT_KEY, '', mod.extension_prompt_types.IN_CHAT, 1, false, mod.extension_prompt_roles.SYSTEM);
        c.setExtensionPrompt(EXT_LENGTH_KEY, '', mod.extension_prompt_types.IN_CHAT, 0, false, mod.extension_prompt_roles.SYSTEM);
        c.setExtensionPrompt(EXT_INSTRUCTION_KEY, '', mod.extension_prompt_types.IN_CHAT, 0, false, mod.extension_prompt_roles.SYSTEM);
        c.setExtensionPrompt(EXT_LORE_KEY, '', mod.extension_prompt_types.IN_CHAT, 1, false, mod.extension_prompt_roles.SYSTEM);
        if (gen.draft?.token === token) {
          gen.lastDraftPrompt = gen.draft.captured;
          gen.draft = null;
        }
      }
    });
  }
}

// -------------------------------------------------------------------------------------------------
// Prompt hooks (registered once): first + last CHAT_COMPLETION_PROMPT_READY listeners.

export function promptReadyFirst(eventData: any) {
  if (eventData?.dryRun) return;
  if (gen.draft && Array.isArray(eventData?.chat)) gen.draft.before = new Set(eventData.chat);
}

export function promptReadyLast(eventData: any) {
  if (eventData?.dryRun || !Array.isArray(eventData?.chat)) return;
  if (gen.raw && eventData.chat.some((m: any) => typeof m?.content === 'string' && m.content.includes('[CANON_ENGINE_TASK:'))) {
    // Exact task messages only: no lore/persona/memory injected by other extensions.
    eventData.chat.splice(0, eventData.chat.length, ...gen.raw.messages.map((m) => ({ role: m.role, content: m.content })));
    return;
  }
  if (gen.draft) {
    if (excludeHoraeForOperation && gen.draft.before) {
      // Stale Horae memory after edits: drop messages other extensions injected at prompt-ready time.
      const before = gen.draft.before;
      for (let i = eventData.chat.length - 1; i >= 0; i--) {
        const m = eventData.chat[i];
        if (!before.has(m) && m?.role === 'system' && typeof m.content === 'string' && !m.content.includes('[CANON ENGINE')) {
          eventData.chat.splice(i, 1);
          gen.draft.injectedRemoved++;
        }
      }
    }
    gen.draft.captured = eventData.chat.map((m: any) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }));
  }
}

/** True when a message list is one of our internal task prompts. */
export function isTaskPrompt(messages: ChatMsg[]): boolean {
  return messages.some((m) => m.content.includes(TASK_TAG('evaluate').slice(0, 19)));
}

function saveHint(seen: string[]): string {
  const all = seen.join(' ');
  if (/HTTP 413/.test(all)) return 'The request was too large for something between the browser and SillyTavern (usually a reverse proxy such as nginx: raise client_max_body_size, e.g. to 50m).';
  if (/HTTP 400/.test(all) && /integrity/i.test(all)) return 'SillyTavern refused the save because the chat file changed elsewhere (another browser/device has this chat open). Close other tabs/devices and reload.';
  if (/HTTP 403|HTTP 401/.test(all)) return 'SillyTavern refused the save (session/CSRF expired). Reload the page.';
  if (/no save request/.test(all)) return 'SillyTavern skipped the save. Wait a moment and press Retry.';
  return 'Press Retry; if it keeps failing, reload the page and send these details.';
}
