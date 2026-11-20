// Authored pack types (schema 1.0.0) and runtime record types.
// Runtime schemas are documented in docs/RUNTIME_SCHEMAS.md.

export type Id = string;
export type FactValue = boolean | number | string | string[];

export interface PackTime { day: number; minute: number }
export interface Fact { entity_id: Id; predicate: Id; value: FactValue }
/** add/remove change a fact by what joins or leaves it, as it stands when the change applies: an entity set gains or
 *  loses those ids (an organization's members); a single value is filled when vacant (add) or emptied when it is that
 *  value (remove) — so a canon change keeps whatever play made of the fact (the player in a canon organization, a
 *  member who left in play, a leader the Persona made). */
export type Effect = { op: 'set'; fact: Fact; until?: Until } | { op: 'unset'; entity_id: Id; predicate: Id } | { op: 'add' | 'remove'; entity_id: Id; predicate: Id; value: FactValue; until?: Until };
/** How long what an effect writes holds. Every effect of a pack says it (the pack lint refuses one that does not):
 *  "lasting" — until a later change of the same fact (a death, joining, a post, knowing something, a lasting injury);
 *  {minutes} — for that long after it happens (being knocked out, a fight's transformation, a short stay somewhere);
 *  {event} — until that event is settled, or its window is over (in hospital until the event that discharges them,
 *  inside a place until the story there ends). When it is over, the fact is what it was before (what lasts). */
export type Until = 'lasting' | { minutes: number } | { event: Id };
/** An outcome is a fact the event results in; op add/remove: those ids join or leave an entity set. */
export interface Outcome extends Fact { op?: 'add' | 'remove' }
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: Fact }
  | { occurred: Id };

/** How well the time of an event is known; the window [earliest, latest] covers exactly that much. "minute": at a
 *  known moment; "range": during a known span; "part_of_day": some time in that part of one day (morning, night);
 *  "day": some time that day; "days": some time within those days; "month", "year": some time within it; "unknown":
 *  no time. Only "minute" and "range" give a time: the others never stand for a moment in the window (the engine
 *  treats them as "some time then"). */
export type WhenPrecision = 'minute' | 'range' | 'part_of_day' | 'day' | 'days' | 'month' | 'year' | 'unknown';
export const EXACT_PRECISIONS: readonly WhenPrecision[] = ['minute', 'range'];
export interface PackWhen {
  earliest: PackTime | null;
  latest: PackTime | null;
  precision: WhenPrecision;
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
  outcomes: Outcome[];
  canonical_effects: Effect[];
  visibility: Visibility;
  participation: { offer: 'when_relevant' | 'never'; hook: string };
  source_refs: Id[]; author_note: string;
  /** Who is at the event and from when (fixed story times inside its window): the GM brings each one in at that time. */
  cast?: CastMember[];
  /** The time frame it happens in (default: the frame of its places, else the main frame). */
  frame_id?: Id;
  /** Set by a builder when something about the event needs a person's decision (its time, an effect's end, an
   *  impact it could not express): the pack lint refuses a pack while any event carries one. */
  review?: string;
}
export interface CastMember { entity_id: Id; at: PackTime; role: string }
export interface PackEntity {
  id: Id; name: string; aliases: string[];
  kind: 'person' | 'organization' | 'place' | 'object' | 'world' | 'other';
  static_description: string; source_refs: Id[];
  /** A place in a time frame (a past era, another world): scenes and events there keep that frame's local time. */
  frame_id?: Id;
  /** 常态: how a person's power, condition or non-human body shows in everyday scenes, in versions (see natureNow). */
  nature?: NatureVersion[];
  /** 思考方式: how the person thinks (see MindProfile). */
  mind?: MindProfile;
  /** 对抗倾向: how the person acts in a confrontation, in versions like 常态 (see CombatStyleVersion). */
  combat_style?: CombatStyleVersion[];
}
/** 对抗倾向: how a person acts in a confrontation, the same five things for anyone in any setting, a sentence each.
 *  What holds toward one person only (a friend whose shocks are play) is part of the two people's relation, not
 *  this. "照常人" says nothing sets them apart. Versions as 常态: the first holds at the start, a later one from its
 *  event. */
export interface CombatStyleVersion {
  from_event: Id | null; until_event?: Id | null; why?: string;
  /** 出手: when they start a fight themselves. */
  start: string;
  /** 下手: how much of their strength they use, whether they kill, when they go all out. */
  force: string;
  /** 应对: what they do when attacked: fight back, dodge, flee, take it. */
  response: string;
  /** 底线: whom or what they would risk their life or give themselves up for. */
  limit: string;
  /** 收手: when they give up, retreat or stop. */
  stop: string;
  /** Written by a model where the sources say nothing (reviewed by a person like the rest). */
  generated?: boolean;
}
/** How a person thinks: how much effort they put into thinking before they act and how well they reason when they do
 *  are separate (a brawler can be sharp and rarely bother). Those who think before they act get their moves planned
 *  each turn they are in the scene (the engine's 角色盘算); the game master plays everyone by it. */
export interface MindProfile {
  deliberation: 'rarely' | 'situational' | 'habitual';
  sharpness: 'plain' | 'sharp' | 'exceptional';
  approach: string; thinks_hard_about?: string; pushed?: string; notices?: string; blind?: string; speaks?: string;
}
/** One version of a 常态. The first (from_event null) holds at the story start; a later one once its from_event has
 *  occurred in the branch, until its until_event has. Written as patterns, never as story. */
export interface NatureVersion {
  from_event: Id | null; until_event?: Id | null; why?: string;
  habits: string; uses: string; others: string; limits: string;
  /** What the power lets them learn that others cannot (how: its conditions); while it reaches the player character,
   *  their secrets are open to it (unless the player turned that off or the Persona shields them). */
  perceives?: { kinds: PerceiveKind[]; how?: string };
}
export const PERCEIVE_KINDS = ['thoughts', 'memories', 'emotions', 'hidden', 'whereabouts', 'lies', 'past'] as const;
export type PerceiveKind = (typeof PERCEIVE_KINDS)[number];
export interface PackPredicate {
  id: Id; description: string;
  value_type: 'boolean' | 'number' | 'string' | 'entity_ref' | 'entity_set';
  allowed_values?: FactValue[];
}
export interface PackEdge { id: Id; from: Id; to: Id; relation: 'enables' | 'motivates' | 'precedes' | 'related'; basis: string; source_refs: Id[]; note: string }
/** A part of the world that keeps its own local time. The story clock is always the main clock; a frame says how
 *  local time reads there: linked (local = `local` at main time `at`, running `rate` local minutes per main minute)
 *  or unlinked (no conversion; `label` says how local time reads). */
export interface PackFrame {
  id: Id; name: string; description: string;
  clock: { kind: 'linked'; at: PackTime; local: string; rate?: number } | { kind: 'unlinked'; label: string };
  notes?: string;
}
export interface PackArc { id: Id; title: string; summary: string; event_ids: Id[] }
export interface CanonPack {
  $schema?: string;
  schema_version: '1.0.0';
  pack_id: Id; pack_version: string; title: string; language: string; description: string;
  calendar: { system: 'relative_day'; origin_label: string; day_length_minutes: 1440; time_zone_label: string; notes: string; main_frame_name?: string };
  /** Time frames (optional): places that keep their own local time. */
  frames?: PackFrame[];
  coverage: { start: PackTime; end: PackTime; notes: string };
  sources: { id: Id; title: string; locator: string; kind: string; notes: string }[];
  predicates: PackPredicate[];
  entities: PackEntity[];
  initial_state: { at: PackTime; facts: { fact: Fact; source_refs: Id[]; note: string }[] };
  arcs: PackArc[];
  events: PackEvent[];
  edges: PackEdge[];
  /** How two people stand with each other, in stages (see PackRelation). */
  relations?: PackRelation[];
  /** 战斗: what a confrontation is judged by (see PackCombat). Every pack says it, if only that it has none. */
  combat: PackCombat;
}
/** What confrontations in this world are judged by. Either `none` (the story has no fighting worth judging: the
 *  reason) or the rest: `basis`, what the world runs on by default ("real-world physics"), and a graph of nodes —
 *  concepts, rules, abilities, precedents, dangers — joined by links. People, places and objects of the pack link to
 *  nodes (in versions, as 常态); the combat analysis takes what is linked from those in a fight, outward. */
export interface PackCombat {
  none?: string;
  basis?: string;
  nodes?: CombatNode[];
  links?: CombatLink[];
}
export const COMBAT_NODE_KINDS = ['concept', 'rule', 'ability', 'precedent', 'danger'] as const;
export type CombatNodeKind = (typeof COMBAT_NODE_KINDS)[number];
export const DANGER_FREQUENCIES = ['common', 'occasional', 'rare'] as const;
export type DangerFrequency = (typeof DANGER_FREQUENCIES)[number];
export const ABILITY_PARTS = ['principle', 'effect', 'conditions', 'cost', 'limits', 'counters'] as const;
export type AbilityPart = (typeof ABILITY_PARTS)[number];
/** One node. gist: one sentence (what the analysis gets for a node further away); text: the whole of it — a
 *  concept's description, a rule with when it applies, a precedent's result and the reason the story gives.
 *  An ability is told in parts (how it works, what it does, conditions, cost, limits, known ways to beat it), each
 *  with who knows it; a precedent names who fought whom and the event. Nodes are public unless their visibility says
 *  otherwise; a person always knows their own abilities. */
export interface CombatNode {
  id: Id; kind: CombatNodeKind; name: string; gist: string; text: string;
  parts?: { part: AbilityPart; text: string; visibility?: Visibility }[];
  who?: Id[]; event_id?: Id;
  /** A danger: the hours it happens in (from–to, may cross midnight; absent: any time) and how often someone there
   *  then meets it. Linked from the places (or organizations) it belongs to. */
  hours?: { from: string; to: string }; frequency?: DangerFrequency;
  visibility?: Visibility;
  source_refs: Id[];
  /** Written by a model where the sources say nothing (reviewed by a person like the rest). */
  generated?: boolean;
}
/** A link from an entity (person, place, object) or a node to a node, with what it is ("是", "依赖", "克制"). An
 *  entity's links hold in versions: from_event (null or absent: from the start) until until_event; between nodes
 *  they are the setting and always hold. */
export interface CombatLink { from: Id; to: Id; label: string; from_event?: Id | null; until_event?: Id | null }
/** How two people of the story stand with each other in the original story. The stages are in story order; one holds
 *  once its from_event has occurred in the branch (null: from the story start) until the next one does. Before the
 *  first holds they do not know each other. Each stage is the whole relation then (a game can start at any time) and,
 *  after the first, says what changed there (why): in a game where the pair already went otherwise, that change is
 *  applied to the relation the game has instead (WorldIndex.relationsDue). Play changes a relation from there
 *  (RelationChange), for anyone, the player too. */
export interface PackRelation { people: [Id, Id]; stages: RelationStage[]; source_refs: Id[] }
export interface RelationStage { from_event: Id | null; why?: string; bond: string; views: RelationView[]; together?: string }
/** One side of a relation: how `who` addresses the other (address) and regards and treats them (sees). */
export interface RelationView { who: Id; address?: AddressForm[]; sees: string }
/** How often a form of address is used: always — the only one they use for the other; usually — the common one;
 *  sometimes — now and then, in the situation `when` says. */
export type AddressUse = 'always' | 'usually' | 'sometimes';
/** A form by which one side addresses or refers to the other that a reader could not guess from the other's full
 *  name (a nickname, a title, an honorific, an insult, an endearment, the surname or the given name alone). The plain
 *  full name is never one: with no form given, people use the name as the story would. */
export interface AddressForm { term: string; use: AddressUse; when?: string }
/** A change of the forms of address, merged form by form (mergeAddress): a form given replaces the one with the same
 *  term or is added; dropped: the side no longer uses it. */
export interface AddressChange { term: string; use: AddressUse | 'dropped'; when?: string }
/** A change of one side: sees '' leaves it as it is. */
export interface RelationViewChange { who: Id; address?: AddressChange[]; sees: string }

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
  | { op: 'set'; entity_id: Id; predicate: Id; value: FactValue; until?: Until }
  | { op: 'unset'; entity_id: Id; predicate: Id }
  | { op: 'add' | 'remove'; entity_id: Id; predicate: Id; value: FactValue; until?: Until };

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
  | 'world_contact'
  | 'player_tie'
  | 'relation'
  | 'scene_frame'
  | 'combat'
  | 'hostility';

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
   *  reopened: explicitly allows contact again (player's words or UI); done: the player finished the matter (UI). */
  stance: 'declined' | 'deferred' | 'accepted' | 'joined' | 'limited' | 'ooc_suppress' | 'reopened' | 'answered' | 'refused' | 'done';
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

/** What someone knows about the player, changed in play (or by the user in the panel). The Persona gives the start;
 *  these change it from there. */
export interface TieInfo {
  /** An entity id when they are known to this world, else null (matched by name: a group). */
  who: Id | null;
  name: string;
  /** How much they know now and what. */
  level: 'exists' | 'identity' | 'secrets';
  about: string;
  quote: string;
  source: 'play' | 'ui';
  /** ui: the knower is taken out altogether. */
  removed?: boolean;
}

/** A change of a relation between two people: from the Persona (the player's start), from play (the analysis of an
 *  accepted reply), from a settled event of the pack the game worked out (event) or from the user in the panel. The
 *  Persona and the panel give the whole relation; play and events are merged into the relation as it stands, part by
 *  part (mergeRelation): the parts they give replace those parts, the rest stays. */
export interface RelationChange {
  people: [Id, Id];
  /** What they are to each other now ('' : unchanged). */
  bond: string;
  views: RelationViewChange[];
  together?: string;
  /** It is over (one of them dead, broken off for good). */
  ended?: boolean;
  /** The relation is taken out altogether (the user in the panel, a Persona revision that no longer has it). */
  removed?: boolean;
  quote: string;
  source: 'persona' | 'play' | 'ui' | 'event';
  /** source event: the pack event whose result this works out, and the record that settled it (a change for a result
   *  since replaced no longer counts). */
  event?: Id;
  eventRecord?: string;
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
  /** Small past a reply invents (backstory) whose time it does not give: some time before `time.hi`, not an event lasting
   *  the whole of `time` (live: "last time we went shopping" shown as D0 00:00 – D61 17:14). */
  undated?: true;
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
  /** kind player_tie: what someone knows about the player, changed. */
  tie?: TieInfo;
  /** Relations as they stand from this record on (kind relation from play or the panel; persona_seed: the player's
   *  relations the Persona gives). */
  relations?: RelationChange[];
  /** kind scene_frame: the time frame the scene is in from now on (MAIN_FRAME for the main frame). */
  frameId?: Id;
  /** 战斗 (any record that changes them; kind combat: the panel): what someone is linked to in the combat graph,
   *  their states, their 对抗倾向, whether a fight is under way, who saw which ability. */
  combatLinks?: CombatLinkChange[];
  statuses?: StatusChange[];
  styles?: StyleChange[];
  fight?: FightChange;
  witnessed?: Witnessed[];
  /** 主动敌对 (any record that changes them; kind hostility: the panel): who holds a grudge against the player, and a
   *  danger of the setting that came to the player at this record's time. */
  grudges?: GrudgeChange[];
  /** Someone the game knew under another name or a description, now named (runtime entities only): the new name
   *  becomes their name, the old one an alias. */
  renames?: { id: Id; name: string }[];
  danger?: { node: Id; place: Id | null };
}

/** Someone who holds a grudge against the player character and means to come for them. comes: the earliest story
 *  time they come (tick). ended: why it is over — avenged (they came: a fight with the player began), reconciled (the
 *  story made peace), ui (the player took it away in the panel). The latest change per holder holds. */
export interface GrudgeChange { holder: Id; why: string; quote: string; comes: number; ended?: 'avenged' | 'reconciled' | 'ui'; source: 'play' | 'ui' }

/** Where a combat change comes from, highest first: the player's own word or the panel (ui), the Persona, play (an
 *  accepted reply, a combat ruling), and last what the combat analysis filled in where nothing said anything (fill),
 *  which never stands against anything above it. */
export type CombatSource = 'ui' | 'persona' | 'play' | 'fill';
/** A link of someone to a combat node as this game changed it (removed: no longer). Over the pack's links. */
export interface CombatLinkChange { entity: Id; node: Id; label: string; removed?: boolean; source: CombatSource; quote?: string }
/** 状态: a state someone is in — hurt, bleeding, elated, carrying something (equipment is a state too) — with a count
 *  where it is counted (令咒 2) and how long it holds (Until; lasting: until it is changed or the player takes it
 *  away). The same text again replaces it; removed takes it away. node: the combat node it brings (holding a sword
 *  brings the sword's abilities). */
export interface StatusChange { entity: Id; text: string; count?: number | null; until?: Until; node?: Id | null; removed?: boolean; source: CombatSource; quote?: string;
  /** A thing at work in the fight the state lasts as long as (a headache from a jamming noise): it ends when that
   *  thing stops or the fight is over. */
  while?: Id }
/** 对抗倾向 as this game set it: the panel, the Persona (the player character), or filled in for someone without one. */
export interface StyleChange { entity: Id; style: Pick<CombatStyleVersion, 'start' | 'force' | 'response' | 'limit' | 'stop'>; source: CombatSource }
/** A fight under way or over, with who is in it. player: the player's message started it; engine: a reply or ruling
 *  found it so; ui: the player's correction in the panel (just the state from then on, no lock). */
export interface FightChange { ongoing: boolean; participants: Id[]; source: 'player' | 'engine' | 'ui'; why?: string;
  /** People of the world the player's message described without naming them: how it called them, and why. */
  identified?: { id: Id; as: string; why: string }[];
  /** Things of the setting at work in the fight (a device, an object used, a field on the place): the walk starts from them too. */
  things?: { node: Id; why: string }[];
  /** Things at work in the fight that stopped (destroyed, switched off, carried off): no longer in it. */
  ended?: Id[] }
/** Who saw an ability (or a part of it) used: they know it from then on. */
export interface Witnessed { node: Id; part?: AbilityPart | null; who: Id[] }

export interface RuntimeEntity {
  id: Id; // rt.<...>
  name: string;
  aliases: string[];
  kind: PackEntity['kind'];
  description: string;
  /** 常态 of a person the story brought in (the player character from the Persona): read like a pack person's. */
  nature?: NatureVersion[];
}

export const UNKNOWN = Symbol('UNKNOWN');
export type Tri = true | false | typeof UNKNOWN;
