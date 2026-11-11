// Canon Engine core: the engine without any host. A host (src/hosts/sillytavern; any other program) implements
// HostPort and ModelPort and uses only what this file exports; scripts/check-boundary.mjs keeps it so. Built on its
// own as dist/canon-core.mjs.

// the engine and what a host gives it
export { CanonEngine, DEFAULT_SETTINGS, labelForError, formatUsd, type EngineSettings } from './runtime/engine';
export type { HostPort, Persona, PublishRequest, LorePort, SceneTrackerPort, SceneTrackerStatus } from './runtime/host';
export { TASK_TAG, isTransient, type ChatMsg, type DraftRequest, type ModelPort, type TaskName, type TokenUsage, type DraftInfo } from './runtime/model';
export { ENGINE_RELEASE, ENGINE_VERSION, type CampaignData, type Interpretation, type OpType, type SourceEntry } from './runtime/types';
export type { LoreEntry } from './runtime/lore';
export { textHash, type WorldAddition, type WorldOverride } from './runtime/worldset';
export { VOICE_KINDS, playerVoice } from './runtime/voice';
export { storyOnly } from './runtime/ooc';
export { parseLeapTime } from './runtime/leap';
export { interpretationsFor, baseKey } from './runtime/replay';
export { membershipView, natureView, type MembershipView, type NatureViewData } from './runtime/views';

// history packs and the world
export { validatePackText, lintPack, type LoadedPack, type LintIssue, type PackValidationResult } from './domain/pack';
export { buildBootstrap } from './domain/schedule';
export { reduce, type WorldState } from './domain/reducer';
export { WorldIndex } from './domain/world-query';
export { formatTick, fromTick, parseTickLabel, parseDateLabel, parseOriginLabel } from './domain/time';
export { newId, sha256, deepClone, EngineError } from './domain/util';
export type { LedgerRecord } from './domain/types';

// the interface pieces any host can show: the timeline window, the inspector, the texts
export { GraphPanel, packGraph, currentGraph } from './ui/graph';
export { createInspector } from './ui/inspector';
export { t, setLang, getLang } from './ui/i18n';
