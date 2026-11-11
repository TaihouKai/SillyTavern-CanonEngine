// The site's live demo, built from the engine's own code (scripts/build-site.mjs bundles it): the example pack is
// validated and loaded as the engine loads it, its canon is replayed up to the story time the visitor picks (the
// bootstrap a new game runs), and the timeline window — the extension's own — shows the result, with its 组织成员
// and 常态 views. Nothing here reads the pack's format by itself, so the site follows the engine when packs change.
import { validatePackText, buildBootstrap, reduce, WorldIndex, parseOriginLabel, formatTick, GraphPanel, packGraph, currentGraph, setLang, t, membershipView, natureView, type LoadedPack, type WorldState, type LedgerRecord, type NatureViewData } from '../../src/core';

export interface DemoStats { events: number; entities: number; people: number; orgs: number; arcs: number; hard: number; natures: number; minds: number; title: string; errors: number; warnings: number }
export interface Demo {
  stats: DemoStats;
  /** Everyone with a way of thinking or a nature, as the timeline's 常态 view lists them (spoilers on). */
  nature: NatureViewData;
  setLang(l: 'en' | 'zh'): void;
  /** The engine's own interface text, in the current language. */
  label(key: string): string;
}

const DAY = 1440;

/** Loads the pack and mounts the timeline window into `host`, with a story-time slider in `controls`. */
export async function startDemo(url: string, host: HTMLElement, controls: HTMLElement, lang: 'en' | 'zh'): Promise<Demo> {
  setLang(lang);
  const text = await (await fetch(url)).text();
  const r = validatePackText(text);
  if (!r.ok || !r.loaded) throw new Error('example pack failed validation: ' + r.errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; '));
  const L: LoadedPack = r.loaded;
  const origin = parseOriginLabel(L.pack.calendar.origin_label);
  WorldIndex.displayOrigin = origin;

  // the canon replayed to a story time, as a game started then would have it
  const worldAt = (tick: number): { state: WorldState; idx: WorldIndex } => {
    const boot = buildBootstrap(L, tick);
    const state = reduce(L, boot.records.map((x, i) => ({ ...x, sequence: i + 1, branchId: 'demo', commitId: 'demo' }) as LedgerRecord));
    return { state, idx: new WorldIndex(L, state) };
  };

  // the slider runs from the first dated arc after the prehistory to the end of the pack
  const starts = [...L.pack.arcs].map((a) => L.timeIndex.filter((t) => L.events.get(t.id)!.arc_id === a.id).map((t) => t.lo)).filter((x) => x.length).map((x) => Math.min(...x)).sort((a, b) => a - b);
  const lo = Math.max(L.coverage.start, starts.find((t) => t > -800 * DAY) ?? L.coverage.start);
  const hi = L.coverage.end;
  let tick = Math.min(hi, Math.max(lo, 30 * DAY));
  let world = worldAt(tick);

  const panel = new GraphPanel(() => {
    const pg = packGraph(L, origin); pg.nowTick = tick;
    const cur = currentGraph(L, world.state, origin, true); cur.nowTick = tick;
    return { pack: pg, current: cur, spoilers: true, preview: L.pack.title };
  }, () => undefined, async () => undefined, () => [], () => membershipView(world.idx, tick, origin, true), () => natureView(world.idx, true));
  host.appendChild(panel.el);
  panel.toggle(true);

  // the story-time control
  controls.innerHTML = `<input type="range" class="demo-time" min="${Math.floor(lo / DAY)}" max="${Math.ceil(hi / DAY)}" step="1" value="${Math.floor(tick / DAY)}"><output class="demo-date"></output>`;
  const slider = controls.querySelector('input')!, out = controls.querySelector('output')!;
  const arcAt = (t: number) => {
    let best: { title: string; lo: number } | null = null;
    for (const a of L.pack.arcs) {
      const ts = L.timeIndex.filter((x) => L.events.get(x.id)!.arc_id === a.id);
      if (!ts.length) continue;
      const a0 = Math.min(...ts.map((x) => x.lo)), a1 = Math.max(...ts.map((x) => x.hi));
      if (a0 <= t && t <= a1 && (!best || a0 > best.lo)) best = { title: a.title, lo: a0 };
    }
    return best?.title || '';
  };
  const label = () => { const a = arcAt(tick); out.innerHTML = `<b>${formatTick(tick, origin).replace(/\s.*$/, '')}</b>${a ? `<span>${a.replace(/[<>&]/g, '')}</span>` : ''}`; };
  label();
  let timer: ReturnType<typeof setTimeout> | null = null;
  slider.addEventListener('input', () => {
    tick = Number(slider.value) * DAY;
    label();
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { world = worldAt(tick); panel.refreshIfChanged(`${tick}`); }, 180);
  });

  const all = natureView(worldAt(hi).idx, true);
  const ents = [...L.entities.values()];
  return {
    stats: {
      title: L.pack.title, events: L.events.size, entities: L.entities.size, people: ents.filter((e) => e.kind === 'person').length,
      orgs: ents.filter((e) => e.kind === 'organization').length, arcs: L.pack.arcs.length, hard: L.hardEvents.length,
      natures: ents.filter((e) => e.nature?.length).length, minds: ents.filter((e) => e.mind).length,
      errors: r.errors.length, warnings: r.warnings.length,
    },
    nature: all,
    setLang(l) { setLang(l); label(); panel.refreshIfChanged(`${tick}|${l}`); },
    label: (key) => t(key),
  };
}
