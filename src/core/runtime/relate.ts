// A relation is a state of this game. The original story's stages follow by themselves only while a pair still
// follows the original story (WorldIndex.relationNow); once this game changed the pair, or an event of a stage went
// otherwise, what a settled event does to the pair is worked out here: the original change (the stage's `why`) applied
// to the relation this game has, by what actually happened. The answer is a change like any other (merged into the
// relation part by part) and is recorded with the turn or action that settled the event.
import type { Id, RelationChange } from '../domain/types';
import type { LoadedPack } from '../domain/pack';
import { cleanViews } from '../domain/address';
import type { RelationDue, WorldIndex } from '../domain/world-query';
import { newId } from '../domain/util';
import { callStructured, type ModelPort } from './model';
import { PROMPTS } from './prompts';
import type { RecordDraft } from './types';

interface RelateOut { pairs: { n: number; changed: boolean; bond?: string; views?: unknown[]; together?: string; ended?: boolean }[] }

const BATCH = 30;

/** The relation changes these settled events make that the game has to work out (index: the state with the records
 *  that settled them), one record per event; [] when every pair still simply follows the original story (no call). */
export async function settleRelations(port: ModelPort, pack: LoadedPack, index: WorldIndex, eventIds: Iterable<Id>, opts: { signal?: AbortSignal; operationId: string; log?: (l: unknown) => void }): Promise<RecordDraft[]> {
  const due = index.relationsDue(eventIds);
  if (!due.length) return [];
  const name = (id: Id) => index.entityName(id);
  const actual = (e: Id) => {
    const d = index.state.dispositions.get(e)!;
    const occ = d.occurrenceId ? index.state.occurrences.get(d.occurrenceId) : undefined;
    return `${d.disposition === 'occurred' ? 'as in the original story' : 'otherwise'}: ${occ?.account || d.reason || pack.events.get(e)?.title || e}`;
  };
  const answers = new Map<RelationDue, RelateOut['pairs'][number]>();
  for (let i = 0; i < due.length; i += BATCH) {
    const part = due.slice(i, i + BATCH);
    const events = [...new Set(part.map((p) => p.eventId))];
    const out = await callStructured<RelateOut>(port, 'relate', PROMPTS.relate, {
      events: events.map((e) => ({ id: e, title: pack.events.get(e)?.title || e, actual: actual(e) })),
      pairs: part.map((p, j) => ({
        n: j + 1, event: p.eventId,
        people: p.people.map((id) => ({ id, name: name(id) })),
        change: p.change,
        ...(p.address.length ? { address_change: p.address.map((x) => ({ who: x.who, name: name(x.who), address: x.address })) } : {}),
        now: p.now ? { bond: p.now.bond, views: p.now.views.map((v) => ({ who: v.who, name: name(v.who), address: v.address || [], sees: v.sees })), ...(p.now.together ? { together: p.now.together } : {}), ...(p.now.ended ? { ended: true } : {}) } : null,
      })),
    }, { signal: opts.signal, operationId: opts.operationId, log: opts.log });
    for (const a of out.pairs || []) if (part[a.n - 1]) answers.set(part[a.n - 1], a);
  }
  const byEvent = new Map<Id, RelationChange[]>();
  for (const p of due) {
    const a = answers.get(p);
    const ch = a?.changed ? toChange(p, a) : null;
    if (ch) byEvent.set(p.eventId, [...(byEvent.get(p.eventId) || []), ch]);
  }
  return [...byEvent].map(([e, relations]) => {
    const tick = index.state.dispositions.get(e)!.tick;
    return {
      recordId: newId('rec'), kind: 'relation', storyTime: { lo: tick, hi: tick, precision: 'minute' }, sourceRefs: [], factsSetOrUnset: [], eventOccurrenceIds: [],
      visibility: { mode: 'public', knower_ids: [] }, evidenceKind: 'adjudication',
      summary: `Relations after ${pack.events.get(e)?.title || e}: ${relations.map((r) => `${name(r.people[0])} – ${name(r.people[1])}: ${r.ended ? 'ENDED: ' : ''}${r.bond || '(as before)'}`).join('; ')}`.slice(0, 300),
      relations,
    };
  });
}

/** One answer as a change of the pair (null: it says nothing that changes). */
function toChange(p: RelationDue, a: RelateOut['pairs'][number]): RelationChange | null {
  const bond = String(a.bond || '').trim().slice(0, 400);
  const views = cleanViews(a.views, p.people);
  const together = String(a.together || '').trim().slice(0, 400);
  // a pair that did not know each other gets a relation only with a bond
  if (!p.now && !bond) return null;
  if (!bond && !views.length && !together && !a.ended) return null;
  return { people: p.people, bond, views, ...(together ? { together } : {}), ...(a.ended ? { ended: true } : {}), quote: '', source: 'event', event: p.eventId, eventRecord: p.eventRecordId };
}
