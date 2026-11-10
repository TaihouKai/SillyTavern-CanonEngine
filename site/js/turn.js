// The turn as a reactor: ten stages on a ring, a pulse running round, the current stage described in the core.
import { t } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const N = 10, C = 300, R = 228;
const el = (tag, attrs, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent?.appendChild(e);
  return e;
};

export function startTurn(root, reduced) {
  const svg = root.querySelector('svg.ring');
  const defs = el('defs', {}, svg);
  defs.innerHTML = `
    <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#33e6ff"/><stop offset=".55" stop-color="#8d6bff"/><stop offset="1" stop-color="#ffc65c"/></linearGradient>
    <radialGradient id="coreg"><stop offset="0" stop-color="rgba(255,198,92,.22)"/><stop offset=".6" stop-color="rgba(141,107,255,.08)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
    <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  el('circle', { cx: C, cy: C, r: 200, fill: 'url(#coreg)' }, svg);
  // rotating rings of ticks
  const spin = (r, dash, dur, op, rev) => {
    const g = el('g', {}, svg);
    el('circle', { cx: C, cy: C, r, fill: 'none', stroke: 'url(#ringg)', 'stroke-width': 1.2, 'stroke-dasharray': dash, opacity: op }, g);
    if (!reduced) g.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${rev ? -360 : 360}deg)` }], { duration: dur, iterations: Infinity });
    g.style.transformOrigin = `${C}px ${C}px`;
  };
  spin(272, '2 10', 90000, 0.5);
  spin(258, '60 14 4 14', 60000, 0.35, true);
  spin(176, '1 6', 120000, 0.45);
  spin(160, '120 40', 40000, 0.2, true);
  el('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: 'rgba(120,160,255,.18)', 'stroke-width': 2 }, svg);
  const progress = el('circle', { cx: C, cy: C, r: R, fill: 'none', stroke: 'url(#ringg)', 'stroke-width': 3, 'stroke-linecap': 'round', filter: 'url(#glow)',
    'stroke-dasharray': `0 ${2 * Math.PI * R}`, transform: `rotate(-90 ${C} ${C})` }, svg);
  const comet = el('circle', { r: 7, fill: '#fff', filter: 'url(#glow)' }, svg);

  const nodes = [];
  for (let i = 0; i < N; i++) {
    const a = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const x = C + Math.cos(a) * R, y = C + Math.sin(a) * R;
    const g = el('g', { class: 'node', tabindex: 0 }, svg);
    el('line', { x1: C + Math.cos(a) * 182, y1: C + Math.sin(a) * 182, x2: C + Math.cos(a) * (R - 14), y2: C + Math.sin(a) * (R - 14), stroke: 'rgba(51,230,255,.18)' }, g);
    el('circle', { class: 'dot', cx: x, cy: y, r: 11 }, g);
    const num = el('text', { x, y: y + 4, 'text-anchor': 'middle', style: 'font: 700 10px var(--mono); fill: #04050d; pointer-events:none' }, g);
    num.textContent = String(i + 1).padStart(2, '0');
    const lx = C + Math.cos(a) * (R + 34), ly = C + Math.sin(a) * (R + 34) + 4;
    const label = el('text', { x: lx, y: ly, 'text-anchor': Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end' }, g);
    g.addEventListener('pointerenter', () => { hold = true; go(i); });
    g.addEventListener('pointerleave', () => { hold = false; });
    g.addEventListener('click', () => go(i));
    g.addEventListener('focus', () => go(i));
    nodes.push({ g, label, num });
  }
  const numEl = root.querySelector('#core-num'), tEl = root.querySelector('#core-t'), dEl = root.querySelector('#core-d');
  const labels = () => nodes.forEach((n, i) => { n.label.textContent = t(`step.${i}.t`); });
  labels();
  document.addEventListener('langchange', () => { labels(); go(cur, true); });

  let cur = 0, hold = false;
  const L = 2 * Math.PI * R;
  function go(i, quiet) {
    cur = i;
    nodes.forEach((n, j) => { n.g.classList.toggle('on', j === i); n.g.classList.toggle('done', j < i); n.num.style.fill = j === i ? '#04050d' : j < i ? '#04050d' : '#8a94b8'; });
    numEl.textContent = String(i + 1).padStart(2, '0');
    tEl.textContent = t(`step.${i}.t`); dEl.textContent = t(`step.${i}.d`);
    if (!quiet && !reduced) [numEl, tEl, dEl].forEach((e, k) => e.animate([{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 450, delay: k * 60, fill: 'backwards' }));
  }
  go(0, true);

  // the pulse runs round; each stage lights as it passes
  let running = true, raf = 0, phase = 0, last = performance.now();
  const STEP = 2600;
  const frame = (now) => {
    raf = running ? requestAnimationFrame(frame) : 0;
    const dt = now - last; last = now;
    if (!hold && !reduced) phase = (phase + dt / STEP) % N;
    if (hold) phase = cur + 0.5;
    const i = Math.floor(phase);
    if (i !== cur && !hold) go(i);
    const k = phase / N;
    progress.setAttribute('stroke-dasharray', `${k * L} ${L}`);
    const a = -Math.PI / 2 + k * Math.PI * 2;
    comet.setAttribute('cx', C + Math.cos(a) * R); comet.setAttribute('cy', C + Math.sin(a) * R);
  };
  raf = requestAnimationFrame(frame);
  return {
    pause() { running = false; cancelAnimationFrame(raf); },
    resume() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
  };
}
