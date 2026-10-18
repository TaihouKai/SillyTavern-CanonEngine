# Changelog

## 1.3.52 — 2026-10-18

- **Alert when a reply is ready** (Canon settings → 模型与回复, on by default): when a turn ends while the tab is in the background, a system notification ("Canon：回复完成 · 回复 N字 · 用时 …", or "回合失败" with the reason), "✓ 回复完成" in front of the tab title until you come back, and optionally a short chime. For slow reasoning models (live: 5-minute turns). Browsers allow system notifications only on https or localhost; on a LAN http address the settings say so and the title mark and chime still work. Cancelled turns are not announced.
- e2e N01–N03.

## 1.3.51 — 2026-10-18

- A reply that runs past the reply timeout now says so: "the story model did not finish the reply within 300s (the reply timeout, draftTimeoutMs = 300000)", with the two fixes (lower the story model's reasoning effort, or raise "Reply timeout (ms)" in the advanced settings) and a note that the provider may still bill what it generated (live finding: GLM 5.3 Flash at reasoning_effort high took 303s on one turn and passed the 300s limit on the next; the report only said "model request timed out after 300s").
- Test DT1.

## 1.3.50 — 2026-10-18

- **canon-lint finds temporary conditions nothing ends.** A fact holds until an event changes it, so an injury, a hospital stay or a whereabouts that no later event ends stays true for the rest of the timeline (live finding: 白井黑子 was still "被结标重伤（住院）" when canon has her fighting 警策看取 six days later; the GM spent its thinking reconciling the two every time she appeared, and the reviewer could flag the reply). Pack authors mark such predicates `"transient": true` (optional; existing packs are unchanged) and list settled values (healed, back home, a lasting disability) in `settled_values`; the lint then warns when an event sets one, no later event ever ends it, and the character takes part in later events. On the Toaru pack 1.1.2 it found 13 such conditions.
- Pack schema: optional predicate fields `transient` and `settled_values` (validated against the predicate type). Authoring guide §6 explains them, and why a recovered value is better than `unset` (an absent fact is UNKNOWN, not healthy).
- Test TC01.

## 1.3.49 — 2026-10-18

- The status line no longer shows the previous turn's error while a new turn is running (live finding: "生成中" next to the last turn's "Provider failure: Gateway Timeout", although the new turn was fine and only slow). The error is still shown when the turn fails, and after it until a turn succeeds.
- e2e P06.

## 1.3.48 — 2026-10-18

- **No more "Gateway Timeout" with slow models on custom endpoints:** Canon's draft and analysis requests used to go to the provider unstreamed, so the connection stayed silent until the whole reply (including the model's thinking) was finished, and provider gateways closed it after about 90 seconds (live finding: GLM 5.3 Flash with `reasoning_effort: high` behind a custom endpoint failed with "Provider failure: Gateway Timeout" after 1m32s, while ST's API check — a tiny request — worked). With a custom (OpenAI-compatible) connection they are now streamed to the provider and folded back into one ordinary reply before SillyTavern sees it. Nothing changes in the chat: the draft is still private and appears only after review. The usage chunk is requested (`stream_options.include_usage`) so the token readout keeps working; a provider that refuses the streamed request (4xx) gets the request as before. Other connection types are unchanged.
- Tests SR01–SR04, e2e I09 (updated), I14.

## 1.3.47 — 2026-10-18

- The token readout's hover now splits the total into the story model (drafts and repairs) and the analysis model, since the two usually differ a lot in price. Also in the failed-turn report.
- e2e L06.

## 1.3.46 — 2026-10-18

- **Tokens per turn in the status line:** after the reply length, "消耗 N Token" shows the tokens the provider reported for all of Canon Engine's requests in the turn — story draft, repairs and every analysis call (hover: input / output / number of calls). Other extensions' requests (Horae, Summaryception, …) are not counted. Calls whose response carries no usage are left out and marked with "+". Also in the failed-turn report.
- Tests TK1, e2e L05.

## 1.3.45 — 2026-10-18

- **整理本局事件 (Tidy my events):** a button at the top of the timeline. The analysis model groups your 本局事件 into episodes (consecutive beats of one storyline), one box each with a title and a short summary (live finding: 112 events in two story days drew 40+ purple boxes even with scene grouping on). Display only — history, causes and the GM context are untouched. The engine checks the model's groups (known events only, each once, consecutive in time); anything else stays as it was. The model sees short aliases (e1, e2, …), not occurrence ids. Groups shrink when edits remove their events and disappear below two; events added later show normally until you press the button again; **还原** removes the grouping.
- **Smaller analysis calls (measured on the live campaign):** the registry sent to extraction, discovery and review now lists the entities relevant to the text — those it names, the scene, recent events, the active plan and near HARD outcomes — instead of the whole cast: 259 → 26 entities, about 10.7k → 1.1k characters in each of three calls per turn. Other entities can still be given by exact name (the gate resolves names; a "new" entity with a known name maps to the existing one).
- **The reviewer's copy of the context** no longer repeats what it gets as separate inputs (player input, due HARD events, canon events now) or the GM-only background (canon routes, where others stand, participation hints).
- **Causal history is followed 2 steps back** (3 for an event the text names) instead of to the start of play, so retrieval stops growing with campaign length; nearest causes first.
- README/guide: realistic context sizes, and why SillyTavern's token counter overstates them (double-counted in-chat injections; an OpenAI tokenizer for unrecognised model names — about 1.6× for Chinese with a Qwen model).
- Tests D01–D03, B04, B05.

## 1.3.44 — 2026-10-18

- **The GM context no longer grows with every turn (live finding: a turn failed at 65k characters):** each history record listed *every* later change to the facts it had set, each with its full summary. A fact that changes almost every turn — the player character's location — dragged its whole movement log into every record that had once set it (4,000 characters on one record). A record now shows only the latest change per fact, with a count of the earlier ones; the current values are in the entity-state section anyway. On the live campaign the history section went from 28.4k to 17.7k characters (whole packet 46k → 36k). The compact form also shortens the summaries inside later changes.
- **A repair no longer fails the turn on the context budget:** the repair draft gets the context plus everything the rejected draft mentioned; when that no longer fits, the repair now uses the context that fitted for the first draft (the review's facts still go into the repair instruction) instead of stopping the turn. Shown under small automatic fixes.
- **Scene entities no longer snowball (live finding: 40 "scene" entities every turn):** after each reply the engine stored as its scene everything the review had looked up (causal and parent pulls, and the previous scene) — and that list seeded the next turn's retrieval, which looked up all of it again. Nothing ever dropped out; the list sat at its cap of 40 and pulled every entity's state and causal history into each packet. A reply now stores the reviewer's scene plus what the reply itself names (at most 24), and the draft's review is seeded with the scene, not with every entity in the draft's context.
- **Repetition removed from the GM context:** the per-entity "UNKNOWN: condition, injury, status, …" lines (the same predicate names for every entity) and "No other supported change through …" are now stated once in the section header; a fact's support note is left out when its record is already in ACTUAL HISTORY (it always is when it has an occurrence); KNOWLEDGE BOUNDARIES no longer repeats every restricted record — each record already carries its visibility and knowers; "retrieved because" (an audit label) stays in the coverage manifest. On the live campaign, with the same 40 entities: 46.4k → 23.9k characters (entity state 12.2k → 3.9k, knowledge boundaries 3.0k → 0.3k); fewer entities from the scene fix come on top of that.
- **Registry sent to extract/discover/review as one line per entity** (`id | name | aliases | kind`) instead of JSON objects: 17.4k → 9.8k characters on the Toaru pack, in three or more calls per turn.
- A claim the reviewer labels `kind: "plan"` (an appointment or intention such as "明天早上七点，楼下") is kept as a plan claim instead of being dropped; the prompt says plans are an assertion, not a kind.
- One broken field is fixed and reported once (it was listed once per schema error — four lines for one `time` field).
- Tests B01-B03, T02, W04 (latest change only), W02 updated, a plan-kind enum test; e2e W12 checks the boundary on the record itself.

## 1.3.43 — 2026-10-18

- Docs brought up to date: README, Chinese user guide, compatibility record, architecture, runtime schemas, GM integration rules, acceptance tests, test report and the authoring guide (now including objective fact values, causality/classification, one-beat-per-event and linking rules). No more "v1" wording; the README points to the Chinese guide in Chinese.
- UI and messages no longer say "v1" / "第一版" (group chats: 暂不支持).
- Test fix: the UI story session's scripted impact reply matched an input format that changed in 1.3.30, so the banner checks failed; 12/12 again.

## 1.3.42 — 2026-10-18

- **Scene boxes no longer swallow an afternoon (live finding):** one 本局事件 box held seven beats from leaving a restaurant, a car ride and arriving at Judgment 177 to a raid there (13:00-16:45). A box now holds at most 4 beats within 90 minutes in one place; the reviewer is told that leaving a building, a vehicle ride, arriving elsewhere or a gap over ~30 minutes starts a new box, and the engine enforces the limits even if the reviewer says "continues". Existing over-long boxes are shown split by the same limits.
- **Canon events the player takes part in are recognised:** the reviewer now always gets the non-HARD canon events whose window is open around the scene (canon_events_now) and records a depicted one with its id — "occurred" if its result holds, "diverged" if not — instead of filing it as an ordinary scene beat (the raid on 177 had been filed as a player scene).
- Tests BL1-BL3.

## 1.3.41 — 2026-10-18

- **Happened differently counts as "it happened, judge the rest":** an event that depends on another event having happened (`occurred`) is no longer cancelled automatically when that event happened differently (diverged); whether it still follows, and how, is decided by the model from what actually happened (the adjudicator gets the actual account of the changed prerequisite).
- **Settling SOFT/FREE events after actual play involved their people:** when an event's window closes and its preconditions hold, it used to be recorded along its original route without a model call, even if the story had just changed what its characters know or do (e.g. 美琴 already knowing where 10032 is). Now, if actual play involved the event's people since 2 days before its window, the model judges it from that play (as written, happened differently, or not at all), falling back to the original route if it cannot. Events untouched by play still settle with no model call.
- Tests PA1-PA2; C02 updated.

## 1.3.40 — 2026-10-17

- 关注 is cancelled automatically once the event is settled (happened, happened differently or did not happen) or its window has passed. Test FO4.

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
