// Authored pack types (schema 1.0.0) and runtime record types.
// Runtime schemas are documented in docs/RUNTIME_SCHEMAS.md.

export type Id = string;
export type FactValue = boolean | number | string | string[];

export interface PackTime { day: number; minute: number }
export interface Fact { entity_id: Id; predicate: Id; value: FactValue }
export type Effect = { op: 'set'; fact: Fact } | { op: 'unset'; entity_id: Id; predicate: Id };
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: Fact }
  | { occurred: Id };

export interface PackWhen {
  earliest: PackTime | null;
  latest: PackTime | null;
  precision: 'minute' | 'day' | 'range' | 'unknown';
  label: string;
  basis: 'documented' | 'editorial' | 'unknown';
  notes: string;
}
export interface Visibility { mode: 'public' | 'restricted' | 'secret'; knower_ids: Id[] }
export interface PackEvent {
  id: Id; title: string; summary: string;
  classification: 'HARD' | 'SOFT' | 'FREE';
  required_description: string | null;
  when: PackWhen;
  entity_ids: Id[]; location_ids: Id[]; arc_id: Id | null;
  canonical_preconditions: Condition;
  outcomes: Fact[];
  canonical_effects: Effect[];
  visibility: Visibility;
  participation: { offer: 'when_relevant' | 'never'; hook: string };
  source_refs: Id[]; author_note: string;
}
export interface PackEntity {
  id: Id; name: string; aliases: string[];
  kind: 'person' | 'organization' | 'place' | 'object' | 'world' | 'other';
  static_description: string; source_refs: Id[];
}
export interface PackPredicate {
  id: Id; description: string;
  value_type: 'boolean' | 'number' | 'string' | 'entity_ref' | 'entity_set';
  allowed_values?: FactValue[];
  /** A temporary condition (injury, being held, current whereabouts): lint expects a later event to end it. */
  transient?: boolean;
  /** Values of a transient predicate that are a settled state (healed, back home, a lasting disability). */
  settled_values?: FactValue[];
}
export interface PackEdge { id: Id; from: Id; to: Id; relation: 'enables' | 'motivates' | 'precedes' | 'related'; basis: string; source_refs: Id[]; note: string }
export interface PackArc { id: Id; title: string; summary: string; event_ids: Id[] }
export interface CanonPack {
  $schema?: string;
  schema_version: '1.0.0';
  pack_id: Id; pack_version: string; title: string; language: string; description: string;
  calendar: { system: 'relative_day'; origin_label: string; day_length_minutes: 1440; time_zone_label: string; notes: string };
  coverage: { start: PackTime; end: PackTime; notes: string };
  sources: { id: Id; title: string; locator: string; kind: string; notes: string }[];
  predicates: PackPredicate[];
  entities: PackEntity[];
  initial_state: { at: PackTime; facts: { fact: Fact; source_refs: Id[]; note: string }[] };
  arcs: PackArc[];
  events: PackEvent[];
  edges: PackEdge[];
}

// ---------------------------------------------------------------------------------------------
// Runtime

/** Story time as integer tick bounds with a precision label. lo==hi means a point. */
export interface StoryTime { lo: number; hi: number; precision: 'minute' | 'day' | 'range' | 'approx' }

export interface SourceSpan { quote: string }
export interface SourceRef {
  messageId: string;
  variantId: string;
  contentHash: string;
  spans: SourceSpan[];
}

export type EvidenceKind = 'direct' | 'attempt' | 'quote' | 'hypothetical' | 'dream' | 'belief' | 'outcome' | 'adjudication' | 'bootstrap';

export type FactDelta =
  | { op: 'set'; entity_id: Id; predicate: Id; value: FactValue }
  | { op: 'unset'; entity_id: Id; predicate: Id };

export type RecordKind =
  | 'initial_bootstrap'
  | 'user_assertion'
  | 'enacted_action'
  | 'world_event'
  | 'canon_occurrence'
  | 'canon_disposition'
  | 'authored_intervention'
  | 'time_advance'
  | 'participation_decline'
  | 'runtime_entity'
  | 'configuration_revision';

/** An actual occurrence (something that happened in this branch). */
export interface Occurrence {
  occurrenceId: string;
  title: string;
  /** Concise faithful account of what actually happened and its result. */
  account: string;
  actors: Id[];
  affected: Id[];
  locations: Id[];
  time: StoryTime;
  /** Actual outcome facts established by this occurrence. */
  outcome: FactDelta[];
  /** Supported actual causal links (occurrence ids). Distinct from source dependency. */
  causes: string[];
  /** Reference phrases/aliases by which the occurrence may be mentioned later. */
  refPhrases: string[];
  packEventId?: Id;
  /** A canonical event this beat shows under way whose result is not settled yet (it keeps no disposition). */
  inProgressOf?: Id;
  /** A canonical event the player linked by hand to these story beats (关联本局事件). */
  linkedFrom?: string[];
  /** Scene grouping: the earlier occurrence (same ongoing scene) this one continues; shown and summarized as one box. */
  continues?: string;
  origin: 'player' | 'gm' | 'canon' | 'offscreen' | 'bootstrap' | 'intervention';
  visibility: Visibility;
}

export interface LedgerRecord {
  recordId: string;
  commitId: string;
  branchId: string;
  sequence: number;
  kind: RecordKind;
  storyTime: StoryTime;
  sourceRefs: SourceRef[];
  factsSetOrUnset: FactDelta[];
  eventOccurrenceIds: string[];
  occurrences?: Occurrence[];
  visibility: Visibility;
  summary: string;
  evidenceKind: EvidenceKind;
  /** canon records */
  packEventId?: Id;
  disposition?: 'occurred' | 'diverged' | 'omitted';
  dispositionReason?: string;
  /** Replaces an existing disposition (the player forced the event to complete). */
  override?: boolean;
  adjudicationId?: string;
  triggerCommitId?: string;
  /** For participation declines. */
  declinedEventId?: Id;
  /** Runtime entity definitions created by this record. */
  runtimeEntities?: RuntimeEntity[];
  /** Plan step ids enacted by this record. */
  enactedStepIds?: string[];
}

export interface RuntimeEntity {
  id: Id; // rt.<...>
  name: string;
  aliases: string[];
  kind: PackEntity['kind'];
  description: string;
}

export const UNKNOWN = Symbol('UNKNOWN');
export type Tri = true | false | typeof UNKNOWN;
