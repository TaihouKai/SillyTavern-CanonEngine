"""开局状态: who belongs to each organization and who leads it when the story begins. Events write who joins and who
leaves; what an organization was before its first event is told by its own page, not by any event. The model reads
the organization's page with the pack's own changes to it in time order and says who was in it and who led it just
before the first of them, from the pack's people only (code checks the ids).

Kept in <work>/start/<organization id>.json; `build` adds them when the organization first appears in the story
with its people (not at the beginning of time: 格雷姆林 had members in 2019, before it was formed)."""
import os

from .llm import LLMError
from .mind import page_of
from .nature import clean_wikitext
from .util import log, read_json, warn, write_json

START_VERSION = 'start-2'

START_SYSTEM = """You give the starting state of one organization (or group) of a story world for a history database. The database records, event by event, who joins and who leaves it; you say who was in it and who led it when it first appears in the story's events (listed below), before the first of those changes. Read its wiki page (members, history) with the list of the database's own changes to it.
- members: the people who belong to it at that point, by the ids of the candidate list only. Not someone who joins in one of the listed changes (that change adds them), unless they were in it before and the change is a return; and not someone who only works with it, is its target, or appears in its history long before or after. A ranked or numbered group (the seven of something) includes everyone in the ranking at that point. A group without members as such (a city, a nation, a church as a whole) gets none: answer {"none": true}.
- leader: the id of its actual leader at that point, or null.
- why: one short sentence.
Reply with a JSON object only: {"members": ["id", ...], "leader": "id" or null, "why": ""} or {"none": true}."""

START_USER = """Work: {work}

Organization: {name}{aliases} [{id}]
Pack description: {desc}
Its first appearances in the database: {first}

The database's own changes to it, in time order:
{changes}

Candidate people (id | name | other names):
{people}

Wiki page:
{page}"""


def check_start(ids, named=None):
    """named: the ids the page or the changes name (a member must be one of them)."""
    def check(obj):
        if not isinstance(obj, dict):
            return ['reply must be a JSON object']
        if obj.get('none') is True:
            return []
        bad = [m for m in obj.get('members') or [] if m not in ids]
        out = [f'members not in the candidate list: {", ".join(map(str, bad[:8]))}'] if bad else []
        if obj.get('leader') not in (None, '') and obj['leader'] not in ids:
            out.append(f'leader {obj["leader"]} is not in the candidate list')
        if not isinstance(obj.get('members'), list):
            out.append('members must be a list')
        elif named is not None:
            unnamed = [m for m in obj['members'] if m in ids and m not in named]
            if unnamed:
                out.append(f'not named in the page or the changes: {", ".join(unnamed[:8])} — only people the page or the changes name')
        return out
    return check


def _when(ev):
    return (ev.get('when') or {}).get('label') or ''


def generate(project, client, pack, wiki):
    """Writes <work>/start/<organization id>.json for every organization of the pack that has a page of its own or
    a change of its members or leader; returns how many got members."""
    out_dir = project.p('start')
    ents = {e['id']: e for e in pack['entities']}
    people = [e for e in pack['entities'] if e.get('kind') == 'person']
    timed = sorted(pack['events'], key=lambda e: (e['when']['earliest']['day'], e['when']['earliest']['minute']))
    jobs = []
    for o in pack['entities']:
        if o.get('kind') not in ('organization', 'other'):
            continue
        changes = []
        involved = set()
        for ev in timed:
            for ef in ev.get('canonical_effects') or []:
                f = ef.get('fact') or ef
                if f.get('entity_id') == o['id'] and f.get('predicate') in ('members', 'leader'):
                    vals = f.get('value') if isinstance(f.get('value'), list) else [f.get('value')] if f.get('value') else []
                    involved |= {v for v in vals if v in ents}
                    what = {'add': '加入' if f['predicate'] == 'members' else '成为首领', 'remove': '离开' if f['predicate'] == 'members' else '不再是首领',
                            'set': '首领为', 'unset': '首领空缺'}.get(ef.get('op', 'set'), ef.get('op'))
                    changes.append(f'- {_when(ev)} 「{ev["title"]}」：{what} {"、".join(ents[v]["name"] for v in vals if v in ents)}')
        page = page_of(o, wiki)
        if not page and not changes:
            continue
        text = clean_wikitext(page, 10000) if page else ''
        # the people the page names or the changes involve (the reply may name only these)
        cands = [p for p in people if p['id'] in involved or (text and any(len(n) >= 2 and n in text for n in [p['name'], *(p.get('aliases') or [])[:4]]))]
        if not cands:
            continue
        ids = {p['id'] for p in cands}
        first = '；'.join(f'{_when(e)}「{e["title"]}」' for e in [e for e in timed if o['id'] in (e.get('entity_ids') or [])][:4]) or '（无）'
        user = START_USER.format(work=pack.get('title', project.name), name=o['name'], aliases=f'（{"、".join(o.get("aliases", [])[:6])}）' if o.get('aliases') else '',
                                 id=o['id'], desc=o.get('static_description') or '', first=first, changes='\n'.join(changes) or '（无）',
                                 people='\n'.join(f'{p["id"]} | {p["name"]} | {"、".join(p.get("aliases", [])[:4])}' for p in cands[:150]),
                                 page=text or '（无页面）')

        def one(user=user, ids=ids):
            try:
                return client.call('start', START_VERSION, START_SYSTEM, user, check_start(ids, ids), max_tokens=2000)
            except LLMError as err:
                warn(f'start: {err}')
                return None
        jobs.append((o['id'], one))
    res = client.run_many(jobs, 'start')
    n = 0
    for oid, r in res.items():
        if isinstance(r, Exception) or r is None:
            continue
        write_json(os.path.join(out_dir, f'{oid}.json'), {'id': oid, 'version': START_VERSION, **r})
        n += 0 if r.get('none') else 1
    log(f'start: {n} of {len(jobs)} organizations with members at the start — {client.ledger.summary()}')
    return n


def place(project, by_id, events):
    """The organizations' starting members and leaders, each from when they enter the story: a member joins the record
    at the first event (from their own first appearance and the organization's) that involves them or the
    organization, or before they are seen leaving it; one in no event is in the initial state (not at the beginning of
    time: 格雷姆林 had members in 2019, before it was formed). Returns the initial-state facts; events change in place."""
    d = project.p('start')
    out = []
    if not os.path.isdir(d):
        return out
    at = lambda e: e['when']['earliest']['day'] * 1440 + e['when']['earliest']['minute']  # noqa: E731
    timed = sorted(events, key=at)
    seen = {}
    for e in timed:
        for i in e.get('entity_ids') or []:
            seen.setdefault(i, at(e))
    eff = lambda e, oid: [(x.get('fact') or x) | {'op': x.get('op', 'set')} for x in e.get('canonical_effects') or [] if (x.get('fact') or x).get('entity_id') == oid]  # noqa: E731
    touches = lambda e, oid: oid in (e.get('entity_ids') or []) or bool(eff(e, oid))  # noqa: E731
    vals = lambda v: [v] if isinstance(v, str) else list(v or [])  # noqa: E731

    def put(ev, oid, pred, ids):
        for lst in (ev['canonical_effects'], ev.setdefault('outcomes', []) if ev.get('classification') != 'HARD' else None):
            if lst is None:
                continue
            own = next((x for x in lst if x.get('op') == 'add' and x.get('entity_id') == oid and x.get('predicate') == pred), None)
            if own is None:
                lst.insert(0, {'op': 'add', 'entity_id': oid, 'predicate': pred, 'value': ids if pred == 'members' else ids[0]})
            elif pred == 'members':
                own['value'] = sorted(set(own['value']) | set(ids))
        if oid not in ev['entity_ids']:
            ev['entity_ids'].append(oid)

    for f in sorted(os.listdir(d)):
        r = read_json(os.path.join(d, f)) or {}
        oid = r.get('id')
        if oid not in by_id or r.get('none'):
            continue
        ms = sorted({m for m in r.get('members') or [] if by_id.get(m, {}).get('kind') == 'person'})
        leader = r.get('leader') if r.get('leader') in by_id else None
        why = r.get('why') or '按组织页面'
        org_seen = seen.get(oid)
        plan = {}
        for pred, who in [('members', m) for m in ms] + ([('leader', leader)] if leader else []):
            t = max(x for x in (seen.get(who), org_seen) if x is not None) if (seen.get(who) is not None or org_seen is not None) else None
            ev = None if t is None else next((e for e in timed if at(e) >= t and (who in (e.get('entity_ids') or []) or touches(e, oid))), None)
            # seen leaving it (or handing over) before that: they were in it then
            gone = next((e for e in timed if any(x['predicate'] == pred and x['op'] == 'remove' and who in vals(x.get('value')) for x in eff(e, oid))), None)
            if gone is not None and (ev is None or at(gone) < at(ev)):
                ev = gone
            if ev is None:
                out.append({'fact': {'entity_id': oid, 'predicate': pred, 'value': [who] if pred == 'members' else who}, 'source_refs': ['source-scripts'], 'note': f'开局状态（编辑推定：{why}）'})
                continue
            plan.setdefault((ev['id'], pred), (ev, []))[1].append(who)
        for (_, pred), (ev, ids) in plan.items():
            put(ev, oid, pred, sorted(ids))
    # one fact per organization and predicate in the initial state
    merged = {}
    for x in out:
        k = (x['fact']['entity_id'], x['fact']['predicate'])
        if k in merged and x['fact']['predicate'] == 'members':
            merged[k]['fact']['value'] = sorted(set(merged[k]['fact']['value']) | set(x['fact']['value']))
        else:
            merged.setdefault(k, x)
    return list(merged.values())
