// 主动敌对 in the inspector's 「世界如何接触你」 page: the danger switch and level, who holds a grudge against the player
// (why, since when, when they come; take one away, add one), the dangers where the player is and the dangers that
// came. The data comes from the hostility module (hostility/panel.ts).
import type { HostilityChange, HostilityViewData } from '../hostility';
import { t } from './i18n';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const chip = (s: string, tone = '') => `<span class="ci-chip${tone ? ` ci-${tone}` : ''}">${esc(s)}</span>`;
const btn = (label: string, attrs: string, tone = '') => `<button class="menu_button ci-btn${tone ? ` ci-btn-${tone}` : ''}" ${attrs}>${esc(label)}</button>`;

/** The switch and level (a bar) and the section's inner HTML. */
export function hostilityHtml(v: HostilityViewData | null, s: { dangers: boolean; level: string }, tip: (k: string) => string): { bar: string; body: string } {
  const bar = `<label class="checkbox_label ci-check ci-switch"><input type="checkbox" data-act="ho-dangers" ${s.dangers ? 'checked' : ''}><span>${esc(t('hoDangers'))}</span></label>${tip('hoDangersTip')}`
    + `<label class="ci-lbl ci-inline">${esc(t('hoLevel'))} <select class="text_pole ci-ho-level" data-act="ho-level">${['low', 'medium', 'high'].map((l) => `<option value="${l}" ${s.level === l ? 'selected' : ''}>${esc(t('hoLevel_' + l))}</option>`).join('')}</select></label>`;
  if (!v) return { bar, body: `<div class="ci-empty">${esc(t('ciNone'))}</div>` };
  const grudges = v.grudges.map((g) => `<div class="ci-item" data-key="ho-${esc(g.holder)}"><div class="ci-head"><span class="ci-title">${esc(g.name)}</span>${g.due ? chip(t('hoDue'), 'bad') : chip(t('hoComes').replace('{t}', g.comes), 'warn')}${g.source === 'ui' ? chip(t('hoByYou'), 'muted') : ''}<span class="ci-sp"></span><span class="ci-actions">${btn(t('hoEnd'), `data-act="ho-end" data-who="${esc(g.holder)}" title="${esc(t('hoEndTip'))}"`)}</span></div>`
    + `<div class="ci-body"><div>${esc(g.why)}</div>${g.quote ? `<div class="ci-quote">“${esc(g.quote)}”</div>` : ''}<div class="ci-meta">${esc(t('hoSince').replace('{t}', g.since))}</div></div></div>`).join('');
  const add = `<details class="ci-fold ci-add" data-key="ho-add"><summary>${esc(t('hoAdd'))}</summary><div class="ci-fold-in"><input class="text_pole ci-ho-name" placeholder="${esc(t('hoAddName'))}"><input class="text_pole ci-ho-why" placeholder="${esc(t('hoAddWhy'))}"><div class="ci-actions">${btn(t('wsSave'), 'data-act="ho-add"', 'primary')}</div></div></details>`;
  const here = v.here.map((d) => `<div class="ci-item" data-key="hd-${esc(d.node)}"><div class="ci-head"><span class="ci-title">${esc(d.name)}</span>${chip(t('hoFreq_' + d.frequency))}${d.hours ? chip(d.hours, 'muted') : ''}${d.now ? chip(t('hoNow'), 'accent') : ''}</div><div class="ci-body"><div>${esc(d.gist)}</div><div class="ci-meta">${esc(d.from)}</div></div></div>`).join('');
  const came = v.came.map((d) => `<div class="ci-meta">${esc(d.when)} · ${esc(d.name)}${d.place ? ` · ${esc(d.place)}` : ''}</div>`).join('');
  const body = `<h5 class="ci-sub">${esc(t('hoGrudges'))}</h5>${grudges || `<div class="ci-empty">${esc(t('hoNoGrudges'))}</div>`}${add}`
    + `<h5 class="ci-sub">${esc(t('hoHere'))}</h5>${here || `<div class="ci-empty">${esc(t('hoNoDangers'))}</div>`}`
    + (came ? `<h5 class="ci-sub">${esc(t('hoCame'))}</h5>${came}` : '');
  return { bar, body };
}

/** The change a button in the section asks for (null: not one of ours, or not filled in). */
export function hostilityChange(b: HTMLElement): HostilityChange | null {
  const act = b.dataset.act;
  if (act === 'ho-end') return b.dataset.who ? { end: b.dataset.who } : null;
  if (act === 'ho-add') {
    const box = b.closest('.ci-fold-in');
    const name = (box?.querySelector('.ci-ho-name') as HTMLInputElement | null)?.value.trim() || '';
    const why = (box?.querySelector('.ci-ho-why') as HTMLInputElement | null)?.value.trim() || '';
    return name && why ? { add: { name, why } } : null;
  }
  return null;
}
