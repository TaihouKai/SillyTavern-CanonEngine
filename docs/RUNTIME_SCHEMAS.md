# Canon Engine — persistent and model-response schemas

These runtime schemas are separate from the authored pack schema (`schemas/canon-pack.schema.json`, version `1.0.0`, unchanged). Source of truth: `src/runtime/types.ts`, `src/domain/types.ts` and `schemas/runtime/*.schema.json`.

## 1. Where data lives

| Location | Owner | Content |
| --- | --- | --- |
| `chat_metadata.canonEngine` (saved inside the ST chat file) | Canon Engine | The whole campaign: pinned pack snapshot + hash, binding, bootstrap seed, interpretations, active ledger projection, plans, coverage manifests, journal, recovery state, UI preferences |
| `message.extra.canonEngine` (and `swipe_info[i].extra.canonEngine`) | Canon Engine | `{ mid, vid, commitId? }` — opaque message id, variant id, accepting commit |
| `extension_settings.canonEngine` | Canon Engine | Global preferences: analysis connection profile and extra request parameters, reply length, scene grouping, follow Horae time, limits, timeouts, budget, task temperature, debug, UI language, default inspector state |
| `data/<user>/user/files/canon-pack-*.json` | Canon Engine | Pack library (imported packs; each chat still pins its own snapshot) |
| `localStorage["canonEngine.writer.<sessionId>"]` | Canon Engine | Single-writer heartbeat for this browser profile only (not authoritative data) |

Nothing else is written. Unrelated metadata and other extensions' fields are preserved. Because the campaign is inside the chat file, ordinary ST chat backup/export preserves it; browser storage is never the only copy.

## 2. `CampaignData` (`chat_metadata.canonEngine`)

| Field | Meaning |
| --- | --- |
| `storageVersion` (1), `engineVersion` | Format versions; a newer storage version is refused on import |
| `enabled` | Per-chat switch ("Disable for this chat") |
| `sessionId` | Campaign identity, kept across renames and branches |
| `branchId`, `parentBranch` | Editorial branch identity. A native ST branch (new chat id **and** new integrity slug) gets a new `branchId`; a rename (same integrity) keeps it |
| `chatId`, `integrity` | Last seen ST chat file name and integrity slug (rename/branch detection) |
| `packSnapshot`, `packHash`, `packVersion` | Pinned, validated copy of the pack. Hash = SHA-256 of normalized canonical JSON (entity sets sorted). Editing the pack file elsewhere never changes a running campaign |
| `binding` | `startTick`, optional display `originDate` for day 0, `startLabel`, `examinedMessages`, `unresolved`, `mode` (`new`/`existing`) |
| `bootstrapRecords` | Pre-transcript seed: baseline facts + canonical history adjudicated up to the start point + start clock. The first message's rebuild falls back to this, never to an old first-message snapshot |
| `revision` | Increments on every accepted source change / commit |
| `acceptedHead` | Last accepted commit id |
| `transcriptFingerprint`, `manifest` | Ordered source manifest `[{messageId, variantId, contentHash, role}]` and its chained hash. Compared on every event, reload, chat change and before generation/commit |
| `interpretations` | `{ "<mid>:<vid>:<contentHash>": Interpretation[] }` — the per-variant source interpretation cache (see §3). Inactive swipes keep theirs, so switching back needs no model call |
| `ledgerRecords` | Active ledger projection (rebuildable, kept for inspection/backup) |
| `planRevisions`, `activePlanId` | Plan history (§5) |
| `manifests` | Coverage manifests of accepted replies only (last 40) |
| `pendingTransaction` | Commit journal (§6) |
| `recoveryState` | `ok` / `conflict` (editorial, with message id/index and reason) / `error` (with error kind) / `unsaved` (persistence failure) |
| `uiPreferences` | `inspectorOpen`, `spoilers` |
| `configRevisions` | Audit of binding/config changes (bind, enable/disable, branch, rename, pack update, force complete) |
| `manualRecords` | Records the player added by hand (*强制完成*): `{ afterMessageId, record, at }`, replayed after that message (at the end if it is gone) |
| `focusEvents` | Event ids the player marked *关注*; pruned when the event is settled or its window has passed |
| `integration` | `{ since }`: narrative integration is part of this campaign (set for chats bound with 1.4.0 or later; older campaigns keep working without it) |
| `playerProfiles` | `ProfileRevision[]` `{ rev, afterMessageId, profile, createdAt }`: the player's profile read from the Persona, one revision per identity change, in effect after its anchor message (`null`: from the start). `profile`: `personaName`, `personaText` (the standard Persona description it was read from), `personaHash`, `source` (`standard_persona`), `playerId`, `summary`, `publicIdentity`, `affiliations[]`/`places[]` (entity ids: pack ids or `rt.org.*`/`rt.place.*`), `capabilities`, `resources`, `goals`, `relationships[]` (`basis` persona_stated/implied), `knowers[]` (`level` exists/identity/secrets, `basis`), `uncertain`, `notes` (what the controller dropped and why). Its runtime entities enter history through a `persona_seed` manual record |
| `personaKeptHash` | A Persona the player chose to keep out of this game (no "identity changed" prompt for it) |
| `integrationCache` | Derived, rebuildable cache of the integrate task: `key` (hash of everything it depends on), `tick`, checked `opportunities[]`, `assessments[]`, `dropped[]` (with reasons). Never history |

Story time is an integer tick `day * 1440 + minute` (signed day). `StoryTime = { lo, hi, precision }` keeps uncertainty; `lo == hi` is a point.

## 3. `Interpretation` (one message variant)

| Field | Meaning |
| --- | --- |
| `key`, `messageId`, `variantId`, `contentHash`, `role` | Source identity. The content hash covers role, author name, exact text and attachment identity |
| `commitId`, `origin` | `engine_commit` (accepted by a managed operation), `extraction` (existing/edited message), `retained_reeval` (re-checked after an earlier edit) |
| `records` | Ledger record drafts derived from this message (§4) |
| `intents` | Player attempts/dialogue/beliefs (not facts) |
| `stateClaims` | Facts the GM text presupposes (checked deterministically on replay) |
| `playerActions` | Player actions narrated by the GM with the authorizing user quote |
| `dependsOn` | Source dependencies `{messageId, contentHash}` (e.g. the user message a reply answered) |
| `sceneEnd`, `flashback`, `sceneEntities` | Scene end time, flashback framing, depicted entities (next turn's scene scope) |
| `offscreenBasis` | Crossed canonical events adjudicated with this reply and the precondition truth value they assumed |
| `banner` | Spoiler-free major-deviation banner bound to this variant/commit |
| `basisStateHash` | Hash of the prefix state it was validated against (fast replay path; dependencies are still re-checked) |
| `conflict` | Present when the message cannot follow its (edited) prefix: an editorial conflict, never a diegetic event |
| `configRequests`, `declines`, `warnings`, `manifestId` | Out-of-character requests (never applied), participation declines, diagnostics, coverage manifest id |

## 4. Ledger record (`LedgerRecord`)

Required fields: `recordId`, `commitId`, `branchId`, `sequence`, `kind`, `storyTime`, `sourceRefs`, `factsSetOrUnset`, `eventOccurrenceIds`, `visibility`, `summary`, `evidenceKind`.

- `kind`: `initial_bootstrap`, `user_assertion`, `enacted_action`, `world_event`, `canon_occurrence`, `canon_disposition`, `authored_intervention`, `time_advance`, `participation_decline`, `runtime_entity`, `configuration_revision`, `persona_seed`, `engagement`, `world_contact`, `scene_frame`. Models can never create `initial_bootstrap`, configuration or `persona_seed` records.
- Narrative integration: `persona_seed` carries the player's runtime entities (no occurrence; `evidenceKind: bootstrap`). `engagement` (on the player's message, or a manual record from the panel) carries `engagement: { scopeKind (event/arc/faction/contact/storyline), scopeRef, scopeLabel, stance (declined/deferred/accepted/joined/limited/ooc_suppress/reopened), quote, until, source (player_message/ui) }`. `world_contact` (on the GM reply) carries `contact: { scopeKind, scopeRef, scopeLabel, opportunityId, contactKind (invitation/request/information/probe/hostile/consequence/encounter), actors, quote }`. Both live in the interpretation of their message variant, so swipes, edits, deletions and branches replay them like any other record.
- Time frames: `scene_frame` (on the GM reply whose reviewer reported `scene_frame`, or a manual record from 当前时空) carries `frameId` (a pack frame id or `main`). The reducer keeps the latest one as `WorldState.sceneFrame`; like every record it belongs to its message variant, so swipes, edits and deletions replay it.
- `sourceRefs`: `{ messageId, variantId, contentHash, spans: [{quote}] }`. Quotes are verified verbatim (case-insensitive, whitespace-normalized) against the source text.
- `evidenceKind`: `direct`, `attempt`, `quote`, `hypothetical`, `dream`, `belief`, `outcome`, `adjudication`, `bootstrap`.
- Canon records add `packEventId`, `disposition` (`occurred`/`diverged`/`omitted`), `dispositionReason`, `adjudicationId`, `triggerCommitId` (the time-advance commit that caused an offscreen adjudication), and `override` (a forced completion replaces an earlier disposition). For `occurred` preconditions a `diverged` event counts as UNKNOWN (judged by the model), not as false.
- `occurrences[]` (`Occurrence`): `occurrenceId`, `title`, faithful `account`, `actors`, `affected`, `locations`, `time`, actual `outcome` deltas, supported actual `causes` (occurrence ids — distinct from source dependency), `refPhrases` (aliases for later mentions), optional `packEventId`, `origin` (`player`/`gm`/`canon`/`offscreen`/`bootstrap`/`intervention`), `visibility`.
- `runtimeEntities[]`: code-assigned ids `rt.<slug>.<random>`; a model can propose names, never ids, and cannot reuse a canonical id or rename a known identity.

The reducer is pure and idempotent (a record id applies once). Occurrences are kept separate from fluent facts; a later reversal changes state but never deletes the occurrence. Missing facts are UNKNOWN.

## 5. Plans

`PlanRevision`: `planId`, `worldRevision`, `sourcePrefixHash`, `mode` (`NORMAL`/`FORCED_CONVERGENCE`), `protectedAnchorIds`, `assumptions` (with optional fact references), `rationale`, `risks`, `steps`, `inadequacyNote`, `status` (`active`/`stale`/`superseded`), `preconditionSignature` (truth values of protected anchors' original prerequisites; a change forces replanning), `playerContextHash` (profile revision, the player's decisions and the lasting state of the player's own entities; a change forces replanning).
`PlanStep`: `step_id`, `actors`, `targets`, `earliest`, `latest`, `prerequisites`, `action`, `intended_effects`, `visibility`, `knowers`, `depends_on`, `means` (`ordinary`/`extraordinary`), `serves_anchor`, `status` (`proposed`/`ready`/`enacted`/`invalidated`), `enactedBy` (record id). A step is enacted only by a committed record that cites it with evidence.

## 6. Commit journal (`pendingTransaction`)

`{ commitId, operationId, predecessorRevision, sourceFingerprint, targetHash, opType, interpretation, priorReply?, phase }`. Written before native publication; the publish save persists chat + journal atomically (one ST chat file). After the engine delta is saved the journal is cleared. On reload/next reconcile: if a message with the journaled variant id exists, the commit is finalized; otherwise it is discarded (and a regenerate's prior reply is restored). A failed save never reports success; `recoveryState: unsaved` stays until a save succeeds (Retry).

## 7. Coverage manifest

`{ manifestId, sessionId, branchId, revision, sourcePrefixHash, packHash, operationId, candidateHash, sceneCheckpoint, overlayHash, entries[], suppliedContextHash, complete, gaps[], attempt }`. Each entry: discovered reference/claim span, kind, assertion label, resolved ids, disposition (`resolved`/`ambiguous`/`new`/`unresolved`), triggers (`causal`/`mentioned`/`scene`), lookups (occurrences, entities, canon events, explicit UNKNOWNs), checked flag. A candidate is accepted only when the manifest for **its exact content hash** is complete and the deterministic gate has no violation. Rejected attempts' manifests are not stored.

## 8. Request fences

Every model call belongs to an operation with fences `{ sessionId, branchId, revision, sourcePrefixHash, operationId, packHash, chatId, epoch }`. Before using any result and immediately before commit, all fences are compared with the current source; any native edit/delete/swipe/chat switch increments the epoch. AbortController is only an optimization.

## 9. Internal model task contracts (`schemas/runtime/*.schema.json`)

All tasks: one JSON object, `additionalProperties: false` everywhere (extra mutation fields are rejected), at most 2 attempts with the validation error fed back, then an actionable `invalid_model_json` error. Inputs are JSON data marked as untrusted fiction; prompts are in `src/runtime/prompts.ts`. Fixtures: `tests/fixtures/model/`.

| Task | Output (summary) |
| --- | --- |
| `extract_user` | input: the Persona in effect at that message (its profile revision; the live Persona for campaigns without integration) and `engagement_context` (decisions, recent contacts, near events/arcs, organizations); output: `statements[]` (`asserted_fact` / `attempted_action` / `spoken_dialogue` / `belief` / `hypothetical` / `ooc_config_request` / `time_proposal` / `participation_decline` / `engagement` with `stance`, `scope_kind`, `scope_ref`, `scope_label`, `until`; verbatim `quote`, typed `facts` only for explicit assertions), `references[]` (direct/indirect/alias/pronoun with candidate ids), `scene_entities` |
| `discover` | `references[]` and `claims[]` over the whole candidate (kind, assertion label narrator/new_event/belief/rumor/lie/hypothetical/flashback/dialogue/plan, temporal scope, optional `expected` typed fact) |
| `evaluate` | input adds `canon_events_now` (open non-HARD events), `horae_time` (new replies only), `scene_grouping`, and with integration `player_entity`, `engagement` (decisions), `offered_contact`, `recent_contacts`; output adds `contacts[]` (quote, actors, kind, scope, opportunity_id) and may report a violation with code `engagement_pressure`; output: `decision` (retain/repair/conflict), `scene_end`, `flashback`, `claim_checks[]` (one per discovered claim), `transitions[]`, `occurrences[]`, `state_claims[]` (optional `at` time for flashbacks), `player_actions[]`, `step_enactments[]`, `new_entities[]`, `violations[]`, `hard_checks[]` |
| `adjudicate` | input adds `upstream_happened_differently` and `recent_actual_play_with_these_characters` when relevant; output: `adjudications[]`: occurred/diverged/omitted/postponed with time, account, actors, causes, typed effects, reason, `extraordinary` |
| `impact` | changed facts, affected anchors/steps (ids validated), scope local/global/unknown, severity none/minor/major, replan |
| `plan` | input adds `player` (the shared player context: identity, organizations, places, who knows what, lasting state, recent history, decisions — or the Persona's name and text without integration), `player_interests` (*关注*, only without integration) and `others_original_situation` (context only); output: rationale, protected anchors, assumptions, risks, mode, steps (see §5), inadequacy note |
| `profile` | the player's presence read from the standard Persona: `player` (name, aliases, summary, public identity), `affiliations[]`, `places[]` (with `existing_id` for known entities), capabilities, resources, goals, `relationships[]` and `knowers[]` (with `basis` persona_stated/implied and knower `level`), `uncertain` |
| `integrate` | input: the player context, `candidate_events` (near, in window, under way, 关注, the player's connections; with people/cast, status, original conditions now and the player's decision on it), engagement lines, recent contacts, 关注; output: `assessments[]` (direct_impact/opportunity/no_connection with reason) and up to 4 `opportunities[]` (scope, kind, direct_impact, actors, motivation, knowledge, contact, establishes, earliest/latest, priority, basis_refs) |

Retrieval, coverage and commit decisions are controller-owned; no task depends on provider function calling.
