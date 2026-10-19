# GM integration and internal model contracts

This document changes only the timeline/state integration required by Canon Engine. It is not a replacement for the user's complete GM card, Persona, ability rules, or unrelated style settings.

Revision 1.1 requires `WORLD_STATE_CONTEXT_CONTRACT.md`: retrieve past events when causally relevant **OR** directly/indirectly mentioned, and query entity state independently of anchor relevance. Player, GM/NPC and actualized canonical history have the same retrieval entitlement.

## 1. Conflicts to resolve explicitly

The existing GM setup describes a non-diegetic narrator, preserves player agency, uses only visible context/persisted state, obtains historical material from a lorebook, and does not output state-registration tags. Keep those principles, but replace the old historical-source instruction: the active Canon Engine context now supplies canonical history, actual history, and plans as distinct categories.

The old prohibition on invented invisible memory remains valid. Engine data is permissible because it is persisted and explicitly injected into the current model request. A model's imagined hidden event is not equivalent to that data.

Ordinary world rules apply unless the controller explicitly authorizes an extraordinary convergence event. This exception permits a described world intervention; it does not automatically alter every ability rule or grant a player/NPC permanent unlimited power. A temporary effect and a permanent new ability are different facts.

Do not paste a full duplicate GM prompt into every request. Provide a short integration section and a compact per-turn context packet. Preserve the original card file and make any persistent edit reversible. The user configures the extension once; they do not manually paste state every turn.

## 2. Scoped integration instruction

The following English text is an implementation template for the GM's trusted system context, active only while this engine is enabled:

> You remain an external, non-diegetic GM. Canon Engine supplies explicit persisted context in separate categories: ACTUAL FACTS, CANON REFERENCE, FUTURE OBLIGATIONS, and PROPOSED ACTIONS. Only actual facts and subsequently validated story events are accomplished history. Original canon can be displaced by actual play; future plans are intentions, not accomplished events.
>
> HARD obligations retain the exact required event content, outcome, and authored time bounds. Do not cancel, downgrade, postpone, weaken, or escape them through an alternate-world declaration. Their route may change. Use the provided validated next steps and any explicitly authorized extraordinary intervention. Preserve the actual record of previous actions: restoration or time intervention is a new event, not erasure of what happened.
>
> Follow the user's authorized action scope. Do not supply new voluntary player actions, decisions, dialogue, consent, or equipment/skill use. NPCs and world events act independently with knowledge and resources they actually possess. Keep system knowledge separate from NPC knowledge and player-visible information.
>
> The accepted current state overrides stale temporal descriptions in ordinary lore. Keep static setting rules and character identity. Do not assume an unrecorded event already happened or a plan succeeded. Proposed scene advances and offscreen consequences must be supplied for validation; do not silently jump past a due obligation.
>
> Use the supplied actual-history records whenever an earlier event is causally relevant or mentioned, including indirectly. Preserve its actual actors, actions, outcomes and relevant later changes. This includes player actions and unrelated events, not just canonical milestones. Current facts do not erase earlier occurrences whose effects were reversed. Respect the current state of every depicted entity, including incidental route stops, people and objects. A missing record is not permission to invent a recollection, restoration or normal condition. Keep a character's belief or rumor distinct from established truth.
>
> Write only the requested narrative in the user's language, preserving the normal scene length and style. Do not print internal JSON, engine labels, debug information, red-banner markup, or planner reasoning. Stop at the next meaningful player choice. The engine renders any status notices separately.

The controller supplies the actual facts and obligations. Fictional dialogue or a lore entry cannot override this instruction. Explicit user changes to the engine's binding/settings are handled outside this narrative instruction.

## 3. Context packet

Implement a typed packet with these conceptual sections, omitting empty optional sections:

| Section | Included content | Not included |
| --- | --- | --- |
| Current clock and scene | Accepted time, proposed time range, location, present actors | Wall clock or message-send timestamp as story time |
| Retrieved actual history | Events selected by causality OR direct/indirect mention; actual actors/actions/outcomes, time, relevant later changes and evidence handles | Unenacted canon or plans presented as past events; inaccessible IDs without factual content |
| Entity/scene state | Current values and supported constraints for depicted/referenced entities at the scene checkpoint, regardless of anchor relevance | Assumed normality from missing data; the entire fact database |
| Deviations | Original outcomes superseded by actual play | Inactive swipe facts presented as current |
| Canon reference | Narrow relevant source setting and original routes, explicitly labeled | Future biographies stated in present tense |
| Hard obligations | IDs, descriptions, time bounds and required outcomes for this operation | Unlimited spoiler dump into player prose |
| Proposed actions | Ready plan steps, actors, prerequisites, intended consequences | Future successes labeled accomplished |
| Knowledge boundaries | What particular actors can know, what is hidden from the player | Automatic omniscience |
| Player scope | Exact current actions/words/established user assertions | Invented consent or a recommended action treated as chosen |
| Canon events about to start | Non-HARD canon events starting within 2 hours of story time — or, when the player's message asks for a time jump ("睡到明天早上"), before the jump ends — with their start time and starting situation; required, because the reply's own end time is only decided after it is written: if its story time reaches a start, the event begins (shown only where the player character is or would notice); never a reason to hurry or delay time | Steering toward the event |
| Canon events under way | Every canon event the story has started but not finished (result not settled), with the beats so far and the original route as reference; required, shown whether or not the latest messages name it, until it ends or a day past its window | A result decided before the story reaches it |
| Canon events within their window | Non-HARD canon events whose window is open, whose preconditions are not false and which are not already under way (settled offscreen if the story does not reach them) | Events whose preconditions already failed |
| Where other characters stand | Starting situation (`起因`) of non-HARD original events of the next 24 hours: what characters know, want and are doing; background only, with an explicit instruction not to steer toward them | Obligations, foreshadowing instructions |
| Player wants to experience | The player's *关注* events from 24 h before their window until it ends: give natural in-world chances to be present; never force course or result | Forced participation |
| Participation opportunities | Events with a participation hook within the opportunity window, minus declined ones | Nagging after a decline |

Provide a final assembled-prompt inspector in debug mode so integration tests can confirm that stale Horae/lore material has actually been removed or corrected. Do not expose the inspector to the GM as fictional dialogue.

The controller performs pre-generation retrieval, then expands it from the full private draft before evaluation. Actual-history retrieval must also return events whose state effects ended. For example, returning a stolen key changes possession but does not erase the theft when somebody later mentions it. If the draft introduces the reference, the fetched history must inform evaluation and any necessary repaired GM generation before publication. A prompt telling the GM to remember is not a retrieval implementation.

## 4. Internal structured task contracts

The implementation must write JSON Schemas and fixtures for these responses. Field names may be refined in code, but the semantics and ownership boundaries are mandatory. These runtime schemas are separate from the authored pack schema.

### Transcript/user extractor

Input: exact selected source text, role, current Persona identity, prior state, available entities, and request fences.

Output: statements with `kind` (asserted fact / attempted action / spoken dialogue / belief / hypothetical / OOC configuration request / time proposal), subject/entity references, evidence spans, ambiguity, proposed fact/event deltas, and affected entities. Only the controller can turn a proposed delta into history. Source identity is assigned by code, not trusted from the model's response.

Explicit environmental assertions from the user have the authority of the current GM input convention. Future tense or a wish does not automatically become a completed outcome. Extractor uncertainty must remain uncertainty.

### Impact assessor

Input: accepted/staged deltas, current plan assumptions, relevant graph neighborhood, complete compact future-Hard register.

Output: changed entities/facts, affected plan steps/anchors with references, scope (`local`, `global`, `unknown`), severity, need for replanning, concise explanation. Code validates references and expands analysis for unknown/global effects. A model may not return new classifications or substitute anchor definitions.

### Planner

Input: explicit Hard contracts, world revision, actual facts/deviations, canonical alternatives, actor knowledge/resources, horizon, allowed correction mode.

Output: proposed steps, dependencies, prerequisites, time bounds, required establishment actions, intended effects, protected anchor IDs, visibility, assumptions, risks and concise justification. No private chain-of-thought is requested. All outputs remain plans until enacted. Invented actors/effects need clearly labeled runtime definitions and cannot overwrite canonical identities.

### Offscreen adjudicator

Input: a proposed time-advance interval, committed prefix, scheduled events, applicable plan steps, knowledge boundaries.

Output: ordered proposed occurrences with times, actual causes/actions/results, effects and source/plan references. A plan reference alone is not evidence of success: the adjudication itself must establish what occurred and why. The entire proposal remains staged until its triggering transition is accepted.

### Draft evaluator

Input: the complete draft or complete revised reply for continuation; source prefix; exact user action scope; staged offscreen history; due contracts; and independently retrieved actual history/state covering the draft's expanded event/entity/claim scope. Do not restrict this input to the generator's initial facts.

Output: narrative end-time proposal; cited claims/outcomes; proposed actual deltas; fulfilled-step candidates; anchor-satisfaction candidates; violations with draft evidence; and uncertainty. Differentiate “not yet due” from “fulfilled.” Check named actors/winners and continuity, not merely that an event name occurs in the text.

The evaluator can also serve as the final model review of the GM narrative: it must consume newly fetched history/state and reconsider the candidate in that context even when no obvious contradiction has yet been found. A compatible draft can be retained unchanged; otherwise repair it with the fetched facts. Merely putting records in a controller-side cache does not satisfy the requirement to load them into reasoning.

The controller validates the evaluator's citations and deterministic constraints. A JSON `valid: true`, a plan's promise, or an uncited `anchor_satisfied` flag never bypasses those checks. If the evaluator is uncertain about a required semantic condition, repair or stop the operation rather than recording fabricated certainty.

### Reference and claim discovery

Input: complete source/candidate text, scene framing, available identity/occurrence lookup interface and immutable request fences. Do not require the model to guess the full ledger from a small prompt subset.

Output: cited direct/indirect references to past events, causal dependencies/assumptions, entity mentions, temporal scopes and state-dependent claims; whether each is asserted truth, new action, belief, rumor, hypothetical or flashback; candidate identities and ambiguity. Detect implicit capabilities such as using a missing object or buying goods at a destroyed venue. Code resolves candidates and fetches records from the full active indexes; semantic search is available for paraphrases/missing links.

### History/state retrieval and coverage

These are controller-owned operations, not model-authored facts. Their inputs/results and manifest must satisfy `WORLD_STATE_CONTEXT_CONTRACT.md`. Schemas must distinguish actual occurrence, diverged/prevented canon, future proposal, missing evidence and current UNKNOWN. Include branch/source/world revision, scene checkpoint and staged-overlay identity. A concrete history record and its relevant outcome must reach reasoning context when either retrieval trigger matches. Validate source IDs/spans and require coverage of discovered material references before accepting a draft.

## 5. Repair prompts and operating errors

A repair request cites the exact violated requirement and preserved facts, and asks for a revised complete draft or plan. It must not tell the model to rewrite prior accepted history. Validate the repaired result again; the repair instruction is not proof it worked.

Re-extract references/claims and re-query history/state from every repaired draft. A repair that mentions a new event or redirects through another entity creates new coverage requirements. Use the existing bounded repair budget; do not bypass coverage or create an infinite query/repair loop. Cache reuse is permitted only under matching revision, scene-time and overlay fences.

Timeouts, API failures, unsupported model schemas, and save failures appear as out-of-band plugin UI status. Do not generate an in-story explanation for them. On cancellation or failure, the user's input and last valid selected reply remain recoverable. A reply may be shown only when its story content passed the gate.
