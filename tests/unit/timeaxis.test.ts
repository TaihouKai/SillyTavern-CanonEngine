// TA01-TA02: the history graph uses a real time axis (order and span follow story time).
import { describe, expect, it } from 'vitest';
import { timeScale, renderGraphSvg, type GraphData } from '../../src/ui/graph';

describe('history graph time axis', () => {
  it('TA01 the scale is monotone and keeps longer gaps wider', () => {
    const sc = timeScale([0, 60, 1440, 1440 * 30, 1440 * 365], 100);
    const xs = [0, 30, 60, 600, 1440, 1440 * 10, 1440 * 30, 1440 * 365].map(sc.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(sc.x(1440) - sc.x(60)).toBeGreaterThan(sc.x(60) - sc.x(0));
  });

  it('TA02 boxes start at their time and are as wide as their span; a later event is further right', () => {
    const n = (id: string, tick: number, tickHi: number) => ({ id, title: id, lane: 'HARD' as const, tick, tickHi, when: '', summary: '' });
    const g: GraphData = { nodes: [n('long', 0, 1440), n('short', 480, 600), n('later', 2000, 2000)], edges: [], nowTick: null, arcs: [] };
    const svg = renderGraphSvg(g, 'pack');
    const box = (id: string) => { const m = svg.match(new RegExp(`data-id="${id}" transform="translate\\(([\\d.]+),[\\d.]+\\)"><rect width="([\\d.]+)"`))!; return { x: Number(m[1]), w: Number(m[2]) }; };
    const L = box('long'), S = box('short'), T = box('later');
    expect(L.w).toBeGreaterThan(S.w);
    expect(S.x).toBeGreaterThan(L.x);
    expect(S.x + S.w).toBeLessThan(L.x + L.w);
    expect(T.x).toBeGreaterThan(L.x + L.w);
  });
});
