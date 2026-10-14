# Canon Engine v1 — test report

Date: 2026-10-14. Handoff revision 1.1, pack schema 1.0.0, engine 1.0.0.

## Environment

| Item | Version |
| --- | --- |
| SillyTavern | 1.19.0, `06bde939fb1e9c4c8d8641d810f0a916b5bce127`, unmodified (`C:\Users\agent\st-test`) |
| Horae | fork `TaihouKai/SillyTavern-Horae-Metadata` 1.15.1, `204f5140…`, metadata mode, vector memory enabled |
| Model adapter family | ST Chat Completion, source `custom` (OpenAI-compatible) → `tests/e2e/mockServer.mjs` |
| Browser automation | Playwright 1.64 / Chromium (headless) |
| Unit runner | vitest 5, Node 24.20 |

**Live model:** not run. This machine has no provider API key configured (`secrets.json` is empty), so no live-model smoke test was possible. All model outputs were deterministic scripted fixtures. This proves the controller, gates, retrieval, persistence and ST/Horae integration — not the narrative judgment of any particular model.

## Summary

| Suite | Where it runs | Result |
| --- | --- | --- |
| `tests/unit/*` (110 tests): P, C, E, R, W01–W19, schema fixtures, 22 invalid-pack variants | in-process, fake host + scripted model, delayed promises for races | **110 / 110 pass** |
| `tests/e2e/integration.mjs` (59 checks, sections S1–S9) | real ST 1.19.0 + Horae in Chromium, outgoing requests inspected at the mock | **59 / 59 pass** (see final run below) |
| `tests/e2e/story-session.mjs` (10 checks) | real ST, UI-only: wizard upload, composer, swipe arrow, ST edit/delete buttons, reload | **10 / 10 pass** |
| `dist/canon-lint.mjs` | both sample packs valid; World Info file rejected with the specific error | pass |

Reproduce: start ST with this extension installed, `node tests/e2e/mockServer.mjs 5555`, then `npm test`, `node tests/e2e/integration.mjs` (or one section, e.g. `S5`) and `node tests/e2e/story-session.mjs`. Results are written to `tests/e2e/out/*.json`; screenshots `tests/e2e/out/story-*.png`.

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

## Observations and remaining limitations

- **Windows save races.** Direct `saveChat` calls raced with ST/Horae saves and failed with `EPERM` during ST's atomic rename. Fixed by saving through ST's serialized path and verifying each save by reading the file back. In the final full run ST still logged rare transient `EPERM` rename failures (Windows file locking); the verification detected them and the retry succeeded (no test failed, no data lost), but ST shows its own "Chat could not be saved" toast when it happens.
- Live-model behaviour, cost and latency are unmeasured (no key). Expect 4–7 calls per ordinary turn.
- Horae: when stale memory cannot be refreshed in time, the whole Horae snapshot is excluded for that reply (no partial repair). Tested without an enabled Persona profile template.
- Group chats unsupported; cross-device simultaneous writes unsupported.
- Semantic search is lexical + model-mapped catalogue (no embeddings); paraphrase recall depends on the extraction/discovery model.
