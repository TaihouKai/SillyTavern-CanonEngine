// History graph views: the pack's canonical graph and the current playthrough's actual history.
// Pure SVG (no external libraries). Layout: time runs left→right (ordinal by event time),
// swim lanes by classification (HARD / SOFT / FREE / 本局事件), greedy row packing inside lanes.
import type { LoadedPack } from '../domain/pack';
import type { WorldState } from '../domain/reducer';
import { formatTick, formatStoryTime } from '../domain/time';
import { t } from './i18n';

export type GStatus = 'occurred' | 'diverged' | 'omitted' | 'pending' | 'future' | 'unresolved' | 'unscheduled' | 'runtime';
export interface GNode {
  id: string;
  title: string;
  lane: 'HARD' | 'SOFT' | 'FREE' | 'RUNTIME';
  tick: number;
  when: string;
  short?: string;
  summary: string;
  required?: string | null;
  arc?: string | null;
  status?: GStatus;
  origin?: string;
  detail?: string[];
  masked?: boolean;
}
export interface GEdge { from: string; to: string; kind: string; note?: string }
export interface GraphData { nodes: GNode[]; edges: GEdge[]; nowTick: number | null; arcs: { id: string; title: string }[] }

const ORIGIN_LABEL: Record<string, string> = { player: '玩家', gm: 'GM/NPC', canon: '正史', offscreen: '场外', bootstrap: '开局前', intervention: '干预' };

/** Canonical graph straight from the pack (Graph A). */
export function packGraph(L: LoadedPack, origin: { y: number; m: number; d: number } | null): GraphData {
  const nodes: GNode[] = [];
  for (const ev of L.pack.events) {
    const ti = L.timeIndex.find((x) => x.id === ev.id);
    nodes.push({
      id: ev.id, title: ev.title, lane: ev.classification, tick: ti ? ti.lo : Number.NEGATIVE_INFINITY,
      when: ti ? (ti.lo === ti.hi ? formatTick(ti.lo, origin) : `${formatTick(ti.lo, origin)} – ${formatTick(ti.hi, origin)}`) + ` · ${ev.when.label}` : ev.when.label,
      short: ti ? shortRange(ti.lo, ti.hi, origin) : ev.when.label,
      summary: ev.summary, required: ev.required_description, arc: ev.arc_id,
      detail: [
        ...(ev.outcomes.length ? [`原作结果：${ev.outcomes.map((o) => `${name(L, o.entity_id)}.${o.predicate}=${JSON.stringify(o.value)}`).join('；')}`] : []),
        ...(ev.author_note ? [`注：${ev.author_note}`] : []),
      ],
    });
  }
  const edges: GEdge[] = L.pack.edges.map((e) => ({ from: e.from, to: e.to, kind: e.relation, note: e.note }));
  return { nodes, edges, nowTick: null, arcs: L.pack.arcs.map((a) => ({ id: a.id, title: a.title })) };
}

/** Current playthrough (Graph B): canon statuses + runtime occurrences with actual causal links. */
export function currentGraph(L: LoadedPack, s: WorldState, origin: { y: number; m: number; d: number } | null, spoilers: boolean): GraphData {
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
      n.detail = [`本局状态：${statusLabel(n.status)}`, ...(occ ? [`实际经过：${occ.account}`, `来源：${ORIGIN_LABEL[occ.origin] || occ.origin}`] : []), ...actual, ...(n.detail || [])];
    } else n.detail = [`本局状态：${statusLabel(n.status)}`, ...(n.detail || [])];
    if (!spoilers && (n.status === 'future' || n.status === 'pending')) {
      n.masked = true;
      n.title = n.lane === 'HARD' ? 'HARD 锚点（剧透已隐藏）' : '？？？';
      n.summary = '（未来事件；勾选“显示剧透”查看）';
      n.required = n.lane === 'HARD' ? '（剧透已隐藏）' : null;
      n.detail = [`本局状态：${statusLabel(n.status)}`];
    }
  }
  // runtime occurrences (actual play) that are not a canon event's own record
  for (const o of s.occurrences.values()) {
    if (o.packEventId) continue;
    g.nodes.push({
      id: o.occurrenceId, title: o.title, lane: 'RUNTIME', tick: o.time.lo, when: formatStoryTime(o.time, origin), short: shortRange(o.time.lo, o.time.hi, origin), summary: o.account,
      status: 'runtime', origin: o.origin,
      detail: [`来源：${ORIGIN_LABEL[o.origin] || o.origin}`, ...(o.outcome.length ? [`本局结果：${o.outcome.map((d) => (d.op === 'set' ? `${name(L, d.entity_id, s)}.${d.predicate}=${JSON.stringify(d.value)}` : `${d.entity_id}.${d.predicate} 未知`)).join('；')}`] : [])],
    });
  }
  // actual causal links (occurrence -> occurrence), mapped onto canon nodes where applicable
  const nodeOf = (occId: string) => { const o = s.occurrences.get(occId); return o?.packEventId || occId; };
  for (const o of s.occurrences.values()) for (const c of o.causes) g.edges.push({ from: nodeOf(c), to: nodeOf(o.occurrenceId), kind: 'cause', note: '本局实际因果' });
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
  return a === b ? a : `${a} ~ ${b.replace(/^(\d{4})-/, (m, y) => (a.startsWith(y) ? '' : m))}`;
}

function name(L: LoadedPack, id: string, s?: WorldState): string {
  return L.entities.get(id)?.name || s?.runtimeEntities.get(id)?.name || id;
}

export function statusLabel(st?: GStatus): string {
  const m: Record<string, string> = { occurred: '已发生', diverged: '已改变', omitted: '未发生', pending: '进行中/临近', future: '未来', unresolved: '时间已过但未判定', unscheduled: '时间不明（背景）', runtime: '本局事件' };
  return st ? m[st] || st : '';
}

// ---------------------------------------------------------------------------------------------
// Layout + rendering

const NODE_W = 168, NODE_H = 46, STEP = 64, ROW_GAP = 10, LANE_PAD = 28, AXIS_H = 34, LEFT = 92;
const LANES: GNode['lane'][] = ['HARD', 'SOFT', 'FREE', 'RUNTIME'];
const LANE_LABEL: Record<string, string> = { HARD: 'HARD 必然', SOFT: 'SOFT 重要', FREE: 'FREE 背景', RUNTIME: '本局事件' };

interface Placed extends GNode { x: number; y: number }

function layout(g: GraphData): { placed: Placed[]; width: number; height: number; laneY: Record<string, [number, number]>; ticks: { x: number; label: string }[]; nowX: number | null } {
  const sorted = [...g.nodes].sort((a, b) => a.tick - b.tick || LANES.indexOf(a.lane) - LANES.indexOf(b.lane) || a.title.localeCompare(b.title));
  const xOf = new Map<string, number>();
  let x = LEFT, prevTick: number | null = null;
  for (const n of sorted) {
    if (prevTick !== null && n.tick !== prevTick) x += STEP;
    xOf.set(n.id, x);
    prevTick = n.tick;
  }
  const rowsByLane: Record<string, number[]> = { HARD: [], SOFT: [], FREE: [], RUNTIME: [] };
  const rowOf = new Map<string, number>();
  for (const n of sorted) {
    const rows = rowsByLane[n.lane];
    const nx = xOf.get(n.id)!;
    let r = rows.findIndex((end) => end + 8 <= nx);
    if (r < 0) { rows.push(0); r = rows.length - 1; }
    rows[r] = nx + NODE_W;
    rowOf.set(n.id, r);
  }
  const laneY: Record<string, [number, number]> = {};
  let y = AXIS_H;
  for (const l of LANES) {
    const rows = Math.max(1, rowsByLane[l].length);
    if (!g.nodes.some((n) => n.lane === l)) { laneY[l] = [y, y]; continue; }
    laneY[l] = [y, y + LANE_PAD + rows * (NODE_H + ROW_GAP)];
    y = laneY[l][1] + 6;
  }
  const placed: Placed[] = sorted.map((n) => ({ ...n, x: xOf.get(n.id)!, y: laneY[n.lane][0] + LANE_PAD / 2 + rowOf.get(n.id)! * (NODE_H + ROW_GAP) }));
  // month ticks
  const ticks: { x: number; label: string }[] = [];
  let lastLabel = '';
  for (const n of placed) {
    if (!Number.isFinite(n.tick)) continue;
    const lab = n.when.slice(0, 7);
    if (lab !== lastLabel) { ticks.push({ x: n.x, label: lab }); lastLabel = lab; }
  }
  let nowX: number | null = null;
  if (g.nowTick !== null) {
    const after = placed.find((n) => n.tick > g.nowTick!);
    nowX = after ? after.x - STEP / 2 : (placed.length ? placed[placed.length - 1].x + NODE_W + 10 : LEFT);
  }
  const width = (placed.length ? Math.max(...placed.map((p) => p.x)) : LEFT) + NODE_W + 40;
  return { placed, width, height: y + 10, laneY, ticks, nowX };
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderGraphSvg(g: GraphData, mode: 'pack' | 'current'): string {
  const L = layout(g);
  const pos = new Map(L.placed.map((p) => [p.id, p]));
  const lanes = LANES.filter((l) => L.laneY[l][1] > L.laneY[l][0]).map((l, i) => `<rect x="0" y="${L.laneY[l][0]}" width="${L.width}" height="${L.laneY[l][1] - L.laneY[l][0]}" class="cg-lane cg-lane-${i % 2}"/><text x="8" y="${L.laneY[l][0] + 18}" class="cg-lane-label">${LANE_LABEL[l]}</text>`).join('');
  const ticks = L.ticks.map((tk) => `<line x1="${tk.x}" y1="${AXIS_H - 6}" x2="${tk.x}" y2="${L.height}" class="cg-tick"/><text x="${tk.x + 3}" y="${AXIS_H - 12}" class="cg-tick-label">${esc(tk.label)}</text>`).join('');
  const edges = g.edges.map((e) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return '';
    const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2, x2 = b.x, y2 = b.y + NODE_H / 2;
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    const d = x2 >= x1 ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}` : `M${a.x + NODE_W / 2},${a.y + NODE_H} C${a.x + NODE_W / 2},${a.y + NODE_H + 60} ${b.x + NODE_W / 2},${b.y + NODE_H + 60} ${b.x + NODE_W / 2},${b.y + NODE_H}`;
    return `<path d="${d}" class="cg-edge cg-edge-${esc(e.kind)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" marker-end="url(#cg-arrow-${esc(e.kind)})"><title>${esc(e.kind)}${e.note ? '：' + esc(e.note) : ''}</title></path>`;
  }).join('');
  const nodes = L.placed.map((n) => {
    const cls = mode === 'pack' ? `cg-c-${n.lane}` : `cg-c-${n.lane} cg-s-${n.status}`;
    const title = n.title.length > 13 ? n.title.slice(0, 12) + '…' : n.title;
    const subRaw = mode === 'current' && n.status ? `${statusLabel(n.status)} · ${n.short || ''}` : n.short || n.when.split(' · ')[0];
    const sub = subRaw.length > 26 ? subRaw.slice(0, 25) + '…' : subRaw;
    return `<g class="cg-node ${cls}" data-id="${esc(n.id)}" transform="translate(${n.x},${n.y})"><rect width="${NODE_W}" height="${NODE_H}" rx="7"/><text x="8" y="18" class="cg-node-title">${esc(title)}</text><text x="8" y="36" class="cg-node-sub">${esc(sub)}</text><title>${esc(n.title)}</title></g>`;
  }).join('');
  const now = L.nowX !== null ? `<line x1="${L.nowX}" y1="0" x2="${L.nowX}" y2="${L.height}" class="cg-now"/><text x="${L.nowX + 4}" y="12" class="cg-now-label">现在</text>` : '';
  const markers = ['enables', 'motivates', 'precedes', 'related', 'cause'].map((k) => `<marker id="cg-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cg-arrow-${k}"/></marker>`).join('');
  return `<svg class="cg-svg" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet" data-w="${L.width}" data-h="${L.height}" viewBox="0 0 ${Math.min(L.width, 1600)} ${L.height}"><defs>${markers}</defs>${lanes}${ticks}${edges}${nodes}${now}</svg>`;
}

/** Interactive panel controller (pan/zoom, selection, filters). */
export class GraphPanel {
  el: HTMLElement;
  private data: { pack: GraphData | null; current: GraphData | null } = { pack: null, current: null };
  private mode: 'pack' | 'current' = 'current';
  private filter = { q: '', arc: '', lanes: new Set(['HARD', 'SOFT', 'FREE', 'RUNTIME']) };
  private vb = { x: 0, y: 0, w: 1600, h: 600 };
  private keepView = false;
  private sig = '';
  private selected: string | null = null;
  private getData: (spoilers: boolean) => { pack: GraphData | null; current: GraphData | null; spoilers: boolean };
  private setSpoilers: (v: boolean) => void;

  constructor(getData: GraphPanel['getData'], setSpoilers: (v: boolean) => void) {
    this.getData = getData;
    this.setSpoilers = setSpoilers;
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
        <button class="menu_button" data-act="fit">${t('graphFit')}</button>
        <button class="menu_button" data-act="close">✕</button>
      </div>
      <div class="cg-legend">${this.legend()}<span class="cg-hint">${this.mode === 'pack' ? t('graphPackNote') : t('graphCurrentNote')}</span></div>
      <div class="cg-body">
        <div class="cg-canvas">${!g ? `<div class="cg-empty">${t('graphNoData')}</div>` : renderGraphSvg(g, this.mode)}</div>
        <div class="cg-detail"><div class="cg-empty">${t('graphPick')}</div></div>
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
    if (b?.dataset.act === 'fit') { (this as unknown as { fit?: () => void }).fit?.(); return; }
    const node = tg.closest('.cg-node') as SVGGElement | null;
    if (node) this.select(node.dataset.id!);
  }

  private select(id: string) {
    const g = this.mode === 'pack' ? this.data.pack : this.data.current;
    const n = g?.nodes.find((x) => x.id === id);
    if (!g || !n) return;
    this.selected = id;
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
      <p>${esc(n.summary)}</p>
      ${(n.detail || []).map((x) => `<div class="cg-line">${esc(x)}</div>`).join('')}
      ${ins.length || outs.length ? `<div class="cg-rel"><b>关系</b><br>${[...ins, ...outs].join('<br>')}</div>` : ''}`;
  }
}
