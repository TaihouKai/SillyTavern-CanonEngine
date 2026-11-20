// 战斗设定 as a graph on one canvas, no library. The page gives the setting around one focus (at most GRAPH_MAX
// points, two steps out). The layout is radial and computed once: the focus in the middle, the first step on a ring
// (each point a sector, wider the more it leads to), the second step on an outer ring inside the sector of what led
// to it, its names written along the radius. Points glide from where they were to where they go (a new focus slides
// to the centre) and then nothing is drawn until the pointer moves — SillyTavern is heavy enough.
import type { GraphEdge, GraphPoint } from '../combat';

/** A colour per kind, shared with the page's chips and legend. */
export const KIND_COLOR: Record<string, string> = {
  concept: '#5b9bf0', rule: '#d9a53a', ability: '#a879e8', precedent: '#e0697a', danger: '#e8613a',
  person: '#43b58a', place: '#3aaebb', organization: '#8aa33c', object: '#a08f78', world: '#8c8c8c', other: '#8c8c8c',
};
export const kindColor = (k: string) => KIND_COLOR[k] || '#8c8c8c';

/** Where each point was last drawn (world coordinates; the focus at 0,0), kept across rebuilds of the page. */
const placed = new Map<string, { x: number; y: number }>();

interface P extends GraphPoint { x: number; y: number; gx: number; gy: number; r: number; angle: number }
interface E extends GraphEdge { a: P; b: P }

/** The radial layout: the goal of every point (gx, gy) and the angle it sits at. */
function layout(ps: P[], es: E[]): void {
  const focus = ps.find((p) => p.depth === 0)!;
  const ring1 = ps.filter((p) => p.depth === 1), ring2 = ps.filter((p) => p.depth === 2);
  // what led to each outer point: its first neighbour on the first ring
  const parent = new Map<P, P>();
  for (const q of ring2) {
    const by = es.find((e) => (e.a === q && e.b.depth === 1) || (e.b === q && e.a.depth === 1));
    parent.set(q, by ? (by.a === q ? by.b : by.a) : ring1[0]);
  }
  const kids = new Map<P, P[]>(ring1.map((p) => [p, ring2.filter((q) => parent.get(q) === p)]));
  const R1 = Math.max(105, (ring1.length * 62) / (2 * Math.PI));
  const R2 = Math.max(R1 + 115, (ring2.length * 19) / (2 * Math.PI));
  focus.gx = 0; focus.gy = 0; focus.angle = 0;
  const weight = (p: P) => 1 + (kids.get(p)?.length || 0) * 0.9;
  const total = ring1.reduce((n, p) => n + weight(p), 0) || 1;
  // a sector: half an even share (so no first-ring name is squeezed against the next), half by what it leads to
  const share = (p: P) => 2 * Math.PI * (0.5 / ring1.length + (0.5 * weight(p)) / total);
  let at = -Math.PI / 2 - (ring1[0] ? share(ring1[0]) / 2 : 0);   // the first sector centred at the top
  for (const p of ring1) {
    const span = share(p);
    p.angle = at + span / 2;
    p.gx = Math.cos(p.angle) * R1; p.gy = Math.sin(p.angle) * R1;
    const ks = kids.get(p) || [];
    // the outer points fill the sector; crowded ones alternate between two radii
    const crowded = (span * R2) / Math.max(1, ks.length) < 16;
    ks.forEach((q, i) => {
      q.angle = at + (span * (i + 0.5)) / ks.length;
      const r = R2 + (crowded && i % 2 ? 38 : 0);
      q.gx = Math.cos(q.angle) * r; q.gy = Math.sin(q.angle) * r;
    });
    at += span;
  }
}

/** Draws the graph on the canvas while the canvas is in the page. pick: a point clicked (not the focus); fought: the
 *  label of a person's link to a precedent they were in. */
export function mountCombatGraph(canvas: HTMLCanvasElement, data: { nodes: GraphPoint[]; edges: GraphEdge[] }, opts: { pick: (id: string) => void; fought: string }): void {
  const ctx = canvas.getContext('2d');
  if (!ctx || !data.nodes.length) return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ps: P[] = data.nodes.map((n) => ({ ...n, r: n.depth === 0 ? 11 : n.depth === 1 ? 7 : 4.5, x: 0, y: 0, gx: 0, gy: 0, angle: 0 }));
  const byId = new Map(ps.map((p) => [p.id, p]));
  const es: E[] = data.edges.map((e) => ({ ...e, a: byId.get(e.from)!, b: byId.get(e.to)! })).filter((e) => e.a && e.b);
  const near = new Map<P, Set<P>>(ps.map((p) => [p, new Set<P>()]));
  for (const e of es) { near.get(e.a)!.add(e.b); near.get(e.b)!.add(e.a); }
  const focus = ps.find((p) => p.depth === 0)!;
  layout(ps, es);
  // each point starts where it was drawn last (shifted so the old centre is the new one), else on its way out
  const was = placed.get(focus.id), shift = was ? { x: -was.x, y: -was.y } : { x: 0, y: 0 };
  for (const p of ps) {
    const q = placed.get(p.id);
    if (q) { p.x = q.x + shift.x; p.y = q.y + shift.y; } else { p.x = p.gx * 0.6; p.y = p.gy * 0.6; }
  }

  // theme: the text colour of the page; a halo of the opposite lightness keeps names readable over lines
  const ink = getComputedStyle(canvas).color || 'rgb(220,220,220)';
  const rgb = (ink.match(/\d+(\.\d+)?/g) || ['220', '220', '220']).slice(0, 3).map(Number);
  const light = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 128;
  const halo = light ? 'rgba(20,20,24,.8)' : 'rgba(250,250,250,.88)';
  const accent = getComputedStyle(canvas).getPropertyValue('--ci-accent').trim() || '#e9a23b';
  const ring2Names = ps.filter((p) => p.depth === 2).length <= 40;

  let W = 0, H = 0, dpr = 1;
  const size = () => { const r = canvas.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
  size();
  // the view fits where the points go (with room for their names)
  let scale = 1, tx = W / 2, ty = H / 2;
  const goal = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of ps) { const m = p.depth === 2 && ring2Names ? 100 : 66; x0 = Math.min(x0, p.gx - m); x1 = Math.max(x1, p.gx + m); y0 = Math.min(y0, p.gy - (p.depth === 2 ? m * 0.9 : 24)); y1 = Math.max(y1, p.gy + (p.depth === 2 ? m * 0.9 : 24)); }
    const s = Math.min(1.5, W / Math.max(1, x1 - x0), H / Math.max(1, y1 - y0));
    return { s, x: W / 2 - ((x0 + x1) / 2) * s, y: H / 2 - ((y0 + y1) / 2) * s };
  };
  { const g = goal(); scale = g.s; tx = g.x; ty = g.y; }
  let hover: P | null = null, raf = 0, last = 0;

  const label = (text: string, x: number, y: number, px: number, color: string) => {
    ctx.font = `${px / scale}px system-ui, sans-serif`;
    ctx.lineWidth = 3 / scale; ctx.strokeStyle = halo; ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
  };
  // a name: the focus's under it; the first ring's beside it, away from the centre; the outer ring's along the radius
  const nameOf = (p: P, px: number) => {
    if (p === focus) { ctx.textAlign = 'center'; ctx.textBaseline = 'top'; label(p.name, p.x, p.y + p.r + 4 / scale, px, ink); return; }
    const ux = Math.cos(p.angle), uy = Math.sin(p.angle), off = p.r + 4 / scale;
    if (p.depth === 1) {
      ctx.textAlign = ux > 0.3 ? 'left' : ux < -0.3 ? 'right' : 'center';
      ctx.textBaseline = uy > 0.3 ? 'top' : uy < -0.3 ? 'bottom' : 'middle';
      label(p.name, p.x + ux * off, p.y + uy * off, px, ink);
      return;
    }
    const flip = ux < 0;
    ctx.save();
    ctx.translate(p.x + ux * off, p.y + uy * off);
    ctx.rotate(flip ? p.angle + Math.PI : p.angle);
    ctx.textAlign = flip ? 'right' : 'left'; ctx.textBaseline = 'middle';
    label(p.name, 0, 0, px, ink);
    ctx.restore();
  };
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(tx, ty); ctx.scale(scale, scale);
    const lit = hover ? new Set<P>([hover, ...near.get(hover)!]) : null;
    for (const e of es) {
      const hot = !!hover && (e.a === hover || e.b === hover);
      const toFocus = e.a === focus || e.b === focus;
      ctx.globalAlpha = hot ? 0.85 : hover ? 0.08 : toFocus ? 0.45 : 0.22;
      ctx.strokeStyle = hot || (!hover && toFocus) ? accent : ink; ctx.lineWidth = (hot ? 1.6 : 1) / scale;
      ctx.setLineDash(e.later ? [4 / scale, 3 / scale] : []);
      // a gentle curve: links between the rings bow away from the centre
      const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2, bow = toFocus ? 0 : 0.12;
      const cx = mx + (mx - focus.x) * bow, cy = my + (my - focus.y) * bow;
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.quadraticCurveTo(cx, cy, e.b.x, e.b.y); ctx.stroke();
      if (hot) {
        // the direction, where the link arrives
        const dx = e.b.x - cx, dy = e.b.y - cy, d = Math.max(1, Math.hypot(dx, dy)), ux = dx / d, uy = dy / d;
        const hx = e.b.x - ux * (e.b.r + 2 / scale), hy = e.b.y - uy * (e.b.r + 2 / scale), h = 6 / scale;
        ctx.setLineDash([]); ctx.fillStyle = accent;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - ux * h - uy * h * 0.55, hy - uy * h + ux * h * 0.55); ctx.lineTo(hx - ux * h + uy * h * 0.55, hy - uy * h - ux * h * 0.55); ctx.fill();
      }
    }
    ctx.setLineDash([]);
    for (const p of ps) {
      ctx.globalAlpha = lit && !lit.has(p) ? 0.25 : 1;
      ctx.fillStyle = kindColor(p.kind);
      ctx.beginPath();
      if (p.entity) { const r = p.r * 0.9; if (ctx.roundRect) ctx.roundRect(p.x - r, p.y - r, 2 * r, 2 * r, r * 0.45); else ctx.rect(p.x - r, p.y - r, 2 * r, 2 * r); } else ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      if (p === focus || p === hover) { ctx.lineWidth = 2.2 / scale; ctx.strokeStyle = p === focus ? accent : ink; ctx.stroke(); }
    }
    for (const p of ps) {
      if (p.depth === 2 && !ring2Names && !lit?.has(p)) continue;
      ctx.globalAlpha = lit && !lit.has(p) ? 0.25 : p.depth === 2 ? 0.8 : 1;
      nameOf(p, p === focus ? 13 : p.depth === 1 ? 11.5 : 9.5);
    }
    // the links of the point under the pointer, named
    if (hover) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.95;
      for (const e of es) if (e.a === hover || e.b === hover) {
        const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2, bow = e.a === focus || e.b === focus ? 0 : 0.06;
        label(e.label ?? opts.fought, mx + (mx - focus.x) * bow, my + (my - focus.y) * bow, 10, accent);
      }
    }
    ctx.globalAlpha = 1;
  };

  const save = () => { for (const p of ps) placed.set(p.id, { x: p.x, y: p.y }); };
  // glide toward the goal by the clock (the same speed however fast the browser draws), then stop
  const frame = () => {
    raf = 0;
    if (!canvas.isConnected) { save(); return; }
    const now = performance.now(), dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    const k = 1 - Math.pow(0.84, dt / 16.7);
    let moving = false;
    for (const p of ps) {
      const dx = p.gx - p.x, dy = p.gy - p.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.3) { p.x += dx * k; p.y += dy * k; moving = true; } else { p.x = p.gx; p.y = p.gy; }
    }
    const g = goal();
    if (Math.abs(g.s - scale) > 0.002 || Math.abs(g.x - tx) + Math.abs(g.y - ty) > 0.5) { scale += (g.s - scale) * k; tx += (g.x - tx) * k; ty += (g.y - ty) * k; moving = true; }
    draw();
    if (moving) raf = requestAnimationFrame(frame); else { save(); last = 0; }
  };
  const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
  if (reduce) { for (const p of ps) { p.x = p.gx; p.y = p.gy; } draw(); save(); } else kick();

  const hit = (ev: MouseEvent) => {
    const x = (ev.offsetX - tx) / scale, y = (ev.offsetY - ty) / scale;
    let best: P | null = null, bd = Infinity;
    for (const p of ps) { const d = Math.hypot(p.x - x, p.y - y); if (d <= p.r + 6 / scale && d < bd) { best = p; bd = d; } }
    return best;
  };
  canvas.addEventListener('pointermove', (ev) => {
    const p = hit(ev);
    if (p === hover) return;
    hover = p; canvas.style.cursor = p && p !== focus ? 'pointer' : '';
    if (!raf) draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.style.cursor = ''; if (!raf) draw(); });
  canvas.addEventListener('click', (ev) => { const p = hit(ev); if (p && p !== focus) { save(); opts.pick(p.id); } });
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => { if (!canvas.isConnected) { ro.disconnect(); return; } size(); kick(); });
    ro.observe(canvas);
  }
}
