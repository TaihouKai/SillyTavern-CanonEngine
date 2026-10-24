// History graph views: the pack's canonical graph and the current playthrough's actual history.
// Pure SVG (no external libraries). Layout: a real time axis left→right (each box spans its event's
// start to end), swim lanes by classification (HARD / SOFT / FREE / 本局事件), greedy row packing inside lanes.
import type { LoadedPack } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { formatTick, formatStoryTime } from '../domain/time';
import { summaryLines } from '../domain/summary';
import { sceneRoot, segmentSceneChain, uniq } from '../domain/util';
import { t } from './i18n';

export type GStatus = 'occurred' | 'diverged' | 'omitted' | 'pending' | 'future' | 'unresolved' | 'unscheduled' | 'runtime';
export interface GNode {
  id: string;
  title: string;
  lane: 'HARD' | 'SOFT' | 'FREE' | 'RUNTIME';
  tick: number;
  /** End of the event's time window (defaults to tick). */
  tickHi?: number;
  /** Second line of the box (set by the renderer). */
  sub?: string;
  when: string;
  short?: string;
  summary: string;
  required?: string | null;
  arc?: string | null;
  status?: GStatus;
  origin?: string;
  detail?: string[];
  masked?: boolean;
  /** The player forced this event to complete ("强制完成"). */
  forced?: boolean;
  /** Shown under way in play; the result is not settled yet. */
  inProgress?: boolean;
  /** Linked by hand to story events (关联本局事件); undone like 强制完成. */
  linked?: boolean;
  /** Concluded by the player from the story (结束事件); undone like 强制完成. */
  concluded?: boolean;
  /** Its 已发生/已改变 was recorded from a chat message and can be re-examined. */
  reanalyzable?: boolean;
  /** After story entries (later developments of a closed event, merged by 重新分析). */
  afterStory?: number;
  /** The player marked this event 关注. */
  focused?: boolean;
}
export interface GEdge { from: string; to: string; kind: string; note?: string }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; nowTick: number | null; arcs: { id: string; title: string }[]; origin?: { y: number; m: number; d: number } | null }

const ORIGIN_LABEL: Record<string, string> = { player: '玩家', gm: 'GM/NPC', canon: '正史', offscreen: '场外', bootstrap: '开局前', intervention: '干预' };

/** Canonical graph straight from the pack (Graph A). */
export function packGraph(L: LoadedPack, origin: { y: number; m: number; d: number } | null): GraphData {
  const nodes: GNode[] = [];
  for (const ev of L.pack.events) {
    const ti = L.timeIndex.find((x) => x.id === ev.id);
    nodes.push({
      id: ev.id, title: ev.title, lane: ev.classification, tick: ti ? ti.lo : Number.NEGATIVE_INFINITY, tickHi: ti ? ti.hi : undefined,
      when: ti ? (ti.lo === ti.hi ? formatTick(ti.lo, origin) : `${formatTick(ti.lo, origin)} – ${formatTick(ti.hi, origin)}`) + ` · ${ev.when.label}` : ev.when.label,
      short: ti ? shortRange(ti.lo, ti.hi, origin) : ev.when.label,
      // a structured summary one section per line (the details panel keeps line breaks)
      summary: ev.sections ? summaryLines(ev.sections, /^zh/i.test(L.pack.language)).join('\n') : ev.summary, required: ev.required_description, arc: ev.arc_id,
      detail: [
        ...(ev.outcomes.length ? [`原作结果：${ev.outcomes.map((o) => `${name(L, o.entity_id)}.${o.predicate}=${JSON.stringify(o.value)}`).join('；')}`] : []),
        ...(ev.author_note ? [`注：${ev.author_note}`] : []),
      ],
    });
  }
  const edges: GEdge[] = L.pack.edges.map((e) => ({ from: e.from, to: e.to, kind: e.relation, note: e.note }));
  return { nodes, edges, nowTick: null, arcs: L.pack.arcs.map((a) => ({ id: a.id, title: a.title })), origin };
}

/** Current playthrough (Graph B): canon statuses + runtime occurrences with actual causal links. */
export function currentGraph(L: LoadedPack, s: WorldState, origin: { y: number; m: number; d: number } | null, spoilers: boolean, digest: { id: string; title: string; summary: string; members: string[] }[] = []): GraphData {
  const now = s.clock.lo;
  const g = packGraph(L, origin);
  const occByPack = new Map<string, string[]>();
  for (const o of s.occurrences.values()) if (o.packEventId) occByPack.set(o.packEventId, [...(occByPack.get(o.packEventId) || []), o.occurrenceId]);
  for (const n of g.nodes) {
    const d = s.dispositions.get(n.id);
    const ti = L.timeIndex.find((x) => x.id === n.id);
    if (d) n.status = d.disposition;
    else if (!ti) n.status = 'unscheduled';
    else if (ti.lo > now) n.status = 'future';
    else if (ti.hi >= now) n.status = 'pending';
    else n.status = 'unresolved';
    if (d) {
      const occ = d.occurrenceId ? s.occurrences.get(d.occurrenceId) : undefined;
      const actual = occ?.outcome.length ? [`本局结果：${occ.outcome.map((x) => (x.op === 'set' ? `${name(L, x.entity_id, s)}.${x.predicate}=${JSON.stringify(x.value)}` : `${x.entity_id}.${x.predicate} 未知`)).join('；')}`] : [];
      if (occ?.origin === 'intervention') n.forced = true;
      if (occ?.linkedFrom?.length) n.linked = true;
      if (/^concluded by the player/.test(d.reason || '')) { n.concluded = true; n.forced = true; }
      // after story: what the story showed of it after it closed, not yet merged into the result (重新分析 merges it)
      const merged = new Set(occ?.linkedFrom || []);
      const after = [...s.occurrences.values()].filter((o) => o.afterOf === n.id && !merged.has(o.occurrenceId)).sort((a, b) => a.time.lo - b.time.lo);
      if (after.length) n.afterStory = after.length;
      n.detail = [`本局状态：${statusLabel(n.status)}`, ...(occ ? [`实际经过：${occ.account}`, `来源：${ORIGIN_LABEL[occ.origin] || occ.origin}`] : []), ...actual, ...after.map((o) => `后续（${formatTick(o.time.lo, origin)}）：${o.account}`), ...(n.detail || [])];
    } else {
      // shown under way in play, result not settled yet: judged when it ends
      const beats = [...s.occurrences.values()].filter((o) => o.inProgressOf === n.id).sort((a, b) => a.time.lo - b.time.lo);
      if (beats.length) n.inProgress = true;
      n.detail = [`本局状态：${beats.length ? '进行中（时间窗口结束时定结果）' : statusLabel(n.status)}`, ...beats.map((o) => `已发生的部分：${o.account}`), ...(n.detail || [])];
    }
    if (!spoilers && (n.status === 'future' || n.status === 'pending')) {
      n.masked = true;
      n.title = n.lane === 'HARD' ? 'HARD 锚点（剧透已隐藏）' : '？？？';
      n.summary = '（未来事件；勾选“显示剧透”查看）';
      n.required = n.lane === 'HARD' ? '（剧透已隐藏）' : null;
      n.detail = [`本局状态：${statusLabel(n.status)}`];
    }
  }
  // runtime occurrences (actual play) that are not a canon event's own record; a scene chain
  // (occurrences that continue one another) is shown as one box
  // 整理本局事件: events in a digest episode are drawn as that episode's box
  const digestOf = new Map<string, (typeof digest)[number]>();
  for (const dg of digest) for (const m of dg.members) if (s.occurrences.has(m)) digestOf.set(m, dg);
  const chains = new Map<string, Array<typeof s.occurrences extends Map<string, infer V> ? V : never>>();
  for (const o of s.occurrences.values()) {
    if (o.packEventId || digestOf.has(o.occurrenceId)) continue;
    const root = sceneRoot(s.occurrences, o.occurrenceId);
    chains.set(root, [...(chains.get(root) || []), o]);
  }
  const outcomeText = (o: { outcome: { op: string; entity_id: string; predicate: string; value?: unknown }[] }) => o.outcome.map((d) => (d.op === 'set' ? `${name(L, d.entity_id, s)}.${d.predicate}=${JSON.stringify(d.value)}` : `${d.entity_id}.${d.predicate} 未知`));
  const segments: [string, typeof s.occurrences extends Map<string, infer V> ? V[] : never, (typeof digest)[number]?][] = [];
  for (const [root, ms] of chains) {
    ms.sort((a, b) => a.time.lo - b.time.lo);
    segmentSceneChain(ms).forEach((seg, i) => segments.push([i === 0 ? root : seg[0].occurrenceId, seg]));
  }
  for (const dg of digest) {
    const ms = dg.members.map((m) => s.occurrences.get(m)!).filter((o) => o && digestOf.get(o.occurrenceId) === dg).sort((a, b) => a.time.lo - b.time.lo);
    if (ms.length) segments.push([`digest:${dg.id}`, ms, dg]);
  }
  const boxOf = new Map<string, string>();
  for (const [id, seg] of segments) for (const m of seg) boxOf.set(m.occurrenceId, id);
  for (const [root, members, dg] of segments) {
    const first = members[0];
    const lo = Math.min(...members.map((m) => m.time.lo)), hi = Math.max(...members.map((m) => m.time.hi));
    const span = members.length > 1 ? { lo, hi, precision: 'range' as const } : first.time;
    const outcomes = members.flatMap(outcomeText);
    g.nodes.push({
      id: root, title: dg ? `${dg.title}（${members.length}段）` : members.length > 1 ? `${first.title}（${members.length}段）` : first.title, lane: 'RUNTIME', tick: lo, tickHi: hi, when: formatStoryTime(span, origin), short: shortRange(lo, hi, origin),
      summary: dg ? `${dg.summary}\n\n${members.map((m) => `· ${formatTick(m.time.lo, origin).split(' ')[1]} ${m.title}`).join('\n')}` : members.length > 1 ? members.map((m) => `${m.title}：${m.account}`).join('\n') : first.account,
      status: 'runtime', origin: first.origin,
      detail: [`来源：${uniq(members.map((m) => ORIGIN_LABEL[m.origin] || m.origin)).join('、')}`, ...(members.length > 1 && !dg ? [`同一场景：${members.map((m) => `${formatTick(m.time.lo, origin).split(' ')[1]} ${m.title}`).join(' → ')}`] : []), ...(outcomes.length ? [`本局结果：${outcomes.join('；')}`] : [])],
    });
  }
  // actual causal links (occurrence -> occurrence), mapped onto canon nodes / scene boxes where applicable
  const nodeOf = (occId: string) => { const o = s.occurrences.get(occId); return o?.packEventId || boxOf.get(occId) || sceneRoot(s.occurrences, occId); };
  const edgeSeen = new Set<string>();
  for (const o of s.occurrences.values()) for (const c of o.causes) {
    const from = nodeOf(c), to = nodeOf(o.occurrenceId);
    if (from === to || edgeSeen.has(`${from}>${to}`)) continue;
    edgeSeen.add(`${from}>${to}`);
    g.edges.push({ from, to, kind: 'cause', note: '本局实际因果' });
  }
  if (!spoilers) {
    const hidden = new Set(g.nodes.filter((n) => n.masked && n.lane !== 'HARD').map((n) => n.id));
    g.nodes = g.nodes.filter((n) => !hidden.has(n.id));
    g.edges = g.edges.filter((e) => !hidden.has(e.from) && !hidden.has(e.to));
  }
  g.nowTick = now;
  void occByPack;
  return g;
}

function shortRange(lo: number, hi: number, origin: { y: number; m: number; d: number } | null): string {
  const a = formatTick(lo, origin).split(' ')[0], b = formatTick(hi, origin).split(' ')[0];
  const hm = (t: number) => formatTick(t, origin).split(' ')[1];
  if (a === b) return hi - lo >= 1439 ? a : `${a} ${hm(lo)}${hi > lo ? '–' + hm(hi) : ''}`;
  return `${a} ~ ${b.replace(/^(\d{4})-/, (m, y) => (a.startsWith(y) ? '' : m))}`;
}

function name(L: LoadedPack, id: string, s?: WorldState): string {
  return L.entities.get(id)?.name || s?.runtimeEntities.get(id)?.name || id;
}

export function statusLabel(st?: GStatus): string {
  const m: Record<string, string> = { occurred: '已发生', diverged: '已改变', omitted: '未发生', pending: '进行中/临近', future: '未来', unresolved: '时间已过，下次时间推进时结算', unscheduled: '时间不明（背景）', runtime: '本局事件' };
  return st ? m[st] || st : '';
}

// ---------------------------------------------------------------------------------------------
// Layout + rendering

// Time axis: x is a monotone function of story time. Between consecutive event boundaries the
// distance grows with the logarithm of the gap, so hours stay readable next to decades while order
// and overlap stay exact. A box runs from its start to its end time; a box too narrow for its text
// shows the text beside it.
const NODE_H = 46, ROW_GAP = 10, LANE_PAD = 28, AXIS_H = 40, LEFT = 92, MIN_BAR = 10, UNK_W = 168;
const LANES: GNode['lane'][] = ['HARD', 'SOFT', 'FREE', 'RUNTIME'];
const LANE_LABEL: Record<string, string> = { HARD: 'HARD 必然', SOFT: 'SOFT 重要', FREE: 'FREE 背景', RUNTIME: '本局事件' };

interface Placed extends GNode { x: number; y: number; w: number; inside: boolean; title2: string; sub2: string }

/** Pixels between two adjacent boundaries `dt` minutes apart. */
const gapPx = (dt: number) => (dt <= 0 ? 0 : 10 + 26 * Math.log2(1 + dt / 60));
const textW = (s: string, px: number) => [...s].reduce((a, c) => a + (/[\u0000-ÿ]/.test(c) ? px * 0.56 : px), 0);

export function timeScale(ticks: number[], x0: number): { x: (t: number) => number; end: number } {
  const bps = [...new Set(ticks.filter(Number.isFinite))].sort((a, b) => a - b);
  const xs: number[] = [];
  let x = x0;
  bps.forEach((t, i) => { if (i) x += gapPx(t - bps[i - 1]); xs.push(x); });
  const at = (t: number) => {
    if (!bps.length) return x0;
    if (t <= bps[0]) return xs[0] - gapPx(bps[0] - t);
    if (t >= bps[bps.length - 1]) return xs[xs.length - 1] + gapPx(t - bps[bps.length - 1]);
    let lo = 0, hi = bps.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bps[m] <= t) lo = m; else hi = m; }
    return xs[lo] + ((t - bps[lo]) / (bps[hi] - bps[lo])) * (xs[hi] - xs[lo]);
  };
  return { x: at, end: xs.length ? xs[xs.length - 1] : x0 };
}

function layout(g: GraphData): { placed: Placed[]; width: number; height: number; laneY: Record<string, [number, number]>; ticks: { x: number; label: string; major: boolean }[]; nowX: number | null; axisStart: number } {
  const sorted = [...g.nodes].sort((a, b) => a.tick - b.tick || (a.tickHi ?? a.tick) - (b.tickHi ?? b.tick) || LANES.indexOf(a.lane) - LANES.indexOf(b.lane) || a.title.localeCompare(b.title));
  const unknown = sorted.filter((n) => !Number.isFinite(n.tick));
  // undated background events sit in their own column left of the axis
  const unkRows = Math.max(...LANES.map((l) => unknown.filter((n) => n.lane === l).length), 0);
  const axisStart = LEFT + (unknown.length ? UNK_W + 40 : 0);
  const bounds = sorted.filter((n) => Number.isFinite(n.tick)).flatMap((n) => [n.tick, n.tickHi ?? n.tick]);
  if (g.nowTick !== null) bounds.push(g.nowTick);
  const sc = timeScale(bounds, axisStart + 10);
  const rowsByLane: Record<string, number[]> = { HARD: [], SOFT: [], FREE: [], RUNTIME: [] };
  const geo = new Map<string, { x: number; w: number; row: number; inside: boolean; title2: string; sub2: string }>();
  const unkIdx: Record<string, number> = { HARD: 0, SOFT: 0, FREE: 0, RUNTIME: 0 };
  for (const n of sorted) {
    const subRaw = n.sub || n.short || n.when.split(' · ')[0];
    if (!Number.isFinite(n.tick)) {
      const row = unkIdx[n.lane]++;
      geo.set(n.id, { x: LEFT, w: UNK_W, row, inside: true, title2: clip(n.title, 13), sub2: clip(subRaw, 26) });
      continue;
    }
    const x = sc.x(n.tick);
    const w = Math.max(MIN_BAR, sc.x(n.tickHi ?? n.tick) - x);
    const title2 = clip(n.title, 16), sub2 = clip(subRaw, 28);
    const need = Math.max(textW(title2, 12.5), textW(sub2, 10.5)) + 16;
    const inside = w >= need;
    const end = x + w + (inside ? 0 : 6 + need);
    const rows = rowsByLane[n.lane];
    let r = rows.findIndex((e) => e + 8 <= x);
    if (r < 0) { rows.push(0); r = rows.length - 1; }
    rows[r] = end;
    geo.set(n.id, { x, w, row: r, inside, title2, sub2 });
  }
  const laneY: Record<string, [number, number]> = {};
  let y = AXIS_H;
  for (const l of LANES) {
    if (!g.nodes.some((n) => n.lane === l)) { laneY[l] = [y, y]; continue; }
    const rows = Math.max(1, rowsByLane[l].length, unknown.length ? unkIdx[l] : 0);
    laneY[l] = [y, y + LANE_PAD + rows * (NODE_H + ROW_GAP)];
    y = laneY[l][1] + 6;
  }
  void unkRows;
  const placed: Placed[] = sorted.map((n) => { const p = geo.get(n.id)!; return { ...n, x: p.x, w: p.w, inside: p.inside, title2: p.title2, sub2: p.sub2, y: laneY[n.lane][0] + LANE_PAD / 2 + p.row * (NODE_H + ROW_GAP) }; });
  const ticks = axisTicks(g, sc, bounds);
  const nowX = g.nowTick !== null ? sc.x(g.nowTick) : null;
  const width = Math.max(sc.end, ...placed.map((p) => p.x + p.w + (p.inside ? 0 : 6 + textW(p.title2, 12.5) + 16))) + 60;
  return { placed, width, height: y + 10, laneY, ticks, nowX, axisStart };
}

/** Year / month / day / hour marks, as dense as the scale allows without overlapping labels. */
function axisTicks(g: GraphData, sc: { x: (t: number) => number }, bounds: number[]) {
  const out: { x: number; label: string; major: boolean }[] = [];
  if (!bounds.length) return out;
  const lo = Math.min(...bounds), hi = Math.max(...bounds);
  const origin = g.origin || null;
  const cands: { t: number; label: string; major: boolean }[] = [];
  const day0 = Math.floor(lo / 1440), day1 = Math.ceil(hi / 1440);
  if (origin) {
    // calendar: month starts (major, with the year at January / first) and day starts
    const base = Date.UTC(origin.y, origin.m - 1, origin.d);
    const dayOf = (d: number) => new Date(base + d * 86400000);
    let prevY = NaN;
    const span = day1 - day0;
    if (span > 4000) {
      for (let yr = dayOf(day0).getUTCFullYear(); yr <= dayOf(day1).getUTCFullYear() + 1; yr++) {
        const d = Math.round((Date.UTC(yr, 0, 1) - base) / 86400000);
        cands.push({ t: d * 1440, label: `${yr}`, major: true });
      }
    }
    for (let d = Math.max(day0, day1 - 20000); d <= day1; d++) {
      const dt = dayOf(d);
      const yr = dt.getUTCFullYear(), mo = dt.getUTCMonth() + 1, dd = dt.getUTCDate();
      if (dd === 1) { cands.push({ t: d * 1440, label: yr !== prevY ? `${yr}-${String(mo).padStart(2, '0')}` : `${mo}月`, major: true }); prevY = yr; }
      else cands.push({ t: d * 1440, label: `${mo}/${dd}`, major: false });
    }
  } else {
    for (let d = Math.max(day0, day1 - 20000); d <= day1; d++) cands.push({ t: d * 1440, label: `D${d}`, major: d % 30 === 0 });
  }
  // hour marks inside days that are drawn wide enough
  for (let d = day0; d <= day1 && d - day0 < 2000; d++) {
    if (sc.x((d + 1) * 1440) - sc.x(d * 1440) < 240) continue;
    for (let h = 3; h < 24; h += 3) cands.push({ t: d * 1440 + h * 60, label: `${String(h).padStart(2, '0')}:00`, major: false });
  }
  // majors first, then minors in the free space; a label needs its own width to the next mark
  const placedX: { x: number; w: number }[] = [];
  const free = (x: number, w: number) => placedX.every((p) => x + w <= p.x || x >= p.x + p.w);
  for (const major of [true, false]) {
    for (const c of cands.filter((k) => k.major === major).sort((a, b) => a.t - b.t)) {
      const x = sc.x(c.t);
      const w = textW(c.label, 11) + 10;
      if (!free(x, w)) continue;
      placedX.push({ x, w });
      out.push({ x, label: c.label, major: c.major });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

const clip = (s: string, n: number) => ([...s].length > n ? [...s].slice(0, n - 1).join('') + '…' : s);

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderGraphSvg(g: GraphData, mode: 'pack' | 'current'): string {
  const g2 = { ...g, nodes: g.nodes.map((n) => ({ ...n, sub: mode === 'current' && n.status ? `${statusLabel(n.status)} · ${n.short || ''}` : n.short || n.when.split(' · ')[0] })) };
  const L = layout(g2);
  const pos = new Map(L.placed.map((p) => [p.id, p]));
  const lanes = LANES.filter((l) => L.laneY[l][1] > L.laneY[l][0]).map((l, i) => `<rect x="0" y="${L.laneY[l][0]}" width="${L.width}" height="${L.laneY[l][1] - L.laneY[l][0]}" class="cg-lane cg-lane-${i % 2}"/><text x="8" y="${L.laneY[l][0] + 18}" class="cg-lane-label">${LANE_LABEL[l]}</text>`).join('');
  const ticks = L.ticks.map((tk) => `<line x1="${tk.x}" y1="${AXIS_H - 6}" x2="${tk.x}" y2="${L.height}" class="cg-tick${tk.major ? ' cg-tick-major' : ''}"/><text x="${tk.x + 3}" y="${AXIS_H - 12}" class="cg-tick-label${tk.major ? ' cg-tick-major' : ''}">${esc(tk.label)}</text>`).join('')
    + (L.axisStart > LEFT ? `<text x="${LEFT}" y="${AXIS_H - 12}" class="cg-tick-label">时间不明</text><line x1="${L.axisStart - 20}" y1="${AXIS_H - 6}" x2="${L.axisStart - 20}" y2="${L.height}" class="cg-tick cg-tick-major"/>` : '');
  const edges = g.edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return '';
    const x1 = a.x + a.w, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const d = x2 >= x1 ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` : `M${a.x + a.w / 2},${a.y + NODE_H} C${a.x + a.w / 2},${a.y + NODE_H + 60} ${b.x + b.w / 2},${b.y + NODE_H + 60} ${b.x + b.w / 2},${b.y + NODE_H}`;
    return `<path d="${d}" class="cg-edge cg-edge-${esc(e.kind)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" marker-end="url(#cg-arrow-${esc(e.kind)})"><title>${esc(e.kind)}${e.note ? '：' + esc(e.note) : ''}</title></path>`;
  }).join('');
  const nodes = L.placed.map((n) => {
    const cls = mode === 'pack' ? `cg-c-${n.lane}` : `cg-c-${n.lane} cg-s-${n.status}`;
    const tx = n.inside ? 8 : n.w + 6;
    const tc = n.inside ? '' : ' cg-out';
    return `<g class="cg-node ${cls}${n.inside ? '' : ' cg-narrow'}" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})"><rect width="${n.w}" height="${NODE_H}" rx="${Math.min(7, n.w / 2)}"/>`
      + (n.inside ? '' : `<rect class="cg-hit" x="${n.w}" width="${Math.max(textW(n.title2, 12.5), textW(n.sub2, 10.5)) + 12}" height="${NODE_H}"/>`)
      + `<text x="${tx}" y="18" class="cg-node-title${tc}">${esc(n.title2)}</text><text x="${tx}" y="36" class="cg-node-sub${tc}">${esc(n.sub2)}</text>`
      // a long bar repeats its title so it stays readable wherever it is in view
      + (n.inside && n.w > 1400 ? Array.from({ length: Math.floor((n.w - 400) / 1000) }, (_, k) => `<text x="${8 + (k + 1) * 1000}" y="18" class="cg-node-title">${esc(n.title2)}</text>`).join('') : '')
      + `<title>${esc(n.title)} · ${esc(n.when)}</title></g>`;
  }).join('');
  const now = L.nowX !== null ? `<line x1="${L.nowX}" y1="0" x2="${L.nowX}" y2="${L.height}" class="cg-now"/><text x="${L.nowX + 4}" y="12" class="cg-now-label">现在</text>` : '';
  const markers = ['enables', 'motivates', 'precedes', 'related', 'cause'].map((k) => `<marker id="cg-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cg-arrow-${k}"/></marker>`).join('');
  return `<svg class="cg-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" data-w="${L.width}" data-h="${L.height}" viewBox="0 0 ${Math.min(L.width, 1600)} ${L.height}"><defs>${markers}</defs>${lanes}${ticks}${edges}${nodes}${now}</svg>`;
}

/** Interactive panel controller (pan/zoom, selection, filters). */
export interface MembersView {
  now: { id: string; name: string; leader: string | null; members: string[]; status: string | null }[];
  changes: { when: string; event: string; org: string; leader?: string | null; members?: string[]; state: 'occurred' | 'diverged' | 'pending' | 'future' }[];
  hidden: number;
}

export class GraphPanel {
  el: HTMLElement;
  private data: { pack: GraphData | null; current: GraphData | null } = { pack: null, current: null };
  private mode: 'pack' | 'current' = 'current';
  private filter = { q: '', arc: '', lanes: new Set(['HARD', 'SOFT', 'FREE', 'RUNTIME']) };
  private vb = { x: 0, y: 0, w: 1600, h: 600 };
  private keepView = false;
  private sig = '';
  private selected: string | null = null;
  private getData: (spoilers: boolean) => { pack: GraphData | null; current: GraphData | null; spoilers: boolean; digested?: boolean };
  private setSpoilers: (v: boolean) => void;
  private onEventAction: (act: 'force' | 'unforce' | 'focus' | 'digest' | 'undigest' | 'reanalyze' | 'conclude' | 'link-occurred' | 'link-diverged', id: string, ids?: string[]) => Promise<void>;
  private linkCandidates: (id: string) => { id: string; title: string; when: string }[];
  private armed: string | null = null;
  private showMembers = false;
  private getMembers: (spoilers: boolean) => MembersView | null;

  constructor(getData: GraphPanel['getData'], setSpoilers: (v: boolean) => void, onEventAction: GraphPanel['onEventAction'] = async () => undefined, linkCandidates: GraphPanel['linkCandidates'] = () => [], getMembers: GraphPanel['getMembers'] = () => null) {
    this.getData = getData;
    this.getMembers = getMembers;
    this.setSpoilers = setSpoilers;
    this.onEventAction = onEventAction;
    this.linkCandidates = linkCandidates;
    this.el = document.createElement('div');
    this.el.id = 'canon-graph-panel';
    this.el.className = 'canon-graph-panel';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('input', (ev) => this.onInput(ev));
    this.el.addEventListener('change', (ev) => this.onInput(ev));
  }

  isOpen() { return this.el.style.display !== 'none'; }
  toggle(open?: boolean) {
    const o = open ?? !this.isOpen();
    this.el.style.display = o ? '' : 'none';
    if (o) this.refresh();
  }

  refresh() {
    if (!this.isOpen()) return;
    const d = this.getData(false);
    this.data = { pack: d.pack, current: d.current };
    if (!d.current && this.mode === 'current') this.mode = 'pack';
    const g0 = this.mode === 'pack' ? d.pack : d.current;
    const g = g0 ? this.applyFilter(g0) : null;
    const arcs = (d.pack?.arcs || []).map((a) => `<option value="${esc(a.id)}" ${a.id === this.filter.arc ? 'selected' : ''}>${esc(a.title)}</option>`).join('');
    this.el.innerHTML = `
      <div class="cg-head">
        <b>${t('graphTitle')}</b>
        <div class="cg-tabs">
          <button class="menu_button ${this.mode === 'current' ? 'active' : ''}" data-mode="current" ${d.current ? '' : 'disabled'}>${t('graphCurrent')}</button>
          <button class="menu_button ${this.mode === 'pack' ? 'active' : ''}" data-mode="pack" ${d.pack ? '' : 'disabled'}>${t('graphPack')}</button>
        </div>
        <input class="text_pole cg-q" placeholder="${t('graphSearch')}" value="${esc(this.filter.q)}">
        <select class="text_pole cg-arc"><option value="">${t('graphAllArcs')}</option>${arcs}</select>
        ${LANES.map((l) => `<label class="cg-lanechk"><input type="checkbox" data-lane="${l}" ${this.filter.lanes.has(l) ? 'checked' : ''}>${LANE_LABEL[l]}</label>`).join('')}
        <label class="cg-lanechk"><input type="checkbox" class="cg-spoil" ${d.spoilers ? 'checked' : ''}>${t('spoilers')}</label>
        ${this.mode === 'current' && d.current ? `<button class="menu_button cg-digest" data-act="digest" title="${esc(t('digestTip'))}">${t('digest')}</button>${d.digested ? `<button class="menu_button" data-act="undigest" title="${esc(t('undigestTip'))}">${t('undigest')}</button>` : ''}` : ''}
        <button class="menu_button ${this.showMembers ? 'active' : ''}" data-act="members" title="${esc(t('membersTip'))}">${t('members')}</button>
        <button class="menu_button" data-act="fit">${t('graphFit')}</button>
        <button class="menu_button" data-act="close">✕</button>
      </div>
      <div class="cg-legend">${this.legend()}<span class="cg-hint">${this.mode === 'pack' ? t('graphPackNote') : t('graphCurrentNote')}</span></div>
      <div class="cg-body">
        <div class="cg-canvas">${this.showMembers ? this.membersHtml(d.spoilers) : !g ? `<div class="cg-empty">${t('graphNoData')}</div>` : renderGraphSvg(g, this.mode)}</div>
        <div class="cg-detail"${this.showMembers ? ' style="display:none"' : ''}><div class="cg-empty">${t('graphPick')}</div></div>
      </div>`;
    this.bindCanvas();
    if (this.selected) this.select(this.selected);
  }

  /** Re-render only when the underlying data changed; keeps viewport and selection. */
  refreshIfChanged(sig: string) {
    if (sig === this.sig) return;
    this.sig = sig;
    if (!this.isOpen()) return;
    this.keepView = true;
    this.refresh();
  }

  /** 组织成员: organizations now in this game, and the pack's membership changes (upcoming ones only with spoilers). */
  private membersHtml(spoilers: boolean): string {
    const m = this.getMembers(spoilers);
    if (!m) return `<div class="cg-empty">${t('graphNoData')}</div>`;
    const now = m.now.length
      ? `<table class="canon-table cg-members"><tr><th>${t('membersOrg')}</th><th>${t('membersLeader')}</th><th>${t('membersList')}</th><th>${t('membersStatus')}</th></tr>${m.now.map((o) => `<tr><td>${esc(o.name)}</td><td>${esc(o.leader || '—')}</td><td>${esc(o.members.join('、') || '—')}</td><td>${esc(o.status || '')}</td></tr>`).join('')}</table>`
      : `<div class="cg-empty">${t('membersNone')}</div>`;
    const ch = m.changes.length
      ? `<table class="canon-table cg-members"><tr><th>${t('membersWhen')}</th><th>${t('membersEvent')}</th><th>${t('membersOrg')}</th><th>${t('membersChange')}</th><th></th></tr>${m.changes.map((c) => `<tr class="cg-mstate-${c.state}"><td>${esc(c.when)}</td><td>${esc(c.event)}</td><td>${esc(c.org)}</td><td>${esc(c.members !== undefined ? (c.members.length ? c.members.join('、') : t('membersEmptied')) : `${t('membersLeader')} → ${c.leader || t('membersNoLeader')}`)}</td><td><span class="cg-key cg-s-${c.state}">${statusLabel(c.state as GStatus)}</span></td></tr>`).join('')}</table>`
      : '';
    return `<div class="cg-memberswrap"><h4>${t('membersNowTitle')}</h4>${now}<h4>${t('membersChangesTitle')}</h4>${ch || `<div class="cg-empty">${t('membersNoChanges')}</div>`}${m.hidden ? `<div class="cg-hint">${t('membersHidden').replace('{n}', String(m.hidden))}</div>` : ''}</div>`;
  }

  private legend(): string {
    if (this.mode === 'pack') return `<span class="cg-key cg-c-HARD">HARD</span><span class="cg-key cg-c-SOFT">SOFT</span><span class="cg-key cg-c-FREE">FREE</span><span class="cg-ek cg-edge-enables">促成</span><span class="cg-ek cg-edge-motivates">动机</span><span class="cg-ek cg-edge-precedes">先后</span><span class="cg-ek cg-edge-related">相关</span>`;
    return ['occurred', 'diverged', 'omitted', 'pending', 'future', 'runtime'].map((s) => `<span class="cg-key cg-s-${s}">${statusLabel(s as GStatus)}</span>`).join('') + `<span class="cg-ek cg-edge-cause">本局因果</span><span class="cg-ek cg-edge-enables">原作关系</span>`;
  }

  private applyFilter(g: GraphData): GraphData {
    const q = this.filter.q.trim().toLowerCase();
    const nodes = g.nodes.filter((n) => this.filter.lanes.has(n.lane) && (!this.filter.arc || n.arc === this.filter.arc) && (!q || `${n.title} ${n.summary}`.toLowerCase().includes(q)));
    const ids = new Set(nodes.map((n) => n.id));
    return { ...g, nodes, edges: g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  }

  private bindCanvas() {
    const svg = this.el.querySelector('.cg-svg') as SVGSVGElement | null;
    if (!svg) return;
    const W = Number(svg.dataset.w), H = Number(svg.dataset.h);
    const canvas = this.el.querySelector('.cg-canvas') as HTMLElement;
        // start near "now" in the current view, else at the beginning
    const nowLine = svg.querySelector('.cg-now') as SVGLineElement | null;
    const startX = nowLine ? Math.max(0, Number(nowLine.getAttribute('x1')) - (canvas.clientWidth || 1000) * 0.6) : 0;
    const cw = canvas.clientWidth || 1000, ch = canvas.clientHeight || 600;
    if (!this.keepView) this.vb = { x: startX, y: 0, w: cw, h: ch };
    this.keepView = false;
    const apply = () => svg.setAttribute('viewBox', `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`);
    apply();
    let drag: { x: number; y: number; vx: number; vy: number } | null = null;
    svg.addEventListener('mousedown', (e) => { if ((e.target as Element).closest('.cg-node')) return; drag = { x: e.clientX, y: e.clientY, vx: this.vb.x, vy: this.vb.y }; svg.classList.add('cg-grab'); });
    window.addEventListener('mouseup', () => { drag = null; svg.classList.remove('cg-grab'); });
    svg.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const k = this.vb.w / svg.clientWidth;
      this.vb.x = drag.vx - (e.clientX - drag.x) * k;
      this.vb.y = drag.vy - (e.clientY - drag.y) * k;
      apply();
    });
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) { this.vb.x += (e.deltaX || e.deltaY) * (this.vb.w / svg.clientWidth); apply(); return; }
      const r = svg.getBoundingClientRect();
      const px = this.vb.x + ((e.clientX - r.left) / r.width) * this.vb.w;
      const py = this.vb.y + ((e.clientY - r.top) / r.height) * this.vb.h;
      const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const nw = Math.min(Math.max(this.vb.w * f, cw / 3), Math.max(W, cw) * 1.2);
      const nf = nw / this.vb.w;
      this.vb = { x: px - (px - this.vb.x) * nf, y: py - (py - this.vb.y) * nf, w: nw, h: this.vb.h * nf };
      apply();
    }, { passive: false });
    (this as unknown as { fit: () => void }).fit = () => {
      const k = Math.max(W / cw, H / ch, 1); // never zoom in beyond 1:1
      this.vb = { x: 0, y: 0, w: cw * k, h: ch * k }; apply();
    };
  }

  private onInput(ev: Event) {
    const tg = ev.target as HTMLInputElement;
    if (tg.classList.contains('cg-q')) { this.filter.q = tg.value; if (ev.type === 'change') { this.keepView = false; this.refresh(); } return; }
    if (tg.classList.contains('cg-arc')) { this.filter.arc = tg.value; this.keepView = true; this.refresh(); return; }
    if (tg.dataset.lane) { if (tg.checked) this.filter.lanes.add(tg.dataset.lane); else this.filter.lanes.delete(tg.dataset.lane); this.keepView = true; this.refresh(); return; }
    if (tg.classList.contains('cg-spoil')) { this.setSpoilers(tg.checked); this.keepView = true; this.refresh(); }
  }

  private onClick(ev: Event) {
    const tg = ev.target as HTMLElement;
    const b = tg.closest('[data-mode],[data-act]') as HTMLElement | null;
    if (b?.dataset.mode) { this.mode = b.dataset.mode as 'pack' | 'current'; this.selected = null; this.refresh(); return; }
    if (b?.dataset.act === 'close') { this.toggle(false); return; }
    if (b?.dataset.act === 'members') { this.showMembers = !this.showMembers; this.keepView = true; this.refresh(); return; }
    if (b?.dataset.act === 'fit') { (this as unknown as { fit?: () => void }).fit?.(); return; }
    if (b?.dataset.act === 'digest' || b?.dataset.act === 'undigest') {
      (b as HTMLButtonElement).disabled = true;
      if (b.dataset.act === 'digest') b.textContent = t('digestBusy');
      void this.onEventAction(b.dataset.act, '').finally(() => { this.keepView = true; this.refresh(); });
      return;
    }
    if (b?.dataset.act === 'linkopen') {
      const id = b.dataset.id!;
      const box = this.el.querySelector('.cg-linkpick') as HTMLElement | null;
      if (!box) return;
      if (box.innerHTML) { box.innerHTML = ''; return; }
      const cands = this.linkCandidates(id);
      box.innerHTML = cands.length
        ? `<div class="cg-linkhint">${esc(t('linkPick'))}</div>` + cands.map((c) => `<label class="cg-linkrow"><input type="checkbox" value="${esc(c.id)}"> <span class="cg-linkwhen">${esc(c.when)}</span> ${esc(c.title)}</label>`).join('') +
          `<div class="cg-linkbtns"><button class="menu_button" data-act="link-occurred" data-id="${esc(id)}" title="${esc(t('linkOccurredTip'))}">${t('linkOccurred')}</button><button class="menu_button" data-act="link-diverged" data-id="${esc(id)}" title="${esc(t('linkDivergedTip'))}">${t('linkDiverged')}</button></div>`
        : `<div class="cg-linkhint">${esc(t('linkNone'))}</div>`;
      return;
    }
    if (b && (b.dataset.act === 'link-occurred' || b.dataset.act === 'link-diverged')) {
      const ids = [...this.el.querySelectorAll('.cg-linkpick input:checked')].map((x) => (x as HTMLInputElement).value);
      if (!ids.length) { const h = this.el.querySelector('.cg-linkhint') as HTMLElement | null; if (h) h.textContent = t('linkPickFirst'); return; }
      (b as HTMLButtonElement).disabled = true;
      b.textContent = '…';
      void this.onEventAction(b.dataset.act as 'link-occurred' | 'link-diverged', b.dataset.id!, ids).finally(() => { this.keepView = true; this.refresh(); });
      return;
    }
    if (b?.dataset.act === 'focus') {
      (b as HTMLButtonElement).disabled = true;
      void this.onEventAction('focus', b.dataset.id!).finally(() => { this.keepView = true; this.refresh(); });
      return;
    }
    if (b && (b.dataset.act === 'force' || b.dataset.act === 'unforce' || b.dataset.act === 'reanalyze' || b.dataset.act === 'conclude')) {
      const id = b.dataset.id!, act = b.dataset.act;
      // two clicks: the first arms the button (no browser dialog), the second acts
      if (this.armed !== act + ':' + id) { this.armed = act + ':' + id; b.textContent = act === 'force' ? t('forceConfirm') : act === 'reanalyze' ? t('reanalyzeConfirm') : act === 'conclude' ? t('concludeConfirm') : t('unforceConfirm'); return; }
      this.armed = null;
      (b as HTMLButtonElement).disabled = true;
      b.textContent = '…';
      void this.onEventAction(act as 'force' | 'unforce' | 'reanalyze' | 'conclude', id).finally(() => { this.keepView = true; this.refresh(); });
      return;
    }
    const node = tg.closest('.cg-node') as SVGGElement | null;
    if (node) this.select(node.dataset.id!);
  }

  private select(id: string) {
    const g = this.mode === 'pack' ? this.data.pack : this.data.current;
    const n = g?.nodes.find((x) => x.id === id);
    if (!g || !n) return;
    this.selected = id;
    this.armed = null;
    this.el.querySelectorAll('.cg-node.cg-sel').forEach((x) => x.classList.remove('cg-sel'));
    this.el.querySelectorAll('.cg-edge.cg-hl').forEach((x) => x.classList.remove('cg-hl'));
    this.el.querySelector(`.cg-node[data-id="${CSS.escape(id)}"]`)?.classList.add('cg-sel');
    this.el.querySelectorAll(`.cg-edge[data-from="${CSS.escape(id)}"], .cg-edge[data-to="${CSS.escape(id)}"]`).forEach((x) => x.classList.add('cg-hl'));
    const titleOf = (x: string) => g.nodes.find((k) => k.id === x)?.title || x;
    const ins = g.edges.filter((e) => e.to === id).map((e) => `← ${esc(titleOf(e.from))}（${esc(e.kind)}）`);
    const outs = g.edges.filter((e) => e.from === id).map((e) => `→ ${esc(titleOf(e.to))}（${esc(e.kind)}）`);
    (this.el.querySelector('.cg-detail') as HTMLElement).innerHTML = `
      <h3>${esc(n.title)}</h3>
      <div class="cg-badges"><span class="cg-key cg-c-${n.lane}">${n.lane === 'RUNTIME' ? '本局事件' : n.lane}</span>${n.status ? `<span class="cg-key cg-s-${n.status}">${statusLabel(n.status)}</span>` : ''}</div>
      <div class="cg-when">${esc(n.when)}</div>
      ${n.required ? `<div class="cg-req"><b>必须实现：</b>${esc(n.required)}</div>` : ''}
      <p style="white-space:pre-line">${esc(n.summary)}</p>
      ${this.mode === 'current' && (n.lane === 'SOFT' || n.lane === 'FREE') && (n.status === 'future' || n.status === 'pending') ? `<button class="menu_button cg-focus${n.focused ? ' active' : ''}" data-act="focus" data-id="${esc(n.id)}" title="${esc(t('focusTip'))}">${n.focused ? t('unfocus') : t('focus')}</button>` : ''}
      ${this.mode === 'current' && n.lane !== 'RUNTIME' && n.status !== 'occurred' && n.status !== 'diverged' ? `<button class="menu_button cg-force" data-act="force" data-id="${esc(n.id)}">${t('force')}</button>` : ''}
      ${this.mode === 'current' && n.forced ? `<button class="menu_button cg-unforce" data-act="unforce" data-id="${esc(n.id)}">${n.concluded ? t('unconclude') : n.linked ? t('unlink') : t('unforce')}</button>` : ''}
      ${this.mode === 'current' && n.lane !== 'RUNTIME' && !n.forced && (n.inProgress || n.status === 'pending' || n.status === 'unresolved') ? `<button class="menu_button cg-conclude" data-act="conclude" data-id="${esc(n.id)}" title="${esc(t('concludeTip'))}">${t('conclude')}</button>` : ''}
      ${this.mode === 'current' && n.lane !== 'RUNTIME' && !n.forced ? `<button class="menu_button cg-linkopen" data-act="linkopen" data-id="${esc(n.id)}" title="${esc(t('linkTip'))}">${t('link')}</button><div class="cg-linkpick"></div>` : ''}
      ${this.mode === 'current' && n.reanalyzable && !n.forced ? `<button class="menu_button cg-reanalyze" data-act="reanalyze" data-id="${esc(n.id)}" title="${esc(t('reanalyzeTip'))}">${t('reanalyze')}</button>` : ''}
      ${(n.detail || []).map((x) => `<div class="cg-line">${esc(x)}</div>`).join('')}
      ${ins.length || outs.length ? `<div class="cg-rel"><b>关系</b><br>${[...ins, ...outs].join('<br>')}</div>` : ''}`;
  }
}
