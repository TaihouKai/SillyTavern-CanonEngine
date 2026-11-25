// Actual-history retrieval (causal OR mentioned) and independent entity/scene state queries.
// Lookups never traverse the Hard graph and never depend on anchor relevance.
import type { AddressChange, FactValue, Id, Occurrence, RelationChange, RelationStage, RelationView, StoryTime } from './types';
import type { LoadedPack } from './pack';
import { normalizeName, pairKey } from './pack';
import type { Checkpoint, OccurrenceEntry, WorldState } from './reducer';
import { factAt, factKey, factHistory } from './reducer';
import { formatStoryTime, formatTick, occurrenceTime } from './time';
import { deltaText } from './delta';
import { mergeAddress } from './address';
import { NAMED_KINDS, nameKey, namesAt, type NameDenied, type NameNow } from './names';
import type { NameBinding } from './types';

/** A relation in force (WorldIndex.relationNow): the whole of it, as this game has it now. source: where its last
 *  change came from (pack: the original story's own stage, nothing in this game changed the pair). */
export interface RelationNow {
  people: [Id, Id]; bond: string; views: RelationView[]; together?: string; ended?: boolean;
  since: number | null; source: 'pack' | RelationChange['source'];
}

/** A relation as it stands: what the changes are merged into. */
export interface RelationBody { bond: string; views: RelationView[]; together?: string; ended?: boolean }

/** A change merged into the relation it changes, part by part: what the change gives replaces that part, what it
 *  leaves out stays (the other side, how they are together); the forms of address are merged form by form
 *  (mergeAddress). The Persona and the user in the panel say the whole relation (it replaces the one there); removed
 *  takes the relation out. */
export function mergeRelation(base: RelationBody | null, c: Pick<RelationChange, 'bond' | 'views' | 'together' | 'ended' | 'removed' | 'source'>): RelationBody | null {
  if (c.removed) return null;
  if (c.source === 'persona' || c.source === 'ui' || !base) {
    const views = c.views.map((v) => { const address = mergeAddress([], v.address); return { who: v.who, ...(address.length ? { address } : {}), sees: v.sees }; });
    return { bond: c.bond, views, ...(c.together ? { together: c.together } : {}), ...(c.ended ? { ended: true } : {}) };
  }
  const views: RelationView[] = base.views.map((v) => ({ ...v }));
  for (const v of c.views) {
    const i = views.findIndex((x) => x.who === v.who);
    const address = mergeAddress(views[i]?.address, v.address);
    const merged = { who: v.who, ...(address.length ? { address } : {}), sees: v.sees || views[i]?.sees || '' };
    if (i < 0) views.push(merged); else views[i] = merged;
  }
  const together = c.together || base.together;
  return { bond: c.bond || base.bond, views, ...(together ? { together } : {}), ...(c.ended ? { ended: true } : {}) };
}

/** A pair whose relation a settled event of the pack changes and the game has to work out (the original story's
 *  stage does not simply follow): the event went differently, or this game had already changed the pair, or an
 *  earlier change of the original story did not come about. change: what the original story changes there; address:
 *  how its forms of address change there (addressDelta). */
export interface RelationDue { people: [Id, Id]; eventId: Id; eventRecordId: string; change: string; address: { who: Id; address: AddressChange[] }[]; now: RelationBody | null }

/** How the forms of address change from one stage of the original story to the next (prev null: they meet — every
 *  form of the stage): each side's forms that are new or used otherwise, and the ones no longer used (dropped). */
export function addressDelta(prev: RelationStage | null, next: RelationStage): { who: Id; address: AddressChange[] }[] {
  const k = (t: string) => normalizeName(t);
  return next.views.map((v) => {
    const old = prev?.views.find((x) => x.who === v.who)?.address || [];
    const now = v.address || [];
    const changed: AddressChange[] = now.filter((f) => !old.some((o) => k(o.term) === k(f.term) && o.use === f.use && (o.when || '') === (f.when || '')));
    const dropped: AddressChange[] = old.filter((o) => !now.some((f) => k(f.term) === k(o.term))).map((o) => ({ term: o.term, use: 'dropped' }));
    return { who: v.who, address: [...changed, ...dropped] };
  }).filter((x) => x.address.length);
}

/** The player character's entity ids (integration.ts buildProfile names them so). */
export const PLAYER_PREFIX = 'rt.player.';

export interface ResolvedRef {
  phrase: string;
  entityIds: Id[];
  occurrenceIds: string[];
  packEventIds: Id[];
  ambiguous: boolean;
  status: 'resolved' | 'ambiguous' | 'new' | 'unresolved';
}

export interface HistoryRecordView {
  occurrenceId: string;
  title: string;
  status: 'occurred';
  account: string;
  time: string;
  timeTicks: StoryTime;
  origin: string;
  actors: string[];
  affected: string[];
  locations: string[];
  outcome: string[];
  causes: { occurrenceId: string; title: string }[];
  consequences: { occurrenceId: string; title: string }[];
  laterChanges: string[];
  visibility: string;
  evidence: { messageId: string; quote: string }[];
  packEventId?: Id;
}

export interface CanonStatusView {
  packEventId: Id;
  title: string;
  classification: string;
  status: 'occurred' | 'diverged' | 'omitted' | 'pending' | 'future' | 'unresolved' | 'unscheduled';
  note: string;
}

export interface EntityStateView {
  entityId: Id;
  name: string;
  kind: string;
  facts: { predicate: Id; value: FactValue; display: string; since: string; supportRecordId?: string; support: string }[];
  unknown: Id[];
  uncertain: string[];
  parents: { predicate: Id; parentId: Id; parentName: string; parentFacts: string[] }[];
  historyOccurrenceIds: string[];
}

const CONTAINMENT_RE = /(located|location|parent|part.?of|within|inside|contain|district|area|region|位于|所在|属于|内)/i;

function tokens(text: string): string[] {
  const s = String(text || '').normalize('NFKC').toLowerCase();
  const out: string[] = [];
  for (const w of s.match(/[a-z0-9]+/g) || []) if (w.length > 1 && !STOP.has(w)) out.push(w);
  const cjk = s.replace(/[^㐀-鿿぀-ヿ]/g, ' ');
  for (const seg of cjk.split(/\s+/)) {
    if (!seg) continue;
    if (seg.length === 1) out.push(seg);
    for (let i = 0; i + 1 < seg.length; i++) out.push(seg.slice(i, i + 2));
  }
  return out;
}
const STOP = new Set(['the', 'a', 'an', 'of', 'to', 'and', 'or', 'in', 'on', 'at', 'by', 'for', 'with', 'is', 'was', 'were', 'be', 'it', 'that', 'this', 'as', 'from', 'his', 'her', 'their', 'you', 'your', 'i', 'my', 'me', 'we', 'our']);

/** Longest entity description given to an analysis step (pack descriptions are one sentence). */
export const ENTITY_NOTE_CHARS = 160;

export class WorldIndex {
  /** Display origin (calendar date of day 0) of the active binding; affects labels only. */
  static displayOrigin: { y: number; m: number; d: number } | null = null;
  readonly pack: LoadedPack;
  readonly state: WorldState;
  private byEntity = new Map<Id, Set<string>>();
  private reverseCauses = new Map<string, Set<string>>();
  private phraseIndex = new Map<string, Set<string>>();
  private docTokens = new Map<string, Map<string, number>>();
  private df = new Map<string, number>();
  private runtimeAlias = new Map<string, Id[]>();
  /** The player character (the latest Persona read's), or null before one. */
  readonly playerId: Id | null;
  private names: { now: Map<string, NameNow>; denied: Map<string, NameDenied> };

  constructor(pack: LoadedPack, state: WorldState) {
    this.pack = pack;
    this.state = state;
    for (const o of state.occurrences.values()) this.indexOccurrence(o);
    for (const re of state.runtimeEntities.values()) {
      for (const a of [re.name, re.id, ...re.aliases]) {
        const k = normalizeName(a);
        if (!k) continue;
        this.runtimeAlias.set(k, [...(this.runtimeAlias.get(k) || []), re.id]);
      }
    }
    const seed = [...state.records].reverse().find((r) => r.kind === 'persona_seed' && (r.runtimeEntities || []).some((e) => e.id.startsWith(PLAYER_PREFIX)));
    this.playerId = seed ? seed.runtimeEntities!.find((e) => e.id.startsWith(PLAYER_PREFIX))!.id : null;
    this.names = namesAt(this.namedOnly(), state.clock.lo);
  }

  /** The 称呼 entries of the kinds the table holds (names.ts NAMED_KINDS). */
  private namedOnly() {
    return (this.state.names || []).filter((n) => NAMED_KINDS.has(this.entityKind(n.id)));
  }

  private indexOccurrence(o: OccurrenceEntry) {
    for (const e of [...o.actors, ...o.affected, ...o.locations]) {
      if (!this.byEntity.has(e)) this.byEntity.set(e, new Set());
      this.byEntity.get(e)!.add(o.occurrenceId);
    }
    for (const c of o.causes) {
      if (!this.reverseCauses.has(c)) this.reverseCauses.set(c, new Set());
      this.reverseCauses.get(c)!.add(o.occurrenceId);
    }
    for (const p of [o.title, ...o.refPhrases]) {
      const k = normalizeName(p);
      if (!k) continue;
      if (!this.phraseIndex.has(k)) this.phraseIndex.set(k, new Set());
      this.phraseIndex.get(k)!.add(o.occurrenceId);
    }
    const names = [...o.actors, ...o.affected, ...o.locations].map((id) => this.allNames(id).join(' ')).join(' ');
    const tf = new Map<string, number>();
    for (const t of tokens(`${o.title} ${o.account} ${o.refPhrases.join(' ')} ${names}`)) tf.set(t, (tf.get(t) || 0) + 1);
    this.docTokens.set(o.occurrenceId, tf);
    for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  entityName(id: Id): string {
    return this.pack.entities.get(id)?.name || this.state.runtimeEntities.get(id)?.name || id;
  }

  /** The short description of an entity (the pack's static description, or a runtime entity's), for analysis
   *  inputs; '' when there is none. */
  entityNote(id: Id): string {
    const d = this.pack.entities.get(id)?.static_description ?? this.state.runtimeEntities.get(id)?.description ?? '';
    const t = String(d).replace(/\s+/g, ' ').trim();
    return t.length > ENTITY_NOTE_CHARS ? `${t.slice(0, ENTITY_NOTE_CHARS - 1)}…` : t;
  }

  allNames(id: Id): string[] {
    const e = this.pack.entities.get(id);
    if (e) return [e.name, ...e.aliases];
    const r = this.state.runtimeEntities.get(id);
    return r ? [r.name, ...r.aliases] : [id];
  }

  /** How far a pair follows the original story's stages in this branch (records before sequence `beforeSeq` only;
   *  none: all): the stages in order, each once its from_event has occurred (the first, from_event null, from the
   *  start). An event of a stage that went differently or did not happen breaks the line: the original stages after
   *  it no longer simply follow (broken). index -1: no stage reached. */
  private canonLine(k: string, beforeSeq = Infinity): { index: number; since: number | null; broken: boolean } {
    const r = this.pack.relations.get(k);
    let index = -1, since: number | null = null;
    if (!r) return { index, since, broken: false };
    for (let i = 0; i < r.stages.length; i++) {
      const s = r.stages[i];
      if (s.from_event === null) { if (i === 0) index = 0; continue; }
      const d = this.state.dispositions.get(s.from_event);
      if (!d || d.seq >= beforeSeq) continue;
      if (d.disposition !== 'occurred') return { index, since, broken: true };
      index = i; since = d.tick;
    }
    return { index, since, broken: false };
  }

  /** This game's changes of a pair, in record order (one that answered an event whose result was since replaced is
   *  no longer one). */
  private relationChanges(k: string) {
    return this.state.relations.filter((c) => pairKey(c.people[0], c.people[1]) === k
      && (!c.event || this.state.dispositions.get(c.event)?.recordId === c.eventRecord));
  }

  /** The relation in force between two people in this branch. It starts as the original story has it (the pack's
   *  stages, as far as they follow here: canonLine) and, from this game's first change of the pair on, is that stage
   *  with each change merged into it (mergeRelation) — the original stages after that no longer apply by themselves
   *  (what an event of theirs does to the pair is worked out then: relationsDue). null: they do not know each other.
   *  since: the story time of the last change (null: the story start). */
  relationNow(a: Id, b: Id): RelationNow | null {
    const k = pairKey(a, b);
    const r = this.pack.relations.get(k);
    const stage = (i: number): RelationBody | null => (r && i >= 0 ? { bond: r.stages[i].bond, views: r.stages[i].views, ...(r.stages[i].together ? { together: r.stages[i].together } : {}) } : null);
    const changes = this.relationChanges(k);
    if (!changes.length) {
      const line = this.canonLine(k);
      const body = stage(line.index);
      return body ? { people: r!.people, ...body, since: line.since, source: 'pack' } : null;
    }
    const line = this.canonLine(k, changes[0].seq);
    let body = stage(line.index);
    for (const c of changes) body = mergeRelation(body, c);
    const last = changes[changes.length - 1];
    return body ? { people: r?.people || last.people, ...body, since: last.tick, source: last.source } : null;
  }

  /** The pairs whose relation these settled events of the pack change in a way this game has to work out: an event
   *  where a pair's original stage starts went differently, or it happened but the pair no longer follows the original
   *  stages (this game changed them, or an earlier stage's event went otherwise). Where the pair still follows them,
   *  the stage simply holds (relationNow); an event that did not happen changes nothing. */
  relationsDue(eventIds: Iterable<Id>): RelationDue[] {
    const out: RelationDue[] = [];
    for (const e of new Set(eventIds)) {
      const d = this.state.dispositions.get(e);
      if (!d || d.disposition === 'omitted') continue;
      for (const k of this.pack.relationsAt.get(e) || []) {
        const r = this.pack.relations.get(k)!;
        const i = r.stages.findIndex((s) => s.from_event === e);
        const changes = this.relationChanges(k);
        if (changes.some((c) => c.event === e)) continue;
        if (d.disposition === 'occurred' && !changes.length && !this.canonLine(k).broken) continue;
        const now = this.relationNow(r.people[0], r.people[1]);
        const s = r.stages[i];
        out.push({ people: r.people, eventId: e, eventRecordId: d.recordId, change: s.why?.trim() || `they come to know each other: ${s.bond}`, address: addressDelta(i > 0 ? r.stages[i - 1] : null, s), now: now ? { bond: now.bond, views: now.views, ...(now.together ? { together: now.together } : {}), ...(now.ended ? { ended: true } : {}) } : null });
      }
    }
    return out;
  }

  /** Everyone someone has a relation with now (pack pairs and the changes play made), by id. */
  relationsOf(id: Id): { other: Id; rel: RelationNow }[] {
    const others = new Set<Id>();
    for (const k of this.pack.relationsOf.get(id) || []) { const [x, y] = k.split('|'); others.add(x === id ? y : x); }
    for (const c of this.state.relations) if (c.people.includes(id)) others.add(c.people[0] === id ? c.people[1] : c.people[0]);
    return [...others].map((other) => ({ other, rel: this.relationNow(id, other) })).filter((x): x is { other: Id; rel: RelationNow } => !!x.rel);
  }

  entityExists(id: Id): boolean {
    return this.pack.entities.has(id) || this.state.runtimeEntities.has(id);
  }

  entityKind(id: Id): string {
    return this.pack.entities.get(id)?.kind || this.state.runtimeEntities.get(id)?.kind || 'other';
  }

  /** Exact identity resolution through names/aliases/ids; collisions are reported as ambiguous. */
  resolveEntity(phrase: string): { ids: Id[]; ambiguous: boolean } {
    const k = normalizeName(phrase);
    const ids = [...new Set([...(this.pack.aliasIndex.get(k) || []), ...(this.runtimeAlias.get(k) || [])])];
    if (ids.length) return { ids, ambiguous: ids.length > 1 };
    // containment match on names (e.g. "the Old Market's stalls" -> old-market)
    const hits: Id[] = [];
    const all = [...this.pack.entities.values()].map((e) => ({ id: e.id, names: [e.name, ...e.aliases] }))
      .concat([...this.state.runtimeEntities.values()].map((e) => ({ id: e.id, names: [e.name, ...e.aliases] })));
    for (const e of all) {
      if (e.names.some((n) => { const nn = normalizeName(n); return nn.length >= 2 && (k.includes(nn) || (k.length >= 3 && nn.includes(k))); })) hits.push(e.id);
    }
    return { ids: hits, ambiguous: hits.length > 1 };
  }

  /** Find entity mentions inside free text (deterministic name/alias scan, and the words of 称呼 in force). A mention
   *  by a name the player character shares with someone (playerByName) is the player character. */
  scanEntities(text: string): { id: Id; phrase: string }[] {
    const norm = normalizeName(text);
    const found = new Map<Id, string>();
    const consider = (id: Id, names: string[]) => {
      for (const n of names) {
        const nn = normalizeName(n);
        if (nn.length >= 2 && norm.includes(nn)) { const to = this.playerByName(id, norm) ? this.playerId! : id; if (!found.has(to)) found.set(to, n); return; }
      }
    };
    for (const e of this.pack.entities.values()) consider(e.id, [e.name, ...e.aliases]);
    for (const e of this.state.runtimeEntities.values()) consider(e.id, [e.name, ...e.aliases]);
    for (const n of this.names.now.values()) if (n.key.length >= 2 && norm.includes(n.key) && this.entityExists(n.id) && !found.has(n.id)) found.set(n.id, n.words);
    return [...found].map(([id, phrase]) => ({ id, phrase }));
  }

  /** 称呼 as they stand at a story time (now, or later: a text that moves time on). */
  private namesTable(at?: number): { now: Map<string, NameNow>; denied: Map<string, NameDenied> } {
    if (at === undefined || at <= this.state.clock.lo) return this.names;
    if (this.namesLater?.at !== at) this.namesLater = { at, table: namesAt(this.namedOnly(), at) };
    return this.namesLater.table;
  }
  private namesLater: { at: number; table: { now: Map<string, NameNow>; denied: Map<string, NameDenied> } } | null = null;

  /** 称呼 in force now (names.ts): whom words of the story mean, the newest first. */
  namesNow(): NameNow[] {
    return [...this.names.now.values()].sort((a, b) => b.last - a.last);
  }

  /** The words the player said are not someone (and the text may not give them back). */
  namesDenied(): NameDenied[] {
    return [...this.names.denied.values()];
  }

  /** Whether the words are a name of theirs (as written: their name or an alias). */
  isNameOf(words: string, id: Id): boolean {
    const k = normalizeName(words);
    return !!k && this.allNames(id).some((n) => normalizeName(n) === k);
  }

  /** Whether the player said these words are not this one. */
  nameDenied(words: string, id: Id): boolean {
    return this.names.denied.has(`${nameKey(words)}|${id}`);
  }

  /** Whether a name of someone is one the player character shares (神光爱丽丝 and 爱丽丝·异典 are both 「爱丽丝」) and the
   *  text names them by none of their own: then the text means the player character (live: 「爱丽丝低头看了看手里的
   *  枪」 was filed on 爱丽丝·异典). text: normalized. */
  playerByName(id: Id, text: string): boolean {
    const p = this.playerId;
    if (!p || id === p || !this.entityExists(p)) return false;
    const parts = (n: string) => [n, ...n.split(/[·・\s]/)].map(normalizeName).filter((k) => k.length >= 2);
    const mine = new Set(this.allNames(p).flatMap(parts));
    const theirs = this.allNames(id).flatMap(parts);
    return theirs.some((k) => mine.has(k)) && !theirs.some((k) => !mine.has(k) && text.includes(k));
  }

  /** Whom some words of the story mean: the one place a step looks them up (an id, a reference, a name a model wrote).
   *  - an id is itself (a runtime id cut short, the one it starts);
   *  - words of 称呼 in force (this turn's own first: `extra`, what the steps before found in the same text) are whom
   *    they were found to mean;
   *  - else by name (resolveEntity; exact: names only, no containment), leaving out whom the player said the words are
   *    not, and with a name the player character shares read as the player character (playerByName, on the text the
   *    words are from and the words themselves).
   *  kind: only entities of that kind. readIds: an id a model gave for words of the text is read like a name (one of
   *  someone who shares a name with the player character, which the text does not name them by, is the player
   *  character): for the analysis of a text, never for a closed list of ids. at: the story time the text is at, when
   *  later than now (a reply or message that moves time on: words of the table unused since then are over). More than
   *  one id: the words fit several. */
  whoIs(words: unknown, o: { text?: string; extra?: readonly NameBinding[]; exact?: boolean; kind?: string; readIds?: boolean; at?: number } = {}): Id[] {
    const w = String(words ?? '').trim();
    if (!w) return [];
    const fit = (id: Id) => !o.kind || this.entityKind(id) === o.kind;
    if (this.entityExists(w)) { const id = o.readIds && this.playerByName(w, normalizeName(o.text || '')) ? this.playerId! : w; return fit(id) ? [id] : []; }
    if (/^rt\.\S{6,}$/.test(w)) {
      const cut = [...this.state.runtimeEntities.keys()].filter((id) => id.startsWith(w));
      if (cut.length === 1) return fit(cut[0]) ? cut : [];
    }
    const k = normalizeName(w);
    if (!k) return [];
    const table = this.namesTable(o.at);
    const extra = (o.extra || []).filter((n) => !n.removed && nameKey(n.words) === k && !table.denied.has(`${k}|${n.id}`));
    const bound = table.now.get(k);
    const byWords = bound?.source === 'ui' ? bound.id : extra.length ? extra[extra.length - 1].id : bound?.id;
    if (byWords) return fit(byWords) ? [byWords] : [];
    const plain = normalizeName(`${o.text || ''} ${w}`);
    const named = o.exact ? [...new Set([...(this.pack.aliasIndex.get(k) || []), ...(this.runtimeAlias.get(k) || [])])] : this.resolveEntity(w).ids;
    const notPlayer = !!this.playerId && table.denied.has(`${k}|${this.playerId}`);
    const ids = [...new Set(named.map((id) => (!notPlayer && this.playerByName(id, plain) ? this.playerId! : id)))];
    return ids.filter((id) => fit(id) && !table.denied.has(`${k}|${id}`));
  }

  /** The one entity the words mean, or null (none, or several). */
  whoOne(words: unknown, o: Parameters<WorldIndex['whoIs']>[1] = {}): Id | null {
    const ids = this.whoIs(words, o);
    return ids.length === 1 ? ids[0] : null;
  }

  /** Lexical-semantic candidate search over occurrence accounts/evidence (CJK bigrams + words, IDF). */
  semanticSearch(text: string, k = 5, minScore = 1.2): { occurrenceId: string; score: number }[] {
    const q = new Set(tokens(text));
    const N = Math.max(1, this.docTokens.size);
    const scores: { occurrenceId: string; score: number }[] = [];
    for (const [id, tf] of this.docTokens) {
      let s = 0;
      for (const t of q) if (tf.has(t)) s += Math.log(1 + N / (this.df.get(t) || 1));
      if (s >= minScore) scores.push({ occurrenceId: id, score: s });
    }
    return scores.sort((a, b) => b.score - a.score).slice(0, k);
  }

  resolveEventPhrase(phrase: string): { occurrenceIds: string[]; packEventIds: Id[] } {
    const k = normalizeName(phrase);
    const occ = new Set(this.phraseIndex.get(k) || []);
    const packEventIds = [...(this.pack.eventTitleIndex.get(k) || [])];
    if (!occ.size) for (const h of this.semanticSearch(phrase, 3, 2.0)) occ.add(h.occurrenceId);
    for (const pe of packEventIds) for (const o of this.state.occurrences.values()) if (o.packEventId === pe) occ.add(o.occurrenceId);
    return { occurrenceIds: [...occ], packEventIds };
  }

  occurrencesForEntity(id: Id): string[] {
    return [...(this.byEntity.get(id) || [])];
  }

  /** Transitive supported causes (and optionally consequences) of the given occurrences. */
  causalClosure(ids: string[], { consequences = false, maxNodes = 200, maxDepth = Infinity } = {}): string[] {
    // breadth-first, so a depth limit keeps the nearest causes
    const seen = new Set<string>();
    let level = [...ids];
    for (let depth = 0; level.length && seen.size < maxNodes && depth <= maxDepth; depth++) {
      const next: string[] = [];
      for (const id of level) {
        if (seen.has(id) || seen.size >= maxNodes) continue;
        seen.add(id);
        const o = this.state.occurrences.get(id);
        if (!o) continue;
        for (const c of o.causes) if (!seen.has(c)) next.push(c);
        if (consequences) for (const c of this.reverseCauses.get(id) || []) if (!seen.has(c)) next.push(c);
      }
      level = next;
    }
    return [...seen];
  }

  /** Records that established the current values of an entity's facts (state-support causal history). */
  supportingOccurrences(entityId: Id, cp?: Checkpoint): string[] {
    const out = new Set<string>();
    for (const k of this.state.facts.keys()) {
      if (!k.startsWith(entityId + '|')) continue;
      const pred = k.slice(entityId.length + 1);
      const f = factAt(this.state, entityId, pred, cp);
      if (!f.supportRecordId) continue;
      const rec = this.state.recordById.get(f.supportRecordId);
      for (const oid of rec?.eventOccurrenceIds || []) out.add(oid);
    }
    return [...out];
  }

  historyView(id: string, origin: { y: number; m: number; d: number } | null = WorldIndex.displayOrigin): HistoryRecordView | null {
    const o = this.state.occurrences.get(id);
    if (!o) return null;
    const rec = this.state.recordById.get(o.recordId);
    const later: string[] = [];
    // Only the latest change per fact (plus how many came before it): a frequently changing fact such as
    // a location would otherwise repeat its whole movement log on every record that once set it.
    for (const d of o.outcome) {
      const after = factHistory(this.state, d.entity_id, d.predicate).filter((t) => t.seq > o.seq);
      const t = after[after.length - 1];
      if (!t) continue;
      const r = this.state.recordById.get(t.recordId);
      const earlier = after.length > 1 ? ` [after ${after.length - 1} earlier change${after.length > 2 ? 's' : ''}]` : '';
      later.push(`${this.entityName(d.entity_id)}.${d.predicate} -> ${t.op === 'set' ? JSON.stringify(t.value) : 'UNKNOWN'} at ${formatTick(t.tick, origin)} (${r?.summary || t.recordId})${earlier}`);
    }
    return {
      occurrenceId: o.occurrenceId,
      title: o.title,
      status: 'occurred',
      account: o.account,
      time: occurrenceTime(o, origin),
      timeTicks: o.time,
      origin: o.origin,
      actors: o.actors.map((x) => this.entityName(x)),
      affected: o.affected.map((x) => this.entityName(x)),
      locations: o.locations.map((x) => this.entityName(x)),
      outcome: o.outcome.map((d) => deltaText(d, (x) => (this.entityExists(x) ? this.entityName(x) : x))),
      causes: o.causes.map((c) => ({ occurrenceId: c, title: this.state.occurrences.get(c)?.title || c })),
      consequences: [...(this.reverseCauses.get(id) || [])].map((c) => ({ occurrenceId: c, title: this.state.occurrences.get(c)?.title || c })),
      laterChanges: later,
      visibility: o.visibility.mode + (o.visibility.knower_ids.length ? ` (known to: ${o.visibility.knower_ids.map((x) => this.entityName(x)).join(', ')})` : ''),
      evidence: (rec?.sourceRefs || []).flatMap((s) => s.spans.map((sp) => ({ messageId: s.messageId, quote: sp.quote }))),
      packEventId: o.packEventId,
    };
  }

  /** Beats that show a canonical event under way without settling its result. */
  inProgressBeats(eventId: Id): Occurrence[] {
    if (this.state.dispositions.has(eventId)) return [];
    return [...this.state.occurrences.values()].filter((o) => o.inProgressOf === eventId).sort((a, b) => a.time.lo - b.time.lo);
  }

  /** After story: later developments of a settled event that its result does not include yet (重新分析 merges them). */
  afterStory(eventId: Id): Occurrence[] {
    const d = this.state.dispositions.get(eventId);
    if (!d) return [];
    const merged = new Set((d.occurrenceId && this.state.occurrences.get(d.occurrenceId)?.linkedFrom) || []);
    return [...this.state.occurrences.values()].filter((o) => o.afterOf === eventId && !merged.has(o.occurrenceId)).sort((a, b) => a.time.lo - b.time.lo);
  }

  canonStatus(eventId: Id, nowTick: number): CanonStatusView | null {
    const ev = this.pack.events.get(eventId);
    if (!ev) return null;
    const d = this.state.dispositions.get(eventId);
    const t = this.pack.timeIndex.find((x) => x.id === eventId);
    let status: CanonStatusView['status'];
    let note = '';
    if (d) {
      status = d.disposition;
      note = d.reason || '';
      const after = this.afterStory(eventId);
      if (after.length) note = `${note}${note ? '; ' : ''}after story (later developments): ${after.map((o) => o.title).join('; ')}`.slice(0, 600);
    } else if (!t) {
      status = 'unscheduled';
      note = 'unknown-time background reference; never automatically scheduled or treated as accomplished';
    } else if (t.lo > nowTick) {
      status = 'future';
      note = 'not yet due; NOT accomplished history';
    } else if (t.hi >= nowTick) {
      status = 'pending';
      const beats = this.inProgressBeats(eventId);
      note = beats.length ? `UNDER WAY in this branch (${beats.map((o) => o.title).join('; ')}); its result is not settled yet` : 'window open; not yet occurred in this branch';
    } else {
      status = 'unresolved';
      note = 'window passed without a recorded disposition; it is closed from actual play at the next story-time advance';
    }
    return { packEventId: eventId, title: ev.title, classification: ev.classification, status, note };
  }

  entityState(entityId: Id, cp?: Checkpoint, depth = 0): EntityStateView {
    const facts: EntityStateView['facts'] = [];
    const uncertain: string[] = [];
    const seenPreds = new Set<string>();
    for (const k of this.state.facts.keys()) {
      if (!k.startsWith(entityId + '|')) continue;
      const pred = k.slice(entityId.length + 1);
      seenPreds.add(pred);
      const f = factAt(this.state, entityId, pred, cp);
      for (const u of f.uncertain) uncertain.push(`${pred} may change to ${JSON.stringify(u.value)} within ${formatTick(u.tick, WorldIndex.displayOrigin)}–${formatTick(u.tickHi, WorldIndex.displayOrigin)}`);
      if (!f.known) continue;
      const rec = f.supportRecordId ? this.state.recordById.get(f.supportRecordId) : undefined;
      facts.push({
        predicate: pred,
        value: f.value!,
        display: Array.isArray(f.value) ? f.value.map((x) => this.entityName(x)).join(', ') : this.pack.predicates.get(pred)?.value_type === 'entity_ref' ? this.entityName(String(f.value)) : String(f.value),
        since: formatTick(f.validFrom!, WorldIndex.displayOrigin),
        supportRecordId: f.supportRecordId,
        support: rec ? rec.summary : '',
      });
    }
    // Relevant predicates with no established value stay explicit UNKNOWN.
    const unknown: Id[] = [];
    const kind = this.entityKind(entityId);
    for (const p of this.pack.predicates.values()) {
      if (seenPreds.has(p.id)) continue;
      if (this.predicateRelevantForKind(p.id, kind)) unknown.push(p.id);
    }
    const parents: EntityStateView['parents'] = [];
    if (depth < 3) {
      for (const f of facts) {
        const pd = this.pack.predicates.get(f.predicate);
        if (pd?.value_type === 'entity_ref' && CONTAINMENT_RE.test(pd.id + ' ' + pd.description) && typeof f.value === 'string' && this.entityExists(f.value)) {
          const ps = this.entityState(f.value, cp, depth + 1);
          parents.push({ predicate: f.predicate, parentId: f.value, parentName: ps.name, parentFacts: ps.facts.map((x) => `${x.predicate}=${x.display}`) });
        }
      }
    }
    return {
      entityId,
      name: this.entityName(entityId),
      kind,
      facts,
      unknown,
      uncertain,
      parents,
      historyOccurrenceIds: this.occurrencesForEntity(entityId),
    };
  }

  private predicateRelevantForKind(pred: Id, kind: string): boolean {
    // Predicates used anywhere for entities of the same kind are relevant to this entity.
    for (const [k] of this.state.facts) {
      const ent = k.slice(0, k.indexOf('|'));
      const p = k.slice(k.indexOf('|') + 1);
      if (p === pred && this.entityKind(ent) === kind) return true;
    }
    return false;
  }

  factKeyExists(entity: Id, predicate: Id): boolean {
    return this.state.facts.has(factKey(entity, predicate));
  }
}
