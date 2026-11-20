// NSFW 场景: while the player character is in a sexual or erotic scene, the world does not reach out to them — no
// world reaction, no contact their position binds them to, no grudge or danger coming for them, no canon event coming
// to someone with them by chance, no pack hook — and the GM is told nobody from outside interrupts. What was due waits:
// it comes on the first reply after the scene. The scene is read from the player's message (it opens, carries on or
// ends one) and from the review of the last reply (it ended inside one).

/** extract_user: what the player's message does to such a scene (interpolated into its prompt by runtime/prompts.ts). */
export const EXTRACT_NSFW = `nsfw: "on" when the message opens or carries on a sexual or erotic scene the player character is in (undressing or foreplay for it included); "off" when it ends such a scene or leaves it (they part, get dressed and go out, the time skips past it); "none" when it says nothing either way.`;

/** evaluate: whether the reply ends inside such a scene (interpolated into its prompt by runtime/prompts.ts). */
export const EVAL_NSFW = `   nsfw: true when the reply ENDS inside a sexual or erotic scene the PLAYER CHARACTER is in and it is still going on; false otherwise (also when such a scene ended within the reply).`;

/** The extract_user answer as kept with the player's message: true (on), false (off), undefined (says nothing). */
export function nsfwOfMessage(v: unknown): boolean | undefined {
  return v === 'on' ? true : v === 'off' ? false : undefined;
}

/** Whether this reply is written inside such a scene: the player's message decides when it says; else the reply it
 *  continues (when continuing) or the last reply. */
export function nsfwScene(a: { message?: boolean; continued?: boolean; lastReply?: boolean }): boolean {
  if (typeof a.message === 'boolean') return a.message;
  return !!(a.continued || a.lastReply);
}

/** The GM's instruction while the world holds back. */
export const NSFW_SECTION = 'PRIVATE SCENE: the player character is in an intimate scene. The world does not reach out to them in this reply: nobody arrives, knocks, calls, messages or interrupts, no news, request, danger or canon event comes to them or to the people with them, unless the player\'s message brings it in. Whatever was due waits until the scene is over.';
