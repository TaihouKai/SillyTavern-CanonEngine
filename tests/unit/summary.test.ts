// SU1–SU8: event summaries. Structured (one field per section, motives one entry per character with its entities);
// older packs may give plain labelled text, which is still read.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { causeOf, situationOf, summarySection } from '../../src/domain/schedule';
import { lintPack, validatePackText, loadPinnedPack } from '../../src/domain/pack';
import { renderSummary, summaryLines } from '../../src/domain/summary';
import { ROOT } from './helpers';

const S = '背景：节庆期间。起因：照片被传到网站。动机：食蜂——抹掉线索；凯兹——掩盖。经过：她突袭支部。结果：资料被删。影响：第二天的前提。';
const demo = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
const ZH = { background: '节庆期间。', trigger: '照片被传到网站。', motives: [{ who: '食蜂', entity_ids: ['shokuhou'], motive: '抹掉线索' }, { who: '凯兹', entity_ids: ['kaiz'], motive: '掩盖。' }], course: '她突袭支部。', result: '资料被删。', impact: '第二天的前提。' };
const warnings = (p: any) => lintPack(p).warnings.map((x) => x.message).join('\n');
const errors = (p: any) => lintPack(p).errors.map((x) => x.message).join('\n');

describe('event summaries', () => {
  it('SU1 a structured summary renders as labelled text (motives one per character) and one section per line, those present first', () => {
    expect(renderSummary(ZH, true)).toBe(S);
    expect(summaryLines(ZH, true, new Set(['kaiz']))).toEqual(['背景：节庆期间。', '起因：照片被传到网站。', '动机：', '  · 凯兹——掩盖（在场）', '  · 食蜂——抹掉线索', '经过：她突袭支部。', '结果：资料被删。', '影响：第二天的前提。']);
    expect(renderSummary({ trigger: 'A storm', course: 'Ships sink.' }, false)).toBe('Cause: A storm. Course: Ships sink.');
  });

  it('SU2 Canon reads the structured pack: the text every reader uses, the sections, and the short cause from the trigger', () => {
    const r = validatePackText(JSON.stringify(demo));
    expect(r.ok).toBe(true);
    const ev = r.loaded!.events.get('medic-ambush')!;
    expect(ev.sections!.motives![0]).toEqual({ who: 'The Council', entity_ids: ['council'], motive: 'silence the medic who treats Union wounded' });
    expect(ev.summary).toMatch(/^Cause: Mira, a travelling medic[^]*Motives: The Council — silence the medic[^]*Course: In the unmodified example history, Mira dies in an ambush\./);
    expect(causeOf(ev)).toBe('Mira, a travelling medic, takes the road out of the harbor.');
    // a pinned snapshot (already loaded) loads again unchanged
    expect(loadPinnedPack(r.loaded!.pack).hash).toBe(r.loaded!.hash);
  });

  it('SU3 lint: SOFT/HARD need trigger, course and result, FREE course and result; motives name known entities listed in the event', () => {
    const p = structuredClone(demo);
    p.events.find((e: any) => e.id === 'council-broadcast').summary = { course: 'A broadcast.' };
    p.events.find((e: any) => e.id === 'harbor-festival').summary.motives.push({ who: 'Ghost', entity_ids: ['ghost'], motive: 'haunt' });
    p.events.find((e: any) => e.id === 'conflict-ends').summary.motives = [{ who: 'Mira', entity_ids: ['mira'], motive: 'see it end' }];
    expect(errors(p)).toMatch(/SOFT summary lacks trigger, result/);
    expect(errors(p)).toMatch(/unknown entity "ghost"/);
    expect(warnings(p)).toMatch(/motive of mira, who is not in the event's entity_ids/);
  });

  it('SU4 lint: a reference to another event by title must match one', () => {
    const p = structuredClone(demo);
    p.events.find((e: any) => e.id === 'medic-ambush').summary.impact = 'See the aftermath (see “Council grievance”).';
    expect(warnings(p)).toMatch(/reference “Council grievance” matches no event title/);
    expect(warnings(demo)).not.toMatch(/matches no event title/);
  });

  it('SU5 an older plain-text summary is still read (labels in order) and is flagged to be structured', () => {
    expect(summarySection(S, '动机')).toBe('食蜂——抹掉线索；凯兹——掩盖。');
    expect(situationOf(S)).toBe('照片被传到网站。');
    const p = structuredClone(demo);
    p.events.find((e: any) => e.id === 'council-broadcast').summary = '经过：广播。起因：死讯。';
    p.events.find((e: any) => e.id === 'harbor-festival').summary = '起因：节日。动机：众人——庆祝。';
    expect(warnings(p)).toMatch(/summary sections out of order or repeated \(经过\/起因\)/);
    expect(warnings(p)).toMatch(/SOFT summary lacks 经过, 结果/);
    expect(warnings(p)).toMatch(/plain-text summary; give a structured summary/);
    expect(warnings(demo)).not.toMatch(/plain-text summary/);
  });

  it('SU6 an entity the event changes but does not list is flagged', () => {
    const p = structuredClone(demo);
    const e = p.events.find((x: any) => x.id === 'medic-ambush');
    e.entity_ids = e.entity_ids.filter((x: string) => x !== 'mira');
    expect(warnings(p)).toMatch(/the event changes mira but does not list it in entity_ids/);
  });

  it('SU7 the schema rejects an unknown section and a motive without its entities', () => {
    const p = structuredClone(demo);
    p.events[0].summary.mood = 'grim';
    expect(validatePackText(JSON.stringify(p)).ok).toBe(false);
    const q = structuredClone(demo);
    q.events[0].summary.motives = [{ who: 'X', motive: 'y' }];
    expect(validatePackText(JSON.stringify(q)).ok).toBe(false);
  });
});
