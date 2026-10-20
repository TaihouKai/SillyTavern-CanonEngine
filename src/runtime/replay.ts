// Deterministic replay of the selected transcript over the pinned pack + binding seed.
// Unchanged, still-valid prefixes replay without model calls.
import type { LoadedPack } from '../domain/pack';
import { claimComparable, valuesEqual, coerceClaimValue } from '../domain/pack';
import type { LedgerRecord } from '../domain/types';
import type { WorldState } from '../domain/reducer';
import { applyRecord, emptyState, evalCondition, factAt, triLabel } from '../domain/reducer';
import { hashObject, quoteInText, sha256 } from '../domain/util';
import type { Interpretation, ManualRecord, RecordDraft, SourceEntry } from './types';

export const baseKey = (e: { messageId: string; variantId: string; contentHash: string }) => `${e.messageId}:${e.variantId}:${e.contentHash}`;

export interface InterpretationStore {
  [baseKey: string]: Interpretation[] | Interpretation;
}

export function interpretationsFor(store: Record<string, unknown>, key: string): Interpretation[] {
  const v = store[key] as Interpretation[] | Interpretation | undefined;
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export type MessageStatus = 'applied' | 'skipped' | 'missing' | 'needs_reeval' | 'conflict';

export interface ReplayIssue {
  index: number;
  entry: SourceEntry;
  status: Exclude<MessageStatus, 'applied' | 'skipped'>;
  reasons: string[];
  candidates: Interpretation[];
}

export interface ReplayResult {
  state: WorldState;
  ledger: LedgerRecord[];
  prefixHashes: string[];
  stateHashes: string[];
  applied: { index: number; key: string; interp: Interpretation }[];
  issue: ReplayIssue | null;
  fingerprint: string;
}

/** Compact hash of the projected state (current facts, dispositions, occurrences, clock). */
export function stateHash(s: WorldState): string {
  const facts: [string, unknown][] = [];
  for (const [k, list] of s.facts) {
    const last = list[list.length - 1];
    facts.push([k, last ? (last.op === 'set' ? last.value : null) : null]);
  }
  facts.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  return hashObject({
    facts,
    d: [...s.dispositions].map(([k, v]) => [k, v.disposition]).sort(),
    o: [...s.occurrences.keys()].length,
    c: s.clock,
    x: [...s.declines.keys()].sort(),
  });
}

export function entryIdentity(e: SourceEntry): string {
  return `${e.role}|${e.messageId}|${e.variantId}|${e.contentHash}`;
}

export function fingerprintPrefix(entries: SourceEntry[]): string[] {
  const out: string[] = [];
  let h = 'root';
  for (const e of entries) {
    h = sha256(h + '\n' + entryIdentity(e));
    out.push(h);
  }
  return out;
}

export interface ReplayInput {
  pack: LoadedPack;
  branchId: string;
  bootstrap: RecordDraft[];
  entries: SourceEntry[];
  store: Record<string, unknown>;
  /** Entities whose source changed in this rebuild; later messages touching them need re-evaluation. */
  affectedEntities?: Set<string>;
  /** First index at which the source changed relative to the accepted manifest (or -1). */
  changedFrom?: number;
  /** Records the player added by hand, applied after their anchor message (or at the end). */
  manual?: ManualRecord[];
}

export function interpretationEntities(i: Interpretation): Set<string> {
  const s = new Set<string>(i.sceneEntities);
  for (const c of i.stateClaims) s.add(c.entity_id);
  for (const r of i.records) {
    for (const d of r.factsSetOrUnset) s.add(d.entity_id);
    for (const o of r.occurrences || []) [...o.actors, ...o.affected, ...o.locations].forEach((x) => s.add(x));
  }
  return s;
}

/** Source-dependency check (provenance + agency authorization); never skipped, even on the fast path. */
export function validateDependencies(interp: Interpretation, entries: SourceEntry[], uptoIndex: number): string[] {
  const reasons: string[] = [];
  const byId = new Map(entries.slice(0, uptoIndex).map((e) => [e.messageId, e]));
  for (const d of interp.dependsOn) {
    const e = byId.get(d.messageId);
    if (!e) reasons.push(`depends on message ${d.messageId}, which is no longer in the selected transcript`);
    else if (e.contentHash !== d.contentHash) reasons.push(`depends on message ${d.messageId}, whose content changed`);
  }
  for (const a of interp.playerActions) {
    if (!a.authorizedBy) continue;
    const e = byId.get(a.authorizedBy.messageId);
    if (!e || !quoteInText(a.authorizedBy.quote, e.text)) reasons.push(`player action "${a.quote}" is no longer authorized by the user's text`);
  }
  return reasons;
}

/** Deterministic validity check of a stored interpretation against the replayed prefix. */
export function validateAgainstPrefix(interp: Interpretation, state: WorldState, pack: LoadedPack, entries: SourceEntry[], uptoIndex: number): string[] {
  const reasons: string[] = [];
  const prior = entries.slice(0, uptoIndex);
  const byId = new Map(prior.map((e) => [e.messageId, e]));
  for (const d of interp.dependsOn) {
    const e = byId.get(d.messageId);
    if (!e) reasons.push(`depends on message ${d.messageId}, which is no longer in the selected transcript`);
    else if (e.contentHash !== d.contentHash) reasons.push(`depends on message ${d.messageId}, whose content changed`);
  }
  for (const a of interp.playerActions) {
    if (!a.authorizedBy) continue;
    const e = byId.get(a.authorizedBy.messageId);
    if (!e || !quoteInText(a.authorizedBy.quote, e.text)) reasons.push(`player action "${a.quote}" is no longer authorized by the user's text`);
  }
  const now = state.clock.lo;
  for (const c of interp.stateClaims) {
    const f = factAt(state, c.entity_id, c.predicate, { tick: Number.MAX_SAFE_INTEGER });
    const cv = coerceClaimValue(pack, c.predicate, c.value);
    if (f.known && !valuesEqual(f.value!, cv) && claimComparable(pack, c.predicate, cv)) reasons.push(`presupposes ${c.entity_id}.${c.predicate}=${JSON.stringify(c.value)} but actual state is ${JSON.stringify(f.value)} ("${c.quote}")`);
  }
  for (const r of interp.records) {
    if (r.packEventId && r.disposition && state.dispositions.has(r.packEventId)) reasons.push(`canonical event ${r.packEventId} already has a disposition in the new prefix`);
  }
  for (const b of interp.offscreenBasis) {
    if (b.mode !== 'deterministic') continue;
    const ev = pack.events.get(b.eventId);
    if (!ev) { reasons.push(`unknown event ${b.eventId}`); continue; }
    const rec = interp.records.find((r) => r.packEventId === b.eventId);
    const tick = rec ? rec.storyTime.lo : now;
    const v = triLabel(evalCondition(ev.canonical_preconditions, state, pack, { tick }));
    if (v !== b.precondition) reasons.push(`offscreen adjudication of ${b.eventId} assumed preconditions ${b.precondition} but they are now ${v}`);
  }
  if (interp.sceneEnd && !interp.flashback && interp.sceneEnd.hi < now) reasons.push('scene ends before the current committed story time');
  return reasons;
}

export function draftToRecord(d: RecordDraft, seq: number, branchId: string, commitId: string): LedgerRecord {
  return { ...d, sequence: seq, branchId, commitId };
}

export function replay(input: ReplayInput): ReplayResult {
  const { pack, branchId, bootstrap, entries, store } = input;
  const state = emptyState(pack);
  let seq = 0;
  const ledger: LedgerRecord[] = [];
  for (const b of bootstrap) {
    const rec = draftToRecord(b, ++seq, branchId, 'bootstrap');
    applyRecord(state, rec);
    ledger.push(rec);
  }
  const manual = input.manual || [];
  const present = new Set(entries.filter((e) => e.role !== 'system').map((e) => e.messageId));
  const applyManual = (pred: (m: ManualRecord) => boolean) => {
    for (const m of manual) if (pred(m)) {
      const rec = draftToRecord(m.record, ++seq, branchId, 'manual');
      applyRecord(state, rec);
      ledger.push(rec);
    }
  };
  applyManual((m) => m.afterMessageId === null);
  const prefixHashes = fingerprintPrefix(entries);
  const stateHashes: string[] = [];
  const applied: ReplayResult['applied'] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const sh = stateHash(state);
    stateHashes.push(sh);
    if (e.role === 'system') continue;
    const key = baseKey(e);
    const cands = interpretationsFor(store, key);
    if (!cands.length) {
      return finish({ index: i, entry: e, status: 'missing', reasons: ['no interpretation for this message variant'], candidates: [] });
    }
    // Fast path: an interpretation validated against exactly this prefix state.
    let chosen = cands.find((c) => c.basisStateHash === sh && !validateDependencies(c, entries, i).length);
    if (chosen && chosen.conflict) {
      return finish({ index: i, entry: e, status: 'conflict', reasons: [(chosen as unknown as { conflict: { reason: string } }).conflict.reason], candidates: cands });
    }
    if (!chosen) {
      const reasons: string[] = [];
      const affected = input.affectedEntities;
      for (const c of cands) {
        if ((c as Interpretation & { conflict?: unknown }).conflict) continue;
        const r = validateAgainstPrefix(c, state, pack, entries, i);
        const touchesAffected = affected && input.changedFrom !== undefined && input.changedFrom >= 0 && i > input.changedFrom && c.role === 'gm'
          && [...interpretationEntities(c)].some((x) => affected.has(x));
        if (!r.length && !touchesAffected) { chosen = c; break; }
        if (touchesAffected) r.push('references entities whose history changed earlier in the transcript');
        reasons.push(...r);
      }
      if (!chosen) return finish({ index: i, entry: e, status: 'needs_reeval', reasons: [...new Set(reasons)], candidates: cands });
    }
    for (const d of chosen.records) {
      const rec = draftToRecord(d, ++seq, branchId, chosen.commitId);
      rec.sourceRefs = rec.sourceRefs.length ? rec.sourceRefs : [{ messageId: e.messageId, variantId: e.variantId, contentHash: e.contentHash, spans: [] }];
      applyRecord(state, rec);
      ledger.push(rec);
    }
    applied.push({ index: i, key, interp: chosen });
    applyManual((m) => m.afterMessageId === e.messageId);
  }
  applyManual((m) => m.afterMessageId !== null && !present.has(m.afterMessageId));
  return finish(null);

  function finish(issue: ReplayIssue | null): ReplayResult {
    return {
      state,
      ledger,
      prefixHashes,
      stateHashes,
      applied,
      issue,
      fingerprint: prefixHashes[prefixHashes.length - 1] || 'root',
    };
  }
}

/** Earliest position where two manifests differ (by identity and hash, not array index). */
export function earliestChange(oldM: { messageId: string; variantId: string; contentHash: string }[], newM: SourceEntry[]): number {
  const n = Math.min(oldM.length, newM.length);
  for (let i = 0; i < n; i++) {
    const a = oldM[i], b = newM[i];
    if (a.messageId !== b.messageId || a.variantId !== b.variantId || a.contentHash !== b.contentHash) return i;
  }
  if (oldM.length !== newM.length) return n;
  return -1;
}
