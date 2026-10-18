// Pack loading: JSON Schema validation, semantic lint, immutable Graph A with indexes.
import * as V from '../generated/validators.js';
import type { CanonPack, Condition, Effect, Fact, FactValue, Id, PackEvent, PackPredicate } from './types';
import { toTick, whenToStoryTime } from './time';
import { deepClone, hashObject, stableStringify } from './util';

export interface LintIssue { level: 'error' | 'warning'; path: string; message: string }

export interface LoadedPack {
  pack: CanonPack;
  hash: string;
  predicates: Map<Id, PackPredicate>;
  entities: Map<Id, CanonPack['entities'][number]>;
  events: Map<Id, PackEvent>;
  /** Events with finite bounds sorted by (lo, hi, id). Unknown-time events are excluded. */
  timeIndex: { id: Id; lo: number; hi: number }[];
  unknownTimeEvents: Id[];
  hardEvents: Id[];
  edgesFrom: Map<Id, CanonPack['edges']>;
  edgesTo: Map<Id, CanonPack['edges']>;
  /** Normalized alias/name -> entity ids (identity aid, not a keyword trigger). */
  aliasIndex: Map<string, Id[]>;
  /** Event title -> event id (exact identity aid). */
  eventTitleIndex: Map<string, Id[]>;
  coverage: { start: number; end: number };
  warnings: LintIssue[];
}

export function normalizeName(s: string): string {
  return String(s).normalize('NFKC').toLowerCase().replace(/[\s·・._\-'"“”‘’「」『』]+/g, '');
}

/** Entity sets compare and hash order-independently. */
export function normalizeValue(v: FactValue): FactValue {
  return Array.isArray(v) ? [...v].sort() : v;
}

export function valuesEqual(a: FactValue, b: FactValue): boolean {
  return stableStringify(normalizeValue(a)) === stableStringify(normalizeValue(b));
}

function looksLikeWorldInfo(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (o.entries && typeof o.entries === 'object') {
    const first = Object.values(o.entries as Record<string, unknown>)[0] as Record<string, unknown> | undefined;
    if (!first || 'uid' in first || 'key' in first || 'keys' in first || 'content' in first) return true;
  }
  return false;
}

export const WORLD_INFO_ERROR =
  'This file is a SillyTavern World Info (lorebook) export. Canon Engine accepts only the new .canon.json history-pack format (schema_version 1.0.0) and has no lorebook importer. Author a new pack with HISTORY_PACK_AUTHORING_GUIDE.md and schemas/canon-pack.schema.json.';

export interface PackValidationResult {
  ok: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
  loaded?: LoadedPack;
}

/** Parse + validate + lint. Never converts any other format. */
export function validatePackText(text: string): PackValidationResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    return { ok: false, errors: [{ level: 'error', path: '', message: 'Not valid UTF-8 JSON: ' + (e as Error).message }], warnings: [] };
  }
  return validatePack(raw);
}

export function validatePack(raw: unknown): PackValidationResult {
  if (looksLikeWorldInfo(raw)) {
    return { ok: false, errors: [{ level: 'error', path: '', message: WORLD_INFO_ERROR }], warnings: [] };
  }
  const validate = V.pack;
  if (!validate(raw)) {
    const errors = (validate.errors || []).map((e) => ({ level: 'error' as const, path: e.instancePath || '/', message: `schema: ${e.message ?? e.keyword}` }));
    return { ok: false, errors: dedupeIssues(errors), warnings: [] };
  }
  const pack = deepClone(raw as CanonPack);
  const { errors, warnings } = lintPack(pack);
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, errors: [], warnings, loaded: buildLoaded(pack, warnings) };
}

function dedupeIssues(list: LintIssue[]): LintIssue[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = i.path + '|' + i.message;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const GENERIC_ALIASES = new Set(['magic', 'city', 'school', 'man', 'woman', 'girl', 'boy', 'he', 'she', 'it', '他', '她', '它', '城市', '魔法', '学校', '人']);
const TEMPORAL_CLAIM_RE = /\b(is dead|died|was killed|currently|has become|now leads|imprisoned)\b|已死|死亡|已经|现在是|目前|成为了|被杀/i;

export function lintPack(pack: CanonPack): { errors: LintIssue[]; warnings: LintIssue[] } {
  const errors: LintIssue[] = [];
  const warnings: LintIssue[] = [];
  const err = (path: string, message: string) => errors.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => warnings.push({ level: 'warning', path, message });

  const ns = <T extends { id: string }>(arr: T[], name: string) => {
    const m = new Map<string, T>();
    arr.forEach((x, i) => {
      if (m.has(x.id)) err(`/${name}/${i}/id`, `duplicate ${name} id "${x.id}"`);
      else m.set(x.id, x);
    });
    return m;
  };
  const sources = ns(pack.sources, 'sources');
  const predicates = ns(pack.predicates, 'predicates');
  const entities = ns(pack.entities, 'entities');
  const events = ns(pack.events, 'events');
  const arcs = ns(pack.arcs, 'arcs');
  ns(pack.edges, 'edges');

  const checkSources = (refs: string[], path: string) =>
    refs.forEach((r, i) => { if (!sources.has(r)) err(`${path}/${i}`, `unknown source "${r}"`); });
  const checkEntity = (id: string, path: string) => { if (!entities.has(id)) err(path, `unknown entity "${id}"`); };

  const checkValue = (pred: PackPredicate, v: FactValue, path: string) => {
    switch (pred.value_type) {
      case 'boolean': if (typeof v !== 'boolean') err(path, `predicate "${pred.id}" expects boolean`); break;
      case 'number': if (typeof v !== 'number' || !Number.isFinite(v)) err(path, `predicate "${pred.id}" expects finite number`); break;
      case 'string': if (typeof v !== 'string') err(path, `predicate "${pred.id}" expects string`); break;
      case 'entity_ref': if (typeof v !== 'string') err(path, `predicate "${pred.id}" expects entity id`); else checkEntity(v, path); break;
      case 'entity_set':
        if (!Array.isArray(v)) err(path, `predicate "${pred.id}" expects entity id array`);
        else {
          if (new Set(v).size !== v.length) err(path, `entity set has duplicates`);
          v.forEach((x, i) => checkEntity(x, `${path}/${i}`));
        }
        break;
    }
    if (pred.allowed_values && !pred.allowed_values.some((a) => valuesEqual(a, v))) err(path, `value ${JSON.stringify(v)} not in allowed_values of "${pred.id}"`);
  };
  const checkFact = (f: Fact, path: string) => {
    checkEntity(f.entity_id, `${path}/entity_id`);
    const p = predicates.get(f.predicate);
    if (!p) err(`${path}/predicate`, `unknown predicate "${f.predicate}"`);
    else checkValue(p, f.value, `${path}/value`);
  };
  const checkCondition = (c: Condition, path: string, selfId?: string) => {
    if ('all' in c) c.all.forEach((x, i) => checkCondition(x, `${path}/all/${i}`, selfId));
    else if ('any' in c) c.any.forEach((x, i) => checkCondition(x, `${path}/any/${i}`, selfId));
    else if ('not' in c) checkCondition(c.not, `${path}/not`, selfId);
    else if ('fact' in c) checkFact(c.fact, `${path}/fact`);
    else if ('occurred' in c) {
      if (!events.has(c.occurred)) err(`${path}/occurred`, `unknown event "${c.occurred}"`);
      if (selfId && c.occurred === selfId) err(`${path}/occurred`, `event "${selfId}" requires its own occurrence (self-satisfying prerequisite)`);
    }
  };

  // predicates
  pack.predicates.forEach((p, i) => {
    if (p.allowed_values) {
      p.allowed_values.forEach((v, j) => {
        const tmp: PackPredicate = { ...p, allowed_values: undefined };
        checkValue(tmp, v, `/predicates/${i}/allowed_values/${j}`);
      });
    }
    (p.settled_values || []).forEach((v, j) => checkValue(p, v, `/predicates/${i}/settled_values/${j}`));
    if (p.settled_values && !p.transient) warn(`/predicates/${i}/settled_values`, `settled_values only apply to a transient predicate; set "transient": true or remove them`);
  });

  // entities
  const aliasOwners = new Map<string, string[]>();
  pack.entities.forEach((e, i) => {
    checkSources(e.source_refs, `/entities/${i}/source_refs`);
    for (const a of [e.name, ...e.aliases]) {
      const k = normalizeName(a);
      if (!k) continue;
      if (GENERIC_ALIASES.has(k) || k.length < 2 && !/[㐀-鿿]/.test(k)) warn(`/entities/${i}`, `generic or very short alias "${a}"`);
      const owners = aliasOwners.get(k) || [];
      if (!owners.includes(e.id)) owners.push(e.id);
      aliasOwners.set(k, owners);
    }
    if (TEMPORAL_CLAIM_RE.test(e.static_description)) warn(`/entities/${i}/static_description`, 'static description may contain a mutable/temporal claim; move it to facts/events');
  });
  for (const [k, owners] of aliasOwners) if (owners.length > 1) warn('/entities', `alias collision "${k}" shared by ${owners.join(', ')}; runtime will treat it as ambiguous`);

  // coverage / baseline
  const covStart = toTick(pack.coverage.start);
  const covEnd = toTick(pack.coverage.end);
  if (covEnd < covStart) err('/coverage', 'coverage.end precedes coverage.start');
  if (toTick(pack.initial_state.at) !== covStart) err('/initial_state/at', 'initial_state.at must equal coverage.start');
  const baseline = new Map<string, number>();
  pack.initial_state.facts.forEach((f, i) => {
    checkFact(f.fact, `/initial_state/facts/${i}/fact`);
    checkSources(f.source_refs, `/initial_state/facts/${i}/source_refs`);
    const key = `${f.fact.entity_id}|${f.fact.predicate}`;
    if (baseline.has(key)) err(`/initial_state/facts/${i}`, `baseline has more than one value for ${key} (first at index ${baseline.get(key)}); no last-entry-wins`);
    else baseline.set(key, i);
  });

  // events
  const arcOf = new Map<string, string>();
  pack.arcs.forEach((a, i) => {
    a.event_ids.forEach((eid, j) => {
      if (!events.has(eid)) err(`/arcs/${i}/event_ids/${j}`, `unknown event "${eid}"`);
      else {
        if (arcOf.has(eid) && arcOf.get(eid) !== a.id) err(`/arcs/${i}/event_ids/${j}`, `event "${eid}" listed in more than one arc`);
        arcOf.set(eid, a.id);
        if (events.get(eid)!.arc_id !== a.id) err(`/arcs/${i}/event_ids/${j}`, `event "${eid}" listed in arc "${a.id}" but its arc_id is ${JSON.stringify(events.get(eid)!.arc_id)}`);
      }
    });
  });
  let unknownCount = 0;
  const titles = new Map<string, string>();
  pack.events.forEach((ev, i) => {
    const P = `/events/${i}`;
    ev.entity_ids.forEach((x, j) => checkEntity(x, `${P}/entity_ids/${j}`));
    ev.location_ids.forEach((x, j) => {
      checkEntity(x, `${P}/location_ids/${j}`);
      const ent = entities.get(x);
      if (ent && ent.kind !== 'place') err(`${P}/location_ids/${j}`, `location "${x}" is not a place entity`);
    });
    if (ev.arc_id !== null) {
      if (!arcs.has(ev.arc_id)) err(`${P}/arc_id`, `unknown arc "${ev.arc_id}"`);
      else if (!arcs.get(ev.arc_id)!.event_ids.includes(ev.id)) err(`${P}/arc_id`, `arc "${ev.arc_id}" does not list event "${ev.id}"`);
    }
    checkSources(ev.source_refs, `${P}/source_refs`);
    ev.visibility.knower_ids.forEach((x, j) => checkEntity(x, `${P}/visibility/knower_ids/${j}`));
    checkCondition(ev.canonical_preconditions, `${P}/canonical_preconditions`, ev.id);
    ev.outcomes.forEach((f, j) => checkFact(f, `${P}/outcomes/${j}`));
    const writes = new Map<string, Effect>();
    ev.canonical_effects.forEach((ef, j) => {
      const key = ef.op === 'set' ? `${ef.fact.entity_id}|${ef.fact.predicate}` : `${ef.entity_id}|${ef.predicate}`;
      if (ef.op === 'set') checkFact(ef.fact, `${P}/canonical_effects/${j}/fact`);
      else {
        checkEntity(ef.entity_id, `${P}/canonical_effects/${j}/entity_id`);
        if (!predicates.has(ef.predicate)) err(`${P}/canonical_effects/${j}/predicate`, `unknown predicate "${ef.predicate}"`);
      }
      if (writes.has(key)) err(`${P}/canonical_effects/${j}`, `multiple writes to ${key} within one event`);
      writes.set(key, ef);
    });
    ev.outcomes.forEach((o, j) => {
      const w = writes.get(`${o.entity_id}|${o.predicate}`);
      if (!w || w.op !== 'set' || !valuesEqual(w.fact.value, o.value)) err(`${P}/outcomes/${j}`, `outcome ${o.entity_id}.${o.predicate}=${JSON.stringify(o.value)} has no matching final canonical set effect`);
    });
    // time
    const w = ev.when;
    if (w.precision === 'unknown') {
      unknownCount++;
      if (w.earliest !== null || w.latest !== null) err(`${P}/when`, 'unknown precision requires null bounds');
      if (w.basis !== 'unknown') err(`${P}/when/basis`, 'unknown-time events must use basis "unknown"');
      if (ev.classification === 'HARD') err(`${P}/when`, 'HARD events require finite resolved bounds');
    } else {
      if (!w.earliest || !w.latest) err(`${P}/when`, `precision "${w.precision}" requires finite bounds`);
      else {
        const lo = toTick(w.earliest), hi = toTick(w.latest);
        if (hi < lo) err(`${P}/when`, 'latest precedes earliest (reversed interval)');
        if (w.precision === 'minute' && lo !== hi) err(`${P}/when`, 'minute precision requires equal earliest/latest');
        if (w.precision === 'day' && (w.earliest.day !== w.latest.day || w.earliest.minute !== 0 || w.latest.minute !== 1439)) err(`${P}/when`, 'day precision must span one day from minute 0 through 1439');
        if (w.precision === 'range' && !(hi > lo)) err(`${P}/when`, 'range precision requires an interval wider than one minute');
        if (w.basis === 'unknown') err(`${P}/when/basis`, 'finite bounds cannot use basis "unknown"');
        if (lo <= covStart || hi > covEnd) err(`${P}/when`, `event bounds must lie within coverage and strictly after the initial baseline checkpoint`);
      }
    }
    if (ev.classification === 'HARD') {
      if (!ev.required_description || !ev.required_description.trim()) err(`${P}/required_description`, 'HARD requires a nonempty required_description');
      if (!ev.outcomes.length) err(`${P}/outcomes`, 'HARD requires at least one outcome');
    }
    const t = ev.title.trim().toLowerCase();
    if (titles.has(t)) warn(`${P}/title`, `duplicate event title also used by "${titles.get(t)}"`);
    titles.set(t, ev.id);
  });
  if (unknownCount > Math.max(5, pack.events.length / 3)) warn('/events', `${unknownCount} unknown-time events; they are background reference only`);

  // edges
  const precedes = new Map<string, string[]>();
  pack.edges.forEach((e, i) => {
    if (!events.has(e.from)) err(`/edges/${i}/from`, `unknown event "${e.from}"`);
    if (!events.has(e.to)) err(`/edges/${i}/to`, `unknown event "${e.to}"`);
    if (!e.note.trim()) err(`/edges/${i}/note`, 'edge note must explain the relation');
    checkSources(e.source_refs, `/edges/${i}/source_refs`);
    if (e.relation === 'precedes' && events.has(e.from) && events.has(e.to)) {
      precedes.set(e.from, [...(precedes.get(e.from) || []), e.to]);
      const a = whenToStoryTime(events.get(e.from)!.when);
      const b = whenToStoryTime(events.get(e.to)!.when);
      if (a && b && a.lo > b.hi) err(`/edges/${i}`, `precedence ${e.from} -> ${e.to} is temporally impossible`);
    }
  });
  // precedence cycle detection (only the precedes subgraph)
  const state = new Map<string, number>();
  const visit = (n: string, stack: string[]): void => {
    state.set(n, 1);
    for (const m of precedes.get(n) || []) {
      if (state.get(m) === 1) err('/edges', `precedence cycle: ${[...stack, n, m].join(' -> ')}`);
      else if (!state.get(m)) visit(m, [...stack, n]);
    }
    state.set(n, 2);
  };
  for (const n of precedes.keys()) if (!state.get(n)) visit(n, []);

  // forward canonical dependency (review flag)
  pack.events.forEach((ev, i) => {
    const me = whenToStoryTime(ev.when);
    const deps: string[] = [];
    const collect = (c: Condition) => {
      if ('all' in c) c.all.forEach(collect);
      else if ('any' in c) c.any.forEach(collect);
      else if ('not' in c) collect(c.not);
      else if ('occurred' in c) deps.push(c.occurred);
    };
    collect(ev.canonical_preconditions);
    for (const d of deps) {
      const de = events.get(d);
      const dt = de ? whenToStoryTime(de.when) : null;
      if (me && dt && dt.lo > me.hi) warn(`/events/${i}/canonical_preconditions`, `requires occurrence of later event "${d}" (forward dependency; review)`);
    }
  });

  // Temporary conditions nothing ends (review flag): an event sets a transient predicate (an injury, being
  // held, a whereabouts) and the entity takes part in later events while no event changes it again, so the
  // GM sees e.g. "hospitalized" for the rest of the timeline (live finding: 白井黑子 still 住院 when canon
  // has her fighting six days later).
  const timed = pack.events.map((ev, i) => ({ ev, i, t: whenToStoryTime(ev.when) })).filter((x) => x.t).sort((a, b) => a.t!.lo - b.t!.lo);
  const touches = (ef: Effect, ent: Id, pred: Id) => (ef.op === 'set' ? ef.fact.entity_id === ent && ef.fact.predicate === pred : ef.entity_id === ent && ef.predicate === pred);
  for (const a of timed) {
    a.ev.canonical_effects.forEach((ef, j) => {
      if (ef.op !== 'set') return;
      const p = predicates.get(ef.fact.predicate);
      if (!p?.transient || (p.settled_values || []).some((v) => valuesEqual(v, ef.fact.value))) return;
      const ent = ef.fact.entity_id;
      // A condition that a later event ends may rightly hold while the entity takes part in between
      // (someone ill during an escape); only one nothing ever ends is reported.
      const after = timed.filter((b) => b !== a && b.t!.lo > a.t!.lo);
      if (after.some((b) => b.ev.canonical_effects.some((x) => touches(x, ent, ef.fact.predicate)))) return;
      const later = after.filter((b) => b.t!.lo > a.t!.hi && b.ev.entity_ids.includes(ent)).map((b) => b.ev.id);
      if (later.length) warn(`/events/${a.i}/canonical_effects/${j}`, `temporary condition ${ent}.${ef.fact.predicate} = ${JSON.stringify(ef.fact.value)} is never ended by a later event, but ${ent} takes part in later events: ${later.slice(0, 5).join(', ')}${later.length > 5 ? ` (+${later.length - 5} more)` : ''}. Add an event or effect that ends it, or list the value in the predicate's settled_values if it lasts`);
    });
  }

  // Exact-checkpoint HARD contradictions
  const hard = pack.events.filter((e) => e.classification === 'HARD' && e.when.earliest && e.when.latest);
  for (let i = 0; i < hard.length; i++) {
    for (let j = i + 1; j < hard.length; j++) {
      const a = hard[i], b = hard[j];
      const ta = whenToStoryTime(a.when)!, tb = whenToStoryTime(b.when)!;
      if (!(ta.lo === ta.hi && tb.lo === tb.hi && ta.lo === tb.lo)) continue;
      for (const oa of a.outcomes) for (const ob of b.outcomes) {
        if (oa.entity_id === ob.entity_id && oa.predicate === ob.predicate && !valuesEqual(oa.value, ob.value)) {
          const linked = pack.edges.some((e) => e.relation === 'precedes' && ((e.from === a.id && e.to === b.id) || (e.from === b.id && e.to === a.id)));
          if (!linked) err('/events', `HARD events "${a.id}" and "${b.id}" require incompatible values for ${oa.entity_id}.${oa.predicate} at the same logical checkpoint`);
        }
      }
    }
  }
  if (!pack.events.some((e) => e.when.earliest)) warn('/coverage', 'coverage promises scheduled play but no finite-time events exist');
  return { errors: dedupeIssues(errors), warnings: dedupeIssues(warnings) };
}

function buildLoaded(pack: CanonPack, warnings: LintIssue[]): LoadedPack {
  const predicates = new Map(pack.predicates.map((p) => [p.id, p]));
  const entities = new Map(pack.entities.map((e) => [e.id, e]));
  const events = new Map(pack.events.map((e) => [e.id, e]));
  const timeIndex: LoadedPack['timeIndex'] = [];
  const unknownTimeEvents: Id[] = [];
  for (const ev of pack.events) {
    const st = whenToStoryTime(ev.when);
    if (st) timeIndex.push({ id: ev.id, lo: st.lo, hi: st.hi });
    else unknownTimeEvents.push(ev.id);
  }
  timeIndex.sort((a, b) => a.lo - b.lo || a.hi - b.hi || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edgesFrom = new Map<Id, CanonPack['edges']>();
  const edgesTo = new Map<Id, CanonPack['edges']>();
  for (const e of pack.edges) {
    edgesFrom.set(e.from, [...(edgesFrom.get(e.from) || []), e]);
    edgesTo.set(e.to, [...(edgesTo.get(e.to) || []), e]);
  }
  const aliasIndex = new Map<string, Id[]>();
  for (const e of pack.entities) {
    for (const a of [e.name, e.id, ...e.aliases]) {
      const k = normalizeName(a);
      if (!k) continue;
      const list = aliasIndex.get(k) || [];
      if (!list.includes(e.id)) list.push(e.id);
      aliasIndex.set(k, list);
    }
  }
  const eventTitleIndex = new Map<string, Id[]>();
  for (const e of pack.events) {
    for (const t of [e.title, e.id]) {
      const k = normalizeName(t);
      eventTitleIndex.set(k, [...(eventTitleIndex.get(k) || []), e.id]);
    }
  }
  // Hash is computed over a normalized copy so array order of entity sets does not matter.
  const normalized = deepClone(pack);
  const normFact = (f: Fact) => { f.value = normalizeValue(f.value); };
  normalized.initial_state.facts.forEach((f) => normFact(f.fact));
  normalized.events.forEach((e) => {
    e.outcomes.forEach(normFact);
    e.canonical_effects.forEach((ef) => { if (ef.op === 'set') normFact(ef.fact); });
  });
  return {
    pack,
    hash: hashObject(normalized),
    predicates,
    entities,
    events,
    timeIndex,
    unknownTimeEvents,
    hardEvents: pack.events.filter((e) => e.classification === 'HARD').map((e) => e.id),
    edgesFrom,
    edgesTo,
    aliasIndex,
    eventTitleIndex,
    coverage: { start: toTick(pack.coverage.start), end: toTick(pack.coverage.end) },
    warnings,
  };
}

/** Reload a pinned snapshot (already validated at bind time). Throws if it no longer validates. */
export function loadPinnedPack(pack: CanonPack): LoadedPack {
  const r = validatePack(pack);
  if (!r.ok || !r.loaded) throw new Error('Pinned pack snapshot failed validation: ' + r.errors.map((e) => `${e.path} ${e.message}`).join('; '));
  return r.loaded;
}

/**
 * Whether a model-reported value for a typed predicate can be compared deterministically with the
 * stored fact. Booleans, numbers and entity references can; strings only when the predicate has a
 * closed vocabulary that contains the claimed value. Free-text values ("正常运转" vs "active") are
 * paraphrases, not contradictions, and are left to the semantic reviewer.
 */
export function claimComparable(pack: LoadedPack, predicate: Id, value: unknown): boolean {
  const p = pack.predicates.get(predicate);
  if (!p) return false;
  if (p.value_type !== 'string') return true;
  return Array.isArray(p.allowed_values) && p.allowed_values.length > 0 && (p.allowed_values as unknown[]).includes(value);
}
