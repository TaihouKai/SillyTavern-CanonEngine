<p align="center"><img src="assets/logo.svg" width="200" alt="Canon Engine logo"></p>

# Canon Engine — SillyTavern extension

Canon Engine keeps the **actual history** of an interactive story and steers its future toward immutable, author-selected **HARD anchors**. The player changes the route; the defined anchors stay mandatory. Everything else in the original story (SOFT and FREE events) is default history that the player may change. The world reacts to the player as a person in it: their identity, organizations, relationships and decisions shape who reaches out to them and how. It is a standalone browser extension: no database server, daemon or companion service.

- Input: a history pack `*.canon.json` (pack schema `1.0.0`, see `docs/HISTORY_PACK_AUTHORING_GUIDE.md`). SillyTavern World Info / lorebooks are **not** accepted and are never converted.
- Play happens in the normal ST input box. Every GM reply is generated privately, checked, and only then published.
- Editing or deleting **any** user or GM message, swipes, regenerate, continue, branches and reload rebuild the world from the selected transcript.

Chinese player guide: [`docs/USER_GUIDE_ZH.md`](docs/USER_GUIDE_ZH.md). Website, with the engine running live on a real chronicle: <https://taihoukai.github.io/SillyTavern-CanonEngine/>.

## What it does

Canon Engine is three things working together: a **turn pipeline** that runs around every GM reply, a **chronicle** of the world (the history pack and what this playthrough made of it, with a timeline window to see it), and the **player in the world** (who the player is, who knows it, and how the world reaches them). Tools around them build and check history packs.

### 1. The turn pipeline

Each player message goes through these steps before a reply is published. The status bar shows the current step; its tooltip lists how long each took.

| Step | What happens |
| --- | --- |
| **Reconcile** | The world is rebuilt from the chat as it stands: edits, deletions, swipes and branches at any position are replayed deterministically, and only changed or dependent messages are examined again. |
| **Read the Persona** (first turn, and on request) | The player's identity is read from the standard Persona: summary, public identity, organizations (each one checked separately: member, about to join, former, or only connected), places, abilities and resources, roles in life, voice, nature (how their power or condition shows, what it lets them perceive), defenses, relationships, who knows what about them, and who recognizes them on sight. Lorebook entries for what the Persona names are read with it. |
| **This game's world** | Where the Persona changes the setting (lines marked `(world change)` or `(本局设定)`, and changes the analysis finds), the matching lorebook entries and pack texts are rewritten for this game only, with code checking that only the contradicted sentences change. A name that states what a change makes untrue is renamed (the "Seven" of something with an eighth). |
| **Read the player's message** | Actions, dialogue, claims, engagement statements (accept, decline, defer, answer, refuse), out-of-character parts (an `OOC` keyword), and requested time leaps. |
| **Retrieve** | The history that matters now: everything causally linked to or mentioned in the scene, entity and scene state with provenance, canon events under way, starting soon, or within their window, and where other characters stand in the next 24 hours of the original story. |
| **World reaction** | Whether and how the world reaches the player now: an invitation, a request, information, a probe, a consequence, an encounter; a required contact when the player's own organization takes part in an event; a small matter from the player's own life on a quiet day; companions who know about their next event. |
| **Plan** | A planner prepares the next two pending HARD events from the actual situation: steps that are intentions, never the player's actions. When ordinary plans fail, forced convergence may be authorized. |
| **Character plans** | People in the scene who think before they act get a call of their own: what they read from the moment, what they want, their move, and for each read whether they say it, show it or keep it. People who rarely think first act on instinct. |
| **Draft** | The GM writes the reply with scoped rules: what the GM may write for the player character (dialogue, reactions, small actions, …) and what stays the player's. |
| **Review** | The draft is checked against the world: contradictions, HARD outcomes, actions taken for the player, characters acting as caricatures, refusals renewed in another form, the reply's own clock. A failed draft is repaired (twice, plus one final HARD repair). |
| **Settle** | Events whose window closed are settled offscreen (as written, judged from actual play, or not happening), the impact on plans is assessed, and the reply is saved with its facts, story time and causes. |

### 2. The chronicle and the timeline window

- **History packs**: events classified HARD (must happen with their exact outcome), SOFT (the default course) and FREE (background), each with a time window, a structured summary, preconditions, effects on facts (who is alive, where, injured, who belongs to which organization, who leads it), cast, and relations. Packs may declare **time frames** (another era or realm with its own local time), people's **natures** (how a power or condition shows in everyday life, with what it lets them perceive) and **ways of thinking** (how much effort they put into thinking before acting).
- **Timeline window** (the diagram icon in SillyTavern's top bar): boxes on a real time axis, lanes for HARD / SOFT / FREE and story events, relations and the actual causes recorded in play, and the current story time. Two views: **This playthrough** (every canon event's actual status and the events play created) and **Pack (canon)**. Future events stay hidden until *Show spoilers* is ticked.
- **Actions on events**: ☆ Focus (bring the player character near an event when it starts), Force complete, Conclude event, Link story events, Re-analyse, Tidy my events (group story events into episodes), Scene frame.
- **Members** and **Natures** views: every organization's leader, members and status now (with since when), with the membership changes of the pack; every person's nature and way of thinking, the player's own first.
- **Time leap**: skip ahead to a given time; the canon events crossed are settled, and a long leap is split into chapters.

### 3. The player in the world (Inspector)

- **Identity**: what the Persona was read as, the organizations with the player's standing in each (member, joined or left in play, not joined yet, former), places, roles, nature and perceptions, defenses, and what the engine adjusted.
- **Relationships**: connections and who knows what about the player (that their organization exists, who they are, specific secrets), each with its source (Persona, implied, play, manual) and how play changed it; editable.
- **Contacts**: what the world brought to the player, one entry per matter, waiting ones first; accept, decline, done, accept again; possible contacts still to come (spoilers).
- **Decisions**: every engagement decision in effect; a decline is a wish, *Make binding* makes it enforced; an OOC "stop this line" is binding at once.
- **This game's world**: the changes in effect, the rewritten or disabled lorebook entries and pack texts (editable), what was not checked and why.
- **World and Engine pages**: facts with provenance, actual history, deviations, anchors, the plan, and in debug mode the final GM prompt, traces and raw JSON.

### 4. Reliability

- Replies are buffered and published only after validation; no JSON or planner text reaches the story.
- Edits, deletions, swipes, regenerate, continue and branches rebuild the world; a retained message that no longer fits is kept and marked, with *Go to message* and *Branch here and regenerate*.
- Operational errors are shown out of story with *Retry* and *Details*; input and the last valid state are always kept.
- Backups, pack updates with a preview of what changed, a backup analysis connection, per-turn tokens and cost, and an alert when a reply is ready.

### 5. Tools

- **canon-lint** (`dist/canon-lint.mjs`): validates a pack's structure and semantics.
- **canon-pack-builder** (`tools/pack-builder/`): builds a pack from a work's story sources (game scripts or wiki arc pages) with a cheap model; code does dates, timeline, starting state, membership changes and assembly, and every build runs quality checks over the whole pack.
- **Horae**: story time can follow Horae; Canon Engine publishes its clock for other extensions.

## Requirements

| Item | Supported / tested |
| --- | --- |
| SillyTavern | 1.19.0 (release ref `06bde939`, 2026-09-14). Other versions: see `COMPATIBILITY.md` |
| API | Chat Completion through your existing ST connection (any provider; no JSON-schema or function-calling support required) |
| Chat type | A single controlling GM character chat. Group chats are refused (explicit guard) |
| Horae | Optional. Tested with the Horae 1.15.1 fork `TaihouKai/SillyTavern-Horae-Metadata` in metadata mode (read-only public API) |

## Install

The repository folder **is** the extension (it contains `manifest.json`, the built bundle `dist/index.js` and `style.css`; no compilation needed).

1. *Extensions → Install extension* with the repository URL, or copy (`git clone`) this folder into **one** of
   - `SillyTavern/data/<your-user>/extensions/SillyTavern-CanonEngine`, or
   - `SillyTavern/public/scripts/extensions/third-party/SillyTavern-CanonEngine`.
2. Reload SillyTavern. *Extensions* now shows a **Canon Engine** drawer.

**Update:** *Extensions → Manage extensions → update*, or replace the folder (`git pull`) and reload. Campaign data lives in your chat files, not in the extension folder, so updating never touches it.

**Uninstall:** delete the folder. Chats keep an inert `canonEngine` metadata block; **Unbind** in the drawer removes it from a chat.

The interface is in Chinese or English (*Advanced settings → Language*). Labels below are the English ones.

## The settings drawer

The drawer is split into cards; every option has an (i) icon with a short explanation.

- **This chat:** the pack library, enabling, and once bound: Inspector, Retry, Re-check chat, Export backup / Import backup, Change pack…, Pause engine / Resume engine, Unbind.
- **Model and replies:** the analysis connection (and a backup), reply length, OOC keyword, character plans and their model, alert when a reply is ready.
- **The GM may, for the player character…:** dialogue, reactions and inner thoughts, small actions, trivial everyday matters, movement, items that matter, abilities, combat, decisions, revealing secrets; and whether other people's powers may reach the player character's secrets.
- **Event log:** grouping events of the same scene, and following Horae's story time.
- **Persona:** whether Canon ignores Persona Library sections.
- **Advanced settings:** limits, timeouts, budgets, debug mode, language.

## First-time setup for a chat

1. **Choose an analysis connection first** (see below). A chat can only be enabled once one is chosen.
2. Open the GM chat. Pick a saved pack from the **Pack library** (**Enable with this pack**) or click **Enable for this chat (import .canon.json)** and choose a file. Every valid imported pack is saved to the library automatically (`data/<user>/user/files/canon-pack-*.json`), so it survives restarts and Docker container updates whenever `data/` is a volume. **View** opens a pack in the timeline window (its canon view) without enabling it for the chat. **✕** removes a pack from the library; chats that use it will ask for its file again.
3. The wizard shows title/version/hash, validation result, coverage and the HARD count (or precise errors — a World Info file gets a specific "not a history pack" error).
4. Set the **starting time** on the pack clock (`D<day> HH:MM`), as a calendar date (`2020-07-20 08:00`, using the pack's day-0 date), or pick "start just before event …". No real-world clock is ever used. Horae's current story date/time is shown when available.
5. Confirm. For an existing chat every persisted message is examined once (not just the model's context window). Persona, inventory, skills and Horae state are **not** reset. A summary shows the mapped start, examined messages, deviations and unresolved issues; **Undo binding** undoes it.
6. Follow the setup notices: disable the old *history/timeline* lorebook (ordinary setting lore may stay), and remove the old GM-card sentence "history comes from World Info" if present — the engine injects scoped replacement rules (`src/runtime/prompts.ts`, from `docs/GM_INTEGRATION_RULES.md`) while enabled; your card file is never modified.

## Analysis connection (required choice)

Each turn the engine makes several internal analysis calls (read the player's message, find references, review the reply, plan, settle offscreen events) that need careful JSON, not literary quality. Choose either a saved Connection Profile or, explicitly, **Same as the chat** (costly with big models). Chats enabled before this was required keep working and show a reminder.

1. In SillyTavern, connect to the analysis model once and save it as a **Connection Profile** (plug icon → Connection Profiles → save). A fast, cheap, non-reasoning model works best.
2. Switch back to your story connection.
3. In *Extensions → Canon Engine*, choose that profile under **Analysis connection**.
4. If the analysis model is a reasoning model, put its "thinking off" parameter in **Extra request parameters** (Venice: `venice_parameters: {disable_thinking: true}`). SillyTavern takes Include Body Parameters from the active chat preset, not from the profile, so set them here.

The GM's story replies always use the chat's own connection; only internal analysis uses the profile (at `taskTemperature`, default 0.2). A backup analysis connection takes over when the main one fails. If the chosen profile is deleted, turns stop with an actionable error instead of silently using the story model. **Character plans** can use a connection of their own (**Model for character plans**; default: the analysis connection).

## Playing

- Type and press Send as usual. A status bar above the composer shows *Reconciling / Planning / Generating / Validating / Saving*, with **Cancel** (the ST stop button also cancels). After a turn it shows how long each step took and the tokens and cost the provider reported; hover for details (steps, resent model outputs, small automatic fixes).
- The reply appears only after validation (buffered, not streamed). No JSON, labels or planner text is shown in the story.
- Swipe, regenerate and continue work through ST's normal buttons; each candidate is validated the same way.
- A spoiler-free red banner may appear beside a reply after a major deviation. It belongs to that reply variant and disappears if the reply is deleted or swiped away.
- Mark out-of-character parts of a message with the **OOC keyword** (default `OOC`): they direct the GM or the engine and are never story.
- **Inspector**: a drawer at the right with grouped pages — Player (Identity, Relationships, Contacts, Decisions), World (This game's world, Facts, History, Deviations, Anchors), Engine (Plan, Debug) — an overview with what needs you, a filter per page and cards with their actions; recovery status. Future anchors and plans stay hidden until you tick *Show spoilers*. *Debug mode* (advanced settings) adds the final outgoing GM prompt, operation traces, coverage manifests and raw JSON.

### How the original story is handled

- **HARD** events always happen with their exact content, outcome and time bounds; only the route changes. A planner prepares the next two pending HARD events from the actual situation.
- **SOFT / FREE** events are default history: they happen as written unless the story changes them. When their time window opens, the GM is told they are under way (if still possible). The GM also gets, as background only, what other characters currently know, want and are doing according to the next 24 hours of the original story, so nobody notices or chases something earlier than they would — this is explicitly not a list of things that must happen.
- When a SOFT/FREE event's window closes without the story reaching it, it is settled offscreen: as written when its preconditions hold and the story has not touched its people; judged by the model from actual play when it has (or when a prerequisite happened differently); recorded as not happening when a precondition was broken.

### The player in the world

On the first turn of a new chat the engine reads the Persona into the player's identity (see *Read the Persona* above). From then on:

- **Who knows the player** is kept in three levels: that their organization exists, who they are, specific secrets. Anything the Persona does not mark secret is public; what is secret by nature (membership of a hidden organization) is secret even when unmarked. **Who recognizes the player** on sight (their school, regulars, a whole street, everyone when famous) shows in scenes where those people are.
- **Organizations** the Persona puts the player in include them in the organization's members (and as its leader when the Persona says so); joining or leaving in play is recorded. An event the player's own organization takes part in reaches them as a required contact.
- **Relationships and knowers follow play**: a meeting that matters, friendship, a falling-out, a death; someone learning a secret, also through their own power.
- **The world reaches out** at most once per reply, as an option the GM may use: never history, never consent on the player's behalf. Quiet days bring a small matter from the player's own life.
- **Decisions** are binding and replayable: a decline is respected as a wish; *Make binding* enforces it; deferring holds until the time named; going to an event in person after declining it joins it.
- **The player character has what anyone has**: their nature and what their power perceives are read like any person's; a power that reads minds reaches others' secrets, and others' powers reach theirs unless the Persona shields them or the player turns it off. Only working out the player character's next move is never done for them.
- Changing the Persona later is noticed once: **Update this game's identity** (from here on) or **Keep this game's identity**. **Read the Persona again** is always on the Identity page.

### Timeline window

The **diagram icon in SillyTavern's top bar** opens the timeline window. Boxes sit on a real time axis (each spans its event's window; long gaps are compressed); lanes separate HARD / SOFT / FREE events and events created in this playthrough; arrows are the pack's relations (enables / motivates / precedes / related) and, in the playthrough view, the actual causes recorded during play. A dashed red line marks the current story time.

- **This playthrough:** every canon event's actual status (occurred / changed / did not happen / under way / future) plus new events from play. Future events stay hidden until *Show spoilers* is ticked.
- **Pack (canon):** the canonical graph as authored (contains spoilers).
- Search, arc filter, lane toggles, drag to pan, wheel to zoom, *Fit* to see everything; click an event for its summary, required outcome, actual account and relations.
- **Force complete** (red, under a canon event's description in *This playthrough*, click twice to confirm): records the event as happened along its original route, with its effects and HARD outcomes; later events that depend on it see it as happened, and the plan is rechecked on the next turn. **Undo force complete** undoes it.
- **Conclude event**: an event under way, or past its window and unsettled, is judged now from what actually happened. **Link story events**: an event that already happened in the story under another name is linked to it. **Re-analyse**: an event's result is judged again, with what the story showed after it.
- **Tidy my events** (top of the timeline): the analysis model groups your story events into episodes (consecutive beats of one storyline), one box each with a title and a short summary. Display only: history, causes and what the GM sees are unchanged; later events show as usual until you press it again; **Undo tidy** removes the grouping.
- **Time frames** (packs that declare them: another era reached by time travel, a realm where time runs differently): the axis stays the main clock; events in another frame get a colored stripe and show their local time; *Now* names the scene's frame; **Scene frame** sets it by hand when the engine missed a move. See the authoring guide §3.4.
- **☆ Focus** (future or ongoing SOFT/FREE events): from 24 hours before the event's window until it ends, the GM gives your character natural in-world chances to be there when it starts (an invitation, news, an errand) without forcing its course or result; the planner may add up to two such steps. Focus is cancelled automatically once the event is settled or its window passes.
- **Members** and **Natures** (buttons at the top): the organizations as they stand now, and every person's nature and way of thinking.
- **Time leap**: jump to a later time in one go; the canon events crossed are settled, HARD events still happen, and a long leap is split into chapters by the pack's arcs.

### Edits, deletions and conflicts

Edit or delete any message with ST's normal tools. The engine finds the earliest changed position, replays the unchanged prefix deterministically (no model calls), re-examines changed and dependent messages, and rebuilds facts, plans, banners and Horae context. If a retained later message can no longer follow your edit (example: you change "I save Mira" to "I leave", but a later GM reply still narrates the rescue), its text is **kept**, the message is marked, and generation pauses with two actions: **Go to message** (edit that message) or **Branch here and regenerate** (native branch + regenerate). Nothing is auto-deleted or retconned.

### Errors and recovery

Operational problems are shown out of story: invalid pack, unresolved starting time, conflicting retained transcript, provider failure, invalid model JSON, narrative validation failure (after at most 2 repairs, plus one final repair when a HARD event is still broken: the planner first works out a concrete in-world route from the actual situation, and the repair realizes the HARD outcome along it — never an unexplained vanishing), stale response, incompatible adapter, stale memory, persistence failure, context capacity. **Retry** reruns the failed turn or re-saves after a failed save; **Details** shows a copyable report of every attempt. Your input and the last valid state are always kept; no empty or error message is ever added to the chat.

## Reply length, scene grouping, story time

- **Reply length** (optional): a length target such as `about 800–1200 words`, added after the latest message to every draft and revision. It asks for both ends of the range: no wrapping up before the lower bound, closing the scene near the upper bound. No extra request is made.
- **Group events of the same scene** (off by default): consecutive beats of one ongoing scene go into one story-event box. A box holds at most 4 beats within 90 minutes in one place; leaving a building, a vehicle ride, arriving elsewhere or a gap of about 30 minutes starts a new box, and canon events always get their own box. Every beat keeps its own record; only the grouping changes.
- **Follow Horae story time** (on by default): with Horae installed and up to date, each new turn starts no earlier than Horae's story time at the end of the previous reply; the reviewer estimates how long the reply itself takes, and a time the reply reads off a clock bounds it. Not used for swipes/regenerations/continuations, while Horae is busy or stale, or when Horae is behind or more than 3 days ahead.

## Backup, restore, pack updates

- Campaign data is stored inside the chat file (`chat_metadata.canonEngine`), so ordinary ST chat backups include it. A chat keeps only a reference to its pack; the pack itself is in the library.
- **Export backup** downloads a JSON backup (contains the full pack and hidden/spoiler data). **Import backup** restores it into the open chat and revalidates it against the transcript.
- A chat stays pinned to the pack it was bound with. To change versions use **Change pack…** (or **Update** next to a library pack): it previews changed/added/deleted event ids and changed HARD contracts, requires a backup export first, then revalidates every stored message against the new pack deterministically; only messages whose basis really changed are examined again.

## Making a history pack

`tools/pack-builder/` (canon-pack-builder) builds a pack from a work's story source: game scripts (FGO via Atlas Academy) or wiki arc pages (MediaWiki). Code does the mechanical parts (download, parsing, who is present, dates and the timeline, starting state, membership changes, assembly, `canon-lint`, quality checks); a cheap model (DeepSeek Flash by default, any OpenAI-compatible API) writes the summaries, classifications, entity descriptions, natures and ways of thinking, and judges what code cannot (whether a death holds, whether a state lasts). Python 3.10+, standard library only. A new work needs a project file in `tools/pack-builder/projects/`, and an adapter when its source has a new format. Setup, commands and costs: [tools/pack-builder/README.md](tools/pack-builder/README.md) (Chinese). Downloaded source text, model caches and your API key (`config.json`) stay local; they are git-ignored.

`examples/` holds small demo packs used by the tests, and `toaru-index.canon.json`: the *A Certain Magical Index* chronicle built with canon-pack-builder, which the website's demo runs on (sources and license: [examples/README.md](examples/README.md)).

## Context size

The engine context (rules + retrieved history + state) adds roughly 3–20k tokens to the story prompt, growing with the size of the pack and how much has happened (a large pack after a few days of story time: about 15k). Each turn also makes several analysis calls (extraction, discovery, review; world reaction, character plans, planning and offscreen adjudication when needed) on the analysis connection; the review is the largest, about 1–2× the engine context. Use a model context of at least 64k tokens for a large pack. After each turn the status line shows the tokens your provider actually reported for all of the engine's requests in that turn (hover for input/output and the number of calls). SillyTavern's own token counter may overstate the total: it double-counts in-chat injections across its categories and, for model names it does not recognise, counts with an OpenAI tokenizer (for Chinese text with a Qwen model about 1.6× too high). If SillyTavern trims the engine context because the prompt does not fit, the turn stops with a *Context capacity* error instead of generating an unchecked reply.

## Advanced settings

`maxRepairs` (2), `maxOrdinaryPlanner` (2), `forcedPlannerAttempt` (on), `budgetChars` (context packet budget, 60000; when the full packet does not fit, a compact form that keeps every fact is tried first), `horizonMinutes`, `taskTimeoutMs`, `draftTimeoutMs`, `taskTemperature` (0.2), debug mode, language. Required matched history and scene constraints are never silently truncated; if they cannot fit, the turn stops with a capacity error.

## Cost and latency

Each managed turn uses your connections several times: reading the player's message, the draft, whole-draft discovery and review; plus world reaction, character plans, planning, offscreen adjudication and impact assessment when needed, and up to two repairs (each repeats discovery + review; a third, final one with a fresh plan only when a HARD event is still broken). Expect roughly 4–8 model calls for an ordinary turn. Every structured reply is first normalized against its JSON schema; fields that decide a check (a player action's quote, a verdict, a HARD status, a violation, the review decision) are never invented, so a reply missing them is sent back. Malformed helper output keeps its complete items or falls back to built-in name matching; every such fix is listed in the timing tooltip and in *Details*.

## Known limitations

- **Live-model testing is limited.** Besides the deterministic mocked suites, live sessions were run through Venice (`qwen-3-8-flash`, `qwen3-235b-a22b-instruct-2507`, `z-ai-glm-5-3-flash`, DeepSeek 4.1 Flash) and DeepSeek's official API with Chinese packs of 200 to 1,900 events. Expect up to a few minutes and a few US cents per turn on such models. Small models produce imperfect JSON; the engine repairs unambiguous slips and retries, but other providers/models are untested. The deterministic gates bound but cannot eliminate semantic model errors.
- Group chats are unsupported (activation is refused). Simultaneous writes to the same chat from different browsers/devices are unsupported; within one browser profile a second tab is blocked from writing. ST's server-side chat integrity check is the only cross-device protection.
- Engine-managed replies are buffered (no token streaming). *Continue* is implemented as a private continuation instruction (not ST's assistant prefill) and the whole revised message is validated.
- When Horae memory is stale after edits and its supported re-analysis cannot refresh it in time, Horae's whole injected snapshot is excluded from that reply (not partially repaired).
- Semantic candidate search is lexical (word/CJK-bigram IDF) plus model-side mapping over an occurrence catalogue; no embeddings.
- Background generations that would post directly to chat (`quietToLoud`) are blocked while the engine is enabled.

## For other extensions: clock API

Canon Engine publishes its committed story clock (read-only):

```js
const clk = window.CanonEngine?.api?.getClock?.();
// { active: true, packId, tick, tickHi, precision, day, minute, date: "2020/09/18" | null, time: "20:00", weekday: 5, label: "2020-09-18 20:00 (D61)" }
document.addEventListener('canon-engine:clock', (e) => console.log(e.detail)); // fires when it changes
```

`active` is false when the current chat is not bound or the engine is disabled. A pack with time frames adds `frame: { id, name, main, local }` (the scene's frame; the other fields stay the main clock). `date` is null when the chat has no day-0 calendar date. The Horae fork above reads this clock to catch up after canon time skips.

## For developers

| Path | Content |
| --- | --- |
| `src/core/` | The engine, with no host: `domain/` (pack validation/lint, time, reducer, scheduler, world query), `runtime/` (replay/reconcile, operation pipeline, planner, adjudicator, context/retrieval, narrative integration, gate, prompts, model task runner; `host.ts` is what a host provides), `ui/` (timeline window, inspector, texts). Its public API is `src/core/index.ts`; built alone as `dist/canon-core.mjs` |
| `src/hosts/sillytavern/` | The SillyTavern host: adapter (managed generation, prompt hooks, persistence), Horae as the scene tracker, World Info as lore entries, settings drawer, wizard, library, notifications, clock API, writer lock |
| `schemas/` | Pack schema (1.0.0) and runtime task schemas |
| `docs/` | Architecture, runtime schemas, GM integration rules, world-state contract, acceptance tests, test report, user guide, authoring guide |
| `tests/unit` | Domain/runtime acceptance tests (vitest) |
| `tests/e2e` | Real ST/Horae integration proof (Playwright + mock OpenAI-compatible server) |
| `tools/pack-builder` | canon-pack-builder: builds history packs from story sources (Python; `python -m unittest discover -s tests` in that folder) |
| `site/` | The website (GitHub Pages). Its live demo (`site/src/demo.ts`) is the engine's own code — pack loading, the canon replayed to a chosen day, the timeline window — bundled by `scripts/build-site.mjs`; `.github/workflows/pages.yml` builds and deploys it on every push that changes it, the engine or the examples |

```
npm install
npm run build        # boundary check + validators + dist/index.js + dist/canon-core.mjs + dist/canon-lint.mjs
npm test             # boundary check + unit/acceptance tests
PROMPT_LOG=out/a npm test; …; PROMPT_LOG=out/b npm test; node scripts/prompt-log-compare.mjs out/a out/b
                     # a refactor that must not change what the models are sent: every request compared
node scripts/build-site.mjs                   # the website into site/; preview with any static server, e.g. python -m http.server -d site
node tests/e2e/mockServer.mjs 5555 &          # then, with ST running on :8000 and this extension installed:
node tests/e2e/integration.mjs                # or a section: node tests/e2e/integration.mjs S5
node tests/e2e/story-session.mjs
node dist/canon-lint.mjs path/to/pack.canon.json   # validate a pack (structure + semantics)
```

Stop the ST test server, the mock server and any browser after a run. See `docs/ARCHITECTURE.md`, `docs/RUNTIME_SCHEMAS.md`, `COMPATIBILITY.md` and `docs/TEST_REPORT.md`.
