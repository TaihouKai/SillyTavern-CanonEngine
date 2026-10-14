# Changelog

## 1.3.1 — 2026-10-15

- Timeouts apply to **each model call** (`taskTimeoutMs`) instead of a whole check with all its retries, and an expired call is really aborted (profile requests via their signal, `generateRaw` via ST's stop event), so a hung request no longer blocks the calls queued behind it. Planner and offscreen adjudication calls now have a timeout too.
- Progress in the status bar: which message a reconcile is examining (`Examining message 3/12 (GM) · checking consistency`) and the current step during planning/validation.
- Background reconciles (chat load, edits) can be cancelled from the status bar.
- Integration section S11 (T01–T04).

## 1.3.0 — 2026-10-15

- **Analysis connection:** internal analysis tasks can use a separate SillyTavern Connection Profile (fast/cheap model) while the GM's story replies stay on the chat's connection. Uses ST's `ConnectionManagerRequestService`; temperature override applies to the profile request; a missing profile stops the turn with an actionable error. Integration section S10 (P01–P04).
- Attachments read via `extra.files` (no deprecated-getter console trace).

## 1.2.0 — 2026-10-15

First live-model testing (Venice; see docs/TEST_REPORT.md). Fixes for real-model behavior:
- Prompt SHAPEs list every enum's allowed values (generated from the runtime schemas); retry feedback names the offending value and the allowed ones.
- Structured-output repair: case/synonym enum slips, scalars in nullable-object fields, free-text items in `intended_effects`, extra nested fields (unknown top-level fields are still rejected).
- No false conflicts: free-text predicate values are never compared deterministically; "unsupported" blocks only claims about past events/causes; the reviewer is told that preparations for a future event do not mean it started.
- Discover skips scenery no record could contradict (3× smaller outputs on real models).
- Planner: steps only for near-horizon anchors (max 8); an invalid/truncated plan no longer blocks the reply (provider failures remain operational errors).
- Internal tasks run at temperature ≤ `taskTemperature` (default 0.2) without changing the story temperature; task timeout 300 s.

## 1.1.4 — 2026-10-14

- Enabling requires an open chat; with no chat open the drawer says so and nothing is written to SillyTavern's placeholder metadata.
- Empty model replies ("No message generated": reasoning models exhausting the budget, content filters) are retried with a doubled response budget (up to 16k, 3 tries) and then reported with likely causes.

## 1.1.3 — 2026-10-14

- Save failures now report the cause: the HTTP status of SillyTavern's save request (e.g. 413 from a reverse proxy, integrity conflict, expired session), skipped saves, and what the server returned on read-back, with a matching hint.
- Saves retry with growing back-off (~10 s) when SillyTavern skips a save because another save is still running.
- Binding wizard: the day-0 field is labelled as the pack's calendar anchor and asks for confirmation when changed.

## 1.1.2 — 2026-10-14

- Binding wizard pre-fills the day-0 display date from the pack's `calendar.origin_label` (when it contains a date) and defaults the start to day 0 08:00 instead of the coverage start; event and start labels use calendar dates.

## 1.1.1 — 2026-10-14

- Fix: choosing a file after clicking **为此对话启用** did nothing in a real browser (the drawer re-rendered while the file dialog was open and detached the file input). The input now lives outside the re-rendered drawer; the UI test drives the real click → file dialog path.
- Pack library: valid imported packs are saved to the ST user files folder and can be chosen from a list for new chats (enable) or bound chats (update).

## 1.1.0 — 2026-10-14

- History graph panel (top-bar button): canonical pack graph and the current playthrough's actual history (statuses, runtime events, actual causal links), time-ordered swim lanes, pan/zoom, search, arc filter, details pane; future events hidden unless spoilers are enabled.

## 1.0.1 — 2026-10-14

- Refuse drafts whose final prompt lost the engine context (ST trims injections that exceed the context size) with an actionable capacity error.
- Operational errors now persist across rebuilds until Retry or a successful turn.
- Wizard accepts a calendar start date (`YYYY-MM-DD HH:MM`) relative to the day-0 display date.
- Context packet shows history/state dates in calendar form when a day-0 date is bound; Chinese packs get Chinese auto-generated account text.

## 1.0.0 — 2026-10-14

First implementation of the Canon Engine v1 handoff (revision 1.1, pack schema 1.0.0).

- Pack loading: JSON Schema 2020-12 (precompiled, no runtime code generation) + full semantic lint; World Info files rejected with a specific error; `dist/canon-lint.mjs` CLI for authors.
- Deterministic core: relative-day ticks with uncertainty, pure idempotent reducer (occurrences separate from fluents, UNKNOWN for missing facts), crossed-interval scheduling, default adjudication, bootstrap through the start point.
- Actual-history retrieval by causality OR mention, independent entity/scene state with containment, whole-draft discovery with a deterministic floor, fresh lookup for the evaluator and every repair, content-bound coverage manifests.
- Deterministic gate: evidence quotes, typed references, time, HARD invariants (exact outcomes, bounds, no pre-set outcome facts, crossed deadlines), player agency, checkpoint-correct state claims, self-validating changes, leakage of engine labels, plan enactment.
- Planner with forced-convergence control, offscreen adjudicator, impact assessment, spoiler-free major-deviation banners.
- Source reconciliation for edits/deletions of both roles at any position, swipes, regenerate, continue, branches, renames, reload, backup import; retained-suffix conflicts preserved and located; request fences on every model result.
- ST adapter for 1.19.0: managed private generation (interceptor + quiet draft + native `saveReply`), isolated internal tasks, prompt-scoped engine context, journaled commits, verified serialized saves; Horae read-only freshness barrier, supported re-analysis and stale-memory exclusion; single-writer tab lock; group-chat guard.
- UI: status bar, settings drawer, binding wizard, inspector with spoiler toggle and debug views, conflict markers, Chinese/English.
- Tests: 110 unit/acceptance tests; 59-check real ST/Horae integration suite; 10-check UI-only story session.
