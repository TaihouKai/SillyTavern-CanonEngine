// 战斗 (combat analysis): the module's public face. The rest of Canon Engine reaches combat only through this.
//   graph   — the pack's combat graph: index and lint
//   state   — this game's combat changes replayed over the pack; links, states, 对抗倾向, the fight; the walk
//   message — the player's message starts, goes on with or ends a fight
//   judge   — the ruling of a turn (combat_fill, combat), checked by the code
//   turn    — before the reply: judge a fight under way, or the rule that a new fight stops where it begins
//   reply   — what the game master gets (the ruling, the states)
//   review  — the reply held to the ruling; states and GM-started fights recorded
//   panel   — the timeline window's view and its edits
export { indexCombat, lintCombat, type CombatIndex } from './graph';
export { applyCombat, emptyCombatState, fightNow, knowsNode, linksOf, statusesOf, styleOf, walkCombat, type CombatState, type Replayed } from './state';
export { fightFromMessage, fightNowInput, type FightOut } from './message';
export { DEFAULT_COMBAT, judgeFight, loreAbout, rulingRecord, type CombatSettings, type PlayerOutcome, type Ruling, type RulingExchange } from './judge';
export { combatBeforeReply, type TurnCombat } from './turn';
export { FIGHT_START_RULE, rulingSection, statesSection } from './reply';
export { combatReview, gateCombat, rulingForReview, type CombatEvalOut, type CombatReview } from './review';
export { combatView, panelRecord, type CombatChange, type CombatViewData } from './panel';
