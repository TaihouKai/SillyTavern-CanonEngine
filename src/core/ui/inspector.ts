// 检查面板 (Inspector): a drawer docked at the right with a grouped navigation (玩家 / 世界 / 引擎, counts on the
// entries that need the user), one scrolling page per view with a filter and jumps to its sections, and entries as
// cards whose actions sit in their header (edit forms folded until opened). The page is rebuilt only when what it
// shows changed, and keeps its scroll, opened folds and anything being typed (live: rebuilt on every status tick,
// it jumped to the top and closed what the user had opened).
import type { CanonEngine } from '../runtime/engine';
import { t } from './i18n';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface InspectorDeps {
  engine: () => CanonEngine;
  settings: () => { inspectorOpen: boolean; quietDayJobs?: boolean };
  saveSettings: () => void;
  refreshUi: () => void;
  toast: (level: 'info' | 'error' | 'warning', msg: string) => void;
  tip: (key: string) => string;
  lastDraftPrompt: () => unknown;
}

type View = ReturnType<CanonEngine['inspector']>;
type Ni = NonNullable<NonNullable<View>['integration']>;
interface Page { html: string; secs: { id: string; label: string }[] }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const chip = (s: string, tone = '') => `<span class="ci-chip${tone ? ` ci-${tone}` : ''}">${esc(s)}</span>`;
const btn = (label: string, attrs: string, tone = '') => `<button class="menu_button ci-btn${tone ? ` ci-btn-${tone}` : ''}" ${attrs}>${esc(label)}</button>`;
const sec = (id: string, label: string, inner: string, extra = '', tipHtml = '') => `<section class="ci-sec" data-sec="${id}"><h4 class="ci-sec-h"><span>${esc(label)}</span>${tipHtml}<span class="ci-sp"></span>${extra}</h4>${inner}</section>`;
const item = (key: string, head: string, body = '', foot = '') => `<div class="ci-item" data-key="${esc(key)}"><div class="ci-head">${head}</div>${body ? `<div class="ci-body">${body}</div>` : ''}${foot}</div>`;
const fold = (key: string, label: string, inner: string, cls = '') => `<details class="ci-fold${cls ? ` ${cls}` : ''}" data-key="${esc(key)}"><summary>${esc(label)}</summary><div class="ci-fold-in">${inner}</div></details>`;
const muted = (s: string) => `<div class="ci-muted">${s}</div>`;
const empty = () => `<div class="ci-empty">${esc(t('ciNone'))}</div>`;

export function createInspector(d: InspectorDeps) {
  let el: HTMLElement | null = null;
  let tab = 'overview';
  let lastHtml = '';
  let lastTab = '';
  let pending = false;
  const filters = new Map<string, string>();
  const scrolls = new Map<string, number>();
  const opened = new Set<string>();
  const E = () => d.engine();
  const camp = () => E().campaign();
  const width = () => { try { return Number(localStorage.getItem('canon-insp-width')) || 0; } catch { return 0; } };

  function toggle(open: boolean) {
    const s = d.settings();
    s.inspectorOpen = open;
    const c = camp();
    if (c) c.uiPreferences.inspectorOpen = open;
    d.saveSettings();
    render(true);
  }

  // ---------------------------------------------------------------------------------------------
  // Views

  function overview(v: NonNullable<View>, ni: Ni | null, spoilers: boolean): Page {
    const w = E().worldView();
    const todo: string[] = [];
    const go = (tabId: string, text: string, tone: string) => `<button class="ci-todo ci-${tone}" data-tab="${tabId}">${esc(text)} <span class="ci-arrow">›</span></button>`;
    if (ni?.personaChanged) todo.push(go('identity', t('niChanged'), 'warn'));
    if (ni && ni.unanswered.length) todo.push(go('contacts', t('ciTodoUnanswered').replace('{n}', String(ni.unanswered.length)), 'accent'));
    if (w?.unchecked.length) todo.push(go('world', t('ciTodoUnchecked').replace('{n}', String(w.unchecked.length)), 'warn'));
    if (w?.overrides.some((o) => o.stale)) todo.push(go('world', t('ciTodoStale'), 'warn'));
    if (v.recovery.status !== 'ok') todo.push(`<div class="ci-todo ci-bad">${esc(v.recovery.status)} ${esc(v.recovery.reason || '')}</div>`);
    const tile = (label: string, value: string, sub = '') => `<div class="ci-tile"><div class="ci-tile-l">${esc(label)}</div><div class="ci-tile-v">${esc(value)}</div>${sub ? `<div class="ci-tile-s">${esc(sub)}</div>` : ''}</div>`;
    const tiles = `<div class="ci-tiles">${tile(t('ciTime'), v.time)}${tile(t('ciPack'), v.title, `hash ${v.packHash}`)}${tile(t('ciRevision'), `rev ${v.revision}`, `branch ${v.branchId.slice(0, 12)}`)}${tile(t('ciCounts'), `${v.occurrences.length} · ${v.facts.length}`, t('ciCountsSub'))}</div>`;
    const notices = v.notices.slice().reverse().map((n, i) => item(`notice-${i}`, `${chip(n.level === 'error' ? t('ciError') : n.level === 'warn' ? t('ciWarn') : t('ciInfo'), n.level === 'error' ? 'bad' : n.level === 'warn' ? 'warn' : '')}`, esc(n.text)));
    void spoilers;
    return {
      html: tiles + sec('todo', t('ciTodo'), todo.length ? `<div class="ci-todos">${todo.join('')}</div>` : `<div class="ci-empty">${esc(t('ciAllClear'))}</div>`) + sec('notices', t('ciNotices'), notices.join('') || empty()),
      secs: [],
    };
  }

  function identity(ni: Ni): Page {
    let html = '';
    if (ni.personaChanged) html += `<div class="ci-banner ci-warn"><b>${esc(t('niChanged'))}</b><div class="ci-actions">${btn(t('niUpdate'), 'data-act="ni-update"', 'primary')}${btn(t('niKeep'), 'data-act="ni-keep"')}</div></div>`;
    else if (ni.profileOld) html += `<div class="ci-banner ci-warn"><b>${esc(t('niOld'))}</b><div class="ci-actions">${btn(t('niUpdate'), 'data-act="ni-update"', 'primary')}</div></div>`;
    const p = ni.profile;
    if (!p) return { html: html + `<div class="ci-empty">${esc(t('niNoProfile'))}</div>`, secs: [] };
    html += `<div class="ci-hero"><div class="ci-hero-name">${esc(p.name)}</div><div>${esc(p.summary)}</div>${p.publicIdentity ? muted(esc(p.publicIdentity)) : ''}${muted(esc(t(p.source === 'persona_core' ? 'niSourceCore' : 'niSource').replace('{n}', String(p.chars)).replace('{rev}', String(p.rev))))}${ni.personaChanged || ni.profileOld ? '' : `<div class="ci-actions">${btn(t('niReread'), `data-act="ni-update" title="${esc(t('niRereadTip'))}"`)}</div>`}</div>`;
    const secs: Page['secs'] = [];
    const list = (id: string, label: string, rows: string[]) => {
      if (!rows.length) return '';
      secs.push({ id, label });
      return sec(id, label, rows.map((r, i) => item(`${id}-${i}`, `<span class="ci-text">${esc(r)}</span>`)).join(''));
    };
    html += list('orgs', t('niOrgs'), p.affiliations) + list('places', t('niPlaces'), p.places) + list('roles', t('niRoles'), p.roles || [])
      + list('notsuited', t('niNotSuited'), p.notSuited || []) + list('voice', t('niVoice'), p.voice ? [p.voice] : []) + list('nature', t('niNature'), p.nature || []) + list('defenses', t('niDefenses'), p.defenses ? [p.defenses] : []) + list('recognized', t('niRecognized'), p.recognized || [])
      + list('lore', t('niLore'), p.lore || []) + list('notes', t('niNotes'), p.notes);
    return { html, secs };
  }

  function ties(ni: Ni): Page {
    const p = ni.profile;
    if (!p) return { html: `<div class="ci-empty">${esc(t('niNoProfile'))}</div>`, secs: [] };
    const src = (x: { by: string; since: string | null; start: string | null; quote: string }) => `${chip(t(`tieSrc_${x.by}`), x.by === 'ui' ? 'accent' : '')}${x.since ? `<span class="ci-meta">${esc(t('tieSince').replace('{t}', x.since))}</span>` : ''}`;
    const extra = (x: { start: string | null; quote: string }) => `${x.start ? muted(`${esc(t('tieStart'))}: ${esc(x.start)}`) : ''}${x.quote ? `<div class="ci-quote">“${esc(x.quote)}”</div>` : ''}`;
    const ids = (kind: string, x: { who: string | null; name: string }, i: number) => `data-kind="${kind}" data-i="${i}" data-who="${esc(x.who || '')}" data-name="${esc(x.name)}"`;
    const levels = (cur: string, attr: string) => `<select class="text_pole canon-tie-level" ${attr}>${['exists', 'identity', 'secrets'].map((l) => `<option value="${l}" ${l === cur ? 'selected' : ''}>${esc(t(`tieLevel_${l}`))}</option>`).join('')}</select>`;
    const saveDel = (attr: string) => `<div class="ci-actions">${btn(t('wsSave'), `data-act="tie-save" ${attr}`, 'primary')}${btn(t('wsDelete'), `data-act="tie-del" ${attr}`, 'danger')}</div>`;
    const rel = p.relationships.map((r, i) => {
      const a = ids('relation', r, i);
      return item(`rel-${r.name}`, `<span class="ci-title">${esc(r.name)}</span>${r.ended ? chip(t('tieEnded'), 'muted') : ''}${src(r)}`,
        `${esc(r.text)}${r.org ? `<span class="ci-meta">${esc(r.org)}</span>` : ''}${extra(r)}`,
        fold(`rel-edit-${r.name}`, t('tieEdit'), `<textarea class="text_pole canon-tie-text" ${a} rows="2">${esc(r.text)}</textarea><label class="checkbox_label ci-check"><input type="checkbox" class="canon-tie-ended" ${a} ${r.ended ? 'checked' : ''}><span>${esc(t('tieEnded'))}</span></label>${saveDel(a)}`, 'ci-edit'));
    });
    const kn = p.knowers.map((k, i) => {
      const a = ids('knows', k, i);
      return item(`kn-${k.name}`, `<span class="ci-title">${esc(k.name)}</span>${chip(t(`tieLevel_${k.level}`), k.level === 'secrets' ? 'warn' : '')}${src(k)}`,
        `${esc(k.text)}${extra(k)}`,
        fold(`kn-edit-${k.name}`, t('tieEdit'), `${levels(k.level, a)}<textarea class="text_pole canon-tie-text" ${a} rows="2">${esc(k.text)}</textarea>${saveDel(a)}`, 'ci-edit'));
    });
    const add = (kind: 'relation' | 'knows') => {
      const a = `data-kind="${kind}" data-i="new"`;
      return fold(`add-${kind}`, t(kind === 'relation' ? 'tieAddRel' : 'tieAddKnower'), `<input class="text_pole canon-tie-name" ${a} placeholder="${esc(t('tieName'))}">${kind === 'knows' ? levels('identity', a) : ''}`
        + `<textarea class="text_pole canon-tie-text" ${a} rows="2" placeholder="${esc(t(kind === 'relation' ? 'tieRelText' : 'tieKnowsText'))}"></textarea><div class="ci-actions">${btn(t('wsSave'), `data-act="tie-save" ${a}`, 'primary')}</div>`, 'ci-add');
    };
    return {
      html: sec('rel', t('niConnections'), (rel.join('') || empty()) + add('relation'), '', d.tip('tieTip')) + sec('knows', t('niWho'), (kn.join('') || empty()) + add('knows')),
      secs: [{ id: 'rel', label: t('niConnections') }, { id: 'knows', label: t('niWho') }],
    };
  }

  function contacts(ni: Ni): Page {
    const jobs = `<label class="checkbox_label ci-check ci-switch"><input type="checkbox" data-act="ni-jobs" ${E().settings.quietDayJobs !== false ? 'checked' : ''}><span>${esc(t('niJobsToggle'))}</span></label>${d.tip('quietDayJobsTip')}`;
    // one card per matter (newest first); its earlier contacts fold underneath
    const groups = new Map<string, Ni['contacts']>();
    for (const k of ni.contacts.slice().reverse()) groups.set(k.scope, [...(groups.get(k.scope) || []), k]);
    const POS = ['accepted', 'joined', 'reopened', 'answered', 'limited'], NEG = ['declined', 'deferred', 'refused', 'ooc_suppress'];
    const ans = (k: Ni['contacts'][number], stance: string, label: string, tone = '') => btn(t(label), `data-act="ni-answer" data-rec="${esc(k.recordId)}" data-stance="${stance}"`, tone);
    const line = (k: Ni['contacts'][number]) => `<div class="ci-meta">${esc(k.time)} · ${esc(k.kind)}${k.by.length ? ` · ${esc(k.by.join(', '))}` : ''}</div><div class="ci-quote">“${esc(k.quote)}”</div>`;
    const need: string[] = [], rest: string[] = [];
    for (const [k, ...older] of groups.values()) {
      const a = k.answer;
      const waiting = !a && !k.inPlay && !k.lapsed;
      const status = k.lapsed ? chip(t('niJobLapsed'), 'muted') : a ? chip(t(`niStance_${a}`), a === 'done' ? 'muted' : POS.includes(a) ? 'ok' : 'bad') : k.inPlay ? chip(t('niAnswerInPlay'), 'ok') : ni.unanswered.includes(k.recordId) ? chip(t('niUnanswered'), 'accent') : '';
      const actions = k.lapsed || a === 'done' ? '' : a && POS.includes(a) ? ans(k, 'done', 'niDone', 'primary') : a && NEG.includes(a) ? ans(k, 'accepted', 'niAcceptAgain') : `${ans(k, 'accepted', 'niAccept', 'primary')}${ans(k, 'declined', 'niDecline')}`;
      const card = item(`c-${k.scope}`, `<span class="ci-title">${esc(k.label)}</span>${k.sideJob ? chip(t('niSideJob')) : ''}${status}<span class="ci-sp"></span><span class="ci-actions">${actions}</span>`,
        line(k), older.length ? fold(`c-old-${k.scope}`, t('niOlderContacts').replace('{n}', String(older.length)), older.map(line).join('<hr class="ci-hr">')) : '');
      (waiting ? need : rest).push(card);
    }
    let html = `<div class="ci-bar">${jobs}</div>`;
    const secs: Page['secs'] = [];
    html += sec('need', t('ciNeedAnswer'), need.join('') || `<div class="ci-empty">${esc(t('ciAllClear'))}</div>`);
    secs.push({ id: 'need', label: t('ciNeedAnswer') });
    html += sec('all', t('ciOtherContacts'), rest.join('') || empty());
    secs.push({ id: 'all', label: t('ciOtherContacts') });
    if (ni.suggestions) {
      const sg = new Map<string, NonNullable<Ni['suggestions']>>();
      for (const s of ni.suggestions) sg.set(s.scope, [...(sg.get(s.scope) || []), s]);
      const sLine = (s: NonNullable<Ni['suggestions']>[number]) => `<div>${s.sideJob ? chip(t('niSideJob')) : ''}${esc(s.by.join(', '))}: ${esc(s.contact)} <span class="ci-meta">${esc(s.kind)}${s.direct ? ' · direct' : ''}</span></div>`;
      const avoid = (s: NonNullable<Ni['suggestions']>[number]) => btn(t(s.avoided ? 'niUnavoid' : 'niAvoid'), `data-act="ni-avoid" data-scope="${esc(s.scope)}" title="${esc(t(s.avoided ? 'niUnavoidTip' : 'niAvoidTip'))}"`);
      const pref = (s: NonNullable<Ni['suggestions']>[number]) => (s.current ? chip(t('niCurrent'), 'accent')
        : `${s.preferred ? chip(t('niPreferred'), 'ok') : ''}${s.avoided ? chip(t('niAvoided'), 'warn') : ''}<span class="ci-sp"></span>${s.avoided ? '' : btn(t(s.preferred ? 'niUnprefer' : 'niPrefer'), `data-act="ni-prefer" data-scope="${esc(s.scope)}" title="${esc(t(s.preferred ? 'niUnpreferTip' : 'niPreferTip'))}"`)}`) + avoid(s);
      html += sec('sugg', t('niSuggestions'), [...sg.values()].map(([s, ...more]) => item(`s-${s.scope}`, `<span class="ci-title">${esc(s.about)}</span>${pref(s)}`, sLine(s), more.length ? fold(`s-more-${s.scope}`, t('niMoreSuggestions').replace('{n}', String(more.length)), more.map(sLine).join('')) : '')).join('') || empty(),
        btn(t('niRefresh'), `data-act="ni-refresh" title="${esc(t('niRefreshTip'))}"`));
      secs.push({ id: 'sugg', label: t('ciSugg') });
    }
    if (ni.dropped?.length) {
      html += sec('dropped', t('niDropped'), ni.dropped.map((x, i) => item(`dr-${i}`, `<span class="ci-title">${esc(x.id)}</span>`, esc(x.reason))).join(''));
      secs.push({ id: 'dropped', label: t('niDropped') });
    }
    return { html, secs };
  }

  function decisions(ni: Ni): Page {
    const negative = new Set(['declined', 'deferred', 'ooc_suppress']);
    const dg = new Map<string, Ni['decisions']>();
    for (const x of ni.decisions.slice().reverse()) dg.set(x.scope, [...(dg.get(x.scope) || []), x]);
    const dLine = (x: Ni['decisions'][number]) => `<div class="ci-meta">${esc(t(`niStance_${x.stance}`))} · ${esc(x.time)}</div>${x.quote ? `<div class="ci-quote">“${esc(x.quote)}”</div>` : ''}`;
    const active: string[] = [], past: string[] = [];
    for (const ds of dg.values()) {
      const x = ds.find((y) => y.active) || ds[0];
      const older = ds.filter((y) => y !== x);
      const neg = negative.has(x.stance);
      const force = x.active && neg ? chip(t(x.binding ? (x.stance === 'ooc_suppress' ? 'niBindingOoc' : 'niBinding') : 'niWish'), x.binding ? 'bad' : 'warn') : '';
      const acts = x.active && neg ? `${x.stance === 'ooc_suppress' ? '' : btn(t(x.strong ? 'niWeak' : 'niStrong'), `data-act="${x.strong ? 'ni-weak' : 'ni-strong'}" data-kind="${esc(x.scopeKind)}" data-ref="${esc(x.scopeRef)}" title="${esc(t(x.strong ? 'niWeakTip' : 'niStrongTip'))}"`)}${btn(t('niReopen'), `data-act="ni-reopen" data-kind="${esc(x.scopeKind)}" data-ref="${esc(x.scopeRef)}" data-label="${esc(x.label)}"`)}` : '';
      const card = item(`d-${x.scope}`, `<span class="ci-title">${esc(x.label)}</span>${chip(t(`niStance_${x.stance}`), neg ? 'bad' : 'ok')}${force}<span class="ci-sp"></span><span class="ci-actions">${acts}</span>`,
        dLine(x), older.length ? fold(`d-old-${x.scope}`, t('niOlderDecisions').replace('{n}', String(older.length)), older.map(dLine).join('<hr class="ci-hr">')) : '');
      (x.active ? active : past).push(card);
    }
    return {
      html: sec('active', t('niActive'), active.join('') || empty(), '', d.tip('niDecisionsTip')) + (past.length ? sec('past', t('ciPast'), past.join('')) : ''),
      secs: past.length ? [{ id: 'active', label: t('niActive') }, { id: 'past', label: t('ciPast') }] : [],
    };
  }

  function world(): Page {
    const w = E().worldView();
    if (!w) return { html: `<div class="ci-empty">${esc(t('niOff'))}</div>`, secs: [] };
    const spoilers = !!camp()?.uiPreferences.spoilers;
    const secs: Page['secs'] = [];
    const recheck = btn(t('wsRecheck'), `data-act="ws-recheck" title="${esc(t('wsRecheckTip'))}"`, 'primary');
    const changes = w.changes.map((c, i) => item(`wc-${i}`, `${chip(t(`wsSrc_${c.source}`))}<span class="ci-text">${esc(c.text)}</span>`, c.terms.length ? muted(`${esc(t('wsTerms'))}: ${esc(c.terms.join('、'))}`) : ''));
    const manual = fold('ws-manual', t('wsManual'), `<textarea class="text_pole canon-ws-manual" rows="3">${esc(w.manual.join('\n'))}</textarea><div class="ci-actions">${btn(t('wsSave'), 'data-act="ws-manual"', 'primary')}</div>`, 'ci-add');
    const checked = w.checked ? muted(esc(t('wsChecked').replace('{lore}', String(w.checked.lore)).replace('{ent}', String(w.checked.entities)).replace('{ev}', String(w.checked.events))) + (w.checked.generic.length ? ` ${esc(t('wsGeneric'))}${esc(w.checked.generic.join('、'))}` : '')) : '';
    let html = `<div class="ci-bar">${muted(esc(t('wsIntro')))}</div>`;
    html += sec('changes', t('ciWsChanges'), (changes.join('') || `<div class="ci-empty">${esc(t('wsNoChanges'))}</div>`) + manual + checked, recheck);
    secs.push({ id: 'changes', label: t('ciWsChanges') });
    if (w.checked) {
      if (!w.loreHook && w.overrides.some((o) => o.kind === 'lore')) html += `<div class="ci-banner ci-warn">${esc(t('wsNoHook'))}</div>`;
      if (w.unchecked.length) {
        html += sec('unchecked', t('wsUnchecked').replace('{n}', String(w.unchecked.length)), `<div class="ci-banner ci-warn">${esc(w.unchecked[0].why)}</div>` + w.unchecked.map((r, i) => item(`wu-${i}`, `<span class="ci-title">${esc(r.title)}</span>${chip(t(`wsKind_${r.kind}`))}`)).join(''));
        secs.push({ id: 'unchecked', label: t('ciWsUnchecked') });
      }
      const hidden = w.overrides.filter((o) => o.future && !spoilers).length;
      const shown = w.overrides.filter((o) => !o.future || spoilers);
      const ov = shown.map((o) => item(`wo-${o.id}`,
        `<span class="ci-title">${esc(o.title)}${o.name ? ` → ${esc(o.name)}` : ''}</span>${chip(t(`wsKind_${o.kind}`))}${chip(t(o.action === 'disable' ? 'wsDisable' : 'wsReplace'), o.action === 'disable' ? 'bad' : 'accent')}${o.edited ? chip(t('wsEdited'), 'ok') : ''}${o.stale ? chip(t('wsStale'), 'warn') : ''}${o.book ? `<span class="ci-meta">${esc(o.book)}</span>` : ''}`,
        o.reason ? esc(o.reason) : '',
        fold(`wo-cmp-${o.id}`, `${t('wsOriginal')} / ${t('wsThisGame')}`, `<div class="ci-cmp"><div><div class="ci-cmp-l">${esc(t('wsOriginal'))}</div>${esc(o.original)}</div><div><div class="ci-cmp-l">${esc(t('wsThisGame'))}</div>${esc(o.action === 'disable' ? '—' : o.content)}</div></div>`)
        + fold(`wo-edit-${o.id}`, t('tieEdit'), `<textarea class="text_pole canon-ws-edit" data-id="${esc(o.id)}" rows="5" title="${esc(t('wsEditTip'))}">${esc(o.content)}</textarea><div class="ci-actions">${btn(t('wsSave'), `data-act="ws-save" data-id="${esc(o.id)}"`, 'primary')}${btn(t('wsDelete'), `data-act="ws-del" data-id="${esc(o.id)}"`, 'danger')}</div>`, 'ci-edit')));
      html += sec('overrides', t('wsOverrides'), (ov.join('') || (!hidden ? `<div class="ci-empty">${esc(t('wsNone'))}</div>` : '')) + (hidden ? muted(esc(t('wsFutureHidden').replace('{n}', String(hidden)))) : ''));
      secs.push({ id: 'overrides', label: t('ciWsOverrides') });
      if (w.additions.length) {
        html += sec('additions', t('wsAdditions'), w.additions.map((a) => item(`wa-${a.id}`, `<span class="ci-title">${esc(a.title)}</span>${a.edited ? chip(t('wsEdited'), 'ok') : ''}<span class="ci-meta">${esc(a.keys.join('、'))}</span>`, a.reason ? esc(a.reason) : '',
          fold(`wa-edit-${a.id}`, t('wsThisGame'), `<textarea class="text_pole canon-ws-edit" data-id="${esc(a.id)}" rows="5">${esc(a.content)}</textarea><div class="ci-actions">${btn(t('wsSave'), `data-act="ws-save" data-id="${esc(a.id)}"`, 'primary')}${btn(t('wsDelete'), `data-act="ws-del" data-id="${esc(a.id)}"`, 'danger')}</div>`, 'ci-edit'))).join(''));
        secs.push({ id: 'additions', label: t('ciWsAdditions') });
      }
      if (w.rejected.length) {
        html += sec('rejected', t('wsRejected').replace('{n}', String(w.rejected.length)), w.rejected.map((r, i) => item(`wr-${i}`, `<span class="ci-title">${esc(r.title)}</span>${chip(t(`wsKind_${r.kind}`))}`, `${esc(r.why)}${r.reason ? muted(esc(r.reason)) : ''}`)).join(''));
        secs.push({ id: 'rejected', label: t('ciWsRejected') });
      }
    }
    return { html, secs };
  }

  function facts(v: NonNullable<View>): Page {
    // one card per entity; a fact's source shows on hover
    const by = new Map<string, any[]>();
    for (const f of v.facts as any[]) by.set(f.entity, [...(by.get(f.entity) || []), f]);
    const val = (s: string) => { try { const x = JSON.parse(s); return Array.isArray(x) ? x.join('、') : typeof x === 'string' ? x : s; } catch { return s; } };
    const cards = [...by].sort((a, b) => a[0].localeCompare(b[0])).map(([e, fs]) => item(`f-${e}`, `<span class="ci-title">${esc(e)}</span>${chip(String(fs.length), 'muted')}`,
      `<table class="ci-kv">${fs.map((f) => `<tr title="${esc(f.source)}"><th>${esc(f.predicate)}</th><td>${esc(val(f.value))}</td><td class="ci-meta">${esc(f.since)}</td></tr>`).join('')}</table>`));
    return { html: cards.join('') || empty(), secs: [] };
  }

  function history(v: NonNullable<View>): Page {
    // newest first
    return { html: v.occurrences.slice().reverse().map((o) => item(`h-${o.id}`, `<span class="ci-meta ci-when">${esc(o.before ? t('ciUndated').replace('{t}', o.before) : o.time)}</span><span class="ci-title">${esc(o.title)}</span>${chip(o.origin, o.origin === 'player' ? 'accent' : 'muted')}`, esc(o.account))).join('') || empty(), secs: [] };
  }

  function deviations(v: NonNullable<View>): Page {
    return { html: v.deviations.map((x) => item(`dv-${x.id}`, `<span class="ci-title">${esc(x.title)}</span>${chip(x.disposition, 'warn')}`, esc(x.reason))).join('') || empty(), secs: [] };
  }

  function anchors(v: NonNullable<View>, spoilers: boolean): Page {
    const tone = (s: string) => (s === 'occurred' ? 'ok' : s === 'pending' ? 'muted' : s === 'due' ? 'accent' : 'warn');
    return { html: v.anchors.map((a) => item(`an-${a.id}`, `<span class="ci-title">${esc(spoilers ? a.title : '•••')}</span>${chip(a.status, tone(a.status))}<span class="ci-meta">${esc(a.when)}</span>`, esc(a.required))).join('') || empty(), secs: [] };
  }

  function debug(v: NonNullable<View>): Page {
    const c = camp();
    const block = (key: string, label: string, text: string) => fold(`dbg-${key}`, label, `<pre class="ci-pre">${esc(text)}</pre>`);
    return {
      html: block('turn', 'Last turn', E().lastReport || '—') + block('op', 'Last operation', JSON.stringify(v.lastTrace, null, 1))
        + block('prompt', 'Final draft prompt (as sent)', JSON.stringify(d.lastDraftPrompt(), null, 1)) + block('manifests', 'Coverage manifests', JSON.stringify(v.manifests, null, 1))
        + block('raw', 'Raw campaign JSON', JSON.stringify({ ...c, packSnapshot: '[omitted]' }, null, 1).slice(0, 200000)),
      secs: [],
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Frame

  function nav(v: NonNullable<View> | null, ni: Ni | null) {
    const w = E().worldView();
    const badge = (n: number, tone = '') => (n ? `<span class="ci-badge${tone ? ` ci-${tone}` : ''}">${n}</span>` : '');
    const groups: { label: string; items: [string, string, string][] }[] = [
      { label: '', items: [['overview', t('tabOverview'), badge((v?.notices || []).filter((n) => n.level === 'error').length, 'bad')]] },
      ...(ni ? [{ label: t('ciNavPlayer'), items: [
        ['identity', t('ciTabIdentity'), ni.personaChanged ? badge(1, 'warn') : ''],
        ['ties', t('ciTabTies'), ''],
        ['contacts', t('ciTabContacts'), badge(ni.unanswered.length, 'accent')],
        ['decisions', t('ciTabDecisions'), ''],
      ] as [string, string, string][] }] : []),
      { label: t('ciNavWorld'), items: [
        ...(ni ? [['world', t('wsTitle'), w?.unchecked.length ? badge(w.unchecked.length, 'warn') : badge(w?.overrides.length || 0, 'muted')] as [string, string, string]] : []),
        ['facts', t('tabFacts'), badge(v?.facts.length || 0, 'muted')],
        ['history', t('tabHistory'), badge(v?.occurrences.length || 0, 'muted')],
        ['deviations', t('tabDeviations'), badge(v?.deviations.length || 0, 'muted')],
        ['anchors', t('tabAnchors'), ''],
      ] },
      { label: t('ciNavEngine'), items: [['plan', t('tabPlan'), ''], ...(E().settings.debug ? [['debug', t('tabDebug'), ''] as [string, string, string]] : [])] },
    ];
    const ids = groups.flatMap((g) => g.items.map((x) => x[0]));
    return { ids, html: groups.map((g) => `<div class="ci-nav-g">${g.label ? `<div class="ci-nav-l">${esc(g.label)}</div>` : ''}${g.items.map(([id, label, b]) => `<button class="ci-nav-i${id === tab ? ' ci-on' : ''}" data-tab="${id}"><span>${esc(label)}</span>${b}</button>`).join('')}</div>`).join('') };
  }

  function page(v: NonNullable<View>, spoilers: boolean): Page {
    const ni = v.integration;
    const needNi = ['identity', 'ties', 'contacts', 'decisions', 'world'];
    if (needNi.includes(tab) && !ni) return { html: `<div class="ci-empty">${esc(t('niOff'))}</div>`, secs: [] };
    switch (tab) {
      case 'identity': return identity(ni!);
      case 'ties': return ties(ni!);
      case 'contacts': return contacts(ni!);
      case 'decisions': return decisions(ni!);
      case 'world': return world();
      case 'facts': return facts(v);
      case 'history': return history(v);
      case 'deviations': return deviations(v);
      case 'anchors': return anchors(v, spoilers);
      case 'plan': return { html: `<pre class="ci-pre">${esc(JSON.stringify(v.plan, null, 1))}</pre>`, secs: [] };
      case 'debug': return debug(v);
      default: return overview(v, ni, spoilers);
    }
  }

  /** Shows only the cards whose text has the filter (sections without one hidden); the count in the box. */
  function applyFilter() {
    if (!el) return;
    const q = (filters.get(tab) || '').trim().toLowerCase();
    const items = [...el.querySelectorAll<HTMLElement>('.ci-page .ci-item')];
    let shown = 0;
    for (const it of items) { const on = !q || (it.textContent || '').toLowerCase().includes(q); it.hidden = !on; if (on) shown++; }
    for (const s of el.querySelectorAll<HTMLElement>('.ci-page .ci-sec')) s.hidden = !!q && !s.querySelector('.ci-item:not([hidden])');
    const n = el.querySelector('.ci-count');
    if (n) n.textContent = q ? `${shown}/${items.length}` : '';
    el.querySelector('.ci-nomatch')?.toggleAttribute('hidden', !(q && !shown && items.length));
  }

  function editing(): boolean {
    const a = document.activeElement as HTMLElement | null;
    return !!el && !!a && el.contains(a) && /^(TEXTAREA|SELECT)$|^INPUT$/.test(a.tagName) && !a.classList.contains('ci-filter') && (a as HTMLInputElement).type !== 'checkbox';
  }

  function render(force = false) {
    const c = camp();
    const s = d.settings();
    const open = !!(c?.uiPreferences.inspectorOpen ?? s.inspectorOpen) && !!c;
    if (!open) { el?.remove(); el = null; lastHtml = ''; return; }
    // never rebuild under the user's hands: an edit in progress keeps the page until it loses focus
    if (el && editing() && !force) { pending = true; return; }
    pending = false;
    if (!el) mount();
    const spoilers = !!c?.uiPreferences.spoilers;
    const v = E().inspector(spoilers);
    const ni = v?.integration || null;
    const n = nav(v, ni);
    if (!n.ids.includes(tab)) tab = 'overview';
    const pg = v ? page(v, spoilers) : { html: `<div class="ci-empty">${esc(E().status.message || t('phase_reconciling'))}</div>`, secs: [] };
    const head = `<div class="ci-headbar"><div class="ci-heading"><b>${esc(t('inspect'))}</b>${v ? `<span class="ci-clock">⏱ ${esc(v.time)}</span>` : ''}</div>
      <label class="ci-spoil" title="${esc(t('spoilers'))}"><input type="checkbox" data-act="spoilers" ${spoilers ? 'checked' : ''}><span>${esc(t('ciSpoilers'))}</span></label>
      <button class="menu_button ci-x" data-act="close" title="${esc(t('ciClose'))}">✕</button></div>`;
    const tools = `<div class="ci-tools"><div class="ci-search"><input class="text_pole ci-filter" type="search" placeholder="${esc(t('ciFilter'))}" value="${esc(filters.get(tab) || '')}"><span class="ci-count"></span></div>${pg.secs.length > 1 ? `<div class="ci-jumps">${pg.secs.map((x) => `<button class="ci-jump" data-jump="${x.id}">${esc(x.label)}</button>`).join('')}</div>` : ''}</div>`;
    const main = `<div class="ci-page">${pg.html}<div class="ci-empty ci-nomatch" hidden>${esc(t('ciNoMatch'))}</div></div>`;
    const html = `${head}<div class="ci-grid"><nav class="ci-nav">${n.html}</nav><div class="ci-main">${tools}<div class="ci-scroll">${main}</div></div></div><div class="ci-grip" title="${esc(t('ciResize'))}"></div>`;
    if (!force && html === lastHtml && tab === lastTab) return;
    // keep the reader's place: scroll and opened folds
    const sc = el!.querySelector('.ci-scroll');
    if (sc && lastTab) scrolls.set(lastTab, sc.scrollTop);
    const focusFilter = document.activeElement?.classList.contains('ci-filter');
    el!.innerHTML = html;
    lastHtml = html;
    lastTab = tab;
    for (const det of el!.querySelectorAll<HTMLDetailsElement>('details[data-key]')) if (opened.has(`${tab}|${det.dataset.key}`)) det.open = true;
    const sc2 = el!.querySelector('.ci-scroll');
    if (sc2) sc2.scrollTop = scrolls.get(tab) || 0;
    applyFilter();
    if (focusFilter) { const f = el!.querySelector<HTMLInputElement>('.ci-filter'); f?.focus(); f?.setSelectionRange(f.value.length, f.value.length); }
  }

  function run(p: Promise<unknown>, after?: () => void) {
    p.then(() => { after?.(); render(true); }).catch((e) => { d.toast('error', (e as Error).message); render(true); });
  }

  function mount() {
    el = document.createElement('div');
    el.id = 'canon-inspector';
    el.className = 'canon-inspector';
    const wd = width();
    if (wd) el.style.width = `${wd}px`;
    document.body.appendChild(el);
    el.addEventListener('toggle', (ev) => {
      const det = ev.target as HTMLDetailsElement;
      if (!det.dataset?.key) return;
      const k = `${tab}|${det.dataset.key}`;
      if (det.open) opened.add(k); else opened.delete(k);
    }, true);
    el.addEventListener('focusout', () => { setTimeout(() => { if (pending && !editing()) render(); }, 0); });
    el.addEventListener('input', (ev) => {
      const f = ev.target as HTMLInputElement;
      if (f.classList.contains('ci-filter')) { filters.set(tab, f.value); applyFilter(); }
    });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !(ev.target as HTMLElement).closest('textarea')) toggle(false); });
    // drag the left edge to resize (remembered in this browser)
    el.addEventListener('pointerdown', (ev) => {
      if (!(ev.target as HTMLElement).classList.contains('ci-grip')) return;
      ev.preventDefault();
      const move = (e: PointerEvent) => { if (el) el.style.width = `${Math.max(340, Math.min(window.innerWidth - 40, window.innerWidth - e.clientX))}px`; };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('canon-insp-width', String(el?.offsetWidth || 0)); } catch { /* private mode */ } };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    el.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest('[data-tab],[data-act],[data-jump]') as HTMLElement | null;
      if (!b || !el) return;
      if (b.dataset.tab) { const sc = el.querySelector('.ci-scroll'); if (sc) scrolls.set(tab, sc.scrollTop); tab = b.dataset.tab; render(true); return; }
      if (b.dataset.jump) { el.querySelector(`.ci-sec[data-sec="${CSS.escape(b.dataset.jump)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      const act = b.dataset.act;
      const E0 = E();
      if (act === 'close') return toggle(false);
      if (act === 'spoilers' || act === 'ni-jobs') return;
      if (b.tagName === 'BUTTON') (b as HTMLButtonElement).disabled = true;
      if (act === 'ni-prefer') run(E0.togglePreferred(b.dataset.scope || ''));
      if (act === 'ni-avoid') run(E0.toggleAvoided(b.dataset.scope || ''));
      else if (act === 'ni-refresh') { b.textContent = t('niBusy'); run(E0.refreshIntegration().then((n) => d.toast('info', t('niRefreshDone').replace('{n}', String(n))))); }
      else if (act === 'ws-recheck' || act === 'ws-manual' || act === 'ws-save' || act === 'ws-del') {
        if (act === 'ws-recheck') b.textContent = t('wsBusy');
        const box = (sel: string) => (el!.querySelector(sel) as HTMLTextAreaElement | null)?.value ?? '';
        const id = b.dataset.id || '';
        run(act === 'ws-recheck' ? E0.recheckWorld().then(() => d.toast('info', t('wsDone')))
          : act === 'ws-manual' ? E0.setWorldManual(box('.canon-ws-manual').split(/\r?\n/))
          : act === 'ws-save' ? E0.editWorld(id, box(`.canon-ws-edit[data-id="${CSS.escape(id)}"]`))
          : E0.editWorld(id, null));
      } else if (act === 'tie-save' || act === 'tie-del') {
        const kind = b.dataset.kind === 'knows' ? 'knows' : 'relation';
        const sel = (cls: string) => el!.querySelector(`.${cls}[data-kind="${kind}"][data-i="${CSS.escape(b.dataset.i || '')}"]`) as HTMLInputElement | null;
        const isNew = b.dataset.i === 'new';
        const name = isNew ? (sel('canon-tie-name')?.value || '') : (b.dataset.name || '');
        const text = sel('canon-tie-text')?.value.trim() || '';
        if (act === 'tie-save' && (!name.trim() || (kind === 'relation' && !text))) { (b as HTMLButtonElement).disabled = false; d.toast('warning', t('tieNeedText')); return; }
        const patch = act === 'tie-del' ? null : kind === 'relation' ? { relation: text, ended: !!sel('canon-tie-ended')?.checked } : { level: (sel('canon-tie-level')?.value || 'identity') as 'exists' | 'identity' | 'secrets', about: text };
        // a saved edit closes its form
        run(E0.editTie(kind, isNew ? null : b.dataset.who || null, name, patch), () => { const det = b.closest('details[data-key]') as HTMLElement | null; if (det) opened.delete(`${tab}|${det.dataset.key}`); });
      } else if (act === 'ni-answer') run(E0.answerContact(b.dataset.rec || '', b.dataset.stance as 'accepted' | 'declined' | 'done'));
      else if (act === 'ni-update') { b.textContent = t('niBusy'); run(E0.updateIdentity()); }
      else if (act === 'ni-keep') run(E0.keepIdentity());
      else if (act === 'ni-strong' || act === 'ni-weak') run(E0.setDecisionStrong(b.dataset.kind as any, b.dataset.ref || '', act === 'ni-strong'));
      else if (act === 'ni-reopen') run(E0.reopenScope(b.dataset.kind as any, b.dataset.ref || '', b.dataset.label || ''));
    });
    el.addEventListener('change', (ev) => {
      const tg = ev.target as HTMLInputElement;
      const c = camp();
      if (tg.dataset.act === 'spoilers' && c) { c.uiPreferences.spoilers = tg.checked; render(true); }
      if (tg.dataset.act === 'ni-jobs') {
        (d.settings() as any).quietDayJobs = tg.checked;
        E().settings.quietDayJobs = tg.checked;
        d.saveSettings();
        d.refreshUi();
        render(true);
      }
    });
  }

  return { render, toggle };
}
