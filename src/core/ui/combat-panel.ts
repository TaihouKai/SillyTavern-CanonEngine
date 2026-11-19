// 战斗 in the timeline window: the fight now (with the player's correction), the last rulings, and each person's
// states (editable), 对抗倾向 (editable) and links; the data comes from the combat module (combat/panel.ts).
import type { CombatChange, CombatViewData as CombatView } from '../combat';
import { t } from './i18n';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** The 战斗 view; query: the search box (filters people by name; empty: the people that matter now). */
export function combatHtml(v: CombatView | null, query: string): string {
  if (!v) return `<div class="cg-empty">${t('graphNoData')}</div>`;
  if (v.none !== null) return `<div class="cg-memberswrap"><div class="cg-empty">${esc(t('combatNone').replace('{r}', v.none))}</div></div>`;
  const q = query.trim().toLowerCase();
  const src = (s: string) => `<span class="cg-hint">${esc(t('combatSrc_' + s))}</span>`;
  const fight = v.fight.ongoing
    ? `<div class="cg-cbfight cg-cbon"><b>${esc(t('combatFightOn').replace('{p}', v.fight.people.map((p) => p.name).join('、')).replace('{t}', v.fight.since || ''))}</b> <button class="menu_button" data-act="cb-fight-off" title="${esc(t('combatEndTip'))}">${t('combatEnd')}</button></div>`
    : `<div class="cg-cbfight"><span>${t('combatFightOff')}</span> <button class="menu_button" data-act="cb-fight-on" title="${esc(t('combatStartTip'))}">${t('combatStart')}</button></div>`;
  const ruling = (r: CombatView['rulings'][number], i: number) => `<details class="cg-nperson"${i === 0 ? ' open' : ''}><summary>${esc(r.when)}${r.over ? ` <span class="cg-key">${esc(t('combatOver'))}${esc(r.overWhy)}</span>` : ''}</summary>`
    + (r.joined?.length ? `<div class="cg-nfield"><b>${t('combatJoined')}</b>${esc(r.joined.join('、'))}</div>` : '')
    + (r.stopped.length ? r.stopped.map((o) => `<div class="cg-nfield">${esc(t('combatOverrides'))}«${esc(o.quote)}»：${esc(o.why)}<div class="cg-hint">${esc(o.basis.join('；'))}</div></div>`).join('') : '')
    + `<ol class="cg-cbex">${r.exchanges.map((x) => `<li><b>${esc(x.who)}</b>：${esc(x.text)}<div class="cg-hint">${x.unsupported ? esc(t('combatUnsupported')) : esc(x.basis.join('；'))}</div></li>`).join('')}</ol>`
    + (r.states.length ? `<div class="cg-nfield"><b>${t('combatStates')}</b>${esc(r.states.join('；'))}</div>` : '')
    + (r.stands.length ? `<div class="cg-nfield">${esc(t('combatStands'))}${r.stands.map((s) => `«${esc(s)}»`).join(' ')}</div>` : '')
    + (!r.over && r.stopAt ? `<div class="cg-hint">${esc(t('combatStop'))}${esc(r.stopAt)}</div>` : '')
    + (r.filled.length ? `<div class="cg-hint">${esc(t('combatFilled'))}${esc(r.filled.join('；'))}</div>` : '')
    + (r.notes.length ? `<div class="cg-hint">${esc(t('combatNotes'))}${esc(r.notes.join('；'))}</div>` : '')
    + '</details>';
  const rulings = v.rulings.length ? v.rulings.map(ruling).join('') : `<div class="cg-empty">${t('combatNoRulings')}</div>`;
  const people = v.people.filter((p) => (q ? p.name.toLowerCase().includes(q) : p.relevant));
  const keys = ['start', 'force', 'response', 'limit', 'stop'] as const;
  const person = (p: CombatView['people'][number]) => {
    const states = p.states.length
      ? `<table class="canon-table cg-members">${p.states.map((s) => `<tr><td>${esc(s.text)}${s.count !== null ? ` ×${s.count}` : ''}</td><td>${s.until ? esc(t('combatUntil').replace('{t}', s.until)) : ''}</td><td>${src(s.source)}</td><td><button class="menu_button" data-act="cb-state-del" data-entity="${esc(p.id)}" data-text="${esc(s.text)}">✕</button></td></tr>`).join('')}</table>`
      : `<div class="cg-hint">${t('combatNoStates')}</div>`;
    const add = `<div class="cg-cbadd"><input class="text_pole cb-st-text" placeholder="${esc(t('combatStateText'))}"><input class="text_pole cb-st-count" type="number" min="0" placeholder="${esc(t('combatCount'))}"><input class="text_pole cb-st-min" type="number" min="1" placeholder="${esc(t('combatMinutes'))}"><button class="menu_button" data-act="cb-state-add" data-entity="${esc(p.id)}">${t('combatAddState')}</button></div>`;
    const style = `<div class="cg-cbstyle">${keys.map((k) => `<label><b>${t('style_' + k)}</b><textarea class="text_pole cb-sty-${k}" rows="1">${esc(p.style?.[k] || '')}</textarea></label>`).join('')}<div>${p.style ? src(p.style.source) : `<span class="cg-hint">${t('combatNoStyle')}</span>`} <button class="menu_button" data-act="cb-style-save" data-entity="${esc(p.id)}">${t('combatStyleSave')}</button></div></div>`;
    const links = p.links.length ? `<div class="cg-nfield"><b>${t('combatLinks')}</b>${p.links.map((l) => `${esc(l.label)} ${esc(l.name)} ${src(l.source)}`).join('；')}</div>` : '';
    const pick = !v.fight.ongoing ? `<input type="checkbox" class="cb-pick" data-entity="${esc(p.id)}" title="${esc(t('combatPick'))}"> ` : '';
    return `<details class="cg-nperson cg-cbperson" data-entity="${esc(p.id)}"${p.fighting || p.player ? ' open' : ''}><summary>${pick}${esc(p.name)}${p.player ? ` <span class="cg-hint">${t('naturePlayer')}</span>` : ''}${p.fighting ? ` <span class="cg-key cg-nstate-now">${t('combatFighting')}</span>` : ''}${p.states.length ? ` <span class="cg-hint">${esc(p.states.map((s) => s.text).join('、'))}</span>` : ''}</summary><h4>${t('combatStates')}</h4>${states}${add}<h4>${t('combatStyle')}</h4>${style}${links}</details>`;
  };
  return `<div class="cg-memberswrap cg-naturewrap"><div class="cg-hint"><b>${t('combatBasis')}</b>：${esc(v.basis)}</div>${fight}<h4>${t('combatRulings')}</h4>${rulings}<h4>${t('combatStates')} · ${t('combatStyle')}</h4><div class="cg-hint">${t(q ? 'combatPeopleFound' : 'combatPeopleNote').replace('{n}', String(people.length)).replace('{all}', String(v.people.length))}</div>${people.map(person).join('')}${v.hidden ? `<div class="cg-hint">${t('combatHidden').replace('{n}', String(v.hidden))}</div>` : ''}</div>`;
}

/** The change a 战斗 view button makes (the engine keeps it as the player's own record); null: nothing to change. */
export function combatChange(b: HTMLElement, root: HTMLElement): CombatChange | null {
  const act = b.dataset.act!, entity = b.dataset.entity || '';
  const box = b.closest('.cg-cbperson') as HTMLElement | null;
  const val = (sel: string) => ((box?.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '').trim();
  let change: CombatChange | null = null;
  if (act === 'cb-fight-off') change = { fight: { ongoing: false } };
  else if (act === 'cb-fight-on') change = { fight: { ongoing: true, participants: [...root.querySelectorAll('.cb-pick:checked')].map((x) => (x as HTMLElement).dataset.entity!) } };
  else if (act === 'cb-state-del') change = { status: { entity, text: b.dataset.text || '', removed: true } };
  else if (act === 'cb-state-add' && val('.cb-st-text')) change = { status: { entity, text: val('.cb-st-text'), count: val('.cb-st-count') ? Number(val('.cb-st-count')) : null, minutes: val('.cb-st-min') ? Number(val('.cb-st-min')) : null } };
  else if (act === 'cb-style-save') change = { style: { entity, style: { start: val('.cb-sty-start'), force: val('.cb-sty-force'), response: val('.cb-sty-response'), limit: val('.cb-sty-limit'), stop: val('.cb-sty-stop') } } };
  return change;
}
