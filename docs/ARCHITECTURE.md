# Canon Engine — architecture

## Layers

The engine (`src/core`) knows no host. A host — SillyTavern (`src/hosts/sillytavern`) or Canon Engine Play, a page
of its own (`src/hosts/web`) — implements
`HostPort` (the conversation, storage, publishing replies, the Persona, optional lore entries, scene tracker and pack
store) and `ModelPort` (analysis tasks and story drafts), and uses the core only through `src/core/index.ts`.
`scripts/check-boundary.mjs` (run by `npm run build` and `npm test`) fails the build when the core imports a host or
uses a host global, or a host reaches past the core's entry point. `npm run build` also bundles the core alone as
`dist/canon-core.mjs`.

```mermaid
flowchart LR
  subgraph core [src/core — the engine, no host]
  subgraph domain [domain — pure]
    pack[pack: schema + semantic lint, Graph A]
    time[time: ticks, bounds]
    red[reducer: facts, occurrences, dispositions]
    sch[schedule: crossed intervals, default adjudication, bootstrap]
    wq[world-query: identity, occurrence & entity indexes, causal closure, lexical search]
  end
  subgraph runtime [runtime — controller]
    rep[replay/reconcile]
    eng[engine: operation pipeline, journal, backup]
    pl[planner + impact + forced control]
    adj[adjudicator]
    ctx[context: retrieval + packet]
    gate[gate: deterministic validation + coverage]
    mdl[model: structured task runner]
    port[host: HostPort, the host's side]
  end
  subgraph combat [combat — 战斗分析, used through combat/index.ts]
    cgraph[graph + state: the pack's combat graph, this game's changes, the walk]
    cjudge[message, judge, turn, reply, review, panel]
  end
  cui[ui: timeline window, inspector, texts]
  end
  subgraph st [src/hosts/sillytavern — the SillyTavern host]
    sth[StHost / StModel: interceptor, quiet draft, raw tasks, prompt hooks, publish, verified save]
    hor[Horae as the scene tracker]
    lore[World Info as lore entries; 本局设定 in its scan]
    stui[settings drawer, library, notifications, clock API]
    lock[writer lock]
  end
  subgraph web [src/hosts/web — Canon Engine Play]
    wh[WebHost: saved games in IndexedDB, publish, Persona]
    wm[WebModel: any OpenAI-compatible API, the GM's instructions]
  end
  domain --> runtime
  combat --> runtime
  runtime --> cui
  st -->|src/core/index.ts| core
  web -->|src/core/index.ts| core
```

战斗分析 is a module of its own (`src/core/combat`), and the rest of the core uses it only through `src/core/combat/index.ts`:
- **Pure parts the domain layer uses directly.** `graph.ts` (the pack's combat graph: index and lint) and `state.ts` (this game's combat changes replayed under `WorldState.combat`: links, states, 对抗倾向, the fight, who saw which ability, and the walk that takes what a fight needs).
- **The steps of a turn**, each one call from the engine or the gate:
  - `message.ts`: the player's message starts, goes on with or ends a fight;
  - `turn.ts` and `judge.ts`: before the reply, a fight under way is judged (`combat_fill`, `combat`, checked by code);
  - `reply.ts`: what the GM gets;
  - `review.ts`: the reply held to the ruling, and states and GM-started fights recorded;
  - `panel.ts`: the inspector's 战斗 page (the fight, the rulings with their reasoning and the nodes they were given, people, and the setting's nodes) and its edits;
  - `prompts.ts`: the models' instructions about fights.
- **What stays in the engine** is what only the engine knows: the lorebook as this game has it, the Persona, the scene. The UI is `ui/combat-panel.ts`, the inspector's 战斗 page.
- **Enforced.** `check-boundary.mjs` also fails when the core reaches past `combat/index.ts`, or the module reaches into the engine, the gate or the UI.

主动敌对 (the world comes for the player) is a module of its own in the same way (`src/core/hostility`, through `hostility/index.ts`):
- `state.ts`: grudges against the player and dangers that came, replayed under `WorldState.hostility`; the dangers linked from places and organizations, with their hours.
- `turn.ts`: before the reply, at most one thing comes for the player, decided by code. It is either a grudge whose time has come, or a danger of where the player is. The danger is drawn from how common it is and the danger level, with a roll fixed for each three-hour stretch, at most once a story day, and only when the switch is on. The GM gets a required section and writes up to where the attack begins.
- `review.ts`: grudges the reply shows taken up (with their words, and when they come) or settled. A fight with a holder settles the grudge (code). What was due must come: a fight begins, or at least a hostile contact; otherwise the reply is sent back.
- `panel.ts`, `prompts.ts`: the inspector's 「谁要找你麻烦」 section (`ui/hostility-panel.ts`) and the review's part of the evaluate prompt.
- The boundary check covers it like 战斗.

NSFW 模式 (the world holds back while the player wants a scene uninterrupted) is a small module of the same kind (`src/core/nsfw/index.ts`):
- Only the player turns it on and off, with the button at the top of the inspector; it is kept with the game (`Campaign.nsfwMode`). Nothing reads it from the text.
- While on, the engine leaves out every way the world reaches the player: the integrate task is not run, no world reaction, no required contact, no grudge or danger, no chance companion event, no pack hook or 关注; the GM gets the PRIVATE SCENE instruction. What was due waits for the first reply after it is turned off.

Graph A (pinned pack), the actual history ledger, Graph B (projection = reducer state over baseline + ledger) and future plans are separate types and namespaces. Indexes are rebuildable projections; the selected transcript + pinned pack + binding seed are the only authorities.

## Source of truth and replay

1. `readTranscript()` gives `[ {messageId, variantId, contentHash, role, text} ]` from `message.extra.canonEngine` ids (assigned once; duplicates from native copies get fresh ids). The hash covers role, author, text and attachments.
2. Each variant has stored **interpretations** (records, state claims, player actions with authorizing quotes, source dependencies, scene time, offscreen basis).
3. `replay()` applies bootstrap records, then each message's interpretation in order, then any **manual records** the player added (*强制完成*) right after the message that was last when they were made (at the end if that message is gone). Validity per message is checked deterministically: source dependencies and agency authorizations (always), presupposed state, duplicate canonical dispositions, offscreen precondition assumptions, time monotonicity, and whether it touches entities whose history changed earlier: the replay keeps, per entity, a running digest of the earlier messages that are about it (`WorldState.told`), and an interpretation carries the digests it was examined with (`basisScope`) — it holds only while they are the same, so the same chat gives the same answer whatever was rebuilt, failed or cancelled in between. An interpretation validated against the identical prefix state and the same digests is reused (fast path) — still subject to the dependency check. A fact changed by what joins or leaves it (`add`/`remove`) is worked out again when a record is put in at an earlier story time than changes already there (an event recorded at the start of its window).
4. The first message without a valid interpretation is (re)interpreted by a model task against the new prefix (user: extraction; GM: discovery + retrieval + evaluator in `retained` mode). An incompatible retained message becomes an editorial **conflict**: its text is kept, generation pauses, nothing is invented to justify it.

Unchanged prefixes therefore replay with zero model calls; edits of either role at any position, deletions, swipe selection, reload and branch switches all reduce to "replay the selected transcript".

## One foreground operation

```mermaid
sequenceDiagram
  participant U as User (native Send/Swipe/Regenerate/Continue)
  participant ST as SillyTavern
  participant E as Engine
  participant M as Model (ST connection)
  U->>ST: native action
  ST->>E: GENERATION_STARTED (capture prior reply) / generate_interceptor
  E-->>ST: abort native generation
  E->>E: lock, settle, reconcile (rebuild dirty suffix), capture fences
  E->>E: Horae freshness barrier (wait / reanalyze / exclude)
  E->>M: plan (only when needed; ≤2 ordinary + 1 forced)
  E->>E: pre-generation retrieval (mentioned ∪ causal ∪ scene) → context packet
  E->>M: private draft (Generate quiet + engine context)
  loop initial + ≤2 repairs
    E->>M: whole-draft discovery
    E->>E: fresh retrieval over the full ledger (+ deterministic name/occurrence scan)
    E->>M: evaluator / final narrative review with fetched records
    E->>E: interval adjudication if the draft advances time (re-review with staged history)
    E->>E: deterministic gate + coverage manifest bound to the candidate hash
    E->>M: repair draft with violations + facts (if needed)
  end
  E->>E: fence check
  E->>ST: journal → saveReply (native events; Horae sees accepted text only) → verified save
  E->>E: apply delta, deterministic replay, save
  E->>M: impact assessment (post-commit; may mark plan stale / set banner)
```

## Retrieval (WORLD_STATE_CONTEXT_CONTRACT)

`retrieve()` builds the union of
- **mentioned** history: references from the user extractor / draft discovery resolved by exact identity (names, aliases, ids), occurrence reference phrases, lexical IDF search (words + CJK bigrams) and model-provided candidates from an occurrence catalogue; indirect person references resolve through matching occurrences to their actors;
- **causal** history: the records that established the current values of every relevant entity's facts, plus their transitive supported causes; parent/containment entities;
- **scene/entity constraints**: current facts with validity, support summary, explicit UNKNOWNs, uncertain transitions, parent constraints.

The packet gives the model record **content** (account, actors, actual outcome, causes, later changes, visibility/knowledge boundaries, evidence), canon statuses (`occurred/diverged/omitted/pending/future/unscheduled` — never presenting unfulfilled canon or plans as history), deviations, HARD obligations, ready plan steps, opportunities, and the exact player scope. Required sections are never truncated (compact mode first, then an explicit capacity error); optional sections are dropped first.

After generation the same retrieval runs again on the **whole candidate** (discovery + a deterministic floor: every known entity name and occurrence phrase in the text gets a lookup and an explicit review item). The evaluator receives this expanded context; every discovered claim needs a verdict; contradictions block; the coverage manifest is bound to the exact candidate hash, revision, scene checkpoint and staged overlay. Each repair repeats everything.

## Deterministic gate (summary)

Evidence quotes must exist in the candidate; entities/predicates/values are type-checked against pack + runtime registry (new entities get code ids; known identities cannot be renamed into new ones); time cannot move backwards outside flashbacks; a near HARD event's exact required outcome (one of the next two pending HARD events or within 2 days; a real change, not the value already holding) can only be produced by that event's own occurrence inside its authored bounds with a reviewer-confirmed depiction — other values of the same fact are ordinary story; crossed HARD deadlines must be realized onscreen or by staged offscreen adjudication; an end-time range that reaches a HARD checkpoint the reply does not depict is taken as ending before it (its lower bound already lies before; the event stays due); narrated player actions need a verbatim authorizing quote from the user's message; presupposed state is checked at the claim's own checkpoint (flashback claims at their time), including containment in destroyed parents (partial damage does not imply destruction; explicit exceptions win); a claimed change cannot validate itself without its own occurrence; engine labels/JSON in prose are rejected; plan enactments need an occurrence and evidence.

## Planning and convergence

Rolling detailed plan for the next two pending HARD anchors plus any anchors flagged by impact; compact register for the rest. The planner also receives, as context only, the starting situation of non-HARD original events of the next 24 hours (so its steps do not make anyone act on knowledge they would not have yet, and secret HARD outcomes get routes out of public view) and the player's *关注* events, for which it may add up to two non-binding steps that give the player a chance to be present. Replanning triggers: no plan, stale plan after a source change (revalidated by assumptions), a protected anchor's prerequisite truth value changed, an expired unenacted step, a protected anchor fulfilled, impact assessment (`replan` or non-local scope), or a diagnosed large-scale change (a `world` entity no longer exists while a protected anchor depends on it) which authorizes **forced convergence** directly. Otherwise forced mode is authorized only after validated ordinary proposals failed. Plans are validated (no dropped/renamed/rescheduled/weakened anchors, no alternate worlds, no player consent, times within bounds, extraordinary means only in forced mode; an effect contradicts an anchor's outcome only when its step serves that anchor or is still running at its deadline — intermediate states before it are allowed; mistyped effects are repaired or dropped, and a forgotten protected-anchor id is added). Plans are intentions; they never change facts. HARD obligations are additionally enforced at their checkpoints by the gate/adjudicator even without a valid plan.

## Narrative integration (the world reacts to the player)

`src/runtime/integration.ts`. Campaigns bound from 1.4.0 read the standard Persona once (task `profile`) into a checked profile revision; its player/organization/place runtime entities enter history as a `persona_seed` manual record. A changed Persona is reported; the player updates the identity from the current position or keeps it, and older messages keep the revision they were written with (`profileAt`).

- **Shared player context** (`playerContext`): identity, organizations and places with their current state, connections, knowers with levels, the player's actual history (every occurrence with the player's entities, the ones with the candidates' people always kept) and decisions. The HARD planner gets it too (P0) and replans when `playerContextHash` changes.
- **Decisions and contacts** are records in the interpretation of their message (`engagement` on the player's message, `world_contact` on the reply), so replay handles edits, deletions, swipes, continues, branches and failed saves. `engagementView` gives the current stance per scope: joined/accepted/reopened lift a refusal of exactly that scope (an event joined lifts an arc refusal for that event only), a single act (`limited`) lifts nothing, a deferral ends at its time.
- **Suggestions** (`integrate`, run in parallel with the planner, cached by the hash of everything they depend on) are checked by `checkOpportunities` and filtered again by `selectOpportunity` against the current decisions. They are never history and are not PROPOSED ACTIONS (a time skip never executes them). 关注 and pack hooks are inputs of this task; the legacy GM lines remain for campaigns without integration and as a fallback, without declined events.
- **Review**: the reviewer receives the decisions, the offered contact and recent contacts; it records contacts and reports `engagement_pressure`, which the gate keeps out of its HARD-noise filter.

## SOFT / FREE events

Non-HARD canon is default history, never planned toward:

- **GM context.** Events whose window is open (and whose preconditions are not FALSE) are listed as under way. The `起因` part of the next 24 hours of non-HARD events is given as *where other characters stand*: what they know, want and are doing — explicitly not obligations, with an instruction not to steer toward them. Player-focused events (*关注*) get a section asking for natural in-world chances to be present, from 24 hours before their window until it ends; focus is removed once the event is settled or its window has passed.
- **Reviewer.** The non-HARD events open around the scene (`canon_events_now`) are always passed, so a depicted one is recorded with its id (occurred / diverged) instead of as an ordinary scene beat.
- **Settlement when the window closes.** Preconditions TRUE and no actual play involving the event's people since 2 days before its window → recorded deterministically along the original route (no model call). Play involved its people → the model judges it from that play (as written, diverged, omitted), falling back to the original route. A prerequisite that happened differently (`diverged`) makes `occurred` conditions UNKNOWN, so the model judges with the actual account of that prerequisite. Preconditions FALSE → omitted with the reason. HARD events are never omitted.
- **Force complete.** A manual record (`origin: intervention`, `override: true`) marks the event occurred with its effects and HARD outcomes, replacing an earlier disposition; active plans become stale.

## Story time

The clock moves only through time-advance records (scene end of an accepted reply) and never backwards. The reviewer estimates how long each reply takes; explicit times in the text win. With a scene tracker the host provides (SillyTavern: Horae) installed and fresh, a new reply (not a swipe/regenerate/continue) starts no earlier than the tracker's story time at the end of the previous reply, if that is later than the engine clock and at most 3 days ahead (`followTrackerTime`).

## Scene boxes

With scene grouping on, the reviewer may file a beat under the current box (`continues`). The gate enforces the box limits (at most 4 beats, 90 minutes, one place) whatever the reviewer says, and the graph splits older chains by the same limits. Canon events never continue a box.

## Durable recovery boundary

ST and Horae are not one transaction. The guaranteed invariant: a rejected draft never enters chat, Horae, memory or the ledger. A commit writes a journal (with the full interpretation) into chat metadata before `saveReply`; ST persists chat + metadata in one file, so after a crash either the reply and its journal are durable together (journal finalized on next load) or neither is (journal discarded, regenerate prior restored). Native rendering callbacks (e.g. Horae's background analysis) may save the chat themselves; this is safe because they save the same in-memory chat/metadata. Saves are serialized through ST's own save path and verified by reading the file back; a failed save is reported (`unsaved`) and cleared only by a verified successful save.
