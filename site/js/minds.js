// Mind cards: real profiles from the demo chronicle, taken from the engine's own 常态 view of the pack — how much
// each person thinks before acting and how sharply, and their nature.
import { t } from './i18n.js';

const DELIB = { rarely: 1, situational: 2, habitual: 3 };
const SHARP = { plain: 1, sharp: 2, exceptional: 3 };
const HUES = ['rgba(51,230,255,.28)', 'rgba(255,198,92,.28)', 'rgba(255,79,163,.26)', 'rgba(141,107,255,.3)'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clip = (s, n) => { const a = [...String(s ?? '').trim()]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : a.join(''); };

let observer = null;
/** `nature` is the engine's natureView: { people: [{ name, mind, versions: [{ habits, perceives, state }] }] }. */
export function renderMinds(deck, nature, label) {
  const score = (p) => DELIB[p.mind.deliberation] + SHARP[p.mind.sharpness] + (perc(p).length ? 1.5 : 0);
  const ver = (p) => p.versions.find((v) => v.state === 'now') || p.versions[0];
  const perc = (p) => ver(p)?.perceives?.kinds || [];
  // the most interesting first: the deep thinkers and the people who perceive what others cannot
  const pick = nature.people.filter((p) => p.mind && p.versions.length).sort((a, b) => score(b) - score(a)).slice(0, 14);
  deck.innerHTML = pick.map((p, i) => {
    const m = p.mind, v = ver(p);
    return `
    <article class="mind" style="--mc:${HUES[i % HUES.length]}">
      <h4>${esc(p.name)}</h4>
      <div class="gauge"><span>${t('minds.deliberation')}</span><div class="bar"><i data-w="${(DELIB[m.deliberation] || 1) / 3}"></i></div><b>${esc(label('mindDelib_' + m.deliberation))}</b></div>
      <div class="gauge"><span>${t('minds.sharpness')}</span><div class="bar"><i data-w="${(SHARP[m.sharpness] || 1) / 3}"></i></div><b>${esc(label('mindSharp_' + m.sharpness))}</b></div>
      <dl>
        <dt>${t('minds.approach')}</dt><dd>${esc(clip(m.approach, 150))}</dd>
        ${m.speaks ? `<dt>${t('minds.speaks')}</dt><dd>${esc(clip(m.speaks, 110))}</dd>` : ''}
        ${m.notices ? `<dt>${t('minds.notices')}</dt><dd>${esc(clip(m.notices, 100))}</dd>` : ''}
        ${perc(p).length ? `<dt>${t('minds.perceives')}</dt><dd class="perc">${perc(p).map((k) => `<span>${esc(label('perceive_' + k))}</span>`).join('')}</dd>` : ''}
        <dt>${t('minds.habits')}</dt><dd>${esc(clip(v.habits, 140))}</dd>
      </dl>
    </article>`;
  }).join('');
  observer?.disconnect();
  observer = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { for (const b of e.target.querySelectorAll('.bar i')) b.style.width = b.dataset.w * 100 + '%'; observer.unobserve(e.target); }
  }, { threshold: 0.3 });
  for (const card of deck.children) {
    observer.observe(card);
    // a little tilt toward the pointer
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(800px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-6px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  }
}
