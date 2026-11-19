// 战斗: the record every combat change is carried in (kind combat), and how long a state holds as the code reads it.
import type { SourceRef, StoryTime, Until } from '../domain/types';
import { newId } from '../domain/util';
import type { RecordDraft } from '../runtime/types';

export const combatRecord = (st: StoryTime, src: SourceRef[], summary: string, extra: Partial<RecordDraft>): RecordDraft => ({
  recordId: newId('rec'), kind: 'combat', storyTime: st, sourceRefs: src, factsSetOrUnset: [], eventOccurrenceIds: [],
  visibility: { mode: 'public', knower_ids: [] }, summary: summary.slice(0, 300), evidenceKind: 'direct', ...extra,
});

/** A model's "until" for a state: lasting, or minutes (anything else: not given). */
export const cleanUntil = (u: unknown): Until | undefined => {
  if (u === 'lasting') return 'lasting';
  if (u && typeof u === 'object' && 'minutes' in u && Number.isFinite(Number((u as { minutes: unknown }).minutes)) && Number((u as { minutes: number }).minutes) > 0) return { minutes: Math.round(Number((u as { minutes: number }).minutes)) };
  return undefined;
};
