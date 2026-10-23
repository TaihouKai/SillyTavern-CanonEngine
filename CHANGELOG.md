# Changelog

## 1.9.4 — 2026-10-23

- **优先 for other matters.** While an event is under way only contacts that already reach the player (direct) are offered to the GM, so nobody drags the player into something else mid-fight. In 尚未发生的可能接触 the event under way is tagged 进行中, and every other matter gets a 优先 button: a preferred matter may be offered to the GM even then, and is offered first otherwise. Allowed, never required (the GM's world reaction stays optional). The world-reaction step is told to keep a contact for each preferred matter. Preferred events are cleared when settled or past their window; 取消优先 undoes it.
- Tests: NI-43.

## 1.9.3 — 2026-10-23

- **重新评估 button** beside 尚未发生的可能接触: asks the world-reaction step again now, although nothing it depends on changed (one analysis call). Suggestions only: nothing is recorded; the next turn offers the GM one of the new ones. The status bar shows it while it runs, and a reply cannot start meanwhile.
- Tests: NI-42.

## 1.9.2 — 2026-10-23

- **Varied world reactions.** Live: all four suggested contacts were about the event under way (使徒十字篇：追击欧莉安娜), as if the player were locked into it until it ends. The world-reaction step now proposes up to 5, at most 2 about the same event, arc, organization or situation, and includes other candidate events when a plausible contact exists — also while an event is under way. The controller keeps at most 2 per matter.
- **尚未发生的可能接触 is grouped by matter** like 世界已经接触你的: one entry per event or storyline, its other possibilities folded underneath (另外 n 种可能).
- Tests: NI-41.

## 1.9.1 — 2026-10-23

- **How an action the player wrote is carried out belongs to that action.** Live: the player wrote "走一路烧一路魔法陷阱" with skills and combat left to the player; the reviewer authorized the burning, then sent the reply back because the incantation and the fire were "player-only skills the player had not specified". The reviewer is told that the means of an authorized act (the spell, its incantation, what it looks like; the exact words of a line whose gist the player gave) are authorized and never need spelling out, and the controller drops a free-text complaint about an act the reviewer itself marked as authorized.
- Tests: PV9.

## 1.9.0 — 2026-10-23

- **OOC keyword (setting, default `OOC`).** Parts of the player's message marked with it — `(OOC: …)`, `（OOC：…）`, `[OOC …]`, `【OOC：…】`, or a line starting with `OOC:` — are out-of-character directions for the next reply, e.g. "(OOC: if C happens, I do D)". Requested: the GM should simply have the player character do D when C happens, never narrate "the player is considering: if C, then D".
  - The story model never sees the OOC text in its chat history (this turn's or earlier ones; the saved message is unchanged). For the reply it was written for, it gets a hidden note: apply silently, a conditional takes effect only when its condition happens, do not arrange the scene to make it happen.
  - The reviewer gets the directions separately from the player's action scope: an act carrying one out is the player's own (not limited by the player-voice setting) only when its condition happened in the reply; narration that reveals or paraphrases them, or shows the character weighing them, is sent back (`ooc_leak`).
  - The message reader is told which parts are OOC: they are never read as the player character's actions, lines or intents (new statement kind `ooc_direction`); OOC suppression, time skips and config requests in them work as before. Time stated only in an OOC part does not move the clock.
  - Empty keyword = off. Directions last for one reply (including regenerations and swipes).
- Tests: OOC1–OOC5, e2e I15.

## 1.8.1 — 2026-10-23

- **One entry per matter in 世界已经接触你的.** Contacts about the same thing are grouped: the newest is shown, and the earlier ones fold underneath (更早 n 次). Each contact is still its own record, tied to the message it happened in, so swipes, edits and branches stay correct.
- **The same matter is filed under one scope.** Live: "追击欧莉安娜" was filed as a free storyline beside the event "使徒十字篇：追击欧莉安娜". A contact label that names exactly one pack event or arc (also without its storyline prefix), or an earlier contact's matter, is filed there. Contacts recorded before this release are grouped the same way in the panel.
- **Requests with no pack event:** the reviewer is told to file a follow-up, reminder or consequence of a recent contact with that contact (by its id), not under a new label. A free storyline ref an earlier contact already uses keeps that contact's matter and label, so differently worded follow-ups still land in one entry.
- Tests: NI-40.

## 1.8.0 — 2026-10-23

- **Declines are wishes; 强烈拒绝 makes one binding.** A refusal or deferral read from the player's messages is now a wish:
  - The GM is told to respect it and not to arrange for anyone to pull the player in; ordinary remarks, small talk and favours are fine.
  - World reactions still leave it out.
  - The reviewer no longer sends replies back over it. In debug mode its complaint shows as a note.

  The new 强烈拒绝 button next to an active refusal in 你的参与意愿 makes it binding, enforced as before. 取消强烈 makes it a wish again. Both are kept as the player's decisions, replayed with the chat like the others. An out-of-character stop (OOC) is always binding.
- **Help in the panel:** an ⓘ next to 你的参与意愿 explains wishes, 强烈拒绝 and out-of-character (OOC) instructions. The analysis model recognises those from how they are written, not from a fixed keyword; writing "OOC" makes them unmistakable. Each refusal is labelled 建议, 强烈拒绝 or 强制（OOC）.
- **Fix:** a free-text reviewer complaint that the reply writes the player character's lines or acts is dropped when the 「GM 可以替玩家角色……」 setting allows that kind. Live: the player character's dialogue was sent back this way. Acts the settings leave to the player are still sent back.
- Tests: NI-24 (now with 强烈拒绝), NI-24b, NI-24c, NI-24d; NI-16 updated.

## 1.7.1 — 2026-10-23

- **Fix: the player character's dialogue was sent back when a reply crossed offscreen events.** After judging events that happen offscreen during the reply, the reply is reviewed again, and that second review was run without the 「GM 可以替玩家角色……」 setting. Every line the GM wrote for the player was then rejected as "leaves to themselves (dialogue)". The setting is now passed there too, and the check can no longer run without it.
- **Reviewer, unsupported past events:** a character's everyday account of where someone else was or what they were doing recently ("she didn't come home last night", "she isn't answering her phone") counts as a new detail when no record or due event says otherwise. "Unsupported" is kept for a shared past with the player character and for notable events (fights, injuries, deaths, meetings, incidents) asserted without a record.
- **Reviewer, declined events:** an everyday favour or remark that does not ask the player to go to, do or join the declined thing (passing on a message, "if you happen to see her") is not pressure, even when it concerns people involved in it.
- Tests: PV7, PV8.

## 1.7.0 — 2026-10-23

- **Backup analysis connection.** A second connection profile, set under 分析用连接, takes over a single analysis task when the main connection:
  - blocks it with an error, such as a content filter;
  - refuses it, answering with no JSON at all;
  - or answers with nothing twice.

  The turn completes, and only the checks that were taken over are billed at the backup's price. Use case: official DeepSeek for analysis at its off-peak price, Venice as the backup for NSFW scenes, since analysis requests do not carry the preset's jailbreak.
- The backup has its own extra request parameters.
- Temporary trouble (busy, rate limits, gateway errors) is still retried on the main connection.
- The status bar shows "备用×n" when the backup was used; its tooltip and the debug report list which checks and why.
- Tests: BK1–BK3.

## 1.6.4 — 2026-10-22

- **叙事融入 tab:** the 允许再次接触 button under 你的参与意愿 no longer squeezes into a one-character column; buttons in the tab's lists keep their normal width.

## 1.6.3 — 2026-10-22

- **组织成员 in the timeline window.** A new button switches the timeline to a members view with two tables:
  - every organization's leader, members and status as they stand now in this game, so it follows what actually happened in play;
  - the pack's membership changes in time order, each with its state in this game (occurred, changed, overdue or upcoming).

  Upcoming changes are canon spoilers. Without 显示剧透 the view only says how many there are.
- **叙事融入 tab:** organization connections and affiliations show their current leader and members, as the GM sees them, e.g. "暗部SCHOOL: 敌对组织 (Persona) [首领 垣根帝督；成员 …]".
- Tests: LM7.

## 1.6.2 — 2026-10-22

- **Fix: the handler named in the Persona was dropped from "who knows you".** The Persona said "隶属: EMBER -> 云川芹亚 -> 贝积继敏" and "联络人: 云川芹亚". The model listed 云川芹亚 as a knower but labelled her "implied". Canon drops implied knowers who are known characters, so that the model cannot invent "a canon character knows your secret".
  - Now an implied knower who is a known character is kept when the profile has a Persona-stated relationship with that person in a chain-of-command role: handler, contact, liaison, superior, boss, 联络人, 上级, 上司, 负责人 and the like.
  - They know who the player is. Knowing the player's secrets still needs the Persona to say so.
  - Someone the Persona names for something else (a friend, a debtor) is still not made a knower on a guess.
  - The profile task is told that the handler or superior the Persona names counts as stated.
- Tests: NI-03c.

## 1.6.1 — 2026-10-22

- **Fix: the player character's dialogue was sent back although "说话" is ticked.** The reviewer's answer format showed `player_actions` without `category`. DeepSeek copied the format and left the kind out, and the gate treats an act without a kind as one the player keeps for themselves. In a live turn, two of the player character's lines were sent back, and the repair told the GM to leave them to the player.
  - The answer format now includes `category`.
  - When the kind is still missing and the quote is plainly a spoken line (“…”, 「…」, 『…』, "…" with at most a short attribution), it counts as dialogue.
  - Other acts without a kind are still left to the player.
- Tests: PV4–PV5.

## 1.6.0 — 2026-10-22

- **Reading the Persona uses your lorebooks.** When Canon reads the Persona, it also reads the entries of your active lorebooks for the names the Persona uses, as SillyTavern's own scan would find them. That covers global, character, chat and Persona lorebooks. It then takes up to 4 entries about the people and organizations those entries name. A Persona saying "Relation to SCHOOL: bad" is read together with the SCHOOL entry and its leader's entry.
  - Only this world counts: entries whose title or first key is a pack entity, and the other entries of the same lorebooks. Unrelated lorebooks, always-on entries and keys many entries share (暗部, also inside regex keys) are left out. The budget is 6,000 characters.
  - The model is told this is background for recognising names. It never makes anyone related to the player or aware of them.
  - The 叙事融入 tab lists the entries that were read. `CanonEngine.previewLore()` in the browser console shows what would be read now.
- **Organization membership as facts.** A pack can give organizations a `members` set (`entity_set`) and a `leader`. Events change them; see the authoring guide. The engine uses them:
  - Reading the Persona: organizations come with their leader and members.
  - The world's reaction: members of the organizations you belong to or are connected with count as your connections, so their events become your concern.
  - Event candidates: people are shown with their organizations, e.g. "垣根帝督 [kakine-teitoku, of 暗部SCHOOL]".
  - Organization connections show their current facts.
  - A `members` set is the whole list once it exists, also when emptied. A person's `affiliation` counts only for organizations without one. The dead are left out.
- **Lint:** warns when an event records a death but an organization's `members` set still lists that person.
- Tests: LM1–LM6.

## 1.5.2 — 2026-10-22

- **New setting: "Canon ignores Persona Library sections"** (off by default). Persona Library writes its core text plus the enabled Additional Sections into the Persona description. With this setting, Canon reads only the core text; the GM still gets everything. This is for things Canon does not need, such as incantations or style notes.
  - The core text is used only when the description still starts with it. If the Persona was edited in SillyTavern's own panel since, or a variant wraps the text, Canon reads the whole description. Variants that are appended are fine.
  - Switching the setting does not count as a changed Persona: a game read one way is recognised read the other way, so no "Persona differs" notice appears. Use 更新本局身份 to re-read a started game with the new setting.
  - The 叙事融入 tab says which text was read. Its old note, "Persona Library categories are not read", was wrong: enabled sections were always part of the description.
- Tests: PS1–PS3.

## 1.5.1 — 2026-10-22

- **Debug mode shows why drafts were sent back.** With 调试模式 on:
  - the timing tooltip in the status bar lists, for each rejected draft, the reviewer's reasons;
  - a 详情 button appears after every turn, not only failed ones. It opens the turn report: each attempt with its problems ("sent back" or "accepted"), the reviewer's non-blocking notes, the full text of every draft, resent calls, tokens, cost and step timings;
  - the Inspector's 调试 tab shows the same report at the top.

  Draft texts are kept in memory only, and only in debug mode; they are never saved with the chat. The saved report of a failed turn is unchanged.
- Tests: DR1–DR2.

## 1.5.0 — 2026-10-22

- **New setting: "GM 可以替玩家角色……" (what the GM may write for the player character).** It is a list of checkboxes:
  - dialogue;
  - reactions and inner thoughts;
  - small actions;
  - movement and leaving the scene;
  - items;
  - abilities, skills and magic;
  - combat;
  - decisions;
  - revealing secrets.

  By default dialogue, reactions and small actions are ticked. Until now the engine had a built-in rule, "do not supply new voluntary player actions, decisions, dialogue…". It made GMs refuse to speak for the player, and the reviewer sent drafts back for "塞拉菲娜接过果汁，拧开盖子喝了一口" or any line of the player character's dialogue, each costing a repair (30–100 s). Players who want the GM to voice their character got one-line player turns followed by walls of NPC dialogue.
  - The GM is told which kinds to write naturally, in character with the Persona, and which to leave to the player.
  - The reviewer gives each player-character act a kind. Only kinds that are not ticked, and that the player did not write, are sent back.
  - Acts the player wrote are always carried out.
  - A decision the GM voices is never recorded as the player's (decisions are read only from the player's own messages).
  - With nothing ticked, the old strict rule applies.
- Tests: PV1–PV3.

## 1.4.10 — 2026-10-22

From a failed live turn: a five-day skip (10/10 → 10/15) right after the player had joined the ITEM survivors' search for 芙兰达.

- **What the player took up in play is not pressure.** The reviewer flagged 滨面's "她会没事的吧" and even the player's own "有芙兰达的消息就告诉我" as pressure on her older "任务我照样不接". Contacts the player has answered in play now appear in the decisions as "taken up by the player in play: … continuing it with the people involved is their choice". The reviewer is told that a refusal of jobs covers being asked to do such jobs, by anyone. It does not cover someone's worry, grief or news, or a thing the player took up themselves.
- **The reviewer knows the canon events where a time jump lands.** Its list of open canon events stopped 12 hours after the clock before the jump, so "英法海底隧道炸了" (10/15 08:00–20:00, open when the scene landed on 10/15 afternoon) was called a contradiction. After a jump the list covers up to 12 hours after the landing time, nearest first.
- **The analysis looks ahead from where a jump lands.** Connections' events were looked for in the three days after the clock before the jump. When the 14 candidate events are trimmed, events under way, 关注 events and the player's connections' events are kept first; a long jump has many unrelated events in between.
- **Left-out review fields are asked for by name.** The review left out state_claims/player_actions/violations/hard_checks three times and failed the turn. The resend now names the missing fields and asks for the complete object with [] for empty lists, with a larger length budget. Lists that decide a check are still never assumed empty.
- Tests: NI-14c, F07; NI-27c extended.

## 1.4.9 — 2026-10-22

- **People met in play become connections.** The analysis looked days ahead only for events of people named in the Persona. Someone the player has dealt with in actual history (live: 滨面 and 泷壶, met on 10/10) did not bring their later events (暗部脱逃篇) into view until those were within 24 hours. People and organizations who share an actual occurrence with the player now count as connections too (the 12 most recent).
- Tests: NI-05b.

## 1.4.8 — 2026-10-22

- **A contact is answered once the player acts with the people behind it.** 1.4.7 relied on the extractor recording "accepted", and live it did not ("走吧，去找滨面" while walking with 绢旗 still left "not answered: do not press it" for the GM). Now a contact is also answered once actual history has a player action, after it, that involves its actors (called them back, went to them, acts together).
- Tests: NI-27c.

## 1.4.7 — 2026-10-22

- **Acting on a contact answers it.** Live: the player called 绢旗 back and went to meet her, yet the GM was still told "芙兰达失联与ITEM崩溃 — already offered, not answered: do not repeat or press it" in the middle of that very scene. Going along with a recent contact by the player's own act (calling back and arranging to meet, going where asked, doing what was asked) is now recorded as accepting that contact. It does not accept the faction or event behind it. Accepting any contact about a thing answers the later contacts about the same thing.
- **Answers to the player are not contacts.** Someone answering what the player character just asked or started (they called and were told where to come) is no longer recorded as the world reaching out.
- Tests: NI-27b.

## 1.4.6 — 2026-10-22

- **Fix: after a time jump, world reactions were judged from the time before it.** Which reaction can happen "soon" was measured from the clock before the player's jump. Live: the player slept from 23:15 until 08:00, and the news that became possible at 08:00 (绢旗 asking about 芙兰达) was not offered on that turn. It is now measured from where the jump lands.
- Tests: NI-14b.

## 1.4.5 — 2026-10-22

- **News of a settled event may reach the player.** Live: 芙兰达之死 was settled offscreen, and the suggestion that the player, her close friend, hears of it was dropped because a settled event accepted only the kind "consequence". News of what happened ("information") is now allowed too. Invitations or requests to take part in a settled event are still dropped.
- **A decision covers what its words cover.** The analysis and the reviewer are told that a refusal applies by its quoted words, whatever scope it was filed under. Live: after "这段时间暗部的任何任务我都不接", the analysis still proposed an ITEM member asking her for help for a night, because ITEM is neither of the declined factions (学园都市, CINDER).

## 1.4.4 — 2026-10-22

- **News of a consequence is not pressure.** Live: after the player refused all 暗部 work, the analysis offered a direct consequence: 绢旗 calls to say that 芙兰达, the player's close friend, was killed in the 暗部大战. The reviewer called it pulling the player back into the 暗部 line, and the repair dropped it. The reviewer now learns that the offered contact was already checked against the player's decisions. Delivering it as given is not pressure, including news brought by people from the declined side. Only asking the player to do or join the declined thing is.
- **Everyday favors between friends are not contacts.** Misaka asking to stay over during the fighting was recorded as a request about the 暗部大战 event (and would then be listed as "offered, not answered"). Contacts are now only reaching out about a story thing.

## 1.4.3 — 2026-10-22

- **An empty reply is asked for once more.** Live: the story model (DeepSeek official) returned about 3.9k output tokens and no text, and the turn failed with "the model returned an empty reply". A fresh reply that comes back empty is now requested once more (shown in the turn report). If it is empty again, the error gives the provider's finish reason, output and reasoning tokens and the limit, and says what to change (reasoning effort or max length; content filter; a preset or regex removing the reply).
- Tests: F06.

## 1.4.2 — 2026-10-22

- **Fix: Horae's date and clock time from different replies were joined.** Horae's latest state carries the date and the time forward separately. When a reply recorded only a date ("2020/10/9 (五) 上午"), the engine joined it with the previous evening's "21:30" and used "10/9 21:30" as the earliest end of the next reply. Live: a reply that ended at 18:00 was recorded as ending at 21:30. Date and time now come from the same reply. A time without a date keeps the last date; a date without a time gives no Horae time.
- Tests: HT1–HT3.

## 1.4.1 — 2026-10-22

Fixes from the first real-model run in the live Tavern (pack 1.1.8, Persona 塞拉菲娜).

- **A blanket refusal keeps its breadth.** "这段时间暗部的任何任务我都不接" was recorded as declining only the one event the latest message was about, because the extractor could choose a faction only among the player's own organizations. It now also sees who reached the player (with ids) and the organizations in nearby events, and a rule says scope follows the player's words: refusing a kind of work or everything from a sender is a faction decision (the sender, and the player's own organization when they refuse to work through it).
- **Ordinary acquaintances are not knowers.** The profile listed "常盘台同学 — knows the organization exists" for classmates who only see the public image. They are no longer listed (anyone not listed knows just the public identity), and the "exists" level now reads "knows the organization exists (not that the player is in it)".
- Tests: NI-20b.

## 1.4.0 — 2026-10-22

Narrative integration: the world reacts to the player, not only the player to the world (requirements document, with the user's decisions). Part of every chat bound from 1.4.0; older campaigns keep working without it.

- **The player is part of the world.** At the first turn the standard Persona is read once into a profile: who the player is, their organizations and places (original ones become runtime entities, the pack is untouched), abilities, resources, connections, and who knows what about them — that an organization exists, who the player is, or specific secrets. Knowers implied by the role (members, a handler, partners, rivals, close friends) are allowed so a secret identity can still be reached; a known character is never made the player's superior or a knower on a guess (only the Persona or actual play can establish that). A changed Persona is reported; 更新本局身份 applies it from the current position (older messages keep their identity), 保留本局身份 keeps the game's.
- **P0: the HARD planner knows the player.** It gets the same player context (identity, organizations, knowers, lasting state, recent history, decisions) instead of a bare name, and a plan made for an older player context is replanned. Campaigns without integration give it the Persona text.
- **The world reaches out.** A new analysis task, run in parallel with the planner and cached by everything it depends on, proposes how the world may contact the player now (invitation, request, information, probe, hostile act, consequence, encounter) from their identity, history and the events near them — no 关注 or naming of the event needed, and also with no HARD event pending. The controller checks every suggestion and the GM gets at most one, as an optional WORLD REACTION that is not history (a time skip never executes it; not using it is fine; none during an event under way except direct impacts).
- **The player's decisions are binding and replayable.** Declined, not now (until a stated time), OOC stop of a storyline, accepted, took part (a clear voluntary intervention re-engages that event without a declaration), one act only (rescuing one person accepts nothing more) — recorded from the player's own words or actions on their message. A refusal stops every way in: another person, channel, rumor, friend's plea or contrived threat; only harm with an actual recorded cause still reaches them. 关注, pack hooks, planner steps and the new task share this one policy; a newer refusal outweighs an older 关注. The reviewer records contacts that reached the player and reports pressure on a refused thing as its own violation (never filtered as HARD noise). Decisions and contacts live with their message variants: swipes, edits, deletions, branches and failed saves keep them consistent.
- **Panel**: Inspector tab 叙事融入 — what was read from the Persona and what the engine adjusted, the player's decisions with 允许再次接触, the contacts that reached them; pending suggestions only with spoilers.
- Fix: a model value in a field that is either null or one of a list of values was replaced by null before validation.
- Tests: NI suite (26), e2e NI01; legacy hook/关注 tests run on campaigns without integration.

## 1.3.74 — 2026-10-22

- **Events can list their cast: who is there from which time.** Live finding: people who arrive later in an event (湾内/泡浮 in 婚后光子遇袭, 上条/削板 at 才人工房) never turned up, and people already there were often left out. Before an event started, the GM only saw its opening; while it was under way, the original route was cut at 160 characters, before the late arrivals.
  - New optional pack field `cast` on an event: `{entity_id, at, role}` per person, at fixed story times inside the window. The linter checks the entity, that it is in `entity_ids`, that the time is inside the window, and that nobody is listed twice.
  - The GM sees the cast, as "there since" or "arrives" at each time, for events about to start, in their window, under way, and for HARD obligations. A rule says everyone whose time has come is there, and later ones turn up at their time whatever the player has done meanwhile. Only death or captivity in actual history keeps them away.
  - For an event under way, a closing line names who is present now (they take part in the scene) and who is still to come.
  - An event in its window that has a cast is now required context (no longer dropped for budget). The route of an event under way is shown in full.
  - Real-model check (local; 婚后 down at 11:05 and the player fights 马场): without a cast, 湾内/泡浮 appeared in 0 of 4 replies; with the cast, in 4 of 4.
- Tests CA1–CA5.

## 1.3.73 — 2026-10-21

- **The 20-minute cap no longer switches off for any time word.** Any "明天", "今晚", "上午", "午后" or "半天" in the dialogue counted as "the text mentions time", so the cap never applied and two walking scenes took +45 and +65 minutes (live: 14:50 → 16:40; one of them even said "十分钟"). Now:
  - a clock time ("13:51", "下午三点") or a time jump ("第二天", "到了傍晚", "天黑了", "两小时后" with 几/数, sleeping, "until morning", "hours pass") lifts the cap as before;
  - stated durations ("走了十分钟", "一个半小时", "twenty minutes") raise the cap by that much: +20 plus what the text states (not "两天前", not the colloquial "这半天");
  - words that only mention another time keep the cap at +20.
  - Replayed on the live replies: 14:50 → 15:10 → 15:40 instead of 15:35 → 16:40.
- Tests CK6–CK7.

## 1.3.72 — 2026-10-21

- **Cost for DeepSeek's official API.** DeepSeek returns token counts but no cost, so its calls showed $0.0000. A request to ST's DeepSeek source, or to a custom endpoint at api.deepseek.com, is now priced from DeepSeek's published rates (checked 2026-10-21): cache-hit input, cache-miss input and output per 1M tokens, deepseek-flash $0.006 / $0.30 / $1.20 and deepseek-v4-pro $0.044 / $1.32 / $3.96 at peak (01–04 and 06–10 UTC on weekdays), half off-peak. Chinese public holidays (off-peak) are not known, so they are priced at peak. Other providers are unchanged.
- Tests DS1–DS2.

## 1.3.71 — 2026-10-21

- **结束事件 / 强制完成 / 关联本局事件 no longer report success when nothing changes.** Their result is anchored after the last message, but replay stops at the first message it cannot accept, so while an earlier message was a stored conflict the result was saved and never applied (live finding: "事件已结束：已改变" four times, timeline unchanged — message 62 was still the door/district conflict fixed in 1.3.70). They now refuse and name the message the engine is stopped at.
- **重试 on a conflict re-checks the message.** A stored conflict used to be replayed as-is, so a conflict made by an older version stayed after the fix; Retry now drops it and the message is reviewed again by the current code.
- Tests RC1–RC2.

## 1.3.70 — 2026-10-21

- **A building's damage is no longer checked against its district.** Live finding: "整扇铁门从外面被炸开了" (the door of 食蜂's mansion, which is not in the registry) was filed by the reviewer as 第七学区.condition="受损" and rejected as contradicting the district's "受损（公园被火雨砸出坑）". Two fixes:
  - A free-text value with a detail added agrees with its base value ("受损" vs "受损（公园被火雨砸出坑）", "受损，大门被炸开"); a different base ("毁坏") still contradicts.
  - A claim about a place's state is only checked when the reply mentions that place (its name, an alias, or a word of its name such as "the market"); otherwise it is ignored with a warning. The reviewer is also told not to file a building, room, door or object that is not in the registry on its district or city.
- Tests PC1–PC4.

## 1.3.69 — 2026-10-21

- **The story clock no longer runs ahead during continuous scenes.** The reviewer's time rule pushed every reply forward ("a longer conversation 10-30 minutes", "do not keep lo at current_time"), and its earliest end is what the clock commits, so short replies got 20–40 minutes each (live: 12:10 → 14:43 over 11 replies of about an hour of story; a player message stating "13点51分…大概2分钟" still ended at 14:13). An overestimate is permanent while an underestimate is corrected by the Horae floor next turn, so:
  - lo is now the MINIMUM the shown events need, adding up everything in order: dialogue as long as saying it (a dozen lines of small talk 1–2 min), an action beat under a minute, a fight a few minutes, movement by distance, waiting as long as what fills it, activity "until dark" ends at that part of the day. Unstated filler goes into hi. An explicit time or duration in the player's message (not only the reply) anchors the end.
  - A reply where neither it nor the player's message mentions time advances the clock at most 20 minutes.
  - Checked against the real analysis model (DeepSeek V4 Flash) on 12 everyday situations (nod, small talk, talk+fight+chase, walk, bus wait, lunch, train, study until dark, sleep, explicit skip, player-stated time): 24/24 within common-sense ranges (old rule: small talk +5–10, now +3–5; a nod +1).
- Tests CK1–CK5; unit and e2e scenarios that jumped the clock without any time words now state their time.

## 1.3.68 — 2026-10-21

- **canon-lint flags dependent events whose windows overlap.** An event that depends on another — a precondition "occurred", or an enables/precedes link — should start when its prerequisite is over; otherwise it can show as under way (or be settled) before its premise exists (live finding: 美琴追查10032号 07:00–12:00 and 婚后光子遇袭, which needs 美琴's request, 10:00–14:00). Review warning, one per pair, saying whether the dependent can even begin or end before its prerequisite. Events without a dependency may overlap freely; events that run in parallel should be linked as "related". On the Toaru pack 1.1.4 it found 44 pairs (1.1.5 fixes them).
- Test DP1. Authoring guide §10 lists the new review warning.

## 1.3.67 — 2026-10-21

- **One bad effect no longer voids an offscreen judgement.** 结束事件 failed with "The analysis model could not conclude this event": reproduced on the live campaign with the real analysis model (DeepSeek V4 Flash), the judgement itself was right (changed) but one of its effects named "nana" — a character created in play, whose id is rt.entity.… — and the whole judgement was thrown away. Effects now resolve an entity given by name (pack entities and characters created in play); an effect that still does not fit (unknown entity, wrong value type that cannot be converted, a value outside the allowed list) is dropped on its own. Text booleans/numbers are converted ("true" → true). This applies to every offscreen judgement, including when a window closes.
- A list-shaped task answered with the bare item or a bare array (the model returned one adjudication object instead of {"adjudications":[…]}, three resends) is wrapped instead of resent.
- Test CE3; the live reproduction concluded the failing event 3 times out of 3 afterwards.

## 1.3.66 — 2026-10-21

- **结束事件 (conclude event).** A canon event that is under way, open, or past its window without a result can be concluded on request: the same model judgement as when its window closes — from what actually happened in the story, with the beats already shown under way and recent play with its characters as evidence, and the note that the player says it has ended — records it as occurred, changed or did not happen. Unlike 强制完成 it does not apply the original route. If the model finds the event still going on, nothing is recorded and the toast says so. Recorded like 强制完成 (anchored after the latest message) and undone with 撤销结束.
- Tests CE1–CE2; e2e CE01.

## 1.3.65 — 2026-10-20

- **A change the reply shows is no longer rejected as a contradiction.** The reviewer sometimes files a change that happens in the reply (a robot dog is hit, collapses and smokes) as a presupposition ("the text assumes it was already damaged"); the check then found it contradicting the earlier "完好", sent the correct reply back for repair, and the turn failed after 3 attempts (live finding). When a claim conflicts with the earlier state and an event of the same reply involves that entity, it is now taken as that event's result (noted in the turn report); coming back to life (alive false → true) is still a contradiction. The reviewer is also told that a change the reply shows is a transition, not a state claim.
- **A boolean or number written as text is compared as such.** "马场芳郎.alive = \"true\", but the actual state is true" was reported as a contradiction; claimed values are now read in the predicate's type (also when revalidating after edits).
- Tests CL1–CL3.

## 1.3.64 — 2026-10-20

- **The timeline's "现在" and the GM's current time follow Horae when the reviewer misjudged the last reply.** A reply that jumped from 22:10 to "12:10" the next day was recorded as 00:10 (a 12-hour mix-up); Horae read it as 12:10. Canon only took Horae's time as the floor of the *next* reply's end, so until then the timeline's now line — and the GM's context for the next reply — sat 12 hours behind (live finding). Both now use Horae's time for the latest reply when Horae is fresh and ahead of the engine clock by at most 3 days (the same rule as the floor). The reviewer is also told explicitly that times are minutes after midnight on a 24-hour clock (noon / 中午12点 = 720).
- Test H05.

## 1.3.63 — 2026-10-20

- **What the turn cost, as the provider reports it.** After the token count the status line shows the turn's cost (`消耗 97,269 Token · $0.0352`), read from the responses Canon Engine already receives — Venice's `cost.usd` (and `cost.diem` when paying with DIEM, shown separately), unlid's `unlid.cost_usd`, OpenRouter's `usage.cost` — so it is the real charge including cache discounts, with no price table. The hover splits it into story model and analysis model; calls that reported no cost are counted and marked with "+". Also in the failed-turn report. Providers that report no cost show none (said so in the hover).
- Tests CO1–CO2; e2e L07 (the mock provider now reports a cost like Venice).

## 1.3.62 — 2026-10-19

- **The planner may plan the steps leading up to a HARD event.** A plan step that served a HARD event was rejected whenever it set a value different from that event's final outcome, even before the event: the steps toward 御坂10032号被秘密带走 had 10032 "在气球猎手比赛场地" and were refused as "contradicting HARD misaka-10032-abduction's required outcome 被秘密带离并藏匿" (live finding; the pack is consistent — those were the planner's own intermediate steps). The HARD event sets its outcome when it happens, so a step now conflicts only when it spans the event's deadline, whether or not it serves it.
- Planner test extended.

## 1.3.61 — 2026-10-19

- **A card greeting that is a setup instruction no longer leaves a conflict at binding.** The opening message of some cards tells the GM how to start ("当前世界设定…已载入。用户可以直接行动…") instead of being a scene; binding examined it like a story reply, the reviewer complained that it is "a meta-instruction prompt, not a story reply", and the complaint became an unresolved conflict on message #0 (live finding). A message already in the chat cannot be repaired, so for retained messages the reviewer's decision is what counts: complaints about a message it keeps (retain) are notes; a real contradiction is still a "conflict". The reviewer is also told that non-story text (OOC instructions, setup notes, rules, menus) establishes nothing and draws no complaints.
- Test GR1.

## 1.3.60 — 2026-10-19

- **关联本局事件 (link story events to a canon event).** When a canon event happened in the story but the reviewer did not recognise it (live: 上官鹭 beat 马场 herself, filed as ordinary beats, while 婚后光子遇袭与马场芳郎落败 stayed unsettled), open it in the timeline, tick the story events it consists of (the ones from a day before to a day after its window), and choose "结果与原作相同（已发生）" — recorded as occurred, the original outcome applied — or "结果不同（已改变）" — what the story established stands. The canon box is linked to those story events (causal links), the record is manual like 强制完成 (it overrides an earlier offscreen result) and "撤销关联" undoes it. No model call.
- Test LK1; e2e LK01.

## 1.3.59 — 2026-10-19

- **Events whose window closes during a reply are always settled.** A turn settles the canon events its time advance passes, then reviews the reply again with those results; when that second review placed the reply's end later, the events whose windows closed in the extra time were skipped (live finding: the first review ended before 14:00, the second at 14:30, and 婚后光子遇袭与马场芳郎落败, due 14:00, showed 时间已过但未判定). The extra interval is now settled too, and reviewed again (up to 3 rounds).
- When an event's original preconditions are unknown (e.g. an upstream event happened differently), the offscreen judgement now also sees what actual play did with its characters, as it already did when they were satisfied — so a fight the player already won is not judged as if it never happened.
- An event past its window without a result reads "时间已过，下次时间推进时结算" (it is settled from actual play at the next story-time advance).
- Test AJ1.

## 1.3.58 — 2026-10-19

- **A stream that goes silent is given up after 5 minutes instead of waiting for the reply timeout.** Since 1.3.48 Canon streams its own requests to custom endpoints. A stream that stops sending without closing was waited on until the reply timeout (live: 33 minutes with no reply and no error at a 2000 s timeout). Any bytes — tokens, thinking, keep-alive comments — reset the timer, so a model that is thinking is never cut off; 5 minutes of total silence (before the reply starts or in the middle of it) ends the request with "the provider sent nothing for 300s …; the connection stalled". The stalled request is not re-sent unstreamed. Retry works as usual.
- Test SR05; e2e ST01–ST02 (section S21; the mock provider can now stall a stream).

## 1.3.57 — 2026-10-19

- **Time jumps the player asks for are read before the reply is written.** The player-message reader already recognised time skips ("睡到明天早上", "三小时后") but only passed them on as a note; it now gives their target time (a typical hour when only a part of day is said: morning 07:00, evening 18:00, …), and "CANON EVENTS ABOUT TO START" then covers everything starting before the jump ends, not just the next 2 hours (up to 10 events). The GM is told to reflect the ones the player character would witness, be woken by or hear about, leave the rest out of sight, and keep the jump the player asked for instead of cutting it short or stretching it. A target in the past or more than 7 days ahead is ignored.
- Tests TJ1–TJ2; e2e TJ01.

## 1.3.56 — 2026-10-19

- **The GM is told which canon events are about to start.** A reply's end time is only decided after it is written (by the review, with Horae's time as the floor), so a reply could carry the story from 07:59 to 08:01 past the start of an event the GM never heard of — it only appeared in the optional 24-hour background ("do not steer toward these"). Each reply now gets a required "CANON EVENTS ABOUT TO START" section: non-HARD events starting within 2 hours of story time, with their start time ("in 30 min") and starting situation, and the rule that if the reply's time reaches a start the event begins then (shown where the player character is or would notice, otherwise out of sight), and that time is never hurried or delayed to reach or avoid it. HARD events were already listed as obligations. Not repeated in the background list.
- Test OG5.

## 1.3.55 — 2026-10-19

- **The GM is reminded of canon events under way.** Every reply while an event is under way gets a required "CANON EVENTS UNDER WAY" section — the event, its beats so far and the original route as reference only — whether or not the latest messages name it (before, it reached the GM only when the text mentioned it, or in the optional in-window list that called it "not happened yet"). It is left out of the in-window list, and disappears when the event ends (or a day past its window, when offscreen catch-up settles it).
- Test OG4. GM integration rules: the new context section.

## 1.3.54 — 2026-10-19

- **Canon events under way are not judged yet.** The reviewer had to file a canonical event as "occurred" or "diverged" the moment a reply showed it, so an event that had only started was recorded as 已改变 (live finding: 婚后光子遇袭与马场芳郎落败 marked changed when 上官鹭 had just charged the mechanical dog and 马场 was not yet beaten). It now has a third choice, "ongoing": the beat is recorded and linked to the event, the event keeps no result, the timeline shows it as 进行中 with the beats so far, the GM context says it is under way, and the next review sees those beats and judges the event in the reply where it ends. Offscreen catch-up leaves an event under way alone unless the story leaves it hanging for a day past its window.
- **重新分析** on events marked 已发生 / 已改变 (timeline, two clicks): the reply that recorded the result is examined again with the current rules; later replies are revalidated as after an edit. Not offered for the starting history or a 强制完成.
- Tests OG1–OG3, RA1–RA2; e2e RA01–RA02 (section S20).

## 1.3.53 — 2026-10-19

- On a plain-http address, the note under 回复完成时提醒 now shows the Chrome page (`chrome://flags/#unsafely-treat-insecure-origin-as-secure`) and this SillyTavern address on their own lines, each with a 复制 button, and says what to do there (add the address, Enabled, relaunch). Web pages cannot open chrome:// pages, so copying is the shortest route.
- e2e N04.

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
