// The page: language, navigation, scroll reveals, counters, the nixie meter, and each section's scene.
import { apply, detectLang, lang, saveLang, t } from './i18n.js';
import { startAnchors } from './anchors.js';
import { startTurn } from './turn.js';
import { startOrbit } from './orbit.js';
import { renderMinds } from './minds.js';
import { startBuilder } from './builder.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// the live demo is the engine's own code (js/engine-demo.js, built by scripts/build-site.mjs); everything the page
// says about the example pack comes from the pack as the engine loads it
let demo = null;
const vars = { events: '…', arcs: '…' };

// language
const setLang = (l) => {
  demo?.setLang(l);
  apply(l, vars);
  for (const s of document.querySelectorAll('#lang span')) s.classList.toggle('on', s.dataset.l === l);
};
setLang(detectLang());
document.getElementById('lang').addEventListener('click', () => { const l = lang() === 'zh' ? 'en' : 'zh'; saveLang(l); setLang(l); });

// navigation: solid once scrolled, the current section lit
const nav = document.querySelector('.nav');
addEventListener('scroll', () => nav.classList.toggle('solid', scrollY > 40), { passive: true });
const links = [...document.querySelectorAll('.links a')];
const secObs = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) for (const a of links) a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
}, { rootMargin: '-45% 0px -50% 0px' });
for (const a of links) { const s = document.querySelector(a.getAttribute('href')); if (s) secObs.observe(s); }

// reveal on scroll
const revObs = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); revObs.unobserve(e.target); }
}, { rootMargin: '0px 0px -8% 0px' });
for (const el of document.querySelectorAll('.reveal')) revObs.observe(el);

// the glow that follows the cursor
const glow = document.querySelector('.cursor-glow');
addEventListener('pointermove', (e) => { glow.style.setProperty('--mx', e.clientX + 'px'); glow.style.setProperty('--my', e.clientY + 'px'); }, { passive: true });

// counters
const countUp = (el, to) => {
  if (!Number.isFinite(to)) return;
  const t0 = performance.now(), dur = reduced ? 0 : 1800;
  const step = (now) => {
    // a frame's time can be a little earlier than t0
    const k = dur ? Math.min(1, Math.max(0, (now - t0) / dur)) : 1;
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 4))).toLocaleString('en-US');
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

// the nixie meter: digits scramble and settle on a new reading, now and then
const tubes = document.querySelector('#meter .tubes');
const CELLS = 8;
const CATHODES = '<span class="cath">' + [...'0123456789'].map((n) => `<span>${n}</span>`).join('') + '</span>';
for (let i = 0; i < CELLS; i++) {
  const d = document.createElement('div');
  d.className = 'cell' + (i === 1 ? ' dot' : '');
  d.innerHTML = i === 1 ? '<i></i>' : `<div class="tube"><span class="mesh"></span>${CATHODES}<b>0</b><span class="glass"></span></div><div class="socket"></div>`;
  tubes.appendChild(d);
}
const digits = [...tubes.querySelectorAll('.tube b')];

// the title leans toward the pointer
const title = document.getElementById('title');
if (!reduced) addEventListener('pointermove', (e) => {
  title.style.setProperty('--ry', ((e.clientX / innerWidth - 0.5) * 14).toFixed(2) + 'deg');
  title.style.setProperty('--rx', ((0.5 - e.clientY / innerHeight) * 10).toFixed(2) + 'deg');
}, { passive: true });
const reading = () => [Math.random() < 0.6 ? 0 : 1, ...Array.from({ length: CELLS - 2 }, () => Math.floor(Math.random() * 10))];
const settle = () => {
  const target = reading();
  digits.forEach((b, i) => {
    let n = reduced ? 0 : 10 + i * 4;
    const roll = () => {
      if (n-- > 0) { b.textContent = Math.floor(Math.random() * 10); b.style.opacity = 0.55 + Math.random() * 0.45; setTimeout(roll, 45); }
      else { b.textContent = target[i]; b.style.opacity = 1; }
    };
    roll();
  });
};
settle();
setInterval(() => { if (!document.hidden) settle(); }, 9000);
document.getElementById('meter').addEventListener('pointerenter', settle);

// the sections run only while they are on screen
const lazy = (sel, start) => {
  const el = document.querySelector(sel);
  if (!el) return;
  let ctl = null;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { if (!ctl) ctl = start(el) || { resume() {}, pause() {} }; else ctl.resume?.(); }
    else ctl?.pause?.();
  }, { rootMargin: '200px 0px' }).observe(el);
};
import('./hero.js').then((m) => lazy('.hero', (el) => m.startHero(el.querySelector('#hero-gl'), reduced))).catch((e) => console.warn('hero', e));
lazy('.worldlines', (el) => startAnchors(el.querySelector('canvas'), reduced));
lazy('.reactor', (el) => startTurn(el, reduced));
lazy('.orbit', (el) => startOrbit(el.querySelector('canvas'), reduced));
// the example pack's numbers (site/data/stats.json, computed by the engine at build time): at once
let stats = null;
fetch('data/stats.json').then((r) => r.json()).then((s) => {
  stats = s;
  vars.events = s.events.toLocaleString('en-US'); vars.arcs = s.arcs;
  apply(lang(), vars);
  for (const el of document.querySelectorAll('[data-count]')) countUp(el, s[el.dataset.count]);
}).catch((e) => console.warn('stats', e));
lazy('#builder', (el) => startBuilder(el, () => stats || demo?.stats, reduced));

// the engine and the example pack (7 MB): loaded when the visitor nears the minds or the chronicle
let demoStarted = false;
const startDemo = () => {
  if (demoStarted) return;
  demoStarted = true;
  import('./engine-demo.js')
    .then((m) => m.startDemo('data/toaru-index.canon.json', document.getElementById('engine-demo'), document.getElementById('demo-controls'), lang()))
    .then((d) => {
      demo = d;
      document.querySelector('.demo-loading')?.remove();
      if (!stats) { vars.events = d.stats.events.toLocaleString('en-US'); vars.arcs = d.stats.arcs; apply(lang(), vars); for (const el of document.querySelectorAll('[data-count]')) countUp(el, d.stats[el.dataset.count]); }
      renderMinds(document.getElementById('mind-deck'), d.nature, d.label);
      document.addEventListener('langchange', () => renderMinds(document.getElementById('mind-deck'), d.nature, d.label));
    })
    .catch((e) => {
      console.error('demo', e);
      const el = document.querySelector('.demo-loading');
      if (el) el.textContent = t('chron.failed');
    });
};
const demoObs = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { demoObs.disconnect(); startDemo(); } }, { rootMargin: '1200px 0px' });
for (const id of ['minds', 'chronicle']) demoObs.observe(document.getElementById(id));
