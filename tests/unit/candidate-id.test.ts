// CI: a reference's candidate the model wrote as a name made into an id is the one entity it names (live: the
// silver-haired nun was "index-librorum-prohibitorum", an alias of 茵蒂克丝 as an id, and so nobody).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeEngine, tick } from './fake';
import { ROOT } from './helpers';
import { candidateId, peopleOfNow } from '../../src/core/runtime/engine';

describe('a candidate written as a name', () => {
  it('CI1 an id stays; a name as an id is the one it names; one that names nobody, or several, is none', async () => {
    const x = makeEngine();
    await x.engine.bind(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'), { startTick: tick(1, 6, 0), mode: 'new' });
    await x.engine.reconcile('test');
    const idx = x.engine.current!.index;
    expect(candidateId(idx, 'mira')).toBe('mira');
    expect(candidateId(idx, 'doctor-mira')).toBe('mira');
    expect(candidateId(idx, 'the_council')).toBe('council');
    expect(candidateId(idx, 'conflict-begins')).toBe('conflict-begins');
    expect(candidateId(idx, 'nobody-at-all')).toBeNull();
    expect(candidateId(idx, 'the')).toBeNull();
  });
});

describe('who may be about now', () => {
  it('CI2 the people of an event starting within three hours, or under way, nearest first; not five hours before, nor once it is over', async () => {
    const x = makeEngine();
    await x.engine.bind(readFileSync(join(ROOT, 'examples', 'demo.canon.json'), 'utf8'), { startTick: tick(1, 8, 0), mode: 'new' });
    await x.engine.reconcile('test');
    const idx = x.engine.current!.index;
    const kinds = (ids: string[]) => ids.map((id) => idx.entityKind(id));
    expect(peopleOfNow(idx)).toContain('mira');
    expect(kinds(peopleOfNow(idx)).every((k) => k === 'person')).toBe(true);
    expect(peopleOfNow(idx, tick(1, 5, 0))).not.toContain('mira');
    expect(peopleOfNow(idx, tick(1, 12, 0))).not.toContain('mira');
  });
});

