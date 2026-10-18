# Actual-history retrieval and world-state context contract

Handoff revision 1.1. This is a mandatory part of Canon Engine, not a future memory enhancement. It applies to every kind of established occurrence and consequence: player actions, GM-established events, enacted NPC actions, adjudicated canon, and offscreen history. Places are only one example.

## 1. The user's binding OR rule

**An actual past event must be retrieved into the GM's reasoning context when it is causally relevant OR directly/indirectly mentioned. Either condition suffices.** Do not require both, a relationship to a Hard Anchor, player observation, recent occurrence, or a matching lorebook keyword. The same rule applies to the evaluator and repairs.

Examples: a player theft explains a missing key; an unrelated past battle is mentioned in conversation; an NPC refers to “what you did at the banquet”; a draft routes the player through a destroyed market; a previously signed treaty affects an NPC's response. All require supported actual history, even if no pending anchor uses it. A completed celebration mentioned nostalgically still needs its occurrence and actual outcome retrieved even when it has no remaining mutable-state effect.

“Canon” is not automatically “already happened.” Use the selected branch's enacted/adjudicated history and documented bootstrap, not an event's original summary just because it exists in the pack. A prevented canonical death is a deviation, not an actual death; a proposed player action or future plan is not an occurrence. A query can and should return “did not occur in this branch,” “only planned,” or “not established” when relevant. Do not promote a proposal to history while retrieving it.

## 2. Required retained data and indexes

Maintain both an actual-occurrence view and a state-at-time projection. A state snapshot alone loses historical acts whose effects were later reversed. An event log alone does not efficiently establish what remains true now.

For each validated occurrence, retain a stable ID, concise account of what actually occurred, actors/affected entities, place/time when established, actual outcomes, evidence/source provenance, knowledge boundaries, and supported causal links. Use explicit source dependencies and separately labeled narrative causality; a record's source dependency is not necessarily an in-world causal relationship. Canonical edges are candidates for review, not proof that a divergent actual event had the same cause. Record significant narrative occurrences even when no new formal predicate is needed.

Index canonical and runtime entity identities/aliases, actual occurrences, event descriptions/reference phrases, affected entities, story intervals, and validated actual causal relations. Entity and occurrence lookup must work without traversing the Hard graph. Combine deterministic identity/time indexes with a bounded semantic candidate search over ledger summaries/evidence for paraphrases, pronouns, indirect references and missing causal links. A vector store is optional, not an additional installation requirement or source of truth. The hundreds-to-low-thousands scale permits a simple implementation.

All validated effects persist independent of their source event's HARD/SOFT/FREE classification, age, arc membership or graph connectivity. A destroyed place stays destroyed until an explicit later supported change. Conversely, a later restoration changes its present condition without erasing its destruction. Keep records and evidence sufficient to answer both “what is there now?” and “what happened here before?”

Do not store arbitrary new state as unquestioned truth merely because an extractor proposed it. New records follow the same adjudication, source, agency and transaction gates as existing ones. Cache eviction may remove cached bytes; it must not remove reconstructible history or turn its consequences into UNKNOWN.

## 3. Retrieval scope: causal OR mentioned, plus scene constraints

Build three complementary sets and use their union:

1. **Causal history:** established causes, prerequisites, consequences and dependencies needed to understand/adjudicate the current actions, scene or claims. Follow relevant transitive chains, including player-created alternatives and offscreen causes. Do not stop at the nearest event or an arbitrary top-k cutoff if the omitted link changes interpretation. Graph traversal is a starting point; semantic assessment must expand incomplete, unknown or global scope.
2. **Mentioned history:** actual events, actions and changes directly or indirectly referenced by the user's input, scene framing, selected recent context, current plan or candidate GM text. Resolve event names, paraphrases, aliases and references such as “that explosion,” “the man I rescued,” or “our agreement.” Retrieve them even when there is no causal connection to the current task and even when their effects have since ended.
3. **Entity/scene constraints:** current state and supporting occurrences for people, places, objects, organizations and relationships that the response depicts or relies on. Include known routes/destinations and established environmental/service dependencies. Describing ordinary activity is a state claim: shopping requires an operating venue, greeting someone in person requires a compatible life/location state, using an object requires compatible existence/possession.

For each matched event, supply its actual occurrence/status, actual outcome, story-time context, relevant causes/consequences, subsequent changes and provenance handles. The model must receive the information, not merely an inaccessible record ID or “history exists” flag. Retrieve source excerpts when summaries cannot resolve a material interpretation or the task asks for exact historical detail. A lookup of a place's present status alone is insufficient when the user asks who destroyed it or mentions a past visit.

The rule does not mean past events happen again when mentioned. It also does not require replaying every full transcript into every prompt. Compact faithful event records preserve relevant facts; causal chains can be summarized without discarding their events or changing relationships. An entity-name match must fetch its relevant current constraints and mentioned/causal history; it does not automatically make every unrelated old conversation with that entity part of the current scene. Explicit requests for the entity's whole history expand the scope accordingly.

## 4. Controller-owned query contracts

Implement and document typed runtime APIs equivalent to these responsibilities. Exact code names are flexible; their semantics are not:

| Operation | Input | Required output |
| --- | --- | --- |
| Resolve references | Mention spans, scene/source context, canonical/runtime registries | Resolved entity/event IDs, candidate matches, ambiguity, or genuinely new/unresolved references |
| Retrieve actual history | Resolved references, causal scope, branch/source revision, scene cutoff | Actual occurrence records, outcomes, relevant causal closure, later changes, evidence handles, non-occurrence/unknown distinctions |
| Query entity state | Entity IDs, scene checkpoint, active revision, staged overlay | Known facts and validity intervals, support records, applicable contextual constraints, explicit UNKNOWNs |
| Assemble reasoning context | Union of retrieved history/state and ordinary obligation inputs | Faithful bounded context, knowledge boundaries, lookup manifest |

Story checkpoints include normalized story time and a supported ordering within that time. Do not invent ordering when simultaneity is material and unresolved. For an uncertain interval, report state transitions within it rather than choosing a convenient endpoint. A flashback uses the then-valid facts; the present framing can separately receive later facts with clear temporal labels.

Query against an immutable active-branch revision plus an explicitly identified operation overlay. Apply staged events only after validating them against the preceding state; within one reply, later scenes can use earlier validated-in-operation changes. They remain uncommitted until the whole reply is accepted. A claimed intact building cannot establish its own restoration merely to pass its check. A proposed genuine repair/restoration requires its own action, cause, time, authority and validation.

Return “no supported restoration through checkpoint T in revision R,” not an omniscient claim about unrecorded reality. Missing data is not proof of normality, intactness, death, non-occurrence or actor knowledge. New compatible world details can be introduced through ordinary adjudication with runtime provenance; do not freeze all creativity because a predicate was previously UNKNOWN. A material unresolved reference or contradiction needs resolution, a safe revision of unsupported prose, or the existing actionable validation-failure path.

## 5. Before generation and after every candidate draft

Before generation, extract the user's references and expected scene scope, resolve them, and supply both retrieved actual history and current constraints to the GM. Merge this with the causal/anchor plan context. If a prior player event is mentioned, load it now even when it contributes nothing to the current anchor.

After generation, discover references and state-dependent claims from the **whole candidate reply**, not just a supplied list of entities or obligations. Include direct and indirect past-event references, newly invented route stops, incidental NPCs, purported recollections, dialogue, and implicit capabilities. Label whether each is narrator assertion, proposed new event, belief, rumor, deliberate lie, hypothetical or flashback. NPC false beliefs can be valid fiction when supported as beliefs; do not silently treat their speech as world truth or “correct” every rumor into omniscience.

The controller resolves those references and performs fresh history/state retrieval over the complete active ledger/index. An evaluator restricted to the generator's original context would repeat its blind spot. Feed the expanded factual context and evidence to evaluation and, on failure, to the next GM repair. Retrieval cannot depend on an optional GM tool call or provider-native function calling.

Re-run discovery, retrieval and validation for **each** repaired draft. A repaired market scene might introduce a demolished bridge; a correction of one historical anecdote might introduce another false recollection. Check all of it again. Reuse matching cached results only when their identity, revision, scene checkpoint and overlay still match. Use the existing maximum of two repair attempts; do not introduce an unbounded loop. On exhaustion keep the last accepted state and expose normal retry/recovery controls.

When the first draft invents an entity/event reference that was impossible to predict, the initial generation may lack its history. It must remain private. Newly retrieved records must enter the model's final narrative review before publication, even if the initial draft happens to look correct. The structured evaluator call can perform that review if it receives the complete candidate plus the expanded factual context and explicitly evaluates whether to retain or repair the narrative; no separate extra call is mandated. A controller merely caching the record or checking IDs without feeding its content to model reasoning is insufficient. A compatible reviewed draft can be retained unchanged. This is the required observable guarantee; do not pretend the initial model knew an unrequested record.

## 6. Coverage manifest and acceptance gate

For every final candidate record a controller-owned manifest tied to session, branch, revision, source prefix, pack hash, operation ID, exact candidate content hash, scene checkpoints and staged-overlay hash. Include:

- Discovered references/claim spans and their kind, resolved IDs, ambiguity or new-entity disposition.
- Retrieval trigger(s): causal, mentioned, entity/scene constraint. Multiple triggers are allowed; either causal or mentioned suffices for history retrieval.
- Retrieved occurrence IDs/outcomes and causal support, queried entity facts/UNKNOWNs, checkpoint/revision, and evidence handles.
- The context actually supplied to the evaluator/repair; checked claims, contradiction/knowledge findings and disposition.

The controller checks that every discovered material reference/claim has the required lookup and evaluation, that results match the active revision/time, and that repair introduced no unchecked material scope. Empty lookup results are explicit, not silently equivalent to “safe.” A bare evaluator `valid=true` is insufficient. Coverage is deterministic over the discovered scope; semantic discovery remains fallible. Report this limitation honestly and test indirect references and implicit claims rather than claiming mathematical completeness for arbitrary prose.

For an accepted reply, retain a compact manifest or equivalent audit record. Keep rejected attempts out of actual history. Debug views can expose fetched records and coverage without private model chain-of-thought, API secrets, or unnecessary private-chat dumps.

## 7. Knowledge, spatial effects and context budget

GM knowledge, world truth and player/NPC knowledge are separate. A player can observe ruins without knowing the cause, culprit or date. The GM can receive necessary hidden facts labeled as restricted, or a safe consequence summary if the cause is unnecessary. Do not suppress a real physical constraint because its cause is secret; do not announce an offscreen event merely because the engine recorded it. A historical reference can be mistaken in character while the GM's underlying reasoning remains informed.

Honor supported containment and regional effects: a known shop within a fully destroyed block cannot be presented as operating normally without a supported exception/change. Fetch the parent area's relevant state and actual scope of destruction. Partial district damage does not imply every building or resident was destroyed. Use existing entity-reference predicates and runtime relations when needed; no complete map or new geographic engine is required. Never invent topology or casualty totals to fill gaps.

Required retrieved history and scene constraints are not lower priority just because they are FREE, old, offscreen or unrelated to a Hard Anchor. Compact records, eliminate duplicate prose, fetch detailed evidence on demand, and partition validation with shared revision/time fences when necessary. If essential context still cannot fit, surface the existing capacity/recovery error; do not drop a required matched event while claiming the OR rule was satisfied. Do not inject the entire world's history on ordinary turns.

In the packet this means: a history record lists only the latest later change per fact (with a count of earlier ones); a fact's support note is omitted when its record is already listed; rules that hold for every entity (no other supported change; an unlisted property is UNKNOWN) and the knowledge-boundary rule are stated once; retrieval triggers stay in the coverage manifest. The scene entities stored for a reply are the reviewer's scene plus what the reply names, not everything the review looked up, so the next turn's seeds do not accumulate.

## 8. Source changes and release evidence

Editing/deleting either role's message, changing a swipe/branch, regeneration, continuation, reload and binding changes must rebuild/invalidate affected occurrence indexes, causal links, state projections, query results, overlays, context packets and coverage manifests. A surviving summary is not independent evidence for a removed event. A late retrieval/evaluation result is fenced exactly like a planner response. Whether the removed event related to an anchor is irrelevant.

Deleting one source does not remove independently supported events, nor prevent a still-applicable canonical event from occurring again on the rebuilt story-time path. Re-adjudicate from the valid prefix. Retained contradictory suffix text follows the existing conflict-recovery rules; do not invent a repair to justify it.

Release requires W01–W20 in `ACCEPTANCE_TESTS.md`, including actual outgoing-context inspection. Demonstrate both retrieval triggers separately, player/GM/canonical origins, historical occurrences whose effects ended, pre-generation retrieval, draft-only discovery, repair expansion, offscreen persistence, source revisions and stale asynchronous results. The sample `examples/unrelated-history.canon.json` and walkthroughs provide reproducible fictional seeds; the tests must also include dynamically created player/GM events absent from the pack.
