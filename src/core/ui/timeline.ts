// What the timeline window shows for the game in play: the pack's canon and this game's actual history, with "now",
// the scene's frame, the events the player focused and what can be re-analysed. Every host's timeline window reads it.
import type { CanonEngine } from '../runtime/engine';
import { currentGraph, packGraph, type GraphData } from './graph';

export function timelineData(engine: CanonEngine): { pack: GraphData | null; current: GraphData | null; spoilers: boolean; digested?: boolean } {
  const src = (() => { try { return engine.graphSource(); } catch { return null; } })();
  const camp = engine.campaign();
  const spoilers = !!camp?.uiPreferences.spoilers;
  if (!src) return { pack: null, current: null, spoilers };
  const now = src.state ? (engine.storyNow() ?? src.state.clock.lo) : null;
  const pg = packGraph(src.pack, src.origin); pg.nowTick = now;
  const cur = src.state ? currentGraph(src.pack, src.state, src.origin, spoilers, engine.digestGroups()) : null;
  if (cur && now !== null) cur.nowTick = now;
  const frameNow = (() => { try { return engine.sceneFrameNow(); } catch { return null; } })();
  if (cur?.frames && frameNow) cur.frames.now = frameNow;
  if (cur) { const f = engine.focusEvents(); for (const n of cur.nodes) if (f.has(n.id) && (n.status === 'future' || n.status === 'pending')) { n.focused = true; n.title = '★ ' + n.title; } }
  if (cur) for (const n of cur.nodes) if (n.members && engine.occurrenceSources(n.members).length) n.reanalyzable = true;
  if (cur) for (const n of cur.nodes) if ((n.status === 'occurred' || n.status === 'diverged' || n.status === 'omitted') && (n.afterStory || engine.reanalyzableSource(n.id))) n.reanalyzable = true;
  return { pack: pg, current: cur, spoilers, digested: !!camp?.eventDigest };
}
