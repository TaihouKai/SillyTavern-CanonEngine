// Event summaries in labelled sections (history packs).
/** The labelled sections of an event summary, in this order (HISTORY_PACK_AUTHORING_GUIDE): 背景 the standing situation
 *  and setting going in (not the trigger) · 起因 trigger · 动机 each key character's goal, reason and knowledge · 经过 default
 *  course · 结果 state after · 后续 later happenings of the same storyline · 影响 later events that build on it · 备注
 *  editorial note. */
export const SUMMARY_LABELS = ['背景', '起因', '动机', '经过', '结果', '后续', '影响', '备注'] as const;
const LABEL_RE = new RegExp(`(${SUMMARY_LABELS.join('|')})：`, 'g');

/** One labelled section of a summary (text up to the next label), or null. */
export function summarySection(summary: string, label: (typeof SUMMARY_LABELS)[number]): string | null {
  const parts = summary.split(LABEL_RE);
  const i = parts.indexOf(label);
  return i >= 0 && i + 1 < parts.length ? parts[i + 1].trim() || null : null;
}
