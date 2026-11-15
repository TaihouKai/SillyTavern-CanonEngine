"""关系: how two people of the story stand with each other, so the game master plays them toward each other as the
original does — how they address each other, what they think of each other, how they are together. Game masters
otherwise know each person alone and make every pair polite acquaintances.

Which pairs: the people a person's wiki page lists under 人际关系 (resolved to the pack's people), and the pairs who
share many events of the pack. A pair is decided by structure, never by a model. For each pair the model reads both
pages' entries about the other, the lines of each page that mention the other, and their shared events in story order,
and writes the relation in stages that begin at those events (the engine shows the stage the branch has reached).

The pack's `relations`: [{people: [a, b], stages: [{from_event, why?, bond, views: [{who, calls?, sees}], together?}],
source_refs}]."""
import json
import os
import re

from .llm import LLMError
from .nature import clean_wikitext
from .util import log, read_json, warn, write_json

RELATION_VERSION = 'relation-9'
WRITE_VERSION = 'relation-write-3'   # the writing step alone (its facts stay cached)
MIN_SHARED = 8          # pairs no page lists: this many shared events make one
MAX_EVENTS = 60         # shared events shown per pair (the first, the last, and an even spread)
MENTION_CHARS = 2500    # lines of each page that mention the other
MAX_STAGES = 5
# read-through: calls written as 「「海原美月」」, “首领”或“支仓同学”, 以名字或姓氏直呼天乃绫音, 首领（昔日称呼…）
CALLS_NOT_NAME = re.compile(r'[「」『』“”"\'（）()]|或|直呼|称呼|一类|叫法')
# read-through: a view that says the facts do not tell it (（此阶段事实未给出…）) instead of leaving the side out
NO_FACTS = re.compile(r'事实(?:中)?(?:未|没有|并未)|未给出|未提供|未记载|没有特别记载')

FACTS_SYSTEM = """You prepare how two people of a story world stand with each other, for a game master who plays them in new scenes with a player. The game master otherwise plays every pair as polite acquaintances. Here you do not write the relationship yet: you list its facts, each with the moment it becomes true, and choose where its stages begin. A writer will then write each stage from the facts true by then — so a fact dated too early leaks the future into a scene where it has not happened. In {lang}.

KNOWN BEFORE THE STORY STARTS? known_before_start is true only when the sources say or clearly imply that they knew each other before the story began: family, old friends, classmates, colleagues or members of the same group from before, or a meeting among the background events; then known_how says how, in a few words. Otherwise false: they meet during the story. A wiki entry that describes their relationship as a whole does not mean it existed before the story: check the dates.

FACTS. Everything lasting that the sources show about how the two stand with each other: what they are to each other; how each feels about and treats the other (mixed feelings as they are — admiration and irritation, trust and rivalry, a crush and pride); how each addresses or refers to the other; what each would or would not do for the other, would never admit, keeps from the other; their usual dynamic when together and what is touchy between them; a shared past that matters. One sentence each, as patterns, not plot retelling. Many facts, all sides — 8 to 30 for a pair the sources say much about.
- at: when it first becomes true — "before" (only when known_before_start: true before the story starts), or the id of the listed shared event where it first happens or first shows. Date it by the event dates and what the pages say; when a page tells something without a date, find the listed event it belongs to. A fact that becomes true only later is dated later, however central it is to the relationship.
- A fact that stops being true at some point (a hostility that ends, a name no longer used) is still listed with its start; the change gets its own fact at the event where it changes ("不再敌视他").

STAGES. A stage begins where the relationship itself changes for a long time: hostility ends or begins, they become friends, allies, a couple or enemies, a betrayal, one learns who the other really is, the way one addresses the other changes, one loses their memory of the other. Not a passing mood, a single quarrel, or a plot event that leaves how they stand unchanged. Stage 1 starts at null when known_before_start, else at the listed shared event where they first meet or first deal with each other. A later stage starts at a listed shared event at which at least one fact is dated. A stage shows only the facts dated at or before its own start, from then until the next stage: a fact dated after the last stage's start is never shown, and one dated between two starts only shows from the next start on — so put a stage where a lasting change happens, not before it. Most pairs have one to three stages; never more than {max_stages}. why: what changes there, one sentence (stage 1: "" or how they meet).

TRUTH. Only what the sources support. If the sources show no real relationship — they only appear in the same events and never deal with each other, or one of them is a name in the other's story — answer {{"none": true}}.

Reply with a JSON object only:
{{"none": false, "known_before_start": false, "known_how": "", "facts": [{{"at": "<event id or before>", "fact": ""}}], "stages": [{{"from_event": "<event id, or null when known_before_start>", "why": ""}}]}}"""

WRITE_SYSTEM = """You write how two people of a story world stand with each other, stage by stage, for a game master who plays them in new scenes with a player. Problem this solves: the game master knows each person alone and plays every pair the same — polite acquaintances — so a devoted junior talks to her idol like a stranger and two rivals chat like friends. In {lang}.

You get, for each stage, the facts that are true when it starts (the ones marked ★ become true at its start). Write each stage from its own facts only: nothing from a later stage's facts, nothing the facts do not say — the game master sees only the stage the playthrough has reached, and anything later tells the future. Each stage is read alone, so write it in full (never "同上" or a reference to another stage).

MANY-SIDED, NOT A LABEL. A relationship is rarely one thing, and a game master who gets one label plays a caricature: the pair turns into that word in every scene. Write all the sides its facts show at once — the warmth and the friction, the respect and the rivalry, what each would and would not admit, what stays touchy. A later stage describes the whole relationship as it now stands: the new facts are added to what continues, never put in its place (two rivals who learn to trust each other are still rivals who bicker and needle each other; a girl who comes to like a boy still snaps at him).

Each stage:
- from_event: exactly as given.
- bond: what they are to each other now, one phrase naming its main sides, not a single label (室友兼学姐学妹，一个仰慕到失控、一个嫌烦又护着 / 互相看不顺眼、嘴上从不认输，关键时刻却信得过对方的同校超能力者 / 父女). A state, never a transition ("从…转为…" is not a bond).
- views: one entry per side that knows the other; who: that person's name exactly as given. Each entry is that person's own side, about the other:
  - calls: how they address or refer to the other, as the facts show it; "" if they do not.
  - sees: two or three sentences, no more: how they regard and treat the other — feelings (mixed ones as mixed), attitude, typical behaviour, what they would or would not do for them, what they would never say to them.
  Someone who does not know the other (yet) gets no entry — only possible in stage 1: by a later stage both know each other, so both sides are written.
- together: one or two sentences: their usual dynamic when together, banter, roles, and what is touchy between them (when both sides are written, never empty).

IN {lang} ONLY: not a single English word (no "touchy", "rivalry"); the names of things as the facts write them.

PATTERNS, NOT A RETELLING. Standing attitudes the game master plays in new scenes the original never had. The facts are often episodes: turn each into what it shows about the two (not "她把对方丢在天台" but "会拿对方开过火的玩笑"), never list them; a game master given episodes brings them up again and again. The shared past may be named in a few words where it is the reason for how they stand ("曾被对方从实验中救下"), at most once or twice a stage.

Reply with a JSON object only: {{"stages": [{{"from_event": "", "bond": "", "views": [{{"who": "<name>", "calls": "", "sees": ""}}], "together": ""}}]}}"""

WRITE_USER = """Work: {work}

{a_name}{a_aliases} — {a_desc}
{b_name}{b_aliases} — {b_desc}
{known}
{stages}"""

RELATION_USER = """Work: {work}

{a_name}{a_aliases} — {a_desc}
{b_name}{b_aliases} — {b_desc}

The story starts at: {start}. Their first shared event from the story's start: {first}.

What {a_name}'s wiki page says about {b_name}:
{a_on_b}

What {b_name}'s wiki page says about {a_name}:
{b_on_a}

Other lines of {a_name}'s page that mention {b_name}:
{a_mentions}

Other lines of {b_name}'s page that mention {a_name}:
{b_mentions}

Background — shared events before the story starts (not usable as from_event):
{before}

Shared events from the story's start (id | when | title | result), in story order:
{events}"""


# ---- the pages and their 人际关系 entries -------------------------------------------------------------

def _unspell(project, names):
    """The names as the sources spell them (the project's spelling replaces them in the pack: 沈利 → 沉利)."""
    back = {v: k for k, v in (project.get('spelling') or {}).items()}
    out = []
    for n in names:
        out.append(n)
        for new, old in back.items():
            if new in n:
                out.append(n.replace(new, old))
    return out


def page_of(project, e, wiki):
    return next((wiki[n] for n in _unspell(project, [e['name'], *(e.get('aliases') or [])]) if n in wiki and isinstance(wiki[n], str)), '')


NOT_PEOPLE = ('能力', '作中行动', '逸闻', '图集', '注释', '参考资料', '登场作品', '外部链接')


def _head_names(head):
    names = re.findall(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', head) + re.findall(r'\{\{r[ls]\|([^{}|]*)', head)
    return names or [x.strip() for x in re.split(r'[,，、]', re.sub(r'\{\{[^{}]*\}\}', '', head)) if x.strip()]


def rel_entries(page):
    """What a page says about the people around this person: [(names, text)] for every entry that names someone — a
    ";" line of a list (the usual 人际关系 section) or a sub-heading (=== or deeper: some pages keep them under 日常生活
    or 家人) — outside the sections that are about something else (powers, the plot record). The caller keeps the
    entries whose names are people of the pack."""
    out, cur, skip = [], None, False
    for line in page.split('\n'):
        h = re.match(r'^(=+)\s*(.*?)\s*=+\s*$', line)
        if h and len(h.group(1)) == 2:
            skip = any(x in h.group(2) for x in NOT_PEOPLE)
            cur = None
            continue
        if skip:
            continue
        if h or line.startswith(';'):
            cur = (_head_names(h.group(2) if h else line[1:].strip()), [])
            out.append(cur)
        elif cur is not None and line.strip():
            cur[1].append(line.lstrip(':').strip())
    return [(names, clean_wikitext('\n'.join(text), 3000).strip()) for names, text in out if text]


def _name_index(project, pack):
    idx = {}
    for e in pack['entities']:
        if e.get('kind') != 'person':
            continue
        for n in _unspell(project, [e['name'], *(e.get('aliases') or [])]):
            n = n.strip()
            if len(n) >= 2:
                idx.setdefault(n, set()).add(e['id'])
    return idx


def _start_day(e):
    w = (e.get('when') or {}).get('earliest') or {}
    return (w.get('day', 10 ** 9), w.get('minute', 0))


def shared_events(pack, a, b):
    evs = [e for e in pack['events'] if a in (e.get('entity_ids') or []) and b in (e.get('entity_ids') or [])]
    return sorted(evs, key=_start_day)


def candidates(project, pack, wiki, min_shared=MIN_SHARED):
    """{pair key: {'people': (a, b), 'entries': {a: text about b, b: text about a}}}: every pair a page lists (both
    resolved, uniquely) and every pair with at least min_shared shared events."""
    names = _name_index(project, pack)
    people = {e['id']: e for e in pack['entities'] if e.get('kind') == 'person'}
    out = {}
    def add(a, b):
        k = '|'.join(sorted((a, b)))
        return out.setdefault(k, {'people': tuple(sorted((a, b))), 'entries': {}})
    for a, e in people.items():
        for ns, text in rel_entries(page_of(project, e, wiki)):
            for n in ns:
                ids = names.get(n.strip()) or set()
                if len(ids) != 1:
                    continue
                b = next(iter(ids))
                if b != a:
                    c = add(a, b)
                    c['entries'][a] = (c['entries'].get(a, '') + '\n' + text).strip()
    count = {}
    for ev in pack['events']:
        ps = sorted({x for x in ev.get('entity_ids') or [] if x in people})
        for i, a in enumerate(ps):
            for b in ps[i + 1:]:
                count[(a, b)] = count.get((a, b), 0) + 1
    for (a, b), n in count.items():
        if n >= min_shared:
            add(a, b)
    return out


def mentions(page, names, limit=MENTION_CHARS):
    """The lines of a page (outside its 人际关系 entries) that mention one of the names, up to limit characters."""
    text = re.sub(r'\n==\s*人际关系\s*==\n.*?(?=\n==[^=]|\Z)', '\n', page, flags=re.S)
    text = clean_wikitext(text, 60000)
    out, n = [], 0
    for line in re.split(r'(?<=[。！？\n])', text):
        s = line.strip()
        if s and any(x in s for x in names):
            out.append(s)
            n += len(s)
            if n >= limit:
                break
    return '\n'.join(out)


def _own_names(project, e):
    """The names that stand for this person in a text: the full name and aliases of two characters or more."""
    return [n for n in _unspell(project, [e['name'], *(e.get('aliases') or [])]) if len(n.strip()) >= 2]


def event_line(e):
    res = (e.get('summary') or {}).get('result') if isinstance(e.get('summary'), dict) else ''
    res = re.sub(r'\s+', ' ', str(res or ''))[:90]
    return f'{e["id"]} | {((e.get("when") or {}).get("label") or "").split("；")[0]} | {e["title"]}' + (f' | {res}' if res else '')


def spread(evs, n):
    if len(evs) <= n:
        return evs
    keep = {0, len(evs) - 1} | {int(i * (len(evs) - 1) / (n - 1)) for i in range(n)}
    return [evs[i] for i in sorted(keep)]


# ---- the model's reply ---------------------------------------------------------------------------------

TRANSITION = re.compile(r'从.{0,20}(?:转为|变为|变成|转变为)|^(?:转为|变为)')


FACT_DATE = re.compile(r'(?:(\d{4})年)?(?<!\d)(\d{1,2})月(?:(\d{1,2})日)?')
NOT_THIS_YEAR = re.compile(r'(?:年前|去年|前年|当年|那年)$')


def story_dates_in(text, start):
    """The dates in a fact's text that fall on or after the story's start (start: (year, month, day)): a fact told
    "before" that names one is a later fact. A date with no year is taken in the start's year unless the words just
    before it say otherwise (一年前8月1日)."""
    out = []
    for m in FACT_DATE.finditer(text or ''):
        y, mo, d = m.group(1), int(m.group(2)), m.group(3)
        if not 1 <= mo <= 12 or (not y and NOT_THIS_YEAR.search(text[max(0, m.start() - 4):m.start()])):
            continue
        when = (int(y) if y else start[0], mo, int(d) if d else 31)   # a bare month: any day of it
        if when >= start:
            out.append(m.group(0))
    return out


def check_facts(ids, max_stages=MAX_STAGES, start=None):
    """The first reply: dated facts and where the stages start. ids: the shared events from the story's start, in
    story order; start: the story's first day (year, month, day), when known."""
    order = {x: i for i, x in enumerate(ids)}
    def check(obj):
        if not isinstance(obj, dict):
            return ['reply must be a JSON object']
        if obj.get('none') is True:
            return []
        out = []
        kb = obj.get('known_before_start')
        if not isinstance(kb, bool):
            out.append('known_before_start must be true or false')
        if kb is True and not str(obj.get('known_how') or '').strip():
            out.append('known_how is empty: say how they knew each other before the story')
        if kb is False and not ids:
            out.append("they share no event from the story's start: they can only have a relation if they knew each other before (known_before_start true), or answer {\"none\": true}")
        facts = obj.get('facts')
        if not isinstance(facts, list) or not facts:
            out.append('facts must be a non-empty list')
            facts = []
        dated = set()
        for j, f in enumerate(facts):
            at = f.get('at') if isinstance(f, dict) else None
            if not isinstance(f, dict) or not str(f.get('fact') or '').strip():
                out.append(f'fact {j + 1} is empty')
            elif at == 'before':
                if kb is not True:
                    out.append(f'fact {j + 1}: "before" only when they knew each other before the story (known_before_start)')
                elif start and story_dates_in(f['fact'], start):
                    # read-through: pairs whose only shared event is in the past got their whole story told "before"
                    # (大霸星祭, 9月…) — the opening stage then knew months ahead
                    out.append(f'fact {j + 1}: "before" is only what is true before the story starts, and "{story_dates_in(f["fact"], start)[0]}" is after its start — date it at the listed shared event where it happens; if none of them is it, leave the fact out')
            elif at not in order:
                out.append(f'fact {j + 1}: at "{at}" is not "before" or one of the listed shared events from the story\'s start')
            else:
                dated.add(at)
        st = obj.get('stages')
        if not isinstance(st, list) or not st:
            return out + ['stages must be a non-empty list']
        if len(st) > max_stages:
            out.append(f'at most {max_stages} stages')
        last = -1
        for i, s in enumerate(st):
            f = s.get('from_event') if isinstance(s, dict) else None
            if i == 0:
                if isinstance(kb, bool) and kb != (f is None):
                    out.append('known_before_start true goes with stage 1 from_event null; false with stage 1 starting at the shared event where they first meet')
                if f is None:
                    continue
            elif f is None:
                out.append(f'stage {i + 1}: a later stage starts at a listed shared event (from_event)')
                continue
            if f not in order:
                out.append(f'stage {i + 1}: from_event "{f}" is not one of the listed shared events from the story\'s start')
            elif order[f] <= last:
                out.append(f'stage {i + 1}: from_event "{f}" comes before the stage above it — stages go in story order')
            else:
                last = order[f]
                if i and f not in dated:
                    out.append(f'stage {i + 1}: no fact is dated at its event "{f}" — a stage starts where something becomes true')
                elif not i and f not in dated:
                    # read-through: first stages at an event where both "did not notice each other" (same tournament,
                    # same mall fight) — strangers written as a relation, and a GM told they know each other
                    out.append(f'stage 1: no fact is dated at its event "{f}" — stage 1 starts where they first meet or deal with each other (being at the same event without dealing with each other is not meeting)')
        return out
    return check


def check_write(starts, names, ok_words=()):
    """The second reply: one stage per given start, in order, each written in full, in the pack's language (ok_words:
    terms the setting itself writes in Latin letters)."""
    from .checks import LATIN_OK, latin_words
    ok = set(LATIN_OK) | set(ok_words)
    def check(obj):
        st = obj.get('stages') if isinstance(obj, dict) else None
        if not isinstance(st, list):
            return ['reply must be a JSON object with stages']
        out = []
        if len(st) != len(starts):
            out.append(f'write exactly {len(starts)} stages, one per stage given, in order')
        for i, s in enumerate(st):
            if not isinstance(s, dict):
                continue
            if not str(s.get('bond') or '').strip():
                out.append(f'stage {i + 1}: bond is empty')
            elif TRANSITION.search(str(s.get('bond'))):
                out.append(f'stage {i + 1}: bond is how they stand now, not a transition ("从…转为…")')
            vs = s.get('views')
            if not isinstance(vs, list) or not vs:
                out.append(f'stage {i + 1}: views must list at least the side that knows the other')
                continue
            who = [v.get('who') if isinstance(v, dict) else None for v in vs]
            if any(w not in names for w in who) or len(set(who)) < len(who):
                out.append(f'stage {i + 1}: the who of each view is one of the two names exactly ({" / ".join(names)}), once')
            if any(isinstance(v, dict) and not str(v.get('sees') or '').strip() for v in vs):
                out.append(f'stage {i + 1}: a view without sees')
            for v in vs:
                c = str(v.get('calls') or '').strip() if isinstance(v, dict) else ''
                if c and CALLS_NOT_NAME.search(c):
                    out.append(f'stage {i + 1}: calls "{c}" — calls is only the names or forms of address themselves, several separated by 、, no brackets, quotes, "或" or explanation')
                if isinstance(v, dict) and NO_FACTS.search(str(v.get('sees') or '')):
                    out.append(f'stage {i + 1}: a view about missing facts — a side the facts say nothing about gets no entry')
            # live read: later stages with one side only although both had long known each other
            if i and len(vs) < 2:
                out.append(f'stage {i + 1}: by a later stage both know each other: write both sides')
            if len(vs) == 2 and not str(s.get('together') or '').strip():
                out.append(f'stage {i + 1}: together is empty: say how the two are when together')
            text = ' '.join([str(s.get('bond') or ''), str(s.get('together') or '')] + [str(v.get(k) or '') for v in vs if isinstance(v, dict) for k in ('calls', 'sees')])
            en = latin_words(text, ok)
            if en:
                out.append(f'stage {i + 1}: English words ({", ".join(dict.fromkeys(en))}): write everything in the language of the story')
        return out
    return check


def stage_facts(facts, starts, ids):
    """For each stage (its start: None or an event id), the facts true when it starts — dated at or before its event —
    with whether each became true at that event. Code decides it, by date: the writer never sees a later fact, and a
    stage shows from its start on, so a fact dated between two starts waits for the next one (late, never early).
    A live run showed the other way round: a stage from 12-05 told of London (12-13) and Christmas."""
    order = {x: i for i, x in enumerate(ids)}
    pos = lambda at: -1 if at == 'before' else order.get(at, 10 ** 6)  # noqa: E731
    out = []
    for s in starts:
        lo = -1 if s is None else order[s]
        out.append([(f, s is not None and pos(f['at']) == lo) for f in facts if pos(f['at']) <= lo])
    return out


def unshown(facts, starts, ids):
    """The facts no stage shows (dated after the last stage's start)."""
    order = {x: i for i, x in enumerate(ids)}
    last = max([-1] + [order[s] for s in starts if s is not None])
    return [f for f in facts if f.get('at') != 'before' and order.get(f.get('at'), 10 ** 6) > last]


def to_pack(r, a, b, names):
    """The model's reply as the pack's relation of a and b (names: theirs, as the reply's views give them; None for none)."""
    if not isinstance(r, dict) or r.get('none') or not r.get('stages'):
        return None
    side = {names[0]: a, names[1]: b}
    stages = []
    for i, s in enumerate(r['stages'][:MAX_STAGES]):
        views = []
        for v in s.get('views') or []:
            if v.get('who') in side and str(v.get('sees') or '').strip():
                views.append({'who': side[v['who']], **({'calls': v['calls'].strip()} if str(v.get('calls') or '').strip() else {}), 'sees': v['sees'].strip()})
        st = {'from_event': s.get('from_event') if i else s.get('from_event'), 'bond': str(s.get('bond') or '').strip(), 'views': views}
        if i and str(s.get('why') or '').strip():
            st['why'] = s['why'].strip()
        elif not i and st['from_event'] is None and str(r.get('known_how') or '').strip():
            st['why'] = r['known_how'].strip()    # how they knew each other before the story
        if str(s.get('together') or '').strip():
            st['together'] = s['together'].strip()
        stages.append(st)
    return {'people': [a, b], 'stages': stages}


def generate(project, client, pack, wiki, lang='Simplified Chinese', out_dir=None, min_shared=MIN_SHARED):
    """Writes <out_dir>/<a>__<b>.json per candidate pair (its dated facts and its stages); returns how many have a
    relation. Two calls per pair: the facts with when each becomes true and where the stages start, then the stages
    written from the facts each one may know."""
    out_dir = out_dir or project.p('relations')
    ents = {e['id']: e for e in pack['entities']}
    evs_by = {e['id']: e for e in pack['events']}
    origin = (pack.get('calendar') or {}).get('origin_label') or 'day 0'
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', origin)
    start = tuple(int(x) for x in m.groups()) if m else None   # day 0's date, for facts told "before"
    fsys = FACTS_SYSTEM.format(lang=lang, max_stages=MAX_STAGES)
    wsys = WRITE_SYSTEM.format(lang=lang)
    cands = candidates(project, pack, wiki, min_shared)
    ok_words = {w for e in pack['entities'] for n in [e['name'], *(e.get('aliases') or [])] for w in re.findall(r"[A-Za-z][A-Za-z']*(?:-[A-Za-z]+)*", n or '')}
    when = lambda i: ((evs_by[i].get('when') or {}).get('label') or '').split('；')[0]  # noqa: E731
    jobs = []
    for k, c in sorted(cands.items()):
        a, b = c['people']
        ea, eb = ents[a], ents[b]
        evs = shared_events(pack, a, b)
        before = [e for e in evs if _start_day(e)[0] < 0]
        after = spread([e for e in evs if _start_day(e)[0] >= 0], MAX_EVENTS)
        pa, pb = page_of(project, ea, wiki), page_of(project, eb, wiki)
        al = lambda e: f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else ''  # noqa: E731
        user = RELATION_USER.format(
            work=pack.get('title', project.name), start=origin,
            first=(f'{when(after[0]["id"])} — {after[0]["title"]}' if after else '(none)'),
            a_name=ea['name'], a_aliases=al(ea), a_desc=ea.get('static_description') or '',
            b_name=eb['name'], b_aliases=al(eb), b_desc=eb.get('static_description') or '',
            a_on_b=c['entries'].get(a) or '(none)', b_on_a=c['entries'].get(b) or '(none)',
            a_mentions=(mentions(pa, _own_names(project, eb)) if pa else '') or '(none)',
            b_mentions=(mentions(pb, _own_names(project, ea)) if pb else '') or '(none)',
            before='\n'.join(event_line(e) for e in before) or '(none)',
            events='\n'.join(event_line(e) for e in after) or '(none)')
        ids = [e['id'] for e in after]
        names = (ea['name'], eb['name'])

        def one(user=user, ids=ids, names=names, ea=ea, eb=eb, al=al):
            try:
                r1 = client.call('relation_facts', RELATION_VERSION, fsys, user, check_facts(ids, start=start), max_tokens=6000, recheck=True)
            except LLMError as err:
                warn(f'relation facts: {err}')
                return None
            if r1.get('none'):
                return r1
            starts = [s.get('from_event') for s in r1['stages']]
            per = stage_facts(r1['facts'], starts, ids)
            blocks = []
            for i, (s, fs) in enumerate(zip(r1['stages'], per)):
                nxt = starts[i + 1] if i + 1 < len(starts) else None
                head = f'Stage {i + 1} — from_event: {json.dumps(s.get("from_event"))} ({"the story start" if s.get("from_event") is None else when(s["from_event"]) + " " + evs_by[s["from_event"]]["title"]}) until {"the end of the story" if nxt is None else when(nxt) + " " + evs_by[nxt]["title"]}' + (f'; what changes: {s["why"]}' if s.get('why') else '')
                blocks.append(head + '\nFacts true when it starts:\n' + '\n'.join(f'- {"★ " if new else ""}{f["fact"]}' for f, new in fs))
            wuser = WRITE_USER.format(work=pack.get('title', project.name), a_name=ea['name'], a_aliases=al(ea), a_desc=ea.get('static_description') or '',
                                      b_name=eb['name'], b_aliases=al(eb), b_desc=eb.get('static_description') or '',
                                      known=(f'They knew each other before the story: {r1.get("known_how")}\n' if r1.get('known_before_start') else ''), stages='\n\n'.join(blocks))
            try:
                r2 = client.call('relation_write', WRITE_VERSION, wsys, wuser, check_write(starts, names, ok_words), max_tokens=6000, recheck=True)
            except LLMError as err:
                warn(f'relation write: {err}')
                return None
            stages = [{**w, 'from_event': s.get('from_event'), **({'why': s['why']} if i and str(s.get('why') or '').strip() else {})} for i, (s, w) in enumerate(zip(r1['stages'], r2['stages']))]
            return {'none': False, 'known_before_start': r1.get('known_before_start'), 'known_how': r1.get('known_how', ''), 'facts': r1['facts'], 'unshown': unshown(r1['facts'], starts, ids), 'stages': stages}
        jobs.append((k, one))
    res = client.run_many(jobs, 'relation')
    n = 0
    for k, r in res.items():
        if isinstance(r, Exception) or r is None:
            continue
        a, b = cands[k]['people']
        write_json(f'{out_dir}/{a}__{b}.json', {'people': [a, b], 'names': [ents[a]['name'], ents[b]['name']], 'version': RELATION_VERSION, **r})
        n += 0 if r.get('none') else 1
    log(f'relation: {n} of {len(jobs)} pairs have a relation — {client.ledger.summary()}')
    return n


def attach(pack, rel_dir, rename=None, source=None):
    """Puts the generated relations into the pack (top-level "relations"), in its own format. rename: {merged id: kept
    id}; a pair that becomes one person, or whose people are no longer in the pack, is left out. A stage at an event the
    pack no longer has is not guessed at: the pair is left out and listed (generate it again, or fix it in the review
    file). Returns (how many, [what was left out and why])."""
    rename = rename or {}
    people = {e['id'] for e in pack['entities'] if e.get('kind') == 'person'}
    evs = {e['id'] for e in pack['events']}
    src = source or (pack.get('sources') or [{}])[0].get('id')
    out, seen, miss = [], set(), []
    if os.path.isdir(rel_dir):
        for f in sorted(os.listdir(rel_dir)):
            d = read_json(os.path.join(rel_dir, f))
            if d and d.get('version') != RELATION_VERSION:
                miss.append(f'relations：{"、".join(d.get("names") or d.get("people") or [f])} 是旧版（{d.get("version")}）生成的，没有放进包（重新生成）')
                continue
            if not d or d.get('none') or not d.get('stages'):
                continue
            rel = to_pack(d, d['people'][0], d['people'][1], d['names'])
            if not rel:
                continue
            a, b = (rename.get(x, x) for x in rel['people'])
            k = '|'.join(sorted((a, b)))
            if a == b or a not in people or b not in people or k in seen:
                continue
            gone = [s['from_event'] for s in rel['stages'] if s['from_event'] is not None and s['from_event'] not in evs]
            if gone:
                miss.append(f'relations：{"、".join(d["names"])} 的阶段起点 {"、".join(gone)} 不在包里（重新生成这对，或在核对文件 relations 里改）')
                continue
            for s in rel['stages']:
                for v in s['views']:
                    v['who'] = rename.get(v['who'], v['who'])
            seen.add(k)
            out.append({'people': [a, b], 'stages': rel['stages'], 'source_refs': [src] if src else []})
    pack['relations'] = out
    return len(out), miss
