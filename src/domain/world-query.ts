// Actual-history retrieval (causal OR mentioned) and independent entity/scene state queries.
// Lookups never traverse the Hard graph and never depend on anchor relevance.
import type { FactValue, Id, Occurrence, StoryTime } from './types';
import type { LoadedPack } from './pack';
import { normalizeName } from './pack';
import type { Checkpoint, OccurrenceEntry, WorldState } from './reducer';
import { factAt, factKey, factHistory } from './reducer';
import { formatStoryTime, formatTick } from './time';

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

  allNames(id: Id): string[] {
    const e = this.pack.entities.get(id);
    if (e) return [e.name, ...e.aliases];
    const r = this.state.runtimeEntities.get(id);
    return r ? [r.name, ...r.aliases] : [id];
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

  /** Find entity mentions inside free text (deterministic name/alias scan). */
  scanEntities(text: string): { id: Id; phrase: string }[] {
    const norm = normalizeName(text);
    const found = new Map<Id, string>();
    const consider = (id: Id, names: string[]) => {
      for (const n of names) {
        const nn = normalizeName(n);
        if (nn.length >= 2 && norm.includes(nn)) { found.set(id, n); return; }
      }
    };
    for (const e of this.pack.entities.values()) consider(e.id, [e.name, ...e.aliases]);
    for (const e of this.state.runtimeEntities.values()) consider(e.id, [e.name, ...e.aliases]);
    return [...found].map(([id, phrase]) => ({ id, phrase }));
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
      time: formatStoryTime(o.time, origin),
      timeTicks: o.time,
      origin: o.origin,
      actors: o.actors.map((x) => this.entityName(x)),
      affected: o.affected.map((x) => this.entityName(x)),
      locations: o.locations.map((x) => this.entityName(x)),
      outcome: o.outcome.map((d) => (d.op === 'set' ? `${this.entityName(d.entity_id)}.${d.predicate}=${JSON.stringify(d.value)}` : `${this.entityName(d.entity_id)}.${d.predicate} unset`)),
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
      note = 'window passed without a recorded disposition';
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
