"""A person's corrections of what the summaries and the models got wrong, kept in the review file with the other
decisions (cpb/review.py) and applied on every build, after the events are assembled and before who belongs where is
completed (changes.complete). A whole-pack read (2026-11-14) found states on the wrong entity, the same thing as two
entities, names and words left in English, research notes in the text and texts cut off: each is fixed here, by a
person, and stays fixed on a rebuild.

  events:   event id -> {"drop": [{"entity", "predicate", "op"?, "value"?}],   an effect (and its outcome) that is
                                   wrong; for members, "value" lists who is taken out of that change
                         "unlink": [entity ids],          an entity the event does not concern (linked by a name)
                         "link": [entity ids],            one it does concern and missed
                         "knowers_drop": [entity ids],    not among those who know its secret
                         "recast": {"from id": "to id"},  one entity read as another: every reference moves
                         "texts": [{"old", "new"}],       text of this event (title, summary, hook, roles, required)
                         "after_drop": [event ids],       a link "that one leads to this" the summary got wrong
                                                          (applied where links become edges, before the windows
                                                          are narrowed by them: cpb/assemble.py)
                         "note": why}
  entities: entity id -> {"merge_into": id}               the same thing as another entity: references move there,
                                                          its name and aliases become aliases there
                       | {"drop": true}                   no entity at all (a place "茵蒂克丝（地点）")
                       | {"name", "kind", "description", "aliases_drop": [...], "aliases_add": [...]}
  texts:    [{"old", "new", "in"?: [event or entity ids], "people"?: true}]  a wording fixed wherever it is (events,
                                                          arcs, entity descriptions; "people": in 常态 and 思考方式,
                                                          which are attached after the build)
  minds:    entity id -> {"mind": {field: text}, "nature": {"<from_event or 'start'>": {field: text}}}

Every correction must still find what it corrects: one that matches nothing (the text changed, the event went) is
listed by the checks until it is removed (a stale decision hides nothing, but it is not a decision about this pack).
"""
import os

from .util import read_json, write_json

TEXT_FIELDS = ('background', 'trigger', 'course', 'result', 'aftermath', 'impact', 'note')


def _vals(v):
    return v if isinstance(v, list) else [v]


def _event_texts(e):
    """(getter, setter) pairs over an event's text."""
    s = e.get('summary') or {}
    out = [(lambda: e.get('title') or '', lambda v: e.__setitem__('title', v))]
    for f in TEXT_FIELDS:
        if s.get(f):
            # a part made empty goes (an aftermath that only repeated the course)
            out.append(((lambda f=f: s.get(f, '')), (lambda v, f=f: s.__setitem__(f, v) if v.strip() else s.pop(f, None))))
    for m in s.get('motives') or []:
        out.append(((lambda m=m: m.get('who') or ''), (lambda v, m=m: m.__setitem__('who', v))))
        out.append(((lambda m=m: m.get('motive') or ''), (lambda v, m=m: m.__setitem__('motive', v))))
    for c in e.get('cast') or []:
        out.append(((lambda c=c: c.get('role') or ''), (lambda v, c=c: c.__setitem__('role', v))))
    if e.get('required_description'):
        out.append(((lambda: e['required_description']), (lambda v: e.__setitem__('required_description', v))))
    p = e.get('participation') or {}
    if p.get('hook'):
        out.append(((lambda: p['hook']), (lambda v: p.__setitem__('hook', v))))
    lab = (e.get('when') or {}).get('label')
    if lab:
        out.append(((lambda: e['when']['label']), (lambda v: e['when'].__setitem__('label', v))))
    if e.get('author_note'):
        out.append(((lambda: e['author_note']), (lambda v: e.__setitem__('author_note', v))))
    # what the event writes, in words (a status, what someone learns); not the ids of members, holders, allies
    for lst in ('canonical_effects', 'outcomes'):
        for o in e.get(lst) or []:
            f = o.get('fact') if 'fact' in o else o
            if isinstance(f.get('value'), str) and f.get('predicate') not in ('members', 'leader', 'holder', 'ally'):
                out.append(((lambda f=f: f['value']), (lambda v, f=f: f.__setitem__('value', v))))
    return out


def _entity_texts(ent):
    out = []
    if ent.get('static_description'):
        out.append(((lambda: ent['static_description']), (lambda v: ent.__setitem__('static_description', v))))
    m = ent.get('mind') or {}
    for k, v in list(m.items()):
        if isinstance(v, str):
            out.append(((lambda k=k: m[k]), (lambda v, k=k: m.__setitem__(k, v))))
    for ver in ent.get('nature') or []:
        for k in ('why', 'habits', 'uses', 'others', 'limits'):
            if isinstance(ver.get(k), str):
                out.append(((lambda ver=ver, k=k: ver[k]), (lambda v, ver=ver, k=k: ver.__setitem__(k, v))))
        per = ver.get('perceives')
        if isinstance(per, dict) and per.get('how'):
            out.append(((lambda per=per: per['how']), (lambda v, per=per: per.__setitem__('how', v))))
    return out


def _replace(pairs, old, new):
    n = 0
    for get, put in pairs:
        t = get()
        if old in t:
            put(t.replace(old, new))
            n += t.count(old)
    return n


def _effect_parts(o):
    f = o.get('fact') or o
    return f.get('entity_id'), f.get('predicate'), o.get('op', 'set'), f.get('value')


def _rename_value(pred, v, a, b):
    if pred in ('members',) and isinstance(v, list):
        return list(dict.fromkeys(b if x == a else x for x in v))
    if pred in ('leader', 'holder', 'ally') and v == a:
        return b
    return v


def move_refs(e, a, b):
    """Every reference of entity a in event e moves to b (b None: the references go)."""
    for f in ('entity_ids', 'location_ids'):
        if a in (e.get(f) or []):
            e[f] = list(dict.fromkeys([b if x == a else x for x in e[f] if b is not None or x != a]))
    if e.get('cast'):
        cast, seen = [], set()
        for c in e['cast']:
            i = b if c['entity_id'] == a else c['entity_id']
            if i is None or i in seen:
                continue
            seen.add(i)
            cast.append(dict(c, entity_id=i))
        e['cast'] = cast
    vis = e.get('visibility') or {}
    if a in (vis.get('knower_ids') or []):
        vis['knower_ids'] = list(dict.fromkeys([b if x == a else x for x in vis['knower_ids'] if b is not None or x != a]))
    s = e.get('summary') or {}
    if s.get('motives'):
        mot = []
        for m in s['motives']:
            if a in (m.get('entity_ids') or []):
                if b is None and m['entity_ids'] == [a]:
                    continue        # the motive of the one taken out of the event goes with them
                m['entity_ids'] = list(dict.fromkeys([b if x == a else x for x in m['entity_ids'] if b is not None or x != a]))
            mot.append(m)
        # one person's motive told twice (each of the people they were read as had one): once
        seen, s['motives'] = set(), []
        for m in mot:
            k = (tuple(m.get('entity_ids') or []) or m.get('who'), m.get('motive'))
            if k not in seen:
                seen.add(k)
                s['motives'].append(m)
    for lst in ('canonical_effects', 'outcomes'):
        keep = []
        for o in e.get(lst) or []:
            f = o.get('fact') if 'fact' in o else o
            if f.get('entity_id') == a:
                if b is None:
                    continue
                f['entity_id'] = b
            v = f.get('value')
            if b is None and f.get('predicate') == 'members' and isinstance(v, list) and a in v:
                f['value'] = [x for x in v if x != a]
                if not f['value']:
                    continue
            elif b is None and f.get('predicate') in ('leader', 'holder', 'ally') and v == a:
                continue
            else:
                f['value'] = _rename_value(f.get('predicate'), v, a, b)
            keep.append(o)
        if lst in e:
            e[lst] = keep
    # the same change twice after the move: once
    for lst in ('canonical_effects', 'outcomes'):
        seen, out = set(), []
        for o in e.get(lst) or []:
            k = repr(_effect_parts(o))
            if k not in seen:
                seen.add(k)
                out.append(o)
        if lst in e:
            e[lst] = out


def apply(pack, rv, rep=None, people=False):
    """Applies the review file's corrections to an assembled pack (in place); returns the corrections that matched
    nothing (strings, for the checks)."""
    miss = []
    events = {e['id']: e for e in pack['events']}
    ents = {e['id']: e for e in pack['entities']}
    # per event
    for eid, c in sorted((rv.get('events') or {}).items()):
        e = events.get(eid)
        if e is None:
            miss.append(f'events.{eid}：包里没有这个事件')
            continue
        for d in c.get('drop') or []:
            hit = False
            for lst in ('canonical_effects', 'outcomes'):
                keep = []
                for o in e.get(lst) or []:
                    ent, pred, op, v = _effect_parts(o)
                    if ent != d['entity'] or pred != d['predicate'] or (d.get('op') and op != d['op']):
                        keep.append(o)
                        continue
                    if 'value' in d and pred == 'members' and isinstance(v, list):
                        rest = [x for x in v if x not in _vals(d['value'])]
                        if len(rest) == len(v):
                            keep.append(o)
                            continue
                        hit = True
                        if rest:
                            (o.get('fact') or o)['value'] = rest
                            keep.append(o)
                        continue
                    if 'value' in d and v != d['value']:
                        keep.append(o)
                        continue
                    hit = True
                if lst in e:
                    e[lst] = keep
            if not hit:
                miss.append(f'events.{eid}.drop：{d["entity"]}.{d["predicate"]} 没有对上')
            if e.get('classification') == 'HARD' and not e.get('outcomes'):
                e['classification'], e['required_description'] = 'SOFT', None
        for a, b in (c.get('recast') or {}).items():
            if a not in ents or b not in ents:
                miss.append(f'events.{eid}.recast：{a}→{b} 有不存在的实体')
                continue
            before = repr(e)
            move_refs(e, a, b)
            if repr(e) == before:
                miss.append(f'events.{eid}.recast：{a} 不在这个事件里')
        for a in c.get('unlink') or []:
            before = repr(e)
            move_refs(e, a, None)
            if repr(e) == before:
                miss.append(f'events.{eid}.unlink：{a} 不在这个事件里')
        for a in c.get('link') or []:
            if a not in ents or a in e['entity_ids']:
                miss.append(f'events.{eid}.link：{a} 不存在或已在事件里')
                continue
            e['entity_ids'].append(a)
        vis = e.get('visibility') or {}
        for a in c.get('knowers_drop') or []:
            if a not in (vis.get('knower_ids') or []):
                miss.append(f'events.{eid}.knowers_drop：{a} 不在知情者里')
                continue
            vis['knower_ids'] = [x for x in vis['knower_ids'] if x != a]
        for t in c.get('texts') or []:
            if not _replace(_event_texts(e), t['old'], t['new']):
                miss.append(f'events.{eid}.texts：「{t["old"]}」没找到')
    # entities: edits, then merges and drops (references move over the whole pack)
    for i, c in sorted((rv.get('entities') or {}).items()):
        ent = ents.get(i)
        if ent is None:
            miss.append(f'entities.{i}：包里没有这个实体')
            continue
        if c.get('name'):
            ent['name'] = c['name']
        if c.get('kind'):
            ent['kind'] = c['kind']
        if c.get('description'):
            ent['static_description'] = c['description']
        al = list(ent.get('aliases') or [])
        for a in c.get('aliases_drop') or []:
            if a in al:
                al.remove(a)
            else:
                miss.append(f'entities.{i}.aliases_drop：没有别名「{a}」')
        al += [a for a in c.get('aliases_add') or [] if a not in al and a != ent['name']]
        ent['aliases'] = [a for a in al if a != ent['name']]
    into = {i: c['merge_into'] for i, c in (rv.get('entities') or {}).items() if c.get('merge_into')}
    drop = {i for i, c in (rv.get('entities') or {}).items() if c.get('drop')}

    def root(x):
        seen = set()
        while x in into and x not in seen:
            seen.add(x)
            x = into[x]
        return x
    for a in sorted(into):
        b = root(a)
        if a not in ents or b not in ents or a == b:
            miss.append(f'entities.{a}.merge_into：{into[a]} 不可用')
            continue
        src, dst = ents[a], ents[b]
        al = list(dst.get('aliases') or [])
        for n in [src['name'], *(src.get('aliases') or [])]:
            if n and n != dst['name'] and n not in al:
                al.append(n)
        dst['aliases'] = al
        for k in ('mind', 'nature'):
            if src.get(k) and not dst.get(k):
                dst[k] = src[k]
    gone = {a: root(a) for a in into if a in ents and root(a) in ents and root(a) != a}
    gone.update({i: None for i in drop if i in ents})
    for a, b in gone.items():
        for e in pack['events']:
            move_refs(e, a, b)
        facts = []
        for x in pack['initial_state']['facts']:
            f = x['fact']
            if f['entity_id'] == a:
                if b is None:
                    continue
                f['entity_id'] = b
            f['value'] = _rename_value(f['predicate'], f['value'], a, b) if b else f['value']
            facts.append(x)
        pack['initial_state']['facts'] = facts
    pack['entities'] = [x for x in pack['entities'] if x['id'] not in gone]
    ents = {e['id']: e for e in pack['entities']}
    # wordings fixed wherever they are
    for t in rv.get('texts') or []:
        if bool(t.get('people')) != people:
            continue        # a wording of 常态 or 思考方式 is fixed once they are attached (after the build)
        n = 0
        scope = set(t.get('in') or [])
        for e in pack['events']:
            if not scope or e['id'] in scope:
                n += _replace(_event_texts(e), t['old'], t['new'])
        for a in pack.get('arcs') or []:
            if not scope or a['id'] in scope:
                pairs = [((lambda a=a, k=k: a.get(k) or ''), (lambda v, a=a, k=k: a.__setitem__(k, v))) for k in ('title', 'summary')]
                n += _replace(pairs, t['old'], t['new'])
        for ent in pack['entities']:
            if not scope or ent['id'] in scope:
                n += _replace(_entity_texts(ent), t['old'], t['new'])
        if not n:
            miss.append(f'texts：「{t["old"]}」没找到')
    if rep is not None:
        n_ev = len(rv.get('events') or {})
        n_en = len(rv.get('entities') or {})
        rep.add('corrected', f'人工更正：{n_ev} 个事件、{n_en} 个实体（其中 {len([g for g in gone.values() if g])} 个并入别的实体、{len([g for g in gone.values() if g is None])} 个删去）、{len(rv.get("texts") or [])} 处用词')
    return miss


def apply_people(pack, rv):
    """The review file's fixes of 常态 and 思考方式 (attached after the build): returns the ones that matched nothing."""
    miss = []
    ents = {e['id']: e for e in pack['entities']}
    for i, c in sorted((rv.get('minds') or {}).items()):
        ent = ents.get(i)
        if ent is None:
            miss.append(f'minds.{i}：包里没有这个实体')
            continue
        for k, v in (c.get('mind') or {}).items():
            if not ent.get('mind'):
                miss.append(f'minds.{i}.mind：没有思考方式')
                break
            if v:
                ent['mind'][k] = v
            else:
                ent['mind'].pop(k, None)
        for when, fields in (c.get('nature') or {}).items():
            ver = next((x for x in ent.get('nature') or [] if (x.get('from_event') or 'start') == when), None)
            if ver is None:
                miss.append(f'minds.{i}.nature.{when}：没有这一版常态')
                continue
            for k, v in fields.items():
                ver[k] = v
    return miss


def merged_from(rv):
    """{kept id: [ids merged into it]}: their 常态 and 思考方式 files serve the kept one when it has none."""
    out = {}
    for a, c in (rv.get('entities') or {}).items():
        if c.get('merge_into'):
            out.setdefault(c['merge_into'], []).append(a)
    return out


def write_misses(project, misses):
    write_json(project.p('out', 'corrections-misses.json'), misses)


def read_misses(project):
    p = project.p('out', 'corrections-misses.json') if hasattr(project, 'p') else None
    return (read_json(p, []) or []) if p and os.path.exists(p) else []
