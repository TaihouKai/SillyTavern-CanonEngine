// In-memory host + scripted model for deterministic engine tests (no ST, no network).
import type { HostPort, HoraePort, PublishRequest } from '../../src/runtime/host';
import type { CampaignData, Interpretation, OpType, SourceEntry } from '../../src/runtime/types';
import type { ChatMsg, DraftRequest, ModelPort, TaskName } from '../../src/runtime/model';
import { CanonEngine, type EngineSettings } from '../../src/runtime/engine';
import { newId, sha256, deepClone } from '../../src/domain/util';

export interface FakeMsg { role: 'user' | 'gm' | 'system'; text: string; mid: string; vid: string; swipes?: { text: string; vid: string }[]; swipeId?: number }

export class FakeHost implements HostPort {
  chat: FakeMsg[] = [];
  campaignData: CampaignData | null = null;
  chatIdValue = 'chat-1';
  integrityValue = 'int-1';
  group = false;
  saves = 0;
  failNextSaves = 0;
  saveDelay: (() => Promise<void>) | null = null;
  publishHook: (() => Promise<void>) | null = null;
  horae: HoraePort | null = null;
  model: ScriptedModel;
  logs: string[] = [];
  /** Durable copy (what a reload would see). */
  persisted: { chat: FakeMsg[]; campaign: CampaignData | null } = { chat: [], campaign: null };

  constructor(model?: ScriptedModel) {
    this.model = model || new ScriptedModel();
    this.chat.push({ role: 'gm', text: 'Welcome to the harbor. (greeting)', mid: newId('msg'), vid: newId('var') });
  }
  writer = true;
  isWriter() { return this.writer; }
  chatId() { return this.chatIdValue; }
  isGroup() { return this.group; }
  integrity() { return this.integrityValue; }
  readTranscript(): SourceEntry[] {
    return this.chat.map((m, index) => ({ index, messageId: m.mid, variantId: m.vid, contentHash: sha256(`${m.role}\u0000${m.text}`), role: m.role, name: m.role, text: m.text }));
  }
  hashAssistant(text: string) { return sha256(`gm\u0000${text}`); }
  getCampaign() { return this.campaignData; }
  setCampaign(d: CampaignData | null) { this.campaignData = d; }
  async save() {
    if (this.saveDelay) await this.saveDelay();
    if (this.failNextSaves > 0) { this.failNextSaves--; throw new Error('simulated save failure'); }
    this.saves++;
    this.persisted = { chat: deepClone(this.chat), campaign: deepClone(this.campaignData) };
  }
  async publish(req: PublishRequest, _i: Interpretation) {
    if (this.publishHook) await this.publishHook();
    if (req.op === 'swipe' || req.op === 'continue') {
      const last = this.chat[this.chat.length - 1];
      if (req.op === 'swipe') {
        last.swipes = last.swipes || [{ text: last.text, vid: last.vid }];
        last.swipes.push({ text: req.text, vid: req.variantId });
        last.swipeId = last.swipes.length - 1;
      }
      last.text = req.text;
      last.vid = req.variantId;
    } else {
      this.chat.push({ role: 'gm', text: req.text, mid: req.messageId, vid: req.variantId });
    }
    await this.save();
  }
  async restorePrior(op: OpType, prior: any) {
    if (op === 'regenerate' && prior?.message) this.chat.push(prior.message);
  }
  persona() { return { name: 'Traveler', description: 'a wandering cartographer' }; }
  now() { return 1_000_000; }
  log(level: string, msg: string) { this.logs.push(`${level}: ${msg}`); }

  // test helpers
  addUser(text: string) { const m: FakeMsg = { role: 'user', text, mid: newId('msg'), vid: 'v0' }; this.chat.push(m); return m; }
  addGm(text: string) { const m: FakeMsg = { role: 'gm', text, mid: newId('msg'), vid: newId('var') }; this.chat.push(m); return m; }
  edit(index: number, text: string) { this.chat[index].text = text; }
  remove(index: number) { this.chat.splice(index, 1); }
  selectSwipe(index: number, swipe: number) { const m = this.chat[index]; const s = m.swipes![swipe]; m.text = s.text; m.vid = s.vid; m.swipeId = swipe; }
  reload() { this.chat = deepClone(this.persisted.chat); this.campaignData = deepClone(this.persisted.campaign); }
}

export type TaskHandler = (input: any) => any;
export interface Rule { task: TaskName; when?: (input: any) => boolean; respond: TaskHandler; once?: boolean; raw?: string }

export class ScriptedModel implements ModelPort {
  rules: Rule[] = [];
  drafts: (string | (() => Promise<string>))[] = [];
  calls: { task: TaskName | 'draft'; input: any; messages?: ChatMsg[] }[] = [];
  failTask: Partial<Record<TaskName | 'draft', number>> = {};
  taskGate: Partial<Record<TaskName | 'draft', () => Promise<void>>> = {};

  on(task: TaskName, when: ((input: any) => boolean) | null, respond: TaskHandler | object, once = false) {
    this.rules.unshift({ task, when: when || undefined, respond: typeof respond === 'function' ? (respond as TaskHandler) : () => respond, once });
    return this;
  }
  draft(...t: (string | (() => Promise<string>))[]) { this.drafts.push(...t); return this; }

  async runTask(task: TaskName, messages: ChatMsg[]): Promise<string> {
    const input = JSON.parse(messages[1].content.replace(/^INPUT[^\n]*\n/, ''));
    this.calls.push({ task, input, messages });
    if (this.taskGate[task]) await this.taskGate[task]!();
    if ((this.failTask[task] || 0) > 0) { this.failTask[task]!--; throw new Error('simulated provider failure'); }
    const idx = this.rules.findIndex((r) => r.task === task && (!r.when || r.when(input)));
    if (idx >= 0) {
      const r = this.rules[idx];
      if (r.once) this.rules.splice(idx, 1);
      if (r.raw !== undefined) return r.raw;
      return JSON.stringify(deepMerge(defaultTask(task, input), r.respond(input)));
    }
    return JSON.stringify(defaultTask(task, input));
  }

  async generateDraft(req: DraftRequest): Promise<string> {
    this.calls.push({ task: 'draft', input: req });
    if (this.taskGate.draft) await this.taskGate.draft();
    if ((this.failTask.draft || 0) > 0) { this.failTask.draft!--; throw new Error('simulated provider failure'); }
    const d = this.drafts.shift();
    if (d === undefined) return 'The harbor is quiet. What do you do?';
    return typeof d === 'function' ? d() : d;
  }

  tasks(name: TaskName | 'draft') { return this.calls.filter((c) => c.task === name); }
}

const T = (tick: number) => ({ day: Math.floor(tick / 1440), minute: ((tick % 1440) + 1440) % 1440 });
const tickOf = (t: any) => (t ? t.day * 1440 + t.minute : 0);

export function defaultTask(task: TaskName, input: any): any {
  switch (task) {
    case 'extract_user': return { statements: [], references: [], scene_entities: [] };
    case 'discover': return { references: [], claims: [] };
    case 'evaluate': {
      const now = input.current_time ? { day: input.current_time.day, minute: input.current_time.minute } : { day: 0, minute: 480 };
      return {
        decision: 'retain', scene_end: { lo: now, hi: now, precision: 'minute' }, flashback: false,
        claim_checks: (input.claims || []).map((c: any) => ({ claim_id: c.id, verdict: 'consistent', record_ids: [], note: '' })),
        transitions: [], occurrences: [], state_claims: [], player_actions: [], step_enactments: [], new_entities: [], violations: [],
        hard_checks: (input.due_hard || []).map((h: any) => ({ event_id: h.event_id, status: 'not_due', occurrence_ref: null, quote: null })), scene_entities: [], summary: '',
      };
    }
    case 'adjudicate': {
      const c = input.candidate || {};
      return { adjudications: c.id ? [{ event_id: c.id, decision: 'occurred', time: null, account: `Offscreen: ${c.title}. ${c.required_description || c.original_summary}`, actors: c.entities || [], causes: [], effects: (c.original_outcomes || []).map((o: any) => ({ op: 'set', entity_id: o.entity_id, predicate: o.predicate, value: o.value })), plan_step_ids: [], reason: 'scripted', extraordinary: !!input.authorized_forced }] : [] };
    }
    case 'impact': return { changed: [], affected_anchors: [], affected_steps: [], scope: 'local', severity: 'none', replan: false, explanation: 'scripted' };
    case 'plan': {
      const now = input.now?.tick ?? 0;
      const steps = (input.protected_hard_detailed || []).map((h: any, i: number) => ({ step_id: `s${i + 1}`, actors: [], targets: [], earliest: T(Math.max(now, tickOf(h.earliest) - 60)), latest: h.latest, prerequisites: [], action: `move toward ${h.id}`, intended_effects: [], visibility: 'secret', knowers: [], depends_on: [], means: input.allowed_mode === 'FORCED_CONVERGENCE' ? 'extraordinary' : 'ordinary', serves_anchor: h.id, requires_player_consent: false }));
      return { rationale: 'scripted plan', protected_anchor_ids: (input.protected_hard_detailed || []).map((h: any) => h.id), assumptions: [], risks: [], mode: input.allowed_mode || 'NORMAL', steps, inadequacy_note: input.forced_reason || '' };
    }
  }
  return {};
}

function deepMerge(base: any, patch: any): any {
  if (patch === undefined) return base;
  if (Array.isArray(patch) || typeof patch !== 'object' || patch === null) return patch;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? deepMerge(base[k], v) : v;
  return out;
}

export const D = (day: number, h: number, m = 0) => ({ day, minute: h * 60 + m });
export const tick = (day: number, h: number, m = 0) => day * 1440 + h * 60 + m;
export const at = (day: number, h: number, m = 0) => ({ lo: D(day, h, m), hi: D(day, h, m), precision: 'minute' });

export function makeEngine(settings: Partial<EngineSettings> = {}) {
  const model = new ScriptedModel();
  const host = new FakeHost(model);
  const engine = new CanonEngine(host, { taskTimeoutMs: 5000, draftTimeoutMs: 5000, ...settings });
  return { model, host, engine };
}

/** Deferred promise for race tests. */
export function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => (resolve = r));
  return { promise: p, resolve };
}

/** Helper to build an evaluator occurrence patch. */
export function occ(ref: string, title: string, quote: string, extra: any = {}) {
  return { ref, title, account: extra.account || title, actors: extra.actors || [], affected: extra.affected || [], locations: extra.locations || [], time: extra.time ?? null, causes: extra.causes || [], quote, pack_event_id: extra.pack_event_id ?? null, disposition: extra.disposition ?? null, ref_phrases: extra.ref_phrases || [], ...(extra.continues !== undefined ? { continues: extra.continues } : {}), visibility: extra.visibility || 'public', knowers: extra.knowers || [], origin: extra.origin || 'gm' };
}
