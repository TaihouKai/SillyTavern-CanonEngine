// 画面: a picture of one moment of the story, for an image model. The analysis model reads the reply with the people
// the engine knows are in it and describes the picture in parts, as image-board (Danbooru) tags: who is in it, how
// they look, what they do and where they stand, the place, the light, the shot. Code puts the parts together in the
// form an image service takes (the renderers) and sends them (the backends: not written yet).
//
// The look of a known character of a published work comes from the image model, which knows them by their tag; the
// pack keeps no appearance data (user: the pack must not carry the noise of an add-on). A character the image model
// cannot know — the player character, someone invented — is described from the Persona or the pack's description.
// Style and quality tags belong to the image service's settings, not to the scene.
import type { Id } from '../domain/types';
import { fromTick } from '../domain/time';

export const PICTURE_X = ['left', 'center-left', 'center', 'center-right', 'right'] as const;
export const PICTURE_Y = ['upper', 'middle', 'lower'] as const;
export type PictureBody = 'girl' | 'boy' | 'other';

export interface PictureCharacter {
  /** The person's entity id from the input, '' for someone the engine does not know (an extra). */
  who: string;
  name: string;
  /** The character's image-board tag (a known character of a published work), '' otherwise. */
  tag: string;
  copyright: string;
  body: PictureBody;
  look: string[];
  outfit: string[];
  expression: string[];
  action: string[];
  x: typeof PICTURE_X[number];
  y: typeof PICTURE_Y[number];
}

/** One character acting on another (from/to: 1-based positions in characters); mutual: both do it. */
export interface PictureInteraction { from: number; to: number; act: string; mutual: boolean }

export interface Picture {
  /** Which moment of the reply is drawn (in the reply's language). */
  moment: string;
  /** The picture in one or two English sentences (for image models that read sentences). */
  caption: string;
  characters: PictureCharacter[];
  interactions: PictureInteraction[];
  place: string[];
  time: string[];
  effects: string[];
  framing: 'close-up' | 'portrait' | 'upper body' | 'cowboy shot' | 'full body' | 'wide shot';
  angle: string[];
}

export interface PicturePerson { id: Id; name: string; description: string; player?: true }

export interface PictureInput {
  work: string;
  reply: string;
  /** The player's own words for what to draw ('' : the model chooses the moment). */
  focus: string;
  player_message: string;
  time: string;
  part_of_day: string;
  people: PicturePerson[];
}

const REPLY_MAX = 8000;
const DESCRIPTION_MAX = 600;
const PERSONA_MAX = 2000;

/** The part of the day a story time falls in (the light of the picture, unless the reply shows otherwise). */
export function partOfDay(tick: number): string {
  const m = fromTick(tick).minute;
  if (m < 300) return 'night';
  if (m < 420) return 'dawn';
  if (m < 690) return 'morning';
  if (m < 840) return 'midday';
  if (m < 1020) return 'afternoon';
  if (m < 1140) return 'evening';
  return 'night';
}

/** The task input. people: the people the engine knows in the reply's scene, the player character among them
 *  (player: true, described by the Persona). */
export function pictureInput(a: { work: string; reply: string; focus: string; playerMessage: string; time: string; tick: number | null; people: PicturePerson[] }): PictureInput {
  return {
    work: a.work,
    reply: a.reply.slice(-REPLY_MAX),
    focus: a.focus.trim().slice(0, 1000),
    player_message: a.playerMessage.slice(-2000),
    time: a.time,
    part_of_day: a.tick === null ? '' : partOfDay(a.tick),
    people: a.people.map((p) => ({ ...p, description: p.description.slice(0, p.player ? PERSONA_MAX : DESCRIPTION_MAX) })),
  };
}

// --- the model's answer as clean tags ---

/** A tag as image boards write it: lower case, spaces for underscores, no weighting brackets of a prompt syntax; ''
 *  for what is not a tag in English (image models read only those). A tag's own parentheses stay ("name (series)"). */
export function cleanTag(raw: string): string {
  const t = String(raw).toLowerCase().replace(/_/g, ' ').replace(/[{}[\]]/g, '').replace(/::/g, '').replace(/\s+/g, ' ').trim();
  return /^[\x20-\x7e]+$/.test(t) ? t : '';
}

function cleanTags(list: string[], dropped: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) for (const part of String(raw).split(',')) {
    const t = cleanTag(part);
    if (t && !out.includes(t)) out.push(t);
    else if (!t && part.trim()) dropped.push(part.trim());
  }
  return out;
}

/** The answer with every tag clean; dropped: what was left out (not an English tag). Interactions keep only those
 *  between two different characters of the picture. */
export function cleanPicture(p: Picture): { picture: Picture; dropped: string[] } {
  const dropped: string[] = [];
  const characters = p.characters.map((c) => ({
    ...c,
    who: c.who.trim(), name: c.name.trim(),
    tag: cleanTag(c.tag), copyright: cleanTag(c.copyright),
    look: cleanTags(c.look, dropped), outfit: cleanTags(c.outfit, dropped), expression: cleanTags(c.expression, dropped), action: cleanTags(c.action, dropped),
  }));
  const n = characters.length;
  const interactions = p.interactions
    .map((i) => ({ ...i, act: cleanTag(i.act) }))
    .filter((i) => i.act && i.from >= 1 && i.from <= n && i.to >= 1 && i.to <= n && i.from !== i.to);
  // the caption is for image models, which read English only
  const caption = p.caption.trim();
  const english = /^[\x20-\x7e‘-”–—]*$/.test(caption);
  if (!english) dropped.push(caption);
  return {
    picture: { ...p, moment: p.moment.trim(), caption: english ? caption : '', characters, interactions, place: cleanTags(p.place, dropped), time: cleanTags(p.time, dropped), effects: cleanTags(p.effects, dropped), angle: cleanTags(p.angle, dropped) },
    dropped,
  };
}

// --- renderers: the picture in the form an image service takes ---

/** How many of each are in the picture, as image boards count them ("2girls, 1boy"; "no humans" for nobody). */
export function countTags(characters: PictureCharacter[]): string[] {
  if (!characters.length) return ['no humans'];
  const count = (body: PictureBody, one: string, many: string) => {
    const k = characters.filter((c) => c.body === body).length;
    return k === 0 ? [] : [k === 1 ? `1${one}` : k >= 6 ? `6+${many}` : `${k}${many}`];
  };
  return [...count('girl', 'girl', 'girls'), ...count('boy', 'boy', 'boys'), ...count('other', 'other', 'others')];
}

/** What the scene itself leaves out (style and quality exclusions are the image service's settings). */
export const PICTURE_NEGATIVE = ['nsfw'];

const X_AT: Record<PictureCharacter['x'], number> = { left: 0.1, 'center-left': 0.3, center: 0.5, 'center-right': 0.7, right: 0.9 };
const Y_AT: Record<PictureCharacter['y'], number> = { upper: 0.3, middle: 0.5, lower: 0.7 };

export interface NovelAIPrompt {
  /** The base prompt: what the picture has as a whole. */
  prompt: string;
  /** One prompt per character, with where the character stands (NovelAI's grid, 0.1–0.9). */
  characters: { prompt: string; center: { x: number; y: number } }[];
  negative: string;
}

/** Tags as one prompt, each once. */
const join = (tags: string[]) => [...new Set(tags.filter(Boolean))].join(', ');
const copyrights = (p: Picture) => p.characters.map((c) => c.copyright);
const scene = (p: Picture) => [...p.place, ...p.time, ...p.effects, p.framing, ...p.angle];

/** NovelAI (V4 and later): the whole picture in the base prompt, each character in a prompt of its own; an act of one
 *  character on another is written source#act / target#act (mutual#act on both). */
export function novelaiPrompt(p: Picture): NovelAIPrompt {
  const acts = (n: number) => p.interactions.flatMap((i) => i.mutual ? (i.from === n || i.to === n ? [`mutual#${i.act}`] : []) : i.from === n ? [`source#${i.act}`] : i.to === n ? [`target#${i.act}`] : []);
  return {
    prompt: join([...countTags(p.characters), ...copyrights(p), ...scene(p)]),
    characters: p.characters.map((c, i) => ({
      prompt: join([c.body, c.tag, ...c.look, ...c.outfit, ...c.expression, ...c.action, ...acts(i + 1)]),
      center: { x: X_AT[c.x], y: Y_AT[c.y] },
    })),
    negative: PICTURE_NEGATIVE.join(', '),
  };
}

/** NovelAI's grid cell for a center (columns A–E from the left, rows 1–5 from the top). */
export function novelaiCell(center: { x: number; y: number }): string {
  return 'ABCDE'[Math.round((center.x - 0.1) / 0.2)] + String(Math.round((center.y - 0.1) / 0.2) + 1);
}

export interface PlainPrompt {
  /** All of it in one tag prompt (Stable Diffusion style: parentheses escaped, as they weight words there). */
  prompt: string;
  negative: string;
  caption: string;
}

/** One tag prompt for an image service that takes a single prompt (a ComfyUI workflow and the like): the characters
 *  one after another, an act between two written once. */
export function plainPrompt(p: Picture): PlainPrompt {
  const escape = (t: string) => t.replace(/[()]/g, (ch) => `\\${ch}`);
  const tags = [
    ...countTags(p.characters), ...copyrights(p),
    ...p.characters.flatMap((c) => [c.tag, ...c.look, ...c.outfit, ...c.expression, ...c.action]),
    ...p.interactions.map((i) => i.act),
    ...scene(p),
  ];
  return { prompt: join(tags.map(escape)), negative: PICTURE_NEGATIVE.join(', '), caption: p.caption };
}

// --- backends: sending a prompt to an image service (not written yet) ---

export async function generateNovelAI(_prompt: NovelAIPrompt, _opts: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
  throw new Error('not implemented: the NovelAI image backend');
}

export async function generateComfy(_prompt: PlainPrompt, _opts: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
  throw new Error('not implemented: the ComfyUI image backend');
}
