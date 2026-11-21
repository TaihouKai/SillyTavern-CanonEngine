// 条目的属性 (aspects): one record per entity — a person, an object, an organization, a place — and what the world
// knows of it in a fixed set of kinds, each with its own format check. A module reads only the kinds it declares
// (aspectReader); nothing else reaches into an entity's aspects. A new kind is added here, in code: its type, which
// entities may have it, its check, how it holds in time. The player character has the same aspects (read from the
// Persona onto their runtime entity) and is read by the same readers.
//
// What changes in play is not an aspect but a fact of the world state (the pack's predicates, the ledger): who holds
// an object (holder), who belongs to an organization (members) and who leads it (leader). Relations between two
// people are the pack's relations (a pair, not one entity's). Modules read those through the world index.
import type { AbilityPart, CanonPack, CombatStyleVersion, Id, MindProfile, NatureVersion, PackEntity, Visibility } from './types';
import { ABILITY_PARTS, PERCEIVE_KINDS } from './types';

/** 能力: something the entity can do — a person's power, technique or skill, what an object does, what members of
 *  an organization are trained in — told in parts (how it works, what it does, conditions, cost, limits, known ways
 *  to beat it), each with who knows it. Holds from its from_event (null: the story start) until its until_event. */
export interface Ability {
  /** Unique among every ability and setting node of the pack (a fight, a state, a witness refers to it by id). */
  id: Id; name: string;
  /** One sentence: what it is in a fight (what the analysis gets of it further away). */
  gist: string;
  /** The whole of it in a few sentences. */
  text: string;
  parts: { part: AbilityPart; text: string; visibility?: Visibility }[];
  /** Who knows it at all (absent: public; its owner always knows it). */
  visibility?: Visibility;
  /** The setting's nodes it belongs to or depends on ("属于电击使能力"). */
  links?: { to: Id; label: string }[];
  /** 用法: this is a use of another ability of the same entity (光子振动炮 of 万光统御; 反射 of 一方通行). It tells
   *  only what is its own; the power's conditions, cost, limits and counters hold for it too. One level only, and it
   *  holds only while its power does. */
  of?: Id;
  from_event?: Id | null; until_event?: Id | null;
  source_refs: Id[];
  /** Written by a model where the sources say nothing (reviewed by a person like the rest). */
  generated?: boolean;
}

/** 设定归属: what kind of being it is in the setting, and the setting's shared things it has or belongs to — a power
 *  level, 魔术师, an ordinary person, firearms; for a place, a danger met there. Holds in versions like an ability. */
export interface SettingLink { node: Id; label: string; from_event?: Id | null; until_event?: Id | null }

/** 战斗中: what an organization, object or other thing is in a fight (a unit of nuns fighting by numbers; a powered
 *  suit) — reached through who belongs to it or holds it. */
export interface Fighting { gist: string; text: string; visibility?: Visibility }

export interface Aspects {
  /** 常态: how a person's power, condition or non-human body shows in everyday scenes, in versions. */
  nature?: NatureVersion[];
  /** 思考方式: how the person thinks. */
  mind?: MindProfile;
  /** 对抗倾向: how the person acts in a confrontation, in versions. */
  combat_style?: CombatStyleVersion[];
  /** 能力: what it can do. */
  abilities?: Ability[];
  /** 设定归属: its links into the setting. */
  setting?: SettingLink[];
  /** 战斗中: what it is in a fight (not a person: a person is their abilities and kinds). */
  fighting?: Fighting;
}
export type AspectKey = keyof Aspects;

type Kind = PackEntity['kind'];
type Report = (path: string, message: string) => void;
interface LintCtx { events: Set<Id>; entities: Map<Id, PackEntity>; sources: Set<Id>; err: Report; warn: Report }

/** The registry: every kind of aspect, who may have it and its check. */
export const ASPECTS: { [K in AspectKey]: { name: string; for: readonly Kind[]; check: (v: NonNullable<Aspects[K]>, at: string, c: LintCtx) => void } } = {
  nature: { name: '常态', for: ['person'], check: (vs, at, c) => { versions(vs, at, c); vs.forEach((v, j) => { for (const k of v.perceives?.kinds || []) if (!PERCEIVE_KINDS.includes(k)) c.err(`${at}/${j}/perceives`, `unknown kind "${k}"`); }); } },
  mind: { name: '思考方式', for: ['person'], check: () => {} },
  combat_style: { name: '对抗倾向', for: ['person'], check: (vs, at, c) => versions(vs, at, c) },
  abilities: { name: '能力', for: ['person', 'object', 'organization', 'other'], check: (as, at, c) => { as.forEach((a, j) => checkAbility(a, `${at}/${j}`, c)); checkUses(as, at, c); } },
  setting: { name: '设定归属', for: ['person', 'object', 'organization', 'place', 'world', 'other'], check: (ls, at, c) => ls.forEach((l, j) => timed(l, `${at}/${j}`, c)) },
  fighting: { name: '战斗中', for: ['object', 'organization', 'place', 'world', 'other'], check: (f, at, c) => { if (!f.gist.trim() || !f.text.trim()) c.err(at, 'fighting gives a gist and a text'); visibility(f.visibility, at, c); } },
};
export const ASPECT_KEYS = Object.keys(ASPECTS) as AspectKey[];

function timed(v: { from_event?: Id | null; until_event?: Id | null }, at: string, c: LintCtx) {
  for (const k of ['from_event', 'until_event'] as const) if (v[k] && !c.events.has(v[k]!)) c.err(`${at}/${k}`, `unknown event "${v[k]}"`);
}
function versions(vs: { from_event: Id | null; until_event?: Id | null }[], at: string, c: LintCtx) {
  vs.forEach((v, j) => {
    if (j === 0 && v.from_event !== null) c.err(`${at}/${j}/from_event`, 'the first version holds at the story start: from_event must be null');
    if (j > 0 && v.from_event === null) c.err(`${at}/${j}/from_event`, 'a later version starts at an event: from_event is missing');
    timed(v, `${at}/${j}`, c);
  });
}
function visibility(v: Visibility | undefined, at: string, c: LintCtx) {
  for (const k of v?.knower_ids || []) if (!c.entities.has(k)) c.err(at, `visibility names an unknown entity "${k}"`);
}
/** An entity's uses point at one of its own abilities that is no use itself (one level), never at themselves. */
function checkUses(as: Ability[], at: string, c: LintCtx) {
  const byId = new Map(as.map((a) => [a.id, a]));
  as.forEach((a, j) => {
    if (a.of === undefined) return;
    const p = byId.get(a.of);
    if (a.of === a.id) c.err(`${at}/${j}/of`, 'an ability is no use of itself');
    else if (!p) c.err(`${at}/${j}/of`, `"${a.of}" is no ability of this entity: a use belongs to one of its own abilities`);
    else if (p.of !== undefined) c.err(`${at}/${j}/of`, `"${a.of}" is itself a use (of "${p.of}"): a use belongs to the power, one level only`);
  });
}
function checkAbility(a: Ability, at: string, c: LintCtx) {
  const parts = a.parts.map((p) => p.part);
  if (!parts.includes('effect')) c.err(`${at}/parts`, 'an ability says what it does (a part "effect")');
  if (new Set(parts).size < parts.length) c.err(`${at}/parts`, 'the same part twice');
  for (const p of parts) if (!ABILITY_PARTS.includes(p)) c.err(`${at}/parts`, `unknown part "${p}"`);
  visibility(a.visibility, at, c);
  for (const p of a.parts) visibility(p.visibility, `${at}/parts`, c);
  timed(a, at, c);
  for (const s of a.source_refs) if (!c.sources.has(s)) c.err(`${at}/source_refs`, `unknown source "${s}"`);
  if (!a.source_refs.length && !a.generated) c.err(`${at}/source_refs`, 'an ability says where it comes from (source_refs), or that a model wrote it (generated: true)');
}

/** Every entity's aspects: allowed for its kind, each by its own check; ability ids unique (also against the
 *  setting's nodes, checked with the combat section). */
export function lintAspects(pack: CanonPack, err: Report, warn: Report): void {
  const c: LintCtx = { events: new Set(pack.events.map((e) => e.id)), entities: new Map(pack.entities.map((e) => [e.id, e])), sources: new Set(pack.sources.map((s) => s.id)), err, warn };
  const abilityIds = new Set<Id>();
  pack.entities.forEach((e, i) => {
    const as = e.aspects;
    if (!as) return;
    for (const k of Object.keys(as) as AspectKey[]) {
      const at = `/entities/${i}/aspects/${k}`;
      const def = ASPECTS[k];
      if (!def) { err(at, `unknown aspect "${k}"`); continue; }
      if (as[k] === undefined) continue;
      if (!def.for.includes(e.kind)) err(at, `${def.name} (${k}) is not for a ${e.kind}`);
      (def.check as (v: unknown, at: string, c: LintCtx) => void)(as[k], at, c);
    }
    (as.abilities || []).forEach((a, j) => {
      if (abilityIds.has(a.id)) err(`/entities/${i}/aspects/abilities/${j}/id`, `duplicate ability id "${a.id}"`);
      if (c.entities.has(a.id)) err(`/entities/${i}/aspects/abilities/${j}/id`, `"${a.id}" is also an entity id: abilities need their own ids`);
      abilityIds.add(a.id);
    });
  });
}

// ---- reading ------------------------------------------------------------------------------------------------

/** What a reader needs: the pack's entities, this game's runtime entities and which events occurred. */
export interface AspectSource {
  pack: { entities: Map<Id, PackEntity> };
  state: { runtimeEntities: Map<Id, { aspects?: Aspects }>; dispositions: Map<Id, { disposition: string }> };
}

/** An entity's aspects as written (the pack's, or a runtime entity's: the player character from the Persona). Only
 *  this module and the pack's own build read them raw. */
function raw(src: AspectSource, id: Id): Aspects | undefined {
  return src.pack.entities.get(id)?.aspects || src.state.runtimeEntities.get(id)?.aspects;
}

const occurredIn = (src: AspectSource) => (e?: Id | null) => !!e && src.state.dispositions.get(e)?.disposition === 'occurred';

/** The version in force of a versioned aspect: the last whose from_event has occurred and whose until_event has not
 *  (the first holds from the start). */
export function versionNow<T extends { from_event: Id | null; until_event?: Id | null }>(vs: T[] | undefined, occurred: (e?: Id | null) => boolean): { version: T; index: number } | null {
  if (!vs?.length) return null;
  let index = 0;
  vs.forEach((v, i) => { if (i > 0 && occurred(v.from_event) && !occurred(v.until_event)) index = i; });
  return { version: vs[index], index };
}
/** Whether a timed item (an ability, a setting link) holds now. */
export const holdsNow = (v: { from_event?: Id | null; until_event?: Id | null }, occurred: (e?: Id | null) => boolean) =>
  (!v.from_event || occurred(v.from_event)) && !(v.until_event && occurred(v.until_event));

/** An aspect as it holds now: a versioned one its version in force (with its index), a list the items in force. */
export interface AspectsNow {
  nature: { version: NatureVersion; index: number } | null;
  mind: MindProfile | null;
  combat_style: { version: CombatStyleVersion; index: number } | null;
  abilities: Ability[];
  setting: SettingLink[];
  fighting: Fighting | null;
}

const NOW: { [K in AspectKey]: (a: Aspects | undefined, occurred: (e?: Id | null) => boolean) => AspectsNow[K] } = {
  nature: (a, o) => versionNow(a?.nature, o),
  mind: (a) => a?.mind || null,
  combat_style: (a, o) => versionNow(a?.combat_style, o),
  // (a use holds only while its power does)
  abilities: (a, o) => { const now = (a?.abilities || []).filter((x) => holdsNow(x, o)); const ids = new Set(now.map((x) => x.id)); return now.filter((x) => x.of === undefined || ids.has(x.of)); },
  setting: (a, o) => (a?.setting || []).filter((x) => holdsNow(x, o)),
  fighting: (a) => a?.fighting || null,
};

/** A module's reader: it names the aspects it reads, and gets those as they hold now — nothing else. */
export function aspectReader<K extends AspectKey>(keys: readonly K[]): (src: AspectSource, id: Id) => Pick<AspectsNow, K> {
  return (src, id) => {
    const a = raw(src, id);
    const o = occurredIn(src);
    const out = {} as Pick<AspectsNow, K>;
    for (const k of keys) (out as Record<K, unknown>)[k] = NOW[k](a, o);
    return out;
  };
}

/** Every ability written anywhere in the pack, with its owner (the combat index takes them in with the setting). */
export function packAbilities(pack: CanonPack): { owner: Id; ability: Ability }[] {
  return pack.entities.flatMap((e) => (e.aspects?.abilities || []).map((ability) => ({ owner: e.id, ability })));
}
/** Every entity's setting links and what it is in a fight, as written (the combat index). */
export function packSetting(pack: CanonPack): { owner: Id; setting: SettingLink[]; fighting: Fighting | null }[] {
  return pack.entities.filter((e) => e.aspects?.setting?.length || e.aspects?.fighting).map((e) => ({ owner: e.id, setting: e.aspects!.setting || [], fighting: e.aspects!.fighting || null }));
}
/** A runtime entity's abilities as written (the player character's, from the Persona). */
export function runtimeAbilities(state: AspectSource['state']): { owner: Id; ability: Ability }[] {
  return [...state.runtimeEntities.entries()].flatMap(([id, e]) => (e.aspects?.abilities || []).map((ability) => ({ owner: id, ability })));
}

/** A display's reader (the inspector's pages): the aspects it names as written, every version (the page marks which
 *  holds now with aspectReader). */
export function aspectWritten<K extends AspectKey>(keys: readonly K[]): (src: AspectSource, id: Id) => Pick<Aspects, K> {
  return (src, id) => {
    const a = raw(src, id);
    const out = {} as Pick<Aspects, K>;
    for (const k of keys) if (a?.[k] !== undefined) (out as Record<K, unknown>)[k] = a[k];
    return out;
  };
}
