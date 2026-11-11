// Host abstraction: everything the engine needs from the program it runs in — the conversation, storage, the Persona,
// models, and optional extras (a scene tracker, lore entries, a pack store). The SillyTavern host implements it in
// src/hosts/sillytavern; tests implement it with an in-memory fake (including delayed promises).
import type { CampaignData, Interpretation, OpType, SourceEntry } from './types';
import type { ModelPort } from './model';

/** A scene tracker the host may have beside the engine (SillyTavern: the Horae extension): its story time, place and
 *  people at the latest reply. Supporting evidence only. */
export interface SceneTrackerStatus {
  available: boolean;
  version: string | null;
  mode: string | null;
  /** Indexes of assistant messages whose tracker data does not match their current text. */
  staleIndexes: number[];
  busy: boolean;
  scene: { date?: string; time?: string; location?: string; characters?: string[] } | null;
}

export interface SceneTrackerPort {
  /** Its name, as the GM and the player see it (SillyTavern: "Horae"). */
  readonly name: string;
  status(): SceneTrackerStatus;
  waitForIdle(timeoutMs: number): Promise<boolean>;
  reanalyze(index: number): Promise<void>;
  /** For the current operation, keep the tracker's own memory out of the reply prompt (stale after edits). */
  excludeFromPrompt?(on: boolean): void;
}

export interface PublishRequest {
  op: OpType;
  text: string;
  commitId: string;
  messageId: string;
  variantId: string;
  contentHash: string;
}

/** The player's own description of their character. alt: another reading of the same Persona the host may give (so a
 *  game read one way is not taken for a changed Persona after a host setting changes it). source: the host's label for
 *  where the text came from (SillyTavern: the standard Persona, or Persona Library's core text). */
export interface Persona { name: string; description: string; alt?: string; source?: 'standard_persona' | 'persona_core' }

/** Lore entries the host keeps (SillyTavern: World Info lorebooks), read as background for the Persona and checked
 *  against this game's world. */
export interface LorePort {
  /** Every active entry. */
  entries(): Promise<import('./lore').LoreEntry[]>;
  /** Whether the host applies this game's rewritten entries (CanonEngine.loreScan) in its own lore scan; otherwise the
   *  GM is told them. */
  readonly appliesOverrides: boolean;
}

export interface HostPort {
  /** The conversation's id; null when none is open. */
  chatId(): string | null;
  /** A conversation with several characters at once (not supported: the engine stays off there). */
  isGroup(): boolean;
  /** A token that changes when the conversation is replaced or branched under the same id (SillyTavern: the chat's
   *  integrity slug); a changed token starts a new branch identity. */
  integrity(): string | null;
  /** Current selected transcript with stable identities (assigns missing ids in memory). */
  readTranscript(): SourceEntry[];
  /** Compute the content hash the host would assign to an assistant message with this text. */
  hashAssistant(text: string): string;
  getCampaign(): CampaignData | null;
  setCampaign(data: CampaignData | null): void;
  /** Persist chat + metadata; must throw on failure. */
  save(): Promise<void>;
  /** Publish an accepted reply through the host's own reply lifecycle (a new reply, an alternative to the last one
   *  — SillyTavern: a swipe — or a continuation); returns after the host's own events ran. */
  publish(req: PublishRequest, interp: Interpretation): Promise<void>;
  /** Restore the host's prior reply captured before a failed/cancelled regenerate/alternative. */
  restorePrior(op: OpType, prior: unknown): Promise<void>;
  /** False when another instance (SillyTavern: another tab of this browser profile) owns the campaign (read-only here). */
  isWriter?(): boolean;
  /** Wait until the host's own UI transitions (e.g. an alternative-reply animation or revert) have settled. */
  settle?(): Promise<void>;
  /** The active Persona, as the host reads it. */
  persona(): Persona;
  /** Lore entries active in this conversation, when the host has any. */
  lore?: LorePort;
  sceneTracker: SceneTrackerPort | null;
  /** Where packs are kept outside the chat (ST: the pack library in the user's files). Without it the pack is kept
   *  in the chat. load: the pack text by file, else any stored copy with that hash; null when there is none. */
  packStore?: {
    save(text: string, meta: { title: string; packId: string; version: string; hash: string }): Promise<{ file: string }>;
    load(ref: { hash: string; file?: string }): Promise<string | null>;
  };
  model: ModelPort;
  /** Wall clock for diagnostics only. Never story time. */
  now(): number;
  log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, data?: unknown): void;
}
