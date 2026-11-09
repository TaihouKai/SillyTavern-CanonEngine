"""Step: assemble a pack that refines an earlier version of itself (project base_pack), from wiki arcs (code, no model).

The base pack's entities keep their ids. Its events before base_keep_before stay as they are. Each later base event
was mapped by the chapter edit to the beat that is the same happening: that beat takes the base event's id, its
HARD contract (required description, outcomes) and its effects, so what was hand-checked in the base survives and
the edges between base events still hold. A base event no beat took stays as it was (the report lists them).
Every other beat becomes a new event. Only base HARD events are HARD: the model's own fixed points become SOFT.

Time: each arc runs from its start date. A beat with a date (and clock time) the sources give sits there; the beats
between two dated ones follow their time cues and are compressed to fit. Times are in the base pack's calendar.
"""
import collections
import copy
import datetime as dt
import os
import re

from . import changes as org_changes, names, timeline
from .assemble import (DEFAULT_HOOK, GENERIC_ALIASES, PREDICATES, FactState, Report, group_candidates, slug, value_for, ID_OK)
from .skeleton import corpus
from .steps import all_summaries
from .util import ROOT, read_json, uniq, write_json

DAY = 1440
INJURY_LASTING = r'失去(?:了)?(?:一条|一只|双|左|右|两)?(?:手|臂|腿|眼|足|脚)|截肢|义肢|义眼|残疾|瘫痪'
INJURY_PASSING = r'^(?:被[^，。；]{0,12})?(?:击倒|打倒|击飞|昏迷|昏倒|晕倒|晕厥|失去意识|昏过去|倒地|倒下|失神|被吹飞)[^，。；]{0,8}$'
CLASS_RANK = {'FREE': 0, 'SOFT': 1, 'HARD': 2}


def _day(origin, s):
    return (dt.date.fromisoformat(s) - origin).days


def _clock(s):
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', s or '')
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


def place_arc(origin, arc, beats):
    """{beat id: (start, end, dated)} for an arc's beats, in the pack's minutes."""
    s0, e0 = _day(origin, arc['start']), _day(origin, arc['end'])
    lo, hi = s0 * DAY + 8 * 60, e0 * DAY + 22 * 60
    fixed, past = {}, {}
    for i, b in enumerate(beats):
        t = b['time']
        if t.get('date'):
            try:
                d = _day(origin, t['date'])
                if not s0 - 3 <= d <= e0 + 3:
                    # a wrong year (the arc's month and day in another year) is the arc's year
                    for y in range(int(arc['start'][:4]), int(arc['end'][:4]) + 1):
                        dd = _day(origin, f'{y}{t["date"][4:]}')
                        if s0 - 3 <= dd <= e0 + 3:
                            d = dd
            except ValueError:
                continue
            if not s0 - 3 <= d <= e0 + 3 and d < s0:
                # a happening of the past the sources tell here: at its own date (out of the arc's sequence)
                c = _clock(t.get('clock'))
                past[beats[i]['id']] = (d * DAY + (c if c is not None else 9 * 60), d * DAY + (c if c is not None else 9 * 60) + max(5, t['duration_minutes']), True)
                continue
            if s0 - 3 <= d <= e0 + 3:
                c = _clock(t.get('clock'))
                if c is None:
                    c = timeline.time_of(t.get('stated'))
                if c is None and t.get('time_of_day') in timeline.HOUR:
                    c = timeline.HOUR[t['time_of_day']] * 60
                prev = fixed[max(fixed)] if fixed else None
                if c is None:
                    # no time of day: after the previous dated beat of that day, else the morning
                    c = prev % DAY + 30 if prev is not None and prev // DAY == d else 9 * 60
                elif prev is not None and prev // DAY == d and d * DAY + c <= prev and t['after_previous'] != 'parallel' and _clock(t.get('clock')) is None:
                    # only a part of the day ("morning") that would put it before the beat it follows: right after it
                    c = prev % DAY + 30
                if prev is not None and d * DAY + c == prev and t['after_previous'] != 'parallel':
                    c += 10
                fixed[i] = d * DAY + c
    if past:
        rest = [b for b in beats if b['id'] not in past]
        keep = {b['id']: j for j, b in enumerate(rest)}
        out = place_arc(origin, arc, rest) if rest else {}
        return {**out, **past}
    # segments between dated beats (the arc's start and end bound the first and the last)
    out = {}
    idx = sorted(fixed)
    bounds = [(-1, lo)] + [(i, fixed[i]) for i in idx] + [(len(beats), max(hi, max(fixed.values(), default=hi)))]
    for (a, ta), (z, tz) in zip(bounds, bounds[1:]):
        if a >= 0:
            out[a] = (ta, ta + max(5, beats[a]['time']['duration_minutes']), True)
        seg = list(range(a + 1, z))
        if not seg:
            continue
        cur = out[a][1] if a >= 0 else ta
        prev_start = out[a][0] if a >= 0 else ta
        rel = []
        for i in seg:
            t = beats[i]['time']
            if t['after_previous'] == 'parallel':
                st = prev_start
            elif a < 0 and i == seg[0]:
                st = ta
            else:
                st = timeline.place_beat(cur, t)
            en = st + max(5, t['duration_minutes'])
            rel.append((st, en))
            prev_start, cur = st, en
        # compress into [ta, tz) when the cues run past the next dated beat (or the arc's end)
        last = max(e for _, e in rel)
        room = tz - ta
        if tz > ta and (z < len(beats) and last >= tz or z == len(beats) and last > tz):
            span = last - ta
            f = max(0.01, (room - 1) / span) if span > 0 else 1.0
            rel = [(ta + int((s - ta) * f), ta + max(int((e - ta) * f), int((s - ta) * f) + 1)) for s, e in rel]
        for i, (s, e) in zip(seg, rel):
            out[i] = (s, e, False)
    return {beats[i]['id']: out[i] for i in range(len(beats))}


def label(origin, t):
    d = dt.datetime.combine(origin, dt.time()) + dt.timedelta(minutes=t)
    return f'{d.year}年{d.month}月{d.day}日 {d.hour:02d}:{d.minute:02d}'


def build(project, out_path=None):
    c = corpus(project)
    rep = Report()
    base = read_json(os.path.join(ROOT, project['base_pack']))
    origin = dt.date.fromisoformat(project['timeline']['origin_date'])
    keep_before = _day(origin, project.get('base_keep_before', '1900-01-01')) * DAY
    cfg_pack = project.get('pack', {})

    # ---- entities
    ents = copy.deepcopy(base['entities'])
    by_id = {e['id']: e for e in ents}
    used_ids = set(by_id)
    described = read_json(project.p('entities.json'), {}) or {}
    key_id = {}
    for k, d in described.items():
        if d.get('same_as', '').startswith('base:') and d['same_as'][5:] in by_id:
            key_id[k] = d['same_as'][5:]
    rest = {k: d for k, d in described.items() if k not in key_id}
    generic = GENERIC_ALIASES | {g.lower() for g in project.get('generic_aliases', [])}
    new_ents = []
    base_named = collections.defaultdict(set)
    for e in ents:
        for n in [e['name']] + e.get('aliases', []):
            base_named[names.clean(n)].add(e['id'])
    groups, by_name = [], {}
    for r, ks in group_candidates(rest, rep, {}):
        d = rest[r]
        hit = base_named.get(names.clean(d['name']), set())
        if len(hit) == 1:
            for k in ks:
                key_id[k] = next(iter(hit))
            rep.add('merged', f'{d["name"]}（{r}）＝原有实体 {next(iter(hit))}（同名）')
            continue
        key = (names.clean(d['name']), d['kind'])
        if key in by_name:
            by_name[key][1].extend(ks)
            rep.add('merged', f'{d["name"]}（{r}）与同名同类的候选合并')
            continue
        by_name[key] = (r, list(ks))
        groups.append(by_name[key])
    # two new entities of one kind where one's name is the other's alias (恋查 / Rensa) are one: the heavier keeps it
    weight = lambda g: sum(rest[k].get('weight', 0) for k in g[1])  # noqa: E731
    groups.sort(key=lambda g: -weight(g))
    owner = {}
    merged_groups = []
    for g in groups:
        d = rest[g[0]]
        nms = {names.clean(d['name'])} | {names.clean(a) for k in g[1] for a in rest[k].get('aliases', [])}
        hit = next((owner[(n, d['kind'])] for n in nms if (n, d['kind']) in owner), None)
        if hit is not None:
            hit[1].extend(g[1])
            rep.add('merged', f'{d["name"]}（{g[0]}）与 {rest[hit[0]]["name"]}（{hit[0]}）共用名字，合并')
            continue
        merged_groups.append(g)
        for n in nms:
            owner.setdefault((n, d['kind']), g)
    groups = merged_groups
    other_kind = collections.defaultdict(dict)       # name -> kind -> key of a group
    for r, ks in groups:
        other_kind[names.clean(rest[r]['name'])][rest[r]['kind']] = r
    for e in ents:
        other_kind[names.clean(e['name'])].setdefault(e['kind'], 'base:' + e['id'])
    placed = {}
    for r, ks in list(groups):
        d = rest[r]
        nm = names.clean(d['name'])
        if nm.lower() in generic:
            groups.remove((r, ks))
            rep.add('merged', f'{d["name"]}（{r}）是通用词，不作实体')
            continue
        if d['kind'] == 'place':
            others = {k: v for k, v in other_kind[nm].items() if k != 'place'}
            if len(others) == 1:
                placed[r] = next(iter(others.values()))
                groups.remove((r, ks))
                rep.add('merged', f'地点“{d["name"]}”（{r}）就是同名的{next(iter(others))}，合并')
    for r, ks in groups:
        d = rest[r]
        want = slug(d.get('id')) or 'e'
        if not ID_OK.match(want):
            want = 'e-' + want
        eid, n = want, 2
        while eid in used_ids:
            eid = f'{want}-{n}'
            n += 1
        used_ids.add(eid)
        al = uniq([a for k in ks for a in rest[k].get('aliases', []) + list((rest[k].get('names') or {}).keys())])
        e = {'id': eid, 'name': d['name'], 'aliases': [a for a in al if a and a != d['name'] and a.lower() not in generic and len(a) >= 2],
             'kind': d['kind'], 'static_description': stable(d.get('description')) or '（无描述）', 'source_refs': ['wiki-arcs']}
        new_ents.append(e)
        for k in ks:
            key_id[k] = eid
    group_of = {r: ks for r, ks in group_candidates(rest, rep, {})}
    for r, target in placed.items():
        tid = target[5:] if target.startswith('base:') else key_id.get(target)
        for k in group_of.get(r, [r]):
            if tid:
                key_id[k] = tid
    # one name for two entities: the base keeps it
    base_names = {names.clean(n) for e in ents for n in [e['name']] + e.get('aliases', [])}
    for e in new_ents:
        if e['name'] in base_names:
            rep.add('name_collision', f'新实体 {e["id"]} 的名字“{e["name"]}”已被原有实体使用')
        e['aliases'] = [a for a in e['aliases'] if names.clean(a) not in base_names]
    ents += new_ents
    shared = collections.Counter(names.clean(a) for e in ents for a in set(e.get('aliases', [])))
    named = {names.clean(e['name']) for e in ents}
    for e in new_ents:
        e['aliases'] = [a for a in e['aliases'] if shared[names.clean(a)] == 1 and names.clean(a) not in named]
    by_id = {e['id']: e for e in ents}
    # names: the base pack's first (from_corpus knows them as base:<id>), then the new entities
    base_res = names.from_corpus(c, project)
    new_res = names.Resolver()
    alias_users = collections.Counter(names.clean(a) for e in new_ents for a in e['aliases'])
    for e in new_ents:
        new_res.add(e['name'], e['id'], strong=True)
        for a in e['aliases']:
            if alias_users[names.clean(a)] == 1:
                new_res.add(a, e['id'])

    def R(name):
        n = names.clean(name)
        if not n:
            return None
        k = base_res.get(n)
        if k:
            if k.startswith('base:'):
                return k[5:] if k[5:] in by_id else None
            return key_id.get(k)
        for k in ('n:' + n, 'p:' + n):
            if k in key_id:
                return key_id[k]
        return new_res.get(n)

    # ---- beats, edits, times
    sums = all_summaries(project, c)
    beats_by_ch = collections.defaultdict(list)
    for s in sums:
        beats_by_ch[s['chapter']].extend(s['beats'])
    arcs_cfg = {a['id']: a for a in project['arcs']}
    edits = {ch['id']: read_json(project.p('chapters', f'{ch["id"]}.json')) or {} for ch in c['chapters']}
    pos = {}
    for ch in c['chapters']:
        pos.update(place_arc(origin, arcs_cfg[ch['id']], beats_by_ch[ch['id']]))

    # base events mapped to beats (a base event offered to several arcs goes to the beat most like it)
    base_ev = {e['id']: e for e in base['events']}
    claims = collections.defaultdict(list)
    for cid, ed in edits.items():
        for old, bid in (ed.get('old_map') or {}).items():
            if bid and old in base_ev:
                claims[old].append(bid)
    beat_by_id = {b['id']: b for bs in beats_by_ch.values() for b in bs}

    def likeness(old, bid):
        o = base_ev[old]
        b = beat_by_id[bid]
        ot = set(o['title'] + ((o.get('summary') or {}).get('course', '') if isinstance(o.get('summary'), dict) else ''))
        bt = set(b['title'] + b['course'])
        return len(ot & bt) / max(1, len(ot | bt))
    old_of = collections.defaultdict(list)       # beat id -> base event ids
    for old, bids in claims.items():
        best = max(bids, key=lambda b: likeness(old, b))
        if len(set(bids)) > 1:
            rep.add('old_multi', f'{old} 被多个片段认领：{", ".join(sorted(set(bids)))}；取 {best}')
        old_of[best].append(old)
    # a beat that takes several base events takes the id of the strongest one; the others are folded into it
    rename = {}
    for bid, olds in old_of.items():
        olds.sort(key=lambda o: (-CLASS_RANK[base_ev[o]['classification']], o))
        for o in olds:
            rename[o] = olds[0]
        if len(olds) > 1:
            rep.add('old_folded', f'{bid} 合并了原有事件 {", ".join(olds)}（使用 {olds[0]}）')

    st = FactState(by_id, rep)
    injured = {f['fact']['entity_id'] for e in base['events'] for f in e.get('canonical_effects', []) if f.get('fact', {}).get('predicate') == 'injury'}
    allowed_values = {p['id']: p['allowed_values'] for p in base['predicates'] if p.get('allowed_values')}

    def allowed(ent, pred, val):
        """A fact in the predicate's allowed values: a physical condition is 完好/受损/毁坏 (whatever else a beat
        says of a place, a sealed building say, is its status)."""
        ok = allowed_values.get(pred)
        if not ok or val in ok or not isinstance(val, str):
            return {'entity_id': ent, 'predicate': pred, 'value': val}
        if pred == 'condition':
            for words, v in ((('毁', '塌', '炸', '摧', '烧尽', '沉没', '坠毁', '消失', '覆灭'), '毁坏'), (('修复', '重建', '复原', '恢复原状'), '完好'),
                             (('损', '破', '裂', '坏', '烧', '洞'), '受损')):
                if any(w in val for w in words) and v in ok:
                    return {'entity_id': ent, 'predicate': pred, 'value': v}
        return {'entity_id': ent, 'predicate': 'status', 'value': val}
    events, edges, arcs = [], [], []
    used_titles = collections.Counter()
    dropped = collections.Counter()
    for ch in c['chapters']:
        cid = ch['id']
        ed = edits.get(cid) or {}
        evinfo = ed.get('events') or {}
        arc_id = f'arc.{cid}'
        arc_events = []
        for b in beats_by_ch[cid]:
            bid = b['id']
            info = evinfo.get(bid) or {'class': 'SOFT', 'why': '', 'hook': ''}
            cls = 'SOFT' if info['class'] == 'HARD' else info['class']
            olds = old_of.get(bid, [])
            main_old = base_ev[olds[0]] if olds else None
            eid = olds[0] if olds else bid
            ppl = [p for p in b['people'] if p['presence'] != 'mentioned']
            eids = []
            for p in ppl:
                i = R(p['name'])
                if i:
                    eids.append(i)
                else:
                    dropped[p['name']] += 1
            motives = []
            for m in b['motives']:
                mid = R(m['who'])
                motives.append({'who': m['who'], 'entity_ids': [mid] if mid else [], 'motive': m['motive']})
                if mid:
                    eids.append(mid)
            locs = [i for i in (R(pl) for pl in b['places']) if i and by_id[i]['kind'] == 'place']
            facts = collections.OrderedDict()

            def put(ent, pred, val, op='set'):
                if ent is None or val is None or (isinstance(val, str) and not val):
                    return
                if op != 'set':
                    # who joins / leaves: one change per organization, kind and event
                    key = (ent, pred, op)
                    facts[key] = sorted(set(facts.get(key, [])) | set(val)) if isinstance(val, list) else val
                    return
                if pred == 'knows' and (ent, pred) in facts:
                    val = f'{facts[(ent, pred)]}；{val}'
                facts[(ent, pred)] = val
            for x in b['changes'] + [y for y in _ends(ed, bid)]:
                if x['kind'] == 'vanish':
                    x = dict(x, kind='status', value=x['value'] or '下落不明')
                if x['kind'] == 'injury' and re.search(INJURY_PASSING, x['value'] or ''):
                    continue        # knocked out, fainted: over within the scene, not a lasting injury
                subs = uniq([i for i in (R(n) for n in names.expand(x['subject'])) if i])
                if not subs:
                    dropped[f'{x["subject"]}（{x["kind"]}）'] += 1
                    continue
                for sid in subs:
                    eids.append(sid)
                    oid = R(x['object']) if x.get('object') else None
                    if oid:
                        eids.append(oid)
                    kind = x['kind']
                    if kind == 'injury':
                        injured.add(sid)
                    elif kind == 'recovery':
                        # only an injury that was recorded can end; anything else that "recovers" (memories) is a status
                        if sid in injured:
                            injured.discard(sid)
                        else:
                            kind = 'status'
                    st.apply(sid, kind, x['value'], x.get('object') or '', oid, put)
            # base events folded in: their effects win for what they set (hand-checked), their entities join
            old_effects = []
            for o in olds:
                oe = base_ev[o]
                eids += oe.get('entity_ids', [])
                for ef in oe.get('canonical_effects', []):
                    ent, pred, val = _effect(ef)
                    for k in [(ent, pred), (ent, pred, 'add'), (ent, pred, 'remove')]:
                        facts.pop(k, None)
                    old_effects.append(copy.deepcopy(ef))
                    if pred == 'alive' and val is False:
                        st.alive_changed.add(ent)
            eids = [i for i in uniq(eids) if i in by_id]
            new_facts = [allowed(k[0], k[1], v) if len(k) == 2 else org_changes.change(k[2], k[0], k[1], v) for k, v in facts.items() if k[0] in by_id]
            # one write per entity, predicate and kind of change: a base effect wins, two new ones are joined
            effects, at = [], {}
            for ef in old_effects + [f if 'op' in f else {'op': 'set', 'fact': f} for f in new_facts]:
                k = org_changes.effect_key(ef)
                if k not in at:
                    at[k] = len(effects)
                    effects.append(ef)
                elif at[k] >= len(old_effects) and 'fact' in ef and isinstance(ef['fact']['value'], str) and isinstance(effects[at[k]]['fact']['value'], str):
                    effects[at[k]]['fact']['value'] += '；' + ef['fact']['value']
            for ef in effects:
                if _effect(ef)[0] not in eids:
                    eids.append(_effect(ef)[0])
            if main_old and CLASS_RANK[main_old['classification']] > CLASS_RANK[cls]:
                cls = main_old['classification']
            if cls == 'HARD':
                hard = next(base_ev[o] for o in olds if base_ev[o]['classification'] == 'HARD')
                outcomes = copy.deepcopy(hard['outcomes'])
                required = hard['required_description']
            else:
                outcomes = [copy.deepcopy(ef['fact']) if 'fact' in ef else copy.deepcopy(ef) for ef in effects if ef.get('op') != 'unset']
                required = None
            s, e, dated = pos[bid]
            if main_old and not dated and cls == 'HARD':
                when = copy.deepcopy(main_old['when'])       # a hand-checked date beats an estimate
            else:
                lab = label(origin, s) + ('' if dated else '（按前后情节推定）')
                if b['time']['stated']:
                    lab += f'；文中：{b["time"]["stated"]}'
                when = {'earliest': {'day': s // DAY, 'minute': s % DAY}, 'latest': {'day': e // DAY, 'minute': e % DAY},
                        'precision': 'minute' if s == e else 'range', 'label': lab, 'basis': 'documented' if dated else 'editorial',
                        'notes': '日期与时刻出自资料。' if dated else '按资料给出的先后顺序与时间提示推定（先后可靠，时刻为估计）。'}
            summ = {}
            for f in ('background', 'trigger'):
                if b[f]:
                    summ[f] = b[f]
            if motives:
                summ['motives'] = motives
            summ['course'] = b['course'] or b['title']
            summ['result'] = b['result'] or '（资料未交代）'
            if b['aftermath']:
                summ['aftermath'] = b['aftermath']
            imp = (ed.get('impact') or {}).get(bid)
            if imp:
                summ['impact'] = imp
            note = ([b['note']] if b['note'] else []) + [f'【{k}】{v}' for k, v in b['extra'].items()]
            if note:
                summ['note'] = ' '.join(note)
            cast = []
            if len([p for p in ppl if p['presence'] == 'onsite']) >= 2:
                for p in ppl:
                    i = R(p['name'])
                    if p['presence'] == 'onsite' and i in eids and i not in [x['entity_id'] for x in cast] and by_id[i]['kind'] == 'person':
                        cast.append({'entity_id': i, 'at': dict(when['earliest']), 'role': p['role'] or '在场'})
            vis = {'mode': 'public', 'knower_ids': []}
            if b['secret']['is_secret']:
                kn = [x for x in uniq([R(k) for k in b['secret']['knowers']]) if x]
                vis = {'mode': 'secret', 'knower_ids': kn}
                eids = uniq(eids + kn)
            elif main_old and main_old.get('visibility', {}).get('mode') != 'public':
                vis = copy.deepcopy(main_old['visibility'])
            # a title several events share says where it belongs: the arc, then a number
            title = b['title'] if not used_titles[b['title']] else f'{b["title"]}（{ch["title"].split(" ")[0]}）'
            base_title, n_ = title, 2
            while used_titles[title]:
                title = f'{base_title}（{n_}）'
                n_ += 1
            used_titles[b['title']] += 1
            used_titles[title] += 1
            event = {
                'id': eid, 'title': title, 'summary': summ, 'classification': cls, 'required_description': required, 'when': when,
                'entity_ids': eids, 'location_ids': uniq(locs), 'arc_id': arc_id,
                'canonical_preconditions': copy.deepcopy(main_old['canonical_preconditions']) if main_old else {'all': []},
                'outcomes': outcomes, 'canonical_effects': effects, 'visibility': vis,
                'participation': {'offer': 'when_relevant', 'hook': info.get('hook') or (main_old or {}).get('participation', {}).get('hook') or DEFAULT_HOOK},
                'source_refs': ['wiki-arcs'] + (main_old.get('source_refs', []) if main_old else []),
                'author_note': ' '.join(x for x in [f'细化自原有事件 {", ".join(olds)}。' if olds else '', (main_old or {}).get('author_note', ''),
                                                    f'分类理由：{info["why"]}' if info.get('why') else ''] if x),
            }
            if cast:
                event['cast'] = cast
            elif main_old and main_old.get('cast'):
                event['cast'] = [dict(x, at=dict(when['earliest'])) for x in main_old['cast']]
            events.append(event)
            arc_events.append(eid)
        for l in ed.get('links') or []:
            edges.append({'from': l['from'], 'to': l['to'], 'relation': l['relation'], 'basis': 'inferred', 'source_refs': ['wiki-arcs'], 'note': l['note']})
        arcs.append({'id': arc_id, 'title': ch['title'], 'summary': ed.get('summary') or ch['title'], 'event_ids': arc_events})

    # beat ids that took a base event's id
    beat_to_id = {b: (old_of[b][0] if old_of.get(b) else b) for b in beat_by_id}
    for e in edges:
        e['from'], e['to'] = beat_to_id.get(e['from'], e['from']), beat_to_id.get(e['to'], e['to'])

    # base events kept as they were: the old history, and the later ones no beat took
    taken = set(rename)
    kept = []
    for e in base['events']:
        if e['id'] in taken:
            continue
        if e['when']['earliest']['day'] * DAY + e['when']['earliest']['minute'] >= keep_before:
            rep.add('old_unmapped', f'{e["id"]} {e["title"]}（{e["classification"]}；{e["when"].get("label", "")}）没有对应的片段，原样保留')
        kept.append(copy.deepcopy(e))
    kept_ids = {e['id'] for e in kept}
    base_arcs = []
    for a in base.get('arcs', []):
        ids = [x for x in a['event_ids'] if x in kept_ids]
        if ids:
            base_arcs.append(dict(a, event_ids=ids))
    for e in kept:
        if e.get('arc_id') and not any(e['arc_id'] == a['id'] for a in base_arcs):
            e['arc_id'] = None
    events = kept + events
    ev_by_id = {e['id']: e for e in events}
    # a base event folded into another one's beat is that beat now; a quoted title follows the beat's new title
    new_title = {}
    for o, main in rename.items():
        if main in ev_by_id and base_ev[o]['title'] != ev_by_id[main]['title']:
            new_title[base_ev[o]['title']] = ev_by_id[main]['title']
            for part in re.split(r'[：:]', base_ev[o]['title'])[1:]:
                new_title.setdefault(part.strip(), ev_by_id[main]['title'])
    for e in events:
        e['canonical_preconditions'] = _remap_pre(e['canonical_preconditions'], rename, ev_by_id)
        for k, v in list(e['summary'].items()):
            if isinstance(v, str):
                e['summary'][k] = re.sub(r'“([^”]+)”', lambda m: f'“{new_title.get(m.group(1), m.group(1))}”', v)
    titles = {e['title'] for e in events}
    for e in events:
        for k, v in list(e['summary'].items()):
            if isinstance(v, str):
                e['summary'][k] = re.sub(r'“([^”]+)”', lambda m: m.group(0) if m.group(1) in titles else f'「{m.group(1)}」', v)
    # "only while X has not happened", for an X that comes later anyway, says nothing: dropped
    for e in events:
        e['canonical_preconditions'] = _drop_moot(e['canonical_preconditions'], e, ev_by_id)

    # edges: the base pack's (with folded ids), then the arcs' own; time order and duplicates checked
    for e in base.get('edges', []):
        edges.append({k: v for k, v in e.items() if k != 'id'} | {'from': rename.get(e['from'], e['from']), 'to': rename.get(e['to'], e['to'])})
    start = lambda i: ev_by_id[i]['when']['earliest']['day'] * DAY + ev_by_id[i]['when']['earliest']['minute']  # noqa: E731
    end = lambda i: ev_by_id[i]['when']['latest']['day'] * DAY + ev_by_id[i]['when']['latest']['minute']  # noqa: E731
    out_edges, seen = [], set()
    for e in edges:
        a, z = e['from'], e['to']
        if a == z or a not in ev_by_id or z not in ev_by_id or (a, z, e['relation']) in seen:
            continue
        if e['relation'] in ('enables', 'precedes', 'motivates') and start(a) >= start(z):
            rep.add('link_dropped', f'{a} → {z}（{e["relation"]}）方向与时间顺序相反，已舍弃')
            continue
        seen.add((a, z, e['relation']))
        out_edges.append(dict(e, id=f'edge-{len(out_edges) + 1:04d}'))
    # a dependent event starts only after its prerequisite's window: the window is cut short (lint: no overlap)
    deps = [(e['from'], e['to']) for e in out_edges if e['relation'] in ('enables', 'precedes')]
    for ev in events:
        for req in _occurred(ev['canonical_preconditions']):
            if req in ev_by_id:
                deps.append((req, ev['id']))
    for a_id, z_id in deps:
        if start(a_id) >= start(z_id):
            # a base precondition (hand-checked) holds: the dependent event moves to just after its prerequisite
            z = ev_by_id[z_id]
            dur = end(z_id) - start(z_id)
            t = end(a_id) + 1
            z['when']['earliest'] = {'day': t // DAY, 'minute': t % DAY}
            z['when']['latest'] = {'day': (t + dur) // DAY, 'minute': (t + dur) % DAY}
            for x in z.get('cast', []):
                x['at'] = dict(z['when']['earliest'])
            rep.add('order', f'{z_id} 以 {a_id} 为前提，移到它之后（{label(origin, t)}）')
            continue
        e = {'from': a_id, 'to': z_id}
        if True:
            a, z = ev_by_id[e['from']], ev_by_id[e['to']]
            if end(e['from']) >= start(e['to']):
                t = max(start(e['from']), start(e['to']) - 1)
                a['when']['latest'] = {'day': t // DAY, 'minute': t % DAY}
                a['when']['precision'] = 'minute' if a['when']['latest'] == a['when']['earliest'] else 'range'

    # a new leader takes over from the one in office; a death takes the person out of every organization
    org_changes.complete(events, base['initial_state']['facts'])

    # an injury still open when the person takes part in a later arc ended in between (editorial)
    settled = set(st.recovery_values)
    for p in base['predicates']:
        if p['id'] == 'injury':
            settled |= set(p.get('settled_values') or [])
    healed = '已恢复（编辑推定：之后的篇章中正常行动）'
    open_inj, open_at = {}, {}
    # two events at one minute that change the same thing happen one after the other: the later one moves a minute on
    at = lambda x: x['when']['earliest']['day'] * DAY + x['when']['earliest']['minute']  # noqa: E731
    events.sort(key=at)
    seen_at = {}
    for e in events:
        keys = {_effect(o)[:2] for o in e['canonical_effects']}
        t = at(e)
        while any(seen_at.get(k) == t for k in keys):
            t += 1
        if t != at(e):
            dur = e['when']['latest']['day'] * DAY + e['when']['latest']['minute'] - at(e)
            e['when']['earliest'] = {'day': t // DAY, 'minute': t % DAY}
            e['when']['latest'] = {'day': (t + max(0, dur)) // DAY, 'minute': (t + max(0, dur)) % DAY}
            for x in e.get('cast', []):
                x['at'] = dict(e['when']['earliest'])
        for k in keys:
            seen_at[k] = t
    chrono = sorted(events, key=at)
    last_in_arc = {}
    for e in chrono:
        for ent in e['entity_ids']:
            last_in_arc[(ent, e.get('arc_id'))] = e['id']
    for e in events:
        for o in e['canonical_effects']:
            f = o.get('fact')
            if f and f['predicate'] == 'injury' and isinstance(f['value'], str) and re.search(INJURY_LASTING, f['value']):
                settled.add(f['value'])
    for e in chrono:
        a_ = e.get('arc_id')
        for o in e['canonical_effects']:
            f = o.get('fact')
            if f and f['predicate'] == 'injury':
                if f['value'] in settled:
                    open_inj.pop(f['entity_id'], None)
                else:
                    open_inj[f['entity_id']] = (a_, e['id'], f['value'])
                    open_at[f['entity_id']] = e['when']['earliest']['day'] * DAY + e['when']['earliest']['minute']
        for ent in list(open_inj):
            ia, iev, val = open_inj[ent]
            later = e['when']['earliest']['day'] * DAY + e['when']['earliest']['minute'] >= open_at.get(ent, 0) + DAY
            last = last_in_arc.get((ent, a_)) == e['id'] and e['id'] != iev
            if (ia != a_ or later or last) and at(e) > open_at.get(ent, -1) and ent in e['entity_ids'] and not any(_effect(o)[:2] == (ent, 'injury') for o in e['canonical_effects']):
                fact = {'entity_id': ent, 'predicate': 'injury', 'value': healed}
                e['canonical_effects'].append({'op': 'set', 'fact': fact})
                if e['classification'] != 'HARD':
                    e['outcomes'].append(dict(fact))
                settled.add(healed)
                rep.add('healed', f'{ent}：{iev} 的伤势“{val}”在 {e["id"]}（{e["title"]}）之前未见结束，按已恢复处理')
                del open_inj[ent]

    # predicates: the base pack's, plus any this build uses that it lacks; settled values joined
    preds = copy.deepcopy(base['predicates'])
    have = {p['id'] for p in preds}
    for p in PREDICATES:
        if p['id'] not in have:
            preds.append(dict(p))
    for p in preds:
        if p['id'] == 'injury':
            p['settled_values'] = sorted(settled)
            p['transient'] = True
        if p['id'] == 'whereabouts':
            p['settled_values'] = sorted(set(p.get('settled_values') or []) | st.settled_where)
            p['transient'] = True
    init = copy.deepcopy(base['initial_state'])
    alive0 = {f['fact']['entity_id'] for f in init['facts'] if f['fact']['predicate'] == 'alive'}
    for i in sorted(st.alive_changed):
        if i not in alive0 and by_id.get(i, {}).get('kind') == 'person':
            init['facts'].append({'fact': {'entity_id': i, 'predicate': 'alive', 'value': True}, 'source_refs': ['wiki-arcs'], 'note': '基线'})
    last = max(e['when']['latest']['day'] for e in events)
    cov = copy.deepcopy(base['coverage'])
    cov['end'] = {'day': max(cov['end']['day'], last + 1), 'minute': 1439}
    sources = copy.deepcopy(base['sources']) + [{
        'id': 'wiki-arcs', 'title': '魔禁维基（灰机wiki）篇章页、时间线与考据页；英文 Toaru Wiki（fandom）篇章页与人物经历', 'kind': 'secondary',
        'locator': 'https://toaru.huijiwiki.com/ ；https://toarumajutsunoindex.fandom.com/ （本地快照）',
        'notes': '2.0 起逐篇细化的依据。摘要由模型根据两部维基撰写，经代码整理；日期以考据页为准。'}]
    pack = {k: v for k, v in base.items() if k.startswith('$')}
    pack.update({
        'schema_version': base['schema_version'], 'pack_id': cfg_pack.get('pack_id', base['pack_id']), 'pack_version': cfg_pack.get('pack_version', base['pack_version']),
        'title': cfg_pack.get('title', base['title']), 'language': base['language'], 'description': cfg_pack.get('description', base['description']),
        'calendar': base['calendar'], 'coverage': cov, 'sources': sources, 'predicates': preds, 'entities': ents, 'initial_state': init,
        'arcs': base_arcs + arcs, 'events': sorted(events, key=lambda x: (x['when']['earliest']['day'], x['when']['earliest']['minute'])), 'edges': out_edges,
    })
    for k, n in dropped.most_common():
        rep.add('unresolved', f'{k} ×{n}')
    out_path = out_path or project.p('out', f'{pack["pack_id"]}.canon.json')
    write_json(out_path, pack, indent=1)
    chrep = [{'chapter': ch['id'], 'start': min((pos[b['id']][0] for b in beats_by_ch[ch['id']]), default=0),
              'end': max((pos[b['id']][1] for b in beats_by_ch[ch['id']]), default=0), 'anchor': None, 'compressed': None, 'note': ''} for ch in c['chapters']]
    clock = timeline.Clock(project['timeline']['origin_date'])
    for r in chrep:
        r['start_label'], r['end_label'] = clock.label(r['start']), clock.label(r['end'])
    return pack, rep, chrep, clock, out_path


def _drop_moot(pre, ev, ev_by_id):
    at = lambda x: (x['when']['earliest']['day'], x['when']['earliest']['minute'])  # noqa: E731
    if isinstance(pre, dict):
        n = pre.get('not')
        if isinstance(n, dict) and set(n) == {'occurred'} and n['occurred'] in ev_by_id and at(ev_by_id[n['occurred']]) > at(ev):
            return {'all': []}
        if isinstance(pre.get('all'), list):
            out = [_drop_moot(x, ev, ev_by_id) for x in pre['all']]
            return dict(pre, all=[x for x in out if x != {'all': []}])
    return pre


def _occurred(pre):
    """The events a precondition requires to have happened (not those under "not")."""
    if isinstance(pre, list):
        return [x for p in pre for x in _occurred(p)]
    if not isinstance(pre, dict):
        return []
    out = []
    for k, v in pre.items():
        if k == 'occurred' and isinstance(v, str):
            out.append(v)
        elif k != 'not':
            out += _occurred(v)
    return out


TEMPORAL = re.compile(r'已死|死亡|已经|现在是|目前|成为了|被杀')


def stable(desc):
    """A description without what can change: a clause that says someone died or what is so "now" goes (that is an
    event's business); 死亡保险 is a kind of insurance."""
    d = (desc or '').replace('死亡保险', '寿险')
    if not TEMPORAL.search(d):
        return d
    parts = [x for x in re.split(r'(?<=[，。；])', d) if x and not TEMPORAL.search(x)]
    return ''.join(parts).rstrip('，；') + ('。' if parts and not ''.join(parts).endswith('。') else '')


def _remap_pre(pre, rename, ev_by_id):
    """Preconditions with folded event ids replaced; a condition on an event that is gone is dropped."""
    if isinstance(pre, list):
        out = [_remap_pre(x, rename, ev_by_id) for x in pre]
        return [x for x in out if x is not None]
    if not isinstance(pre, dict):
        return pre
    out = {}
    for k, v in pre.items():
        if k in ('occurred', 'not_occurred') and isinstance(v, str):
            v = rename.get(v, v)
            if v not in ev_by_id:
                return None
            out[k] = v
        else:
            r = _remap_pre(v, rename, ev_by_id)
            if r is None:
                return None if k != 'not' else None
            out[k] = r
    return out


def _effect(ef):
    """(entity, predicate, value) of an effect ("set" carries a fact; "unset" names the entity and predicate)."""
    f = ef.get('fact') or ef
    return f.get('entity_id'), f.get('predicate'), f.get('value')


def _ends(ed, bid):
    out = []
    kind_of = {'injury': 'recovery', 'whereabouts': 'moves', 'status': 'status'}
    for x in ed.get('ends') or []:
        if x.get('beat') == bid and x.get('predicate') in kind_of:
            out.append({'subject': x['subject'], 'kind': kind_of[x['predicate']], 'value': x.get('value') or '', 'object': ''})
    for x in ed.get('missed') or []:
        if x.get('beat') == bid:
            out.append({'subject': x['subject'], 'kind': x['kind'], 'value': x.get('value') or '', 'object': ''})
    return out
