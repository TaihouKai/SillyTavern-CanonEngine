// Models for the web host: any OpenAI-compatible chat completions API the player connects (Venice, DeepSeek,
// OpenRouter, a local server...), called straight from the browser with the player's own key.
import type { ChatMsg, DraftInfo, DraftRequest, ModelPort, TaskName, TokenUsage } from '../../core';

export interface Connection { baseUrl: string; apiKey: string; model: string; temperature: number; maxTokens: number; extraBody: string }
export const PROVIDERS: { id: string; label: string; baseUrl: string; model: string }[] = [
  { id: 'venice', label: 'Venice', baseUrl: 'https://api.venice.ai/api/v1', model: 'deepseek-v4-1-flash' },
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  { id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'deepseek/deepseek-chat' },
];

/** What the GM is given besides the engine's context: its instructions, the player's character and world notes. */
export interface Stage { gmPrompt: string; persona: { name: string; description: string }; worldNotes: string; history: ChatMsg[] }

export class WebModel implements ModelPort {
  story: () => Connection;
  /** The analysis connection; the story's when not set. */
  tasks: () => Connection | null;
  stage: () => Stage;
  private usage: TokenUsage = { input: 0, output: 0, calls: 0, unreported: 0, storyInput: 0, storyOutput: 0, costUsd: 0, storyCostUsd: 0, costUnreported: 0 };
  private draftInfo: DraftInfo | null = null;
  /** The last draft's prompt, for the inspector. */
  lastDraftPrompt: ChatMsg[] | null = null;

  constructor(story: () => Connection, tasks: () => Connection | null, stage: () => Stage) {
    this.story = story; this.tasks = tasks; this.stage = stage;
  }

  describeTaskConnection(): string { const c = this.tasks() || this.story(); return `${c.model} @ ${c.baseUrl}`; }

  private async complete(c: Connection, messages: ChatMsg[], maxTokens: number, temperature: number, signal: AbortSignal | undefined, story: boolean): Promise<{ text: string; finish?: string }> {
    if (!c.baseUrl || !c.model) throw new Error('no model connection: set one in the settings');
    let extra: Record<string, unknown> = {};
    if (c.extraBody.trim()) { try { extra = JSON.parse(c.extraBody); } catch { throw new Error('the connection\'s extra parameters are not valid JSON'); } }
    // Venice adds a system prompt of its own unless told not to; analysis runs without thinking (as the SillyTavern
    // setup does: thinking makes each check minutes long and the structured answers no better)
    if (/venice\.ai/.test(c.baseUrl)) extra = { ...extra, venice_parameters: { include_venice_system_prompt: false, ...(story ? {} : { disable_thinking: true }), ...(extra.venice_parameters as object || {}) } };
    else if (/api\.deepseek\.com/.test(c.baseUrl) && !story && !('thinking' in extra)) extra = { ...extra, thinking: { type: 'disabled' } };
    const body = { model: c.model, messages, max_tokens: maxTokens, temperature, stream: false, ...extra };
    const res = await fetch(c.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`model request failed: HTTP ${res.status} ${res.statusText} ${t.slice(0, 300)}`);
    }
    const d = await res.json();
    const u = d?.usage, cost = Number(d?.cost?.usd ?? d?.usage?.cost);
    this.usage.calls++;
    if (u) {
      this.usage.input += u.prompt_tokens || 0; this.usage.output += u.completion_tokens || 0;
      if (story) { this.usage.storyInput! += u.prompt_tokens || 0; this.usage.storyOutput! += u.completion_tokens || 0; }
    } else this.usage.unreported++;
    if (Number.isFinite(cost)) { this.usage.costUsd! += cost; if (story) this.usage.storyCostUsd! += cost; } else this.usage.costUnreported!++;
    const ch = d?.choices?.[0];
    if (story) this.draftInfo = { finish: ch?.finish_reason || undefined, outputTokens: u?.completion_tokens, reasoningTokens: u?.completion_tokens_details?.reasoning_tokens, maxTokens };
    return { text: String(ch?.message?.content ?? ''), finish: ch?.finish_reason };
  }

  async runTask(_task: TaskName, messages: ChatMsg[], opts: { signal?: AbortSignal; maxTokens?: number }): Promise<string> {
    const c = this.tasks() || this.story();
    // an empty reply is usually a reasoning model that spent the budget thinking: once more with a larger one
    let budget = opts.maxTokens || 4096;
    for (let attempt = 1; ; attempt++) {
      const out = await this.complete(c, messages, budget, 0.2, opts.signal, false);
      if (out.text.trim()) return out.text;
      if (attempt >= 3) throw new Error(`the model returned an empty reply ${attempt} times (last budget ${budget} tokens)`);
      budget = Math.min(budget * 2, 16384);
    }
  }

  async generateDraft(req: DraftRequest): Promise<string> {
    const st = this.stage(), c = this.story();
    const history = st.history.slice();
    if (req.excludeLastAssistant && history.at(-1)?.role === 'assistant') history.pop();
    const head = [st.gmPrompt.trim(),
      `PLAYER CHARACTER (the player writes as ${st.persona.name}):\n${st.persona.description.trim() || '(no description)'}`,
      st.worldNotes.trim() ? `WORLD NOTES (from the player):\n${st.worldNotes.trim()}` : ''].filter(Boolean).join('\n\n');
    // the engine's context goes just before the latest message, the length and any instruction after it, as in SillyTavern
    const messages: ChatMsg[] = [{ role: 'system', content: head }, ...history.slice(0, -1), { role: 'system', content: req.engineContext }, ...history.slice(-1)];
    if (req.instruction) messages.push({ role: 'system', content: req.instruction });
    if (req.lengthNote) messages.push({ role: 'system', content: req.lengthNote });
    this.lastDraftPrompt = messages;
    const out = await this.complete(c, messages, c.maxTokens || 4096, c.temperature, req.signal, true);
    if (!out.text.trim()) throw new Error('the model returned an empty reply');
    // reasoning written into the text (<think>...</think>) is not the story
    return out.text.replace(/^\s*<think>[\s\S]*?<\/think>\s*/i, '');
  }

  lastDraftInfo(): DraftInfo | null { return this.draftInfo; }
  takeUsage(): TokenUsage {
    const u = this.usage;
    this.usage = { input: 0, output: 0, calls: 0, unreported: 0, storyInput: 0, storyOutput: 0, costUsd: 0, storyCostUsd: 0, costUnreported: 0 };
    return u;
  }
}
