"""Prompts for the three model steps. Bump a VERSION when its prompt changes (cached results are keyed by it)."""

CHANGE_KINDS = {
    'death': 'a living being dies (value: how, briefly)',
    'vanish': 'a summoned spirit, ghost or other non-living being disappears or is destroyed (value: how)',
    'revive': 'someone dead or vanished comes back or is summoned again (value: how)',
    'injury': 'a lasting injury or physical condition (value: the condition)',
    'recovery': 'that condition ends (value: how, e.g. 已痊愈)',
    'moves': 'someone ends the beat at a different place (value: the place)',
    'joins': 'someone joins an organization or group (object: the organization)',
    'leaves': 'someone leaves an organization or group (object: the organization)',
    'leads': 'someone becomes the leader of an organization (object: the organization)',
    'learns': 'someone learns an important secret or truth (value: what they now know, stated as a fact)',
    'status': 'a lasting change of someone\'s situation not covered above (captured, freed, contracted to a master, …) (value: the new situation)',
    'condition': 'a place or object changes physical state (value: e.g. 毁坏, 修复)',
    'obtains': 'someone takes possession of an important object (object: the object)',
    'form': 'someone\'s body or form changes (value: the new form)',
}

SUMMARY_VERSION = 'unit-5'

SUMMARY_SYSTEM = """You turn one section of a story's script into a structured record for a history database that a game master will use to run the story with a player.

Write every prose field in {lang}. Be concrete: name who does what, where, and why. Never invent anything the text does not say or clearly imply; when something is unclear, say so in open_questions instead of guessing.

Be brief. This record is read every turn of a game, so keep facts, not dialogue: state what happens and what is revealed, never retell the conversation line by line or quote speeches. course: 1 to 4 sentences (about 60 to 200 characters); result: 1 or 2 sentences; trigger, background and each motive: one sentence.

Split the section into BEATS. One beat = one happening with one cause (a meeting, a fight, a revelation, a decision, a departure). Test: could the player change one part while the other still happens? If yes, they are separate beats. Fold small talk and jokes into the beat they belong to. A section usually has 1 to 4 beats; a long one may have more. Beats are in story order.

For each beat:
- title: a short name for what happens (at most 20 characters).
- background: the standing situation going in, if it matters and is not the trigger (optional, may be "").
- trigger: what sets it off.
- motives: one entry per key character or group whose decision drives the beat: what they want, why, and what they know or do not know. Empty for a beat no decision drives.
- course: what happens, in order: who does what and how. Keep the details that matter later (names, means, promises, what is revealed).
- result: the state afterwards: who is where, what changed, who now knows what.
- aftermath: later happenings of the same thread inside this section that are not consequences (optional, "").
- note: guidance for a game master running this beat, e.g. what may change and what must stay (optional, ""). Not for your own uncertainties: those go to open_questions. The player is not {protagonist}: never suggest that the player speaks, chooses or acts for {protagonist}.
- extra: an object for story information that fits none of the fields above, as {{"label": "text"}} with a short label of your own (a name of a technique, a promise, a rule of the place). Never drop information because it has no field, but keep each entry short.
- home: true when the beat takes place at the protagonist's home base ({home}) rather than in this chapter's own setting; else false.
- people: everyone who takes part or is affected, as {{"name", "role", "presence"}}. name: use the official name in 〔〕 when the text shows one (for "Saber〔阿尔托莉雅·潘德拉贡〔Alter〕〕" write "阿尔托莉雅·潘德拉贡〔Alter〕"), else the name the text uses. role: what they are in this beat in a few words. presence: onsite (physically there), remote (only by communication), mentioned (talked about, not there).
- places: the places it happens at, by name.
- time: when it happens relative to the previous beat (for the first beat: to the previous section):
  after_previous: "continuous" (right after), "same_day" (later the same day), "next_day", "days" (several days later; give days), or "unknown";
  days: number of days for "days", else 0; time_of_day: dawn, morning, noon, afternoon, evening, night or unknown;
  duration_minutes: how long the beat itself lasts, your best estimate; stated: a date or time the text states for it, verbatim, else "".
- changes: the lasting changes this beat makes to the world, as {{"subject", "kind", "value", "object"}}. kind is one of:
{kinds}
  Values state what is objectively true, not what someone perceives: never "失踪", "下落不明", "生死不明", "暴露", "现身". Knowledge is a "learns" change on the person who learns it. Leave out temporary moods and anything that ends within the beat.
  A change the text only reports or clearly implies counts too: when a beat reveals that someone died or vanished offscreen, or that a place fell, record that change in the beat where it becomes clear (and note in course how it became known). A character who stays behind to hold off an enemy and is spoken of as dead afterwards has died (or vanished, for a summoned being).
- secret: {{"is_secret": true when only some characters know this beat happened, "knowers": [names]}}.
- importance: "major" (a turning point of the chapter: a key death, a decisive battle, a revelation the plot turns on, the resolution), "normal", or "minor".

Also give:
- recap: 2 to 4 sentences on the whole section.
- people_notes: for characters who appear here, one line each of who they are (stable identity: what they are, their role in the story; not their current state), and any other names the text calls them by: {{"name", "aliases_in_text", "who"}}.
- open_questions: what the text leaves unclear (may be empty).

{protagonist} is the original story's protagonist: a character of this world like any other, not the player (the player enters the world as a character of their own). Lines marked 【…的可选回应】 are alternative replies the original lets its reader pick for {protagonist}; record what {protagonist} says or does in substance, not the alternatives. Lines marked （选项N） happen only after choice N.

Reply with one JSON object only:
{{"recap": "", "beats": [{{"title": "", "background": "", "trigger": "", "motives": [{{"who": "", "motive": ""}}], "course": "", "result": "", "aftermath": "", "note": "", "extra": {{}}, "home": false, "people": [{{"name": "", "role": "", "presence": "onsite"}}], "places": [], "time": {{"after_previous": "continuous", "days": 0, "time_of_day": "unknown", "duration_minutes": 60, "stated": ""}}, "changes": [{{"subject": "", "kind": "moves", "value": "", "object": ""}}], "secret": {{"is_secret": false, "knowers": []}}, "importance": "normal"}}], "people_notes": [{{"name": "", "aliases_in_text": [], "who": ""}}], "open_questions": []}}"""

SUMMARY_USER = """Work: {work}
Chapter: {chapter} (local era given by the data: {era})
Sections of this chapter: {siblings}
This section: #{order} 「{title}」{place}{part}
Who appears (name as shown〔official name〕, lines spoken): {cast}

Script:
{text}"""


CHAPTER_VERSION = 'chapter-6'

CHAPTER_SYSTEM = """You are editing one chapter of a story for a history database that a game master uses to run the story with a player who may change it. You get the chapter's beats, already summarized in order. Decide which beats are fixed points, how firmly the others are protected, how beats depend on each other, and what each beat leads to.

Write every prose field in {lang}.

Fixed points (HARD: they must happen whatever the player does; only their route may change):
- resolution: the one beat where the chapter's goal is achieved or lost (the threat defeated, the key object secured, the escape made). Usually near the end. null only if the chapter has no resolution.
- fixed: at most {max_fixed} other beats that later chapters take for granted: a death, disappearance or departure that stays, or a revelation or turn later chapters build on (a mastermind unmasked, a mission accepted, an alliance or betrayal that lasts). Not a fight's turning point, a rescue or an arrival in the middle of the chapter.
For each fixed point write required: what objectively must happen, in one or two sentences (who ends up how), without the incidental route; and outcomes: one to three facts it establishes, as {{"subject": name, "predicate": one of {predicates}, "value": value}} (alive takes true or false; leader and holder take a name). They must agree with required.

Every other beat is SOFT or FREE:
- SOFT: the default course: it happens as written unless actual play gives a concrete reason it cannot. Most plot beats driven by a character's decision.
- FREE: background, color and small scenes that may freely change or not happen.
A beat that a SOFT or fixed beat cannot happen without is at least SOFT.

Links between beats of this chapter: "enables" (B truly cannot happen without A), "motivates" (A gives someone a reason for B), "precedes" (order only), "related" (associated, no order). Each with a short note. Only links the story supports; sharing a day or a character is not a link.

impact: for each beat that later beats build on, one sentence on which later beats and how (name them by title).

hook: for beats the player could plausibly be near, one sentence describing an in-world opportunity to take part, without forcing a decision ("" when none).

ends: temporary conditions set by an earlier beat that end later in this chapter, as {{"beat": the beat where it ends, "subject": name, "predicate": "injury", "whereabouts" or "status", "value": the new value}}: an injury healed (value e.g. 已痊愈), a captive freed, a vanished one summoned again. Check every injury in the changes: if the injured person later acts normally, the injury ended at that beat or before.

missed: lasting changes the beats imply but did not record, as {{"beat": the beat where it happens or becomes clear, "subject": name, "kind": "death", "vanish", "moves", "status" or "learns", "value": ""}}. Look above all for characters who leave the story: someone who stays behind against hopeless odds, is spoken of as dead or gone afterwards, or simply never appears again after a fatal moment; record their death (or vanish, for a summoned being) at that moment. Do not repeat changes already listed.

frame: where and when this chapter is set as its own world: label (e.g. "1431年的法兰西（第一特异点）"), local_year (number; negative for BC; null if no calendar applies), and how its local time relates to the home side (one sentence).

summary: the chapter in 3 to 6 sentences, for the chapter's arc.

short: a short name for the chapter, 2 to 8 characters, as readers call it (e.g. 奥尔良, 第二部序章).

Reply with one JSON object only:
{{"summary": "", "short": "", "frame": {{"label": "", "local_year": null, "relation": ""}}, "resolution": {{"beat": "beat id", "why": "", "required": "", "outcomes": [{{"subject": "", "predicate": "status", "value": ""}}]}}, "fixed": [{{"beat": "beat id", "why": "", "required": "", "outcomes": []}}], "events": [{{"beat": "beat id", "class": "SOFT", "why": "one short reason", "hook": ""}}], "links": [{{"from": "beat id", "to": "beat id", "relation": "enables", "note": ""}}], "impact": [{{"beat": "beat id", "impact": ""}}], "ends": [{{"beat": "beat id", "subject": "", "predicate": "injury", "value": ""}}], "missed": [{{"beat": "beat id", "subject": "", "kind": "death", "value": ""}}]}}
List every beat in events exactly once (fixed points too; their class there does not matter)."""


CHAPTER_PART = """

This chapter is long, so it is edited in {n} parts; this is part {k}. Above are only this part's beats; all of the chapter's beats, for context:
{outline}

Judge only the beats of this part. Name a resolution only if the chapter's goal is achieved or lost in this part (else null); fixed points may be any beats of this part. Links may point to beats of other parts."""

CHAPTER_USER = """Work: {work}
Chapter #{order}: {chapter} (local era given by the data: {era})
Previous chapter: {prev}
Next chapter: {next}

Beats in order:
{beats}"""


ENTITY_VERSION = 'entity-2'

ENTITY_SYSTEM = """You write the registry of people, places, organizations and things for a story's history database. For each candidate you get the names the story uses, what the source data says, and short notes from the sections where it appears.

Write every prose field in {lang}.

For each candidate:
- key: copy it.
- name: the name to show: the usual full name in {lang} (a source name list can be wrong; prefer the name the story text uses, or the well-known name, and note the other in aliases).
- aliases: other names people actually use for this one (given name, surname when it identifies only this one, title, epithet, other translations). Leave out words shared by many (职阶名 such as Saber, "从者", "士兵", "所长" when several hold that title) and everyday words.
- kind: person, organization, place, object, world or other.
- description: one sentence of stable identity: what it is and its role in the story. Not its current state (no "已死亡", "目前在…").
- id: a short lowercase ASCII slug from the name (romanized or the usual English name), letters, digits and hyphens, e.g. "mash-kyrielight", "chaldea", "orleans".
- same_as: the key of another candidate in this list when both are the same individual, else "".
- skip: true when this is not a real individual worth tracking (a generic crowd like "士兵们", a voice, a narrator, a sound, or a travelling party named after its leader like "X一行"), else false. An organization with its own identity (a nation, an army, an institution) is not skipped.

Reply with one JSON object only: {{"entities": [{{"key": "", "name": "", "aliases": [], "kind": "person", "description": "", "id": "", "same_as": "", "skip": false}}]}}"""

ENTITY_USER = """Work: {work}

Candidates:
{items}"""

PREDICATES = ['alive', 'whereabouts', 'injury', 'status', 'condition', 'knows', 'leader', 'members', 'holder', 'form']


# ---------------------------------------------------------------------------------------------------------------
# wiki sources (adapter wiki_arcs): one story arc as fan wikis describe it, instead of a script

SUMMARY_WIKI_VERSION = 'wiki-1'

SUMMARY_WIKI_SYSTEM = """You turn one story arc of a long series, as fan wikis describe it, into a structured record for a history database that a game master will use to run the story with a player.

The material: the Chinese wiki's page on the arc, its timeline entries and its date research (考据), and the English wiki's page on the arc and/or each character's own account of the arc. These overlap: the same happening is often told several times, from different characters' points of view. Merge them: one happening is one beat, with the details of every account. The Chinese texts are the authority for names and dates; the English texts usually hold more detail.

Write every prose field in {lang}. Write every name the way the Chinese wiki and the name list (译名对照) write it; a name neither gives: the usual Chinese translation, or a transliteration, never English. Be concrete: name who does what, where, and why. Never invent anything the texts do not say or clearly imply; when something is unclear or the texts disagree, say so in open_questions instead of guessing.

Be brief. This record is read every turn of a game, so keep facts, not dialogue. course: 1 to 4 sentences (about 60 to 200 characters); result: 1 or 2 sentences; trigger, background and each motive: one sentence.

Split the arc into BEATS. One beat = one happening with one cause (a meeting, a fight, a revelation, a decision, a departure, an attack). Test: could the player change one part while the other still happens? If yes, they are separate beats. Keep every distinct happening the texts mention, side characters' scenes included: a scene that matters only to a minor character is still a beat (importance "minor"). A short arc may have 3 beats; a long arc 30 to 60. Beats are in story order (by time; for happenings at the same time in different places, any order).

Happenings the texts tell as the past (background before this arc, flashbacks, someone's history) are not beats: put what matters into the background of the beat it explains. Only happenings of this arc's own period are beats.

For each beat:
- title: a short name for what happens (at most 20 characters).
- background: the standing situation going in, if it matters and is not the trigger (optional, may be "").
- trigger: what sets it off.
- motives: one entry per key character or group whose decision drives the beat: what they want, why, and what they know or do not know. Empty for a beat no decision drives.
- course: what happens, in order: who does what and how. Keep the details that matter later (names, means, promises, what is revealed).
- result: the state afterwards: who is where, what changed, who now knows what.
- aftermath: later happenings of the same thread inside this arc that are not consequences (optional, "").
- note: guidance for a game master running this beat, e.g. what may change and what must stay (optional, ""). Not for your own uncertainties: those go to open_questions. The player is not {protagonist}: never suggest that the player speaks, chooses or acts for {protagonist}.
- extra: an object for story information that fits none of the fields above, as {{"label": "text"}} with a short label of your own (a name of a technique, a promise, a rule of the place). Never drop information because it has no field, but keep each entry short.
- home: false.
- people: everyone who takes part or is affected, as {{"name", "role", "presence"}}. role: what they are in this beat in a few words. presence: onsite (physically there), remote (only by communication), mentioned (talked about, not there).
- places: the places it happens at, by name (e.g. 第7学区, 冥土追魂的医院, 伦敦).
- time: when it happens.
  date: the day, as YYYY-MM-DD, when the texts give it or it follows from them (the arc's dates and year are given below; "the next day" after a dated beat has a date too); else "".
  clock: the clock time as HH:MM when the texts give one (e.g. 12月25日10:00 -> "10:00"); else "".
  after_previous: relative to the previous beat: "continuous" (right after), "same_day" (later the same day), "next_day", "days" (several days later; give days), "parallel" (at the same time, elsewhere), or "unknown";
  days: number of days for "days", else 0; time_of_day: dawn, morning, noon, afternoon, evening, night or unknown;
  duration_minutes: how long the beat itself lasts, your best estimate; stated: the date or time words of the texts, verbatim, else "".
- changes: the lasting changes this beat makes to the world, as {{"subject", "kind", "value", "object"}}. kind is one of:
{kinds}
  Values state what is objectively true, not what someone perceives: never "失踪", "下落不明", "生死不明", "暴露", "现身". Knowledge is a "learns" change on the person who learns it. Leave out temporary moods and anything that ends within the beat.
  A change the texts only report counts too: when a beat reveals that someone died offscreen, record that change in the beat where it becomes clear.
- secret: {{"is_secret": true when only some characters know this beat happened, "knowers": [names]}}.
- importance: "major" (a turning point of the arc: a key death, a decisive battle, a revelation the plot turns on, the resolution), "normal", or "minor".

Also give:
- recap: 2 to 4 sentences on the whole arc (or on this part of it).
- people_notes: for characters who appear here, one line each of who they are (stable identity: what they are, their role in the story; not their current state), and the other names the texts call them by (the English name too): {{"name", "aliases_in_text", "who"}}.
- open_questions: what the texts leave unclear or where they disagree (may be empty).

{protagonist} is the original story's protagonist: a character of this world like any other, not the player (the player enters the world as a character of their own).

Reply with one JSON object only:
{{"recap": "", "beats": [{{"title": "", "background": "", "trigger": "", "motives": [{{"who": "", "motive": ""}}], "course": "", "result": "", "aftermath": "", "note": "", "extra": {{}}, "home": false, "people": [{{"name": "", "role": "", "presence": "onsite"}}], "places": [], "time": {{"date": "", "clock": "", "after_previous": "continuous", "days": 0, "time_of_day": "unknown", "duration_minutes": 60, "stated": ""}}, "changes": [{{"subject": "", "kind": "moves", "value": "", "object": ""}}], "secret": {{"is_secret": false, "knowers": []}}, "importance": "normal"}}], "people_notes": [{{"name": "", "aliases_in_text": [], "who": ""}}], "open_questions": []}}"""

SUMMARY_WIKI_USER = """Work: {work}
Arc: {chapter} (the pack dates it {start} to {end}; display year: {start_year})
Arcs before and after: {siblings}
{part}
Material:
{text}"""


CHAPTER_WIKI_VERSION = 'chapter-wiki-1'

CHAPTER_OLD = """

Existing records of this period, from an older and coarser version of this database (one record often covers several of the beats above):
{records}

old_map: for each existing record above, the id of the beat above that is the same happening, or, when the record covers several beats, the beat that is its core (for a record of a death, the beat where the death happens; for a record of an arc's outcome, the beat of that outcome). "" when no beat above is that happening (the record is about another arc or a part of the story these beats do not cover). Add to your JSON: "old_map": [{{"old": "record id", "beat": "beat id or empty"}}], one entry per record."""


ENTITY_BASE = """

The registry already has the entities listed under "Existing registry" (key, name, other names). When a candidate is one of them under another name or spelling (another translation, a variant character such as 沉/沈, a nickname), set same_as to that registry key (e.g. "base:mugino-shizuri") instead of describing a new entity; name, description and id may then be left empty."""
