// Out-of-character parts of the player's message, marked with the OOC keyword (setting oocKeyword, default "OOC"):
// "(OOC: if A, then B)", "（OOC：…）", "[OOC …]", "【OOC：…】", or a line starting with "OOC:". They are directions
// for this reply: the story model never sees them as story text (they are removed from its chat history and given
// as a hidden note instead), and the reviewer checks that they are applied silently.

export interface OocSplit {
  /** The message without its OOC parts (what the player character says and does). */
  story: string;
  /** The OOC parts' contents, keyword and brackets removed. */
  ooc: string[];
}

const OPEN: Record<string, string> = { '(': ')', '（': '）', '[': ']', '【': '】', '{': '}', '<': '>', '〈': '〉', '《': '》' };
const CLOSERS = new Set(Object.values(OPEN));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function splitOoc(text: string, keyword: string): OocSplit {
  const kw = String(keyword || '').trim();
  const src = String(text || '');
  if (!kw || !src) return { story: src, ooc: [] };
  // the keyword, then a separator or the end of the part (not "OOCX")
  const head = new RegExp(`^\\s*${escape(kw)}(?![\\p{L}\\p{N}_])\\s*[:：\\-—]?\\s*`, 'iu');
  const ooc: string[] = [];
  let story = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const close = OPEN[ch];
    const m = close ? head.exec(src.slice(i + 1)) : null;
    if (close && m) {
      // the matching bracket, counting nested brackets of any kind ("(OOC: if A (x), then B)")
      let depth = 1, j = i + 1;
      for (; j < src.length; j++) {
        if (OPEN[src[j]]) depth++;
        else if (CLOSERS.has(src[j]) && --depth === 0) break;
      }
      const body = src.slice(i + 1 + m[0].length, j).trim();
      if (body) ooc.push(body);
      i = j + 1;
      continue;
    }
    story += ch;
    i++;
  }
  // "OOC: ..." on a line of its own, up to the end of the line
  const line = new RegExp(`^[ \\t]*${escape(kw)}(?![\\p{L}\\p{N}_])[ \\t]*[:：][ \\t]*(.*)$`, 'gimu');
  story = story.replace(line, (_all, body: string) => { if (body.trim()) ooc.push(body.trim()); return ''; });
  if (!ooc.length) return { story: src, ooc: [] };
  return { story: story.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(), ooc };
}

/** The message as the story model sees it in its chat history: without OOC parts; a message that was only OOC
 *  becomes a silent beat (some providers refuse an empty user message). */
export function storyOnly(text: string, keyword: string): string {
  const s = splitOoc(text, keyword);
  return s.ooc.length ? s.story || '……' : text;
}

/** Hidden note for the story model with this turn's OOC directions. */
export function oocNote(ooc: string[]): string {
  if (!ooc.length) return '';
  return [
    "PLAYER'S OUT-OF-CHARACTER INSTRUCTIONS for this reply (written outside the story: not something the player character says, thinks or knows):",
    ...ooc.map((o) => `- ${o}`),
    'Apply them silently. Never narrate, quote, paraphrase or hint at them, and never show the player character weighing, planning or "considering" them. A conditional instruction ("if C, then D") takes effect only when C actually happens in this reply: then the player character simply does D, as their own natural reaction. If C does not happen, it does nothing — do not arrange the scene to make C happen. Other instructions (how to play the scene, what to skip) are followed as directions for this reply.',
  ].join('\n');
}
