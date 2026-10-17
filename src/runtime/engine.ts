// Canon Engine controller: binding, reconciliation, one foreground operation (stage -> validate ->
// commit), journal recovery, backup. Host-independent (see host.ts).
import type { Id, LedgerRecord, StoryTime } from '../domain/types';
import { loadPinnedPack, validatePackText, type LoadedPack, type LintIssue } from '../domain/pack';
import { valuesEqual } from '../domain/pack';
import { buildBootstrap, pendingHard, forcedCompletion } from '../domain/schedule';
import { WorldIndex } from '../domain/world-query';
import { formatTick, formatStoryTime, fromTick, parseDateLabel, toTick } from '../domain/time';
import { EngineError, hashObject, newId, quoteInText, sceneRoot, sha256, uniq, deepClone } from '../domain/util';
import type { WorldState } from '../domain/reducer';
import { factAt, reduce as reduceRecords } from '../domain/reducer';
import type { HostPort } from './host';
import { callStructured, taskDefaults } from './model';
import { CONTINUE_INSTRUCTION, GM_INTEGRATION_RULES, HARD_LAST_RESORT_INSTRUCTION, PROMPTS, REPAIR_INSTRUCTION, replyLengthNote } from './prompts';
import { baseKey, earliestChange, fingerprintPrefix, interpretationEntities, interpretationsFor, replay, stateHash, type ReplayResult } from './replay';
import { buildPacket, retrieve, type ClaimInput, type RefInput, type Retrieval } from './context';
import { runGate, type EvalOutput, type GateResult } from './gate';
import { adjudicateInterval } from './adjudicator';
import { assessImpact, diagnoseForced, impactCandidates, planScope, preconditionSignature, refreshPlan, runPlanning } from './planner';
import type { Banner, Binding, CampaignData, CoverageManifest, Fences, Interpretation, OpType, PlanRevision, RecordDraft, SourceEntry } from './types';
import { ENGINE_RELEASE, ENGINE_VERSION, STORAGE_VERSION } from './types';

export interface EngineSettings {
  maxOrdinaryPlanner: number;
  forcedPlannerAttempt: boolean;
  maxRepairs: number;
  taskTimeoutMs: number;
  draftTimeoutMs: number;
  budgetChars: number;
  horizonMinutes: number;
  readyWindowMinutes: number;
  opportunityWindowMinutes: number;
  horaeWaitMs: number;
  /** Take Horae's story time as the start of each new reply when Horae is installed and fresh. */
  followHoraeTime: boolean;
  debug: boolean;
  /** Sampling temperature for internal structured tasks (not the GM's story replies). */
  taskTemperature: number;
  /** ST connection profile id for internal analysis tasks; '' = the chat's own connection. */
  taskProfileId: string;
  /** Extra request-body parameters (YAML, as in ST's "Include Body Parameters") for analysis-profile requests. */
  taskExtraBody: string;
  /** Optional reply-length target for story drafts and repairs, e.g. "正文约800~1200字"; '' = none. */
  replyLength: string;
  /** Scene grouping: beats of the same ongoing scene continue one 本局事件 box instead of each making a new one. */
  sceneGrouping: boolean;
}

/** Output budget for analysis of a text: structured output grows with the analyzed text (~3 tokens per CJK character). */
const outputBudget = (text: string) => Math.min(16384, Math.max(4096, 2048 + String(text || '').length * 4));

const TASK_LABEL: Record<string, string> = { extract_user: 'reading the player message', discover: 'finding references', evaluate: 'checking consistency', plan: 'planning', adjudicate: 'offscreen events', impact: 'impact check' };

/** Length and provider stats of the published reply, shown after the turn timings. */
export interface ReplyStats { chars: number; finish?: string; outputTokens?: number; reasoningTokens?: number; maxTokens?: number }
/** Characters as a reader counts them: everything except whitespace. */
export const replyChars = (text: string) => String(text || '').replace(/\s+/g, '').length;

export const DEFAULT_SETTINGS: EngineSettings = {
  maxOrdinaryPlanner: 2,
  forcedPlannerAttempt: true,
  maxRepairs: 2,
  taskTimeoutMs: 300000,
  draftTimeoutMs: 300000,
  budgetChars: 60000,
  horizonMinutes: 3 * 1440,
  readyWindowMinutes: 1440,
  opportunityWindowMinutes: 720,
  horaeWaitMs: 60000,
  followHoraeTime: true,
  debug: false,
  taskTemperature: 0.2,
  taskProfileId: '',
  taskExtraBody: '',
  replyLength: '',
  sceneGrouping: false,
};

export type OpPhase = 'idle' | 'reconciling' | 'planning' | 'generating' | 'validating' | 'committing' | 'error' | 'conflict' | 'disabled';

export interface StatusInfo {
  phase: OpPhase;
  message: string;
  errorKind?: string;
  canRetry: boolean;
  canCancel: boolean;
}

export interface ExtractUserOut {
  statements: { kind: string; quote: string; summary: string; entities?: string[]; facts?: { entity_id: string; predicate: string; value: never }[]; event_id?: string | null; time?: { day: number; minute: number } | null; ambiguous?: boolean }[];
  references: { phrase: string; quote: string; kind: 'entity' | 'event'; mode?: string; candidates?: string[] }[];
  scene_entities?: string[];
}

interface DiscoverOut {
  references: { id: string; quote: string; phrase: string; ref_kind: string; mode?: string; assertion: string; temporal: string; candidate_ids?: string[] }[];
  claims: { id: string; quote: string; kind: string; entity_phrases?: string[]; assertion: string; expected?: { entity_id: string; predicate: string; value: unknown } | null }[];
}

export interface OperationTrace {
  operationId: string;
  op: OpType;
  attempts: { candidateHash: string; violations: string[]; coverageGaps: string[]; manifestId: string }[];
  prompts: { kind: string; text: string }[];
  outcome: 'committed' | 'failed' | 'cancelled' | 'stale';
  error?: string;
}

const MAX_MANIFESTS = 40;

/** Resent model outputs vs. small automatic fixes (a field set to empty and the rest kept, no extra call).
 *  Fixes are grouped by kind with a count, so a turn with many similar fixes stays readable. */
export function splitRejects(all: string[]): { rejects: string[]; fixes: string[] } {
  const fixes = new Map<string, number>();
  const rejects: string[] = [];
  for (const r of all) {
    const m = r.match(/^(\w+): kept after a fix: (.*)$/s);
    // a dropped item loses something the reply said: keep it with the real problems
    if (!m || /^dropped/.test(m[2])) { rejects.push(r); continue; }
    const k = `${m[1]}: ${m[2].replace(/\/\d+\//g, '/#/').replace(/: \{.*$/s, '').slice(0, 140)}`;
    fixes.set(k, (fixes.get(k) || 0) + 1);
  }
  return { rejects: rejects.slice(-6), fixes: [...fixes].map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).slice(0, 6) };
}

export class CanonEngine {
  host: HostPort;
  settings: EngineSettings;
  status: StatusInfo = { phase: 'idle', message: '', canRetry: false, canCancel: false };
  epoch = 0;
  private packCache: { hash: string; loaded: LoadedPack } | null = null;
  /** Discovery result per (operation, text): re-reviewing the same draft against staged history reuses it. */
  private discCache = new Map<string, DiscoverOut>();
  private gmRules(): string { return GM_INTEGRATION_RULES; }
  private lengthNote(): string {
    const len = String(this.settings.replyLength || '').trim();
    return len ? replyLengthNote(len) : '';
  }
  /** Entities whose lore the story model needs this turn: the scene, what the player and the last reply
   *  referred to, and the planner's actors. A bounded list, never the whole registry. */
  private loreNames(index: WorldIndex, retrieval: Retrieval, plan: { steps: { status: string; actors: Id[] }[] } | null): string[] {
    const ids: Id[] = [];
    for (const [id, tags] of retrieval.entities) if (tags.has('scene') || tags.has('mentioned')) ids.push(id);
    for (const s of (plan?.steps || []).filter((s) => s.status === 'ready' || s.status === 'proposed').slice(0, 6)) ids.push(...s.actors);
    for (const [id, tags] of retrieval.entities) if (tags.has('causal')) ids.push(id);
    return uniq(ids.map((id) => index.entityName(id)).filter((n) => n && n.length <= 40)).slice(0, 16);
  }
  private rememberDiscovery(key: string, d: DiscoverOut): DiscoverOut {
    if (this.discCache.size > 16) this.discCache.clear();
    this.discCache.set(key, d);
    return d;
  }
  private progressBase = '';
  /** True while the reconcile step is reading the player's current input (part of the turn, not catch-up). */
  private examiningInput = false;
  /** Per-step durations of the running operation, and the summary of the last finished one. */
  private stepTimes: { step: string; ms: number; retry?: boolean }[] = [];
  private rejects: string[] = [];
  lastTimings: { op: string; totalMs: number; steps: { step: string; ms: number; count: number; retries: number }[]; ok: boolean; reply?: ReplyStats | null; rejects?: string[]; fixes?: string[] } | null = null;
  private lastReply: ReplyStats | null = null;
  private timeStep<T>(step: string, p: Promise<T>): Promise<T> {
    const t0 = Date.now();
    return p.finally(() => this.stepTimes.push({ step, ms: Date.now() - t0 }));
  }
  /** Lets the user cancel a reconcile that runs outside an operation (chat load, edits). */
  private reconcileAbort: AbortController | null = null;
  current: { replay: ReplayResult; index: WorldIndex } | null = null;
  private opActive: { operationId: string; abort: AbortController; fences: Fences | null; op: OpType } | null = null;
  private mutex: Promise<void> = Promise.resolve();
  private listeners = new Set<() => void>();
  lastTrace: OperationTrace | null = null;
  traces: OperationTrace[] = [];
  lastFailedOp: { op: OpType; prior?: unknown } | null = null;
  notices: { level: 'info' | 'warn' | 'error'; text: string; at: number }[] = [];
  readonly instanceId = newId('inst');

  constructor(host: HostPort, settings: Partial<EngineSettings> = {}) {
    this.host = host;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { for (const f of this.listeners) try { f(); } catch { /* ignore UI errors */ } }
  private setStatus(phase: OpPhase, message = '', extra: Partial<StatusInfo> = {}) {
    const working = !['idle', 'error', 'conflict', 'disabled'].includes(phase);
    this.status = { phase, message, canRetry: false, canCancel: working && (!!this.opActive || !!this.reconcileAbort), ...extra };
    this.emit();
  }
  noticeSeq = 0;
  private coverageNoticeShown = false;
  notice(level: 'info' | 'warn' | 'error', text: string) {
    this.noticeSeq++;
    this.notices.push({ level, text, at: this.host.now() });
    if (this.notices.length > 50) this.notices.shift();
    this.emit();
  }

  campaign(): CampaignData | null {
    const c = this.host.getCampaign();
    return c && c.storageVersion ? c : null;
  }

  isActive(): boolean {
    const c = this.campaign();
    return !!c && c.enabled && !this.host.isGroup();
  }

  isBusy(): boolean { return !!this.opActive; }

  pack(): LoadedPack {
    const c = this.campaign();
    if (!c) throw new EngineError('invalid_pack', 'no pack bound');
    if (!this.packCache || this.packCache.hash !== c.packHash) {
      const loaded = loadPinnedPack(c.packSnapshot);
      if (loaded.hash !== c.packHash) throw new EngineError('invalid_pack', 'pinned pack snapshot hash mismatch');
      this.packCache = { hash: loaded.hash, loaded };
    }
    return this.packCache.loaded;
  }

  /** Serialize engine work (reconcile/ops/commits). */
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((r) => (release = r));
    await prev;
    try { return await fn(); } finally { release(); }
  }

  // ---------------------------------------------------------------------------------------------
  // Binding

  previewPack(text: string): { ok: boolean; errors: LintIssue[]; warnings: LintIssue[]; summary?: { originLabel: string; title: string; version: string; packId: string; hash: string; hardCount: number; events: number; entities: number; coverage: string; hard: { id: string; title: string; when: string; required: string }[] } } {
    const r = validatePackText(text);
    if (!r.ok || !r.loaded) return { ok: false, errors: r.errors, warnings: r.warnings };
    const L = r.loaded;
    return {
      ok: true, errors: [], warnings: r.warnings,
      summary: {
        originLabel: L.pack.calendar.origin_label, title: L.pack.title, version: L.pack.pack_version, packId: L.pack.pack_id, hash: L.hash, hardCount: L.hardEvents.length, events: L.pack.events.length,
        entities: L.pack.entities.length, coverage: `${formatTick(L.coverage.start)} – ${formatTick(L.coverage.end)}`,
        hard: L.hardEvents.map((id) => { const e = L.events.get(id)!; return { id, title: e.title, when: e.when.label, required: e.required_description || '' }; }),
      },
    };
  }

  previewEvents(text: string): { id: string; title: string; lo: number }[] {
    const r = validatePackText(text);
    if (!r.ok || !r.loaded) return [];
    return r.loaded.timeIndex.map((t) => ({ id: t.id, title: r.loaded!.events.get(t.id)!.title, lo: t.lo })).filter((e) => e.lo - 1 >= r.loaded!.coverage.start);
  }

  /** Create the chat's binding: pinned snapshot + bootstrap seed. Existing chats are interpreted afterwards by reconcile(). */
  async bind(packText: string, opts: { startTick: number; originDate?: { y: number; m: number; d: number } | null; startLabel?: string; mode: 'new' | 'existing' }): Promise<{ unresolved: string[]; pending: string[]; examined: number }> {
    if (!this.host.chatId()) throw new EngineError('incompatible_adapter', 'No chat is open. Open a character chat first, then enable Canon Engine for it.');
    if (this.host.isGroup()) throw new EngineError('incompatible_adapter', 'Group chats are not supported in v1 until a designated-GM adapter is validated. Canon Engine was not activated.');
    const r = validatePackText(packText);
    if (!r.ok || !r.loaded) throw new EngineError('invalid_pack', r.errors.map((e) => `${e.path}: ${e.message}`).join('\n'));
    const L = r.loaded;
    if (opts.startTick < L.coverage.start || opts.startTick > L.coverage.end) throw new EngineError('unresolved_start_time', `Start ${formatTick(opts.startTick)} is outside the pack coverage ${formatTick(L.coverage.start)}–${formatTick(L.coverage.end)}.`);
    const boot = buildBootstrap(L, opts.startTick);
    const entries = this.host.readTranscript();
    const prev = this.campaign();
    const data: CampaignData = {
      storageVersion: STORAGE_VERSION,
      engineVersion: ENGINE_VERSION,
      enabled: true,
      sessionId: prev?.sessionId || newId('ses'),
      branchId: newId('br'),
      parentBranch: null,
      chatId: this.host.chatId() || '',
      integrity: this.host.integrity(),
      packSnapshot: deepClone(L.pack),
      packHash: L.hash,
      packVersion: L.pack.pack_version,
      binding: {
        startTick: opts.startTick, originDate: opts.originDate || null, startLabel: opts.startLabel || formatTick(opts.startTick),
        confirmedAt: this.host.now(), examinedMessages: entries.length, unresolved: boot.unresolved.map((u) => `${u.eventId}: ${u.explanation.join('; ')}`), mode: opts.mode,
      },
      bootstrapRecords: boot.records,
      revision: 1,
      acceptedHead: null,
      transcriptFingerprint: '',
      manifest: [],
      interpretations: {},
      ledgerRecords: [],
      planRevisions: [],
      activePlanId: null,
      manifests: {},
      pendingTransaction: null,
      recoveryState: { status: 'ok' },
      uiPreferences: prev?.uiPreferences || { inspectorOpen: false, spoilers: false },
      configRevisions: [{ at: this.host.now(), summary: `bound ${L.pack.pack_id}@${L.pack.pack_version} at ${formatTick(opts.startTick)}` }],
    };
    this.host.setCampaign(data);
    this.packCache = { hash: L.hash, loaded: L };
    await this.host.save();
    this.emit();
    return { unresolved: data.binding.unresolved, pending: boot.pending, examined: entries.length };
  }

  async setEnabled(enabled: boolean) {
    const c = this.campaign();
    if (!c) return;
    c.enabled = enabled;
    c.configRevisions.push({ at: this.host.now(), summary: enabled ? 'enabled' : 'disabled for this chat' });
    await this.host.save();
    this.setStatus(enabled ? 'idle' : 'disabled');
  }

  // ---------------------------------------------------------------------------------------------
  // Identity & branch detection on chat load

  /** Detect rename vs branch vs import when the chat id/integrity differs from the stored binding. */
  async onChatLoaded(): Promise<void> {
    const c = this.campaign();
    this.current = null;
    if (!c) { this.setStatus('idle'); return; }
    if (this.host.isGroup()) { this.setStatus('disabled', 'group chats unsupported'); return; }
    const chatId = this.host.chatId() || '';
    const integ = this.host.integrity();
    if (c.chatId !== chatId) {
      if (c.integrity && integ && c.integrity !== integ) {
        // ST branch: metadata copied with a fresh integrity slug -> new branch identity, shared prefix.
        c.parentBranch = c.branchId;
        c.branchId = newId('br');
        c.configRevisions.push({ at: this.host.now(), summary: `branch created from ${c.chatId}` });
      } else {
        c.configRevisions.push({ at: this.host.now(), summary: `chat renamed/moved from ${c.chatId}` });
      }
      c.chatId = chatId;
      c.integrity = integ;
      // Plans and banners from another branch never carry over; manifests are revalidated by reconcile.
      c.planRevisions = c.planRevisions.map((p) => ({ ...p, status: 'stale' as const }));
    }
    await this.reconcile('chat_loaded');
  }

  /** A native source mutation (edit/delete/swipe) happened. Abort any in-flight op (fences also guard). */
  sourceChanged(reason: string) {
    this.epoch++;
    if (this.opActive && !this.publishing) {
      this.host.log('info', `source changed during operation (${reason}); cancelling ${this.opActive.operationId}`);
      this.opActive.abort.abort();
    }
  }
  private publishing = false;

  // ---------------------------------------------------------------------------------------------
  // Reconciliation

  async reconcile(reason: string, opts: { allowModel?: boolean; signal?: AbortSignal; excludeLastAssistant?: boolean } = {}): Promise<ReplayResult | null> {
    return this.exclusive(() => this.reconcileInner(reason, opts));
  }

  private transcriptFor(opts: { excludeLastAssistant?: boolean }): SourceEntry[] {
    const all = this.host.readTranscript();
    if (opts.excludeLastAssistant && all.length && all[all.length - 1].role === 'gm') return all.slice(0, -1);
    return all;
  }

  private async reconcileInner(reason: string, opts: { allowModel?: boolean; signal?: AbortSignal; excludeLastAssistant?: boolean }): Promise<ReplayResult | null> {
    if (opts.signal) return this.reconcileBody(reason, opts);
    const ac = new AbortController();
    this.reconcileAbort = ac;
    try { return await this.reconcileBody(reason, { ...opts, signal: ac.signal }); } finally { if (this.reconcileAbort === ac) this.reconcileAbort = null; }
  }

  private async reconcileBody(reason: string, opts: { allowModel?: boolean; signal?: AbortSignal; excludeLastAssistant?: boolean }): Promise<ReplayResult | null> {
    const c = this.campaign();
    if (!c || !c.enabled) { this.current = null; return null; }
    if (this.host.isGroup()) { this.setStatus('disabled', 'group chats unsupported'); return null; }
    const readOnly = !!this.host.isWriter && !this.host.isWriter();
    const allowModel = opts.allowModel !== false && !readOnly;
    taskDefaults.callTimeoutMs = this.settings.taskTimeoutMs;
    taskDefaults.observer = (task, attempt) => {
      const phase = this.status.phase;
      if (!['reconciling', 'planning', 'validating'].includes(phase)) return;
      const base = (phase === 'reconciling' && this.progressBase) || this.status.message.split(' · ')[0];
      this.setStatus(phase, `${base} · ${TASK_LABEL[task] || task}${attempt > 1 ? ` (retry ${attempt - 1})` : ''}`);
    };
    WorldIndex.displayOrigin = c.binding.originDate || null;
    const chatAtStart = this.host.chatId();
    const pack = this.pack();
    await this.recoverPending(c);
    let entries = this.transcriptFor(opts);
    const changedFrom = earliestChange(c.manifest, entries);
    const affected = this.affectedEntities(c, entries, changedFrom);
    const prevPhase = this.status.phase;
    if (!this.opActive) this.setStatus('reconciling', reason);
    let r: ReplayResult;
    let guard = 0;
    try {
      for (;;) {
        r = replay({ pack, branchId: c.branchId, bootstrap: c.bootstrapRecords, manual: c.manualRecords, entries, store: c.interpretations, affectedEntities: affected, changedFrom });
        if (!r.issue || r.issue.status === 'conflict') break;
        if (!allowModel) break;
        if (++guard > entries.length * 2 + 4) throw new EngineError('conflicting_transcript', 'reconciliation did not converge');
        const issue = r.issue;
        this.progressBase = `Examining message ${issue.index + 1}/${entries.length} (${issue.entry.role === 'user' ? 'player' : 'GM'})`;
        this.setStatus('reconciling', this.progressBase);
        this.examiningInput = !!this.opActive && issue.index === entries.length - 1 && issue.entry.role === 'user';
        const interp = issue.status === 'missing'
          ? await this.interpretMessage(issue.entry, issue.index, entries, r, opts.signal, null)
          : await this.interpretMessage(issue.entry, issue.index, entries, r, opts.signal, issue.reasons);
        const list = interpretationsFor(c.interpretations, interp.key).filter((x) => x.basisStateHash !== interp.basisStateHash);
        list.push(interp);
        c.interpretations[interp.key] = list.slice(-6);
        // Fences: abort if the source moved meanwhile.
        const now = this.transcriptFor(opts);
        if (earliestChange(entries.map((e) => ({ ...e })), now) !== -1) { entries = now; }
      }
      this.progressBase = '';
      this.examiningInput = false;
    } catch (e) {
      this.progressBase = '';
      this.examiningInput = false;
      const err = e as EngineError;
      c.recoveryState = { status: 'error', errorKind: err.kind || 'provider_failure', reason: err.message, at: this.host.now() };
      this.setStatus('error', err.message, { errorKind: err.kind, canRetry: true });
      try { await this.host.save(); } catch { /* reported below */ }
      throw e;
    }
    if (this.host.chatId() !== chatAtStart || this.campaign() !== c) {
      // The chat changed while models were working: never adopt or save state for another chat.
      throw new EngineError('stale_response', 'chat changed during reconciliation');
    }
    const issue = r!.issue;
    const result = r!;
    this.current = { replay: result, index: new WorldIndex(pack, result.state) };
    const fingerprintChanged = result.fingerprint !== c.transcriptFingerprint;
    c.ledgerRecords = result.ledger;
    c.manifest = entries.slice(0, issue ? issue.index : entries.length).map((e) => ({ messageId: e.messageId, variantId: e.variantId, contentHash: e.contentHash, role: e.role }));
    // keep the full manifest for change detection when not blocked
    if (!issue) c.manifest = entries.map((e) => ({ messageId: e.messageId, variantId: e.variantId, contentHash: e.contentHash, role: e.role }));
    c.transcriptFingerprint = issue ? result.prefixHashes[issue.index - 1] || 'root' : result.fingerprint;
    if (issue && issue.status !== 'conflict' && !allowModel) {
      // Pending interpretation work (e.g. after a provider failure): not an editorial conflict.
      if (c.recoveryState.status === 'ok') c.recoveryState = { status: 'error', errorKind: 'provider_failure', reason: `message #${issue.index} still needs interpretation; use Retry`, at: this.host.now() };
      this.setStatus('error', c.recoveryState.reason || '', { errorKind: c.recoveryState.errorKind, canRetry: true });
    } else if (issue && (issue.status === 'conflict' || issue.status === 'needs_reeval' || issue.status === 'missing')) {
      const conflictInterp = issue.candidates.find((x) => x.conflict);
      c.recoveryState = {
        status: 'conflict', messageId: issue.entry.messageId, messageIndex: issue.index,
        reason: conflictInterp?.conflict?.reason || issue.reasons.join('; '), quote: conflictInterp?.conflict?.quote, at: this.host.now(),
      };
      this.setStatus('conflict', `Message #${issue.index} conflicts with the edited history: ${c.recoveryState.reason}`, { canRetry: true });
    } else {
      // A rebuild resolves editorial conflicts; operational errors persist until Retry or a successful turn.
      if (c.recoveryState.status === 'conflict') c.recoveryState = { status: 'ok' };
      if (c.recoveryState.status === 'ok') { if (!this.opActive) this.setStatus('idle'); }
      else if (c.recoveryState.status === 'error' && !this.opActive) this.setStatus('error', c.recoveryState.reason || '', { errorKind: c.recoveryState.errorKind, canRetry: true });
    }
    if (fingerprintChanged || changedFrom >= 0) {
      c.revision++;
      // Plans derived from an older source prefix are stale (revalidated or replanned before use).
      for (const p of c.planRevisions) if (p.status === 'active' && changedFrom >= 0) p.status = 'stale';
    }
    if (readOnly) {
      this.setStatus('disabled', 'Another tab is the active writer for this campaign; this tab is read-only.');
      this.emit();
      return result;
    }
    try {
      const wasUnsaved = c.recoveryState.status === 'unsaved';
      await this.host.save();
      if (wasUnsaved) {
        // Durable now: only a successful save clears the persistence-failure state.
        c.recoveryState = { status: 'ok' };
        await this.host.save();
        this.setStatus('idle', 'Saved');
      }
    } catch (e) {
      c.recoveryState = { status: 'unsaved', reason: (e as Error).message, at: this.host.now() };
      this.setStatus('error', 'Saving the rebuilt state failed: ' + (e as Error).message, { errorKind: 'persistence_failure', canRetry: true });
    }
    this.emit();
    return result;
  }

  /** Entities touched by the old and new interpretations of changed/removed messages. */
  private affectedEntities(c: CampaignData, entries: SourceEntry[], changedFrom: number): Set<string> {
    const out = new Set<string>();
    if (changedFrom < 0) return out;
    const newKeys = new Set(entries.map((e) => baseKey(e)));
    for (const m of c.manifest.slice(changedFrom)) {
      const k = baseKey(m);
      if (newKeys.has(k)) continue;
      for (const i of interpretationsFor(c.interpretations, k)) for (const x of interpretationEntities(i)) out.add(x);
    }
    for (const e of entries.slice(changedFrom)) {
      const k = baseKey(e);
      if (c.manifest.some((m) => baseKey(m) === k)) continue;
      // the new content's entities are added once it is interpreted (scan names now)
      if (this.current) for (const m of this.current.index.scanEntities(e.text)) out.add(m.id);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Message interpretation (extraction for user messages; review/extraction for GM messages)

  private stateFacts(index: WorldIndex, ents: Id[], tick: number): string {
    const lines: string[] = [];
    for (const id of uniq(ents)) {
      if (!index.entityExists(id)) continue;
      const s = index.entityState(id, { tick });
      lines.push(`${s.name} [${id}]: ${s.facts.map((f) => `${f.predicate}=${f.display}`).join('; ') || 'no facts'}`);
    }
    return lines.join('\n');
  }

  private registry(index: WorldIndex) {
    const pack = index.pack;
    return {
      entities: [...pack.entities.values()].map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, kind: e.kind })).concat([...index.state.runtimeEntities.values()].map((e) => ({ id: e.id, name: e.name, aliases: e.aliases, kind: e.kind }))),
      predicates: [...pack.predicates.values()].map((p) => ({ id: p.id, type: p.value_type, allowed: p.allowed_values, description: p.description })),
    };
  }

  /** Candidate occurrences offered to discovery/extraction models (they map indirect references to ids). */
  private occurrenceCatalogue(index: WorldIndex, text: string, limit = 40) {
    const hits = new Set(index.semanticSearch(text, limit, 0.8).map((h) => h.occurrenceId));
    for (const m of index.scanEntities(text)) for (const o of index.occurrencesForEntity(m.id)) hits.add(o);
    // recent actual occurrences (indirect references usually point at recent history)
    const recent = [...index.state.occurrences.values()].sort((a, b) => b.seq - a.seq).slice(0, 15);
    for (const o of recent) hits.add(o.occurrenceId);
    return [...hits].slice(0, limit).map((id) => { const o = index.state.occurrences.get(id)!; return { id, title: o.title, time: formatStoryTime(o.time), refPhrases: o.refPhrases }; });
  }

  async extractUser(entry: SourceEntry, index: WorldIndex, signal?: AbortSignal, operationId = 'reconcile'): Promise<Interpretation> {
    const pack = index.pack;
    const tick = index.state.clock.lo;
    const opportunities = this.opportunities(index, tick).map((o) => ({ event_id: o.id, title: o.title, hook: o.hook }));
    const out = await this.withTimeout(callStructured<ExtractUserOut>(this.host.model, 'extract_user', PROMPTS.extract_user, {
      message: entry.text,
      persona: this.host.persona(),
      current_time: { label: formatTick(tick), day: Math.floor(tick / 1440), minute: tick % 1440 },
      registry: this.registry(index),
      occurrences: this.occurrenceCatalogue(index, entry.text),
      opportunities,
    }, { signal, operationId, log: (l) => this.debugLog('task', l), maxTokens: outputBudget(entry.text) }), this.settings.taskTimeoutMs * 4, signal);
    const records: RecordDraft[] = [];
    const intents: Interpretation['intents'] = [];
    const configRequests: string[] = [];
    const declines: string[] = [];
    const warnings: string[] = [];
    const st: StoryTime = { lo: tick, hi: tick, precision: 'minute' };
    const due = pendingHard(pack, index.state).filter((h) => h.hi <= tick);
    for (const s of out.statements) {
      if (!quoteInText(s.quote, entry.text)) { warnings.push(`statement ignored (quote not found): ${s.summary}`); continue; }
      const src = [{ messageId: entry.messageId, variantId: entry.variantId, contentHash: entry.contentHash, spans: [{ quote: s.quote }] }];
      if (s.kind === 'asserted_fact' && !s.ambiguous) {
        const deltas = [];
        for (const f of s.facts || []) {
          const p = pack.predicates.get(f.predicate);
          if (!p || !index.entityExists(f.entity_id)) continue;
          // configuration conflict: a literal assertion against an already-due HARD outcome
          const hardDueConflict = due.some((h) => h.event.outcomes.some((o) => o.entity_id === f.entity_id && o.predicate === f.predicate && !valuesEqual(o.value, f.value)));
          if (hardDueConflict) {
            configRequests.push(`Assertion "${s.quote}" conflicts with a due HARD requirement; it was not applied. Disable the engine or change the pack binding in settings to alter the contract.`);
            continue;
          }
          deltas.push({ op: 'set' as const, entity_id: f.entity_id, predicate: f.predicate, value: f.value });
        }
        if (deltas.length) records.push({ recordId: newId('rec'), kind: 'user_assertion', storyTime: st, sourceRefs: src, factsSetOrUnset: deltas, eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: `User asserted: ${s.summary}`, evidenceKind: 'direct' });
        else intents.push({ quote: s.quote, summary: s.summary });
      } else if (s.kind === 'participation_decline' && s.event_id && pack.events.has(s.event_id)) {
        declines.push(s.event_id);
        records.push({ recordId: newId('rec'), kind: 'participation_decline', storyTime: st, sourceRefs: src, factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: `Player declined to take part in ${pack.events.get(s.event_id)!.title}`, evidenceKind: 'direct', declinedEventId: s.event_id });
      } else if (s.kind === 'ooc_config_request') {
        configRequests.push(`Out-of-character request "${s.quote}" was not applied to the engine. Use Canon Engine settings to change the binding or disable it.`);
      } else {
        intents.push({ quote: s.quote, summary: `[${s.kind}] ${s.summary}` });
      }
    }
    const refs: RefInput[] = out.references.map((r, i) => ({ id: `u${i + 1}`, quote: r.quote, phrase: r.phrase, kind: r.kind, assertion: 'user_input', temporal: r.kind === 'event' ? 'past' : 'present', candidates: r.candidates }));
    const interp: Interpretation = {
      key: baseKey(entry), messageId: entry.messageId, variantId: entry.variantId, contentHash: entry.contentHash, role: 'user', commitId: newId('cmt'),
      createdAt: this.host.now(), origin: 'extraction', records, intents, stateClaims: [], playerActions: [], dependsOn: [], sceneEnd: null, flashback: false,
      sceneEntities: uniq([...(out.scene_entities || []).filter((x) => index.entityExists(x)), ...out.statements.flatMap((s) => (s.entities || []).filter((x) => index.entityExists(x)))]),
      offscreenBasis: [], warnings, configRequests, declines, basisStateHash: undefined,
    };
    (interp as Interpretation & { refs?: RefInput[] }).refs = refs;
    return interp;
  }

  private async interpretMessage(entry: SourceEntry, idx: number, entries: SourceEntry[], r: ReplayResult, signal: AbortSignal | undefined, reevalReasons: string[] | null): Promise<Interpretation> {
    const pack = this.pack();
    const index = new WorldIndex(pack, r.state);
    const basis = stateHash(r.state);
    if (entry.role === 'user') {
      const i = await this.extractUser(entry, index, signal);
      i.basisStateHash = basis;
      return i;
    }
    // GM message: retained/extracted review against the current prefix.
    let userEntry: SourceEntry | null = null;
    for (let k = idx - 1; k >= 0; k--) if (entries[k].role === 'user') { userEntry = entries[k]; break; }
    const prevGm = (() => { for (let k = idx - 1; k >= 0; k--) if (entries[k].role === 'gm') return entries[k]; return null; })();
    const review = await this.reviewCandidate({
      text: entry.text, index, userEntry, operationId: 'reconcile', signal, mode: 'retained', plan: null, forced: false,
      sceneSeeds: prevGm ? (interpretationsFor(this.campaign()!.interpretations, baseKey(prevGm))[0]?.sceneEntities || []) : [], reevalReasons,
      stagedNotes: [],
    });
    const gate = review.gate;
    // Deterministic agency check after a source edit: narrated player actions must still be
    // authorized by the (edited) user message; otherwise the retained reply is an editorial conflict.
    const sourceChanged = (reevalReasons || []).some((x) => /authorized|content changed|no longer in the selected transcript/.test(x));
    const unauthorized = sourceChanged ? gate.playerActions.find((a) => !a.authorizedBy) : undefined;
    if (unauthorized) gate.violations.unshift(`Narrated player action "${unauthorized.quote}" is not authorized by the edited user message, and no separate cause is described.`);
    const conflict = review.evaluation.decision === 'conflict' || gate.violations.length > 0;
    const interp = this.interpretationFromGate(entry.messageId, entry.variantId, entry.contentHash, gate, review, index, userEntry, r.state.clock.lo, 'retained_reeval', newId('cmt'));
    interp.basisStateHash = basis;
    if (!reevalReasons) interp.origin = 'extraction';
    if (conflict) {
      interp.conflict = { reason: (gate.violations[0] || 'The message cannot follow the edited prefix and describes no separate credible cause.').slice(0, 500), quote: undefined };
      interp.records = [];
    } else if (interp.sceneEnd && interp.sceneEnd.lo > r.state.clock.lo) {
      // GM time advance: adjudicate crossed events (deterministic/model) committed with this message.
      const adj = await adjudicateInterval({
        pack, state: this.overlay(r.state, interp.records), fromExclusive: r.state.clock.lo, toInclusive: interp.sceneEnd.lo,
        exclude: new Set(interp.records.map((x) => x.packEventId).filter(Boolean) as string[]), port: this.host.model, plan: this.activePlan(), forcedAllowed: true,
        signal, operationId: 'reconcile', facts: review.facts, log: (l) => this.debugLog('task', l),
      });
      for (const ar of adj.records) ar.triggerCommitId = interp.commitId;
      interp.records.push(...adj.records);
      interp.offscreenBasis = adj.basis;
      interp.records.push(this.timeAdvance(interp.sceneEnd, interp.commitId));
    }
    return interp;
  }

  /** Horae's story time at the end of the previous reply as a tick, when it is usable: a new reply (not a
   *  swipe/regenerate/continue), Horae fresh, a calendar date, later than the engine clock and at most 3 days ahead. */
  private horaeTick(clock: number): number | null {
    if (!this.settings.followHoraeTime) return null;
    const h = this.horaeTimeHint().horae_time;
    const origin = this.campaign()?.binding.originDate || null;
    if (!h || !origin) return null;
    const m = h.match(/(\d{3,6})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\D*?(\d{1,2})[:：](\d{2})/);
    if (!m) return null;
    const t = parseDateLabel(`${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`, origin);
    return t !== null && t > clock && t <= clock + 3 * 1440 ? t : null;
  }

  /** Horae's story time at the end of the previous reply (supporting evidence for the reviewer's scene_end). */
  private horaeTimeHint(): { horae_time?: string } {
    try {
      const st = this.host.horae?.status();
      // swipe/regenerate/continue: Horae's latest state already includes the reply being replaced
      if (this.opActive?.op !== 'normal') return {};
      if (!st?.available || st.busy || st.staleIndexes.length || !st.scene?.time) return {};
      return { horae_time: [st.scene.date, st.scene.time].filter(Boolean).join(' ') };
    } catch { return {}; }
  }

  private timeAdvance(end: StoryTime, commitId: string): RecordDraft {
    return { recordId: newId('rec'), kind: 'time_advance', storyTime: { lo: end.lo, hi: end.lo, precision: end.precision }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [], visibility: { mode: 'public', knower_ids: [] }, summary: `Story time advanced to ${formatStoryTime(end)}`, evidenceKind: 'direct', triggerCommitId: commitId };
  }

  private overlay(state: WorldState, records: RecordDraft[]): WorldState {
    const pack = this.pack();
    const recs: LedgerRecord[] = [...state.records];
    let seq = state.lastSeq;
    for (const r of records) recs.push({ ...r, sequence: ++seq, branchId: 'stage', commitId: 'stage' });
    // reduce from scratch keeps the committed state immutable
    return replayRecords(pack, recs);
  }

  private interpretationFromGate(messageId: string, variantId: string, contentHash: string, gate: GateResult, review: ReviewResult, index: WorldIndex, userEntry: SourceEntry | null, clock: number, origin: Interpretation['origin'], commitId: string): Interpretation {
    const src = { messageId, variantId, contentHash };
    const records = gate.records.map((r) => ({ ...r, sourceRefs: [{ ...src, spans: (r.occurrences || []).map(() => ({ quote: '' })).slice(0, 0) }] }));
    // attach evidence spans from evaluator occurrences/transitions
    for (const r of records) {
      const occ = r.occurrences?.[0];
      const evo = occ ? review.evaluation.occurrences.find((o) => o.title === occ.title) : undefined;
      if (evo?.quote) r.sourceRefs[0].spans = [{ quote: evo.quote.slice(0, 300) }];
    }
    return {
      key: `${messageId}:${variantId}:${contentHash}`, messageId, variantId, contentHash, role: 'gm', commitId, createdAt: this.host.now(), origin,
      records, intents: [], stateClaims: gate.stateClaims,
      playerActions: gate.playerActions.map((a) => ({ quote: a.quote, authorizedBy: a.authorizedBy && userEntry ? { messageId: userEntry.messageId, quote: a.authorizedBy.quote } : null })),
      dependsOn: userEntry ? [{ messageId: userEntry.messageId, contentHash: userEntry.contentHash }] : [],
      sceneEnd: gate.sceneEnd && gate.sceneEnd.lo >= clock ? gate.sceneEnd : gate.sceneEnd, flashback: gate.flashback,
      sceneEntities: uniq([...gate.sceneEntities, ...review.retrieval.entities.keys()].filter((x) => index.entityExists(x) || gate.runtimeEntities.some((r) => r.id === x))).slice(0, 40),
      offscreenBasis: [], warnings: gate.warnings.slice(0, 20), manifestId: review.manifest?.manifestId,
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Candidate review: whole-draft discovery -> fresh retrieval -> evaluator -> deterministic gate

  async reviewCandidate(a: {
    text: string; index: WorldIndex; userEntry: SourceEntry | null; operationId: string; signal?: AbortSignal; mode: 'draft' | 'retained';
    plan: PlanRevision | null; forced: boolean; sceneSeeds: Id[]; reevalReasons: string[] | null; stagedNotes: string[]; stagedHard?: Map<Id, import('../domain/types').Occurrence>;
    fences?: Fences; attempt?: number; expectedEnd?: number;
  }): Promise<ReviewResult> {
    const { index } = a;
    const pack = index.pack;
    const tick = index.state.clock.lo;
    const discKey = `${a.operationId}|${sha256(a.text + '\n' + (a.userEntry?.text || ''))}`;
    // Discovery helps the review find what to look up. If its output is unusable, fall back to the
    // deterministic name matching below instead of failing the turn; the review itself stays strict.
    const disc = this.discCache.get(discKey) || this.rememberDiscovery(discKey, await this.withTimeout(callStructured<DiscoverOut>(this.host.model, 'discover', PROMPTS.discover, {
      text: a.text,
      scene_framing: a.userEntry ? `Player input: ${a.userEntry.text}` : '',
      registry: this.registry(index),
      occurrences: this.occurrenceCatalogue(index, a.text + ' ' + (a.userEntry?.text || '')),
    }, { signal: a.signal, operationId: a.operationId, log: (l) => this.debugLog('task', l), maxTokens: outputBudget(a.text) }), this.settings.taskTimeoutMs * 4, a.signal).catch((e) => {
      if (!(e instanceof EngineError) || e.kind !== 'invalid_model_json') throw e;
      this.rejects.push(`discover: unusable after retries, used built-in name matching instead (${(e as Error).message.slice(0, 160)})`);
      return { references: [], claims: [] } as DiscoverOut;
    }));
    const refs: RefInput[] = disc.references.filter((r) => quoteInText(r.quote, a.text) || !r.quote).map((r) => ({ id: r.id, quote: r.quote, phrase: r.phrase, kind: r.ref_kind, assertion: r.assertion, temporal: r.temporal, candidates: r.candidate_ids }));
    const claims: ClaimInput[] = disc.claims.filter((c) => quoteInText(c.quote, a.text)).map((c) => ({ id: c.id, quote: c.quote, kind: c.kind, entityPhrases: c.entity_phrases || [], assertion: c.assertion, expected: c.expected || null }));
    // Deterministic discovery floor: every known entity/occurrence named in the text gets a lookup
    // and an explicit review item, even if the discovery model missed it.
    const seenEnt = new Set<string>();
    for (const r of refs) for (const id of index.resolveEntity(r.phrase).ids) seenEnt.add(id);
    for (const m of index.scanEntities(a.text)) {
      if (seenEnt.has(m.id)) continue;
      refs.push({ id: `d_${m.id}`, quote: m.phrase, phrase: m.phrase, kind: index.entityKind(m.id), assertion: 'narrator', temporal: 'present', candidates: [m.id] });
      if (index.entityState(m.id, { tick }).facts.length) claims.push({ id: `d_${m.id}`, quote: m.phrase, kind: 'state', entityPhrases: [m.phrase], assertion: 'narrator', expected: null, synthetic: true });
    }
    for (const o of index.state.occurrences.values()) {
      for (const p of o.refPhrases) {
        if (p.length >= 3 && quoteInText(p, a.text) && !refs.some((r) => r.candidates?.includes(o.occurrenceId))) {
          refs.push({ id: `d_${o.occurrenceId}`, quote: p, phrase: p, kind: 'event', assertion: 'narrator', temporal: 'past', candidates: [o.occurrenceId] });
          claims.push({ id: `d_${o.occurrenceId}`, quote: p, kind: 'recollection', entityPhrases: [], assertion: 'narrator', expected: null, synthetic: true });
          break;
        }
      }
    }
    // Fresh lookup over the complete active ledger (not the generator's context subset).
    const retrieval = retrieve(index, {
      refs, claims, sceneEntityIds: a.sceneSeeds, causalSeedEntityIds: [], freeText: [a.text], checkpointTick: Math.max(tick, a.expectedEnd ?? tick),
    });
    const packet = buildPacket({
      pack, index, retrieval, checkpointTick: Math.max(tick, a.expectedEnd ?? tick), origin: this.campaign()?.binding.originDate || null, sceneLabel: '',
      playerScope: a.userEntry ? [a.userEntry.text] : [], plan: a.plan, forced: a.forced, stagedNotes: a.stagedNotes, opportunities: [], budgetChars: this.settings.budgetChars * 2,
      horizon: this.settings.horizonMinutes,
    });
    const due = pendingHard(pack, index.state).filter((h) => h.lo <= tick + this.settings.horizonMinutes);
    const evaluation = await this.withTimeout(callStructured<EvalOutput>(this.host.model, 'evaluate', PROMPTS.evaluate, {
      mode: a.mode,
      candidate: a.text,
      player_action_scope: a.userEntry ? a.userEntry.text : '',
      current_time: { label: formatTick(tick), day: Math.floor(tick / 1440), minute: tick % 1440 },
      ...(a.mode !== 'retained' ? this.horaeTimeHint() : {}),
      retrieved_context: packet.text,
      claims: claims.map((c) => ({ id: c.id, quote: c.quote, kind: c.kind, assertion: c.assertion, expected: c.expected })),
      references: refs.map((r) => ({ id: r.id, quote: r.quote, kind: r.kind, assertion: r.assertion })),
      staged_offscreen: a.stagedNotes,
      due_hard: due.map((h) => ({ event_id: h.event.id, required_description: h.event.required_description, outcomes: h.event.outcomes, earliest: h.event.when.earliest, latest: h.event.when.latest })),
      plan_steps: (a.plan?.steps || []).filter((s) => s.status !== 'invalidated').map((s) => ({ step_id: s.step_id, action: s.action, actors: s.actors })),
      registry: this.registry(index),
      reeval_reasons: a.reevalReasons || [],
      ...(this.settings.sceneGrouping ? { scene_grouping: this.sceneBoxes(index) } : {}),
    }, { signal: a.signal, operationId: a.operationId, log: (l) => this.debugLog('task', l), maxTokens: outputBudget(a.text) }), this.settings.taskTimeoutMs * 4, a.signal);
    if (!this.settings.sceneGrouping) for (const o of evaluation.occurrences) o.continues = null;
    // Horae tracks story time every turn; its time at the end of the previous reply is where this reply
    // starts at the earliest. The engine's own estimate only fills in the time this reply itself takes.
    const floor = a.mode !== 'retained' ? this.horaeTick(tick) : null;
    if (floor !== null && !evaluation.flashback) {
      const lo = evaluation.scene_end ? toTick(evaluation.scene_end.lo) : tick;
      if (lo < floor) {
        const hi = Math.max(evaluation.scene_end ? toTick(evaluation.scene_end.hi) : floor, floor);
        evaluation.scene_end = { lo: fromTick(floor), hi: fromTick(hi), precision: 'approx' } as EvalOutput['scene_end'];
        this.debugLog('task', { kind: 'scene_end_from_horae', from: formatTick(lo), to: formatTick(floor) });
      }
    }
    const gate = runGate({
      pack, index, text: a.text, userText: a.userEntry?.text || '', userSource: a.userEntry ? { messageId: a.userEntry.messageId, contentHash: a.userEntry.contentHash } : null,
      evaluation, retrieval, claims, plan: a.plan, clockTick: tick, stagedHard: a.stagedHard || new Map(), mode: a.mode, forced: a.forced,
    });
    const c = this.campaign();
    const manifest: CoverageManifest | null = c ? {
      manifestId: newId('cov'), sessionId: c.sessionId, branchId: c.branchId, revision: c.revision, sourcePrefixHash: a.fences?.sourcePrefixHash || this.current?.replay.fingerprint || '',
      packHash: c.packHash, operationId: a.operationId, candidateHash: sha256(a.text), sceneCheckpoint: gate.sceneEnd || index.state.clock,
      overlayHash: hashObject(a.stagedNotes), entries: gate.coverage, suppliedContextHash: sha256(packet.text), complete: gate.coverageGaps.length === 0, gaps: gate.coverageGaps, attempt: a.attempt ?? 0,
    } : null;
    return { gate, evaluation, retrieval, manifest, facts: packet.facts, packetText: packet.text, claims, refs };
  }

  /** Plain-text report of a failed turn: error, every attempt's problems, resent calls, step timings. */
  private failureReport(trace: OperationTrace, tm: NonNullable<CanonEngine['lastTimings']>): string {
    const dur = (ms: number) => (ms >= 60000 ? `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s` : `${Math.round(ms / 1000)}s`);
    const lines = [`Canon Engine ${ENGINE_RELEASE} — failed turn (${trace.op}) at ${new Date(this.host.now()).toLocaleString()}, took ${dur(tm.totalMs)}`, '', `Error: ${trace.error || '(unknown)'}`];
    trace.attempts.forEach((a, i) => {
      lines.push('', `Attempt ${i + 1}${i === 0 ? ' (first draft)' : i > this.settings.maxRepairs ? ' (final HARD repair)' : ` (repair ${i})`}: ${a.violations.length ? `${a.violations.length} problem(s)` : 'no problems'}`);
      for (const v of a.violations) lines.push(`  - ${v}`);
    });
    if (tm.rejects?.length) { lines.push('', 'Model output problems (resent, or an unusable item dropped):'); for (const r of tm.rejects) lines.push(`  - ${r}`); }
    if (tm.fixes?.length) { lines.push('', 'Small automatic fixes (no resend, result kept):'); for (const r of tm.fixes) lines.push(`  - ${r}`); }
    lines.push('', 'Steps: ' + tm.steps.slice().sort((a, b) => b.ms - a.ms).map((s) => `${s.step} ${dur(s.ms)}${s.count > 1 ? `×${s.count}` : ''}${s.retries ? ` (resent ${s.retries})` : ''}`).join(' · '));
    return lines.join('\n').slice(0, 12000);
  }

  /** Recent actual events for the planner: untyped history (e.g. someone detained) that the fact list does not show. */
  private recentSituation(index: WorldIndex): string {
    const tick = index.state.clock.lo;
    const recent = [...index.state.occurrences.values()].filter((o) => o.time.lo >= tick - 2 * 1440).sort((a, b) => a.time.lo - b.time.lo || a.seq - b.seq).slice(-10);
    return recent.length ? 'Recent actual events:\n' + recent.map((o) => `- ${formatTick(o.time.lo)} ${o.title}: ${o.account.slice(0, 300)}`).join('\n') : 'No recent recorded events.';
  }

  /** Scene grouping input: the latest ordinary (non-canon) scene boxes a new beat may continue. */
  private sceneBoxes(index: WorldIndex): { occurrence_id: string; title: string; beats: string[]; places: string[]; time: string }[] {
    const tick = index.state.clock.lo;
    const occs = index.state.occurrences;
    const recent = [...occs.values()].filter((o) => !o.packEventId && o.time.hi >= tick - 360).sort((a, b) => b.time.lo - a.time.lo || b.seq - a.seq);
    const out: ReturnType<CanonEngine['sceneBoxes']> = [];
    const seen = new Set<string>();
    for (const o of recent) {
      const root = sceneRoot(occs, o.occurrenceId);
      if (seen.has(root)) continue;
      seen.add(root);
      const members = [...occs.values()].filter((m) => !m.packEventId && sceneRoot(occs, m.occurrenceId) === root).sort((a, b) => a.time.lo - b.time.lo);
      out.push({
        occurrence_id: o.occurrenceId, title: occs.get(root)!.title, beats: members.map((m) => m.title).slice(-6),
        places: uniq(members.flatMap((m) => m.locations)).map((l) => index.entityName(l)), time: formatTick(o.time.lo),
      });
      if (out.length >= 2) break;
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // Foreground operation

  activePlan(): PlanRevision | null {
    const c = this.campaign();
    if (!c || !c.activePlanId) return null;
    return c.planRevisions.find((p) => p.planId === c.activePlanId) || null;
  }

  opportunities(index: WorldIndex, tick: number): { id: string; title: string; hook: string; when: string }[] {
    const pack = index.pack;
    const out: { id: string; title: string; hook: string; when: string }[] = [];
    for (const t of pack.timeIndex) {
      if (t.lo > tick + this.settings.opportunityWindowMinutes) break;
      if (t.hi < tick) continue;
      const ev = pack.events.get(t.id)!;
      if (ev.participation.offer !== 'when_relevant' || index.state.dispositions.has(ev.id) || index.state.declines.has(ev.id)) continue;
      out.push({ id: ev.id, title: ev.title, hook: ev.participation.hook, when: formatTick(t.lo) });
    }
    return out;
  }

  cancel() {
    if (this.opActive) {
      this.opActive.abort.abort();
      this.notice('info', 'Cancelled.');
    } else if (this.reconcileAbort) {
      this.reconcileAbort.abort();
      this.notice('info', 'Cancelled.');
    }
  }

  private captureFences(c: CampaignData, entries: SourceEntry[], operationId: string): Fences {
    const prefix = this.current?.replay.fingerprint || 'root';
    return { sessionId: c.sessionId, branchId: c.branchId, revision: c.revision, sourcePrefixHash: prefix, operationId, packHash: c.packHash, chatId: this.host.chatId() || '', epoch: this.epoch };
  }

  /** Compare every fence with the current source. Stale responses are discarded. */
  checkFences(f: Fences, excludeLastAssistant: boolean): void {
    const c = this.campaign();
    if (!c) throw new EngineError('stale_response', 'campaign no longer bound');
    if ((this.host.chatId() || '') !== f.chatId) throw new EngineError('stale_response', 'chat changed during the operation');
    if (c.sessionId !== f.sessionId || c.branchId !== f.branchId || c.packHash !== f.packHash) throw new EngineError('stale_response', 'binding changed during the operation');
    if (c.revision !== f.revision) throw new EngineError('stale_response', 'world revision changed during the operation');
    if (this.epoch !== f.epoch) throw new EngineError('stale_response', 'the transcript was edited during the operation');
    const entries = this.transcriptFor({ excludeLastAssistant });
    const fp = replayFingerprint(entries);
    if (fp !== f.sourcePrefixHash) throw new EngineError('stale_response', 'the selected transcript changed during the operation');
  }

  private async withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const t = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new EngineError('provider_failure', `model request timed out after ${Math.round(ms / 1000)}s`)), ms); });
    const ab = new Promise<never>((_, rej) => { signal?.addEventListener('abort', () => rej(new EngineError('cancelled', 'operation cancelled')), { once: true }); });
    try { return await Promise.race([p, t, ab]); } finally { clearTimeout(timer); }
  }

  private debugLog(kind: string, data: unknown) {
    if (this.settings.debug) this.host.log('debug', `[${kind}]`, data);
  }

  /**
   * One generation transaction. `prior` is the native reply captured before a regenerate removed it.
   * Returns true when a reply was committed.
   */
  async runOperation(op: OpType, prior?: unknown): Promise<boolean> {
    const c0 = this.campaign();
    if (!c0 || !c0.enabled) return false;
    if (this.host.isGroup()) { this.notice('error', 'Canon Engine does not support group chats in v1; generation was blocked to avoid an unprotected turn.'); return false; }
    if (this.opActive) { this.notice('warn', 'Canon Engine is already working on a reply. Wait or cancel it first.'); return false; }
    if (this.host.isWriter && !this.host.isWriter()) { this.notice('error', 'Another tab is the active writer for this campaign; generation is blocked here.'); return false; }
    const operationId = newId('op');
    const abort = new AbortController();
    this.opActive = { operationId, abort, fences: null, op };
    this.stepTimes = [];
    this.rejects = [];
    this.lastReply = null;
    const opStart = Date.now();
    taskDefaults.onDone = (task, ms, attempt) => { if (this.opActive?.operationId === operationId) this.stepTimes.push({ step: this.status.phase === 'reconciling' && !this.examiningInput ? 'reconcile' : task, ms, retry: attempt > 1 }); };
    // Why a structured reply was rejected and sent again (shown in the timing tooltip).
    taskDefaults.onReject = (task, error) => { if (this.opActive?.operationId === operationId) this.rejects.push(`${task}: ${error.slice(0, 200)}`); };
    const trace: OperationTrace = { operationId, op, attempts: [], prompts: [], outcome: 'failed' };
    this.lastTrace = trace;
    this.traces.push(trace);
    if (this.traces.length > 10) this.traces.shift();
    const excludeLast = op === 'swipe';
    let committed = false;
    try {
      this.setStatus('reconciling', 'Reconciling the selected transcript…');
      await this.host.settle?.();
      await this.reconcile('operation', { signal: abort.signal, excludeLastAssistant: excludeLast });
      const c = this.campaign()!;
      if (c.recoveryState.status === 'conflict') throw new EngineError('conflicting_transcript', `Retained message #${c.recoveryState.messageIndex} is incompatible with the edited history. Edit that message or regenerate from it in a new branch.`);
      if (!this.current) throw new EngineError('incompatible_adapter', 'engine state unavailable');
      return await this.exclusive(async () => {
        const entries = this.transcriptFor({ excludeLastAssistant: excludeLast });
        const fences = this.captureFences(c, entries, operationId);
        this.opActive!.fences = fences;
        const pack = this.pack();
        const committedState = this.current!.replay.state;
        let index = this.current!.index;
        const clock = committedState.clock.lo;

        if (clock > pack.coverage.end && !this.coverageNoticeShown) {
          this.coverageNoticeShown = true;
          this.notice('warn', `Pack coverage ended at ${formatTick(pack.coverage.end, c.binding.originDate)}. No further canon is scheduled; bind an updated pack to continue with authored history.`);
        }
        // Horae freshness barrier / stale-memory handling
        const horaeNote = await this.timeStep('horae', this.horaeBarrier(abort.signal));

        // The operation's user source (last user message in the prefix).
        let userEntry: SourceEntry | null = null;
        for (let k = entries.length - 1; k >= 0; k--) if (entries[k].role === 'user') { userEntry = entries[k]; break; }
        const lastIsUser = entries.length > 0 && entries[entries.length - 1].role === 'user';
        const continuing = op === 'continue' && entries.length > 0 && entries[entries.length - 1].role === 'gm';
        const continuedEntry = continuing ? entries[entries.length - 1] : null;
        const userInterp = userEntry ? interpretationsFor(c.interpretations, baseKey(userEntry)).find((x) => x.role === 'user') || null : null;
        if (userInterp?.configRequests?.length) for (const n of userInterp.configRequests) this.notice('warn', n);

        // Prefix for a continuation excludes the partial reply being revised from the "world" view.
        if (continuing) {
          const prefixEntries = entries.slice(0, -1);
          const rr = replay({ pack, branchId: c.branchId, bootstrap: c.bootstrapRecords, manual: c.manualRecords, entries: prefixEntries, store: c.interpretations });
          if (rr.issue) throw new EngineError('conflicting_transcript', 'cannot rebuild the prefix of the continued reply');
          index = new WorldIndex(pack, rr.state);
        }

        // Planning (rolling, bounded)
        this.setStatus('planning', 'Planning…');
        let planInfo = await this.ensurePlan(index, abort.signal, operationId);
        let plan = planInfo.plan;
        this.checkFences(fences, excludeLast);

        // Pre-generation retrieval: user references + scene + causal seeds + semantic expansion
        const prevGm = (() => { for (let k = entries.length - (continuing ? 2 : 1); k >= 0; k--) if (entries[k].role === 'gm') return entries[k]; return null; })();
        const prevGmInterp = prevGm ? interpretationsFor(c.interpretations, baseKey(prevGm))[0] : null;
        const horaeScene = this.host.horae?.status().scene;
        const horaeSceneIds = horaeScene ? uniq([horaeScene.location || '', ...(horaeScene.characters || [])].flatMap((n) => (n ? index.resolveEntity(n).ids : []))) : [];
        const userRefs = ((userInterp as Interpretation & { refs?: RefInput[] })?.refs) || [];
        const retrieval = retrieve(index, {
          refs: lastIsUser || op !== 'normal' ? userRefs : [],
          claims: [],
          sceneEntityIds: uniq([...(prevGmInterp?.sceneEntities || []), ...horaeSceneIds]),
          causalSeedEntityIds: userInterp?.sceneEntities || [],
          freeText: [userEntry?.text || '', prevGm ? prevGm.text.slice(-600) : ''],
          checkpointTick: clock,
        });
        const opps = this.opportunities(index, clock);
        const sceneLabel = [horaeScene?.location ? `Location (Horae, supporting): ${horaeScene.location}.` : '', horaeScene?.characters?.length ? `Present: ${horaeScene.characters.join(', ')}.` : '', horaeNote].filter(Boolean).join(' ');
        const packetArgs = {
          pack, index, retrieval, checkpointTick: clock, origin: c.binding.originDate, sceneLabel,
          playerScope: userEntry && (lastIsUser || op === 'regenerate' || op === 'swipe') ? [userEntry.text, ...(userInterp?.intents || []).map((i) => `intent: ${i.summary}`)] : [],
          plan, forced: planInfo.forced, stagedNotes: [] as string[], opportunities: opps.map((o) => `${o.title} (${o.when}): ${o.hook}`), budgetChars: this.settings.budgetChars, horizon: this.settings.horizonMinutes,
        };
        let packet = buildPacket(packetArgs);
        const engineContext = this.gmRules() + '\n\n' + packet.text;
        const loreNames = this.loreNames(index, retrieval, plan);

        // Draft (private)
        this.setStatus('generating', 'Generating (private draft)…');
        trace.prompts.push({ kind: 'engine_context', text: engineContext });
        let draft = await this.timeStep('draft', this.withTimeout(this.host.model.generateDraft({ engineContext, loreNames, lengthNote: continuing ? '' : this.lengthNote(), instruction: continuing ? CONTINUE_INSTRUCTION : '', excludeLastAssistant: excludeLast, signal: abort.signal }), this.settings.draftTimeoutMs, abort.signal));
        this.checkFences(fences, excludeLast);
        let candidate = continuing ? joinContinuation(continuedEntry!.text, draft) : draft;
        if (!candidate.trim()) throw new EngineError('provider_failure', 'the model returned an empty reply');

        // Validate / repair loop (finite)
        let accepted: { review: ReviewResult; adj: Awaited<ReturnType<typeof adjudicateInterval>> | null } | null = null;
        let lastViolations: string[] = [];
        let lastResort = false; // one extra, harsher repair when HARD problems survive the normal repairs
        for (let attempt = 0; attempt <= this.settings.maxRepairs + (lastResort ? 1 : 0); attempt++) {
          this.setStatus('validating', attempt > this.settings.maxRepairs ? 'Re-checking final HARD repair…' : attempt ? `Re-checking repaired draft (${attempt}/${this.settings.maxRepairs})…` : 'Validating…');
          let review = await this.reviewCandidate({ text: candidate, index, userEntry: lastIsUser || op !== 'continue' ? userEntry : null, operationId, signal: abort.signal, mode: 'draft', plan, forced: planInfo.forced, sceneSeeds: retrieval ? [...retrieval.entities.keys()] : [], reevalReasons: null, stagedNotes: [], fences, attempt });
          this.checkFences(fences, excludeLast);
          // Interval adjudication for the proposed advance (repeat if the draft goes farther than expected)
          let adj: Awaited<ReturnType<typeof adjudicateInterval>> | null = null;
          const end = review.gate.sceneEnd;
          if (end && !review.gate.flashback && end.lo > clock) {
            adj = await adjudicateInterval({
              pack, state: this.overlay(index.state, review.gate.records), fromExclusive: clock, toInclusive: end.lo,
              exclude: new Set(review.gate.records.map((r) => r.packEventId).filter(Boolean) as string[]),
              port: this.host.model, plan, forcedAllowed: planInfo.forced || this.settings.forcedPlannerAttempt, signal: abort.signal, operationId, facts: review.facts,
              log: (l) => this.debugLog('task', l),
            });
            this.checkFences(fences, excludeLast);
            if (adj.records.length) {
              // The evaluator must see staged offscreen history: review again with it (not a repair).
              const stagedIndex = new WorldIndex(pack, this.overlay(index.state, adj.records.filter((r) => r.storyTime.lo <= end.lo)));
              review = await this.reviewCandidate({ text: candidate, index: stagedIndex, userEntry: lastIsUser || op !== 'continue' ? userEntry : null, operationId, signal: abort.signal, mode: 'draft', plan, forced: planInfo.forced, sceneSeeds: [...retrieval.entities.keys()], reevalReasons: null, stagedNotes: adj.notes, stagedHard: adj.stagedHard, fences, attempt });
              // Gate HARD crossing with staged offscreen occurrences against the committed clock
              review.gate = runGate({
                pack, index: stagedIndex, text: candidate, userText: userEntry?.text || '', userSource: userEntry ? { messageId: userEntry.messageId, contentHash: userEntry.contentHash } : null,
                evaluation: review.evaluation, retrieval: review.retrieval, claims: review.claims, plan, clockTick: clock, stagedHard: adj.stagedHard, mode: 'draft', forced: planInfo.forced,
              });
              this.checkFences(fences, excludeLast);
            }
          }
          const violations = [...review.gate.violations, ...review.gate.coverageGaps.map((g) => `Coverage gap: ${g}`)];
          trace.attempts.push({ candidateHash: sha256(candidate), violations, coverageGaps: review.gate.coverageGaps, manifestId: review.manifest?.manifestId || '' });
          if (!violations.length && review.manifest?.complete) { accepted = { review, adj }; break; }
          lastViolations = violations;
          const hardStuck = !lastResort && attempt === this.settings.maxRepairs && violations.some((v) => /\bHARD\b/.test(v));
          if (attempt >= this.settings.maxRepairs && !hardStuck) break;
          if (hardStuck) lastResort = true;
          this.setStatus('generating', hardStuck ? 'Final HARD repair…' : `Repairing draft (${attempt + 1}/${this.settings.maxRepairs})…`);
          const facts = review.facts || packet.facts;
          packetArgs.retrieval = mergeRetrieval(packetArgs.retrieval, review.retrieval);
          packetArgs.stagedNotes = adj?.notes || [];
          packet = buildPacket(packetArgs);
          const repairCtx = this.gmRules() + '\n\n' + packet.text;
          trace.prompts.push({ kind: hardStuck ? 'repair_hard_last_resort' : `repair_${attempt + 1}`, text: repairCtx });
          const replyEnd = Math.max(review.gate.sceneEnd?.hi ?? clock, clock);
          const hardReqs = hardStuck ? pendingHard(pack, index.state)
            .filter((h) => h.lo <= replyEnd || violations.some((v) => v.includes(h.event.title)))
            .map((h) => `${h.event.title} (${formatTick(h.lo)}${h.hi !== h.lo ? `–${formatTick(h.hi)}` : ''}): ${h.event.required_description}`) : [];
          let route: string[] = [];
          if (hardStuck) {
            // Plan a concrete in-world route for the broken HARD event(s) from the actual situation, then repair along it.
            const anchors = pendingHard(pack, index.state).filter((h) => h.lo <= replyEnd || violations.some((v) => v.includes(h.event.title))).map((h) => h.event.id);
            const c = this.campaign()!;
            (c as CampaignData & { _affectedAnchors?: Id[] })._affectedAnchors = uniq([...((c as CampaignData & { _affectedAnchors?: Id[] })._affectedAnchors || []), ...anchors]);
            this.setStatus('planning', 'Planning a route for the HARD event…');
            const situation = `${this.recentSituation(index)}\nCurrent turn — player input: ${userEntry?.text || '(none)'}\nWhy the drafts were rejected: ${violations.slice(0, 4).join(' | ')}`;
            planInfo = await this.ensurePlan(index, abort.signal, operationId, { force: true, situation }).catch((e) => { if (e instanceof EngineError && e.kind === 'cancelled') throw e; return planInfo; });
            plan = planInfo.plan;
            packetArgs.plan = plan; packetArgs.forced = planInfo.forced;
            route = (plan?.steps || []).filter((s) => s.status !== 'invalidated' && (!s.serves_anchor || anchors.includes(s.serves_anchor)))
              .map((s) => `${formatTick(s.earliest)}–${formatTick(s.latest)} ${s.actors.map((a) => index.entityName(a)).join(', ')}: ${s.action} (${s.means})`).slice(0, 6);
            packet = buildPacket(packetArgs);
          }
          const repairInstruction = hardStuck ? HARD_LAST_RESORT_INSTRUCTION(violations.slice(0, 8), hardReqs, facts.slice(0, 6000), route) : REPAIR_INSTRUCTION(violations.slice(0, 8), facts.slice(0, 6000));
          draft = await this.timeStep('repair', this.withTimeout(this.host.model.generateDraft({ engineContext: repairCtx, loreNames: uniq([...loreNames, ...this.loreNames(index, retrieval, plan)]).slice(0, 16), lengthNote: continuing ? '' : this.lengthNote(), instruction: (continuing ? CONTINUE_INSTRUCTION + '\n' : '') + repairInstruction + (continuing ? `\nExisting part of the reply (keep it unchanged; output only the continuation):\n${continuedEntry!.text}` : ''), excludeLastAssistant: excludeLast, signal: abort.signal }), this.settings.draftTimeoutMs, abort.signal));
          this.checkFences(fences, excludeLast);
          candidate = continuing ? joinContinuation(continuedEntry!.text, draft) : draft;
        }
        if (!accepted) {
          throw new EngineError('narrative_validation_failure', `The reply could not be validated within ${this.settings.maxRepairs} repairs${lastResort ? ' plus a final HARD repair' : ''}. Last problems: ${lastViolations.slice(0, 3).join(' | ')}`);
        }

        // Commit
        this.setStatus('committing', 'Saving…');
        this.checkFences(fences, excludeLast);
        const commitId = newId('cmt');
        const lastEntry = this.host.readTranscript().slice(-1)[0];
        const messageId = (op === 'swipe' || op === 'continue') && lastEntry && lastEntry.role === 'gm' ? lastEntry.messageId : newId('msg');
        const variantId = newId('var');
        const contentHash = this.host.hashAssistant(candidate);
        const interp = this.interpretationFromGate(messageId, variantId, contentHash, accepted.review.gate, accepted.review, index, userEntry, clock, 'engine_commit', commitId);
        if (accepted.adj) {
          for (const r of accepted.adj.records) r.triggerCommitId = commitId;
          interp.records.push(...accepted.adj.records);
          interp.offscreenBasis = accepted.adj.basis;
        }
        if (interp.sceneEnd && !interp.flashback && interp.sceneEnd.lo > clock) interp.records.push(this.timeAdvance(interp.sceneEnd, commitId));
        interp.basisStateHash = stateHash(index.state);
        if (continuing && continuedEntry) {
          // the revised message replaces the old logical reply; its old effects are not counted twice
          interp.dependsOn = interp.dependsOn.filter((d) => d.messageId !== continuedEntry.messageId);
        }
        // Only the accepted candidate's coverage manifest is retained (rejected drafts stay out of storage).
        if (accepted.review.manifest) { c.manifests[accepted.review.manifest.manifestId] = accepted.review.manifest; trimManifests(c); }
        const info = this.host.model.lastDraftInfo?.() || null;
        this.lastReply = { chars: replyChars(continuing ? draft : candidate), ...(info || {}) };
        await this.commit(c, { op, interp, fences, candidate, commitId, messageId, variantId, contentHash, prior, excludeLast });
        committed = true;
        if (info?.finish === 'length') this.notice('warn', `The reply was cut off at the output limit${info.maxTokens || info.reasoningTokens ? ` (${[info.maxTokens ? `limit ${info.maxTokens} tokens` : '', info.reasoningTokens ? `thinking used ${info.reasoningTokens}` : ''].filter(Boolean).join('; ')})` : ''}. Raise the maximum response length (最大回复长度) in your API preset.`);
        trace.outcome = 'committed';
        { const cc = this.campaign(); if (cc && cc.recoveryState.status === 'error') { cc.recoveryState = { status: 'ok' }; } }
        this.lastFailedOp = null;
        // Post-commit impact (best effort; never blocks the accepted reply)
        try { await this.postCommitImpact(interp, abort.signal, operationId); } catch (e) { this.host.log('warn', 'impact assessment failed: ' + (e as Error).message); }
        this.setStatus('idle', 'Ready');
        return true;
      });
    } catch (e) {
      const err = e as EngineError;
      const kind = err.kind || 'provider_failure';
      trace.outcome = kind === 'cancelled' ? 'cancelled' : kind === 'stale_response' ? 'stale' : 'failed';
      trace.error = err.message;
      if (!committed) {
        if (prior && (op === 'regenerate' || op === 'swipe')) {
          try { await this.host.restorePrior(op, prior); } catch (re) { this.host.log('error', 'failed to restore prior reply: ' + (re as Error).message); }
        }
        if (kind === 'cancelled' || kind === 'stale_response') {
          this.setStatus('idle', kind === 'stale_response' ? 'Discarded a stale result after the transcript changed.' : 'Cancelled.');
          if (kind === 'stale_response') this.notice('info', 'The transcript changed while the reply was being prepared; the stale result was discarded.');
        } else {
          this.lastFailedOp = { op, prior: undefined };
          const c = this.campaign();
          if (c && kind !== 'conflicting_transcript' && c.recoveryState.status !== 'unsaved') c.recoveryState = { status: 'error', errorKind: kind, reason: err.message, at: this.host.now() };
          this.setStatus(kind === 'conflicting_transcript' ? 'conflict' : 'error', err.message, { errorKind: kind, canRetry: kind !== 'conflicting_transcript' });
          this.notice('error', `${labelForError(kind)}: ${err.message}`);
        }
      }
      return false;
    } finally {
      const agg = new Map<string, { ms: number; count: number; retries: number }>();
      for (const s of this.stepTimes) { const a = agg.get(s.step) || { ms: 0, count: 0, retries: 0 }; a.ms += s.ms; a.count++; if (s.retry) a.retries++; agg.set(s.step, a); }
      this.lastTimings = { op, totalMs: Date.now() - opStart, ok: committed, steps: [...agg].map(([step, a]) => ({ step, ...a })), reply: committed ? this.lastReply : null, ...splitRejects(this.rejects) };
      if (!committed && trace.outcome === 'failed') {
        // Keep the whole story of a failed turn where the user can read it later (saved with the chat).
        const c = this.campaign();
        if (c && c.recoveryState.status === 'error') { c.recoveryState.details = this.failureReport(trace, this.lastTimings); void this.host.save().catch(() => {}); }
      }
      if (this.settings.debug) this.debugLog('timing', this.lastTimings);
      this.opActive = null;
      this.emit();
      // Rebuild once more in case the source changed while we were busy (deterministic, no model).
      if (!committed) void this.reconcile('post_operation', { allowModel: false }).catch(() => undefined);
    }
  }

  private async commit(c: CampaignData, a: { op: OpType; interp: Interpretation; fences: Fences; candidate: string; commitId: string; messageId: string; variantId: string; contentHash: string; prior?: unknown; excludeLast: boolean }) {
    c.pendingTransaction = {
      commitId: a.commitId, operationId: a.fences.operationId, predecessorRevision: c.revision, sourceFingerprint: a.fences.sourcePrefixHash, targetHash: a.contentHash,
      opType: a.op, interpretation: a.interp, priorReply: a.prior, phase: 'prepared',
    };
    this.publishing = true;
    try {
      // Native publication (saveReply + lifecycle events) and a durable save of chat + journal.
      await this.host.publish({ op: a.op, text: a.candidate, commitId: a.commitId, messageId: a.messageId, variantId: a.variantId, contentHash: a.contentHash }, a.interp);
    } catch (e) {
      c.recoveryState = { status: 'unsaved', reason: (e as Error).message, at: this.host.now() };
      throw new EngineError('persistence_failure', 'Publishing/saving the accepted reply failed: ' + (e as Error).message);
    } finally {
      this.publishing = false;
    }
    // Bind the interpretation to the exact landed content (ST may normalize whitespace).
    const landed = this.host.readTranscript().find((e) => e.role === 'gm' && e.variantId === a.variantId);
    if (!landed) throw new EngineError('persistence_failure', 'the accepted reply did not land in the transcript');
    if (landed.contentHash !== a.interp.contentHash || landed.messageId !== a.interp.messageId) {
      a.interp.contentHash = landed.contentHash;
      a.interp.messageId = landed.messageId;
      a.interp.key = baseKey(landed);
    }
    // Apply the engine delta.
    const list = interpretationsFor(c.interpretations, a.interp.key);
    list.push(a.interp);
    c.interpretations[a.interp.key] = list;
    c.pendingTransaction = null;
    c.acceptedHead = a.commitId;
    try {
      await this.host.save();
    } catch (e) {
      // The journal is still durable from the publish save; recovery finalizes it on reload.
      c.pendingTransaction = { commitId: a.commitId, operationId: a.fences.operationId, predecessorRevision: c.revision, sourceFingerprint: a.fences.sourcePrefixHash, targetHash: a.contentHash, opType: a.op, interpretation: a.interp, phase: 'published' };
      c.recoveryState = { status: 'unsaved', reason: (e as Error).message, at: this.host.now() };
      throw new EngineError('persistence_failure', 'The reply was published but saving the engine state failed. Use Retry to save again; the journal will be recovered on reload.');
    }
    // Deterministic rebuild with the new interpretation (no model calls).
    const c2 = this.campaign()!;
    const entries = this.host.readTranscript();
    const pack = this.pack();
    const r = replay({ pack, branchId: c2.branchId, bootstrap: c2.bootstrapRecords, manual: c2.manualRecords, entries, store: c2.interpretations });
    if (r.issue) this.host.log('warn', 'post-commit replay issue: ' + r.issue.reasons.join('; '));
    this.current = { replay: r, index: new WorldIndex(pack, r.state) };
    c2.ledgerRecords = r.ledger;
    c2.manifest = entries.map((e) => ({ messageId: e.messageId, variantId: e.variantId, contentHash: e.contentHash, role: e.role }));
    c2.transcriptFingerprint = r.fingerprint;
    c2.revision++;
    // plan step readiness follows enacted steps
    const plan = this.activePlan();
    if (plan) {
      const { plan: p2 } = refreshPlan(plan, r.state, r.state.clock.lo, this.settings.readyWindowMinutes);
      c2.planRevisions = c2.planRevisions.map((x) => (x.planId === p2.planId ? p2 : x));
    }
    await this.host.save();
  }

  /** Journal recovery after reload/crash: finalize a published commit or discard an unpublished one. */
  private async recoverPending(c: CampaignData) {
    const j = c.pendingTransaction;
    if (!j) return;
    const entries = this.host.readTranscript();
    const landed = entries.find((e) => e.role === 'gm' && e.contentHash === j.targetHash && e.variantId === j.interpretation.variantId);
    if (landed) {
      const list = interpretationsFor(c.interpretations, j.interpretation.key);
      if (!list.some((x) => x.commitId === j.commitId)) list.push(j.interpretation);
      c.interpretations[j.interpretation.key] = list;
      c.acceptedHead = j.commitId;
      this.host.log('info', `recovered journaled commit ${j.commitId}`);
    } else {
      if (j.priorReply && j.opType === 'regenerate') {
        try { await this.host.restorePrior('regenerate', j.priorReply); } catch { /* best effort */ }
      }
      this.host.log('info', `discarded unpublished journal ${j.commitId}`);
    }
    c.pendingTransaction = null;
  }

  /** Retry: save again after a persistence failure, or rerun the failed operation. */
  async retry(): Promise<void> {
    const c = this.campaign();
    if (!c) return;
    if (c.recoveryState.status === 'unsaved') {
      try {
        await this.host.save();
        c.recoveryState = { status: 'ok' };
        await this.host.save();
        this.setStatus('idle', 'Saved');
      } catch (e) {
        this.setStatus('error', 'Save failed again: ' + (e as Error).message, { errorKind: 'persistence_failure', canRetry: true });
      }
      return;
    }
    c.recoveryState = { status: 'ok' };
    const op = this.lastFailedOp?.op;
    if (op && op !== 'rebuild') {
      const last = this.host.readTranscript().slice(-1)[0];
      await this.runOperation(last?.role === 'user' ? 'normal' : op === 'continue' ? 'continue' : 'normal');
    } else {
      await this.reconcile('retry');
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Planning helpers

  private async ensurePlan(index: WorldIndex, signal: AbortSignal, operationId: string, opts: { force?: boolean; situation?: string } = {}): Promise<{ plan: PlanRevision | null; forced: boolean }> {
    const c = this.campaign()!;
    const pack = this.pack();
    const state = index.state;
    const clock = state.clock.lo;
    let plan = this.activePlan();
    const pend = pendingHard(pack, state);
    if (!pend.length) return { plan: null, forced: false };
    let needs = !plan || plan.status !== 'active';
    if (plan && plan.status === 'stale') {
      // Revalidate: assumptions must still hold; otherwise replan.
      const broken = plan.assumptions.some((a) => a.fact && (() => { const f = factAt(state, a.fact!.entity_id, a.fact!.predicate, { tick: clock }); return f.known && !valuesEqual(f.value!, a.fact!.value); })());
      const protectedGone = plan.protectedAnchorIds.some((id) => state.dispositions.get(id)?.disposition === 'occurred');
      needs = broken || protectedGone || plan.steps.some((s) => s.status === 'enacted' && !state.enactedSteps.has(s.step_id));
      if (!needs) { plan.status = 'active'; plan.sourcePrefixHash = this.current?.replay.fingerprint || plan.sourcePrefixHash; }
    }
    if (plan && !needs) {
      const { plan: p2, invalidated } = refreshPlan(plan, state, clock, this.settings.readyWindowMinutes);
      c.planRevisions = c.planRevisions.map((x) => (x.planId === p2.planId ? p2 : x));
      plan = p2;
      if (invalidated.length) needs = true; // C08: a due step became impossible -> replan
      const detailedDone = plan.protectedAnchorIds.filter((id) => state.dispositions.get(id)?.disposition === 'occurred');
      if (detailedDone.length) needs = true; // roll the horizon forward
    }
    if (plan && !needs) {
      // Deterministic triggers independent of the impact model: a protected anchor's prerequisite
      // changed truth value, or a diagnosed large-scale change requires forced convergence.
      const sig = preconditionSignature(pack, state, plan.protectedAnchorIds, clock);
      if (plan.preconditionSignature && sig !== plan.preconditionSignature) needs = true;
      if (plan.mode !== 'FORCED_CONVERGENCE' && diagnoseForced(pack, state, planScope(pack, state), clock)) needs = true;
    }
    if (opts.force) needs = true;
    if (!needs) return { plan, forced: plan!.mode === 'FORCED_CONVERGENCE' };
    const facts = this.stateFacts(index, [...pack.entities.keys(), ...state.runtimeEntities.keys()], clock);
    let res: Awaited<ReturnType<typeof runPlanning>>;
    try {
      res = await runPlanning({
      port: this.host.model, pack, index, state, clockTick: clock, worldRevision: c.revision, prefixHash: this.current?.replay.fingerprint || '',
      affected: (c as CampaignData & { _affectedAnchors?: Id[] })._affectedAnchors || [], maxOrdinary: this.settings.maxOrdinaryPlanner, allowForcedAttempt: this.settings.forcedPlannerAttempt,
      signal, operationId, readyWindow: this.settings.readyWindowMinutes, facts, persona: this.host.persona().name, log: (l) => this.debugLog('task', l),
      situation: opts.situation ?? this.recentSituation(index),
      impactForced: !!(c as CampaignData & { _impactForced?: boolean })._impactForced,
      });
    } catch (e) {
      // A model that cannot produce a valid plan (malformed/truncated JSON) is treated like "no valid
      // plan": the reply proceeds and HARD obligations stay enforced at their deadlines. Provider
      // failures and cancellation remain operational errors (C15).
      if (!(e instanceof EngineError) || e.kind !== 'invalid_model_json') throw e;
      res = { plan: null, forced: false, errors: [(e as Error).message] } as unknown as Awaited<ReturnType<typeof runPlanning>>;
    }
    if (!res.plan) {
      // No valid plan: HARD obligations are still enforced at their checkpoints by the gate and adjudicator.
      if (plan) plan.status = 'stale';
      this.notice('warn', `Planner could not produce a valid plan (${res.errors.slice(-2).join(' | ') || 'no output'}). Hard obligations remain enforced at their deadlines.`);
      return { plan: plan && plan.status === 'active' ? plan : null, forced: false };
    }
    for (const p of c.planRevisions) if (p.status === 'active' || p.status === 'stale') p.status = 'superseded';
    res.plan.preconditionSignature = preconditionSignature(pack, state, res.plan.protectedAnchorIds, clock);
    c.planRevisions.push(res.plan);
    c.planRevisions = c.planRevisions.slice(-10);
    c.activePlanId = res.plan.planId;
    delete (c as CampaignData & { _affectedAnchors?: Id[] })._affectedAnchors;
    delete (c as CampaignData & { _impactForced?: boolean })._impactForced;
    return { plan: res.plan, forced: res.forced };
  }

  private async postCommitImpact(interp: Interpretation, signal: AbortSignal, operationId: string) {
    const c = this.campaign();
    if (!c || !this.current) return;
    const pack = this.pack();
    const changedKeys = new Set<string>();
    const changedEntities = new Set<string>();
    for (const r of interp.records) for (const d of r.factsSetOrUnset) { changedKeys.add(`${d.entity_id}|${d.predicate}`); changedEntities.add(d.entity_id); }
    for (const r of interp.records) if (r.disposition && r.disposition !== 'occurred' && r.packEventId) pack.events.get(r.packEventId)?.outcomes.forEach((o) => changedKeys.add(`${o.entity_id}|${o.predicate}`));
    const plan = this.activePlan();
    // Changes made by enacting the plan's own steps, with no canon deviation, are the plan working
    // (e.g. the planned poisoning sets the victim's condition): nothing to assess.
    const deviating = interp.records.some((r) => r.disposition && r.disposition !== 'occurred');
    const offPlan = interp.records.filter((r) => !(r.enactedStepIds && r.enactedStepIds.length) && r.factsSetOrUnset.length);
    if (!deviating && !offPlan.length) return;
    const cand = impactCandidates(pack, plan, changedKeys, changedEntities);
    if (!cand.relevant) return;
    const state = this.current.replay.state;
    const enacted = new Set(interp.records.flatMap((r) => r.enactedStepIds || []));
    const out = await this.withTimeout(assessImpact(this.host.model, {
      accepted_changes: interp.records.flatMap((r) => r.factsSetOrUnset.map((d) => ({ entity_id: d.entity_id, predicate: d.predicate, op: d.op, value: d.op === 'set' ? d.value : null, by_plan_step: (r.enactedStepIds || [])[0] || null, event: r.summary }))),
      enacted_plan_steps: plan ? plan.steps.filter((x) => enacted.has(x.step_id)).map((x) => ({ step_id: x.step_id, action: x.action, serves_anchor: x.serves_anchor })) : [],
      deviations: interp.records.filter((r) => r.disposition && r.disposition !== 'occurred').map((r) => ({ event: r.packEventId, disposition: r.disposition, reason: r.dispositionReason })),
      plan: plan ? { assumptions: plan.assumptions, steps: plan.steps.map((s) => ({ step_id: s.step_id, action: s.action, serves_anchor: s.serves_anchor })) } : null,
      candidate_anchors: cand.anchors,
      hard_register: pendingHard(pack, state).map((h) => ({ id: h.event.id, required: h.event.required_description, deadline: h.event.when.latest })),
    }, signal, operationId, (l) => this.debugLog('task', l)), this.settings.taskTimeoutMs * 4, signal);
    const validAnchors = out.affected_anchors.filter((a) => pack.events.get(a)?.classification === 'HARD');
    if (out.replan || out.scope !== 'local') {
      if (plan) plan.status = 'stale';
      (c as CampaignData & { _affectedAnchors?: Id[] })._affectedAnchors = uniq([...validAnchors, ...(out.scope !== 'local' ? cand.anchors : [])]);
      if (out.scope === 'global' && out.severity === 'major') (c as CampaignData & { _impactForced?: boolean })._impactForced = true;
    }
    // Controller verification of a major banner: real anchors referenced AND a material replan/forced correction.
    if (out.severity === 'major' && validAnchors.length && (out.replan || (c as CampaignData & { _impactForced?: boolean })._impactForced)) {
      const routeBroken = validAnchors.some((a) => state.dispositions.get(a)?.disposition !== 'occurred');
      if (routeBroken) {
        const banner: Banner = { severity: 'major', text: '严重历史偏离：本次变化显著影响了既定历史的实现路径，世界收束机制正在调整后续事件。', commitId: interp.commitId, reason: out.explanation.slice(0, 300) };
        const list = interpretationsFor(c.interpretations, interp.key);
        const mine = list.find((x) => x.commitId === interp.commitId);
        if (mine) mine.banner = banner;
      }
    }
    await this.host.save();
    this.emit();
  }

  // ---------------------------------------------------------------------------------------------
  // Horae

  private async horaeBarrier(signal: AbortSignal): Promise<string> {
    const h = this.host.horae;
    if (!h) return '';
    let st = h.status();
    if (!st.available) return '';
    if (st.busy) await this.withTimeout(h.waitForIdle(this.settings.horaeWaitMs), this.settings.horaeWaitMs + 1000, signal).catch(() => false);
    st = h.status();
    if (st.staleIndexes.length) {
      // Supported repair: re-analyze affected messages once, then verify freshness.
      for (const i of st.staleIndexes.slice(0, 20)) { try { await h.reanalyze(i); } catch { /* verified below */ } }
      await this.withTimeout(h.waitForIdle(this.settings.horaeWaitMs), this.settings.horaeWaitMs + 1000, signal).catch(() => false);
      st = h.status();
    }
    if (st.staleIndexes.length || st.busy) {
      excludeHoraeForOperation = true;
      this.notice('warn', 'Horae memory is stale for edited messages and could not be refreshed; it was excluded from this reply\'s prompt. Use Horae\'s re-analyze to repair it.');
      return 'Horae memory excluded for this reply (stale after edits).';
    }
    excludeHoraeForOperation = false;
    return '';
  }

  // ---------------------------------------------------------------------------------------------
  // Backup

  exportBackup(): string {
    const c = this.campaign();
    if (!c) throw new EngineError('invalid_pack', 'no campaign');
    return JSON.stringify({ format: 'canon-engine-backup', version: STORAGE_VERSION, engineVersion: ENGINE_VERSION, exportedChatId: this.host.chatId(), campaign: c, transcriptManifest: this.host.readTranscript().map((e) => ({ messageId: e.messageId, variantId: e.variantId, contentHash: e.contentHash, role: e.role })) }, null, 1);
  }

  async importBackup(text: string): Promise<{ matchedMessages: number; total: number }> {
    let data: { format?: string; version?: number; campaign?: CampaignData };
    try { data = JSON.parse(text); } catch { throw new EngineError('invalid_pack', 'backup is not valid JSON'); }
    if (data.format !== 'canon-engine-backup' || !data.campaign) throw new EngineError('invalid_pack', 'not a Canon Engine backup file');
    if ((data.version || 0) > STORAGE_VERSION) throw new EngineError('incompatible_adapter', 'backup was written by a newer storage version');
    const camp = data.campaign;
    const loaded = loadPinnedPack(camp.packSnapshot);
    if (loaded.hash !== camp.packHash) throw new EngineError('invalid_pack', 'backup pack snapshot does not match its recorded hash');
    camp.chatId = this.host.chatId() || camp.chatId;
    camp.integrity = this.host.integrity();
    camp.pendingTransaction = null;
    this.host.setCampaign(camp);
    this.packCache = null;
    const entries = this.host.readTranscript();
    const matched = entries.filter((e) => camp.manifest.some((m) => m.messageId === e.messageId && m.contentHash === e.contentHash)).length;
    await this.reconcile('backup_import');
    return { matchedMessages: matched, total: entries.length };
  }

  // ---------------------------------------------------------------------------------------------
  // Pack update (explicit, reviewed)

  diffPack(newText: string): { ok: boolean; errors: LintIssue[]; changed: string[]; deleted: string[]; added: string[]; hardChanged: string[] } {
    const c = this.campaign();
    const r = validatePackText(newText);
    if (!r.ok || !r.loaded || !c) return { ok: false, errors: r.errors, changed: [], deleted: [], added: [], hardChanged: [] };
    const oldEv = new Map(c.packSnapshot.events.map((e) => [e.id, e]));
    const newEv = new Map(r.loaded.pack.events.map((e) => [e.id, e]));
    const changed: string[] = [], deleted: string[] = [], added: string[] = [], hardChanged: string[] = [];
    for (const [id, e] of oldEv) {
      const n = newEv.get(id);
      if (!n) { deleted.push(id); if (e.classification === 'HARD') hardChanged.push(id); continue; }
      if (hashObject(n) !== hashObject(e)) changed.push(id);
      if ((e.classification === 'HARD' || n.classification === 'HARD') && hashObject([e.classification, e.required_description, e.outcomes, e.when.earliest, e.when.latest]) !== hashObject([n.classification, n.required_description, n.outcomes, n.when.earliest, n.when.latest])) hardChanged.push(id);
    }
    for (const id of newEv.keys()) if (!oldEv.has(id)) added.push(id);
    return { ok: true, errors: [], changed, deleted, added, hardChanged };
  }

  /** Apply a reviewed pack update as a new binding revision (caller ensures a backup was exported). */
  async applyPackUpdate(newText: string): Promise<void> {
    const c = this.campaign();
    if (!c) return;
    const r = validatePackText(newText);
    if (!r.ok || !r.loaded) throw new EngineError('invalid_pack', r.errors.map((e) => e.message).join('; '));
    c.packSnapshot = deepClone(r.loaded.pack);
    c.packHash = r.loaded.hash;
    c.packVersion = r.loaded.pack.pack_version;
    c.bootstrapRecords = buildBootstrap(r.loaded, c.binding.startTick).records;
    c.configRevisions.push({ at: this.host.now(), summary: `pack updated to ${r.loaded.pack.pack_id}@${r.loaded.pack.pack_version}` });
    c.planRevisions.forEach((p) => (p.status = 'stale'));
    // Interpretations reference ids of the old pack; keep them and revalidate them deterministically
    // against the new bootstrap (replay checks every one whose basis state changed). The messages
    // themselves did not change, so the manifest is kept: clearing it would mark every message as
    // new and force a model re-examination of every reply that names a pack entity.
    this.packCache = null;
    await this.reconcile('pack_update');
  }

  /** "强制完成": the player marks a canon event as completed. It is recorded along its original route
   *  (effects, HARD outcomes, downstream preconditions), anchored after the current last message. */
  async forceComplete(eventId: Id): Promise<void> {
    const c = this.campaign();
    if (!c || !this.current) throw new EngineError('incompatible_adapter', 'engine state unavailable');
    if (this.opActive) throw new EngineError('incompatible_adapter', 'Canon Engine is working on a reply; wait or cancel it first.');
    await this.exclusive(async () => {
      const pack = this.pack();
      const state = this.current!.replay.state;
      if (state.dispositions.get(eventId)?.disposition === 'occurred') return;
      const rec = forcedCompletion(pack, state, eventId, state.clock.lo);
      const last = this.host.readTranscript().filter((e) => e.role !== 'system').slice(-1)[0];
      c.manualRecords = [...(c.manualRecords || []), { afterMessageId: last ? last.messageId : null, record: rec, at: this.host.now() }];
      c.configRevisions.push({ at: this.host.now(), summary: `forced to complete: ${eventId}` });
      c.planRevisions.forEach((p) => { if (p.status === 'active') p.status = 'stale'; });
    });
    await this.reconcile('force_complete', { allowModel: false });
    await this.host.save();
  }

  /** Undo a "强制完成". */
  async undoForce(eventId: Id): Promise<void> {
    const c = this.campaign();
    if (!c) return;
    if (this.opActive) throw new EngineError('incompatible_adapter', 'Canon Engine is working on a reply; wait or cancel it first.');
    await this.exclusive(async () => {
      c.manualRecords = (c.manualRecords || []).filter((m) => m.record.packEventId !== eventId);
      c.configRevisions.push({ at: this.host.now(), summary: `undid forced completion: ${eventId}` });
      c.planRevisions.forEach((p) => { if (p.status === 'active') p.status = 'stale'; });
    });
    await this.reconcile('undo_force', { allowModel: false });
    await this.host.save();
  }

  /** Events the player forced to complete. */
  forcedEvents(): Set<Id> {
    return new Set((this.campaign()?.manualRecords || []).map((m) => m.record.packEventId!).filter(Boolean));
  }

  // ---------------------------------------------------------------------------------------------
  // Inspector data

  /** Read-only data for the history graph views (pack + current replayed state). */
  graphSource(): { pack: LoadedPack; state: WorldState | null; origin: { y: number; m: number; d: number } | null } | null {
    const c = this.campaign();
    if (!c) return null;
    return { pack: this.pack(), state: this.current?.replay.state || null, origin: c.binding.originDate || null };
  }

  inspector(spoilers: boolean) {
    const c = this.campaign();
    if (!c || !this.current) return null;
    const pack = this.pack();
    const s = this.current.replay.state;
    const idx = this.current.index;
    const origin = c.binding.originDate;
    const facts = [...s.facts.keys()].map((k) => {
      const [e, p] = [k.slice(0, k.indexOf('|')), k.slice(k.indexOf('|') + 1)];
      const f = factAt(s, e, p);
      const rec = f.supportRecordId ? s.recordById.get(f.supportRecordId) : undefined;
      return f.known ? { entity: idx.entityName(e), predicate: p, value: JSON.stringify(f.value), since: formatTick(f.validFrom!, origin), source: rec ? `${rec.kind}: ${rec.summary}` : '' } : null;
    }).filter(Boolean);
    const hidden = (evId?: string) => !spoilers && !!evId && pack.events.get(evId)?.visibility.mode === 'secret';
    return {
      title: `${pack.pack.title} (${pack.pack.pack_version})`,
      packHash: c.packHash.slice(0, 12),
      time: formatStoryTime(s.clock, origin),
      revision: c.revision,
      branchId: c.branchId,
      recovery: c.recoveryState,
      facts,
      occurrences: [...s.occurrences.values()].filter((o) => !hidden(o.packEventId)).map((o) => ({ id: o.occurrenceId, title: o.title, time: formatStoryTime(o.time, origin), origin: o.origin, account: o.account })),
      deviations: [...s.dispositions].filter(([, d]) => d.disposition !== 'occurred').map(([id, d]) => ({ id, title: pack.events.get(id)?.title, disposition: d.disposition, reason: d.reason })),
      anchors: pack.hardEvents.map((id) => {
        const e = pack.events.get(id)!;
        const d = s.dispositions.get(id);
        return { id, title: e.title, when: spoilers ? e.when.label : '—', status: d ? d.disposition : (pack.timeIndex.find((t) => t.id === id)!.lo > s.clock.lo ? 'pending' : 'due'), required: spoilers ? e.required_description : '(hidden — enable spoilers)' };
      }),
      plan: spoilers ? this.activePlan() : (this.activePlan() ? { mode: this.activePlan()!.mode, steps: this.activePlan()!.steps.length } : null),
      lastTrace: this.settings.debug ? this.lastTrace : null,
      manifests: this.settings.debug ? Object.values(c.manifests).slice(-5) : [],
      notices: this.notices.slice(-10),
    };
  }
}

export interface ReviewResult {
  gate: GateResult;
  evaluation: EvalOutput;
  retrieval: Retrieval;
  manifest: CoverageManifest | null;
  facts: string;
  packetText: string;
  claims: ClaimInput[];
  refs: RefInput[];
}

/** Set by the Horae barrier; read by the ST adapter's prompt hook for the current operation. */
export let excludeHoraeForOperation = false;

function replayRecords(pack: LoadedPack, recs: LedgerRecord[]): WorldState {
  return reduceRecords(pack, recs);
}

function replayFingerprint(entries: SourceEntry[]): string {
  const h = fingerprintPrefix(entries);
  return h[h.length - 1] || 'root';
}

function trimManifests(c: CampaignData) {
  const keys = Object.keys(c.manifests);
  if (keys.length > MAX_MANIFESTS) for (const k of keys.slice(0, keys.length - MAX_MANIFESTS)) delete c.manifests[k];
}

function mergeRetrieval(a: Retrieval, b: Retrieval): Retrieval {
  const occ = new Map(a.occurrences);
  for (const [k, v] of b.occurrences) occ.set(k, new Set([...(occ.get(k) || []), ...v]));
  const ent = new Map(a.entities);
  for (const [k, v] of b.entities) ent.set(k, new Set([...(ent.get(k) || []), ...v]));
  return { entries: [...a.entries, ...b.entries], occurrences: occ, entities: ent, canonEvents: new Set([...a.canonEvents, ...b.canonEvents]), claims: [...a.claims, ...b.claims], ambiguous: uniq([...a.ambiguous, ...b.ambiguous]) };
}

export function joinContinuation(prefix: string, cont: string): string {
  const c = cont.replace(/^\s+/, '');
  if (!c) return prefix;
  if (c.startsWith(prefix.trim())) return c; // model repeated the whole message
  const sep = /[\s\n]$/.test(prefix) || /^[,.;:!?，。；：！？、]/.test(c) ? '' : ' ';
  return prefix + sep + c;
}

export function labelForError(kind: string): string {
  const m: Record<string, string> = {
    invalid_pack: 'Invalid pack', unresolved_start_time: 'Unresolved starting time', conflicting_transcript: 'Conflicting retained transcript', provider_failure: 'Provider failure',
    invalid_model_json: 'Invalid model JSON', narrative_validation_failure: 'Narrative validation failure', stale_response: 'Stale response', incompatible_adapter: 'Incompatible adapter',
    stale_memory: 'Stale memory', persistence_failure: 'Persistence failure', capacity: 'Context capacity', cancelled: 'Cancelled', configuration_conflict: 'Configuration conflict', busy: 'Busy',
  };
  return m[kind] || kind;
}

export { toTick, valuesEqual };
