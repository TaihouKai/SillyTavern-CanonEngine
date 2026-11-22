// 称呼 in the inspector (世界 → 称呼): whom the words of the story mean as the engine reads them — a description such as
// 「金发混混」 or another name, which step found it and where — and the words the player said are not someone. The player
// can make words mean someone from now on, say words are not someone, or take back what they said here. The data comes
// from the engine (views.namesView).
import type { NamesViewData } from '../runtime/views';
import { t } from './i18n';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const chip = (s: string, tone = '') => `<span class="ci-chip${tone ? ` ci-${tone}` : ''}">${esc(s)}</span>`;
const btn = (label: string, attrs: string, tone = '') => `<button class="menu_button ci-btn${tone ? ` ci-btn-${tone}` : ''}" ${attrs}>${esc(label)}</button>`;

export type NamesChange = { add: { words: string; who: string } } | { deny: { words: string; id: string } } | { undo: string };

/** The page's two lists (inner HTML each) and the form to add words. */
export function namesHtml(v: NamesViewData | null): { now: string; denied: string; add: string } {
  if (!v) return { now: `<div class="ci-empty">${esc(t('ciNone'))}</div>`, denied: '', add: '' };
  const a = (x: { words: string; id: string }) => `data-words="${esc(x.words)}" data-id="${esc(x.id)}"`;
  const now = v.now.map((n) => `<div class="ci-item" data-key="nm-${esc(n.words)}"><div class="ci-head"><span class="ci-title">「${esc(n.words)}」 → ${esc(n.name)}</span>`
    + `${chip(t(`nmSrc_${n.source}`), n.source === 'ui' ? 'accent' : '')}<span class="ci-sp"></span><span class="ci-actions">`
    + (n.source === 'ui' ? btn(t('nmUndo'), `data-act="nm-undo" data-rec="${esc(n.recordId)}"`) : btn(t('nmKeep'), `data-act="nm-keep" ${a(n)}`))
    + btn(t('nmDeny'), `data-act="nm-deny" ${a(n)}`, 'danger') + '</span></div>'
    + `<div class="ci-body">${n.why ? `<div>${esc(n.why)}</div>` : ''}${n.quote ? `<div class="ci-quote">“${esc(n.quote)}”</div>` : ''}`
    + `<div class="ci-meta">${esc(t('nmSince').replace('{t}', n.since))}${n.until ? ` · ${esc(t('nmUntil').replace('{t}', n.until))}` : ` · ${esc(t('nmLasting'))}`}</div></div></div>`).join('');
  const denied = v.denied.map((n) => `<div class="ci-item" data-key="nmx-${esc(n.words)}-${esc(n.id)}"><div class="ci-head"><span class="ci-title">「${esc(n.words)}」 ≠ ${esc(n.name)}</span>`
    + `<span class="ci-meta">${esc(t('nmSince').replace('{t}', n.since))}</span><span class="ci-sp"></span><span class="ci-actions">${btn(t('nmUndo'), `data-act="nm-undo" data-rec="${esc(n.recordId)}"`)}</span></div></div>`).join('');
  const add = `<details class="ci-fold ci-add" data-key="nm-add"><summary>${esc(t('nmAdd'))}</summary><div class="ci-fold-in">`
    + `<input class="text_pole ci-nm-words" placeholder="${esc(t('nmAddWords'))}"><input class="text_pole ci-nm-who" list="ci-nm-people" placeholder="${esc(t('nmAddWho'))}">`
    + `<datalist id="ci-nm-people">${v.people.map((p) => `<option value="${esc(p)}">`).join('')}</datalist>`
    + `<div class="ci-actions">${btn(t('wsSave'), 'data-act="nm-add"', 'primary')}</div></div></details>`;
  return { now: now || `<div class="ci-empty">${esc(t('nmNone'))}</div>`, denied, add };
}

/** The change a button of the page asks for (null: not one of ours, or not filled in). */
export function namesChange(b: HTMLElement): NamesChange | null {
  const act = b.dataset.act;
  if (act === 'nm-undo') return b.dataset.rec ? { undo: b.dataset.rec } : null;
  if (act === 'nm-keep') return b.dataset.words && b.dataset.id ? { add: { words: b.dataset.words, who: b.dataset.id } } : null;
  if (act === 'nm-deny') return b.dataset.words && b.dataset.id ? { deny: { words: b.dataset.words, id: b.dataset.id } } : null;
  if (act === 'nm-add') {
    const box = b.closest('.ci-fold-in');
    const words = (box?.querySelector('.ci-nm-words') as HTMLInputElement | null)?.value.trim() || '';
    const who = (box?.querySelector('.ci-nm-who') as HTMLInputElement | null)?.value.trim() || '';
    return words && who ? { add: { words, who } } : null;
  }
  return null;
}
