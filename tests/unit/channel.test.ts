// CH: a copy installed from main (not from a release) says so, once per commit (src/hosts/sillytavern/channel.ts).
// User, 2026-11-25: someone who installed main and not a tag should be warned that main may hold unverified changes.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { folderOf, warnIfMain } from '../../src/hosts/sillytavern/channel';

const URL_GLOBAL = 'http://127.0.0.1:8000/scripts/extensions/third-party/SillyTavern-CanonEngine/dist/index.js';
function tavern(version: { status?: number; body?: unknown }, type: 'global' | 'local' = 'global') {
  const popups: string[] = [];
  const asked: any[] = [];
  const saved = vi.fn();
  (globalThis as any).SillyTavern = { getContext: () => ({ getRequestHeaders: () => ({}), saveSettingsDebounced: saved, POPUP_TYPE: { TEXT: 1 }, callGenericPopup: async (html: string) => { popups.push(html); } }) };
  globalThis.fetch = vi.fn(async (url: any, init?: any) => {
    if (String(url).includes('/discover')) return new Response(JSON.stringify([{ type, name: 'third-party/SillyTavern-CanonEngine' }]));
    asked.push(JSON.parse(init.body));
    return version.status && version.status !== 200 ? new Response('fail', { status: version.status }) : new Response(JSON.stringify(version.body));
  }) as any;
  return { popups, asked, saved };
}
afterEach(() => { delete (globalThis as any).SillyTavern; });

describe('the warning for a copy installed from main', () => {
  it('CH1 the folder comes from the address the bundle was loaded from', () => {
    expect(folderOf(URL_GLOBAL)).toBe('SillyTavern-CanonEngine');
    expect(folderOf('http://x/scripts/extensions/third-party/My%20Copy/dist/index.js')).toBe('My Copy');
    expect(folderOf('http://x/somewhere/index.js')).toBeNull();
  });

  it('CH2 on main: warned once per commit, and again for a new commit', async () => {
    const s: { mainWarnedCommit?: string } = {};
    let tv = tavern({ body: { currentBranchName: 'main', currentCommitHash: 'aaa' } });
    expect(await warnIfMain(() => s, URL_GLOBAL)).toBe(true);
    expect(tv.popups[0]).toContain('main');
    expect(tv.asked[0]).toEqual({ extensionName: 'SillyTavern-CanonEngine', global: true });
    expect(s.mainWarnedCommit).toBe('aaa');
    expect(tv.saved).toHaveBeenCalled();
    tv = tavern({ body: { currentBranchName: 'main', currentCommitHash: 'aaa' } });
    expect(await warnIfMain(() => s, URL_GLOBAL)).toBe(false);
    expect(tv.popups).toEqual([]);
    tv = tavern({ body: { currentBranchName: 'main', currentCommitHash: 'bbb' } }, 'local');
    expect(await warnIfMain(() => s, URL_GLOBAL)).toBe(true);
    expect(tv.asked[0].global).toBe(false);
  });

  it('CH3 a release branch, a tag (SillyTavern cannot tell its branch: the call fails) or a copy not from git: no warning', async () => {
    for (const v of [{ body: { currentBranchName: 'release', currentCommitHash: 'c' } }, { status: 500 }, { body: { currentBranchName: '', currentCommitHash: '' } }]) {
      const tv = tavern(v);
      expect(await warnIfMain(() => ({}), URL_GLOBAL)).toBe(false);
      expect(tv.popups).toEqual([]);
    }
  });
});
