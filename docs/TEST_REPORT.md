# Canon Engine — test report

Latest full run: 2026-10-18, engine 1.3.59, pack schema 1.0.0. The acceptance matrix below was first established on 2026-10-14 (engine 1.0.0) and has been re-run with every release since; tests added after 1.0.0 are listed at the end.

## Environment

| Item | Version |
| --- | --- |
| SillyTavern | 1.19.0, `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, unmodified (`C:\Users\agent\st-test`) |
| Horae | fork `TaihouKai/SillyTavern-Horae-Metadata` 1.15.1, metadata mode, vector memory enabled |
| Model adapter family | ST Chat Completion, source `custom` (OpenAI-compatible) → `tests/e2e/mockServer.mjs` |
| Browser automation | Playwright 1.64 / Chromium (headless) |
| Unit runner | vitest 5, Node 24.20 |

All automated suites use deterministic scripted model outputs. They prove the controller, gates, retrieval, persistence and ST/Horae integration — not the narrative judgment of any particular model. Live-model sessions are reported separately below.

## Summary

| Suite | Where it runs | Result |
| --- | --- | --- |
| `tests/unit/*` (217 tests in 23 files): P, C, E, R, W, schema fixtures, invalid-pack variants, structured-output repair, and the later suites listed below | in-process, fake host + scripted model | **217 / 217 pass** |
| `tests/e2e/integration.mjs` (109 checks, sections S1–S21) | real ST 1.19.0 + Horae in Chromium, outgoing requests inspected at the mock | **109 / 109 pass** |
| `tests/e2e/story-session.mjs` (12 checks) | real ST, UI-only: wizard via real file dialog, pack library, composer, banner, swipe arrow, ST edit/delete buttons, reload | **12 / 12 pass** |
| `dist/canon-lint.mjs` | both sample packs valid; World Info file rejected with the specific error | pass |

Reproduce: start ST with this extension installed, `node tests/e2e/mockServer.mjs 5555`, then `npm test`, `node tests/e2e/integration.mjs` (or one section, e.g. `S5`) and `node tests/e2e/story-session.mjs`. Results are written to `tests/e2e/out/*.json`. Stop the servers and browsers afterwards.

## Acceptance matrix

Legend: **U** = unit/in-process (`tests/unit/<file>`), **E** = real ST/Horae integration (`tests/e2e/integration.mjs` section), **S** = UI story session.

### 1. Pack, clock, reducer

| ID | Evidence | Result |
| --- | --- | --- |
| P01 | U pack; E wizard (story) shows 2 Hard events | pass |
| P02 | U pack + schemas (renamed WI JSON → specific error, no converter); CLI | pass |
| P03–P05 | U pack (paths reported, e.g. `/events/0/entity_ids/2 unknown entity`) | pass |
| P06–P11 | U pack (NOT UNKNOWN = UNKNOWN; array reorder invariance; related cycle accepted; precedence cycle blocked; no last-entry-wins; set-order hash) | pass |
| P12 | U pack (day-only Hard can occur during the day, not pending after) | pass |
| P13 | U pack; E S4 (timeskip adjudicates ambush, broadcast, Hard begin in order) | pass |
| P14–P16, P18 | U pack (host TZ change irrelevant; fulfilled occurrence persists; idempotent records; unknown-time never scheduled) | pass |
| P17 | U edits (bind outside coverage refused; advancing past coverage → notice + "coverage ended" in context; no canon invented) | pass |

### 2. Convergence and player control

| ID | Evidence | Result |
| --- | --- | --- |
| C01 | U pack (untouched route), E S4 | pass |
| C02, C03 | U convergence (rescue diverges FREE death; broadcast omitted with reason; HARD begins via model-adjudicated alternate cause; Mira not re-killed) | pass |
| C04 | U convergence (planet destroyed → forced planning authorized directly; restoration is a new intervention event; destruction remains history; Hard content unchanged) | pass |
| C05 | U convergence (reviewer-contradicted prose and wrong winner both rejected) | pass |
| C06, C09 | U convergence (`drop_anchor` schema-rejected; new date, renamed winner, parallel world, missing anchor, unauthorized forced mode, player consent rejected); E S6 (`drop_anchor` in a live evaluate response rejected) | pass |
| C07, C08 | U convergence (planned attack changes no fact; expired unenacted step triggers replanning) | pass |
| C10, C11 | U convergence (opportunity offered within window; decline recorded per branch; no nagging) | pass |
| C12, C13 | U convergence; S story (one spoiler-free banner beside the reply, plugin UI only; minor change → none) | pass |
| C14 | U convergence (secret plan steps never reach extraction; knowledge-boundary labels) — partial: NPC knowledge is enforced by prompt labels + evaluator, not a formal epistemic model | pass (partial) |
| C15 | U convergence (provider failure → operational error, no forced plan, no state change) | pass |
| C16 | U convergence (exactly 1 draft + 2 repairs, then actionable failure; last valid state kept) | pass |
| C17 | U convergence; E S6 | pass |
| C18 | U convergence (draft jumps 2 days → crossed events adjudicated, re-reviewed with staged history, Hard realized) | pass |
| C19, C20 | U convergence (affected distant anchor enters detailed scope; global scope marks plan stale and replans all) | pass |

### 3. Edits and deletions (both roles)

| ID | Evidence | Result |
| --- | --- | --- |
| E01 | U edits (new evidence replaces old; dependent GM message becomes conflict) | pass |
| E02 | U edits; E S7 (no phantom rescue; retained text preserved, conflict located) | pass |
| E03, E05 | U edits | pass |
| E04 | U edits; E S4 (deleting a GM timeskip removes offscreen events and time advance) | pass |
| E06 | U edits; E S4 (content-only edit via ST editor detected by hash) | pass |
| E07 | U edits (bulk middle/suffix delete) | pass |
| E08 | U edits; E S9 (first message edited: rebuild from binding seed; Horae Persona/RPG unchanged) | pass |
| E09–E11 | U edits (wording-only edit silent; independent support survives; a recollection is not evidence) | pass |
| E12, E13 | U edits (incl. deterministic agency-loss conflict); E S7 (frozen advancement; editing the identified reply clears recovery) | pass |
| E14 | U edits; E S7 (native branch → new branchId, parent untouched, fresh suffix) | pass |
| E15, E16 | U convergence (removing a decline restores the opportunity; deleting the warning reply removes its banner) | pass |

### 4. Swipes, branches, races, persistence

| ID | Evidence | Result |
| --- | --- | --- |
| R01 | E S3 (swipe A/B states; switching back restores A with 0 model calls); S story | pass |
| R02, R03 | E S3 (regenerate prompt excludes replaced variants; continue validates whole message, no double count) | pass |
| R04 | U edits (deleted swipe's effects don't transfer to a new swipe at the same index) | pass |
| R05, R06 | U edits; E S7 | pass |
| R07 | E S8 (late result after chat switch discarded) | pass |
| R08 | U edits (edit during plan/draft/discover/evaluate with delayed promises; also with a "missed" event) | pass |
| R09, R10 | U edits | pass |
| R11 | U edits (failed save → `unsaved`, nothing claimed durable, Retry re-saves) | pass |
| R12 | U edits (crash after publish → journal finalized; before publish → discarded) | pass |
| R13 | U edits (backup round trip); E S4 (reload durability) | pass |
| R14 | E S4 (external chat edit detected by manifest before caches are trusted) | pass |
| R15 | E S8 (second tab not writer); U edits (non-writer tab neither saves nor generates) | pass |
| R16 | U edits (snapshot pinned; reviewed update shows Hard contract changes) | pass |
| R17 | U edits; E S3 (cancelled regenerate restores prior reply; no empty message) | pass |

### 5. Real integration proof

| ID | Evidence (E = integration section) | Result |
| --- | --- | --- |
| I01 | S1: outgoing draft contains card, persona, Author's Note, keyword lore, Horae snapshot, engine context | pass |
| I02 | S2: sentinel draft absent from chat, Horae meta, aux analysis, embeddings, next prompt, ledger, manifests | pass |
| I03 | S1: one native publication; Horae analyzed only accepted text | pass |
| I04 | S9: stale Horae after GM edit → reanalysis attempted → excluded from the actual prompt; when Horae recovers, fresh state without the erased item | pass |
| I05 | S9: next turn waits for Horae's in-flight analysis (fresh location in prompt) | pass |
| I06 | S9: binding an existing chat and editing the first message do not reset inventory/Persona/RPG state. Limitation: run without an enabled Horae Persona profile template (code path: Horae's preflight only runs for narrative types; drafts are `quiet`) | pass (partial) |
| I07 | S9: lore claiming a later death cannot override actual alive state; lore never reaches extraction/evaluation | pass |
| I08 | S1: tasks isolated (2 messages, no card/AN/lore/Horae; Persona only as explicit extractor input) | pass |
| I09 | S1: draft request `stream:false` with global streaming on; setting untouched | pass |
| I10 | S4, story: status bar and inspector preference restored after reload | pass |
| I11 | S8: group chat activation refused | pass |
| I12 | S6: missing Horae API → diagnosis, no guessed writes | pass |
| I13 | S6: malformed JSON → bounded retry → actionable error → Retry completes | pass |

### 6. Actual-history retrieval and world state

| ID | Evidence | Result |
| --- | --- | --- |
| W01 | U retrieval (player, GM/NPC and canon origins retrieved causally without mention; paraphrase found by semantic expansion); E S5 (player theft in the next real prompt) | pass |
| W02 | U retrieval (three origins, mention-only trigger labeled) | pass |
| W03 | U retrieval ("the man I rescued", alias 旧市场, ambiguous "Kai" kept ambiguous) | pass |
| W04 | U retrieval (loan + return; player theft + return, paraphrase mapped via catalogue); E S5 | pass |
| W05 | U retrieval; E S5 (offscreen provenance, trigger commit) | pass |
| W06 | U retrieval | pass |
| W07 | U retrieval; E S5 (rejected before publication; evaluator and repair received the destroyed state + record) | pass |
| W08 | U retrieval (accurate draft still loads the record into the final review; false actor repaired) | pass |
| W09 | U retrieval (repair introduces destroyed bridge → rechecked; 3 distinct candidate hashes; manifest bound to attempt 2); E S5 (second anecdote) | pass |
| W10–W13 | U retrieval (implicit contradictions incl. exception; checkpoint-correct flashback; rumor stays belief; restoration vs history) | pass |
| W14, W15 | U retrieval (both roles; offscreen trigger deletion; canon re-adjudicated on a new valid path; backup) | pass |
| W16 | U retrieval (stale evaluation after edit / chat switch never commits) | pass |
| W17, W18 | U retrieval (UNKNOWN explicit; runtime ids; renaming cannot bypass history; containment, partial damage, exception) | pass |
| W19 | U retrieval (all matched records kept in compact mode; optional dropped first; explicit capacity error) | pass |
| W20 | E S5 (real ST, controller-driven retrieval, no function calling, pre-generation and draft-only references, repairs, content-bound manifest) | pass |

## Tests added after 1.0.0 (unit)

| File | IDs | What it proves |
| --- | --- | --- |
| `api-timing` | — | public clock API; turn timings and the failed-turn report |
| `failsoft`, `normalize`, `model-enums`, `fixes` | F, T01 | schema normalization, fail-soft helper tasks, enum repair; small automatic fixes grouped apart from resends |
| `budget` | B01–B04 | compact packet and capacity errors; a repair never fails the turn on the budget; scene entities do not snowball; shared rules stated once; registry limited to relevant entities; reviewer copy without duplicated sections |
| `digest` | D01–D03, B05 | 整理本局事件: checked consecutive groups, display only, undo, groups shrink with edits; causal depth limit |
| `hidden` | — | hidden messages stay story history |
| `window` | W01–W04 | non-HARD events settle only after their window closes; GM told which events are in their window; impossible events not suggested |
| `timeaxis` | — | history graph time axis |
| `grouping`, `boxlimits` | G01–G04, BL1–BL3 | scene grouping; box limits (4 beats / 90 min / one place), enforced in the gate and in the graph; reviewer receives the open canon events |
| `force` | F01–F04, U01–U02 | 强制完成 (effects, HARD outcomes, override, replay placement); where other characters stand (background only) |
| `focus` | FO1–FO4 | 关注 reaches GM and planner; auto-cancelled once settled |
| `horaetime` | H01–H03 | a new reply starts no earlier than Horae's time; ignored when behind, absent or implausible |
| `playadj` | PA1–PA2 | a SOFT event whose people were involved in play is judged by the model; untouched events settle with no model call |
| `convergence` (additions) | C17b–C17g | final HARD repair along a planned route; reviewer slips re-filed; only an exact, near HARD value counts as pre-emption; intermediate plan states allowed |
| `pack` (C02 updated) | C02 | a diverged prerequisite makes dependent events a model judgement instead of an automatic omission |
| `edits` (additions) | R16b | a pack update keeps the manifest (no needless re-examination) |

## Live-model session (Venice, 2026-10-15)

A capped local proxy (US$0.60 hard limit) forwarded ST's custom OpenAI-compatible connection to Venice. Pack: the 169-event Chinese Toaru chronicle; start 2020-09-18 17:00; GM card with the recommended world rules.

| Model | Result |
| --- | --- |
| `qwen3-235b-a22b-instruct-2507` | exposed: invented enum values, scalar in nullable-object fields, false conflicts on free-text values and on "preparations for a future event", oversized discover output → task timeouts |
| `z-ai-glm-5-3-flash` | exposed: planner writing steps for the whole future register (truncated at 4096 tokens), string `intended_effects`; model rejects disabled thinking |
| `qwen-3-8-flash` (thinking off) | exposed: broken/truncated JSON at the user's temperature 1.0, extra nested fields. **After fixes: bind + 3 turns committed** (Chinese GM prose; time skip moved the clock to 2020-09-19 06:00; no false conflicts), 130–180 s and US$0.017–0.029 per turn |

Fixes (1.2.0): enum lists generated from the schemas into every prompt SHAPE; enum/synonym/nullable/extra-nested-field repair (top-level extras still rejected, C06); free-text values never compared deterministically; "unsupported" blocks only past-event/causal claims; leaner discover; planner limited to the near horizon and non-fatal on invalid plan JSON (provider failures still operational, C15); internal tasks at temperature ≤ 0.2; 300 s task timeout. Total live spend for all runs: about US$0.28.

## Observations and remaining limitations

- **Context capacity (found with a large real pack).** When the configured model context is too small, ST silently trims in-chat injections. The engine now inspects the final assembled prompt and refuses to accept a draft whose prompt lost the engine context (actionable `capacity` error; verified at a 3k context, and normal operation verified at 32k with a 169-event pack).

- **Windows save races.** Direct `saveChat` calls raced with ST/Horae saves and failed with `EPERM` during ST's atomic rename. Fixed by saving through ST's serialized path and verifying each save by reading the file back. In the final full run ST still logged rare transient `EPERM` rename failures (Windows file locking); the verification detected them and the retry succeeded (no test failed, no data lost), but ST shows its own "Chat could not be saved" toast when it happens.
- Live-model behaviour was measured only on the Venice models above; expect 4–7 calls per ordinary turn. Later live findings from real play (e.g. over-long scene boxes, a far-future HARD outcome blocking ordinary movement, the clock lagging Horae) were turned into the unit tests listed above.
- Horae: when stale memory cannot be refreshed in time, the whole Horae snapshot is excluded for that reply (no partial repair). Tested without an enabled Persona profile template.
- Group chats unsupported; cross-device simultaneous writes unsupported.
- Semantic search is lexical + model-mapped catalogue (no embeddings); paraphrase recall depends on the extraction/discovery model.
