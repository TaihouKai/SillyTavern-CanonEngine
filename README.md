# Canon Engine v1 — SillyTavern extension

Canon Engine keeps the **actual history** of an interactive story and steers its future toward immutable, author-selected **HARD anchors**. The player changes the route; the defined anchors stay mandatory. It is a standalone browser extension: no database server, daemon or companion service.

- Input: a new-format history pack `*.canon.json` (schema `1.0.0`, see `docs/HISTORY_PACK_AUTHORING_GUIDE.md`). SillyTavern World Info / lorebooks are **not** accepted and are never converted.
- Play happens in the normal ST input box. Every GM reply is generated privately, checked, and only then published.
- Editing or deleting **any** user or GM message, swipes, regenerate, continue, branches and reload rebuild the world from the selected transcript.

Chinese user guide (for players): [`docs/USER_GUIDE_ZH.md`](docs/USER_GUIDE_ZH.md).

## Requirements

| Item | Supported / tested |
| --- | --- |
| SillyTavern | 1.19.0 (release ref `06bde939`, 2026-09-14). Other versions: see `COMPATIBILITY.md` |
| API | Chat Completion through your existing ST connection (any provider; no JSON-schema or function-calling support required) |
| Chat type | A single controlling GM character chat. Group chats are refused (explicit guard) |
| Horae | Optional. Tested with the Horae 1.15.1 fork `TaihouKai/SillyTavern-Horae-Metadata` in metadata mode (read-only public API) |

## Install

The repository folder **is** the extension (it contains `manifest.json`, the built bundle `dist/index.js` and `style.css`; no compilation needed).

1. Copy (or `git clone`) this folder into **one** of
   - `SillyTavern/data/<your-user>/extensions/SillyTavern-CanonEngine`, or
   - `SillyTavern/public/scripts/extensions/third-party/SillyTavern-CanonEngine`.
   If you later publish the folder as a Git repository you can instead use *Extensions → Install extension* with its URL.
2. Reload SillyTavern. *Extensions* now shows a **Canon Engine 历史引擎** drawer.

On this VM it is already linked into the test install: `C:\Users\agent\st-test\public\scripts\extensions\third-party\SillyTavern-CanonEngine` → `C:\Users\agent\claude\SillyTavern-CanonEngine`.

**Update:** replace the folder with the new version (or `git pull`) and reload. Campaign data lives in your chat files, not in the extension folder, so updating never touches it.

**Uninstall:** delete the folder. Chats keep an inert `canonEngine` metadata block; *Unbind* in the drawer removes it from a chat.

## First-time setup for a chat

1. Open the GM chat. In *Extensions → Canon Engine* either pick a saved pack from the **历史包库** list (**用此包启用**) or click **为此对话启用（导入 .canon.json）** and choose a file. Every valid imported pack is saved to the library automatically: it is stored in SillyTavern's user files folder (`data/<user>/user/files/canon-pack-*.json`, listed in the extension settings), so it survives restarts and Docker container updates whenever `data/` is a volume. **✕** removes a pack from the library; bound chats are unaffected because each chat keeps its own pinned copy.
2. The wizard shows title/version/hash, validation result, coverage and the HARD count (or precise errors — e.g. a World Info file gets a specific "not a history pack" error).
3. Set the **starting time** on the pack clock (`D<day> HH:MM`), or — after filling in the display date of day 0 — as a calendar date (`2020-07-20 08:00`), or pick "start just before event …". The day-0 date is display only; no real-world clock is ever used. Horae's current story date/time is shown when available.
4. Confirm. For an existing chat every persisted message is examined once (not just the model's context window). Persona, inventory, skills and Horae state are **not** reset. A summary shows the mapped start, examined messages, deviations and unresolved issues; **撤销绑定** undoes it.
5. Follow the setup notices: disable the old *history/timeline* lorebook (ordinary setting lore may stay), and remove the old GM-card sentence "history comes from World Info" if present — the engine injects scoped replacement rules (`src/runtime/prompts.ts`, from `GM_INTEGRATION_RULES.md`) while enabled; your card file is never modified.

## Playing

- Type and press Send as usual. A small status bar above the composer shows *整理对话中 / 规划中 / 生成中 / 检查中 / 保存中*, with **取消** (the ST stop button also cancels).
- The reply appears only after validation (buffered, not streamed). No JSON, labels or planner text is shown in the story.
- Swipe, regenerate and continue work through ST's normal buttons; each candidate is validated the same way.
- A spoiler-free red banner may appear beside a reply after a major deviation. It belongs to that reply variant and disappears if the reply is deleted or swiped away.
- **检查面板** (inspector): current time, facts with provenance, actual history, deviations, anchors, plan, recovery status. Future anchors/plans stay hidden until you tick *显示剧透*. *Debug mode* (advanced settings) adds the final outgoing GM prompt, operation traces, coverage manifests and raw JSON.

### History graph

The **diagram icon in SillyTavern's top bar** opens the Canon Engine history graph. Time runs left to right; lanes separate HARD / SOFT / FREE events and events created in this playthrough; arrows are the pack's relations (enables / motivates / precedes / related) and, in the playthrough view, the actual causes recorded during play. A dashed red line marks the current story time.

- **本局历史 (this playthrough):** every canon event's actual status (occurred / changed / did not happen / pending / future) plus new events from play, linked by their real causes. Future events stay hidden until *显示剧透* is ticked.
- **原作历史包 (pack):** the canonical graph as authored (contains spoilers).
- Search, arc filter, lane toggles, drag to pan, wheel to zoom, *全览* to fit; click an event for its summary, required outcome, actual account and relations.

### Edits, deletions and conflicts

Edit or delete any message with ST's normal tools. The engine finds the earliest changed position, replays the unchanged prefix deterministically (no model calls), re-examines changed and dependent messages, and rebuilds facts, plans, banners and Horae context. If a retained later message can no longer follow your edit (example: you change "I save Mira" to "I leave", but a later GM reply still narrates the rescue), its text is **kept**, the message is marked, and generation pauses with two actions: **定位此消息** (edit that message) or **从此处分支并重新生成** (native branch + regenerate). Nothing is auto-deleted or retconned.

### Errors and recovery

Operational problems are shown out of story: invalid pack, unresolved starting time, conflicting retained transcript, provider failure, invalid model JSON, narrative validation failure (after at most 2 repairs), stale response, incompatible adapter, stale memory, persistence failure, context capacity. **重试** reruns the failed turn or re-saves after a failed save. Your input and the last valid state are always kept; no empty or error message is ever added to the chat.

## Backup, restore, pack updates

- Campaign data is stored inside the chat file (`chat_metadata.canonEngine`), so ordinary ST chat backups include it.
- **导出战役备份** downloads a JSON backup (contains the full pack and hidden/spoiler data). **导入战役备份** restores it into the open chat and revalidates it against the transcript.
- A chat stays pinned to the pack snapshot it was bound with. To change versions use **更新历史包…**: it previews changed/added/deleted event ids and changed HARD contracts, requires a backup export first, then creates a new binding revision.

## Context size

The engine context (rules + retrieved history + state) typically adds 2–5k tokens per turn. Use a model context of at least 16k–32k tokens. If SillyTavern trims the engine context because the prompt does not fit, the turn stops with a *Context capacity* error instead of generating an unchecked reply.

## Advanced settings

`maxRepairs` (2), `maxOrdinaryPlanner` (2), `forcedPlannerAttempt` (on), `budgetChars` (context packet budget), `taskTimeoutMs`, `draftTimeoutMs`, `horizonMinutes`, debug mode, UI language (中文/English). Required matched history and scene constraints are never silently truncated; if they cannot fit, the turn stops with a capacity error.

## Cost and latency

Each managed turn uses your connection several times: user extraction, draft, whole-draft discovery, evaluation; plus planning, offscreen adjudication and impact assessment when needed, and up to two repairs (each repeats discovery + evaluation). Expect roughly 4–7 model calls for an ordinary turn.

## Known limitations (v1)

- **Live-model testing is limited.** Besides the deterministic mocked suites, a short live session (bind + 3 turns incl. a time skip, Chinese 169-event pack) was run through Venice with `qwen-3-8-flash` (also exercised: `qwen3-235b-a22b-instruct-2507`, `z-ai-glm-5-3-flash`). Expect 2–3 minutes and roughly US$0.02–0.03 per turn on such models (4–10 model calls). Small models produce imperfect JSON; the engine repairs unambiguous slips and retries, but other providers/models are untested. The deterministic gates bound but cannot eliminate semantic model errors.
- Group chats are unsupported (activation is refused). Simultaneous writes to the same chat from different browsers/devices are unsupported; within one browser profile a second tab is blocked from writing. ST's server-side chat integrity check is the only cross-device protection.
- Engine-managed replies are buffered (no token streaming). *Continue* is implemented as a private continuation instruction (not ST's assistant prefill) and the whole revised message is validated.
- When Horae memory is stale after edits and its supported re-analysis cannot refresh it in time, Horae's whole injected snapshot is excluded from that reply (not partially repaired).
- Semantic candidate search is lexical (word/CJK-bigram IDF) plus model-side mapping over an occurrence catalogue; no embeddings.
- Background generations that would post directly to chat (`quietToLoud`) are blocked while the engine is enabled.

## For developers

| Path | Content |
| --- | --- |
| `src/domain/*` | Pure core: pack validation/lint, time, reducer, scheduler, world query (no ST/Horae imports) |
| `src/runtime/*` | Controller: replay/reconcile, operation pipeline, planner, adjudicator, context/retrieval, gate, prompts, model task runner |
| `src/adapters/*` | ST adapter (managed generation, prompt hooks, persistence), Horae read-only adapter, writer lock |
| `src/ui/*` | Status bar, drawer, wizard, inspector, banners |
| `schemas/` | Pack schema (1.0.0) and runtime task schemas |
| `docs/` | Architecture, runtime schemas, compatibility, test report, user guide, authoring guide |
| `tests/unit` | Domain/runtime acceptance tests (vitest) |
| `tests/e2e` | Real ST/Horae integration proof (Playwright + mock OpenAI-compatible server) |

```
npm install
npm run build        # validators + dist/index.js
node scripts/build-cli.mjs   # dist/canon-lint.mjs
npm test             # unit/acceptance tests
node tests/e2e/mockServer.mjs 5555 &          # then, with ST running on :8000 and this extension installed:
node tests/e2e/integration.mjs                # or a section: node tests/e2e/integration.mjs S5
node tests/e2e/story-session.mjs
node dist/canon-lint.mjs path/to/pack.canon.json   # validate a pack (structure + semantics)
```

See `docs/ARCHITECTURE.md`, `docs/RUNTIME_SCHEMAS.md`, `COMPATIBILITY.md` and `docs/TEST_REPORT.md`.
