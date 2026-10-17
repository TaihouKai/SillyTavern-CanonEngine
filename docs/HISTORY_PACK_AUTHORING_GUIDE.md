# Canon Engine — history-pack authoring guide

This is the independent input-format specification for an author or coding agent creating a **new history data file**. Read it without needing the earlier design conversation. The companion `schemas/canon-pack.schema.json` is the exact structural contract. `examples/demo.canon.json` is a complete valid example using an invented world.

Documentation revision 1.1 adds actual-history retrieval and persistent-consequence guidance. The file format remains `schema_version: "1.0.0"`; no new fields or lorebook input path are introduced. `examples/unrelated-history.canon.json` is a second complete example with events independent of the main Hard chain.

## 1. Scope and intended workflow

The plugin accepts UTF-8 JSON with the `.canon.json` extension and the schema defined here. It does not accept SillyTavern World Info files, character cards, YAML, CSV, database files, or the user's old history lorebook. There is no lorebook importer or conversion workflow inside the plugin.

The user has arranged to correct the original chronology independently. Treat their corrected reference material as input to a **separate authoring assignment**: read it, select appropriate facts and anchor classifications, then write a new pack from scratch in this format. Do not “repair” chronology again unless separately asked. Do not claim that renaming a lorebook or moving its prose into an `events` array produces a valid pack.

Produce these authoring deliverables: the new `.canon.json`; a validation report; a concise anchor classification list with reasons; a list of unresolved source ambiguities; and, if needed, instructions for keeping temporal claims out of the separately used static setting lore. Do not silently include draft or unknown-time HARD events in a play-ready pack. A pack containing unresolved unknown-time non-Hard entries can retain them as background reference, as described below.

The runtime engine is general-purpose. No Toaru-specific dates, characters, event names, factions, or anchor selections belong in plugin source code. The demo is not Toaru reference material.

## 2. What a pack contains

| Top-level field | Meaning |
| --- | --- |
| `$schema` | Optional local/URI reference for editor assistance; not a fetch instruction |
| `schema_version` | Exactly `1.0.0` for this specification |
| `pack_id` | Stable identity of the authored world/timeline dataset |
| `pack_version` | Three-part numeric version, e.g. `1.2.0` |
| `title`, `language`, `description` | Human-readable identity and content language |
| `calendar` | Relative story-day axis and origin explanation |
| `coverage` | Explicit supported temporal interval, including baseline |
| `sources` | Bibliographic/editorial references that event/entity records cite |
| `predicates` | Typed dictionary of facts the engine can compare |
| `entities` | Stable people, organizations, places, objects and abstract event entities |
| `initial_state` | Baseline facts at the start of covered history |
| `arcs` | Optional grouping of events; use an empty array when unnecessary |
| `events` | Actual canonical event descriptions and their structured fields |
| `edges` | Typed relations between events; use an empty array when unnecessary |

Unknown fields are rejected rather than silently interpreted. Arrays have no inherent chronological meaning. IDs, time bounds, and relations determine order. Keep all IDs stable when rearranging or revising a pack. IDs use lowercase ASCII letters, digits, dot, underscore and hyphen, starting with a letter. Names and prose can be Chinese, Japanese, English, or another language.

## 3. Time: first-class data, not keywords

### 3.1 The canonical coordinate system

The engine uses a simple relative day clock:

```json
{
  "calendar": {
    "system": "relative_day",
    "origin_label": "The reference date chosen in the corrected chronology",
    "day_length_minutes": 1440,
    "time_zone_label": "Story local time",
    "notes": "Explain the origin and any editorial calendar mapping."
  }
}
```

A timestamp is `{"day": 0, "minute": 480}`: day zero, 08:00. `minute` is an integer from 0 to 1439. Days can be negative. The normalized sortable coordinate is `day * 1440 + minute`; negative days work naturally. This does not use real-world Unix time, daylight-saving rules, host timezone, or today's date.

Choose one unambiguous reference day in the corrected chronology. Assign dates by their actual elapsed day differences. Preserve month/year transitions and simultaneous events. If a story does not establish an absolute year, a display year selected for the campaign is a display convention, not a new canon fact. Do not stretch one story year across several years just to make the calendar look more realistic.

The binding stores a mapping between the pack origin and the user's story-calendar display date. An authoring helper may calculate relative days from corrected calendar dates; this is a date utility, not a World Info importer. If ancient dated material cannot be placed relative to an undated main story without inventing a year, preserve its source label as background and provide appropriate supported baseline facts. Do not manufacture a precise offset.

### 3.2 Event time bounds

Every event has:

```json
{
  "when": {
    "earliest": {"day": 10, "minute": 0},
    "latest": {"day": 10, "minute": 1439},
    "precision": "day",
    "label": "Reference year, October 18; time of day not specified",
    "basis": "documented",
    "notes": "Preserve the source's day precision. Do not invent an exact hour."
  }
}
```

`earliest` and `latest` are inclusive occurrence bounds. They describe when the event's defined milestone occurs, not necessarily how long the surrounding activity lasts.

| `precision` | Required meaning |
| --- | --- |
| `minute` | Equal earliest/latest coordinates |
| `day` | One day, minute 0 through 1439 |
| `range` | A finite ordered interval wider than one minute; used for genuine bounded uncertainty or an explicit authored timing choice |
| `unknown` | Both bounds are null; background reference only; cannot be HARD or automatically scheduled |

`basis` is `documented`, `editorial`, or `unknown`. `documented` means the author attributes the bounds to the corrected reference material. `editorial` marks a deliberate authored choice; explain it in `notes`. Unknown bounds use `basis: "unknown"`. The runtime does not widen these bounds on its own.

For a HARD event, resolve finite bounds and required content before use. A day-wide interval is not a new Hard subtype and is not a grace period. It represents the available timing precision. If the author explicitly chooses an exact time, the engine must respect it.

A long event and its completion can be separate ordinary event records. Mark either or both HARD if required. Do not add special start/end anchor classes. Avoid one broad “war” node that vaguely bundles every battle, participant's fate and final outcome into a single unclear requirement.

### 3.3 Coverage and the initial baseline

`coverage.start` and `coverage.end` define where the pack can support scheduled play. `initial_state.at` equals `coverage.start`. Scheduled event bounds must fall within coverage and strictly after the initial baseline checkpoint; a milestone already true at the baseline belongs in baseline facts or a cited bootstrap record, not a duplicate scheduled transition at the same checkpoint.

If play starts later, the engine derives a baseline through the starting time and overlays the actual transcript. Events whose interval contains the start time are pending unless supported as already accomplished. A binding must not silently start before the covered baseline or promise canon after coverage ends. Past coverage, show that canon data has ended and require an explicit choice to continue without further scheduled canon or bind an updated pack. Do not invent missing canon.

## 4. Sources and provenance

Each source has `id`, `title`, `locator`, `kind`, and `notes`. `locator` can be a volume/chapter/page citation, a stable URL, a user-provided corrected reference path with entry IDs, or an editorial record. It need not be publicly downloadable. `kind` is `primary`, `secondary`, `editorial`, or `example`.

Use a precise locator when possible. Distinguish source evidence from your inference. A source reference is not proof the plugin has fetched or verified it. The runtime should not automatically follow URLs in a pack. Never create fake citations, invented volume numbers, or a false claim of official chronology.

Entity and event `source_refs` and edge `source_refs` reference defined source IDs. Pack classification is an editorial game-design decision even when the underlying event is documented canon. Explain a non-obvious classification in `author_note`.

## 5. Entities, fixed descriptions and state

An entity has `id`, `name`, `aliases`, `kind`, `static_description`, and `source_refs`. Allowed kinds: person, organization, place, object, world, other. Use `other` for an event entity such as a particular war whose current status needs facts.

Keep permanent identity and stable setting descriptions separate from mutable history. A character description can name a skill or characteristic; “is dead,” “currently imprisoned,” “has become leader,” “has already learned the secret,” and “possesses the stolen key” belong in temporal facts/events. Even seemingly stable affiliations may be mutable.

Aliases are exact identity aids, not keyword triggers. Preserve useful original-language names and add translated names. Do not use “magic,” “city,” or another extremely broad noun as a character alias. Warn on alias collisions and disambiguate with source/context; do not silently merge identities.

Runtime-created NPCs and interventions are stored under separate runtime IDs with provenance. They do not modify `entities` in the pinned pack, and they must not be mislabeled as original canon. A facts/plan record can reference a validated runtime entity through the runtime registry.

## 6. Predicates and facts

Declare every predicate once. A predicate has `id`, `description`, `value_type`, and optionally `allowed_values`.

| `value_type` | JSON value | Example |
| --- | --- | --- |
| `boolean` | Boolean | `alive: true` |
| `number` | Finite number | `power_level: 4` when that value is actually established |
| `string` | String | `status: "imprisoned"` |
| `entity_ref` | Defined entity ID string | `victor: "union"` |
| `entity_set` | Array of distinct defined entity IDs | `members: ["mira", "ren"]` |

`allowed_values` can constrain a finite vocabulary. Equality for an entity set ignores array order; normalize the set before hashing/comparison. Numbers must be finite; NaN/Infinity are not JSON. Null is not a fact value: an absent fact is UNKNOWN. Use an explicit string enum such as `"none"` only when absence is an established, meaningful state and the predicate type permits it.

A fact is:

```json
{"entity_id": "mira", "predicate": "alive", "value": true}
```

An initial fact wraps that object with `source_refs` and `note`. At most one current value per entity/predicate exists at a checkpoint. New validated transitions replace its current value while preserving prior history. Two different values at the same baseline are an error, not a last-entry-wins rule.

Do not try to model every adjective or every item in the world's inventory. Structure what matters for time, identity, anchor outcomes, dependencies and persistent contradictions. Narrative summaries carry detail, but Hard-defining requirements must also have explicit outcomes where possible.

This includes facts unrelated to any anchor: physical condition of places/objects, life/location of people, custody/ownership, institutional status, access and established knowledge. A past occurrence also remains meaningful after its effects end; do not collapse all history into the final fact values. The runtime retains validated occurrence accounts as well as state projections.

### 6.1 Fact values must be objective

A fact value states what is true in the world, not what some observer knows or believes. The runtime compares Hard outcomes **exactly**, and the reviewer has to decide whether a depicted scene establishes the value; a value that is true for one side and false for another cannot be checked and will be recorded inconsistently.

Never use perspective words as values: “missing / 失踪”, “whereabouts unknown / 下落不明”, “fate unknown / 生死不明”, “disappeared / 不知所踪”, “exposed / 暴露”, “secret / 秘密” as a state, “revealed himself / 公开现身”. Write the state itself:

| Subjective (do not use) | Objective (use) |
| --- | --- |
| `status: "失踪"` (missing to whom?) | `whereabouts: "被秘密带离并藏匿"` — true even for the side that hid her |
| `status: "下落不明"` after a fall into the sea | `whereabouts: "随伯利恒之星坠入北冰洋"` |
| `status: "生死不明"` | the concrete result that happened, e.g. `power: "失去理想放逐"` |
| `status: "暴露魔法师身份"` | a knowledge fact on the knower: `kamijou-touma.knows: "土御门元春是魔法师"` |
| `status: "现身"` | `status: "以本来面目入侵学园都市"` |

Rules:
- Knowledge is a fact **about the knower** (`knows` on the person who knows), never a property of the thing known.
- A location predicate (`whereabouts`) holds a place or a placement, not an outcome such as “rescued”.
- Use each predicate for its declared domain (`condition` is for places and objects, not people).
- The same rule applies to `required_description`: describe what objectively happens (“taken away and hidden”), and put who saw or knew it, or what the public believed, in the summary.
- Summaries may still tell the story from the characters’ side (“对美琴与外界而言就是失踪”); only facts and Hard contracts must be objective.

## 7. Events and the Hard contract

| Event field | Authoring rule |
| --- | --- |
| `id`, `title` | Stable event identity and short human title |
| `summary` | Original event in context, clearly distinguished from current game history |
| `classification` | Exactly HARD, SOFT or FREE |
| `required_description` | Nonempty precise contract for HARD; null for SOFT/FREE |
| `when` | Occurrence bounds and timing provenance |
| `entity_ids`, `location_ids` | Participating/affected entities and places |
| `arc_id` | Defined arc ID or null |
| `canonical_preconditions` | Conditions of the original route; replaceable through alternate planning |
| `outcomes` | Fact values defining the original result; mandatory for HARD, preferences/defaults otherwise |
| `canonical_effects` | Original route's full state changes, including incidental effects |
| `visibility` | Initial information availability, not blanket NPC omniscience |
| `participation` | Whether to offer a relevant in-world player opportunity |
| `source_refs`, `author_note` | Evidence and editorial explanation |

For HARD, **required_description + outcomes + when** are immutable runtime requirements. The title, summary, and original-route details must not sneak in additional undeclared requirements. The description and structured outcomes must agree. Do not write “a war happens” if the intended fixed event is specifically a war between two named factions ending with a named winner.

At least one outcome fact is required for HARD. The occurrence itself also needs semantic evidence: a planner cannot pre-set `conflict.active=true` and declare that a meaningful war happened. A validator checks the required description against an enacted occurrence and its time.

Example using fictional factions:

```json
{
  "classification": "HARD",
  "required_description": "The armed conflict ends at the specified time with the Union victorious over the Council.",
  "outcomes": [
    {"entity_id": "conflict", "predicate": "active", "value": false},
    {"entity_id": "conflict", "predicate": "victor", "value": "union"}
  ]
}
```

This fixes the milestone and winner. It does not automatically require every original battle, the player's presence, or every original casualty. A beginning and an ending can be separately HARD, without new anchor types.

Outcomes are checkpoint facts, not permanent global invariants. A later explicit event may change state while preserving that the milestone occurred. If an author needs something to be true at a later important time, author that later event too. Do not interpret a day-wide occurrence interval as “this fact must be true throughout the entire day.”

For SOFT and FREE, outcomes define the original result for default-history evaluation. A prevented or changed result can be recorded as diverged/omitted with its actual replacement history; it does not force the original outcome to become true later. In the demo, saving Mira must not cause an unrelated later rerun of the canonical ambush death.

## 8. Conditions, effects and graph relations

### 8.1 Structured condition language

Each condition object has exactly one of these keys:

```json
{"all": []}
```

Always true; no prerequisites.

```json
{"all": [
  {"fact": {"entity_id": "mira", "predicate": "alive", "value": true}},
  {"occurred": "prior-event"}
]}
```

All terms must be true. `any` takes one or more conditions; `not` takes one condition. Conditions can nest. There is no arbitrary script, expression string, callable URL, or freeform evaluation hook.

Use three-valued logic: a known fact equal to the required value is TRUE; a known different value is FALSE; an absent value is UNKNOWN. NOT UNKNOWN is UNKNOWN. ALL is FALSE if any term is false, TRUE if all are true, otherwise UNKNOWN. ANY is TRUE if any term is true, FALSE if all are false, otherwise UNKNOWN. Empty ALL is TRUE. Empty ANY is not allowed.

`occurred` is TRUE only for a validated matching event occurrence. A future or definitively omitted original event is FALSE as an accomplished condition; a historical occurrence with unresolved evidence is UNKNOWN. A merely planned step is not an occurrence. A diverged version that failed the original event's defined result does not satisfy the original `occurred` condition unless the authored event identity/result was in fact achieved; link the actual divergent event separately.

These are **canonical** prerequisites. A HARD event can use a new validated route that does not satisfy its original-route prerequisites. Do not accidentally turn every `occurred` dependency into another Hard Anchor. General physical/world facts still need coherent handling: if the planet no longer exists, a plan must enact restoration or another explicit permitted intervention; merely ignoring that fact is invalid.

### 8.2 Canonical effects

```json
{"op": "set", "fact": {"entity_id": "mira", "predicate": "alive", "value": false}}
```

```json
{"op": "unset", "entity_id": "mira", "predicate": "whereabouts"}
```

`unset` removes known current knowledge of a fact from the state model, returning it to UNKNOWN; it is not an arbitrary undo command. Use it only with an established reason, not to conceal an inconvenient outcome. Runtime deltas must still cite evidence. No event can unset or overwrite its own mandatory outcome at the same logical checkpoint.

Effects are canonical proposals, not unconditional database writes. Validate the actual route and actual consequences before commitment. For the original route, every outcome must be supported by the event's final set effects or an explicit unchanged fact whose truth is validated; the release linter should require a matching final set effect for clarity. Effects on a key must be unambiguous; the engine rejects multiple writes to the same entity/predicate within one event. Alternative routes can have different incidental effects while preserving Hard outcomes.

Once an effect is actualized, it persists until a supported later transition changes/unsets it or a source revision invalidates it. HARD/SOFT/FREE governs whether the event must occur, not how long an enacted consequence is remembered. Do not restore baseline values when an event ends or leaves the active arc. Encode important incidental changes in `canonical_effects` even when they are not Hard-defining `outcomes`. A prose-only description of a persistent contradiction is too weak for the deterministic state checks.

### 8.3 Edges and arcs

Edges connect event IDs and have one relation:

- `enables`: contributes a resource/condition in the original route.
- `motivates`: influences an actor's decision; not physical necessity.
- `precedes`: an authored event-order constraint for the original chronology.
- `related`: relevant association without an ordering or necessity claim.

An edge also has `basis` (documented/inferred/editorial), `source_refs`, and a nonempty explanation in `note`. Do not invent causation just because two events mention the same character or occur consecutively. Sharing a date is not an edge. Disconnected strands and parallel events are valid.

Do not connect an unrelated event to an anchor merely to make it retrievable. The runtime retrieves actual events when causally relevant **OR** mentioned and independently looks up depicted entities. An isolated FREE event can establish a persistent ruin, and its history can be retrieved much later without an edge to the current task.

Validate the `precedes` subgraph for cycles. Do **not** reject every cycle in the entire mixed graph: mutual related/motivational links can exist. Check temporal feasibility of required original ordering and references in conditions. Alternative runtime routes are separate plan edges; they do not edit Graph A. Arcs group events for retrieval/planning but do not force every member to happen.

## 9. Knowledge and participation

Visibility has `mode: "public" | "restricted" | "secret"` and `knower_ids`. For restricted/secret events, list actors initially entitled to the information when supported. An empty secret list means no knowledge holder is established; it does not mean everyone knows. A public event can be publicly observable, but distant NPCs still need plausible information access.

This field is not a promise that the player's UI should reveal the event. The engine may know future or secret material for planning while default UI hides spoilers.

Event secrecy does not conceal physical consequences from someone who can observe them. When one record mixes a secret cause with public effects, explain the distinction in `summary`/`author_note` so adjudication can derive separate runtime fact/knowledge visibility. If they are genuinely separate occurrences, model them separately. Do not add an undocumented per-effect visibility field to the pack. A player may see destroyed buildings without learning the culprit or precise destruction time.

Participation has `offer: "when_relevant" | "never"` and a short `hook`. A hook should suggest an observable opportunity, not force the player's decision. The engine checks time, location, knowledge and a previous refusal. The hook cannot order the player to travel, act, or agree.

## 10. Validation beyond JSON Schema

Implement a linter and run it before distributing a pack. Schema validation is necessary but insufficient.

Release-blocking checks:

1. Duplicate IDs within each ID namespace; broken entity/event/arc/predicate/source references; ambiguous duplicate baseline fact keys.
2. Fact values matching predicate types/enums; entity refs/sets referring to valid entities; location IDs referring to place entities; finite numeric values; set equality normalization.
3. Correct time shapes/precision/basis; ordered finite bounds; coverage and baseline consistency; unknown events excluded from the scheduler and HARD.
4. HARD required description present, outcomes nonempty, agreement between contract/outcomes/effects, no automatic relaxation field.
5. No conflicting writes within an event; each canonical outcome matched by a final canonical set effect; no self-satisfying event prerequisite; unresolved forward dependency in an alleged original route flagged for review.
6. Acyclic explicit precedence; time/order feasibility. Overlapping intervals or shared entities are not by themselves contradictions. Two same-minute transitions can be ordered if their checkpoint semantics are explicit; do not assume concurrency from the timestamp alone.
7. Arc membership consistent in both directions, with an event in at most its declared single arc. An event with `arc_id: null` need not belong to an arc.
8. A meaningful baseline for dependency-critical state; missing optional facts remain unknown. A referenced source object exists even if its external locator cannot be fetched.
9. Demonstrated Hard contradictions reported precisely. Do not claim a general proof of narrative satisfiability from a few graph checks.

Warnings requiring author review: generic aliases, missing evidence detail, many unknown-time events, large unexplained time gaps, mixed time zones, circular motivational chains, temporal claims in static descriptions, duplicate events, incidental details overconstrained as Hard, and promising coverage without relevant events. These are review prompts, not excuses for the runtime to rewrite the source.

For the author's existing franchise references, validate internal consistency against the corrected source supplied for this task. Research new facts only under a separate request. Keep ambiguity explicit instead of inventing dates or asserting certainty.

## 11. Authoring checklist and maintenance

1. Choose a precise origin and coverage; copy the corrected chronology's actual temporal distances.
2. Define entities and aliases, then the small predicate vocabulary needed for meaningful state.
3. Write baseline facts with provenance.
4. Write distinct events. Split a large narrative entry if it contains independently meaningful milestones; do not mechanically create an event per old keyword/index entry.
5. Assign HARD/SOFT/FREE according to the user's intended experience. Runtime importance is not a reason to silently promote a node.
   Keep classification consistent with causality inside the playable period: an event that another SOFT/HARD event cannot happen without (`enables`) is at least SOFT. Never merge an important beat into a trivial FREE event (split it: e.g. a lunch scene stays FREE, the raid that later enables a memory wipe is SOFT). Deep backstory before any realistic campaign start may stay FREE even when it feeds later events — classification only controls how much the engine protects an event from the player.
   One event = one beat with one cause. Do not bundle beats that have different causes or different people just because they happen on the same day or in the same arc ("同一时期…", "同日…", "另一边…", "当晚…"): a lunch scene and a raid, a character's discovery and another character's countermeasure, a HARD event and a side bet made at it. When the story changes one beat, a bundle drags the others along (they are settled or cancelled together). Test: could the player plausibly change one part while the other still happens? If yes, split them and link them. Background sentences that belong to another event go into that event, not here.
   Use `enables` only when B truly cannot happen without A; a reason is `motivates`, mere order is `precedes`. Encode a true necessity of a SOFT/FREE event as a canonical precondition (`occurred`), so that preventing the upstream event omits the downstream one instead of letting it happen anyway. Do not add upstream preconditions to HARD events for this purpose: a HARD event always happens and only its route changes; keep the link.
6. State each Hard contract plainly and encode its outcomes. Keep incidental casualties and routes out of the locked requirements unless intended.
   Check every outcome and effect value (all events, not only Hard ones) against §6.1: no perspective words, knowledge on the knower, each predicate used for its own domain.
7. Add only supported causal/order links and useful arc groups.
   When you split an event or add one, link it in the same change (e.g. the first half of an incident `enables` its climax). Afterwards list the events with no links at all and confirm each one is genuinely standalone.
8. Add visibility/participation information and precise source references.
9. Validate structure and semantics, then test the untouched route plus at least one altered route to each important Hard chain. Also test unrelated persistent consequences and historical mentions after an effect has ended, as described below.
10. Report uncertainties and classification choices in an authoring report. Deliver one new-format pack. The user should not have to edit its JSON to play.

Use semantic versions for pack changes. Preserve IDs when the identity of a source event is unchanged. Change IDs only for genuinely new identities, and provide a mapping/report when reorganizing. Existing campaigns remain pinned to the previous pack snapshot until explicitly rebound.

The plugin implementation must update this guide and schema together if a field changes. Version the format rather than adding undocumented fields. Source annotations and original-world text are reference data, never executable instructions to the extension or permission to modify engine rules.

## 12. Authoring history that remains usable outside its original plot

The runtime retrieval rule is **causally relevant OR directly/indirectly mentioned**. It applies to all actual history, including player/GM additions absent from your pack. Authors supply enough structured and narrative information to distinguish an event's occurrence, its actual outcome and the current state resulting from later events. Do not omit an event solely because it is FREE, offscreen, disconnected from an anchor, or has no lasting effect.

For each meaningful canonical occurrence, write a concise `summary` identifying what happened, the actors and affected entities, time/place where supported, and the result. Declare entities and useful aliases so references such as an event name, former venue name or a character's nickname can resolve. Include supported causal relations; do not invent them to improve retrieval. Historical dialogue, beliefs and source uncertainty must not be presented as confirmed world facts.

For a place destroyed before the player arrives, use existing fields:

```json
{
  "id": "condition",
  "description": "Physical condition of the identified place or object.",
  "value_type": "string",
  "allowed_values": ["intact", "destroyed"]
}
```

Its initial fact can be `{"entity_id":"old-market","predicate":"condition","value":"intact"}` wrapped with the required baseline provenance. The destruction event uses `location_ids: ["old-market"]` and a set effect:

```json
{"op":"set","fact":{"entity_id":"old-market","predicate":"condition","value":"destroyed"}}
```

These are field fragments, not complete packs. The complete event in `examples/unrelated-history.canon.json` includes every required field. Its classification is FREE, `arc_id` is null, and there is no edge connecting it to the conflict anchors. If the original destruction is adjudicated as occurring, its state persists; if play prevents it, the runtime records the actual alternative rather than blindly applying the effect. A later restoration needs another actual event, not an implicit reset.

The same sample includes an archive key loan and return. Its final holder matches the baseline, but both occurrences remain history. If someone mentions the loan afterward, the GM must receive who lent/borrowed the key, what happened and that it was returned. Looking only at the current holder would miss the answer. Player-caused thefts, rescues, promises and other runtime occurrences follow the same principle; do not attempt to pre-author future player choices in the pack.

Structure only supported scope. “Part of the district was damaged” is not evidence that every building was destroyed or every resident killed. Where containment matters, an ordinary declared `entity_ref` predicate can express a known parent place; runtime interpretation still needs evidence about the affected area and exceptions. The engine does not require a full geographic model.

Before handing off an authored pack, check:

- Events with long-lived consequences expose the needed effects, including effects not locked by a Hard contract.
- Current descriptions cannot silently override state with pre-event normality; mutable conditions are absent from `static_description`.
- A disconnected event can be found by affected entity, direct name and a reasonable paraphrase, without a fabricated causal edge.
- A past event remains answerable after a later event reverses its effect.
- Offscreen occurrence, player knowledge and world state are distinct.
- Validation includes both the main narrative and one unrelated-history/scene case. Format validity alone does not prove runtime retrieval works.

## Appendix — implementation tooling

The shipped implementation keeps this guide and `schemas/canon-pack.schema.json` unchanged (pack schema `1.0.0`; no new pack fields). Validate a pack exactly as the extension does — JSON Schema plus every release-blocking semantic check in §10, with author-review warnings — without SillyTavern:

```
node dist/canon-lint.mjs my-world.canon.json          # human-readable report, exit code 1 on errors
node dist/canon-lint.mjs my-world.canon.json --json   # machine-readable report
```

The report lists each event's classification, time label and HARD contract, which can serve as the anchor classification list in the authoring report. The extension shows the same errors (with JSON paths) in its import wizard and never imports an invalid pack.

Implementation notes relevant to authors:
- Containment checks use any declared `entity_ref` predicate whose id/description mentions location/parent/part-of/inside (e.g. `located_in`). A place shown operating inside a parent whose condition value contains "destroy/ruin/collapse/…" is rejected unless the place has its own supported fact.
- Destructive vocabulary for those checks: destroyed, ruined, demolished, collapsed, dead, dissolved, gone, burned (and Chinese equivalents 毁/废/塌/灭/亡/解散). Partial values such as `damaged` do not imply destruction.
- Event `title` and entity names/aliases are used as exact identity aids and reference phrases for later mentions; `summary` becomes the occurrence account when the original route actually occurs.
