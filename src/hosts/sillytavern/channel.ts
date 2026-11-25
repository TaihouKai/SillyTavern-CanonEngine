// Which way this copy was installed. The main branch carries changes not yet verified; a release (the `release`
// branch, or a version tag) is what was tested end to end. User, 2026-11-25: someone who installed main and not a
// release should be told so. Asked of SillyTavern's own extension API: a copy on a branch reports its name; a copy
// cloned at a tag has no branch (SillyTavern's version call fails then), and a copy not from git has none either.
// Shown once per commit: the next update to a new commit of main tells it again.
import { t } from '../../core';
import { ctx } from './st';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The extension's folder name, from the address this script was loaded from (…/third-party/<folder>/dist/index.js). */
export function folderOf(url: string): string | null {
  const m = /\/scripts\/extensions\/third-party\/([^/?#]+)\//.exec(decodeURIComponent(url));
  return m ? m[1] : null;
}

/** The branch and commit this copy is on, or null when SillyTavern cannot tell (a tag, not a git copy, no access). */
export async function installedFrom(folder: string): Promise<{ branch: string; commit: string } | null> {
  const c = ctx();
  const headers = c.getRequestHeaders();
  let global = false;
  try {
    const list = await (await fetch('/api/extensions/discover', { headers })).json();
    global = Array.isArray(list) && list.some((x: any) => x?.name === `third-party/${folder}` && x?.type === 'global');
  } catch { /* the version call below says it */ }
  try {
    const r = await fetch('/api/extensions/version', { method: 'POST', headers, body: JSON.stringify({ extensionName: folder, global }) });
    if (!r.ok) return null;
    const v = await r.json();
    return v?.currentBranchName ? { branch: String(v.currentBranchName), commit: String(v.currentCommitHash || '') } : null;
  } catch { return null; }
}

/** On main: one warning per commit (remembered in the extension's settings). */
export async function warnIfMain(settings: () => { mainWarnedCommit?: string }, url = import.meta.url): Promise<boolean> {
  // test browsers (Canon's own e2e and live tests) set this before the page loads: the warning is the user's to see
  if ((globalThis as any).__canonNoInstallCheck) return false;
  const folder = folderOf(url);
  if (!folder) return false;
  const at = await installedFrom(folder);
  if (!at || at.branch !== 'main') return false;
  const s = settings();
  if (s.mainWarnedCommit === at.commit) return false;
  const c = ctx() as any;
  const html = `<h3>${t('mainWarnTitle')}</h3><p>${t('mainWarnBody')}</p><p>${t('mainWarnHow')}</p><p><small>${t('mainWarnOnce')}</small></p>`;
  s.mainWarnedCommit = at.commit;
  c.saveSettingsDebounced?.();
  if (typeof c.callGenericPopup === 'function') await c.callGenericPopup(html, c.POPUP_TYPE?.TEXT ?? 1, '', { okButton: t('mainWarnOk'), wide: false });
  else (globalThis as any).toastr?.warning?.(t('mainWarnBody'), t('mainWarnTitle'), { timeOut: 20000 });
  return true;
}
