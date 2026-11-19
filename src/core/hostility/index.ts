// 主动敌对 (the world comes for the player): the module's public face. The rest of the core uses it only through this
// file (scripts/check-boundary.mjs); the module never reaches into the engine, the gate or the UI.
//   state   — grudges and dangers that came, replayed over the pack; the dangers linked from places and organizations
//   turn    — what comes for the player in this reply (a grudge whose time came, a danger the roll lets through) and
//             what the GM is told
//   review  — grudges taken up and settled in the reply, grudges acted on, whether what was due came
//   panel   — the panel's view and the player's corrections
//   prompts — the review's part of the evaluate prompt
export { applyHostility, dangersAt, emptyHostilityState, grudgesNow, inHours, type Grudge, type HostilityState } from './state';
export { DANGER_CHANCE, DANGER_LEVELS, DANGER_STRETCH, LEVEL_FACTOR, hostileDue, hostileSection, roll, type DangerLevel, type HostileDue } from './turn';
export { defaultComes, gateHostility, grudgesForReview, type HostilityEvalOut, type HostilityReview } from './review';
export { hostilityPanelRecord, hostilityView, type HostilityChange, type HostilityViewData } from './panel';
