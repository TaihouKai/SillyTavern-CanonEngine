// Host abstraction: everything the engine needs from SillyTavern/Horae. The ST adapter implements
// it in the browser; tests implement it with an in-memory fake (including delayed promises).
import type { CampaignData, Interpretation, OpType, SourceEntry } from './types';
import type { ModelPort } from './model';

export interface HoraeStatus {
  available: boolean;
  version: string | null;
  mode: string | null;
  /** Indexes of assistant messages whose Horae metadata does not match their current text. */
  staleIndexes: number[];
  busy: boolean;
  scene: { date?: string; time?: string; location?: string; characters?: string[] } | null;
}

export interface HoraePort {
  status(): HoraeStatus;
  waitForIdle(timeoutMs: number): Promise<boolean>;
  reanalyze(index: number): Promise<void>;
}

export interface PublishRequest {
  op: OpType;
  text: string;
  commitId: string;
  messageId: string;
  variantId: string;
  contentHash: string;
}

export interface Persona { name: string; description: string; alt?: string; source?: 'standard_persona' | 'persona_core' }

export interface HostPort {
  chatId(): string | null;
  isGroup(): boolean;
  integrity(): string | null;
  /** Current selected transcript with stable identities (assigns missing ids in memory). */
  readTranscript(): SourceEntry[];
  /** Compute the content hash the host would assign to an assistant message with this text. */
  hashAssistant(text: string): string;
  getCampaign(): CampaignData | null;
  setCampaign(data: CampaignData | null): void;
  /** Persist chat + metadata; must throw on failure. */
  save(): Promise<void>;
  /** Publish an accepted reply through the native lifecycle; returns after native events ran. */
  publish(req: PublishRequest, interp: Interpretation): Promise<void>;
  /** Restore a native prior reply captured before a failed/cancelled regenerate/swipe. */
  restorePrior(op: OpType, prior: unknown): Promise<void>;
  /** False when another tab of this browser profile owns the campaign (read-only here). */
  isWriter?(): boolean;
  /** Wait until native UI transitions (e.g. swipe animation/revert) have settled. */
  settle?(): Promise<void>;
  /** The active Persona. ignoreSections: Persona Library's core text without its Additional Sections, when that
   *  core still matches the description (otherwise the whole description). alt: the other reading, so a game
   *  read one way is not taken for a changed Persona after the setting is switched. */
  persona(opts?: { ignoreSections?: boolean }): Persona;
  /** The entries of the lorebooks active in this chat (global, character, chat and Persona lorebooks). */
  loreEntries?(): Promise<import('./lore').LoreEntry[]>;
  horae: HoraePort | null;
  model: ModelPort;
  /** Wall clock for diagnostics only. Never story time. */
  now(): number;
  log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: unknown): void;
}
