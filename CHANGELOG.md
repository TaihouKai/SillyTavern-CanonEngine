# Changelog

## 1.3.39 — 2026-10-17

- **关注 (focus):** SOFT/FREE events that have not happened yet get a ☆ 关注 button in 本局历史 (focused events show ★). From 24 hours before a focused event's window until it ends (while it can still happen), the GM is asked to give the player character natural in-world chances to be present or involved when it starts — an invitation, news, an errand or a chance meeting — without forcing its course or result, acting for the player, or ignoring a decline. When the planner runs for HARD anchors it may add up to 2 non-binding steps that create such a chance (no extra model calls).
- Tests FO1-FO3; graph buttons (关注, 强制完成, 撤销) checked in a real browser.

## 1.3.38 — 2026-10-17

- **Story time follows Horae (live finding):** the clock only moved when a reply stated a time ("两小时后", "傍晚"), because the reviewer was told not to invent minutes; Horae, which estimates time every turn, ran hours ahead. Now, with Horae installed and up to date, each new reply starts no earlier than Horae's story time at the end of the previous reply (new setting 故事时间跟随 Horae, default on; ignored for swipes/regenerations/continuations, when Horae is busy or stale, without a calendar date, when Horae is behind, or more than 3 days ahead).
- The reviewer now estimates how long each reply realistically takes (a short exchange minutes, a meal 30-60 minutes, travel by distance) instead of keeping the time unchanged when no time is stated; explicit times in the text still win.
- Tests H01-H03.

## 1.3.37 — 2026-10-17

- Turn timing tooltip: small automatic fixes (a malformed field set to empty, the rest of the model output kept, no extra call) are listed in their own section, grouped by kind with a count (e.g. `evaluate: set occurrences/#/time to null … ×5`), and marked as safe to ignore. Resent outputs and dropped items stay under model output problems.
- Test T01.

## 1.3.36 — 2026-10-17

- Fix (live finding): a reply was rejected because it moved a character whose location a far-future HARD event later requires (上条 outside a restaurant on 9/19 vs. 新入生 on 10/31 requiring him in 学园都市). A reply now pre-empts a HARD event only when it establishes that event's exact required value, as a change, while the event is near (one of the next two pending HARD events, or within 2 days). Other values of the same fact are ordinary story.
- Fix: planner steps may set an intermediate state before an anchor's deadline (e.g. 木原幻生 deceived before his plan fails); only a step serving the anchor or still running at its deadline can contradict its outcome. A planner that forgets to list an anchor in protected_anchor_ids is corrected instead of rejected.
- Tests C17g and an intermediate-state plan check.

## 1.3.35 — 2026-10-17

- **强制完成 (force complete):** clicking a canon event in 本局历史 shows a red button under its description (click twice to confirm). The event is recorded as happened along its original route, with its effects and HARD outcomes; later events that depend on it see it as happened, and the plan is rechecked on the next turn. Forced events show 撤销强制完成 to undo it. The record is kept with the chat and replayed after the message that was last when you pressed it.
- **Where other characters stand:** the GM gets, as background only, the starting situation (起因) of non-HARD original events of the next 24 hours, i.e. what those characters know, want and are doing now, so nobody notices or pursues something earlier than they would. It is explicitly not a list of things that must happen, and the GM is told not to steer toward them. The planner gets the same list so its HARD steps do not make anyone act on knowledge they would not have yet, and prefers routes out of public view when a HARD outcome is secret.
- Unit tests F01–F04, U01–U02.

## 1.3.4 — 2026-10-15

- **Turn timings:** after each turn the status bar shows how long each step took (e.g. `上一回合 1m12s：生成回复 48s · 核对一致性 12s · …`), sorted by time; catch-up examination of older messages is reported separately.
- **Public clock API for other extensions:** `window.CanonEngine.api.getClock()` returns `{ active, packId, tick, tickHi, precision, day, minute, date: "YYYY/MM/DD"|null, time: "HH:MM", weekday, label }`, and a `canon-engine:clock` event fires on `document` whenever it changes. Read-only.
- Fix: an idle status bar no longer shows a stale Cancel button.
- Integration section S12 (K01–K04).

## 1.3.3 — 2026-10-15

- Analysis output budget scales with the analyzed text (extract/discover/review: 4k–16k tokens) instead of a fixed 4096, so long GM replies are not cut off mid-JSON.
- A reply cut off at the length limit is retried with a doubled budget and a brevity request (previously retried at the same budget).
- "No parseable JSON" errors include the reply length, whether it was cut off, and its last characters.

## 1.3.2 — 2026-10-15

- **Extra request parameters for analysis** (`taskExtraBody`, YAML): ST builds profile requests from the active chat settings plus the profile's preset, so a profile's "Include Body Parameters" (e.g. Venice `disable_thinking`) could silently come from the story connection instead. The engine now sends these parameters itself with every analysis request (P05).
- Saved old default `taskTimeoutMs` 180 s is upgraded to 300 s (now a per-call limit).
- Timeout errors name the connection and model that was used.

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
