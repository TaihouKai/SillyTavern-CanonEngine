// The extension's settings: the engine's own and the host's (stored together in SillyTavern's extension settings).
import { DEFAULT_SETTINGS, type EngineSettings } from '../../core';

export interface StSettings extends EngineSettings {
  inspectorOpen: boolean;
  uiLang?: string;
  /** Canon reads Persona Library's core text without its Additional Sections (the GM still gets everything). */
  ignorePersonaSections: boolean;
  /** When a reply finishes while the tab is in the background: system notification (where allowed), tab title mark. */
  notifyDone: boolean;
  /** ...and a short chime. */
  notifySound: boolean;
  /** Sampling temperature for internal structured tasks (not the GM's story replies). */
  taskTemperature: number;
  /** Connection profile id for internal analysis tasks; '' = the chat's own connection. */
  taskProfileId: string;
  /** Extra request-body parameters (YAML, as in SillyTavern's "Include Body Parameters") for analysis-profile requests. */
  taskExtraBody: string;
  /** Backup connection profile for analysis tasks the main one blocks or refuses ('' = none), and its extra body. */
  taskBackupProfileId: string;
  taskBackupExtraBody: string;
  /** Canon never reads the chat's first message when it is the character's (a greeting): not when the pack is bound,
   *  not later. The story model still sees it. */
  ignoreFirstMessage: boolean;
  /** Connection profile for 角色盘算 ('' = the analysis connection). */
  mindProfileId: string;
}

export const ST_DEFAULTS: StSettings = {
  ...DEFAULT_SETTINGS, inspectorOpen: false, ignorePersonaSections: false, notifyDone: true, notifySound: true, taskTemperature: 0.2,
  taskProfileId: '', taskExtraBody: '', taskBackupProfileId: '', taskBackupExtraBody: '', ignoreFirstMessage: false, mindProfileId: '',
};

/** Settings saved by earlier versions under other names. */
export function migrateSettings(s: Record<string, unknown>): void {
  // 1.30: the scene tracker (Horae) settings are the engine's generic tracker settings
  if ('followHoraeTime' in s) { if (!('followTrackerTime' in s)) s.followTrackerTime = s.followHoraeTime; delete s.followHoraeTime; }
  if ('horaeWaitMs' in s) { if (!('trackerWaitMs' in s)) s.trackerWaitMs = s.horaeWaitMs; delete s.horaeWaitMs; }
}
