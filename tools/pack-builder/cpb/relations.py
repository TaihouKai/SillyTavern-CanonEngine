"""关系: how two people of the story stand with each other, so the game master plays them toward each other as the
original does — how they address each other, what they think of each other, how they are together. Game masters
otherwise know each person alone and make every pair polite acquaintances.

Which pairs: the people a person's wiki page lists under 人际关系 (resolved to the pack's people), and the pairs who
share many events of the pack. A pair is decided by structure, never by a model. For each pair the model reads both
pages' entries about the other, the lines of each page that mention the other, and their shared events in story order,
and writes the relation in stages that begin at those events (the engine shows the stage the branch has reached).

The pack's `relations`: [{people: [a, b], stages: [{from_event, why?, bond, views: [{who, calls?, sees}], together?}],
source_refs}]."""
import os
import re

from .llm import LLMError
from .nature import clean_wikitext
from .util import log, read_json, warn, write_json

RELATION_VERSION = 'relation-4'
MIN_SHARED = 8          # pairs no page lists: this many shared events make one
MAX_EVENTS = 60         # shared events shown per pair (the first, the last, and an even spread)
MENTION_CHARS = 2500    # lines of each page that mention the other
MAX_STAGES = 5

RELATION_SYSTEM = """You write how two people of a story world stand with each other, for a game master who plays them in new scenes with a player. Problem this solves: the game master knows each person alone and plays every pair the same — polite acquaintances — so a devoted junior talks to her idol like a stranger and two rivals chat like friends. Write their relationship as the sources show it, in {lang}.

KNOWN BEFORE THE STORY STARTS? Decide this first; it decides stage 1. known_before_start is true only when the sources say or clearly imply that they knew each other before the story began: family, old friends, classmates, colleagues or members of the same group from before, or a meeting among the background events. Then stage 1 has from_event null, and known_how says how they knew each other, in a few words. Otherwise known_before_start is false: they meet during the story. Stage 1 then starts at the listed shared event where they first meet or first deal with each other (usually the first one listed), and before it they do not know each other. A wiki entry that describes their relationship as a whole does not mean it existed before the story: check the dates.

STAGES. A relationship changes over the story; the game master sees only the stage the playthrough has reached, so each stage is read alone and written in full (never "同上" or a reference to another stage).
TIME. A stage is how they stand from its event until the next stage starts, and nothing later: check every sentence of a stage against that span. What only happens or becomes true after it — a later rescue, alliance, confession, shared holiday, title, injury or death, a nickname used only later — does not belong in it, however well the sources know it; if it changes how they stand for long, it starts a later stage. Right after two people first clash they are not yet friends, even if they become friends months later.
- A later stage starts at a listed shared event where the relationship itself changes for a long time: hostility ends or begins, they become friends, allies, a couple or enemies, a betrayal, one learns who the other really is, the way one addresses the other changes, one loses their memory of the other. Not a passing mood, a single quarrel, or a plot event that leaves how they stand unchanged. Most pairs have one or two stages; never more than {max_stages}.
- from_event: an event id from the list of shared events, exactly as given.

Each stage, concrete and brief:
- bond: what they are to each other, one short phrase (室友兼学姐学妹 / 互相看不顺眼的同校超能力者 / 父女).
- views: one entry per side that knows the other; who: that person's name exactly as given above. Each entry is that person's own side, about the other one:
  - calls: how they address or refer to the other in speech, as the sources show it (a nickname, a title, given name, surname with an honorific); "" if the sources do not show it.
  - sees: one or two sentences: how they regard and treat the other in this stage — feelings, attitude, typical behaviour toward them, what they would or would not do for them.
  Someone who does not know the other (yet) — the other watches them from afar, or knows of them without ever having met — gets no entry.
- together: one sentence: how the two are when together — their usual dynamic, banter, roles, what is touchy between them; "" if nothing particular.
- why (later stages only): what changed, one sentence.

PATTERNS, NOT A RETELLING. These are standing attitudes the game master plays in new scenes the original never had. Their shared past may be named in a few words where it is the reason ("曾被对方从实验中救下"), but do not retell plot, fights or lines.
TRUTH. Only what the sources support. If the sources show no real relationship — they only appear in the same events and never deal with each other, or one of them is a name in the other's story — answer {{"none": true}}.

Reply with a JSON object only:
{{"none": false, "known_before_start": false, "known_how": "", "stages": [{{"from_event": "<the shared event where they first meet; null when known_before_start>", "bond": "", "views": [{{"who": "<name>", "calls": "", "sees": ""}}, {{"who": "<the other name>", "calls": "", "sees": ""}}], "together": ""}}, {{"from_event": "<event id>", "why": "", "bond": "", "views": [...], "together": ""}}]}}"""

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

def check_relation(ids, names, max_stages=MAX_STAGES):
    """ids: the shared events from the story's start, in story order; names: the two people's names."""
    order = {x: i for i, x in enumerate(ids)}
    def check(obj):
        if not isinstance(obj, dict):
            return ['reply must be a JSON object']
        if obj.get('none') is True:
            return []
        st = obj.get('stages')
        if not isinstance(st, list) or not st:
            return ['stages must be a non-empty list (or answer {"none": true})']
        out = []
        kb = obj.get('known_before_start')
        if not isinstance(kb, bool):
            out.append('known_before_start must be true or false')
        elif isinstance(st[0], dict) and kb != (st[0].get('from_event') is None):
            out.append('known_before_start true goes with stage 1 from_event null; false with stage 1 starting at the shared event where they first meet')
        if kb is True and not str(obj.get('known_how') or '').strip():
            out.append('known_how is empty: say how they knew each other before the story')
        if kb is False and not ids:
            out.append("they share no event from the story's start: they can only have a relation if they knew each other before (known_before_start true), or answer {\"none\": true}")
        if len(st) > max_stages:
            out.append(f'at most {max_stages} stages')
        last = -1
        for i, s in enumerate(st):
            if not isinstance(s, dict):
                out.append(f'stage {i + 1} must be an object')
                continue
            f = s.get('from_event')
            if i and f is None:
                out.append(f'stage {i + 1}: a later stage starts at a listed shared event (from_event)')
            if f is not None:
                if f not in order:
                    out.append(f'stage {i + 1}: from_event "{f}" is not one of the listed shared events from the story\'s start')
                elif order[f] <= last:
                    out.append(f'stage {i + 1}: from_event "{f}" comes before the stage above it — stages go in story order')
                else:
                    last = order[f]
            if not str(s.get('bond') or '').strip():
                out.append(f'stage {i + 1}: bond is empty')
            vs = s.get('views')
            if not isinstance(vs, list) or not vs:
                out.append(f'stage {i + 1}: views must list at least the side that knows the other')
                continue
            who = [v.get('who') if isinstance(v, dict) else None for v in vs]
            if any(w not in names for w in who) or len(set(who)) < len(who):
                out.append(f'stage {i + 1}: the who of each view is one of the two names exactly ({" / ".join(names)}), once')
            if any(isinstance(v, dict) and not str(v.get('sees') or '').strip() for v in vs):
                out.append(f'stage {i + 1}: a view without sees')
        return out
    return check


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
    """Writes <out_dir>/<a>__<b>.json per candidate pair; returns how many have a relation."""
    out_dir = out_dir or project.p('relations')
    ents = {e['id']: e for e in pack['entities']}
    origin = (pack.get('calendar') or {}).get('origin_label') or 'day 0'
    system = RELATION_SYSTEM.format(lang=lang, max_stages=MAX_STAGES)
    cands = candidates(project, pack, wiki, min_shared)
    jobs = []
    for k, c in sorted(cands.items()):
        a, b = c['people']
        ea, eb = ents[a], ents[b]
        evs = shared_events(pack, a, b)
        before = [e for e in evs if _start_day(e)[0] < 0]
        after = spread([e for e in evs if _start_day(e)[0] >= 0], MAX_EVENTS)
        pa, pb = page_of(project, ea, wiki), page_of(project, eb, wiki)
        al = lambda e: f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else ''
        user = RELATION_USER.format(
            work=pack.get('title', project.name), start=origin,
            first=(f'{(after[0].get("when") or {}).get("label", "").split("；")[0]} — {after[0]["title"]}' if after else '(none)'),
            a_name=ea['name'], a_aliases=al(ea), a_desc=ea.get('static_description') or '',
            b_name=eb['name'], b_aliases=al(eb), b_desc=eb.get('static_description') or '',
            a_on_b=c['entries'].get(a) or '(none)', b_on_a=c['entries'].get(b) or '(none)',
            a_mentions=(mentions(pa, _own_names(project, eb)) if pa else '') or '(none)',
            b_mentions=(mentions(pb, _own_names(project, ea)) if pb else '') or '(none)',
            before='\n'.join(event_line(e) for e in before) or '(none)',
            events='\n'.join(event_line(e) for e in after) or '(none)')
        ids = [e['id'] for e in after]
        names = (ea['name'], eb['name'])

        def one(user=user, ids=ids, names=names):
            try:
                return client.call('relation', RELATION_VERSION, system, user, check_relation(ids, names), max_tokens=3000)
            except LLMError as err:
                warn(f'relation: {err}')
                return None
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
