"""战斗: what a fight in the story is judged by — the setting's concepts, rules and abilities as a graph, the original
story's fights as precedents, and each person's links into the graph and 对抗倾向 (how they act in a confrontation).

The builder only proposes; a person reads every item and keeps the verified data in projects/<project>.combat.json
(the golden file), which `build` puts into the pack. Three proposal passes, each cached per item:
- setting: one call per wiki page about the setting (powers, magic, terms, items): the nodes it gives;
- people: one call per person (pack description, 常态, wiki page, the setting's concepts and abilities): their links,
  their own abilities, their 对抗倾向 in versions;
- precedents: one call per pack event that tells a fight: who fought whom, the result and the reason the story gives.
Where a source says nothing, the model may write it and marks it generated (the pack says so too)."""
import json
import os
import re
import unicodedata

from .llm import LLMError
from .nature import clean_wikitext, event_lines
from .util import ROOT, log, read_json, warn, write_json

COMBAT_VERSION = 'combat-1'
PARTS = ('principle', 'effect', 'conditions', 'cost', 'limits', 'counters')
KINDS = ('concept', 'rule', 'ability')
STYLE = ('start', 'force', 'response', 'limit', 'stop')
# part names a model wrote otherwise (singular, or in the work's language)
PART_NAMES = {'condition': 'conditions', 'limit': 'limits', 'counter': 'counters', '原理': 'principle', '效果': 'effect', '条件': 'conditions', '代价': 'cost', '限制': 'limits', '弱点': 'counters', '克制': 'counters'}
ID_RE = re.compile(r'^[a-z][a-z0-9-]*$')

SETTING_SYSTEM = """You read one wiki page about the setting of {work} and take from it what a FIGHT in this world is judged by: a game engine judges confrontations between characters (and a player) from these notes, so they must say how things actually work.

Give nodes of three kinds, only what bears on how a confrontation goes:
- concept: a kind of being or fighter and what it means in a fight (a power level such as "Level 5"; 圣人; 魔术师; 天使; an ordinary person; a kind of trained unit);
- rule: a law of the world that decides fights, with when it applies (an esper who uses magic is hurt by it; the older the mystery, the stronger; an angel's power depends on its element);
- ability: a power, technique, spell, magic item or weapon someone can use in a fight, told in parts:
  principle (how it works), effect (what it does, how strong), conditions (what it needs to work), cost (what it costs the user), limits (what it cannot do), counters (known ways to beat it). Leave out a part the page says nothing about. secret: true on a part the story treats as hidden (a weakness only a few know).
Leave out everything else: places, history, events, organizations' politics, media, trivia. A page that gives nothing for fights: {{"nodes": []}}.

TRUTH: only what the page says, in your own words, plainly. Never invent strengths, weaknesses or rules. Keep numbers the page gives (voltage, range, weight).
Each node: id (lowercase ASCII words joined by "-": an English or romaji name, e.g. "electromaster", "saint", "idol-theory"), name (in {lang}, the page's own name for it), gist (one sentence: what it is in a fight), text (2 to 5 sentences: what it is and how it decides fights), parts (abilities only), links (to other nodes this one depends on or belongs to: {{"to": "<their id or name>", "label": "<what the link is, a few words in {lang}>"}}), owners (names of people who have this ability or are this kind; empty for a rule).
Reply with JSON only: {{"nodes": [{{"id": "", "kind": "concept|rule|ability", "name": "", "gist": "", "text": "", "parts": [{{"part": "effect", "text": "", "secret": false}}], "links": [], "owners": []}}]}}"""

SETTING_USER = """Work: {work}
Page: {title} ({site})

{page}"""

PEOPLE_SYSTEM = """You write what a fight engine needs about one person of {work}: what they are as a fighter, what they can do, and how they act in a confrontation. The engine judges fights from this; a player may fight them or beside them.

1. links: the setting's concepts and abilities (listed by id) that describe this person: what kind of fighter they are (a Level, 魔术师, 圣人, an ordinary person...) and the listed abilities they have. Every person gets at least one concept; an ordinary person is "ordinary-person". label: what the link is, a few words in {lang} ("是", "能力", "持有"). A link that only holds from an event on (a power gained, lost or changed) gives from_event (an id from the events list), and until_event when it ends.
2. abilities: this person's OWN abilities the list does not have (what the list has, under any name, is linked, never written again) (a unique power, their own spell, technique or weapon), as nodes: id (lowercase ASCII words joined by "-", English or romaji), name (in {lang}), gist (one sentence), text (2-4 sentences), parts — principle, effect, conditions, cost, limits, counters (only what the sources say; leave out the rest); secret: true on a part the story treats as hidden. A version from an event: from_event / until_event.
3. style: 对抗倾向, five sentences in {lang}, from what the sources show of how they fight:
   start — when they start a fight themselves; force — how much of their strength they use, whether they kill, when they go all out; response — what they do when attacked (fight back, dodge, flee, take it); limit — whom or what they would risk their life for; stop — when they give up, retreat or stop.
   "照常人" for a field where nothing sets them apart. What holds toward one person only (a friend whose shocks are play) does not belong here. A later version from an event where how they fight changes for good (a killer who vows not to kill): from_event, why.
   generated: true when the sources do not show it and you judged it from who they are.
4. Version 1 (from_event null) is the person at the story start given below; nothing they become later belongs in it.

5. not_had: an ability listed as this person's that the sources do not give them (a wrong attribution): {{"node": "<id>", "why": "<a few words>"}}.

TRUTH: what the sources say; a weak or minor person gets a short entry. Never invent powers. Patterns, not story: no specific fights or lines.
Reply with JSON only: {{"links": [{{"node": "", "label": "", "from_event": null, "until_event": null}}], "abilities": [{{"id": "", "name": "", "gist": "", "text": "", "parts": [{{"part": "effect", "text": "", "secret": false}}], "from_event": null, "until_event": null}}], "style": [{{"from_event": null, "why": "", "start": "", "force": "", "response": "", "limit": "", "stop": "", "generated": false}}], "not_had": []}}"""

PEOPLE_USER = """Work: {work}

Person: {name}{aliases}
Pack description: {desc}
常态 (how their power or condition shows every day):
{nature}

Story start (version 1 is the person as of): {first}
Events from the story's start (id | when | title), in story order:
{events}

The setting's concepts and abilities (id | kind | name | gist):
{menu}

Wiki page:
{page}"""

PRECEDENT_SYSTEM = """You read one event of {work} and say whether it shows a FIGHT (a confrontation whose result depends on one side's abilities against the other's: a battle, an attack, a duel, a chase, a contest of powers). A fight engine uses the original story's fights as precedents: "when these met, this happened, for this reason".
If it shows none: {{"fight": false}}.
Otherwise: who (ids from the people listed, those who actually fought), name (a short title in {lang}: "上条当麻对一方通行"), gist (one sentence: who won and how), text (2-4 sentences in {lang}: how it went, the result, and the reason the story gives — which power beat which, what weakness was used, what turned it). Only what the summary says.
Reply with JSON only: {{"fight": true, "who": [], "name": "", "gist": "", "text": ""}}"""

PRECEDENT_USER = """Work: {work}
Event: {title} ({when})
People in it (id | name): {people}

{summary}"""

TIMING_SYSTEM = """You check WHEN one person of {work} has each of the things a fight engine links them to. The engine starts a game at the story start and moves through the story; what a person only gets later must not be theirs before.

For each item listed (an ability, a technique, an item, a kind they are, a group they belong to), decide:
- "start": they already have it at the story start given below;
- "later": they only have it from an event of the story on: they learn or develop it, obtain or are given it, awaken or are changed into it, join it. Give from_event: the id of the first event where they have it (one of their events, or the first event of the arc that tells it).
- "outside": they only get it in a part of the story after every arc listed (the last arc is {last}; anything told up to it is inside).
Shown for the first time later is not gained later: a technique, spell or skill they use for the first time in a later volume they already had, unless the source says it was new then (developed, learned, obtained, given, awakened); "uses", "shows", "first appears" is not that. An item they take or are given at some point is "later". Decide from the item's text, the events and the wiki page; when they say nothing about how it came, it is "start". A person reads every "later" and "outside": when the sources leave you unsure, say "later" and why.
The wiki page keeps its citations as 〔medium series volume〕 (小说 原篇 = 旧约, 新约, 创约; 漫画 超电磁炮 ...): the volume where a thing is told. The arcs list says which volumes each arc is; use it to find the event.
why: a few words in {lang} (what the source says, with its citation).
Reply with JSON only: {{"timing": [{{"node": "<id>", "at": "start|later|outside", "from_event": null, "why": ""}}]}}"""

TIMING_USER = """Work: {work}

Person: {name}{aliases}
Pack description: {desc}

Story start: {first}
Events from the story's start (id | when | title), in story order:
{events}

Arcs of the story (title | days | first event id):
{arcs}

Items to decide (id | link | name | text):
{items}

Wiki page:
{page}"""

FIGHT_WORDS = re.compile(r'战斗|交战|击败|打倒|打败|对决|决斗|袭击|攻击|击退|击杀|杀死|交手|激战|对战|迎战|围攻|压制|制服|败北|胜利|打赢|输给|斩|射杀|狙击|爆破|偷袭|追杀|拦截')


def _s(x, n):
    return str(x or '').strip()[:n]


def _id(x):
    # Latin letters a model writes with marks or ligatures (Hræsvelgr, Mjölnir) keep their base letters
    t = unicodedata.normalize('NFKD', str(x or '').lower().replace('æ', 'ae').replace('ø', 'o').replace('œ', 'oe').replace('ß', 'ss'))
    s = re.sub(r'[^a-z0-9]+', '-', ''.join(c for c in t if not unicodedata.combining(c))).strip('-')
    return s if s and s[0].isalpha() else ('n-' + s if s else '')


def setting_pages(project):
    """The setting's wiki pages (title -> (site, wikitext)): those fetched for the setting's categories that are not
    pages of the story's people, places or organizations (the wikis' main dumps hold those)."""
    out = {}
    for site, f, main in (('huiji', 'huiji-combat.json', 'huiji.json'), ('fandom', 'fandom-combat.json', 'fandom.json')):
        pages = read_json(project.p('raw', f), {}) or {}
        known = read_json(project.p('raw', main), {}) or {}
        for t, v in pages.items():
            if t in known or not isinstance(v, str) or v.lstrip().lower().startswith('#redirect') or v.lstrip().startswith('#重定向'):
                continue
            out[t] = (site, v)
    return out


def check_setting(obj):
    p = []
    for n in obj.get('nodes') or []:
        if n.get('kind') not in KINDS:
            p.append(f'kind {n.get("kind")!r} is not one of {KINDS}')
        if not _id(n.get('id')):
            p.append(f'node {n.get("name")!r} has no id')
        for k in ('name', 'gist', 'text'):
            if not _s(n.get(k), 2000):
                p.append(f'node {n.get("id")!r} has no {k}')
        if n.get('kind') == 'ability' and not any(x.get('part') == 'effect' for x in n.get('parts') or []):
            p.append(f'ability {n.get("id")!r} has no "effect" part')
        for x in n.get('parts') or []:
            if x.get('part') not in PARTS:
                p.append(f'part {x.get("part")!r} is not one of {PARTS}')
    return p


def gen_setting(project, client, pack, lang):
    pages = setting_pages(project)
    work = pack.get('title', project.name)
    jobs = []
    for t, (site, v) in sorted(pages.items()):
        text = clean_wikitext(v, limit=9000)
        if len(text) < 80:
            continue
        user = SETTING_USER.format(work=work, title=t, site=site, page=text)
        jobs.append((t, (lambda u=user: client.call('combat_setting', COMBAT_VERSION, SETTING_SYSTEM.format(work=work, lang=lang), u, check_setting, max_tokens=4000))))
    res = client.run_many(jobs, 'combat_setting')
    out = {}
    for t, r in res.items():
        if isinstance(r, Exception) or not r:
            warn(f'combat setting: {t}: {r}')
            continue
        out[t] = {'site': pages[t][0], 'nodes': r.get('nodes') or []}
    write_json(project.p('combat', 'setting.json'), out)
    log(f'combat setting: {len(out)} pages, {sum(len(v["nodes"]) for v in out.values())} nodes — {client.ledger.summary()}')
    return out


def menu_of(golden, person=None):
    """The setting's concepts and the abilities no one person of the pack owns, as the people pass sees them; with a
    person, the setting's abilities that person owns come after them (link these, do not write them again)."""
    nodes = [n for n in golden.get('nodes', []) if n.get('origin') == 'setting']
    gen = [f'{n["id"]} | {n["kind"]} | {n["name"]} | {n["gist"]}' for n in nodes if n['kind'] == 'concept' or (n['kind'] == 'ability' and not n.get('owner_ids'))]
    own = [f'{n["id"]} | {n["kind"]} | {n["name"]} | {n["gist"]}' for n in nodes if n['kind'] != 'concept' and person in (n.get('owner_ids') or [])] if person else []
    return gen + (['', "This person's abilities already in the setting: link these, never write them again under abilities. Some come only later in the story: link those with from_event (the event where they are gained).", *own] if own else [])


def _base(name):
    return _key(re.split(r'[（(]', str(name or ''))[0])


def check_people(ids, node_ids, own=None):
    taken = {_base(n['name']): n['id'] for n in own or []} | {n['id']: n['id'] for n in own or []}

    def check(obj):
        p = []
        for a in obj.get('abilities') or []:
            hit = taken.get(_base(a.get('name'))) or taken.get(a.get('id'))
            if hit:
                p.append(f'ability {a.get("name")!r} is the setting node {hit!r}: link {hit!r} instead of writing it again')
        linked = {l.get('node') for l in obj.get('links') or []} | {x.get('node') for x in obj.get('not_had') or []}
        for n in own or []:
            if n['id'] not in linked:
                p.append(f'{n["id"]!r} ({n["name"]}) is listed as one of the abilities of this person: link it (with from_event if gained later), or put it under not_had with why')
        for l in obj.get('links') or []:
            if l.get('node') not in node_ids:
                p.append(f'link to {l.get("node")!r}: not an id of the list (put your own abilities under "abilities")')
            for k in ('from_event', 'until_event'):
                if l.get(k) and l[k] not in ids:
                    p.append(f'link {k} {l[k]!r} is not an id of the events list')
        for a in obj.get('abilities') or []:
            for q in a.get('parts') or []:
                if PART_NAMES.get(q.get('part'), q.get('part')) not in PARTS:
                    p.append(f'ability {a.get("name")!r}: part {q.get("part")!r} is not one of {", ".join(PARTS)}')
            if not _id(a.get('id')) or not _s(a.get('name'), 200) or not any(x.get('part') == 'effect' for x in a.get('parts') or []):
                p.append(f'ability {a.get("name")!r}: needs id, name and an "effect" part')
            for k in ('from_event', 'until_event'):
                if a.get(k) and a[k] not in ids:
                    p.append(f'ability {k} {a[k]!r} is not an id of the events list')
        st = obj.get('style') or []
        if not st:
            p.append('style is missing')
        for i, v in enumerate(st):
            if i == 0 and v.get('from_event'):
                p.append('style version 1 holds at the start: from_event null')
            if i > 0 and v.get('from_event') not in ids:
                p.append(f'style version {i + 1}: from_event must be an id of the events list')
            for k in STYLE:
                if not _s(v.get(k), 400):
                    p.append(f'style version {i + 1} has no {k}')
        return p
    return check


def gen_people(project, client, pack, golden, wiki, lang, only=None):
    ents = {e['id']: e for e in pack['entities']}
    natures = {e['id']: e.get('nature') or [] for e in pack['entities']}
    node_ids = {n['id'] for n in golden.get('nodes', [])}
    work = pack.get('title', project.name)
    jobs = []
    for e in pack['entities']:
        if e['kind'] != 'person' or (only and e['id'] not in only):
            continue
        names = [e['name'], *(e.get('aliases') or [])]
        page = next((wiki[n] for n in names if n in wiki and isinstance(wiki[n], str)), '')
        before, lines, ids = event_lines(pack, e['id'], start_day=0)
        origin = (pack.get('calendar') or {}).get('origin_label') or 'day 0'
        first = origin + ('; this person first appears at: ' + ' | '.join(lines[0].split(' | ')[1:3]) if lines and not before else '')
        nat = '\n'.join(f'- {"from " + v["from_event"] if v.get("from_event") else "at the start"}: {v.get("uses", "")} {v.get("limits", "")}' for v in natures[e['id']]) or '(none)'
        user = PEOPLE_USER.format(work=work, name=e['name'], aliases=f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else '',
                                  desc=e.get('static_description') or '', nature=nat, first=first, events='\n'.join(lines[:80]) or '(none)',
                                  menu='\n'.join(menu_of(golden, e['id'])), page=clean_wikitext(page, limit=10000) if page else '(no wiki page)')
        jobs.append((e['id'], (lambda u=user, i=set(ids), eid=e['id']: client.call('combat_people', COMBAT_VERSION, PEOPLE_SYSTEM.format(work=work, lang=lang), u, check_people(i, node_ids, [n for n in golden.get('nodes', []) if eid in (n.get('owner_ids') or [])]), max_tokens=4000))))
    res = client.run_many(jobs, 'combat_people')
    for eid, r in res.items():
        if isinstance(r, Exception) or not r:
            warn(f'combat people: {eid}: {r}')
            continue
        write_json(project.p('combat', 'people', f'{eid}.json'), {'id': eid, 'name': ents[eid]['name'], 'version': COMBAT_VERSION, 'has_page': any(n in wiki for n in [ents[eid]['name'], *(ents[eid].get('aliases') or [])]), **r})
    log(f'combat people: {sum(1 for r in res.values() if not isinstance(r, Exception))}/{len(jobs)} — {client.ledger.summary()}')
    return res


def timing_items(golden, eid):
    """A person's links in the verified file that hold from the start (no from_event): what the timing pass asks about."""
    nodes = {n['id']: n for n in golden.get('nodes', [])}
    return [(l, nodes[l['to']]) for l in golden.get('links', []) if l['from'] == eid and l.get('origin') == 'people' and not l.get('from_event') and l['to'] in nodes]


def cited_wikitext(t, limit=14000):
    """The wiki text with its citations kept short (〔小说 创约12〕): where a thing is told says when it comes."""
    def cite(m):
        f = m.group(1).split('|')
        return f'〔{" ".join(x for x in f[1:4] if x)}〕' if len(f) >= 4 else ''
    return clean_wikitext(re.sub(r'\{\{注\|([^{}]*)\}\}', cite, t), limit=limit)


def arc_lines(pack):
    days, first = {}, {}
    for ev in pack['events']:
        a, d = ev.get('arc_id'), ((ev.get('when') or {}).get('earliest') or {}).get('day')
        if a is None or d is None:
            continue
        days.setdefault(a, []).append(d)
        if a not in first or d < first[a][0]:
            first[a] = (d, ev['id'])
    return [f'{a["title"]} | day {min(days[a["id"]])}–{max(days[a["id"]])} | {first[a["id"]][1]}' for a in pack.get('arcs') or [] if a['id'] in days and max(days[a['id']]) >= 0]


def arc_volumes(pack):
    """Which volumes each arc tells, from its title ("旧约9-10 ...", "创约12-14 ..."): {(series, volume): arc title}."""
    out = {}
    for a in pack.get('arcs') or []:
        m = re.match(r'(旧约|新约|创约)(\d+)(?:-(\d+))?', a['title'])
        if m:
            for v in range(int(m.group(2)), int(m.group(3) or m.group(2)) + 1):
                out[(m.group(1), v)] = a['title']
    return out


def check_timing(ids, items, volumes=None):
    def check(obj):
        p = []
        got = {t.get('node'): t for t in obj.get('timing') or []}
        for i in items:
            if i not in got:
                p.append(f'{i!r} is not decided')
        for n, t in got.items():
            if n not in items:
                p.append(f'{n!r} is not one of the items listed')
            if t.get('at') not in ('start', 'later', 'outside'):
                p.append(f'{n!r}: at must be start, later or outside')
            if t.get('at') == 'later' and t.get('from_event') not in ids:
                p.append(f'{n!r}: later needs from_event, an event id (one of the events or an arc\'s first event)')
            if t.get('at') == 'outside':   # a volume an arc tells is inside the story
                for m in re.finditer(r'(原篇|旧约|新约|创约)\s*(\d+)', t.get('why') or ''):
                    arc = (volumes or {}).get(('旧约' if m.group(1) == '原篇' else m.group(1), int(m.group(2))))
                    if arc:
                        p.append(f'{n!r}: {m.group(0)} is told by the arc {arc!r}, which is listed: it is inside the story ("later" with an event of that arc)')
        return p
    return check


def gen_timing(project, client, pack, golden, wiki, lang, only=None):
    """When each person has what they are linked to (proposals; the review's "timing" keeps what holds)."""
    work = pack.get('title', project.name)
    al = arc_lines(pack)
    arcs, last = '\n'.join(al), (al[-1].split(' | ')[0] if al else '(none)')
    ev_ids = {ev['id'] for ev in pack['events']}
    vols = arc_volumes(pack)
    jobs = []
    for e in pack['entities']:
        if e['kind'] != 'person' or (only and e['id'] not in only):
            continue
        items = timing_items(golden, e['id'])
        if not items:
            continue
        names = [e['name'], *(e.get('aliases') or [])]
        page = next((wiki[n] for n in names if n in wiki and isinstance(wiki[n], str)), '')
        before, lines, _ = event_lines(pack, e['id'], max_lines=160, start_day=0)
        origin = (pack.get('calendar') or {}).get('origin_label') or 'day 0'
        first = origin + ('; this person first appears at: ' + ' | '.join(lines[0].split(' | ')[1:3]) if lines and not before else '')
        listed = '\n'.join(f'{n["id"]} | {l.get("label") or ""} | {n["name"]} | {n["text"]}' for l, n in items)
        user = TIMING_USER.format(work=work, name=e['name'], aliases=f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else '',
                                  desc=e.get('static_description') or '', first=first, events='\n'.join(lines) or '(none)', items=listed,
                                  arcs=arcs, page=cited_wikitext(page, limit=14000) if page else '(no wiki page)')
        jobs.append((e['id'], (lambda u=user, i=ev_ids, its={n['id'] for _, n in items}: client.call('combat_timing', COMBAT_VERSION, TIMING_SYSTEM.format(work=work, lang=lang, last=last), u, check_timing(i, its, vols), max_tokens=3000))))
    res = client.run_many(jobs, 'combat_timing')
    for eid, r in res.items():
        if isinstance(r, Exception) or not r:
            warn(f'combat timing: {eid}: {r}')
            continue
        write_json(project.p('combat', 'timing', f'{eid}.json'), {'id': eid, **r})
    log(f'combat timing: {sum(1 for r in res.values() if not isinstance(r, Exception))}/{len(jobs)} — {client.ledger.summary()}')
    return res


def fight_events(pack):
    """Events whose summary tells a fight between at least two people (candidates for precedents)."""
    ents = {e['id']: e for e in pack['entities']}
    out = []
    for ev in pack['events']:
        s = ev['summary'] if isinstance(ev['summary'], str) else json.dumps(ev['summary'], ensure_ascii=False)
        people = [i for i in ev['entity_ids'] if ents.get(i, {}).get('kind') == 'person']
        if len(people) >= 2 and FIGHT_WORDS.search(s):
            out.append(ev)
    return out


def check_precedent(people):
    def check(obj):
        if not obj.get('fight'):
            return []
        p = []
        who = obj.get('who') or []
        if len(who) < 2:
            p.append('who: at least two people who fought')
        for w in who:
            if w not in people:
                p.append(f'who {w!r} is not an id of the people listed')
        for k in ('name', 'gist', 'text'):
            if not _s(obj.get(k), 2000):
                p.append(f'{k} is missing')
        return p
    return check


def gen_precedents(project, client, pack, lang):
    ents = {e['id']: e for e in pack['entities']}
    work = pack.get('title', project.name)
    jobs = []
    for ev in fight_events(pack):
        people = [i for i in ev['entity_ids'] if ents.get(i, {}).get('kind') == 'person']
        s = ev['summary'] if isinstance(ev['summary'], str) else json.dumps(ev['summary'], ensure_ascii=False)
        user = PRECEDENT_USER.format(work=work, title=ev['title'], when=(ev.get('when') or {}).get('label', ''), people=' ; '.join(f'{i} | {ents[i]["name"]}' for i in people), summary=s)
        jobs.append((ev['id'], (lambda u=user, ps=set(people): client.call('combat_precedent', COMBAT_VERSION, PRECEDENT_SYSTEM.format(work=work, lang=lang), u, check_precedent(ps), max_tokens=1500))))
    res = client.run_many(jobs, 'combat_precedent')
    out = {}
    for eid, r in res.items():
        if isinstance(r, Exception) or not r or not r.get('fight'):
            continue
        out[eid] = r
    write_json(project.p('combat', 'precedents.json'), out)
    log(f'combat precedents: {len(out)} fights of {len(jobs)} candidate events — {client.ledger.summary()}')
    return out


# ---------------------------------------------------------------------------------------------------------------
# the verified data into the pack

def golden_path(project):
    return os.path.join(ROOT, 'projects', f'{project.name}.combat.json')


def attach(pack, golden, source_id):
    """Puts the verified combat data into the pack: pack.combat (basis or none, nodes, links) and each person's
    combat_style. Returns a short report."""
    if golden.get('none'):
        pack['combat'] = {'none': golden['none']}
        return 'combat: none'
    nodes, links = [], []
    for n in golden.get('nodes', []):
        node = {k: n[k] for k in ('id', 'kind', 'name', 'gist', 'text') if k in n}
        if n.get('parts'):
            node['parts'] = [{'part': p['part'], 'text': p['text'], **({'visibility': p['visibility']} if p.get('visibility') else {})} for p in n['parts']]
        for k in ('who', 'event_id', 'visibility', 'hours', 'frequency'):
            if n.get(k):
                node[k] = n[k]
        node['source_refs'] = [] if n.get('generated') else [source_id]
        if n.get('generated'):
            node['generated'] = True
        nodes.append(node)
    for l in golden.get('links', []):
        links.append({k: l[k] for k in ('from', 'to', 'label', 'from_event', 'until_event') if l.get(k) is not None})
    pack['combat'] = {'basis': golden['basis'], 'nodes': nodes, 'links': links}
    styles = golden.get('styles', {})
    n = 0
    for e in pack['entities']:
        if e['kind'] == 'person' and e['id'] in styles:
            e['combat_style'] = styles[e['id']]
            n += 1
    return f'combat: {len(nodes)} nodes, {len(links)} links, 对抗倾向 for {n} people'


def problems(pack, golden):
    """What keeps the verified combat data from being complete (checks of `build`): people without 对抗倾向 or without
    any link, links to nodes that do not exist."""
    if not golden:
        return ['combat: no verified combat data (projects/<project>.combat.json)']
    if golden.get('none'):
        return []
    out = []
    node_ids = {n['id'] for n in golden.get('nodes', [])}
    linked = {l['from'] for l in golden.get('links', [])}
    styles = golden.get('styles', {})
    for e in pack['entities']:
        if e['kind'] != 'person':
            continue
        if e['id'] not in styles:
            out.append(f'combat: {e["name"]} ({e["id"]}) has no verified 对抗倾向')
        if e['id'] not in linked:
            out.append(f'combat: {e["name"]} ({e["id"]}) links to no node')
    for l in golden.get('links', []):
        if l['to'] not in node_ids:
            out.append(f'combat: link {l["from"]} -> {l["to"]}: no such node')
    return out


# ---------------------------------------------------------------------------------------------------------------
# the setting's proposals, merged for reading (the same thing told by several pages is read once)

def _key(name):
    return re.sub(r'[\s·・._\-\'"“”‘’「」『』（）()]+', '', str(name or '').lower())


def merge_setting(project, pack):
    """Groups the setting proposals that are the same node (same id, or the same name), keeps per group the fullest
    telling (the Chinese wiki's first), adds the parts, owners and links the others have, and writes
    work/<project>/combat/merged.json. Concepts that are only a person of the pack are left out (people are entities)."""
    data = read_json(project.p('combat', 'setting.json'), {}) or {}
    people = {}
    for e in pack['entities']:
        if e['kind'] == 'person':
            for n in [e['name'], *(e.get('aliases') or [])]:
                people[_key(n)] = e['id']
    items = []
    for title, v in data.items():
        for n in v['nodes']:
            items.append({**n, 'id': _id(n.get('id')), '_page': title, '_site': v['site']})
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i
    by = {}
    for i, n in enumerate(items):
        for k in ('id:' + n['id'], 'name:' + _key(n.get('name'))):
            if k in by:
                parent[find(i)] = find(by[k])
            else:
                by[k] = i
    groups = {}
    for i in range(len(items)):
        groups.setdefault(find(i), []).append(items[i])
    out, dropped = [], []
    for g in groups.values():
        g.sort(key=lambda n: (n['_site'] != 'huiji', -len(n.get('text') or '')))
        base = dict(g[0])
        if base['kind'] == 'concept' and _key(base['name']) in people:
            dropped.append(f'{base["name"]} ({base["id"]}): a person of the pack')
            continue
        parts = {p['part']: p for p in base.get('parts') or [] if p.get('part') in PARTS}
        for n in g[1:]:
            for p in n.get('parts') or []:
                if p.get('part') in PARTS and p['part'] not in parts:
                    parts[p['part']] = p
        if base['kind'] == 'ability':
            base['parts'] = [parts[k] for k in PARTS if k in parts]
        else:
            base.pop('parts', None)
        base['owners'] = sorted({o for n in g for o in (n.get('owners') or []) if o})
        seen, links = set(), []
        for n in g:
            for l in n.get('links') or []:
                k = (_key(l.get('to')), l.get('label'))
                if k not in seen:
                    seen.add(k)
                    links.append(l)
        base['links'] = links
        base['pages'] = sorted({f'{n["_site"]}:{n["_page"]}' for n in g})
        base['others'] = [{'name': n['name'], 'kind': n['kind'], 'gist': n.get('gist', '')} for n in g[1:] if _key(n['name']) != _key(base['name']) or n['kind'] != base['kind']][:6]
        for k in ('_page', '_site'):
            base.pop(k, None)
        out.append(base)
    # ids unique after the merge (two different things the model gave one id)
    taken = {}
    for n in out:
        i, k = n['id'], 2
        while n['id'] in taken:
            n['id'] = f'{i}-{k}'
            k += 1
        taken[n['id']] = n
    out.sort(key=lambda n: (KINDS.index(n['kind']) if n['kind'] in KINDS else 9, n['id']))
    write_json(project.p('combat', 'merged.json'), {'nodes': out, 'dropped': dropped})
    log(f'combat merge: {len(items)} proposals → {len(out)} nodes ({len(dropped)} people left out)')
    return out


# ---------------------------------------------------------------------------------------------------------------
# the reviewed setting into the verified file

def review_path(project):
    return os.path.join(ROOT, 'projects', f'{project.name}.combat-review.json')


def golden_setting(project, pack):
    """Writes the setting nodes a person kept (projects/<project>.combat-review.json: "setting" {id: keep | drop: why |
    {keep, edit}} over merged.json, and "add": nodes written by hand) into projects/<project>.combat.json, with the
    links between kept nodes. The people's links, abilities and 对抗倾向 already in that file are kept. A node's owners
    become owner_ids (the pack's people), which the people pass offers that person to link."""
    rv = read_json(review_path(project), {}) or {}
    dec = rv.get('setting') or {}
    merged = (read_json(project.p('combat', 'merged.json'), {}) or {}).get('nodes') or []
    open_ = [n['id'] for n in merged if n['id'] not in dec]
    if open_:
        raise SystemExit(f'combat golden: {len(open_)} setting nodes not reviewed yet (first: {open_[:5]})')
    people = {}
    for e in pack['entities']:
        if e['kind'] == 'person':
            for nm in [e['name'], *(e.get('aliases') or [])]:
                people.setdefault(_key(nm), e['id'])
    kept = []
    for n in merged:
        d = dec[n['id']]
        if d == 'keep' or (isinstance(d, dict) and d.get('keep')):
            kept.append({**n, **((d.get('edit') or {}) if isinstance(d, dict) else {})})
    kept += [dict(a, owners=a.get('owners') or []) for a in rv.get('add') or []]
    names = {}
    for n in kept:
        for nm in [n['id'], n['name'], *[o['name'] for o in n.get('others') or []]]:
            names.setdefault(_key(nm), n['id'])
    nodes, links, seen = [], [], set()
    for n in kept:
        owner_ids = sorted({people[_key(o)] for o in n.get('owners') or [] if _key(o) in people})
        node = {k: n[k] for k in ('id', 'kind', 'name', 'gist', 'text', 'hours', 'frequency') if n.get(k)}
        if n['kind'] == 'ability':
            node['parts'] = [{'part': p['part'], 'text': p['text'], **({'visibility': {'mode': 'secret', 'knower_ids': owner_ids}} if p.get('secret') else {})}
                             for p in n.get('parts') or [] if p.get('part') in PARTS and p.get('text')]
        if n.get('generated'):
            node['generated'] = True
        node['origin'] = 'setting'
        node['owner_ids'] = owner_ids
        nodes.append(node)
        for l in n.get('links') or []:
            to = names.get(_key(l.get('to')))
            # a rule hangs off what it applies to: the fight walks from a fighter to their kind, then to its rules
            a, b = (to, n['id']) if n['kind'] == 'rule' else (n['id'], to)
            if to and a != b and (a, b) not in seen:
                seen.add((a, b))
                links.append({'from': a, 'to': b, 'label': ('规则' if n['kind'] == 'rule' else l.get('label')) or '相关'})
    for l in rv.get('links') or []:   # links written by hand (a rule's subject the proposals did not name, ...)
        if (l['from'], l['to']) not in seen:
            seen.add((l['from'], l['to']))
            links.append({'from': l['from'], 'to': l['to'], 'label': l['label'], **({'from_entity': True} if l.get('from_entity') else {})})
    # a node id that is also an entity id (an organization, a drone, an item of the pack) gets its own id
    ents = {e['id'] for e in pack['entities']}
    renamed, taken = {}, {n['id'] for n in nodes} | ents
    for n in nodes:
        if n['id'] in ents:
            new, k = n['id'] + '-cb', 2
            while new in taken:
                new, k = f'{n["id"]}-cb{k}', k + 1
            taken.add(new)
            renamed[n['id']] = new
    for n in nodes:
        n['id'] = renamed.get(n['id'], n['id'])
    for l in links:
        if not l.get('from_entity'):
            l['from'] = renamed.get(l['from'], l['from'])
        l['to'] = renamed.get(l['to'], l['to'])
        l.pop('from_entity', None)
    path = golden_path(project)
    old = read_json(path, {}) or {}
    ids = {n['id'] for n in nodes}
    keep_nodes = [n for n in old.get('nodes') or [] if n.get('origin') != 'setting' and n['id'] not in ids]
    keep_links = [l for l in old.get('links') or [] if l.get('origin') != 'setting' and (l['to'] in ids or any(k['id'] == l['to'] for k in keep_nodes))]
    for l in links:
        l['origin'] = 'setting'
    out = {'basis': rv.get('basis') or old.get('basis') or '', 'nodes': nodes + keep_nodes, 'links': links + keep_links, 'styles': old.get('styles') or {}, 'renamed': renamed}
    write_json(path, out)
    log(f'combat golden: {len(nodes)} setting nodes, {len(links)} links between them; kept from before: {len(keep_nodes)} nodes, {len(keep_links)} links, {len(out["styles"])} 对抗倾向 — {path}')
    return out


def golden_people(project, pack):
    """Writes the people's links, own abilities and 对抗倾向 a person kept (review "people": {person id: keep |
    {edit: {links | abilities | style: ...}}} over work/<project>/combat/people/<id>.json) into the verified file,
    beside the setting nodes. Every person of the pack must be decided."""
    rv = read_json(review_path(project), {}) or {}
    dec = rv.get('people') or {}
    path = golden_path(project)
    g = read_json(path, {}) or {}
    persons = [e for e in pack['entities'] if e['kind'] == 'person']
    open_ = [e['id'] for e in persons if e['id'] not in dec]
    if open_:
        raise SystemExit(f'combat golden people: {len(open_)} people not reviewed yet (first: {open_[:5]})')
    ents = {e['id'] for e in pack['entities']}
    nodes = [n for n in g.get('nodes') or [] if n.get('origin') != 'people']
    links = [l for l in g.get('links') or [] if l.get('origin') != 'people']
    taken = {n['id'] for n in nodes} | ents
    styles = {}
    for e in persons:
        d = dec[e['id']]
        prop = read_json(project.p('combat', 'people', f'{e["id"]}.json'), {}) or {}
        got = {**prop, **((d.get('edit') or {}) if isinstance(d, dict) else {})}
        for a in got.get('abilities') or []:
            a = {**a, 'id': _id(a['id'])}
            i, k = a['id'], 2
            while a['id'] in taken:
                a['id'] = f'{i}-{k}'
                k += 1
            taken.add(a['id'])
            parts = {}
            for p in a.get('parts') or []:   # one part each (a model may write "condition" and "conditions"): joined
                k = PART_NAMES.get(p.get('part'), p.get('part'))
                if k not in PARTS or not p.get('text'):
                    continue
                if k in parts:
                    parts[k]['text'] += '；' + p['text']
                    if p.get('secret'):
                        parts[k]['visibility'] = {'mode': 'secret', 'knower_ids': [e['id']]}
                else:
                    parts[k] = {'part': k, 'text': p['text'], **({'visibility': {'mode': 'secret', 'knower_ids': [e['id']]}} if p.get('secret') else {})}
            node = {'id': a['id'], 'kind': 'ability', 'name': a['name'], 'gist': a['gist'], 'text': a['text'],
                    'parts': [parts[k] for k in PARTS if k in parts], 'origin': 'people', 'owner_ids': [e['id']]}
            if a.get('generated') or not prop.get('has_page'):
                node['generated'] = True
            nodes.append(node)
            links.append({'from': e['id'], 'to': a['id'], 'label': a.get('label') or '能力', 'from_event': a.get('from_event'), 'until_event': a.get('until_event'), 'origin': 'people'})
        for l in got.get('links') or []:
            links.append({'from': e['id'], 'to': (g.get('renamed') or {}).get(l['node'], l['node']), 'label': l.get('label') or '是', 'from_event': l.get('from_event'), 'until_event': l.get('until_event'), 'origin': 'people'})
        st = []
        for v in got.get('style') or []:
            st.append({k: v[k] for k in ('from_event', 'until_event', 'why', 'start', 'force', 'response', 'limit', 'stop') if v.get(k) or k == 'from_event'}
                      | ({'generated': True} if v.get('generated') else {}))
        if st:
            styles[e['id']] = st
    # timing (review "timing": {person: {node: event id | "outside" | "drop"}}): a link that holds only from a later
    # event; one that holds only after everything the pack covers, or that the sources do not give them, is left out
    timing = rv.get('timing') or {}
    ev_ids = {ev['id'] for ev in pack['events']}
    kept_links = []
    for l in links:
        t = (timing.get(l['from']) or {}).get(l['to']) if l.get('origin') == 'people' else None
        if t in ('outside', 'drop'):
            continue
        if t:
            if t not in ev_ids:
                raise SystemExit(f'combat golden people: timing {l["from"]} -> {l["to"]}: {t!r} is not an event of the pack')
            l['from_event'] = t
        kept_links.append(l)
    links = kept_links
    g.update(nodes=nodes, links=links, styles=styles)
    write_json(path, g)
    log(f'combat golden people: {sum(1 for n in nodes if n.get("origin") == "people")} own abilities, {sum(1 for l in links if l.get("origin") == "people")} links, {len(styles)} 对抗倾向 — {path}')
    return g


def golden_precedents(project, pack):
    """Writes the original story's fights a person kept (review "precedents": {event id: keep | drop: why | {keep,
    edit}} over work/<project>/combat/precedents.json) into the verified file as precedent nodes (who, event_id)."""
    rv = read_json(review_path(project), {}) or {}
    dec = rv.get('precedents') or {}
    prop = read_json(project.p('combat', 'precedents.json'), {}) or {}
    open_ = [i for i in prop if i not in dec]
    if open_:
        raise SystemExit(f'combat golden precedents: {len(open_)} not reviewed yet (first: {open_[:5]})')
    path = golden_path(project)
    g = read_json(path, {}) or {}
    nodes = [n for n in g.get('nodes') or [] if n.get('origin') != 'precedent']
    evs = {e['id'] for e in pack['events']}
    n = 0
    for eid, p in prop.items():
        d = dec[eid]
        if not (d == 'keep' or (isinstance(d, dict) and d.get('keep'))):
            continue
        p = {**p, **((d.get('edit') or {}) if isinstance(d, dict) else {})}
        if eid not in evs:
            raise SystemExit(f'combat golden precedents: {eid} is not an event of the pack')
        nodes.append({'id': 'fight-' + re.sub(r'[^a-z0-9]+', '-', eid.lower()).strip('-'), 'kind': 'precedent', 'name': p['name'], 'gist': p['gist'], 'text': p['text'],
                      'who': p['who'], 'event_id': eid, 'origin': 'precedent'})
        n += 1
    g['nodes'] = nodes
    write_json(path, g)
    log(f'combat golden precedents: {n} fights — {path}')
    return g
