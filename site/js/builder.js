// The pack builder: its steps light up in turn while a build log types itself out.
import { t } from './i18n.js';

const STEPS = 11;
const MODEL = new Set([1, 4, 7, 8, 9]);   // the steps where a model writes; code does the rest

export function startBuilder(root, stats, reduced) {
  const pipe = root.querySelector('#pipe'), term = root.querySelector('#term');
  let lit = 0;
  const draw = () => {
    pipe.innerHTML = Array.from({ length: STEPS }, (_, i) => `<span class="p${MODEL.has(i) ? ' model' : ''}">${t('b.' + i)}</span>${i < STEPS - 1 ? '<span class="arrow">→</span>' : ''}`).join('');
    pipe.querySelectorAll('.p').forEach((p, i) => p.classList.toggle('lit', i < lit));
  };
  draw();
  document.addEventListener('langchange', draw);
  const n = (x) => x.toLocaleString('en-US');
  const log = (m) => [
    ['$ ', 'k', 'python -m cpb run -p toaru --offpeak'],
    ['  sources     ', '', `${m.arcs} arcs · wiki pages and their infoboxes`, 0],
    ['  summaries   ', '', `${n(m.events)} events · cause, motives, course, result, impact`, 1],
    ['  merge       ', '', 'the same event told twice → one', 2],
    ['  arcs        ', '', `dated, interleaved · ${n(m.hard)} HARD anchors`, 3],
    ['  entities    ', '', `${n(m.people)} people · ${n(m.orgs)} organizations · ${n(m.entities)} in all`, 4],
    ['  start       ', '', 'who belongs where on day 0', 5],
    ['  deaths      ', '', 'died · returned · survived · another takes the name', 6],
    ['  lasting     ', '', 'states that last vs. moments that pass', 7],
    ['  nature      ', '', `${n(m.natures)} natures · what each one perceives`, 8],
    ['  minds       ', '', `${n(m.minds)} ways of thinking`, 9],
    ['  checks      ', m.errors || m.warnings ? 'y' : 'ok', `lint: ${m.errors} errors, ${m.warnings} warnings`, 10],
    ['✓ ', 'ok', 'toaru-index.canon.json'],
  ];
  let started = false, timer = 0;
  const run = () => {
    if (started) return;
    // the numbers are the example pack's, as the engine loaded it: wait for it
    const m = stats();
    if (!m) { timer = setTimeout(run, 300); return; }
    started = true;
    const LOG = log(m);
    let i = 0;
    const lines = [];
    const next = () => {
      if (i >= LOG.length) { term.innerHTML = lines.join('\n') + '\n<span class="cursor"></span>'; return; }
      const [pre, cls, text, step] = LOG[i++];
      let k = 0;
      const type = () => {
        k = reduced ? text.length : Math.min(text.length, k + 2);
        const cur = `<span class="${pre.trim() === '$' ? 'y' : 'm'}">${pre}</span><span class="${cls}">${text.slice(0, k)}</span>`;
        term.innerHTML = [...lines, cur].join('\n') + '<span class="cursor"></span>';
        if (k < text.length) { timer = setTimeout(type, 16); return; }
        lines.push(cur);
        if (step != null) { lit = step + 1; pipe.querySelectorAll('.p')[step]?.classList.add('lit'); }
        timer = setTimeout(next, reduced ? 0 : 260);
      };
      type();
    };
    next();
  };
  const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { run(); obs.disconnect(); } }, { threshold: 0.35 });
  obs.observe(term);
  return { pause() {}, resume() {} };
}
