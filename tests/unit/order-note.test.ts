// ON1: events whose time is not known share their window (several beats of one afternoon); the GM is told the order
// the original story has them in (live: five 大霸星祭 beats all "12:00–17:59" read as at the same time).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers';
import { validatePackText } from '../../src/core/domain/pack';
import { emptyState } from '../../src/core/domain/reducer';
import { afterNote } from '../../src/core/runtime/context';
import { layout, packGraph } from '../../src/core/ui/graph';

describe('order of events that share a window', () => {
  it('ON1 an event of unknown time names the events it follows that have not happened yet; a known time needs none', () => {
    const p = JSON.parse(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'));
    const day = (e: any) => { e.when = { ...e.when, earliest: { day: 2, minute: 720 }, latest: { day: 2, minute: 1079 }, precision: 'part_of_day', label: 'Day 2, afternoon' }; };
    day(p.events.find((e: any) => e.id === 'council-broadcast'));
    day(p.events.find((e: any) => e.id === 'harbor-festival'));
    p.events.find((e: any) => e.id === 'harbor-festival').when = { ...p.events.find((e: any) => e.id === 'council-broadcast').when };
    p.edges.push({ id: 'b-f', from: 'council-broadcast', to: 'harbor-festival', relation: 'precedes', basis: 'editorial', source_refs: ['example-source'], note: 'The broadcast comes first.' });
    p.events.find((e: any) => e.id === 'conflict-begins').when.earliest = { day: 2, minute: 1080 };
    p.events.find((e: any) => e.id === 'conflict-begins').when.latest = { day: 2, minute: 1080 };
    const r = validatePackText(JSON.stringify(p));
    expect(r.errors).toEqual([]);
    const L = r.loaded!;
    const st = emptyState(L);
    expect(afterNote(L, st, 'harbor-festival')).toBe(' (after "Council broadcast")'.replace('Council broadcast', L.events.get('council-broadcast')!.title));
    expect(afterNote(L, st, 'council-broadcast')).toBe('');            // follows nothing by enables/precedes (motivates is no order)
    expect(afterNote(L, st, 'conflict-begins')).toBe('');              // a known time: its time says it
    st.dispositions.set('council-broadcast', { disposition: 'occurred', tick: 0 } as any);
    expect(afterNote(L, st, 'harbor-festival')).toBe('');              // what has happened is not "after" any more
    // the timeline: a shared unknown time is shown as such, with each event's place in the order
    const g = packGraph(L, null);
    const short = (id: string) => g.nodes.find((n) => n.id === id)!.short!;
    expect(short('council-broadcast')).toMatch(/(some time|某时).*1.*2/);
    expect(short('harbor-festival')).toMatch(/(some time|某时).*2.*2/);
    expect(short('conflict-begins')).not.toMatch(/some time|某时/);
    // drawn in that order: the first above the second, whatever their titles
    const both = { ...g, nodes: g.nodes.filter((n) => n.id === 'council-broadcast' || n.id === 'harbor-festival').map((n) => ({ ...n, lane: 'SOFT' as const })) };
    both.nodes[0].title = 'Zz last by title';
    const y = (id: string) => layout(both).placed.find((p) => p.id === id)!.y;
    expect(y('council-broadcast')).toBeLessThan(y('harbor-festival'));
  });
});
