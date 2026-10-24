// Runtime persistent types. Documented in docs/RUNTIME_SCHEMAS.md.
import type { CanonPack, FactDelta, FactValue, Id, LedgerRecord, StoryTime } from '../domain/types';

export const STORAGE_VERSION = 1;
export const ENGINE_VERSION = '1.3.4';
/** Release version shown to users (kept equal to package.json/manifest.json by a unit test). */
export const ENGINE_RELEASE = '1.13.5';

export type RecordDraft = Omit<LedgerRecord, 'sequence' | 'branchId' | 'commitId'>;

export interface SourceEntry {
  index: number;
  messageId: string;
  variantId: string;
  contentHash: string;
  role: 'user' | 'gm' | 'system';
  name: string;
  text: string;
}

export interface Intent { quote: string; summary: string }
export interface StateClaim { entity_id: Id; predicate: Id; value: FactValue; quote: string }
export interface PlayerAction { quote: string; authorizedBy: { messageId: string; quote: string } | null; /** Kind of act (settings: what the GM may write for the player). */ category?: string | null }

export interface Banner { severity: 'major'; text: string; commitId: string; reason: string }

/** Persisted interpretation of one message variant (keyed by messageId:variantId:contentHash). */
export interface Interpretation {
  key: string;
  messageId: string;
  variantId: string;
  contentHash: string;
  role: 'user' | 'gm';
  commitId: string;
  createdAt: number; // diagnostics only (never story time)
  origin: 'engine_commit' | 'extraction' | 'bootstrap_import' | 'retained_reeval';
  records: RecordDraft[];
  intents: Intent[];
  /** Player message: the story time it explicitly jumps to (time_proposal with a computable time), if later than now. */
  timeJumpTo?: number;
  stateClaims: StateClaim[];
  playerActions: PlayerAction[];
  /** Message ids (with hashes) whose content this interpretation depended on. */
  dependsOn: { messageId: string; contentHash: string }[];
  sceneEnd: StoryTime | null;
  flashback: boolean;
  /** Ids of scene entities depicted (for the next turn's scene scope). */
  sceneEntities: Id[];
  /** Deterministic offscreen adjudications committed with this message: eventId -> precondition basis. */
  offscreenBasis: { eventId: Id; precondition: string; mode: 'deterministic' | 'model' }[];
  banner?: Banner;
  manifestId?: string;
  warnings: string[];
  /** Out-of-character configuration requests detected in user text (never applied automatically). */
  configRequests?: string[];
  /** Hash of the prefix state this interpretation was validated against. */
  basisStateHash?: string;
  /** Set when this message cannot follow its (new) prefix: an editorial conflict, not a diegetic event. */
  conflict?: { reason: string; quote?: string };
  /** Participation opportunities declined (event ids) - mirrored in records. */
  declines?: string[];
}

export interface PlanStep {
  step_id: string;
  actors: Id[];
  targets: Id[];
  earliest: number;
  latest: number;
  prerequisites: string[];
  action: string;
  intended_effects: { entity_id: Id; predicate: Id; value: FactValue }[];
  visibility: 'public' | 'restricted' | 'secret';
  knowers: Id[];
  depends_on: string[];
  means: 'ordinary' | 'extraordinary';
  serves_anchor: Id | null;
  status: 'proposed' | 'ready' | 'enacted' | 'invalidated';
  enactedBy?: string;
}

export interface PlanRevision {
  planId: string;
  worldRevision: number;
  sourcePrefixHash: string;
  mode: 'NORMAL' | 'FORCED_CONVERGENCE';
  protectedAnchorIds: Id[];
  assumptions: { text: string; fact: { entity_id: Id; predicate: Id; value: FactValue } | null }[];
  rationale: string;
  risks: string[];
  steps: PlanStep[];
  inadequacyNote: string;
  createdAtRevision: number;
  status: 'active' | 'stale' | 'superseded';
  /** Truth values of protected anchors' original prerequisites when the plan was made. */
  preconditionSignature?: string;
  /** Hash of the player context the plan was made with (profile revision, the player's decisions, their lasting
   *  state): a plan made for an older player is replanned (P0 of narrative integration). */
  playerContextHash?: string;
}

export interface CoverageEntry {
  refId: string;
  quote: string;
  kind: string;
  assertion: string;
  resolved: { entityIds: Id[]; occurrenceIds: string[]; packEventIds: Id[] };
  disposition: 'resolved' | 'ambiguous' | 'new' | 'unresolved';
  triggers: ('causal' | 'mentioned' | 'scene')[];
  lookups: { occurrenceIds: string[]; entityIds: Id[]; canonEventIds: Id[]; unknowns: string[] };
  checked: boolean;
  verdict?: string;
}

export interface CoverageManifest {
  manifestId: string;
  sessionId: string;
  branchId: string;
  revision: number;
  sourcePrefixHash: string;
  packHash: string;
  operationId: string;
  candidateHash: string;
  sceneCheckpoint: StoryTime;
  overlayHash: string;
  entries: CoverageEntry[];
  suppliedContextHash: string;
  complete: boolean;
  gaps: string[];
  attempt: number;
}

export interface RecoveryState {
  status: 'ok' | 'conflict' | 'error' | 'unsaved' | 'stale_memory';
  messageId?: string;
  messageIndex?: number;
  reason?: string;
  quote?: string;
  errorKind?: string;
  at?: number;
  /** Full plain-text report of the failed turn (every attempt's problems, resent calls, timing). */
  details?: string;
}

export interface PendingTransaction {
  commitId: string;
  operationId: string;
  predecessorRevision: number;
  sourceFingerprint: string;
  targetHash: string;
  opType: string;
  /** Interpretation for the new GM variant (applied on recovery if the message landed). */
  interpretation: Interpretation;
  priorReply?: unknown;
  phase: 'prepared' | 'published';
}

export interface Binding {
  startTick: number;
  originDate: { y: number; m: number; d: number } | null;
  startLabel: string;
  confirmedAt: number;
  examinedMessages: number;
  unresolved: string[];
  mode: 'new' | 'existing';
}

export interface CampaignData {
  storageVersion: number;
  engineVersion: string;
  enabled: boolean;
  sessionId: string;
  branchId: string;
  parentBranch: string | null;
  chatId: string;
  integrity: string | null;
  packSnapshot: CanonPack;
  packHash: string;
  packVersion: string;
  binding: Binding;
  bootstrapRecords: RecordDraft[];
  revision: number;
  acceptedHead: string | null;
  transcriptFingerprint: string;
  manifest: { messageId: string; variantId: string; contentHash: string; role: string }[];
  interpretations: Record<string, Interpretation[]>;
  /** Active projection (rebuildable); kept for backup/inspection. */
  ledgerRecords: LedgerRecord[];
  planRevisions: PlanRevision[];
  activePlanId: string | null;
  manifests: Record<string, CoverageManifest>;
  pendingTransaction: PendingTransaction | null;
  recoveryState: RecoveryState;
  uiPreferences: { inspectorOpen: boolean; spoilers: boolean };
  configRevisions: { at: number; summary: string }[];
  /** Last durable-save verification token (adapter-owned). */
  saveToken?: string;
  /** Records the player added by hand ("强制完成"), replayed after the message that was last when they were made
   *  (or at the end of the transcript if that message is gone). */
  manualRecords?: ManualRecord[];
  /** Events the player marked 关注 (wants to experience): the GM/planner give the player chances to be there when they start. */
  focusEvents?: string[];
  /** 优先: matters ("event:id", "faction:id"...) the player lets the world bring to them even while another event is
   *  under way. Allowed, never required: the GM may offer such a contact and may also leave it. */
  preferredScopes?: string[];
  /** 整理本局事件: display-only episodes of the player's events for the timeline (never used as history). */
  eventDigest?: EventDigest;
  /** Narrative integration (the world reacts to the player) is part of this campaign: set for chats bound with
   *  1.4.0 or later. Older campaigns keep working without it. */
  integration?: { since: string };
  /** The player's profile read from their Persona, one revision per identity change; each takes effect after
   *  its anchor message (null: from the start). Its runtime entities enter history as a persona_seed record. */
  playerProfiles?: ProfileRevision[];
  /** A Persona the player chose to keep out of this game (hash): no "identity changed" prompt for it. */
  personaKeptHash?: string;
  /** Derived, rebuildable cache of the narrative-integration analysis (never history). */
  integrationCache?: IntegrationCache;
}

export interface PlayerProfile {
  personaName: string;
  /** The Persona text the profile was read from (standard Persona description). */
  personaText: string;
  personaHash: string;
  /** Lorebook entries read as background with the Persona (titles; "(related)" for one hop further). */
  lore?: string[];
  /** persona_core: Persona Library's core text, its Additional Sections ignored (setting). */
  source: 'standard_persona' | 'persona_core';
  playerId: Id;
  summary: string;
  publicIdentity: string;
  affiliations: { entityId: Id; name: string; role: string; secrecy: 'public' | 'restricted' | 'secret' }[];
  places: { entityId: Id; name: string; use: string }[];
  capabilities: string[];
  resources: string[];
  goals: string[];
  /** The parts of the player's life from the Persona (occupation, organization, school, family, part-time job…):
   *  what each brings them and from whom. Missing on profiles read before 1.13.0. */
  roles?: { role: string; brings: string[]; from: string[]; style: string }[];
  /** Kinds of tasks or matters the player cannot or will not take on. */
  notSuited?: string[];
  relationships: { entityId: Id | null; name: string; relation: string; basis: 'persona_stated' | 'implied' }[];
  /** Who plausibly knows about the player, at which level: that an organization exists, the player's identity or
   *  role, or specific secrets. */
  knowers: { who: string; entityId: Id | null; level: 'exists' | 'identity' | 'secrets'; about: string; basis: 'persona_stated' | 'implied' }[];
  uncertain: string[];
  /** What the controller dropped or changed, and why. */
  notes: string[];
}

export interface ProfileRevision { rev: number; afterMessageId: string | null; profile: PlayerProfile; createdAt: number }

export interface Opportunity {
  id: string;
  scopeKind: import('../domain/types').ScopeKind;
  scopeRef: string;
  scopeLabel: string;
  targetEventId: Id | null;
  kind: import('../domain/types').ContactInfo['contactKind'];
  directImpact: boolean;
  actors: Id[];
  /** A small matter's minor people it introduces, not yet in the world (names; they go into establishes). */
  newcomers?: string[];
  motivation: string;
  knowledge: string;
  contact: string;
  establishes: string[];
  earliest: number | null;
  latest: number | null;
  priority: number;
  focus: boolean;
  basisRefs: string[];
  /** A small job for a quiet day (no canon event for the rest of the day): offered first, changes no history. */
  sideJob?: boolean;
}

export interface IntegrationCache {
  key: string;
  at: number;
  /** Story time the analysis was made at. */
  tick: number;
  opportunities: Opportunity[];
  assessments: { target: string; classification: 'direct_impact' | 'opportunity' | 'no_connection'; reason: string }[];
  dropped: { id: string; reason: string }[];
}

export interface EventDigest { at: number; groups: DigestGroup[] }
export interface DigestGroup { id: string; title: string; summary: string; members: string[] }

export interface ManualRecord { afterMessageId: string | null; record: RecordDraft; at: number }

export interface Fences {
  sessionId: string;
  branchId: string;
  revision: number;
  sourcePrefixHash: string;
  operationId: string;
  packHash: string;
  chatId: string;
  epoch: number;
}

export type OpType = 'normal' | 'regenerate' | 'swipe' | 'continue' | 'rebuild';

export type FactDeltaT = FactDelta;
