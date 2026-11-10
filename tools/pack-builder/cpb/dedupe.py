"""Step (wiki projects): beats that tell the same happening twice become one.

An arc too long for one call is summarized in parts, and every part sees the whole arc's Chinese text: a happening
can come out of two parts. Several characters' accounts in one call can do the same. The model names the groups of
beats that are one happening; code merges each group into its first beat (the longest course and result, every
person, place, motive and change of all of them) and drops the rest.
"""
import collections
import re

from .util import log, read_json, write_json

VERSION = 'dedupe-1'

SYSTEM = """You check the beats of one story arc for duplicates. The beats were written from several overlapping sources, so the same happening (the same fight, meeting, death, revelation, at the same time with the same people) may appear more than once, under different titles or from different points of view.

Give the groups of beats that are the same happening. A beat that only continues, precedes or mirrors another (the next round of a fight, the same people meeting again later, the same kind of thing elsewhere) is not a duplicate. When unsure, do not group.

Reply with one JSON object only: {"groups": [["beat id", "beat id"], ...]} (an empty list when there are no duplicates). Every group has two or more ids; an id is in at most one group."""


def _line(b):
    t = b['time']
    return f'[{b["id"]}] {t.get("date", "")} {t.get("clock", "")} {b["title"]}：{b["course"][:160]}（人物：{"、".join(p["name"] for p in b["people"][:6])}）'


def check(ids):
    def f(obj):
        if not isinstance(obj, dict) or not isinstance(obj.get('groups'), list):
            return ['"groups" must be a list']
        # a beat in two groups joins them, a group of one is nothing (joined() makes them so): only unknown ids are
        # sent back (live: the reply for 超电磁炮 大霸星祭篇 was refused three times for beats in two groups, and
        # none of its duplicates was merged)
        return [f'unknown beat id {i}' for g in obj['groups'] if isinstance(g, list) for i in g if i not in ids]
    return f


def joined(groups):
    """Groups sharing a beat are one; groups of one are dropped; each keeps the order its beats were first named."""
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    order = []
    for g in groups:
        if not isinstance(g, list):
            continue
        for i in g:
            if i not in parent:
                order.append(i)
            find(i)
        for i in g[1:]:
            parent[find(i)] = find(g[0])
    out = {}
    for i in order:
        out.setdefault(find(i), []).append(i)
    return [g for g in out.values() if len(g) >= 2]


CROSS_VERSION = 'dedupe-cross-2'

VERIFY_SYSTEM = """Two records of a story's history, from two arcs that overlap in time, may tell the same happening. Decide whether they do: the same happening means the same scene: the same people doing the same thing at the same time and place (one record may tell it in more or less detail, or from another person's point of view). A cause and its consequence, two stages of one conflict, or two scenes with the same people are NOT the same happening.

Reply with one JSON object only: {"same": true or false, "why": "one short sentence"}"""


def _full(b):
    t = b['time']
    return (f'{b["title"]}（{t.get("date", "")} {t.get("clock", "")} {t.get("stated", "")}）\n起因：{b["trigger"]}\n经过：{b["course"]}\n结果：{b["result"]}\n'
            f'人物：{"、".join(p["name"] for p in b["people"])}\n地点：{"、".join(b["places"])}')


def check_ids(ids):
    def f(obj):
        if not isinstance(obj, dict) or not isinstance(obj.get('groups'), list):
            return ['"groups" must be a list']
        bad = [i for g in obj['groups'] if isinstance(g, list) for i in g if i not in ids]
        return [f'unknown beat ids: {bad[:5]}'] if bad else []
    return f

CROSS_SYSTEM = """You check two story arcs that overlap in time for happenings both of them record. The arcs come from different volumes or series that tell some of the same scenes (the same fight, meeting, death, revelation, at the same time with the same people).

Give the pairs or groups of beats, from the two arcs, that are the same happening. Beats of one arc that are merely similar, or the same people meeting at another time, are not duplicates. When unsure, do not group.

Reply with one JSON object only: {"groups": [["beat id", "beat id"], ...]} (an empty list when the arcs share no happening). Every group has two or more ids, from both arcs; an id is in at most one group."""


def run_cross(project, client):
    """Pairs of arcs whose dates overlap: the beats both tell."""
    import datetime as dt
    from .skeleton import corpus
    c = corpus(project)
    day = lambda s: dt.date.fromisoformat(s).toordinal()  # noqa: E731
    beats = {}
    for ch in c['chapters']:
        sums = [read_json(project.p('summaries', ch['id'], f'{u}.json')) for u in ch['units']]
        bs = [b for s in sums if s for b in s['beats']]
        d = read_json(project.p('dedupe', f'{ch["id"]}.json'))
        if d:
            drop = {x for g in d['groups'] for x in g[1:]}
            bs = [b for b in bs if b['id'] not in drop]
        beats[ch['id']] = bs
    jobs, plan = [], {}
    chs = c['chapters']
    for i, a in enumerate(chs):
        for z in chs[i + 1:]:
            lo, hi = max(day(a['start']), day(z['start'])), min(day(a['end']), day(z['end']))
            if lo > hi + 1:
                continue

            def near(ch, b):
                t = b['time'].get('date')
                if t:
                    try:
                        return lo - 1 <= day(t) <= hi + 1
                    except ValueError:
                        return False
                return day(ch['end']) - day(ch['start']) <= 7
            ba = [b for b in beats[a['id']] if near(a, b)]
            bz = [b for b in beats[z['id']] if near(z, b)]
            if not ba or not bz:
                continue
            ids = [b['id'] for b in ba + bz]
            key = f'{a["id"]}--{z["id"]}'
            path = project.p('dedupe', 'cross', f'{key}.json')
            prev = read_json(path)
            if prev and prev.get('beat_ids') == ids and prev.get('version') == CROSS_VERSION:
                continue
            user = (f'Arc A: {a["title"]}\n' + '\n'.join(_line(b) for b in ba) + f'\n\nArc B: {z["title"]}\n' + '\n'.join(_line(b) for b in bz))
            plan[key] = (ids, path, {b['id'] for b in ba}, {b['id'] for b in bz})
            jobs.append((key, (lambda u=user, ids=ids: client.call('dedupe-cross', CROSS_VERSION, CROSS_SYSTEM, u, check_ids(set(ids)), max_tokens=4000, json_mode=False))))
    if not jobs:
        log('dedupe across arcs: nothing to do')
        return
    log(f'dedupe across arcs: {len(jobs)} pairs of overlapping arcs')
    res = client.run_many(jobs, 'dedupe-cross')
    # every proposed pair is checked on its own, with both records in full: a wrong merge loses a happening
    by_id = {b['id']: b for bs in beats.values() for b in bs}
    pairs = {}
    for key, (ids, path, A, Z) in plan.items():
        r = res.get(key)
        if r is None or isinstance(r, Exception):
            continue
        for g in r['groups']:
            if not isinstance(g, list):
                continue
            for a in [x for x in g if x in A]:
                for z in [x for x in g if x in Z]:
                    pairs[(a, z)] = key
    vjobs = [((a, z), (lambda a=a, z=z: client.call('dedupe-verify', CROSS_VERSION, VERIFY_SYSTEM, f'记录一：\n{_full(by_id[a])}\n\n记录二：\n{_full(by_id[z])}',
                                                    lambda o: [] if isinstance(o, dict) and isinstance(o.get('same'), bool) else ['"same" must be true or false'],
                                                    max_tokens=300, json_mode=False))) for a, z in pairs]
    vres = client.run_many(vjobs, 'dedupe-verify') if vjobs else {}
    n = 0
    for key, (ids, path, A, Z) in plan.items():
        if key not in {k for k in pairs.values()} and not (res.get(key) is not None and not isinstance(res.get(key), Exception)):
            continue
        groups = [[a, z] for (a, z), k in pairs.items() if k == key and isinstance(vres.get((a, z)), dict) and vres[(a, z)].get('same')]
        n += len(groups)
        write_json(path, {'pair': key, 'version': CROSS_VERSION, 'beat_ids': ids, 'groups': groups,
                          'rejected': [[a, z, (vres.get((a, z)) or {}).get('why', '')] for (a, z), k in pairs.items() if k == key and [a, z] not in groups]})
    log(f'dedupe across arcs: {n} shared happenings — {client.ledger.summary()}')


def run(project, client, chapters=None):
    from .steps import raw_unit_summaries
    from .skeleton import corpus
    c = corpus(project)
    jobs, plan = [], {}
    for ch in c['chapters']:
        if chapters and ch['id'] not in chapters:
            continue
        beats = [b for s in raw_unit_summaries(project, c, ch['id']) for b in s['beats']]
        if len(beats) < 6:
            continue
        ids = [b['id'] for b in beats]
        path = project.p('dedupe', f'{ch["id"]}.json')
        prev = read_json(path)
        if prev and prev.get('beat_ids') == ids and prev.get('version') == VERSION:
            continue
        user = f'Arc: {ch["title"]}\n\nBeats in order:\n' + '\n'.join(_line(b) for b in beats)
        plan[ch['id']] = (ids, path)
        jobs.append((ch['id'], (lambda u=user, ids=ids: client.call('dedupe', VERSION, SYSTEM, u, check(set(ids)), max_tokens=4000, json_mode=False))))
    if not jobs:
        log('dedupe: nothing to do')
        if not chapters:
            run_cross(project, client)
        return
    log(f'dedupe: {len(jobs)} arcs')
    res = client.run_many(jobs, 'dedupe')
    n = 0
    for cid, (ids, path) in plan.items():
        r = res.get(cid)
        if r is None or isinstance(r, Exception):
            continue
        groups = joined(r['groups'])
        n += sum(len(g) - 1 for g in groups)
        write_json(path, {'chapter': cid, 'version': VERSION, 'beat_ids': ids, 'groups': groups})
    log(f'dedupe: {n} duplicate beats found — {client.ledger.summary()}')
    if not chapters:
        run_cross(project, client)


def apply(project, chapter_id, sums):
    """The summaries of a chapter with each group of duplicates merged into its first beat, and the beats that another
    arc tells too (cross_groups) merged into the one beat kept for them."""
    d = read_json(project.p('dedupe', f'{chapter_id}.json'))
    ids = [b['id'] for s in sums for b in s['beats']]
    groups = list(d['groups']) if d and d.get('beat_ids') == ids else []
    # one title on one day from two parts of the arc is one happening told twice (the Chinese part and an English
    # part name it alike; live: 30 such pairs the model's groups had missed)
    seen = {}
    for s_ in sums:
        for b_ in s_['beats']:
            k = (re.sub(r'\s+', '', b_['title']), b_['time'].get('date') or '')
            if k[1] and k in seen and seen[k][1] != s_['unit']:
                groups.append([seen[k][0], b_['id']])
            seen.setdefault(k, (b_['id'], s_['unit']))
    if groups:
        sums = _merge_groups(sums, joined(groups), {b['id']: b for s in sums for b in s['beats']})
    cross = cross_groups(project)
    if not cross:
        return sums
    mine = {b['id'] for s in sums for b in s['beats']}
    groups = [g for g in cross if any(x in mine for x in g)]
    if not groups:
        return sums
    beats = {b['id']: b for s in sums for b in s['beats']}
    for g in groups:
        for x in g:
            if x not in beats:
                b = _raw_beat(project, x)
                if b:
                    beats[x] = b
    # the beat kept is the one with the longest course; the others go
    out = []
    keep_of = {}
    for g in groups:
        g = [x for x in g if x in beats]
        if len(g) < 2:
            continue
        k = max(g, key=lambda x: len(beats[x]['course']))
        keep_of[k] = g
    merged = {}
    for k, g in keep_of.items():
        if k in mine:
            merged[k] = _merge_groups([{'beats': [beats[x] for x in [k] + [y for y in g if y != k]]}], [[k] + [y for y in g if y != k]], beats)[0]['beats'][0]
    drop = {x for k, g in keep_of.items() for x in g if x != k}
    for s in sums:
        s = dict(s)
        s['beats'] = [merged.get(b['id'], b) for b in s['beats'] if b['id'] not in drop]
        out.append(s)
    return out


def _raw_beat(project, bid):
    chapter, unit = bid.split('.')[0], bid.rsplit('.b', 1)[0]
    s = read_json(project.p('summaries', chapter, f'{unit}.json'))
    return next((b for b in (s or {}).get('beats', []) if b['id'] == bid), None)


_CROSS = {}


def cross_groups(project):
    if project.work not in _CROSS:
        import glob
        import os
        gs = []
        for f in sorted(glob.glob(os.path.join(project.work, 'dedupe', 'cross', '*.json'))):
            gs += (read_json(f) or {}).get('groups', [])
        # groups sharing a beat are one group
        parent = {}

        def find(x):
            while parent.setdefault(x, x) != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x
        for g in gs:
            for x in g[1:]:
                parent[find(x)] = find(g[0])
        out = collections.defaultdict(list)
        for g in gs:
            for x in g:
                if x not in out[find(x)]:
                    out[find(x)].append(x)
        _CROSS[project.work] = [g for g in out.values() if len(g) > 1]
    return _CROSS[project.work]


def _merge_groups(sums, groups, by_id):
    ids = [b['id'] for s in sums for b in s['beats']]
    order = {b: i for i, b in enumerate(ids)}
    drop = set()
    keeper = {}
    for g in groups:
        g = sorted((x for x in g if x in by_id and x in order), key=order.get)
        if len(g) < 2:
            continue
        keep = dict(by_id[g[0]])
        for other in g[1:]:
            o = by_id[other]
            for f in ('course', 'result', 'background', 'trigger', 'aftermath', 'note'):
                if len(o.get(f) or '') > len(keep.get(f) or ''):
                    keep[f] = o[f]
            people = {p['name']: p for p in keep['people']}
            for p in o['people']:
                people.setdefault(p['name'], p)
            keep['people'] = list(people.values())
            keep['places'] = list(dict.fromkeys(keep['places'] + o['places']))
            mot = {m['who']: m for m in keep['motives']}
            for m in o['motives']:
                mot.setdefault(m['who'], m)
            keep['motives'] = list(mot.values())
            ch_ = {(x['subject'], x['kind']): x for x in keep['changes']}
            for x in o['changes']:
                ch_.setdefault((x['subject'], x['kind']), x)
            keep['changes'] = list(ch_.values())
            keep['extra'] = {**o.get('extra', {}), **keep.get('extra', {})}
            if not keep['time'].get('date') and o['time'].get('date'):
                keep['time'] = o['time']
            if ['minor', 'normal', 'major'].index(o['importance']) > ['minor', 'normal', 'major'].index(keep['importance']):
                keep['importance'] = o['importance']
            if o['secret']['is_secret'] and keep['secret']['is_secret']:
                keep['secret'] = {'is_secret': True, 'knowers': list(dict.fromkeys(keep['secret']['knowers'] + o['secret']['knowers']))}
            else:
                keep['secret'] = {'is_secret': False, 'knowers': []}
            drop.add(other)
        keeper[g[0]] = keep
    out = []
    for s in sums:
        s = dict(s)
        s['beats'] = [keeper.get(b['id'], b) for b in s['beats'] if b['id'] not in drop]
        out.append(s)
    return out
