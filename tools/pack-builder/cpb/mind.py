"""思考方式: how a person thinks — how much effort they put into thinking before they act, how well they reason when they
do, and how they go about a problem. Game masters give everyone the same mind and change only the tone, so a schemer
merely sounds clever and a hothead reasons like a scholar. The engine plays everyone by it and works out the moves of
those who think before they act (角色盘算).

Only the pack's people with a page of their own in the sources get one (a passer-by does not); a page too thin to tell
gives none."""
import os

from .llm import LLMError
from .nature import clean_wikitext, other_names
from .util import log, read_json, warn, write_json

MIND_VERSION = 'mind-1'
DELIBERATION = ('rarely', 'situational', 'habitual')
SHARPNESS = ('plain', 'sharp', 'exceptional')
FIELDS = ('approach', 'thinks_hard_about', 'pushed', 'notices', 'blind', 'speaks')

MIND_SYSTEM = """You write how one person of a story world THINKS, for a game master who plays them in new scenes with a player. Problem this solves: game masters give every person the same mind and only change their tone, so a schemer merely sounds clever and says what anyone would say, and a hothead stops to reason like a scholar. People differ in how much effort they put into thinking before they act, in how well they reason when they do, and in how they go about a problem. Inclination and ability are separate: a brawler can be sharp but rarely bothers; a plotter may plan constantly and still misjudge people.

Describe this person as the sources show them, in {lang}:
- deliberation: one of "rarely" (acts on instinct or feeling; thinks a problem through only when pushed), "situational" (thinks when the stakes or their interest call for it), "habitual" (always reading the situation, planning, keeping their own angle).
- sharpness: one of "plain", "sharp", "exceptional": how well they reason when they do think, regardless of how often.
- approach: 1-2 sentences: how they usually go about a problem or a person in their way (charge in, talk it out, bargain, manipulate, investigate, wait, get someone else to do it, pull rank...).
- thinks_hard_about: the matters they do think hard about even if they rarely deliberate (a fight's openings, a friend's safety, research, money), or "" if none.
- pushed: what makes them stop and think it through anyway, 1 sentence, or "".
- notices: what they pick up that others miss, 1 sentence, or "".
- blind: what they reliably fail to see or misjudge, 1 sentence, or "".
- speaks: how their thinking shows in what they say (not their tone or catchphrases): do they say what they think, hide their conclusions, ask leading questions, give orders, ramble, answer only the question... 1 sentence.

PATTERNS, NOT STORY. This is read in new scenes the original never had: write general patterns with general words (朋友、对手、陌生人、上级、家人), never a person's name or nickname, a specific event, plan, fight or line from the story. TRUTH: only what the sources support; an ordinary person gets an ordinary, short description, not an inflated one. If the sources say too little about how this person thinks and acts to tell, answer {{"none": true}}.
Reply with a JSON object only: {{"deliberation": "", "sharpness": "", "approach": "", "thinks_hard_about": "", "pushed": "", "notices": "", "blind": "", "speaks": ""}}"""

MIND_USER = """Work: {work}

Person: {name}{aliases}
Pack description: {desc}

Wiki page:
{page}"""


def check_mind(names=()):
    def check(obj):
        if not isinstance(obj, dict):
            return ['reply must be a JSON object']
        if obj.get('none') is True:
            return []
        out = []
        if obj.get('deliberation') not in DELIBERATION:
            out.append(f'deliberation must be one of {", ".join(DELIBERATION)}')
        if obj.get('sharpness') not in SHARPNESS:
            out.append(f'sharpness must be one of {", ".join(SHARPNESS)}')
        if not str(obj.get('approach') or '').strip():
            out.append('approach is empty')
        # a name is story the game master would bring up (as with 常态)
        text = ' '.join(str(obj.get(f) or '') for f in FIELDS)
        hit = [n for n in names if n in text]
        if hit:
            out.append(f'names {", ".join(hit[:5])}: write the pattern with general words (朋友、对手、家人…), no names')
        return out
    return check


def drop_named(obj, names):
    if not isinstance(obj, dict) or obj.get('none'):
        return obj
    out = {k: ('' if k in FIELDS and any(n in str(v or '') for n in names) else v) for k, v in obj.items()}
    return out if str(out.get('approach') or '').strip() else {'none': True}


def page_of(e, wiki):
    return next((wiki[n] for n in [e['name'], *(e.get('aliases') or [])] if n in wiki), '')


def generate(project, client, pack, wiki, lang='Simplified Chinese', out_dir=None):
    """Writes <out_dir>/<entity id>.json for every person of the pack with a page of their own; returns how many."""
    out_dir = out_dir or project.p('mind')
    corpus = '\n'.join(v for v in wiki.values() if isinstance(v, str))
    people = [e for e in pack['entities'] if e.get('kind') == 'person' and page_of(e, wiki)]
    system = MIND_SYSTEM.format(lang=lang)

    def one(e):
        user = MIND_USER.format(work=pack.get('title', project.name), name=e['name'],
                                aliases=f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else '',
                                desc=e.get('static_description') or '', page=clean_wikitext(page_of(e, wiki), 12000))
        names = other_names(pack, e['id'], corpus)
        try:
            return client.call('mind', MIND_VERSION, system, user, check_mind(names), max_tokens=2000)
        except LLMError as err:
            # a name it would not write away: the reply without the fields that name someone (live: 欧雷尔斯's
            # "pushed" kept naming 欧提努斯 after three tries); without an approach there is none
            warn(f'mind {e["id"]}: {err}; dropping the fields that name someone')
            return drop_named(client.call('mind', MIND_VERSION, system, user, check_mind(), max_tokens=2000), names)

    res = client.run_many([(e['id'], (lambda e=e: one(e))) for e in people], 'mind')
    ents = {e['id']: e for e in people}
    n = 0
    for eid, r in res.items():
        if isinstance(r, Exception) or r is None:
            continue
        write_json(f'{out_dir}/{eid}.json', {'id': eid, 'name': ents[eid]['name'], 'version': MIND_VERSION, **r})
        n += 0 if r.get('none') else 1
    log(f'mind: {n} of {len(people)} people with a page — {client.ledger.summary()}')
    return n


def attach(pack, mind_dir):
    """Puts the generated 思考方式 on the pack's people (entity "mind"); returns how many got one."""
    n = 0
    for e in pack['entities']:
        e.pop('mind', None)
        d = read_json(f'{mind_dir}/{e["id"]}.json') if os.path.isdir(mind_dir) else None
        if e.get('kind') != 'person' or not d or d.get('none') or d.get('deliberation') not in DELIBERATION or d.get('sharpness') not in SHARPNESS:
            continue
        m = {'deliberation': d['deliberation'], 'sharpness': d['sharpness']}
        for f in FIELDS:
            v = str(d.get(f) or '').strip()
            if v:
                m[f] = v
        if m.get('approach'):
            e['mind'] = m
            n += 1
    return n
