// What the GM may write for the player character (settings: playerVoice). One list for the GM instruction, the
// reviewer and the panel. Acts the player wrote themselves are always theirs to carry out; a decision the GM
// voices is never recorded as the player's (decisions are read from the player's own messages only).

export const VOICE_KINDS = ['dialogue', 'reactions', 'actions', 'movement', 'items', 'skills', 'combat', 'decisions', 'secrets'] as const;
export type VoiceKind = typeof VOICE_KINDS[number];
export type PlayerVoice = Record<VoiceKind, boolean>;

/** What each kind covers, as the GM and the reviewer are told. */
export const VOICE_TEXT: Record<VoiceKind, string> = {
  dialogue: 'dialogue — what the player character says: replies, banter, questions, small talk',
  reactions: 'reactions — expressions, gestures, feelings and inner thoughts',
  actions: 'small actions — everyday acts and natural follow-through in the scene (drinking, picking up the phone, sitting down, walking along with someone)',
  movement: 'movement — going somewhere else, leaving or ending the scene, travelling',
  items: 'items — using, giving away, taking or buying things',
  skills: 'abilities — using skills, powers or magic',
  combat: 'combat — attacking, fighting, hurting or killing someone',
  decisions: 'decisions — accepting or refusing requests, promises, agreements, consent',
  secrets: 'secrets — revealing the player character\'s secrets or hidden identity',
};

/** The player's choice by default: the GM voices the character in the scene; anything that commits them is theirs. */
export const DEFAULT_PLAYER_VOICE: PlayerVoice = { dialogue: true, reactions: true, actions: true, movement: false, items: false, skills: false, combat: false, decisions: false, secrets: false };

export function playerVoice(v: Partial<PlayerVoice> | null | undefined): PlayerVoice {
  const out = { ...DEFAULT_PLAYER_VOICE };
  for (const k of VOICE_KINDS) if (v && typeof v[k] === 'boolean') out[k] = v[k]!;
  return out;
}

export const voiceAllows = (v: PlayerVoice, kind: string | null | undefined) => !!kind && (VOICE_KINDS as readonly string[]).includes(kind) && v[kind as VoiceKind];

/** The GM instruction line for the player character. */
export function voiceRule(v: PlayerVoice): string {
  const may = VOICE_KINDS.filter((k) => v[k]);
  const not = VOICE_KINDS.filter((k) => !v[k]);
  const own = 'Actions the player wrote are theirs: carry them out with their natural steps and immediate details.';
  if (!may.length) return `${own} Do not supply new voluntary player actions, decisions, dialogue, consent, or equipment/skill use.`;
  return `THE PLAYER CHARACTER: the player wants you to write these for their character, in character with their Persona and the scene — do it naturally, as part of the scene: ${may.map((k) => VOICE_TEXT[k]).join('; ')}. `
    + (not.length ? `Leave these to the player (do not write them unless the player's message does): ${not.map((k) => VOICE_TEXT[k]).join('; ')}. ` : '')
    + own;
}

/** For the reviewer: what it may let stand without the player having written it. */
export function voiceInput(v: PlayerVoice) {
  return { gm_may_write: VOICE_KINDS.filter((k) => v[k]), player_only: VOICE_KINDS.filter((k) => !v[k]) };
}
