# Canon Engine v1 — persistent and model-response schemas

These runtime schemas are separate from the authored pack schema (`schemas/canon-pack.schema.json`, version `1.0.0`, unchanged). Source of truth: `src/runtime/types.ts`, `src/domain/types.ts` and `schemas/runtime/*.schema.json`.

## 1. Where data lives

| Location | Owner | Content |
| --- | --- | --- |
| `chat_metadata.canonEngine` (saved inside the ST chat file) | Canon Engine | The whole campaign: pinned pack snapshot + hash, binding, bootstrap seed, interpretations, active ledger projection, plans, coverage manifests, journal, recovery state, UI preferences |
| `message.extra.canonEngine` (and `swipe_info[i].extra.canonEngine`) | Canon Engine | `{ mid, vid, commitId? }` — opaque message id, variant id, accepting commit |
| `extension_settings.canonEngine` | Canon Engine | Global preferences: limits, timeouts, budget, debug, UI language, default inspector state |
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
| `configRevisions` | Audit of binding/config changes (bind, enable/disable, branch, rename, pack update) |

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

- `kind`: `initial_bootstrap`, `user_assertion`, `enacted_action`, `world_event`, `canon_occurrence`, `canon_disposition`, `authored_intervention`, `time_advance`, `participation_decline`, `runtime_entity`, `configuration_revision`. Models can never create `initial_bootstrap` or configuration records.
- `sourceRefs`: `{ messageId, variantId, contentHash, spans: [{quote}] }`. Quotes are verified verbatim (case-insensitive, whitespace-normalized) against the source text.
- `evidenceKind`: `direct`, `attempt`, `quote`, `hypothetical`, `dream`, `belief`, `outcome`, `adjudication`, `bootstrap`.
- Canon records add `packEventId`, `disposition` (`occurred`/`diverged`/`omitted`), `dispositionReason`, `adjudicationId`, `triggerCommitId` (the time-advance commit that caused an offscreen adjudication).
- `occurrences[]` (`Occurrence`): `occurrenceId`, `title`, faithful `account`, `actors`, `affected`, `locations`, `time`, actual `outcome` deltas, supported actual `causes` (occurrence ids — distinct from source dependency), `refPhrases` (aliases for later mentions), optional `packEventId`, `origin` (`player`/`gm`/`canon`/`offscreen`/`bootstrap`/`intervention`), `visibility`.
- `runtimeEntities[]`: code-assigned ids `rt.<slug>.<random>`; a model can propose names, never ids, and cannot reuse a canonical id or rename a known identity.

The reducer is pure and idempotent (a record id applies once). Occurrences are kept separate from fluent facts; a later reversal changes state but never deletes the occurrence. Missing facts are UNKNOWN.

## 5. Plans

`PlanRevision`: `planId`, `worldRevision`, `sourcePrefixHash`, `mode` (`NORMAL`/`FORCED_CONVERGENCE`), `protectedAnchorIds`, `assumptions` (with optional fact references), `rationale`, `risks`, `steps`, `inadequacyNote`, `status` (`active`/`stale`/`superseded`), `preconditionSignature` (truth values of protected anchors' original prerequisites; a change forces replanning).
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
| `extract_user` | `statements[]` (`asserted_fact` / `attempted_action` / `spoken_dialogue` / `belief` / `hypothetical` / `ooc_config_request` / `time_proposal` / `participation_decline`, verbatim `quote`, typed `facts` only for explicit assertions), `references[]` (direct/indirect/alias/pronoun with candidate ids), `scene_entities` |
| `discover` | `references[]` and `claims[]` over the whole candidate (kind, assertion label narrator/new_event/belief/rumor/lie/hypothetical/flashback/dialogue/plan, temporal scope, optional `expected` typed fact) |
| `evaluate` | `decision` (retain/repair/conflict), `scene_end`, `flashback`, `claim_checks[]` (one per discovered claim), `transitions[]`, `occurrences[]`, `state_claims[]` (optional `at` time for flashbacks), `player_actions[]`, `step_enactments[]`, `new_entities[]`, `violations[]`, `hard_checks[]` |
| `adjudicate` | `adjudications[]`: occurred/diverged/omitted/postponed with time, account, actors, causes, typed effects, reason, `extraordinary` |
| `impact` | changed facts, affected anchors/steps (ids validated), scope local/global/unknown, severity none/minor/major, replan |
| `plan` | rationale, protected anchors, assumptions, risks, mode, steps (see §5), inadequacy note |

Retrieval, coverage and commit decisions are controller-owned; no task depends on provider function calling.
