// SU1–SU3: event summaries in labelled sections (背景/起因/动机/经过/结果/后续/影响/备注).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { situationOf, summarySection } from '../../src/domain/schedule';
import { lintPack } from '../../src/domain/pack';
import { ROOT } from './helpers';

const S = '背景：节庆期间。起因：照片被传到网站。动机：食蜂——抹掉线索；凯兹——掩盖。经过：她突袭支部。结果：资料被删。影响：第二天的前提。';
const demo = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));

describe('labelled summaries', () => {
  it('SU1 a section is read up to the next label; the short cause (起因) stops before 动机', () => {
    expect(summarySection(S, '动机')).toBe('食蜂——抹掉线索；凯兹——掩盖。');
    expect(summarySection(S, '影响')).toBe('第二天的前提。');
    expect(summarySection(S, '后续')).toBeNull();
    expect(situationOf(S)).toBe('照片被传到网站。');
  });

  it('SU2 the linter checks the labels: in order, and SOFT/HARD have 起因, 经过 and 结果', () => {
    const p = structuredClone(demo);
    p.events.find((e: any) => e.id === 'council-broadcast').summary = '经过：广播。起因：死讯。';
    p.events.find((e: any) => e.id === 'harbor-festival').summary = '起因：节日。动机：众人——庆祝。';
    const w = lintPack(p).warnings.map((x) => x.message).join('\n');
    expect(w).toMatch(/summary sections out of order or repeated \(经过\/起因\)/);
    expect(w).toMatch(/SOFT summary lacks 经过, 结果/);
  });

  it('SU4 an entity the event changes but does not list is flagged', () => {
    const p = structuredClone(demo);
    const e = p.events.find((x: any) => x.id === 'medic-ambush');
    e.entity_ids = e.entity_ids.filter((x: string) => x !== 'mira');
    expect(lintPack(p).warnings.map((x) => x.message).join('\n')).toMatch(/the event changes mira but does not list it in entity_ids/);
  });

  it('SU3 an unlabelled (older) summary is not flagged', () => {
    expect(lintPack(demo).warnings.some((x) => /summary/.test(x.path))).toBe(false);
  });
});
