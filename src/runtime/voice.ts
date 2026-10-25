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

/** Always the player's, whatever the settings (not a setting): the player character stepping into what others are
 *  doing. Live: the GM had Serafina cut 食蜂 off (「扇子别乱扇」) as she began on 初春 — a line of dialogue, allowed by the
 *  settings, that turned the course of a canon event the player never touched. */
export const INTERVENTION = 'intervention';
export const INTERVENTION_TEXT = 'intervention — the player character interrupting, stopping, preventing, exposing or redirecting a canonical event or another character\'s significant action, even by a single line of dialogue or a reaction aimed at it';

/** The player's choice by default: the GM voices the character in the scene; anything that commits them is theirs. */
export const DEFAULT_PLAYER_VOICE: PlayerVoice = { dialogue: true, reactions: true, actions: true, movement: false, items: false, skills: false, combat: false, decisions: false, secrets: false };

export function playerVoice(v: Partial<PlayerVoice> | null | undefined): PlayerVoice {
  const out = { ...DEFAULT_PLAYER_VOICE };
  for (const k of VOICE_KINDS) if (v && typeof v[k] === 'boolean') out[k] = v[k]!;
  return out;
}

export const voiceAllows = (v: PlayerVoice, kind: string | null | undefined) => !!kind && (VOICE_KINDS as readonly string[]).includes(kind) && v[kind as VoiceKind];

/** Live: the player character answered every remark with two or three flat words while the NPCs were vivid. */
export const LIVELY = 'Write the player character as vividly as anyone else in the scene: their lines and reactions carry their whole personality as the Persona gives it (how they come across and talk, in PLAYER IN THIS WORLD) — opinions, feelings, humour, their own questions, the way they put things. Never reduce them to short, flat, noncommittal replies.';
/** Live: with decisions left to the player, 佐天's six invitations got six dodges ("看情况", "再说吧", "下午再说"). */
export const REACT_NOT_DECIDE = 'When someone asks them to decide (an invitation, a request, a "will you…?"), still write their honest reaction — what they think of it, a complaint, a joke, a question back, their front slipping — as long as it neither accepts nor refuses; leave the yes or no itself to the player. Do not have them dodge every question with an empty non-answer, and do not have characters pile up several questions waiting on the player in one reply: one open question at the end is enough.';

/** The GM instruction line for the player character. */
export function voiceRule(v: PlayerVoice): string {
  const may = VOICE_KINDS.filter((k) => v[k]);
  const not = VOICE_KINDS.filter((k) => !v[k]);
  const own = 'Actions the player wrote are theirs: carry them out with their natural steps and immediate details.';
  const always = ` Always leave to the player, whatever else you may write for them: ${INTERVENTION_TEXT}. When a canonical event or another character's significant act happens in front of the player character, let it go on as it would; you may show what the player character notices or suspects, but any interference is the player's to write (they can still act in their next message).`;
  if (!may.length) return `${own} Do not supply new voluntary player actions, decisions, dialogue, consent, or equipment/skill use.${always}`;
  return `THE PLAYER CHARACTER: the player wants you to write these for their character, in character with their Persona and the scene — do it naturally, as part of the scene: ${may.map((k) => VOICE_TEXT[k]).join('; ')}. `
    + (v.dialogue || v.reactions ? `${LIVELY} ` : '')
    + (not.length ? `Leave these to the player (do not write them unless the player's message does): ${not.map((k) => VOICE_TEXT[k]).join('; ')}. ` : '')
    + (v.dialogue && !v.decisions ? `${REACT_NOT_DECIDE} ` : '')
    + own + always;
}

/** For the reviewer: what it may let stand without the player having written it. */
export function voiceInput(v: PlayerVoice) {
  return { gm_may_write: VOICE_KINDS.filter((k) => v[k]), player_only: [...VOICE_KINDS.filter((k) => !v[k]), INTERVENTION] };
}
