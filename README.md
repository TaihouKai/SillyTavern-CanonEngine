<p align="center"><img src="assets/logo.webp" width="256" alt="Canon Engine logo"></p>

# Canon Engine — SillyTavern extension

Canon Engine keeps the **actual history** of an interactive story and steers its future toward immutable, author-selected **HARD anchors**. The player changes the route; the defined anchors stay mandatory. Everything else in the original story (SOFT and FREE events) is default history that the player may change. It is a standalone browser extension: no database server, daemon or companion service.

- Input: a history pack `*.canon.json` (pack schema `1.0.0`, see `docs/HISTORY_PACK_AUTHORING_GUIDE.md`). SillyTavern World Info / lorebooks are **not** accepted and are never converted.
- Play happens in the normal ST input box. Every GM reply is generated privately, checked, and only then published.
- Editing or deleting **any** user or GM message, swipes, regenerate, continue, branches and reload rebuild the world from the selected transcript.

中文玩家指南：[`docs/USER_GUIDE_ZH.md`](docs/USER_GUIDE_ZH.md)。

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
2. Reload SillyTavern. *Extensions* now shows a **Canon Engine 历史引擎** drawer.

**Update:** *Extensions → Manage extensions → update*, or replace the folder (`git pull`) and reload. Campaign data lives in your chat files, not in the extension folder, so updating never touches it.

**Uninstall:** delete the folder. Chats keep an inert `canonEngine` metadata block; **解除绑定** in the drawer removes it from a chat.

## The settings drawer

The drawer is split into cards; every option has an (i) icon with a short explanation.

- **本对话 (this chat):** the pack library, enabling, and once bound: 检查面板 (inspector), 重试, 重新检查对话, 导出备份 / 导入备份, 更换历史包…, 暂停引擎 / 恢复引擎, 解除绑定.
- **模型与回复 (model and replies):** the analysis connection and the reply length target.
- **事件记录 (event log):** scene grouping and following Horae's story time.
- **高级设置 (advanced):** limits, timeouts, budgets, debug mode, UI language (中文/English).

## First-time setup for a chat

1. **Choose an analysis connection first** (see below). A chat can only be enabled once one is chosen.
2. Open the GM chat. Pick a saved pack from the **历史包库** list (**用此包启用**) or click **为此对话启用（导入 .canon.json）** and choose a file. Every valid imported pack is saved to the library automatically (`data/<user>/user/files/canon-pack-*.json`), so it survives restarts and Docker container updates whenever `data/` is a volume. **✕** removes a pack from the library; bound chats are unaffected because each chat keeps its own pinned copy.
3. The wizard shows title/version/hash, validation result, coverage and the HARD count (or precise errors — e.g. a World Info file gets a specific "not a history pack" error).
4. Set the **starting time** on the pack clock (`D<day> HH:MM`), as a calendar date (`2020-07-20 08:00`, using the pack's day-0 date), or pick "start just before event …". No real-world clock is ever used. Horae's current story date/time is shown when available.
5. Confirm. For an existing chat every persisted message is examined once (not just the model's context window). Persona, inventory, skills and Horae state are **not** reset. A summary shows the mapped start, examined messages, deviations and unresolved issues; **撤销绑定** undoes it.
6. Follow the setup notices: disable the old *history/timeline* lorebook (ordinary setting lore may stay), and remove the old GM-card sentence "history comes from World Info" if present — the engine injects scoped replacement rules (`src/runtime/prompts.ts`, from `docs/GM_INTEGRATION_RULES.md`) while enabled; your card file is never modified.

## Analysis connection (required choice)

Each turn the engine makes several internal analysis calls (read the player's message, find references, review the reply, plan, settle offscreen events) that need careful JSON, not literary quality. Choose either a saved Connection Profile or, explicitly, **与当前对话相同** (same as the chat — costly with big models). Chats enabled before this was required keep working and show a reminder.

1. In SillyTavern, connect to the analysis model once and save it as a **Connection Profile** (plug icon → Connection Profiles → save). A fast, cheap, non-reasoning model works best.
2. Switch back to your story connection.
3. In *Extensions → Canon Engine*, choose that profile under **分析用连接**.
4. If the analysis model is a reasoning model, put its "thinking off" parameter in **分析请求的额外参数** (Venice: `venice_parameters: {disable_thinking: true}`). SillyTavern takes Include Body Parameters from the active chat preset, not from the profile, so set them here.

The GM's story replies always use the chat's own connection; only internal analysis uses the profile (at `taskTemperature`, default 0.2). If the chosen profile is deleted, turns stop with an actionable error instead of silently using the story model.

## Playing

- Type and press Send as usual. A status bar above the composer shows *整理对话中 / 规划中 / 生成中 / 检查中 / 保存中*, with **取消** (the ST stop button also cancels). After a turn it shows how long each step took; hover for details (steps, resent model outputs, small automatic fixes).
- The reply appears only after validation (buffered, not streamed). No JSON, labels or planner text is shown in the story.
- Swipe, regenerate and continue work through ST's normal buttons; each candidate is validated the same way.
- A spoiler-free red banner may appear beside a reply after a major deviation. It belongs to that reply variant and disappears if the reply is deleted or swiped away.
- **检查面板** (inspector): current time, facts with provenance, actual history, deviations, anchors, plan, recovery status. Future anchors/plans stay hidden until you tick *显示剧透*. *Debug mode* (advanced settings) adds the final outgoing GM prompt, operation traces, coverage manifests and raw JSON.

### How the original story is handled

- **HARD** events always happen with their exact content, outcome and time bounds; only the route changes. A planner prepares the next two pending HARD events from the actual situation.
- **SOFT / FREE** events are default history: they happen as written unless the story changes them. When their time window opens, the GM is told they are under way (if still possible). The GM also gets, as background only, what other characters currently know, want and are doing according to the next 24 hours of the original story, so nobody notices or chases something earlier than they would — this is explicitly not a list of things that must happen.
- When a SOFT/FREE event's window closes without the story reaching it, it is settled offscreen: as written when its preconditions hold and the story has not touched its people; judged by the model from actual play when it has (or when a prerequisite happened differently); recorded as not happening when a precondition was broken.

### History graph

The **diagram icon in SillyTavern's top bar** opens the history graph. Boxes sit on a real time axis (each spans its event's window; long gaps are compressed); lanes separate HARD / SOFT / FREE events and events created in this playthrough; arrows are the pack's relations (enables / motivates / precedes / related) and, in the playthrough view, the actual causes recorded during play. A dashed red line marks the current story time.

- **本局历史 (this playthrough):** every canon event's actual status (occurred / changed / did not happen / pending / future) plus new events from play. Future events stay hidden until *显示剧透* is ticked.
- **原作历史包 (pack):** the canonical graph as authored (contains spoilers).
- Search, arc filter, lane toggles, drag to pan, wheel to zoom, *全览* to fit; click an event for its summary, required outcome, actual account and relations.
- **强制完成** (red, under a canon event's description in 本局历史, click twice to confirm): records the event as happened along its original route, with its effects and HARD outcomes; later events that depend on it see it as happened, and the plan is rechecked on the next turn. **撤销强制完成** undoes it.
- **整理本局事件** (top of the timeline): the analysis model groups your 本局事件 into episodes (consecutive beats of one storyline), one box each with a title and a short summary. Display only: history, causes and what the GM sees are unchanged; later events show as usual until you press it again; **还原** removes the grouping.
- **Time frames** (packs that declare them: another era reached by time travel, a realm where time runs differently): the axis stays the main clock; events in another frame get a colored stripe and show their local time; 现在 names the scene's frame; **当前时空** sets the scene's frame by hand when the engine missed a move. See the authoring guide §3.4.
- **☆ 关注** (future or ongoing SOFT/FREE events): from 24 hours before the event's window until it ends, the GM gives your character natural in-world chances to be there when it starts (an invitation, news, an errand) without forcing its course or result; the planner may add up to two such steps. Focus is cancelled automatically once the event is settled or its window passes.

### Edits, deletions and conflicts

Edit or delete any message with ST's normal tools. The engine finds the earliest changed position, replays the unchanged prefix deterministically (no model calls), re-examines changed and dependent messages, and rebuilds facts, plans, banners and Horae context. If a retained later message can no longer follow your edit (example: you change "I save Mira" to "I leave", but a later GM reply still narrates the rescue), its text is **kept**, the message is marked, and generation pauses with two actions: **定位此消息** (edit that message) or **从此处分支并重新生成** (native branch + regenerate). Nothing is auto-deleted or retconned.

### Errors and recovery

Operational problems are shown out of story: invalid pack, unresolved starting time, conflicting retained transcript, provider failure, invalid model JSON, narrative validation failure (after at most 2 repairs, plus one final repair when a HARD event is still broken: the planner first works out a concrete in-world route from the actual situation, and the repair realizes the HARD outcome along it — never an unexplained vanishing), stale response, incompatible adapter, stale memory, persistence failure, context capacity. **重试** reruns the failed turn or re-saves after a failed save; **详情** shows a copyable report of every attempt. Your input and the last valid state are always kept; no empty or error message is ever added to the chat.

## Reply length, scene grouping, story time

- **回复长度** (optional): a length target such as `正文约800~1200字`, added after the latest message to every draft and revision. It asks for both ends of the range: no wrapping up before the lower bound, closing the scene near the upper bound. No extra request is made.
- **合并同一场景的本局事件** (off by default): consecutive beats of one ongoing scene go into one 本局事件 box. A box holds at most 4 beats within 90 minutes in one place; leaving a building, a vehicle ride, arriving elsewhere or a gap of about 30 minutes starts a new box, and canon events always get their own box. Every beat keeps its own record; only the grouping changes.
- **故事时间跟随 Horae** (on by default): with Horae installed and up to date, each new turn starts no earlier than Horae's story time at the end of the previous reply; the engine's reviewer estimates how long the reply itself takes (explicit times in the text win). Not used for swipes/regenerations/continuations, while Horae is busy or stale, or when Horae is behind or more than 3 days ahead.

## Backup, restore, pack updates

- Campaign data is stored inside the chat file (`chat_metadata.canonEngine`), so ordinary ST chat backups include it.
- **导出备份** downloads a JSON backup (contains the full pack and hidden/spoiler data). **导入备份** restores it into the open chat and revalidates it against the transcript.
- A chat stays pinned to the pack snapshot it was bound with. To change versions use **更换历史包…** (or **更新** next to a library pack): it previews changed/added/deleted event ids and changed HARD contracts, requires a backup export first, then revalidates every stored message against the new pack deterministically; only messages whose basis really changed are examined again.

## Context size

The engine context (rules + retrieved history + state) adds roughly 3–20k tokens to the story prompt, growing with the size of the pack and how much has happened (a large pack after a few days of story time: about 15k). Each turn also makes 3–4 analysis calls (extraction, discovery, review; planning and offscreen adjudication when needed) on the analysis connection; the review is the largest, about 1–2× the engine context. Use a model context of at least 64k tokens for a large pack. After each turn the status line shows the tokens your provider actually reported for all of the engine's requests in that turn ("消耗 N Token"; hover for input/output and the number of calls). SillyTavern's own token counter may overstate the total: it double-counts in-chat injections across its categories and, for model names it does not recognise, counts with an OpenAI tokenizer (for Chinese text with a Qwen model about 1.6× too high). If SillyTavern trims the engine context because the prompt does not fit, the turn stops with a *Context capacity* error instead of generating an unchecked reply.

## Advanced settings

`maxRepairs` (2), `maxOrdinaryPlanner` (2), `forcedPlannerAttempt` (on), `budgetChars` (context packet budget, 60000; when the full packet does not fit, a compact form that keeps every fact is tried first), `horizonMinutes`, `taskTimeoutMs`, `draftTimeoutMs`, `taskTemperature` (0.2), debug mode, UI language. Required matched history and scene constraints are never silently truncated; if they cannot fit, the turn stops with a capacity error.

## Cost and latency

Each managed turn uses your connections several times: reading the player's message, the draft, whole-draft discovery and review; plus planning, offscreen adjudication and impact assessment when needed, and up to two repairs (each repeats discovery + review; a third, final one with a fresh plan only when a HARD event is still broken). Expect roughly 4–7 model calls for an ordinary turn. Every structured reply is first normalized against its JSON schema; fields that decide a check (a player action's quote, a verdict, a HARD status, a violation, the review decision) are never invented, so a reply missing them is sent back. Malformed helper output keeps its complete items or falls back to built-in name matching; every such fix is listed in the timing tooltip and in 详情.

## Known limitations

- **Live-model testing is limited.** Besides the deterministic mocked suites, live sessions were run through Venice (`qwen-3-8-flash`, also `qwen3-235b-a22b-instruct-2507`, `z-ai-glm-5-3-flash`) with a Chinese 200-event pack. Expect 1–3 minutes and a few US cents per turn on such models. Small models produce imperfect JSON; the engine repairs unambiguous slips and retries, but other providers/models are untested. The deterministic gates bound but cannot eliminate semantic model errors.
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
| `src/domain/*` | Pure core: pack validation/lint, time, reducer, scheduler, world query (no ST/Horae imports) |
| `src/runtime/*` | Controller: replay/reconcile, operation pipeline, planner, adjudicator, context/retrieval, gate, prompts, model task runner |
| `src/adapters/*` | ST adapter (managed generation, prompt hooks, persistence), Horae read-only adapter, writer lock |
| `src/ui/*` | Status bar, settings drawer, wizard, inspector, banners, history graph |
| `schemas/` | Pack schema (1.0.0) and runtime task schemas |
| `docs/` | Architecture, runtime schemas, GM integration rules, world-state contract, acceptance tests, test report, user guide, authoring guide |
| `tests/unit` | Domain/runtime acceptance tests (vitest) |
| `tests/e2e` | Real ST/Horae integration proof (Playwright + mock OpenAI-compatible server) |

```
npm install
npm run build        # validators + dist/index.js + dist/canon-lint.mjs
npm test             # unit/acceptance tests
node tests/e2e/mockServer.mjs 5555 &          # then, with ST running on :8000 and this extension installed:
node tests/e2e/integration.mjs                # or a section: node tests/e2e/integration.mjs S5
node tests/e2e/story-session.mjs
node dist/canon-lint.mjs path/to/pack.canon.json   # validate a pack (structure + semantics)
```

Stop the ST test server, the mock server and any browser after a run. See `docs/ARCHITECTURE.md`, `docs/RUNTIME_SCHEMAS.md`, `COMPATIBILITY.md` and `docs/TEST_REPORT.md`.
