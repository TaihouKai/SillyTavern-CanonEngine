// "Reply finished" alert for slow turns: when a turn ends while the tab is in the background, a system
// notification (browsers allow it only on https or localhost), a mark in the tab title until the tab is
// seen again, and optionally a short chime.

export interface DoneInfo { ok: boolean; title: string; body: string }

let titleBase: string | null = null;
let audio: AudioContext | null = null;
let last: Notification | null = null;

/** Whether the browser can show system notifications on this page (secure context + API present). */
export function systemNotificationsAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.isSecureContext && typeof (window as any).Notification === 'function';
}

/** Ask for notification permission once (called when a turn starts, i.e. right after the user acted). */
export function primeNotifications(): void {
  try {
    if (systemNotificationsAvailable() && Notification.permission === 'default') void Notification.requestPermission();
  } catch { /* optional */ }
  try {
    // An AudioContext created after a user action may play later without another gesture.
    if (!audio && typeof AudioContext === 'function') audio = new AudioContext();
  } catch { /* optional */ }
}

function inBackground(): boolean {
  return document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus());
}

function markTitle(mark: string) {
  if (titleBase === null) titleBase = document.title;
  document.title = `${mark} ${titleBase}`;
  const restore = () => {
    if (document.hidden) return;
    if (titleBase !== null) document.title = titleBase;
    titleBase = null;
    document.removeEventListener('visibilitychange', restore);
    window.removeEventListener('focus', restore);
  };
  document.addEventListener('visibilitychange', restore);
  window.addEventListener('focus', restore);
}

function chime(ok: boolean) {
  try {
    if (!audio) audio = new AudioContext();
    void audio.resume();
    const t0 = audio.currentTime;
    (ok ? [660, 880] : [440, 330]).forEach((f, i) => {
      const o = audio!.createOscillator(), g = audio!.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.12, t0 + i * 0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.18 + 0.3);
      o.connect(g).connect(audio!.destination);
      o.start(t0 + i * 0.18);
      o.stop(t0 + i * 0.18 + 0.32);
    });
  } catch { /* optional */ }
}

/** Returns what was done (for tests and the debug log). */
export function notifyDone(info: DoneInfo, opts: { sound: boolean; titleMark: string; force?: boolean }): string[] {
  const done: string[] = [];
  if (!opts.force && !inBackground()) return done;
  if (systemNotificationsAvailable() && Notification.permission === 'granted') {
    try {
      // A notification with the tag of one still in the system's notification center only replaces it
      // silently (no popup) unless renotify is set, so every alert after the first stayed hidden.
      try { last?.close(); } catch { /* ignore */ }
      const n = new Notification(info.title, { body: info.body, tag: 'canon-engine-done', renotify: true } as NotificationOptions);
      n.onclick = () => { try { window.focus(); } catch { /* ignore */ } n.close(); };
      n.onclose = () => { if (last === n) last = null; };
      last = n;
      done.push('notification');
    } catch { /* e.g. mobile Chrome needs a service worker */ }
  }
  markTitle(opts.titleMark);
  done.push('title');
  if (opts.sound) { chime(info.ok); done.push('sound'); }
  return done;
}
