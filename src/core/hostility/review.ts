// 主动敌对 in the review of a reply: grudges the reply (or the player's message) shows someone taking up against the
// player, grudges it settles, a grudge acted on (a fight with its holder began: decided by code), and whether what was
// due came (a grudge or a danger the GM was told to bring): when it did not, the reply is sent back.
import type { GrudgeChange, Id, StoryTime } from '../domain/types';
import type { WorldIndex } from '../domain/world-query';
import { quoteInText, uniq } from '../domain/util';
import { fightNow } from '../combat';
import type { RecordDraft } from '../runtime/types';
import { hostilityRecord } from './record';
import { grudgesNow } from './state';
import type { HostileDue } from './turn';

/** The review's part (evaluate): grudges taken up and settled in this reply. */
export interface HostilityEvalOut {
  grudges?: { who: string; why: string; quote: string; comes?: { day: number; minute: number } | null }[];
  grudges_ended?: { who: string; quote: string }[];
}

/** What the review of this reply needs: what was due in it. */
export interface HostilityReview { due: HostileDue | null; playerId: Id | null }

/** The grudges in force, as the reviewer gets them (to end one the reply settles, or not take one up twice). */
export function grudgesForReview(index: WorldIndex): { who: string; why: string }[] {
  return grudgesNow(index.state).map((g) => ({ who: `${g.holder} | ${index.entityName(g.holder)}`, why: g.why }));
}

/** When someone comes who gave no time: the next evening (18:00) at least six hours away. */
export function defaultComes(tick: number): number {
  let t = Math.floor(tick / 1440) * 1440 + 18 * 60;
  while (t < tick + 6 * 60) t += 1440;
  return t;
}

export function gateHostility(h: HostilityReview, ev: HostilityEvalOut, a: {
  index: WorldIndex; text: string; userText: string; resolve: (x: string) => Id | null; isPerson: (id: Id) => boolean;
  /** what this reply records so far (fights it starts, contacts it makes) */
  records: RecordDraft[]; sceneEnd: StoryTime; draft: boolean;
}): { records: RecordDraft[]; violations: string[]; warnings: string[] } {
  const violations: string[] = [], warnings: string[] = [];
  const st = a.index.state;
  const tick = a.sceneEnd.lo;
  const open = new Map(grudgesNow(st, tick).map((g) => [g.holder, g]));
  const shown = (q: string) => !!q && (quoteInText(q, a.text) || quoteInText(q, a.userText));
  const changes: GrudgeChange[] = [];
  const name = (id: Id) => a.index.entityName(id);

  // a fight with the holder begins (the player's message or this reply): the grudge is acted on
  const fought = new Set<Id>([...(fightNow(st).ongoing ? fightNow(st).participants : []), ...a.records.flatMap((r) => (r.fight?.ongoing ? r.fight.participants : []))]);
  for (const g of open.values()) if (fought.has(g.holder)) changes.push({ holder: g.holder, why: g.why, quote: g.quote, comes: g.comes, ended: 'avenged', source: 'play' });
  const acted = new Set(changes.map((c) => c.holder));

  for (const x of ev.grudges || []) {
    const who = a.resolve(String(x.who || '').trim());
    const quote = String(x.quote || '').trim();
    if (!who || who === h.playerId || !a.isPerson(who)) { warnings.push(`grudge of "${x.who}" left out: not a known person`); continue; }
    if (!shown(quote)) { warnings.push(`grudge of ${name(who)} left out: its words are not in the reply or the player's message`); continue; }
    if (acted.has(who)) continue;
    const at = x.comes && Number.isFinite(x.comes.day) && Number.isFinite(x.comes.minute) ? Math.max(tick, Math.round(x.comes.day) * 1440 + Math.round(x.comes.minute)) : null;
    if (open.has(who) && at === null) continue;   // already holds one; nothing new about when
    changes.push({ holder: who, why: String(x.why || '').trim().slice(0, 200) || open.get(who)?.why || '', quote: quote.slice(0, 300), comes: at ?? defaultComes(tick), source: 'play' });
  }
  for (const x of ev.grudges_ended || []) {
    const who = a.resolve(String(x.who || '').trim());
    const g = who ? open.get(who) : undefined;
    if (!g || acted.has(g.holder)) continue;
    if (!shown(String(x.quote || '').trim())) { warnings.push(`the end of ${name(g.holder)}'s grudge left out: its words are not in the reply`); continue; }
    changes.push({ holder: g.holder, why: g.why, quote: g.quote, comes: g.comes, ended: 'reconciled', source: 'play' });
  }

  // what was due came: a fight with them begins, or at least they come at the player (a hostile contact)
  let danger: { node: Id; place: Id | null } | undefined;
  if (h.due && a.draft) {
    const hostile = a.records.filter((r) => r.contact && r.contact.contactKind === 'hostile');
    const started = a.records.some((r) => r.fight?.ongoing);
    if (h.due.kind === 'grudge') {
      const g = h.due.grudge;
      if (fought.has(g.holder)) { /* recorded above */ }
      else if (hostile.some((r) => r.contact!.actors.includes(g.holder))) changes.push({ holder: g.holder, why: g.why, quote: g.quote, comes: tick + 1440, source: 'play' });
      else violations.push(`${name(g.holder)} holds a grudge against the player character (${g.why}) and comes for them in this reply, but the reply does not show it. Bring them in where the player character is — waiting on the way, at a door, catching up in the street — and stop where the attack begins; leave what the player character does to the player.`);
    } else {
      if (started || hostile.length) danger = { node: h.due.node.id, place: h.due.from };
      else violations.push(`The danger of this place and hour reaches the player character in this reply (${h.due.node.name}), but the reply does not show it. Bring in people of the sort it says, who pick the player character, and stop where the attack begins; leave what the player character does to the player.`);
    }
  }
  const records: RecordDraft[] = [];
  if (changes.length || danger) {
    const summary = [...changes.map((c) => `${name(c.holder)}: ${c.ended ? `grudge over (${c.ended})` : 'grudge against the player'}`), ...(danger ? [`danger: ${a.index.pack.combat.nodes.get(danger.node)?.name || danger.node}`] : [])].join('; ');
    records.push(hostilityRecord(a.sceneEnd, [], summary, { grudges: uniqChanges(changes), ...(danger ? { danger } : {}) }));
  }
  return { records, violations, warnings };
}

/** One change per holder (the last). */
function uniqChanges(list: GrudgeChange[]): GrudgeChange[] {
  const by = new Map<Id, GrudgeChange>();
  for (const c of list) by.set(c.holder, c);
  return uniq([...by.values()]);
}
