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
  /** summary: the event as text (a structured summary is rendered into it at import); sections: the structured
   *  summary itself (null for an older pack that gives plain text). */
  id: Id; title: string; summary: string; sections?: import('./summary').EventSummary | null;
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
  /** Who is at the event and from when (fixed story times inside its window): the GM brings each one in at that time. */
  cast?: CastMember[];
}
export interface CastMember { entity_id: Id; at: PackTime; role: string }
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
  | 'configuration_revision'
  | 'persona_seed'
  | 'engagement'
  | 'world_contact';

/** What a player decision or a contact is about. event/arc: pack ids; faction: an organization entity id;
 *  contact: a world_contact record id; storyline: a free label (out-of-character "stop this line"). */
export type ScopeKind = 'event' | 'arc' | 'faction' | 'contact' | 'storyline';

/** The player's stance on being drawn into something (narrative integration). Recorded from the player's own
 *  words or clear voluntary actions, or from an explicit UI action. */
export interface EngagementInfo {
  scopeKind: ScopeKind;
  scopeRef: string;
  scopeLabel: string;
  /** declined: stop pulling me in; deferred: not now (until, when the player named a time); accepted: agreed;
   *  joined: clearly took part in the thing itself by their own action; limited: one act within it (rescued one
   *  person and left) — no acceptance of the rest; ooc_suppress: out of character, stop building this line;
   *  reopened: explicitly allows contact again (player's words or UI). */
  stance: 'declined' | 'deferred' | 'accepted' | 'joined' | 'limited' | 'ooc_suppress' | 'reopened';
  quote: string;
  until?: number | null;
  source: 'player_message' | 'ui';
  /** 强烈拒绝: the player made this refusal binding (UI). Without it a declined/deferred stance is a wish the GM
   *  should respect, not something the reviewer sends replies back for; an out-of-character stop is always binding. */
  strong?: boolean;
}

/** A contact from the world that actually reached the player in an accepted reply. */
export interface ContactInfo {
  scopeKind: ScopeKind;
  scopeRef: string;
  scopeLabel: string;
  /** The suggestion this carried out, when it came from one (cache id; may no longer exist). */
  opportunityId: string | null;
  contactKind: 'invitation' | 'request' | 'information' | 'probe' | 'hostile' | 'consequence' | 'encounter';
  actors: Id[];
  quote: string;
  /** A small job for a quiet day: it lapses at `expires` (the start of the next day) unless the player took it. */
  sideJob?: boolean;
  expires?: number | null;
  /** What the small matter asked (from the suggestion the GM carried out). */
  job?: string;
}

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
  /** After story: a later development of a canonical event that already has its result (merged by 重新分析). */
  afterOf?: Id;
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
  /** kind engagement: the player's decision. */
  engagement?: EngagementInfo;
  /** kind world_contact: a contact that reached the player. */
  contact?: ContactInfo;
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
