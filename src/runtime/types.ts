// Runtime persistent types. Documented in docs/RUNTIME_SCHEMAS.md.
import type { CanonPack, FactDelta, FactValue, Id, LedgerRecord, StoryTime } from '../domain/types';

export const STORAGE_VERSION = 1;
export const ENGINE_VERSION = '1.3.4';
/** Release version shown to users (kept equal to package.json/manifest.json by a unit test). */
export const ENGINE_RELEASE = '1.3.23';

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
export interface PlayerAction { quote: string; authorizedBy: { messageId: string; quote: string } | null }

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
}

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
