"""称呼: how each side of a relation addresses or refers to the other, stage by stage, so the game master gets the forms
right (user, 2026-11-16: "AI很多时候会乱称呼"). Only the forms a reader could not guess from the other's full name —
a nickname, a title, an honorific, an insult, an endearment, the surname or the given name alone — each with how
often it is used (always: the only one; usually; sometimes, with the situation). Not every pair has one, and the
plain full name never is one.

For each verified relation (projects/<name>.relations.json) the model reads the stages as a person verified them
(what they are to each other, how each sees the other), the relation's dated facts (work/<name>/relations, written by
`relations`; code gives each stage only the facts true by its start) and the lines of both wiki pages about how one
calls the other. It answers the forms per stage and side; code checks them. The answers are proposals: a person reads
every one (work/<name>/out/address-review.txt) and `address --apply` puts them into the verified relations, where
they are fixed by hand like the rest.

A stage's view in the pack: {who, address?: [{term, use, when?}], sees}."""
import json
import os
import re

from .llm import LLMError
from .nature import clean_wikitext
from .relations import _own_names, _start_day, golden_path, load_golden, page_of, rel_entries, save_golden
from .util import log, read_json, warn, write_json

ADDRESS_VERSION = 'address-2'
USES = ('always', 'usually', 'sometimes')
PAGE_CHARS = 2500       # what each page says about the other: its 人际关系 entry, then the lines about addressing them
# words of a line that tells how someone is addressed or called
CALL_WORDS = re.compile(r'称呼|称为|称作|称她|称他|叫她|叫他|叫做|唤作|直呼|昵称|外号|绰号|敬称|爱称|蔑称|喊她|喊他|呼为|管她叫|管他叫|口头禅')
# a term that is more than the form itself: brackets, quotes, "或", an explanation
NOT_A_TERM = re.compile(r'[「」『』“”"\'（）()：:；;，,、]|或|直呼|称呼|一类|叫法|等$')
KANA = re.compile(r'[぀-ヿ]')

SYSTEM = """You give the forms by which two people of a story world address or refer to each other, stage by stage, for a game master who plays them in new scenes. Problem this solves: the game master gets forms of address wrong — a junior who always calls her idol 姐姐大人 calls her by name, a rival is called by a pet name — and that is what readers notice first. In {lang}.

Give only the forms a reader could not guess from the other's full name: a nickname, a title or rank, an honorific form (御坂同学, 上条先生), an insult or mocking name, an endearment, a kinship word, or the surname or the given name alone (that choice says how close they are). Never the plain full name: with no form given, the game master uses the name as the story would. Many sides have no form worth giving: then address is [].

A form is how one side regularly addresses or refers to the other. Not a form: something said once (a jibe in one scene, a line of dialogue), a bare pronoun (你, 您, 他, 她 — 你这家伙 can be one), a description of the other.

Each form:
- term: the form itself, exactly as the story's {lang} text writes it — no brackets, quotes, "或", explanation or Japanese kana (a Japanese honorific as the translation renders it: 御坂同学, 上条酱). One form per entry.
- use: always — rare: only when they are known never to call the other anything else (白井黑子's 姐姐大人 for 御坂美琴); a nickname used beside the other's name is usually or sometimes, and the name they mostly use is then given too (the surname, the given name, with an honorific). usually — their common form; sometimes — now and then, in a situation: then when says which (when angry, teasing, in front of others, speaking of the other to someone else).
- when: for usually or sometimes, in what situation it is used, a few words, when the sources tell it ("跟别人提起他时" for how she speaks of him; "当面" for how she speaks to him); "" otherwise.
Someone who addresses the other one way and speaks of them another way has both forms, each with its when.

Stages: each stage shows how they stand from its start, and the forms in use then. Only what is true by the stage's start: the facts listed under a stage are those true when it starts, and a page line may tell of a change that comes later (称呼从「…」变为「…」 at some event) — a form begins at the stage where it begins, never earlier, and a form no longer used is left out of the stages after. Only the sides listed for a stage (a side not listed does not know the other yet).

TRUTH. Only forms the sources show, or that the work itself plainly uses (when you know the work well and are sure of it). Do not make up a nickname; do not turn a description ("把她当妹妹") into a form of address. Unsure: leave it out.

Reply with a JSON object only: {{"stages": [{{"n": 1, "views": [{{"who": "<name>", "address": [{{"term": "", "use": "usually", "when": ""}}]}}]}}]}}"""

USER = """Work: {work}

{a_name}{a_aliases} — {a_desc}
{b_name}{b_aliases} — {b_desc}

What {a_name}'s wiki page says about {b_name}:
{a_page}

What {b_name}'s wiki page says about {a_name}:
{b_page}

The stages (as verified), each with the facts true when it starts:
{stages}"""


def page_about(project, page, other, limit=PAGE_CHARS):
    """What a page says about the other person: its 人际关系 entry on them, then its other lines that mention them and
    how someone is called."""
    names = _own_names(project, other)
    entry = '\n'.join(text for ns, text in rel_entries(page) if any(n in names or any(m in n for m in names) for n in ns))
    rest = []
    if len(entry) < limit:
        text = clean_wikitext(re.sub(r'\n==\s*人际关系\s*==\n.*?(?=\n==[^=]|\Z)', '\n', page, flags=re.S), 60000)
        for line in re.split(r'(?<=[。！？\n])', text):
            s = line.strip()
            if s and CALL_WORDS.search(s) and any(n in s for n in names) and s not in entry:
                rest.append(s)
    out = (entry[:limit] + ('\n' if entry and rest else '') + '\n'.join(rest))[:limit]
    out = re.sub(r'<!--.*?-->|\{\{main\|[^{}]*\}\}', '', out, flags=re.S)   # editors' notes, "see the main article"
    return out.strip() or '(none)'


def stage_facts(facts, stages, events):
    """For each verified stage, the dated facts true by its start (a fact at an event that starts later is not), by the
    events' times: the verified stages may start elsewhere than those the facts were written for."""
    def pos(at):
        if at in (None, 'before'):
            return (-10 ** 9, 0)
        e = events.get(at)
        return _start_day(e) if e else (10 ** 9, 0)
    return [[f['fact'] for f in facts if pos(f.get('at')) <= pos(s.get('from_event'))] for s in stages]


def check(stage_sides, full_names):
    """stage_sides: for each stage, the names of the sides it has; full_names: name → the other's full name."""
    def run(obj):
        st = obj.get('stages') if isinstance(obj, dict) else None
        if not isinstance(st, list):
            return ['reply must be a JSON object with stages']
        out = []
        if len(st) != len(stage_sides):
            out.append(f'give exactly {len(stage_sides)} stages, one per stage listed, in order')
        for i, s in enumerate(st):
            if not isinstance(s, dict) or not isinstance(s.get('views'), list):
                out.append(f'stage {i + 1}: views must be a list')
                continue
            for v in s['views']:
                who = v.get('who') if isinstance(v, dict) else None
                if i < len(stage_sides) and who not in stage_sides[i]:
                    out.append(f'stage {i + 1}: who "{who}" is not one of the sides listed for this stage ({" / ".join(stage_sides[i])})')
                    continue
                forms = v.get('address')
                if not isinstance(forms, list):
                    out.append(f'stage {i + 1}, {who}: address must be a list ([] for none)')
                    continue
                for f in forms:
                    term = str((f or {}).get('term') or '').strip() if isinstance(f, dict) else ''
                    use = (f or {}).get('use') if isinstance(f, dict) else None
                    when = str((f or {}).get('when') or '').strip() if isinstance(f, dict) else ''
                    if not term:
                        out.append(f'stage {i + 1}, {who}: a form without its term')
                    elif NOT_A_TERM.search(term) or len(term) > 16:
                        out.append(f'stage {i + 1}, {who}: term "{term}" — only the form itself, one per entry: no brackets, quotes, "或" or explanation')
                    elif KANA.search(term):
                        out.append(f'stage {i + 1}, {who}: term "{term}" has Japanese kana — write it as the story text itself renders it')
                    elif term == full_names.get(who):
                        out.append(f'stage {i + 1}, {who}: "{term}" is the plain full name of the other — never a form to give (leave it out)')
                    if use not in USES:
                        out.append(f'stage {i + 1}, {who}: use of "{term}" must be always, usually or sometimes')
                    elif use == 'sometimes' and not when:
                        out.append(f'stage {i + 1}, {who}: "{term}" is used sometimes — say when')
                    elif use == 'always' and len(forms) > 1:
                        out.append(f'stage {i + 1}, {who}: "{term}" is always, so it is their only form — the others are not used then; or it is usually')
        return out
    return run


def generate(project, client, pack, wiki, lang='Simplified Chinese'):
    """Proposes the forms of address of every verified relation: work/<name>/address/<a>__<b>.json. Returns how many."""
    golden = load_golden(project)
    if not golden:
        log(f'address: no verified relations ({golden_path(project)})')
        return 0
    ents = {e['id']: e for e in pack['entities']}
    events = {e['id']: e for e in pack['events']}
    sysmsg = SYSTEM.format(lang=lang)
    out_dir = project.p('address')
    jobs = []
    for key, g in (golden.get('pairs') or {}).items():
        a, b = g['people']
        if a not in ents or b not in ents:
            continue
        ea, eb = ents[a], ents[b]
        cached = read_json(project.p('relations', f'{a}__{b}.json')) or read_json(project.p('relations', f'{b}__{a}.json')) or {}
        facts = stage_facts(cached.get('facts') or [], g['stages'], events)
        blocks = []
        for i, (s, fs) in enumerate(zip(g['stages'], facts)):
            ev = events.get(s.get('from_event')) if s.get('from_event') else None
            head = f'Stage {i + 1} — from {"the story start" if not ev else ((ev.get("when") or {}).get("label") or "").split("；")[0] + " " + ev["title"]}' + (f'; what changes: {s["why"]}' if s.get('why') and i else '')
            sides = '\n'.join(f'- side {ents[v["who"]]["name"]}: {v.get("sees") or ""}' for v in s['views'] if v['who'] in ents)
            blocks.append(f'{head}\nWhat they are to each other: {s.get("bond") or ""}\nSides listed:\n{sides}\nFacts true when it starts:\n' + ('\n'.join(f'- {f}' for f in fs) or '(none)'))
        al = lambda e: f'（{"、".join(e["aliases"][:6])}）' if e.get('aliases') else ''  # noqa: E731
        user = USER.format(work=pack.get('title', project.name), a_name=ea['name'], a_aliases=al(ea), a_desc=ea.get('static_description') or '',
                           b_name=eb['name'], b_aliases=al(eb), b_desc=eb.get('static_description') or '',
                           a_page=page_about(project, page_of(project, ea, wiki), eb) if page_of(project, ea, wiki) else '(none)',
                           b_page=page_about(project, page_of(project, eb, wiki), ea) if page_of(project, eb, wiki) else '(none)',
                           stages='\n\n'.join(blocks))
        sides = [[ents[v['who']]['name'] for v in s['views'] if v['who'] in ents] for s in g['stages']]
        chk = check(sides, {ea['name']: eb['name'], eb['name']: ea['name']})

        def one(user=user, chk=chk):
            try:
                return client.call('address', ADDRESS_VERSION, sysmsg, user, chk, max_tokens=3000, recheck=True)
            except LLMError as err:
                warn(f'address: {err}')
                return None
        jobs.append((key, one))
    res = client.run_many(jobs, 'address')
    n = 0
    for key, r in res.items():
        if isinstance(r, Exception) or r is None:
            continue
        a, b = golden['pairs'][key]['people']
        write_json(os.path.join(out_dir, f'{a}__{b}.json'), {'people': [a, b], 'version': ADDRESS_VERSION, 'stages': r['stages']})
        n += 1
    log(f'address: {n} of {len(jobs)} pairs — {client.ledger.summary()}')
    return n


def proposed(project, pack, key, g):
    """The proposal for one verified pair as each stage's views' address lists ({stage index: {who id: [forms]}}), the
    plain full name taken out; None when there is none."""
    a, b = g['people']
    d = read_json(os.path.join(project.p('address'), f'{a}__{b}.json'))
    if not d or d.get('version') != ADDRESS_VERSION:
        return None
    ents = {e['id']: e for e in pack['entities']}
    by_name = {ents[x]['name']: x for x in (a, b) if x in ents}
    out = {}
    for i, s in enumerate(d['stages'][:len(g['stages'])]):
        for v in s.get('views') or []:
            who = by_name.get(v.get('who'))
            if not who:
                continue
            other = ents[b if who == a else a]['name']
            forms = []
            for f in v.get('address') or []:
                term = str(f.get('term') or '').strip()
                if not term or term == other or f.get('use') not in USES:
                    continue
                forms.append({'term': term, 'use': f['use'], **({'when': f['when'].strip()} if str(f.get('when') or '').strip() else {})})
            out.setdefault(i, {})[who] = forms
    return out


def review_text(project, pack):
    """Every proposal as text to read: each pair's stages, each side's forms (and its former calls, for comparison)."""
    golden = load_golden(project) or {}
    ents = {e['id']: e for e in pack['entities']}
    events = {e['id']: e for e in pack['events']}
    lines = []
    for key, g in (golden.get('pairs') or {}).items():
        p = proposed(project, pack, key, g)
        N = lambda x: ents[x]['name'] if x in ents else x  # noqa: E731
        lines.append(f'## {key} {N(g["people"][0])}–{N(g["people"][1])}' + ('' if p is not None else '  (no proposal)'))
        for i, s in enumerate(g['stages']):
            ev = events.get(s.get('from_event')) if s.get('from_event') else None
            lines.append(f'  S{i + 1} {ev["title"] if ev else "开局"}')
            for v in s['views']:
                forms = (p or {}).get(i, {}).get(v['who'])
                txt = '；'.join(f'「{f["term"]}」{f["use"]}' + (f'（{f["when"]}）' if f.get('when') else '') for f in forms or []) or '—'
                lines.append(f'    {N(v["who"])}→{N(g["people"][1] if v["who"] == g["people"][0] else g["people"][0])}: {txt}' + (f'   [was: {v["calls"]}]' if v.get('calls') else ''))
    return '\n'.join(lines) + '\n'


def apply(project, pack):
    """Puts the proposals into the verified relations: each view's forms of address replace its former calls. A pair
    without a proposal keeps none. Returns how many pairs had one."""
    golden = load_golden(project)
    n = 0
    for key, g in (golden.get('pairs') or {}).items():
        p = proposed(project, pack, key, g)
        n += p is not None
        for i, s in enumerate(g['stages']):
            views = []
            for v in s['views']:
                forms = (p or {}).get(i, {}).get(v['who']) or []
                views.append({'who': v['who'], **({'address': forms} if forms else {}), 'sees': v['sees']})
            s['views'] = views
    save_golden(project, golden)
    return n
