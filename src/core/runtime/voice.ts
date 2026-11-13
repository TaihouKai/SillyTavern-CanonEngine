// What the GM may write for the player character (settings: playerVoice). One list for the GM instruction, the
// reviewer and the panel. Acts the player wrote themselves are always theirs to carry out; a decision the GM
// voices is never recorded as the player's (decisions are read from the player's own messages only).

export const VOICE_KINDS = ['dialogue', 'reactions', 'actions', 'trivial', 'movement', 'items', 'skills', 'combat', 'decisions', 'secrets'] as const;
export type VoiceKind = typeof VOICE_KINDS[number];
export type PlayerVoice = Record<VoiceKind, boolean>;

/** What each kind covers, as the GM and the reviewer are told. */
export const VOICE_TEXT: Record<VoiceKind, string> = {
  dialogue: 'dialogue — what the player character says: replies, banter, questions, small talk',
  reactions: 'reactions — expressions, gestures, feelings and inner thoughts',
  actions: 'small actions — everyday acts and natural follow-through in the scene (drinking, picking up the phone, sitting down, walking along with someone)',
  trivial: 'trivial everyday matters — small things with objects and small yeses of the moment that commit the character to nothing (accepting a snack or a small gift, paying for a drink, taking a flyer, tasting something offered, sitting with someone who asks)',
  movement: 'movement — going somewhere else, leaving or ending the scene, travelling',
  items: 'items — using, giving away, taking or buying things that matter (equipment, valuables, key items, notable money); trivial everyday matters are their own kind',
  skills: 'abilities — using skills, powers or magic',
  combat: 'combat — attacking, fighting, hurting or killing someone',
  decisions: 'decisions — accepting or refusing requests, promises, agreements, consent that commit the character (a task, a plan, a promise, joining something); small yeses of the moment are trivial everyday matters, and answering a question, giving an opinion or an excuse, teasing back, explaining themselves, owning up, saying sorry or admitting what is true (how they feel included, when asked) is dialogue',
  secrets: 'secrets — revealing the secrets or the hidden identity the Persona gives the player character; keeping them is not: dodging, joking, denying or a cover story in keeping with the Persona is dialogue; someone learning one through their own power (reading the player character\'s mind) is the world finding out, not the player character revealing it. Everyday things (a prank they played, who they like, a slip-up) are not secrets unless the Persona makes them one',
};

/** Always the player's, whatever the settings (not a setting): the player character stepping into what others are
 *  doing. Live: the GM had Serafina cut 食蜂 off (「扇子别乱扇」) as she began on 初春 — a line of dialogue, allowed by the
 *  settings, that turned the course of a canon event the player never touched. */
export const INTERVENTION = 'intervention';
export const INTERVENTION_TEXT = 'intervention — the player character interrupting, stopping, preventing, exposing or redirecting a canonical event or another character\'s significant action, even by a single line of dialogue or a reaction aimed at it';

/** The player's choice by default: the GM voices the character in the scene; anything that commits them is theirs. */
export const DEFAULT_PLAYER_VOICE: PlayerVoice = { dialogue: true, reactions: true, actions: true, trivial: true, movement: false, items: false, skills: false, combat: false, decisions: false, secrets: false };

export function playerVoice(v: Partial<PlayerVoice> | null | undefined): PlayerVoice {
  const out = { ...DEFAULT_PLAYER_VOICE };
  for (const k of VOICE_KINDS) if (v && typeof v[k] === 'boolean') out[k] = v[k]!;
  return out;
}

export const voiceAllows = (v: PlayerVoice, kind: string | null | undefined) => !!kind && (VOICE_KINDS as readonly string[]).includes(kind) && v[kind as VoiceKind];

/** Live: the player character answered every remark with two or three flat words while the NPCs were vivid. */
export const LIVELY = 'Write the player character as vividly as anyone else in the scene: their lines and reactions carry their whole personality as the Persona gives it (how they come across and talk, in PLAYER IN THIS WORLD) — opinions, feelings, humour, their own questions, the way they put things. Never reduce them to short, flat, noncommittal replies.';
/** Live: with decisions left to the player, 佐天's six invitations got six dodges ("看情况", "再说吧", "下午再说"). */
export const REACT_NOT_DECIDE = 'When someone asks them to decide (an invitation, a request, a "will you…?"), still write their honest reaction — what they think of it, a complaint, a joke, a question back — as long as it neither accepts nor refuses; leave the yes or no itself to the player. Do not have them dodge every question with an empty non-answer, and do not have characters pile up several questions waiting on the player in one reply: one open question at the end is enough, and only one asking for such a decision.';

/** Live: whatever the Persona, the player character met teasing, being caught and flirting with the same stubborn denial
 *  (嘴硬). A probe (DeepSeek 4.1 flash, background-only Personas, teased about a crush / caught after a prank / teased
 *  about dating): 27 of 32 replies denied; with no Canon rules at all 24 of 32 — the model's own habit, which the rules
 *  (a dodge for a secret, "their front slipping") leaned into. */
export const TAKE_IT_AS_THEY_WOULD = 'How they take teasing, a question, being caught or flirting comes from who they are and the moment, not from a habit: they may own up, laugh along, say sorry, be plainly pleased or flustered and say so, get properly annoyed, play along, turn it back, or answer seriously. Denial and a stubborn front (嘴硬) are one way among these, for a character who would — never the default: when the Persona does not say how they take such things, let them admit what is plainly true about as often as not (asked whether they like someone they do like, they may say yes, laugh and not deny it, or go red and say so), and vary it from one exchange to the next.';

/** Live: 黑子 accused the player character at length, 美琴 asked 「你倒是说句话啊」, and the player character only thought —
 *  the GM held back a plain denial as if it were a decision or a secret, so the player stood mute through the exchange. */
export const ANSWER_IN_SCENE = 'A reply is a whole exchange, not one line from the others: when characters speak to the player character — tease, question or accuse them — the player character answers out loud in the same reply, as the Persona would, and the talk goes on between them; thoughts and looks alone are not an answer. Do not stop the reply on something the player character would simply answer ("where were you last night?", "say something!"): write their answer and go on. Stop where only the player can go on — a decision of the kinds left to the player, or a new turn in the scene.';

/** The GM instruction line for the player character. */
export function voiceRule(v: PlayerVoice, leap = false): string {
  const may = VOICE_KINDS.filter((k) => v[k]);
  const not = VOICE_KINDS.filter((k) => !v[k]);
  const own = 'Actions the player wrote are theirs: carry them out with their natural steps and immediate details.';
  const always = leap ? ' During this time leap the player character also steps into events as the TIME LEAP section says.' : ` Always leave to the player, whatever else you may write for them: ${INTERVENTION_TEXT}. When a canonical event or another character's significant act happens in front of the player character, let it go on as it would; you may show what the player character notices or suspects, but any interference is the player's to write (they can still act in their next message).`;
  if (!may.length) return `${own} Do not supply new voluntary player actions, decisions, dialogue, consent, or equipment/skill use.${always}`;
  return `THE PLAYER CHARACTER: the player wants you to write these for their character, in character with their Persona and the scene — do it naturally, as part of the scene: ${may.map((k) => VOICE_TEXT[k]).join('; ')}. `
    + (v.dialogue || v.reactions ? `${LIVELY} ${TAKE_IT_AS_THEY_WOULD} ` : '')
    + (v.dialogue ? `${ANSWER_IN_SCENE} ` : '')
    + (not.length ? `Leave these to the player (do not write them unless the player's message does): ${not.map((k) => VOICE_TEXT[k]).join('; ')}. ` : '')
    + (v.dialogue && !v.decisions ? `${REACT_NOT_DECIDE} ` : '')
    + own + always;
}

/** The same, as a short note right after the player's message (with the reply length): the GM rule alone sits above the
 *  last message, and a GM preset's "only what the player intended" read the player's one line as all they wanted said
 *  (probe, real preset: 0 of 4 replies had the player character answer an accusation; 3 of 4 with this note). */
export function voiceTurnNote(v: PlayerVoice): string {
  if (!v.dialogue) return '';
  return 'The player character in this reply: they answer out loud whatever is said to them, in their own voice (the Persona is what the player wants; their message need not ask for it), and the talk goes on — in the way they would take it: owning up, laughing along, a sincere answer or a joke back; not a denial by habit — unless that is who they are, what is plainly true they may simply admit (a dodge or a cover story is for a secret they keep).'
    + (v.decisions ? '' : ' Stop only at a decision the player must make.');
}

/** For the reviewer: what it may let stand without the player having written it. */
export function voiceInput(v: PlayerVoice) {
  return { gm_may_write: VOICE_KINDS.filter((k) => v[k]), player_only: [...VOICE_KINDS.filter((k) => !v[k]), INTERVENTION] };
}
