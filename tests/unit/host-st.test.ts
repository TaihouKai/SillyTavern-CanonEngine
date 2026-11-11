// HS: what the SillyTavern host translates for the engine — World Info's secondary-key logic into the engine's lore
// entries, and settings saved under earlier names.
import { describe, expect, it } from 'vitest';
import { stLogic } from '../../src/hosts/sillytavern/st';
import { migrateSettings } from '../../src/hosts/sillytavern/settings';
import { keyMatches, type LoreEntry } from '../../src/core/runtime/lore';
import { termsFor } from '../../src/core/runtime/worldset';

const entry = (more: Partial<LoreEntry>): LoreEntry => ({ book: 'b', uid: 1, title: 'Council', keys: ['Council'], secondary: [], secondaryLogic: null, constant: false, disabled: false, caseSensitive: null, wholeWords: null, content: 'The Council rules the harbor.', ...more });

describe('SillyTavern host', () => {
  it('HS1 World Info selective + selectiveLogic (0 AND ANY, 1 NOT ALL, 2 NOT ANY, 3 AND ALL) become the engine’s secondary logic', () => {
    expect(stLogic({ selective: false, selectiveLogic: 2 })).toBeNull();
    expect(stLogic({ selective: true, selectiveLogic: 0 })).toBe('any');
    expect(stLogic({ selective: true, selectiveLogic: 1 })).toBe('not_all');
    expect(stLogic({ selective: true, selectiveLogic: 2 })).toBe('not_any');
    expect(stLogic({ selective: true, selectiveLogic: 3 })).toBe('all');
    expect(stLogic({ selective: true })).toBe('any');
  });

  it('HS2 an entry with secondary keys applies as its logic says', async () => {
    const { loreFor } = await import('../../src/core/runtime/lore');
    const pack = { entities: new Map([['council', { id: 'council', name: 'Council', aliases: [], kind: 'organization' }]]) } as any;
    const text = 'Ash works for the Council at the harbor.';
    const fires = (logic: LoreEntry['secondaryLogic'], secondary: string[]) => loreFor([entry({ secondary, secondaryLogic: logic })], text, pack).length > 0;
    expect(fires(null, ['moon'])).toBe(true);
    expect(fires('any', ['moon', 'harbor'])).toBe(true);
    expect(fires('any', ['moon'])).toBe(false);
    expect(fires('all', ['harbor', 'Ash'])).toBe(true);
    expect(fires('all', ['harbor', 'moon'])).toBe(false);
    expect(fires('not_any', ['harbor'])).toBe(false);
    expect(fires('not_any', ['moon'])).toBe(true);
    expect(fires('not_all', ['harbor', 'moon'])).toBe(true);
    expect(fires('not_all', ['harbor', 'Ash'])).toBe(false);
    expect(keyMatches('Council', text, entry({}))).toBe(true);
    expect(termsFor({ text: 'The Council', terms: ['Council'] }, [entry({})], null)).toContain('Council');
  });

  it('HS3 settings saved under the Horae names are kept under the scene tracker names', () => {
    const s: Record<string, unknown> = { followHoraeTime: false, horaeWaitMs: 5000, budgetChars: 1 };
    migrateSettings(s);
    expect(s).toEqual({ followTrackerTime: false, trackerWaitMs: 5000, budgetChars: 1 });
    const t: Record<string, unknown> = { followHoraeTime: true, followTrackerTime: false };
    migrateSettings(t);
    expect(t).toEqual({ followTrackerTime: false });
  });
});
