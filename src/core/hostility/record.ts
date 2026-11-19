// 主动敌对: the record every hostility change is carried in (kind hostility).
import type { SourceRef, StoryTime } from '../domain/types';
import { newId } from '../domain/util';
import type { RecordDraft } from '../runtime/types';

export const hostilityRecord = (st: StoryTime, src: SourceRef[], summary: string, extra: Partial<RecordDraft>): RecordDraft => ({
  recordId: newId('rec'), kind: 'hostility', storyTime: st, sourceRefs: src, factsSetOrUnset: [], eventOccurrenceIds: [],
  visibility: { mode: 'public', knower_ids: [] }, summary: summary.slice(0, 300), evidenceKind: 'direct', ...extra,
});
