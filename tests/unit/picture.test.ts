import { describe, expect, it } from 'vitest';
import { cleanPicture, cleanTag, countTags, generateComfy, generateNovelAI, novelaiCell, novelaiPrompt, partOfDay, pictureInput, plainPrompt, type Picture, type PictureCharacter } from '../../src/core/runtime/picture';
import { PROMPTS } from '../../src/core/runtime/prompts';

const person = (over: Partial<PictureCharacter>): PictureCharacter => ({
  who: '', name: '', tag: '', copyright: '', body: 'girl', look: [], outfit: [], expression: [], action: [], x: 'center', y: 'middle', ...over,
});
const picture = (over: Partial<Picture>): Picture => ({
  moment: 'm', caption: 'A caption.', characters: [], interactions: [], place: [], time: [], effects: [], framing: 'full body', angle: [], ...over,
});

describe('picture (画面)', () => {
  it('PC1 tags are cleaned as image boards write them; what is not an English tag is left out and reported', () => {
    expect(cleanTag('Hands_In_Pockets')).toBe('hands in pockets');
    expect(cleanTag('  {masterpiece}  ')).toBe('masterpiece');
    expect(cleanTag('index (toaru majutsu no index)')).toBe('index (toaru majutsu no index)');
    expect(cleanTag('短发')).toBe('');
    const { picture: p, dropped } = cleanPicture(picture({
      caption: '一个中文描述',
      characters: [person({ tag: 'Misaka_Mikoto', look: ['brown hair, short hair', '短发', 'brown hair'] })],
    }));
    expect(p.characters[0].tag).toBe('misaka mikoto');
    expect(p.characters[0].look).toEqual(['brown hair', 'short hair']);
    expect(p.caption).toBe('');
    expect(dropped).toEqual(['短发', '一个中文描述']);
  });

  it('PC2 interactions keep only acts between two different characters of the picture', () => {
    const { picture: p } = cleanPicture(picture({
      characters: [person({}), person({ body: 'boy' })],
      interactions: [{ from: 1, to: 2, act: 'Hug', mutual: false }, { from: 1, to: 1, act: 'hug', mutual: false }, { from: 1, to: 3, act: 'hug', mutual: false }, { from: 2, to: 1, act: '拥抱', mutual: false }],
    }));
    expect(p.interactions).toEqual([{ from: 1, to: 2, act: 'hug', mutual: false }]);
  });

  it('PC3 counts the people as image boards do', () => {
    expect(countTags([])).toEqual(['no humans']);
    expect(countTags([person({}), person({ body: 'boy' }), person({})])).toEqual(['2girls', '1boy']);
    expect(countTags(Array.from({ length: 6 }, () => person({ body: 'boy' })))).toEqual(['6+boys']);
    expect(countTags([person({ body: 'other' })])).toEqual(['1other']);
  });

  it('PC4 NovelAI: the whole picture in the base prompt, each character in its own with its place; acts as source#/target#/mutual#', () => {
    const n = novelaiPrompt(picture({
      characters: [
        person({ tag: 'misaka mikoto', copyright: 'toaru kagaku no railgun', expression: ['angry'], x: 'left' }),
        person({ tag: 'shirai kuroko', copyright: 'toaru kagaku no railgun', action: ['clinging'], expression: ['happy', 'happy'], x: 'right', y: 'lower' }),
        person({ body: 'boy', look: ['black hair'] }),
      ],
      interactions: [{ from: 2, to: 1, act: 'hug', mutual: false }, { from: 1, to: 3, act: 'eye contact', mutual: true }],
      place: ['restaurant'], time: ['afternoon'], effects: ['electricity'], framing: 'cowboy shot', angle: ['from side'],
    }));
    expect(n.prompt).toBe('2girls, 1boy, toaru kagaku no railgun, restaurant, afternoon, electricity, cowboy shot, from side');
    expect(n.characters.map((c) => c.prompt)).toEqual([
      'girl, misaka mikoto, angry, target#hug, mutual#eye contact',
      'girl, shirai kuroko, happy, clinging, source#hug',
      'boy, black hair, mutual#eye contact',
    ]);
    expect(n.characters.map((c) => novelaiCell(c.center))).toEqual(['A3', 'E4', 'C3']);
    expect(n.negative).toBe('nsfw');
  });

  it('PC5 the single prompt has everything once, with parentheses escaped (they weight words in Stable Diffusion)', () => {
    const p = plainPrompt(picture({
      characters: [person({ tag: 'index (toaru majutsu no index)', copyright: 'toaru majutsu no index', action: ['biting'] }), person({ body: 'boy', action: ['lying'] })],
      interactions: [{ from: 1, to: 2, act: 'head biting', mutual: false }],
      place: ['apartment'], framing: 'full body',
    }));
    expect(p.prompt).toBe('1girl, 1boy, toaru majutsu no index, index \\(toaru majutsu no index\\), biting, lying, head biting, apartment, full body');
    expect(p.caption).toBe('A caption.');
  });

  it('PC6 the input: part of the day from the story time, the Persona longer than a pack description', () => {
    expect([2 * 60, 6 * 60, 9 * 60, 12 * 60, 15 * 60, 18 * 60, 22 * 60].map(partOfDay)).toEqual(['night', 'dawn', 'morning', 'midday', 'afternoon', 'evening', 'night']);
    const input = pictureInput({ work: 'W', reply: 'r', focus: '', playerMessage: '', time: 'day 3', tick: 3 * 1440 + 15 * 60, people: [{ id: 'p', name: 'P', description: 'x'.repeat(3000), player: true }, { id: 'a', name: 'A', description: 'y'.repeat(3000) }] });
    expect(input.part_of_day).toBe('afternoon');
    expect(input.people.map((p) => p.description.length)).toEqual([2000, 600]);
    expect(pictureInput({ work: 'W', reply: 'r', focus: '', playerMessage: '', time: '', tick: null, people: [] }).part_of_day).toBe('');
    expect(pictureInput({ work: 'W', reply: 'r', focus: '  她躲开光炮的一刻 ', playerMessage: '', time: '', tick: null, people: [] }).focus).toBe('她躲开光炮的一刻');
  });

  it('PC7 the image services are not connected yet: both backends refuse', async () => {
    await expect(generateNovelAI(novelaiPrompt(picture({})))).rejects.toThrow(/not implemented/);
    await expect(generateComfy(plainPrompt(picture({})))).rejects.toThrow(/not implemented/);
  });

  it('PC8 the task instructions carry the shape with its choices', () => {
    expect(PROMPTS.picture).toContain('"body":"girl|boy|other"');
    expect(PROMPTS.picture).toContain('"framing":"close-up|portrait|upper body|cowboy shot|full body|wide shot"');
    expect(PROMPTS.picture).toContain('nothing sexual');
    expect(PROMPTS.picture).toContain('with a focus, the moment it describes');
    expect(PROMPTS.picture).toContain('an image model knows none it was not trained on');
  });
});
