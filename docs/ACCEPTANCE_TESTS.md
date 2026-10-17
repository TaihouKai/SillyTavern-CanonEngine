# Canon Engine — acceptance tests

These are the release requirements. They are implemented in `tests/unit` (controlled model fixtures) and `tests/e2e` (an actual ST/Horae installation); current results are in `TEST_REPORT.md`. A model saying a test passed is not evidence.

Use `examples/demo.canon.json`. Mira's original death is FREE. The conflict begins at day 2, 09:00 and ends at day 4, 18:00 with Union victory; both are HARD. All names and dates are invented.

## 1. Deterministic pack, clock and reducer

| ID | Scenario | Required result |
| --- | --- | --- |
| P01 | Import the complete demo | Structural and semantic validation succeed; two Hard events are shown |
| P02 | Import ST World Info JSON, even renamed `.canon.json` | Specific unsupported-format/invalid-schema error; no converter runs |
| P03 | Duplicate event/entity IDs or nonexistent references | Import blocked with precise locations |
| P04 | Null bounds on HARD, minute 1440, reversed interval, wrong precision | Import blocked |
| P05 | A known fact has the wrong predicate type or invalid entity reference | Import blocked |
| P06 | A predicate is absent; evaluate NOT of its equality condition | UNKNOWN, not TRUE |
| P07 | Reorder event/entity JSON arrays without changing their meaning | Same chronological/reducer results |
| P08 | Related edges form a cycle; precedence edges do not | Accepted; no bogus all-graph DAG restriction |
| P09 | Precedence itself cycles or original ordering is impossible | Import blocked or explicitly unresolved before activation |
| P10 | Baseline has contradictory values for one entity/predicate | Import blocked; no last-entry-wins behavior |
| P11 | Two entity-set values have different array orders | Equality/hash normalization treats them as the same set |
| P12 | Day-only Hard event | Can occur during that day, but cannot remain pending beyond its latest bound |
| P13 | Sleep/timeskip spans multiple Hard events | All crossed obligations checked and staged in order before end time commits |
| P14 | Host date/timezone changes, or no messages for a week | Story clock and events unchanged |
| P15 | A fluent changes after a fulfilled Hard occurrence | Prior occurrence remains fulfilled; new fact has its own provenance |
| P16 | Reapply the same commit/event notification | No double death, inventory transition, or duplicate occurrence |
| P17 | Start before coverage or advance beyond supported coverage | Clear binding/coverage handling; no invented canon |
| P18 | Unknown-time FREE/SOFT reference | Not automatically scheduled or treated as accomplished history |

## 2. Narrative convergence and player control

| ID | Scenario | Required result |
| --- | --- | --- |
| C01 | Untouched demo history | Original applicable events occur; FREE does not mean automatically omitted |
| C02 | Player credibly saves Mira at the ambush | Mira remains alive; original death recorded as changed; no scheduled re-kill merely to restore canon |
| C03 | Mira survives, invalidating the original broadcast route | Planner finds an alternate route to both Hard milestones; facts are preserved |
| C04 | Player destroys the planet before the conflict | Destruction is recorded, an explicit restoration/intervention can follow, same Hard content/times remain protected |
| C05 | Draft says the Council wins while JSON claims Union victory | Rejected for semantic disagreement; no false fulfillment |
| C06 | Planner returns `drop_anchor`, new date, renamed winner or parallel world | Rejected by capability/schema/invariant checks |
| C07 | Plan says an attack will happen tomorrow | No attack facts today; tomorrow still needs enacted/adjudicated occurrence |
| C08 | A due plan step becomes impossible because resources changed | Replan; do not mark the obsolete step enacted |
| C09 | Plan depends on player agreeing to join | No invented consent; choose a world/NPC route or present an actual choice |
| C10 | Player can plausibly take part in an approaching event | Timely in-world opportunity offered without teleportation |
| C11 | Player refuses participation | No repeated nagging for that event on the same branch; event may proceed offscreen |
| C12 | Severe change triggers warning | One relevant spoiler-free UI banner; no injected HTML/tags in prose |
| C13 | Ordinary local conversation/rescue with a straightforward alternate route | No routine red alarm merely because canon differed |
| C14 | Offscreen conspirator has a secret plan | Other NPCs and player do not automatically know it |
| C15 | Provider fails during ordinary planning | Operational error/retry, not a supernatural correction |
| C16 | Repair budget exhausted | Last valid state preserved; visible finite recovery; no silent deadline skip or infinite loop |
| C17 | Model pre-sets `conflict.active` without describing/enacting the required conflict | Not sufficient for Hard occurrence satisfaction |
| C18 | A draft unexpectedly skips further ahead than planned | Re-run crossed-interval checks before acceptance |
| C19 | Distant Hard anchor affected outside the next-two horizon | Impact expands planning scope; distant obligation is not ignored |
| C20 | Original graph lacks a relevant cross-link; change scope is global/unknown | Broader semantic anchor review rather than false graph-only certainty |

## 3. Editing and deletion of both roles

| ID | Scenario | Required result |
| --- | --- | --- |
| E01 | Edit an old user assertion from “Mira is alive” to “Mira is dead” | Earliest affected prefix detected; new evidence replaces old evidence; dependent results revalidated |
| E02 | Delete the old user rescue message; later dependent GM text remains | No phantom rescue; re-evaluate retained text and expose a conflict if unsupported |
| E03 | Edit an old GM reply to remove a death | Death fact and dependent plans/warnings removed from active state; surviving facts re-evaluated |
| E04 | Delete an old GM time-advance message | Its unsupported offscreen events/time consequences roll back too |
| E05 | Delete the latest user message without changing the GM message count | Detected; provenance and outstanding request invalidated |
| E06 | Edit only message content; count and timestamps stay identical | Hash comparison detects it |
| E07 | Bulk delete multiple middle/suffix messages | Rebuild begins before earliest removed dependency; renumbered indexes do not inherit facts |
| E08 | Delete or edit the greeting/first message | Baseline/source recovery works; no duplicate RPG initialization |
| E09 | Change only an irrelevant wording detail | Compatible facts retained or revalidated; no forced plot event introduced |
| E10 | A later independent surviving message really establishes the same fact | Valid support retained after replay; do not blindly subtract by ID |
| E11 | Only an old summary repeats a deleted event | Not independent support; event cannot reappear through summary/vector injection |
| E12 | Keep a contradictory suffix after an edit | Text preserved and conflict location shown; no automatic suffix deletion, retcon or deity to justify it |
| E13 | Resolve the conflict by editing the identified reply | Rebuild clears recovery and resumes normal generation |
| E14 | User elects regeneration from the conflict in a new branch | Original preserved; new branch has fresh suffix and isolated state |
| E15 | Remove a refusal to participate | Event opportunity state rebuilds from surviving messages |
| E16 | Delete a warning-causing event | Banner disappears on the current branch; no stale forced plan remains |

## 4. Swipes, branches, races and persistence

| ID | Scenario | Required result |
| --- | --- | --- |
| R01 | Swipe A saves Mira; swipe B does not | Current facts correspond only to the selected variant |
| R02 | Regenerate a reply after it fulfilled a Hard event | New candidate starts from the proper pre-response world; does not inherit satisfaction from the replaced reply |
| R03 | Continue an accepted reply | Existing prefix included once; entire revised message validated; effects not counted twice |
| R04 | Delete a swipe then create another at the same numeric index | Variant identity/effects do not transfer by index |
| R05 | Branch at a shared prefix and play differently | Shared prefix equivalent; all subsequent plans/history/warnings isolated |
| R06 | Rename a chat | Same campaign identity, no false branch/reset |
| R07 | Switch chat while a model is running | Late result discarded; new chat unaffected |
| R08 | Edit/delete/swipe during each async phase | Old request fences fail before commit even if network cancellation fails |
| R09 | Two generations requested rapidly | One serialized operation or explicit queue; no two commits against one predecessor |
| R10 | Duplicate lifecycle events on render/reload | Idempotent handling; no repeated planning/commit |
| R11 | Save failure after preparation | No durable-success claim; recoverable journal and prior state retained |
| R12 | Reload/crash at each commit boundary | Recovery yields one coherent accepted revision, never a mixture |
| R13 | Backup export/import and browser-cache deletion | Pack snapshot and active source state recover without browser-only data |
| R14 | Edited chat loaded with old stored checkpoints | Fingerprint mismatch detected before caches are trusted |
| R15 | Second active tab opens same campaign | Writer conflict handled; no silent double writer |
| R16 | Original pack file changes on disk | Bound snapshot unchanged until explicit reviewed update |
| R17 | Cancel a failed regeneration | Prior selected reply recoverable; user input preserved; no empty story message |

## 5. Real integration proof

Inspect the outgoing final prompt and downstream storage, not only Canon Engine's UI.

| ID | Scenario | Required result |
| --- | --- | --- |
| I01 | Native Send with existing GM/Persona/Author's Note/static lore | Managed draft preserves required normal prompt inputs |
| I02 | Reject a draft containing a unique sentinel event | Sentinel absent from chat, Horae metadata, summary/vector index, next prompt and current ledger |
| I03 | Accept a reply | Native final message lifecycle occurs exactly as supported; Horae sees only accepted text |
| I04 | Edit/delete old user and GM events with Horae active | Tainted memory rebuilt or excluded from the actual next model prompt |
| I05 | Horae is still processing accepted text when Send is pressed | Correct freshness barrier or source-derived state; no stale time used |
| I06 | Current Persona contains initial inventory already consumed in play | Integration does not restore inventory or reinitialize RPG state |
| I07 | Static lore says a saved character later died in canon | Cannot override current life state; future description does not become evidence |
| I08 | Quiet/raw internal requests trigger ST prompt hooks | Reentrancy and memory injection scoped correctly; no recursive story turn |
| I09 | Native streaming enabled globally | Bound engine still keeps drafts private without permanently altering unrelated chat settings |
| I10 | Reload UI | Compact status and chosen inspector state restored; no need to reopen a required management window every time |
| I11 | Group chat without a validated adapter | Explicit activation guard; no misleading enforcement claim |
| I12 | Local Horae fork lacks expected APIs | Clear compatibility diagnosis; no writes to guessed private fields |
| I13 | Model emits malformed JSON or extra mutation fields | Local validation and bounded retry; no code execution or direct state write |

## 6. Actual-history retrieval and independent world state

These cases enforce `WORLD_STATE_CONTEXT_CONTRACT.md`. Use `examples/unrelated-history.canon.json` as a seed, plus dynamically created user/GM records. The market destruction has no edge to the Hard chain; the key loan/return has no causal connection to that chain either. Do not add one to make a test pass. For retrieval tests, remove the relevant old prose from the model's recent context, keep it in the valid persisted ledger, and inspect the context actually supplied to generation/evaluation/repair. A test where the model happens to guess correctly does not prove retrieval.

| ID | Scenario | Required result |
| --- | --- | --- |
| W01 | A prior event causes the current situation but is not mentioned; run separately for a player action, GM/NPC action and adjudicated canon | Its actual record/outcome and necessary causal chain enter GM reasoning; retrieval does not require a mention or anchor link |
| W02 | An unrelated past event is directly mentioned; parameterize across the same three origins | Its actual occurrence, outcome and relevant later changes enter context even with no causal relationship to the current task |
| W03 | Indirect reference: “the man I rescued,” “that explosion,” or “our earlier agreement”; include aliases and an ambiguous name | Supported references resolve and fetch records; material ambiguity is resolved or explicitly handled rather than guessed |
| W04 | After the archive key is returned, user mentions the earlier loan; separately test player theft followed by return | Both actual occurrence and later reversal are retrieved; current holder alone is insufficient; no implication that the loan/theft never occurred |
| W05 | Story time crosses the unrelated FREE market destruction while the player is elsewhere | Candidate is adjudicated despite no anchor/scene link; supported destruction persists with offscreen/time provenance and no forced player involvement |
| W06 | Much later, user chooses a route through that market while pursuing unrelated A | Pre-generation packet includes destroyed condition and supporting actual history; accepted narration respects the ruins and does not invent restoration |
| W07 | User never names the market; the GM draft first introduces a visit and ordinary shopping there | Whole-draft discovery triggers fresh lookup; unsupported operation of the market fails; corrected history/state reaches repair before publication |
| W08 | GM draft first mentions an unrelated old event without asserting a current entity state; include an initially accurate draft | Event reference alone triggers lookup and final model review with actual record content; false actors/outcomes are caught, and even the accurate draft cannot bypass loading the record into reasoning |
| W09 | A repair replaces the market with a demolished bridge, or adds a second incorrect anecdote | New entities/events are discovered, queried and checked again within the finite repair budget; first-draft coverage cannot authorize a different draft |
| W10 | Implicit contradictions: live greeting by an established dead NPC, using a missing key, normal operation by a dissolved organization | State and supporting history are fetched and claims checked; no requirement for an explicit “alive/intact/exists” sentence; genuine established exceptions remain possible |
| W11 | Same reply spans before/after destruction or restoration; a later flashback depicts the earlier scene | Query the proper scene checkpoint and validated staged overlay; no future leakage or end-state back-projection; proposed changes cannot validate themselves |
| W12 | Player sees ruins but does not know the culprit; NPC repeats a false rumor about the event | GM reasoning receives necessary facts with knowledge boundaries; physical consequence is visible without automatic culprit disclosure; rumor remains a belief, not world truth |
| W13 | A later supported restoration occurs; then somebody discusses the earlier destruction | Current-state lookup returns restored condition; historical lookup still returns destruction and restoration; stale ruined-state cache is rejected |
| W14 | Edit/delete the only source for an unrelated player- or GM-caused destruction/loan; retain an incompatible suffix | Rebuild occurrences, causal links, state, caches and manifests; no phantom history from old summaries; preserve suffix text and expose actual conflict |
| W15 | Delete an offscreen event's triggering timeskip, change swipe/branch, reload or restore backup | History/state retrieval follows the selected reconstructed source; canonical events may be re-adjudicated only on a valid new time path; no cross-branch leakage |
| W16 | Lookup/evaluation returns after a source edit, chat switch, overlay change or candidate repair | Stale source/time/draft fences fail; no stale retrieval or coverage can authorize commit; rejected drafts never reach Horae/memory |
| W17 | Missing facts, genuinely new entities, alias collisions, and attempted renaming of a destroyed known entity | UNKNOWN stays explicit; compatible new detail can be adjudicated; renaming cannot bypass established history; no fabricated normality or recollection |
| W18 | Total destruction with a known contained shop; separately partial damage and an explicit surviving exception | Query supported parent constraints; enforce actual damage scope without inventing geography, casualties, universal destruction or ignoring a valid exception |
| W19 | Old FREE/SOFT/HARD effects and matched event records compete with an imminent anchor for a small context budget | Same persistence/retrieval rules for all classifications; compact/partition without silently dropping matched history or required constraints; capacity failure is explicit if necessary |
| W20 | Real supported ST/Horae run with old source outside prompt window, no provider function calling, pre-generation and draft-only references | Inspect actual outgoing contexts, fetched records and final content-bound coverage; exercise both OR triggers and repairs; retrieval is controller-driven and stale memory cannot override it |

For W14, test both user and GM sources. Deletion removes unsupported facts only: surviving independent evidence remains after revalidation, and still-applicable canonical history is not permanently cancelled by deleting a source message. For W01/W03, include a missing explicit graph edge that requires semantic expansion. For W16, deliberately delay promises; do not rely on manual timing.

## 7. Required test report

List exact tested ST/Horae versions, model-adapter family, which cases ran automatically versus in a real browser, failures/limitations, and how to reproduce integration cases. Keep secrets out of logs. Use deterministic mocked model outputs for domain correctness; add a small live-model smoke test for narrative interpretation without claiming it proves reliability for all prose.

Release gates: every core hard-contract, user/GM source-revision and W01–W20 retrieval/continuity case passes; native draft isolation, actual reasoning-context injection and stale-memory handling are demonstrated; failures preserve recoverable state; unsupported configurations are visibly guarded. Do not broaden testing into a general benchmark project once these concrete risks are covered.
