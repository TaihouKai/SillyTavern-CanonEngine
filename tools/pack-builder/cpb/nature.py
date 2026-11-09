"""常态: how a person's special nature (a power, a condition, a non-human body, a trained capacity) shows in what they
do every day, so the game master plays it as part of the person, not as a skill kept for the plot. Versions follow
the events that change the nature itself (gaining, losing or limiting a power, a lasting injury, a condition getting
worse); the engine picks the version the actual history of a playthrough has reached.

Inputs per person: the pack entity, the wiki page when there is one, and the pack events they appear in."""
import json
import os
import re

from .llm import LLMError
from .util import ROOT, log, read_json, warn, write_json

NATURE_VERSION = 'nature-11'

NATURE_SYSTEM = """You write the 常态 (everyday nature) of one person for a game master who runs a story world with a player.

Problem this solves: game masters play people with a power, a condition or a non-human nature as ordinary people who merely own a skill, used only when the plot calls for it. In the original work the nature is part of the person: a telepath hears thoughts all the time and answers what was not said; a short-tempered electro-master sparks when angry; a sick person coughs and tires; a spirit does not need to eat. Write how this person's nature shows in ordinary scenes.

SCOPE. Only these count: a power or ability; a magic, fighting art or technique they live by; an illness, injury or other bodily condition; an unusual or non-human body; an implant, drug or device they depend on. Nothing else: not personality, temper, tastes, hobbies, smoking, speech habits, looks, clothes, job, rank, reputation, relationships or story role — the character card covers those — unless the nature itself causes it (a speech pattern caused by the power is in; a catchphrase is not). Training without anything beyond human (a strict teacher, a police officer, a gang leader with guns) does not count. Test every sentence: if it would still be true of this person without their power or condition (a hobby, a friend they are always with, a job they do with a computer, a fear of machines), leave it out. If nothing counts, or the sources say too little to tell, answer {{"none": true}}; an ordinary person is none.

TRUTH. Write what the sources state, or what follows directly from how the power works. Do not invent everyday quirks the sources do not support; a weak or obscure power gets a short entry, not an embellished one.

PATTERNS, NOT STORY. The game master reads this every turn while the player makes new scenes the original never had. A specific incident, a named person or a nickname here would be taken as story to bring up, again and again. So every sentence is a pattern that can show in any new scene, said with general words for others (朋友、同学、找麻烦的人、纠缠她的人、对手): never a person's name or nickname (in habits, uses and others), never a specific event, fight, line of dialogue or use from the story ("electrocutes Kuroko", "fought Touma for two hours", "shot a signal tower into the sky" are all wrong; "shocks a friend who goes too far", "cannot stop herself attacking someone her power does not work on" are right). Only limits may name a person, and only one the power itself treats differently (the one person it does not work on).

VERSIONS. Version 1 (from_event null) is the person at the start given below: what happened before it (listed as background) is already part of them, and nothing they become, learn or decide after it belongs in version 1 (a killer who later vows not to kill is, in version 1, still the killer). Check every sentence of a version against its start: leave out anything that only becomes true later — a later injury, someone's later memory loss or death, a device, title or person met later.
A later version starts at a listed event (from the story's start on) where the nature itself changes for a long time. These always get one: a power gained, lost, sealed or unsealed; a permanent change of the body (a lost limb or eye and the prosthesis that replaces it); starting or stopping to depend on a device or drug; a chronic condition starting, worsening or cured. An injury or illness is never a version by itself, however serious, nor is the wheelchair, bandage or hospital stay while it heals: the game tracks injuries and healing separately. Only what it leaves for good counts (brain damage that makes them depend on a device). When a long change later ends (a device given up, a seal broken), give until_event, or start another version there. Plot or circumstances (being captured, an experiment ending, joining a group, a new post, a new resolve, an arc) is never a version, even when the pack records a change at that event. Never more than four versions.

Each version is read alone (the game master sees only the version in force), so write it in full: never \"同上\", \"照旧\" or a reference to another version. Each version, in {lang}, concrete and brief (each field 1 to 3 sentences, something a scene can show):
- habits: what shows without any plot need — the passive or habitual use, visible signs, small everyday uses. Say how often or when (总是 / 生气时 / 只要对方在眼前); do not make it constant where it is not.
- uses: when they use it on purpose or cannot help using it, and how far they go with ordinary people and friends around (hold back, show off, use it on friends).
- others: what people around them know of it and how that changes how they treat them.
- limits: what it cannot do, its cost, what they will not do with it.
- why: later versions only: what changed, one sentence, no plot retelling.
- lasts: later versions only: \"for_good\" if the sources show the change still in force long after (months, or to the end of the story); \"until\" if it ends at a listed event (then give until_event); \"passing\" if it is a temporary state (one fight, an awakening for a moment, a coma or possession that ends). Passing changes are not versions: leave them out.
- introduces: later versions only: the short names (1 to 4) of what first exists with this change — an item, a device, a seal, a new form (e.g. ["凯尔特十字架"], ["项圈电极", "拐杖"]). Earlier versions must not mention them: before the change the person does not have them.

Reply with a JSON object only:
{{"none": false, "versions": [{{"from_event": null, "habits": "", "uses": "", "others": "", "limits": ""}}, {{"from_event": "<event id>", "until_event": null, "lasts": "for_good", "why": "", "introduces": [], "habits": "", "uses": "", "others": "", "limits": ""}}]}}"""

NATURE_USER = """Work: {work}

Person: {name}{aliases}
Pack description: {desc}

Story start (version 1 is the person as of): {first}

Background — before the story starts (already part of version 1; not usable as from_event):
{before}

Events from the story's start (id | when | title | changes of their own facts the pack records, if any), in story order:
{events}

Wiki page:
{page}"""

FIELDS = ('habits', 'uses', 'others', 'limits')
NAMED_FIELDS_OK = ('limits',)   # the one person a power does not work on
NAME_PART_RATIO = 8


def other_names(pack, eid, corpus=''):
    """Names of the other people in the pack: each full name, and the parts of it the pack gives as aliases (美琴 of
    御坂美琴) when the sources use that part mostly as the name, not as a common word (唯一 of 木原唯一, 妹妹 of 多莉的「妹妹」:
    the part is found far more often than the full name), and only people who share an event with this person. Aliases that are not part of the name — ability names,
    titles, nicknames (超电磁炮, 女王) — are left to the story check. Names contained in this person's own names (a
    clone's 御坂) are not someone else."""
    own = [n for e in pack['entities'] if e['id'] == eid for n in [e['name'], *(e.get('aliases') or [])]]
    # only people who share an event with this person can leak in as their story
    cast = {x for ev in pack.get('events', []) if eid in (ev.get('entity_ids') or []) for x in ev.get('entity_ids') or []}
    out = set()
    for e in pack['entities']:
        if e['id'] == eid or e.get('kind') != 'person' or (cast and e['id'] not in cast):
            continue
        full = (e['name'] or '').strip()
        cand = [full] + [a.strip() for a in (e.get('aliases') or []) if a and a.strip() != full and a.strip() in full]
        n_full = corpus.count(full) if corpus else 0
        for n in cand:
            if len(n) < 2 or any(n in o for o in own):
                continue
            if n != full and corpus and n_full and corpus.count(n) > NAME_PART_RATIO * n_full:
                continue
            out.add(n)
    return sorted(out, key=len, reverse=True)


def clean_wikitext(t, limit=14000):
    t = re.sub(r'<ref[^>]*?/>|<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'\{\{注\|[^{}]*\}\}', '', t)
    t = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r"'{2,}", '', t)
    for _ in range(3):
        t = re.sub(r'\{\{(?:rl|rs|ruby|nihongo|小灰|等级)\|([^{}|]*)[^{}]*\}\}', r'\1', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    # the plot record is long and least useful here: keep the rest first
    m = re.search(r'\n==\s*作中行动\s*==', t)
    if m:
        head, plot = t[:m.start()], t[m.start():]
        t = head + plot[:max(0, limit - len(head))]
    return t[:limit]


# facts of the pack that can be a change of the nature itself
NATURE_PREDICATES = ('injury', 'form', 'power', 'condition', 'status', 'alive', 'memory')


def own_changes(e, eid):
    """The changes of this person's own facts the event records (outcomes, and canonical effects: a "set" carries its
    fact under "fact", an add/remove carries it inline), one per predicate and value."""
    out, seen = [], set()
    for o in (e.get('outcomes') or []) + (e.get('canonical_effects') or []):
        f = o.get('fact') if isinstance(o.get('fact'), dict) else o
        k = (f.get('predicate'), json.dumps(f.get('value'), ensure_ascii=False))
        if f.get('entity_id') == eid and f.get('predicate') in NATURE_PREDICATES and k not in seen:
            seen.add(k)
            out.append(f)
    return out


def event_lines(pack, eid, max_lines=80, start_day=None):
    """The person's events in story order, each with the changes of their own facts the pack records; when there are
    too many, the ones with such changes are kept and the rest is an even spread, first and last included."""
    evs = [e for e in pack['events'] if eid in (e.get('entity_ids') or [])]
    def key(e):
        w = (e.get('when') or {}).get('earliest') or {}
        return (w.get('day', 10 ** 9), w.get('minute', 0))
    evs.sort(key=key)
    if len(evs) > max_lines:
        keep = {e['id'] for e in evs if own_changes(e, eid)} | {evs[0]['id'], evs[-1]['id']}
        rest = [e for e in evs if e['id'] not in keep]
        n = max(0, max_lines - len(keep))
        if n and rest:
            step = len(rest) / n
            keep |= {rest[int(i * step)]['id'] for i in range(min(n, len(rest)))}
        evs = [e for e in evs if e['id'] in keep]
    def line(e):
        ch = '；'.join(f'{o["predicate"]}={o.get("value")}' for o in own_changes(e, eid))
        return f'{e["id"]} | {((e.get("when") or {}).get("label") or "").split("；")[0]} | {e["title"]}' + (f' | 变化：{ch}' if ch else '')
    if start_day is None:
        return [line(e) for e in evs], [e['id'] for e in evs]
    before = [e for e in evs if key(e)[0] < start_day]
    after = [e for e in evs if key(e)[0] >= start_day]
    return [line(e) for e in before], [line(e) for e in after], [e['id'] for e in after]


def check_nature(ids, names=()):
    def check(obj):
        if not isinstance(obj, dict):
            return ['reply must be a JSON object']
        if obj.get('none') is True:
            return []
        vs = obj.get('versions')
        if not isinstance(vs, list) or not vs:
            return ['"versions" must be a non-empty list (or answer {"none": true})']
        out = []
        if vs[0].get('from_event'):
            out.append('the first version must have from_event null')
        if len(vs) > 4:
            out.append('at most four versions')
        for i, v in enumerate(vs[1:], 1):
            if v.get('from_event') not in ids:
                out.append(f'version {i}: from_event "{v.get("from_event")}" is not an id from the event list')
            elif v.get('until_event') and (v['until_event'] not in ids or ids.index(v['until_event']) <= ids.index(v['from_event'])):
                out.append(f'version {i}: until_event must be a listed event after from_event')
            if v.get('lasts') not in ('for_good', 'until', 'passing'):
                out.append(f'version {i}: lasts must be "for_good", "until" or "passing"')
            elif v['lasts'] == 'until' and not v.get('until_event'):
                out.append(f'version {i}: lasts is "until" but until_event is missing')
        # what a later version introduces is not there at the start (live trial: a seal received weeks after the start was
        # already worn in version 1)
        for i, v in enumerate(vs[1:], 1):
            for term in [str(t).strip() for t in (v.get('introduces') or []) if str(t).strip()]:
                if term in ' '.join(str(vs[0].get(f) or '') for f in FIELDS):
                    out.append(f'version 0 mentions "{term}", which version {i} introduces (from {v.get("from_event")}): at the story start the person does not have it — rewrite version 0 without it')
        # a person's name outside limits is story the game master would bring up (live trial: 美琴 "对白井黑子施以电击处分")
        for i, v in enumerate(vs):
            text = ' '.join(str(v.get(f) or '') for f in FIELDS if f not in NAMED_FIELDS_OK)
            hit = [n for n in names if n in text]
            if hit:
                out.append(f'version {i} names {", ".join(hit[:5])} outside limits: write the pattern with general words (朋友、同学、对手…), no names')
        for i, v in enumerate(vs):
            miss = [f for f in FIELDS if not str(v.get(f) or '').strip()]
            if miss:
                out.append(f'version {i}: {", ".join(miss)} empty')
        return out
    return check


MIN_TEMP_DAYS = 14


def event_day(pack_events, eid):
    w = (pack_events[eid].get('when') or {}).get('earliest') or {}
    return w.get('day')


def drop_short(pack, obj):
    """A bounded version shorter than MIN_TEMP_DAYS is a passing state (an injury that heals), which the engine tracks
    as facts: it is dropped here rather than trusted to the prompt (live trial: a saint's three injuries in a month)."""
    evs = {e['id']: e for e in pack['events']}
    keep, dropped = [], []
    for v in obj.get('versions') or []:
        a, b = (event_day(evs, v['from_event']), event_day(evs, v['until_event'])) if v.get('from_event') and v.get('until_event') else (None, None)
        # a passing state (the model says so) or one that ends within MIN_TEMP_DAYS
        (dropped if v.get('lasts') == 'passing' or (a is not None and b is not None and b - a < MIN_TEMP_DAYS) else keep).append(v)
    # the return from a dropped passing state may repeat the version before it word for word: nothing changes there
    for i in range(len(keep) - 1, 0, -1):
        if all(str(keep[i].get(f) or '') == str(keep[i - 1].get(f) or '') for f in FIELDS):
            dropped.append({**keep.pop(i), 'why': '(same as the version before) '})
    if dropped:
        obj = {**obj, 'versions': keep, 'dropped': [{'from_event': v['from_event'], 'until_event': v.get('until_event'), 'why': v.get('why', '')} for v in dropped]}
    return obj


STORY_VERSION = 'nature-story-2'

STORY_SYSTEM = """A game master reads the text below every turn as background on how a person's power or condition shows, while the player makes new scenes the original story never had. Anything in it that is the original's story, not a general pattern, would be brought up again and again as if it mattered now. Find every sentence or clause that is story:
- something that happened once: a past incident or backstory ("村庄曾因此被毁", "曾被当作备份而遭雪藏", "two years ago her leg ended up inside a wall"), a specific use or deed from the story ("让对手的研究员反水", "把信号塔射上平流层");
- a named person or someone identified by a unique role or relation (the dorm supervisor, her roommate, the one who defeated her), a nickname, rumor or urban legend about them ("都市传说「脱衣女」");
- a line someone said.
A general pattern that can show in any new scene is fine ("shocks a friend who goes too far", "machines near her break down", "the one person her power does not work on"); the names of powers, items and the person's own groups are fine. Copy the words exactly. Reply with a JSON object only: {"story": ["the exact words", ...]} — an empty list if there is none."""


def sentences(t):
    return [x for x in re.split(r'(?<=[。；！？])', t or '') if x.strip()]


def strip_story(client, obj):
    """Removes the sentences a model check marks as story, not pattern (by words copied from the text). Names are not
    cut here: the name check sends them back to the writer, and a name it keeps after that is most likely a word of the
    power itself (神之力 is also an angel's name in the pack). A field left empty stays empty."""
    texts = '\n'.join(f'[{i}.{f}] {v.get(f, "")}' for i, v in enumerate(obj['versions']) for f in FIELDS)
    r = client.call('nature_story', STORY_VERSION, STORY_SYSTEM, texts, max_tokens=1200) or {}
    marks = [_norm(q) for q in (r.get('story') or []) if isinstance(q, str) and len(_norm(q)) >= 4]
    removed = []
    for v in obj['versions']:
        for f in FIELDS:
            keep = []
            for sen in sentences(v.get(f)):
                n = _norm(sen)
                if any(m in n or (len(n) >= 4 and n in m) for m in marks):
                    removed.append(sen.strip())
                else:
                    keep.append(sen)
            v[f] = ''.join(keep).strip()
    if removed:
        obj['removed_story'] = removed
    return obj


VERIFY_VERSION = 'nature-verify-1'

VERIFY_SYSTEM = """You check one claim against sources. The claim says that at a story event the nature of ONE person (their power, body, condition or a device they depend on) changed for a long time. Other people take part in the same event: a change that happens to someone else does not count. Reply with a JSON object only: {"supported": true or false, "quote": "the exact words from the sources that show this change happening to this person (copy them character for character), or \\"\\""}"""

VERIFY_USER = """Person: {name}
Claim: at the event "{title}", {name}'s nature changed: {why}

Event summary:
{summary}

Wiki page of {name}:
{page}"""


def event_text(e):
    s = e.get('summary')
    if isinstance(s, dict):
        return '\n'.join(f'{k}: {v}' for k, v in s.items() if isinstance(v, str) and v)
    return str(s or '')


def _norm(t):
    return re.sub(r'\s+', '', t or '')


def verify_versions(client, pack, name, obj, page):
    """A later version at an event that records no change of this person's own facts must be backed by a quote from the
    event summary or the wiki page showing the change happening to them (live trial: a head wound of another person at
    the same event became the girl's own version). Unbacked versions are dropped."""
    evs = {e['id']: e for e in pack['events']}
    eid = obj.get('_eid')
    keep, dropped = [obj['versions'][0]], list(obj.get('dropped') or [])
    for v in obj['versions'][1:]:
        e = evs[v['from_event']]
        if own_changes(e, eid):
            keep.append(v)
            continue
        summary = event_text(e)
        r = client.call('nature_verify', VERIFY_VERSION, VERIFY_SYSTEM,
                        VERIFY_USER.format(name=name, title=e['title'], why=v.get('why', ''), summary=summary, page=page[:8000] or '(none)'),
                        max_tokens=600)
        q = _norm((r or {}).get('quote'))
        if (r or {}).get('supported') is True and len(q) >= 4 and (q in _norm(summary) or q in _norm(page)):
            keep.append({**v, 'evidence': r['quote']})
        else:
            dropped.append({'from_event': v['from_event'], 'until_event': v.get('until_event'), 'why': '(not backed by the sources) ' + v.get('why', '')})
    out = {k: x for k, x in obj.items() if k != '_eid'}
    out['versions'] = keep
    if dropped:
        out['dropped'] = dropped
    return out


def _generate_one(client, system, user, ids, names):
    try:
        return client.call('nature', NATURE_VERSION, system, user, check_nature(ids, names), max_tokens=3000)
    except LLMError as e:
        # names it would not write away are removed with their sentences afterwards (strip_story)
        warn(f'nature: {e}; taking the reply without the name check')
        return client.call('nature', NATURE_VERSION, system, user, check_nature(ids), max_tokens=3000)


def generate(project, client, pack, entity_ids, wiki, lang='Simplified Chinese', out_dir=None):
    """Writes <out_dir>/<entity id>.json per person; returns {entity id: result}."""
    ents = {e['id']: e for e in pack['entities']}
    out_dir = out_dir or project.p('nature')
    corpus = '\n'.join(v for v in wiki.values() if isinstance(v, str))
    jobs = []
    for eid in entity_ids:
        e = ents[eid]
        names = [e['name'], *(e.get('aliases') or [])]
        page = next((wiki[n] for n in names if n in wiki), '')
        before, lines, ids = event_lines(pack, eid, start_day=0)
        origin = (pack.get('calendar') or {}).get('origin_label') or 'day 0'
        # version 1 is the person at the story's start (day 0 of the pack's calendar), or at their first appearance after it
        first = origin + ('; this person first appears at: ' + ' | '.join(lines[0].split(' | ')[1:3]) if lines and not before else '')
        system = NATURE_SYSTEM.format(lang=lang)
        user = NATURE_USER.format(work=pack.get('title', project.name), name=e['name'],
                                  aliases=f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else '',
                                  desc=e.get('static_description') or '', events='\n'.join(lines) or '(none)',
                                  before='\n'.join(before) or '(none)', first=first,
                                  page=clean_wikitext(page) if page else '(no wiki page)')
        names = other_names(pack, eid, corpus)
        jobs.append((eid, (lambda s=system, u=user, i=ids, ns=names: _generate_one(client, s, u, i, ns))))
    res = client.run_many(jobs, 'nature')
    pages = {eid: clean_wikitext(next((wiki[n] for n in [ents[eid]['name'], *(ents[eid].get('aliases') or [])] if n in wiki), '')) for eid in entity_ids}
    vjobs = [(eid, (lambda eid=eid, r=r: strip_story(client, verify_versions(client, pack, ents[eid]['name'], {**drop_short(pack, json.loads(json.dumps(r))), '_eid': eid}, pages[eid]))))
             for eid, r in res.items() if not isinstance(r, Exception) and r and not r.get('none')]
    checked = client.run_many(vjobs, 'nature_verify') if vjobs else {}
    for eid, r in res.items():
        if isinstance(r, Exception) or r is None:
            continue
        final = r if r.get('none') else checked.get(eid)
        if isinstance(final, Exception) or final is None:
            continue
        write_json(f'{out_dir}/{eid}.json', {'id': eid, 'name': ents[eid]['name'], 'version': NATURE_VERSION, **final})
    log(f'nature: {sum(1 for r in res.values() if not isinstance(r, Exception))}/{len(jobs)} — {client.ledger.summary()}')
    return res


PACK_FIELDS = ('from_event', 'until_event', 'why', *FIELDS)


def attach(pack, nature_dir):
    """Puts the generated 常态 on the pack's people (entity "nature"), in the pack's own format: the version fields only,
    versions at events the pack does not have dropped, empty ones left out. Returns how many people got one."""
    evs = {e['id'] for e in pack['events']}
    n = 0
    for e in pack['entities']:
        e.pop('nature', None)
        d = read_json(f'{nature_dir}/{e["id"]}.json')
        if e.get('kind') != 'person' or not d or d.get('none') or not d.get('versions'):
            continue
        vs = []
        for i, v in enumerate(d['versions']):
            if i and (v.get('from_event') not in evs or (v.get('until_event') and v['until_event'] not in evs)):
                continue
            out = {k: v.get(k) for k in PACK_FIELDS if k in ('from_event', 'until_event') or str(v.get(k) or '').strip()}
            out['from_event'] = None if not vs else out['from_event']
            if not out.get('until_event'):
                out.pop('until_event', None)
            for k in FIELDS:
                out[k] = str(out.get(k) or '').strip()
            if any(out[k] for k in FIELDS):
                vs.append(out)
        if vs:
            e['nature'] = vs
            n += 1
    return n


def wiki_pages(project):
    """The wiki pages of a wiki project (name → text), for the person's own page; {} for other sources."""
    pages = {}
    for k in ('fandom', 'huiji'):   # the Chinese wiki wins for a name both have
        path = (project.get('wiki') or {}).get(k)
        if path:
            pages.update(read_json(path if os.path.isabs(path) else os.path.join(ROOT, path), {}) or {})
    return pages
