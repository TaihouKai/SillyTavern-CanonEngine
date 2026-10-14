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

export function ctx(): any {
  return SillyTavern.getContext();
}

/** Operation-scoped flags read by the interceptor and the prompt hooks. */
export const gen = {
  draft: null as null | { token: string; excludeLastAssistant: boolean; captured: any[] | null; before: Set<any> | null; injectedRemoved: number },
  raw: null as null | { token: string; messages: ChatMsg[] },
  lastDraftPrompt: null as null | any[],
};

function attachmentIdentity(m: any): string {
  const files = m?.extra?.files || (m?.extra?.file ? [m.extra.file] : []);
  const media = Array.isArray(m?.extra?.media) ? m.extra.media : [];
  return [...files.map((f: any) => f?.url || f?.name || ''), ...media.map((x: any) => x?.url || '')].join('|');
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
      const role: SourceEntry['role'] = m.is_system ? 'system' : m.is_user ? 'user' : 'gm';
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
    const md = ctx().chatMetadata;
    return (md && md[NS]) || null;
  }
  setCampaign(data: CampaignData | null): void {
    const md = ctx().chatMetadata;
    if (!md) return;
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
      for (let attempt = 1; attempt <= 3; attempt++) {
        await c.saveChat();
        if (!camp) return;
        if (await this.verifySaved(token)) return;
        await new Promise((r) => setTimeout(r, 300 * attempt));
      }
      throw new Error('the chat file could not be saved (server did not persist the engine state)');
    };
    const p = this.saving.then(run, run);
    this.saving = p.catch(() => undefined);
    return p;
  }

  private async verifySaved(token: string): Promise<boolean> {
    const c = ctx();
    const ch = c.characters?.[c.characterId];
    if (!ch) return false;
    try {
      const resp = await fetch('/api/chats/get', { method: 'POST', headers: c.getRequestHeaders(), cache: 'no-cache', body: JSON.stringify({ ch_name: ch.name, file_name: String(ch.chat || '').replace(/\.jsonl$/, ''), avatar_url: ch.avatar }) });
      if (!resp.ok) return false;
      const data = await resp.json();
      return Array.isArray(data) && data[0]?.chat_metadata?.[NS]?.saveToken === token;
    } catch {
      return false;
    }
  }

  async publish(req: PublishRequest, _interp: Interpretation): Promise<void> {
    const c = ctx();
    const chat: any[] = c.chat;
    this.pendingStamp = { messageId: req.messageId, variantId: req.variantId, commitId: req.commitId };
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
        await c.saveReply({ type: 'swipe', getMessage: req.text });
      } else if (req.op === 'continue') {
        await c.saveReply({ type: 'appendFinal', getMessage: req.text });
      } else {
        await c.saveReply({ type: 'normal', getMessage: req.text });
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
  private queue: Promise<unknown> = Promise.resolve();
  horaePresent = false;

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
      try {
        const out = await c.generateRaw({ prompt: msgs, responseLength: opts.maxTokens || 4096, trimNames: false });
        return String(out ?? '');
      } finally {
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
      c.setExtensionPrompt(EXT_PROMPT_KEY, req.engineContext, mod.extension_prompt_types.IN_CHAT, 1, false, mod.extension_prompt_roles.SYSTEM);
      const onAbort = () => { try { c.stopGeneration?.(); } catch { /* ignore */ } };
      req.signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const out = await c.generateQuietPrompt({ quietPrompt: req.instruction || '', removeReasoning: true, skipWIAN: false });
        if (req.signal?.aborted) throw new Error('aborted');
        // ST trims in-chat injections that do not fit the model's context size. Never accept a
        // draft whose final prompt lost the engine context.
        const captured = gen.draft?.token === token ? gen.draft.captured : null;
        if (captured && !captured.some((m: any) => typeof m.content === 'string' && m.content.includes('[CANON ENGINE CONTEXT'))) {
          throw new EngineError('capacity', 'SillyTavern dropped the Canon Engine context from the prompt because it did not fit the configured context size. Increase “Context Size (tokens)” in the API settings, or lower budgetChars in Canon Engine advanced settings.');
        }
        return String(out ?? '');
      } finally {
        req.signal?.removeEventListener('abort', onAbort);
        c.setExtensionPrompt(EXT_PROMPT_KEY, '', mod.extension_prompt_types.IN_CHAT, 1, false, mod.extension_prompt_roles.SYSTEM);
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
        if (!before.has(m) && m?.role === 'system' && typeof m.content === 'string' && !m.content.includes('[CANON ENGINE CONTEXT')) {
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
