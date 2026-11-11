// The web host: Canon Engine in a page of its own, with no other program. The conversation and the game are a saved
// game in the browser; replies come from any OpenAI-compatible API the player connects (model.ts).
import { deepClone, sha256, type CampaignData, type HostPort, type Interpretation, type OpType, type Persona, type PublishRequest, type SourceEntry } from '../../core';
import type { WebModel } from './model';
import { packs, saves, type Msg, type Save } from './store';

const hashOf = (role: string, text: string) => sha256(`${role}\u0000${text}`);

export class WebHost implements HostPort {
  /** The open game; null on the title screen. */
  game: Save | null = null;
  sceneTracker = null;
  model: WebModel;
  packStore: NonNullable<HostPort['packStore']> = {
    save: async (text, meta) => { await packs.put(meta.hash, text); return { file: meta.hash }; },
    load: async (ref) => (await packs.get(ref.file || ref.hash)) ?? (await packs.get(ref.hash)) ?? null,
  };

  constructor(model: WebModel) { this.model = model; }

  chatId(): string | null { return this.game?.id ?? null; }
  isGroup(): boolean { return false; }
  integrity(): string | null { return this.game?.integrity ?? null; }
  readTranscript(): SourceEntry[] {
    return (this.game?.chat || []).map((m, index) => ({ index, messageId: m.mid, variantId: m.vid, contentHash: hashOf(m.role, m.text), role: m.role, name: m.role === 'user' ? this.game!.persona.name : 'GM', text: m.text }));
  }
  hashAssistant(text: string): string { return hashOf('gm', text); }
  getCampaign(): CampaignData | null { return (this.game?.campaign as CampaignData) ?? null; }
  setCampaign(data: CampaignData | null): void { if (this.game) this.game.campaign = data; }
  async save(): Promise<void> {
    if (!this.game) return;
    this.game.updatedAt = Date.now();
    // a copy: the engine keeps working on its own objects while this is written
    await saves.put(deepClone(this.game));
  }
  async publish(req: PublishRequest, _interp: Interpretation): Promise<void> {
    const chat = this.game!.chat;
    const last = chat[chat.length - 1];
    if (req.op === 'swipe' && last?.role === 'gm') {
      // another reply in place of the last: the earlier ones stay as alternatives
      last.swipes = last.swipes || [{ text: last.text, vid: last.vid }];
      last.swipes.push({ text: req.text, vid: req.variantId });
      last.swipeId = last.swipes.length - 1;
      last.text = req.text; last.vid = req.variantId;
    } else if (req.op === 'continue' && last?.role === 'gm') {
      last.text = req.text; last.vid = req.variantId;
      if (last.swipes && last.swipeId !== undefined) last.swipes[last.swipeId] = { text: req.text, vid: req.variantId };
    } else {
      chat.push({ role: 'gm', text: req.text, mid: req.messageId, vid: req.variantId });
    }
    await this.save();
  }
  /** Nothing to restore: this host changes the conversation only when a reply is published. */
  async restorePrior(_op: OpType, _prior: unknown): Promise<void> { /* nothing */ }
  persona(): Persona { return { name: this.game?.persona.name || 'Player', description: this.game?.persona.description || '' }; }
  now(): number { return Date.now(); }
  log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: unknown): void {
    (level === 'error' ? console.error : level === 'warn' ? console.warn : console.debug)('[Canon Engine]', msg, data ?? '');
  }

  // the player's own changes to the conversation
  addUser(text: string): Msg { const m: Msg = { role: 'user', text, mid: crypto.randomUUID(), vid: crypto.randomUUID() }; this.game!.chat.push(m); return m; }
  edit(index: number, text: string) {
    const m = this.game!.chat[index];
    // the same message and variant with new text: the engine sees the edit by its content
    m.text = text;
    if (m.swipes && m.swipeId !== undefined) m.swipes[m.swipeId] = { text, vid: m.vid };
  }
  remove(index: number) { this.game!.chat.splice(index, 1); }
  selectSwipe(index: number, k: number) {
    const m = this.game!.chat[index];
    if (!m.swipes?.[k]) return;
    m.swipeId = k; m.text = m.swipes[k].text; m.vid = m.swipes[k].vid;
  }
}
