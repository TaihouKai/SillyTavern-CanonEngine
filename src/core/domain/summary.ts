// Event summaries (history packs). A summary is structured: one field per section, motives one entry per character
// with the entities it names. Older packs may still give a plain (labelled) text; it is read as it is.
import type { Id } from './types';

/** One key character's (or group's) goal: why they act and what they know or do not know. `who` as written,
 *  `entity_ids` the registry entities it names (empty for a group the registry does not hold). */
export interface SummaryMotive { who: string; entity_ids: Id[]; motive: string }

/** The sections of an event summary. background: the standing situation and setting going in (not the trigger) ·
 *  trigger: what sets it off · motives · course: the default course in beats · result: the state afterwards · aftermath:
 *  later happenings of the same storyline that are not consequences · impact: later events that build on it · note: a
 *  note for the GM on how to treat the route. */
export interface EventSummary {
  background?: string; trigger?: string; motives?: SummaryMotive[]; course?: string; result?: string;
  aftermath?: string; impact?: string; note?: string;
}

/** Section order with their labels (Chinese packs use the Chinese labels). */
export const SUMMARY_SECTIONS = [
  ['background', '背景', 'Background'], ['trigger', '起因', 'Cause'], ['motives', '动机', 'Motives'], ['course', '经过', 'Course'],
  ['result', '结果', 'Result'], ['aftermath', '后续', 'Afterwards'], ['impact', '影响', 'Impact'], ['note', '备注', 'Note'],
] as const;
export type SummaryKey = (typeof SUMMARY_SECTIONS)[number][0];
export const SUMMARY_LABELS = SUMMARY_SECTIONS.map((s) => s[1]);

const trimEnd = (s: string) => s.trim().replace(/[。；;.]+$/, '');
const motiveText = (m: SummaryMotive, zh: boolean) => `${m.who}${zh ? '——' : ' — '}${trimEnd(m.motive)}`;

/** The summary as one text with its labels ("起因：…动机：A——…；B——…。经过：…"). */
export function renderSummary(s: EventSummary, zh: boolean): string {
  return SUMMARY_SECTIONS.map(([key, z, en]) => {
    const v = s[key];
    if (!v || (Array.isArray(v) && !v.length)) return '';
    const label = zh ? `${z}：` : `${en}: `;
    if (key === 'motives') return `${label}${(v as SummaryMotive[]).map((m) => motiveText(m, zh)).join(zh ? '；' : '; ')}${zh ? '。' : '. '}`;
    const t = (v as string).trim();
    return zh ? `${label}${t}` : `${label}${t}${/[.!?]$/.test(t) ? '' : '.'} `;
  }).join('').trim();
}

/** The summary one section per line, each motive on its own line (for the GM and the timeline details). Motives of
 *  `present` entities come first, marked. */
export function summaryLines(s: EventSummary, zh: boolean, present: Set<Id> = new Set()): string[] {
  const out: string[] = [];
  for (const [key, z, en] of SUMMARY_SECTIONS) {
    const v = s[key];
    if (!v || (Array.isArray(v) && !v.length)) continue;
    const label = zh ? `${z}：` : `${en}: `;
    if (key === 'motives') {
      const ms = [...(v as SummaryMotive[])].sort((a, b) => Number(b.entity_ids.some((x) => present.has(x))) - Number(a.entity_ids.some((x) => present.has(x))));
      out.push(label.trim());
      for (const m of ms) out.push(`  · ${motiveText(m, zh)}${m.entity_ids.some((x) => present.has(x)) ? (zh ? '（在场）' : ' (here now)') : ''}`);
    } else out.push(`${label}${(v as string).trim()}`);
  }
  return out;
}

const LABEL_RE = new RegExp(`(${SUMMARY_LABELS.join('|')})：`, 'g');

/** One labelled section of an older plain-text summary (text up to the next label), or null. */
export function summarySection(summary: string, label: (typeof SUMMARY_LABELS)[number]): string | null {
  const parts = summary.split(LABEL_RE);
  const i = parts.indexOf(label);
  return i >= 0 && i + 1 < parts.length ? parts[i + 1].trim() || null : null;
}
