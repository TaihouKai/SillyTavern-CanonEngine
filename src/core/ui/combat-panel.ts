// 战斗 as a page of the inspector: the fight now (with the player's correction), the last rulings, and each person's
// states (editable), 对抗倾向 (editable) and links; the data comes from the combat module (combat/panel.ts).
import type { CombatChange, CombatViewData as CombatView } from '../combat';
import { t } from './i18n';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const chip = (s: string, tone = '') => `<span class="ci-chip${tone ? ` ci-${tone}` : ''}">${esc(s)}</span>`;
const btn = (label: string, attrs: string, tone = '') => `<button class="menu_button ci-btn${tone ? ` ci-btn-${tone}` : ''}" ${attrs}>${esc(label)}</button>`;
const fold = (key: string, label: string, inner: string, cls = '') => `<details class="ci-fold${cls ? ` ${cls}` : ''}" data-key="${esc(key)}"><summary>${esc(label)}</summary><div class="ci-fold-in">${inner}</div></details>`;
const sec = (id: string, label: string, inner: string, tipHtml = '', cls = '') => `<section class="ci-sec${cls ? ` ${cls}` : ''}" data-sec="${id}"><h4 class="ci-sec-h"><span>${esc(label)}</span>${tipHtml}<span class="ci-sp"></span></h4>${inner}</section>`;
const empty = (s: string) => `<div class="ci-empty">${esc(s)}</div>`;

/** The 战斗 page. query: the page's filter box (people by name; empty: the people that matter now); picked: the people
 *  ticked for a fight the player starts (kept across rebuilds). */
export function combatHtml(v: CombatView | null, query: string, picked: ReadonlySet<string>, tip: (k: string) => string): { html: string; secs: { id: string; label: string }[] } {
  if (!v) return { html: empty(t('graphNoData')), secs: [] };
  if (v.none !== null) return { html: empty(t('combatNone').replace('{r}', v.none)), secs: [] };
  const q = query.trim().toLowerCase();
  const src = (s: string) => chip(t('combatSrc_' + s), s === 'ui' ? 'accent' : 'muted');
  const fight = v.fight.ongoing
    ? `<div class="ci-banner ci-bad"><b>${esc(t('combatFightOn').replace('{p}', v.fight.people.map((p) => p.name).join('、')).replace('{t}', v.fight.since || ''))}</b><div class="ci-actions">${btn(t('combatEnd'), `data-act="cb-fight-off" title="${esc(t('combatEndTip'))}"`)}</div></div>`
    : `<div class="ci-bar"><span>${esc(t('combatFightOff'))}</span><span class="ci-sp"></span>${btn(t('combatStart'), `data-act="cb-fight-on" title="${esc(t('combatStartTip'))}"`)}</div>`;
  const ruling = (r: CombatView['rulings'][number], i: number) => {
    const head = `<span class="ci-title ci-when">${esc(r.when)}</span>${r.over ? chip(t('combatOver') + r.overWhy, 'muted') : chip(t('combatGoesOn'), 'warn')}${r.joined?.length ? chip(`${t('combatJoined')}：${r.joined.join('、')}`, 'accent') : ''}`;
    const inner = (r.stopped.length ? r.stopped.map((o) => `<div class="ci-banner ci-warn">${esc(t('combatOverrides'))}«${esc(o.quote)}»：${esc(o.why)}<div class="ci-meta">${esc(o.basis.join('；'))}</div></div>`).join('') : '')
      + `<ol class="ci-cbex">${r.exchanges.map((x) => `<li><b>${esc(x.who)}</b>：${esc(x.text)}<div class="ci-meta">${x.unsupported ? esc(t('combatUnsupported')) : esc(x.basis.join('；'))}</div></li>`).join('')}</ol>`
      + (r.states.length ? `<div><b>${esc(t('combatStates'))}：</b>${esc(r.states.join('；'))}</div>` : '')
      + (r.stands.length ? `<div class="ci-muted">${esc(t('combatStands'))}${r.stands.map((s) => `«${esc(s)}»`).join(' ')}</div>` : '')
      + (!r.over && r.stopAt ? `<div class="ci-muted">${esc(t('combatStop'))}${esc(r.stopAt)}</div>` : '')
      + (r.filled.length ? `<div class="ci-muted">${esc(t('combatFilled'))}${esc(r.filled.join('；'))}</div>` : '')
      + (r.notes.length ? `<div class="ci-muted">${esc(t('combatNotes'))}${esc(r.notes.join('；'))}</div>` : '');
    // the newest ruling open; the older ones folded (what the player opened stays open)
    const key = `cbr-${r.when}-${r.exchanges.length}`;
    return `<div class="ci-item" data-key="${esc(key)}"><div class="ci-head">${head}</div>${i === 0 ? `<div class="ci-body">${inner}</div>` : fold(`${key}-f`, t('combatExchanges').replace('{n}', String(r.exchanges.length)), inner)}</div>`;
  };
  const people = v.people.filter((p) => (q ? p.name.toLowerCase().includes(q) : p.relevant));
  const keys = ['start', 'force', 'response', 'limit', 'stop'] as const;
  const person = (p: CombatView['people'][number]) => {
    const states = p.states.length
      ? `<table class="ci-kv">${p.states.map((s) => `<tr><td>${esc(s.text)}${s.count !== null ? ` ×${s.count}` : ''}</td><td class="ci-meta">${s.until ? esc(t('combatUntil').replace('{t}', s.until)) : ''}</td><td class="ci-meta">${src(s.source)}</td><td class="ci-meta">${btn('✕', `data-act="cb-state-del" data-entity="${esc(p.id)}" data-text="${esc(s.text)}" title="${esc(t('combatStateDel'))}"`)}</td></tr>`).join('')}</table>`
      : `<div class="ci-muted">${esc(t('combatNoStates'))}</div>`;
    const add = fold(`cba-${p.id}`, t('combatAddStateFold'), `<input class="text_pole cb-st-text" placeholder="${esc(t('combatStateText'))}"><div class="ci-cbrow"><input class="text_pole cb-st-count" type="number" min="0" placeholder="${esc(t('combatCount'))}"><input class="text_pole cb-st-min" type="number" min="1" placeholder="${esc(t('combatMinutes'))}"></div><div class="ci-actions">${btn(t('combatAddState'), `data-act="cb-state-add" data-entity="${esc(p.id)}"`, 'primary')}</div>`);
    const style = fold(`cbs-${p.id}`, p.style ? t('combatStyle') : `${t('combatStyle')} · ${t('combatStyleNone')}`, (p.style ? '' : `<div class="ci-muted">${esc(t('combatNoStyle'))}</div>`) + keys.map((k) => `<label class="ci-lbl">${esc(t('style_' + k))}</label><textarea class="text_pole cb-sty-${k}" rows="2">${esc(p.style?.[k] || '')}</textarea>`).join('')
      + `<div class="ci-actions">${p.style ? src(p.style.source) : ''}<span class="ci-sp"></span>${btn(t('combatStyleSave'), `data-act="cb-style-save" data-entity="${esc(p.id)}"`, 'primary')}</div>`, 'ci-edit');
    const links = p.links.length ? `<div class="ci-meta"><b>${esc(t('combatLinks'))}：</b>${p.links.map((l) => `${esc(l.label)} ${esc(l.name)}${l.source !== 'pack' ? `（${esc(t('combatSrc_' + l.source))}）` : ''}`).join('；')}</div>` : '';
    const pick = !v.fight.ongoing ? `<label class="ci-check ci-cbpick" title="${esc(t('combatPickTip'))}"><input type="checkbox" class="cb-pick" data-entity="${esc(p.id)}" ${picked.has(p.id) ? 'checked' : ''}><span>${esc(t('combatPick'))}</span></label>` : '';
    const head = `<span class="ci-title">${esc(p.name)}</span>${p.player ? chip(t('naturePlayer'), 'accent') : ''}${p.fighting ? chip(t('combatFighting'), 'bad') : ''}<span class="ci-sp"></span>${pick}`;
    return `<div class="ci-item ci-cbperson" data-key="cbp-${esc(p.id)}" data-entity="${esc(p.id)}"><div class="ci-head">${head}</div><div class="ci-body">${states}${links}</div>${add}${style}</div>`;
  };
  const note = `<div class="ci-muted">${esc(t(q ? 'combatPeopleFound' : 'combatPeopleNote').replace('{n}', String(people.length)).replace('{all}', String(v.people.length)))}</div>`;
  const secs = [{ id: 'cb-now', label: t('combatNow') }, { id: 'cb-rulings', label: t('combatRulings') }, { id: 'cb-people', label: t('combatPeople') }];
  const html = sec('cb-now', t('combatNow'), `${fight}${fold('cb-basis', t('combatBasis'), `<div class="ci-muted">${esc(v.basis)}</div>`)}`, tip('combatTip'), 'ci-keep')
    + sec('cb-rulings', t('combatRulings'), v.rulings.length ? v.rulings.map(ruling).join('') : empty(t('combatNoRulings')))
    + sec('cb-people', t('combatPeople'), note + people.map(person).join('') + (v.hidden ? `<div class="ci-muted">${esc(t('combatHidden').replace('{n}', String(v.hidden)))}</div>` : ''));
  return { html, secs };
}

/** The change a 战斗 page button makes (the engine keeps it as the player's own record); null: nothing to change. */
export function combatChange(b: HTMLElement, picked: ReadonlySet<string>): CombatChange | null {
  const act = b.dataset.act!, entity = b.dataset.entity || '';
  const box = b.closest('.ci-cbperson') as HTMLElement | null;
  const val = (sel: string) => ((box?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '').trim();
  let change: CombatChange | null = null;
  if (act === 'cb-fight-off') change = { fight: { ongoing: false } };
  else if (act === 'cb-fight-on') change = { fight: { ongoing: true, participants: [...picked] } };
  else if (act === 'cb-state-del') change = { status: { entity, text: b.dataset.text || '', removed: true } };
  else if (act === 'cb-state-add' && val('.cb-st-text')) change = { status: { entity, text: val('.cb-st-text'), count: val('.cb-st-count') ? Number(val('.cb-st-count')) : null, minutes: val('.cb-st-min') ? Number(val('.cb-st-min')) : null } };
  else if (act === 'cb-style-save') change = { style: { entity, style: { start: val('.cb-sty-start'), force: val('.cb-sty-force'), response: val('.cb-sty-response'), limit: val('.cb-sty-limit'), stop: val('.cb-sty-stop') } } };
  return change;
}
