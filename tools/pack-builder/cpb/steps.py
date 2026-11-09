"""The model steps: summarize each unit, edit each chapter, describe each entity. All cached and resumable."""
import collections
import json
import re

from . import prompts as P
from .skeleton import corpus, unit_text
from .util import log, read_json, warn, write_json

TIME_AFTER = {'continuous', 'same_day', 'next_day', 'days', 'unknown'}
TIME_OF_DAY = {'dawn', 'morning', 'noon', 'afternoon', 'evening', 'night', 'unknown'}
PRESENCE = {'onsite', 'remote', 'mentioned'}
IMPORTANCE = {'major', 'normal', 'minor'}
CLASSES = {'HARD', 'SOFT', 'FREE'}
RELATIONS = {'enables', 'motivates', 'precedes', 'related'}


def lang_name(project):
    lang = project.get('pack', {}).get('language', 'zh-CN')
    return {'zh': 'Simplified Chinese (简体中文)', 'ja': 'Japanese', 'en': 'English'}.get(lang[:2], lang)


def _s(x, n=None):
    s = '' if x is None else (x if isinstance(x, str) else json.dumps(x, ensure_ascii=False))
    s = s.strip()
    return s[:n] if n else s


def _list(x):
    return x if isinstance(x, list) else ([] if x in (None, '') else [x])


# ---------------------------------------------------------------------------------------------------------------
# 1. unit summaries

def split_text(text, max_chars):
    """Parts of at most max_chars, cut at scene breaks (then at lines)."""
    if len(text) <= max_chars:
        return [text]
    scenes = text.split('\n——场景切换——\n')
    parts, cur = [], ''
    for sc in scenes:
        while len(sc) > max_chars:
            cut = sc.rfind('\n', 0, max_chars)
            cut = cut if cut > max_chars // 2 else max_chars
            if cur:
                parts.append(cur)
                cur = ''
            parts.append(sc[:cut])
            sc = sc[cut:].lstrip('\n')
        if cur and len(cur) + len(sc) + 10 > max_chars:
            parts.append(cur)
            cur = ''
        cur = (cur + '\n——场景切换——\n' + sc) if cur else sc
    if cur:
        parts.append(cur)
    return parts


def normalize_summary(obj):
    beats = []
    for b in _list(obj.get('beats')):
        if not isinstance(b, dict):
            continue
        t = b.get('time') if isinstance(b.get('time'), dict) else {}
        after = t.get('after_previous') if t.get('after_previous') in TIME_AFTER else ('parallel' if t.get('after_previous') == 'parallel' else 'unknown')
        try:
            days = max(0, int(float(t.get('days') or 0)))
        except (TypeError, ValueError):
            days = 0
        try:
            dur = max(1, min(60 * 24 * 30, int(float(t.get('duration_minutes') or 60))))
        except (TypeError, ValueError):
            dur = 60
        changes = []
        for c in _list(b.get('changes')):
            if not isinstance(c, dict) or not _s(c.get('subject')):
                continue
            kind = c.get('kind') if c.get('kind') in P.CHANGE_KINDS else 'status'
            changes.append({'subject': _s(c.get('subject')), 'kind': kind, 'value': _s(c.get('value'), 200), 'object': _s(c.get('object'))})
        people = []
        for p in _list(b.get('people')):
            if isinstance(p, str):
                p = {'name': p}
            if isinstance(p, dict) and _s(p.get('name')):
                people.append({'name': _s(p['name']), 'role': _s(p.get('role'), 60), 'presence': p.get('presence') if p.get('presence') in PRESENCE else 'onsite'})
        sec = b.get('secret') if isinstance(b.get('secret'), dict) else {}
        extra = b.get('extra') if isinstance(b.get('extra'), dict) else {}
        beats.append({
            'title': _s(b.get('title'), 40) or '（无题）',
            'background': _s(b.get('background')), 'trigger': _s(b.get('trigger')),
            'motives': [{'who': _s(m.get('who')), 'motive': _s(m.get('motive'))} for m in _list(b.get('motives')) if isinstance(m, dict) and _s(m.get('who')) and _s(m.get('motive'))],
            'course': _s(b.get('course')), 'result': _s(b.get('result')), 'aftermath': _s(b.get('aftermath')), 'note': _s(b.get('note')),
            'extra': {_s(k, 20): _s(v) for k, v in extra.items() if _s(k) and _s(v)},
            'home': bool(b.get('home')), 'people': people, 'places': [_s(x) for x in _list(b.get('places')) if _s(x)],
            'time': {'after_previous': after, 'days': days if after == 'days' else 0, 'time_of_day': t.get('time_of_day') if t.get('time_of_day') in TIME_OF_DAY else 'unknown',
                     'duration_minutes': dur, 'stated': _s(t.get('stated'), 80),
                     'date': _s(t.get('date'), 10) if re.fullmatch(r'\d{4}-\d{2}-\d{2}', _s(t.get('date'))) else '',
                     'clock': _s(t.get('clock'), 5) if re.fullmatch(r'\d{1,2}:\d{2}', _s(t.get('clock'))) else ''},
            'changes': changes,
            'secret': {'is_secret': bool(sec.get('is_secret')), 'knowers': [_s(k) for k in _list(sec.get('knowers')) if _s(k)]},
            'importance': b.get('importance') if b.get('importance') in IMPORTANCE else 'normal',
        })
    return {
        'recap': _s(obj.get('recap')), 'beats': beats,
        'people_notes': [{'name': _s(n.get('name')), 'aliases_in_text': [_s(a) for a in _list(n.get('aliases_in_text')) if _s(a)], 'who': _s(n.get('who'), 200)}
                         for n in _list(obj.get('people_notes')) if isinstance(n, dict) and _s(n.get('name'))],
        'open_questions': [_s(q, 300) for q in _list(obj.get('open_questions')) if _s(q)],
    }


def check_summary(obj):
    if not isinstance(obj, dict):
        return ['the reply is not a JSON object']
    beats = obj.get('beats')
    if not isinstance(beats, list) or not beats:
        return ['"beats" must be a non-empty list']
    probs = []
    for i, b in enumerate(beats):
        if not isinstance(b, dict):
            probs.append(f'beat {i + 1} is not an object')
            continue
        for f in ('title', 'course', 'result'):
            if not _s(b.get(f)):
                probs.append(f'beat {i + 1} has no {f}')
    return probs


def wiki(project):
    return project.get('adapter') == 'wiki_arcs'


def summary_version(project):
    return P.SUMMARY_WIKI_VERSION if wiki(project) else P.SUMMARY_VERSION


def unit_prompt(project, c, u, text, part=None):
    chapter = next(ch for ch in c['chapters'] if ch['id'] == u['chapter'])
    if wiki(project):
        i = c['chapters'].index(chapter)
        near = [x['title'] for x in c['chapters'][max(0, i - 2):i + 3] if x['id'] != chapter['id']]
        system = P.SUMMARY_WIKI_SYSTEM.format(lang=lang_name(project), protagonist=c['protagonist']['name'],
                                              kinds='\n'.join(f'    {k}: {v}' for k, v in P.CHANGE_KINDS.items()))
        n = u.get('part_of') or 1
        user = P.SUMMARY_WIKI_USER.format(work=project.get('pack', {}).get('title', project.name), chapter=chapter['title'], start=chapter['start'],
                                          end=chapter['end'], start_year=chapter['start'][:4], siblings='；'.join(near),
                                          part=(f'This is part {u["order"]} of {n} of the material: summarize the happenings of this part\'s English text (the Chinese texts are the whole arc, for names, dates and details).\n' if n > 1 else ''),
                                          text=text)
        return system, user
    units = {x['id']: x for x in c['units']}
    sib = '；'.join(f'{units[i]["order"]}.{units[i]["title"]}' for i in chapter['units'])
    chars = c['characters']
    cast = '、'.join(f'{chars[k]["name"]}({u["speakers"].get(k, 0)})' for k in u['present'] if k in chars) or '（无）'
    system = P.SUMMARY_SYSTEM.format(lang=lang_name(project), protagonist=c['protagonist']['name'], home=project.get('frames', {}).get('default', 'home'),
                                     kinds='\n'.join(f'    {k}: {v}' for k, v in P.CHANGE_KINDS.items()))
    user = P.SUMMARY_USER.format(work=project.get('pack', {}).get('title', project.name), chapter=chapter['title'], era=chapter['era'] or '—',
                                 siblings=sib, order=u['order'], title=u['title'], place=f'（地点：{u["place"]}）' if u['place'] else '',
                                 part=f'，第{part[0]}/{part[1]}部分' if part else '', cast=cast, text=text)
    return system, user


def summarize(project, client, chapters=None, limit=None):
    c = corpus(project)
    max_chars = project.get('summary', {}).get('max_chars', 16000)
    jobs, plan = [], {}
    for u in c['units']:
        if chapters and u['chapter'] not in chapters:
            continue
        out_path = project.p('summaries', u['chapter'], f'{u["id"]}.json')
        if (read_json(out_path) or {}).get('version') == summary_version(project):
            continue
        text = unit_text(project, u)
        if not text.strip():
            continue
        parts = [text] if wiki(project) else split_text(text, max_chars)
        plan[u['id']] = (u, len(parts), out_path)
        for i, t in enumerate(parts):
            system, user = unit_prompt(project, c, u, t, (i + 1, len(parts)) if len(parts) > 1 else None)
            mt = 32000 if wiki(project) else 12000
            jobs.append(((u['id'], i), (lambda s=system, us=user, mt=mt: client.call('summary', summary_version(project), s, us, check_summary, max_tokens=mt))))
    if limit:
        keep = set(list(plan)[:limit])
        jobs = [j for j in jobs if j[0][0] in keep]
        plan = {k: v for k, v in plan.items() if k in keep}
    if not jobs:
        log('summaries: nothing to do')
        return
    log(f'summaries: {len(plan)} units ({len(jobs)} model calls)')
    res = client.run_many(jobs, 'summary')
    ok = 0
    for uid, (u, n, out_path) in plan.items():
        parts = [res.get((uid, i)) for i in range(n)]
        if any(p is None or isinstance(p, Exception) for p in parts):
            continue
        beats, recap, notes, qs = [], [], [], []
        for p in parts:
            s = normalize_summary(p)
            beats += s['beats']
            recap.append(s['recap'])
            notes += s['people_notes']
            qs += s['open_questions']
        for i, b in enumerate(beats):
            b['id'] = f'{uid}.b{i + 1}'
        write_json(out_path, {'unit': uid, 'chapter': u['chapter'], 'title': u['title'], 'version': summary_version(project), 'recap': ' '.join(r for r in recap if r), 'beats': beats,
                              'people_notes': notes, 'open_questions': qs})
        ok += 1
    log(f'summaries: {ok}/{len(plan)} units written — {client.ledger.summary()}')


def unit_summaries(project, c, chapter_id):
    """A chapter's unit summaries; for wiki projects with duplicate beats merged (see dedupe.py)."""
    sums = raw_unit_summaries(project, c, chapter_id)
    if wiki(project):
        from . import dedupe
        sums = dedupe.apply(project, chapter_id, sums)
    return sums


def raw_unit_summaries(project, c, chapter_id):
    ch = next(x for x in c['chapters'] if x['id'] == chapter_id)
    out = []
    for uid in ch['units']:
        s = read_json(project.p('summaries', chapter_id, f'{uid}.json'))
        if s:
            out.append(s)
    return out


# ---------------------------------------------------------------------------------------------------------------
# 2. chapter editing

def _beat_line(b):
    ppl = '、'.join(f'{p["name"]}' + ('(通讯)' if p['presence'] == 'remote' else '') for p in b['people'] if p['presence'] != 'mentioned')
    ch = '；'.join(f'{x["subject"]} {x["kind"]} {x["value"] or x["object"]}'.strip() for x in b['changes'])
    t = b['time']
    when = (t.get('date', '') + ' ' + t.get('clock', '') + ' ').lstrip() + t['after_previous'] + (f' {t["days"]}d' if t['days'] else '') + ('' if t['time_of_day'] == 'unknown' else ' ' + t['time_of_day'])
    return (f'[{b["id"]}] {b["title"]}（{b["importance"]}；{when}）\n  起因：{b["trigger"][:200]}\n  经过：{b["course"][:500]}\n  结果：{b["result"][:300]}\n'
            f'  人物：{ppl}\n  变化：{ch or "—"}')


def check_chapter(beat_ids, max_hard):
    def check(obj):
        if not isinstance(obj, dict) or not isinstance(obj.get('events'), list):
            return ['"events" must be a list']
        probs = []
        seen = collections.Counter(e.get('beat') for e in obj['events'] if isinstance(e, dict))
        missing = [b for b in beat_ids if not seen.get(b)]
        extra = [b for b in seen if b not in beat_ids]
        if missing:
            probs.append('events lack these beats: ' + ', '.join(missing[:20]))
        if extra:
            probs.append('events name unknown beats: ' + ', '.join(str(x) for x in extra[:10]))
        fixed = ([obj['resolution']] if isinstance(obj.get('resolution'), dict) and obj['resolution'].get('beat') else []) + \
            [f for f in _list(obj.get('fixed')) if isinstance(f, dict)]
        for e in fixed:
            if e.get('beat') not in beat_ids:
                probs.append(f'fixed point names an unknown beat: {e.get("beat")}')
                continue
            if not _s(e.get('required')):
                probs.append(f'fixed point {e.get("beat")} has no "required"')
            if not [o for o in _list(e.get('outcomes')) if isinstance(o, dict) and o.get('predicate') in P.PREDICATES]:
                probs.append(f'fixed point {e.get("beat")} needs outcomes with a predicate from {P.PREDICATES}')
        return probs
    return check


def edit_chapters(project, client, chapters=None):
    c = corpus(project)
    max_hard = project.get('classification', {}).get('max_hard_per_chapter', 3)
    pending, plan = {}, {}
    chs = c['chapters']
    for i, ch in enumerate(chs):
        if chapters and ch['id'] not in chapters:
            continue
        out_path = project.p('chapters', f'{ch["id"]}.json')
        sums = unit_summaries(project, c, ch['id'])
        if len(sums) < len([u for u in ch['units'] if unit_text(project, next(x for x in c['units'] if x['id'] == u)).strip()]):
            warn(f'{ch["id"]}: not every unit is summarized yet; skipped')
            continue
        beats = [b for s in sums for b in s['beats']]
        ids = [b['id'] for b in beats]
        prev = read_json(out_path)
        version = P.CHAPTER_WIKI_VERSION if wiki(project) else P.CHAPTER_VERSION
        olds = old_records(project, ch) if wiki(project) else []
        if prev and prev.get('beat_ids') == ids and prev.get('version') == version and prev.get('old_ids', []) == [o['id'] for o in olds]:
            continue
        # a long chapter is edited in parts (cut between units), each seeing the whole chapter's beat titles
        parts = chapter_parts(sums, project.get('chapter', {}).get('max_beats', 90))
        system = P.CHAPTER_SYSTEM.format(lang=lang_name(project), max_fixed=max(0, max_hard - 1), predicates=', '.join(P.PREDICATES))
        outline = '\n'.join(f'[{b["id"]}] {b["title"]}' for b in beats)
        n = len(parts)

        def job(part, path, n=n, system=system, outline=outline, ch=ch, i=i, olds=olds, version=version):
            pids = [b['id'] for b in part]
            note = '' if n == 1 and len(path) == 1 else P.CHAPTER_PART.format(k=path[0] + 1, n=n, outline=outline)
            user = P.CHAPTER_USER.format(work=project.get('pack', {}).get('title', project.name), order=ch['order'], chapter=ch['title'], era=ch['era'] or '—',
                                         prev=chs[i - 1]['title'] if i else '（无）', next=chs[i + 1]['title'] if i + 1 < len(chs) else '（无）',
                                         beats='\n'.join(_beat_line(b) for b in part)) + note
            check = check_chapter(pids, max_hard)
            if olds:
                user += P.CHAPTER_OLD.format(records='\n'.join(_old_line(o) for o in olds))
                check = check_old(check, [o['id'] for o in olds], pids)
            mt = min(60000, 4000 + 220 * len(part) + 60 * len(olds))
            return lambda: client.call('chapter', version, system, user, check, max_tokens=mt, json_mode=False)
        plan[ch['id']] = (ids, out_path, [o['id'] for o in olds], version)
        for k, part in enumerate(parts):
            pending[(ch['id'], (k,))] = (part, job)
    if not pending:
        log('chapters: nothing to do')
        return
    log(f'chapters: {len(plan)} chapters ({len(pending)} model calls)')
    # a part the model cannot finish (it drops the later beats of a long part) is edited again as two halves
    results = {}
    for depth in range(3):
        res = client.run_many([(key, j(part, key[1])) for key, (part, j) in pending.items()], 'chapter')
        retry = {}
        for key, (part, j) in pending.items():
            r = res.get(key)
            if r is not None and not isinstance(r, Exception):
                results[key] = r
            elif depth < 2 and len(split_part(part)) == 2:
                a, b = split_part(part)
                warn(f'{key[0]} part {key[1]}: edited again in two halves ({len(a)} + {len(b)} beats)')
                retry[(key[0], key[1] + (0,))] = (a, j)
                retry[(key[0], key[1] + (1,))] = (b, j)
        if not retry:
            break
        pending = retry
    for cid, (ids, out_path, old_ids, version) in plan.items():
        keys = sorted(k for k in results if k[0] == cid)
        got = [b for k in keys for b in check_ids(results[k])]
        if set(ids) - set(got):
            warn(f'{cid}: some parts have no usable edit; run the command again to retry')
            continue
        rs = [results[k] for k in keys]
        om = {}
        for r in rs:
            for x in _list(r.get('old_map')):
                if isinstance(x, dict) and x.get('old') in old_ids and x.get('beat') in ids and not om.get(x['old']):
                    om[x['old']] = x['beat']
        write_json(out_path, normalize_chapter(merge_parts(rs), ids, max_hard) | {'chapter': cid, 'beat_ids': ids, 'version': version, 'parts': len(rs),
                                                                                 'old_ids': old_ids, 'old_map': {o: om.get(o, '') for o in old_ids}})
    log(f'chapters done — {client.ledger.summary()}')


def old_records(project, ch):
    """The base pack's events in a chapter's period (wiki projects): what the chapter edit maps to its beats."""
    import datetime as dt
    import os
    from .util import ROOT
    base = _base_pack(os.path.join(ROOT, project['base_pack'])) if project.get('base_pack') else None
    if not base:
        return []
    origin = dt.date.fromisoformat(project['timeline']['origin_date'])
    day = lambda s: (dt.date.fromisoformat(s) - origin).days  # noqa: E731
    keep = day(project.get('base_keep_before', '1900-01-01'))
    lo, hi = day(ch['start']) - 1, day(ch['end']) + 1
    return [e for e in base['events'] if e['when']['earliest']['day'] >= keep and e['when']['earliest']['day'] <= hi and e['when']['latest']['day'] >= lo]


_BASE = {}


def _base_pack(path):
    if path not in _BASE:
        _BASE[path] = read_json(path)
    return _BASE[path]


def _old_line(e):
    s = e.get('summary') or {}
    text = s.get('course') if isinstance(s, dict) else str(s)
    req = f'；必须发生：{e["required_description"]}' if e['classification'] == 'HARD' and e.get('required_description') else ''
    return f'[{e["id"]}] {e["title"]}（{e["classification"]}；{e["when"].get("label", "")}）{(text or "")[:160]}{req[:200]}'


def check_old(check, old_ids, pids):
    def f(obj):
        probs = check(obj)
        if isinstance(obj, dict):
            got = {x.get('old') for x in _list(obj.get('old_map')) if isinstance(x, dict)}
            miss = [o for o in old_ids if o not in got]
            if miss:
                probs.append('old_map lacks these records: ' + ', '.join(miss[:20]))
            bad = [x.get('beat') for x in _list(obj.get('old_map')) if isinstance(x, dict) and x.get('beat') and x.get('beat') not in pids]
            if bad:
                probs.append('old_map names beats that are not in the list: ' + ', '.join(str(b) for b in bad[:10]))
        return probs
    return f


def split_part(part):
    """A part's beats in two halves, cut between units near the middle (one unit: cut between beats)."""
    if len(part) < 2:
        return [part]
    unit = lambda b: b['id'].rsplit('.b', 1)[0]
    cuts = [i for i in range(1, len(part)) if unit(part[i]) != unit(part[i - 1])] or list(range(1, len(part)))
    c = min(cuts, key=lambda i: abs(i - len(part) / 2))
    return [part[:c], part[c:]]


def check_ids(r):
    """The beat ids an accepted chapter edit covers."""
    return [e.get('beat') for e in _list(r.get('events')) if isinstance(e, dict)]


def chapter_parts(sums, max_beats):
    """Units grouped into parts of at most max_beats beats (a unit is never split)."""
    parts, cur = [], []
    for s in sums:
        if cur and len(cur) + len(s['beats']) > max_beats:
            parts.append(cur)
            cur = []
        cur = cur + s['beats']
    if cur:
        parts.append(cur)
    return parts


def merge_parts(rs):
    """One chapter edit from its parts: lists joined; the resolution from the last part that names one."""
    if len(rs) == 1:
        return rs[0]
    out = {'summary': ' '.join(_s(r.get('summary')) for r in rs if _s(r.get('summary'))), 'short': rs[0].get('short') or '', 'frame': rs[0].get('frame') or {},
           'resolution': None, 'fixed': [], 'events': [], 'links': [], 'impact': [], 'ends': [], 'missed': []}
    for r in rs:
        if isinstance(r.get('resolution'), dict) and r['resolution'].get('beat'):
            out['resolution'] = r['resolution']
        for k in ('fixed', 'events', 'links', 'impact', 'ends', 'missed'):
            out[k] += [x for x in _list(r.get(k)) if isinstance(x, dict)]
    return out


def normalize_chapter(obj, ids, max_hard):
    ev = {}
    for e in _list(obj.get('events')):
        if not isinstance(e, dict) or e.get('beat') not in ids or e.get('beat') in ev:
            continue
        cls = e.get('class') if e.get('class') in ('SOFT', 'FREE') else 'SOFT'
        ev[e['beat']] = {'class': cls, 'why': _s(e.get('why'), 200), 'required': '', 'outcomes': [], 'hook': _s(e.get('hook'), 300)}
    for b in ids:
        ev.setdefault(b, {'class': 'SOFT', 'why': '（未分类，默认 SOFT）', 'required': '', 'outcomes': [], 'hook': ''})
    # fixed points: the resolution first, then the others in the model's order, at most max_hard in all
    res = obj.get('resolution') if isinstance(obj.get('resolution'), dict) else None
    fixed = ([dict(res, _res=True)] if res and res.get('beat') in ids else []) + [f for f in _list(obj.get('fixed')) if isinstance(f, dict) and f.get('beat') in ids]
    seen = set()
    for f in fixed:
        if f['beat'] in seen or len(seen) >= max_hard:
            continue
        outs = [{'subject': _s(o.get('subject')), 'predicate': o.get('predicate'), 'value': o.get('value')}
                for o in _list(f.get('outcomes')) if isinstance(o, dict) and o.get('predicate') in P.PREDICATES and _s(o.get('subject'))]
        if not _s(f.get('required')) or not outs:
            continue
        seen.add(f['beat'])
        e = ev[f['beat']]
        e.update({'class': 'HARD', 'required': _s(f.get('required')), 'outcomes': outs,
                  'why': ('本章的结局。' if f.get('_res') else '后续章节以此为前提。') + _s(f.get('why'), 200)})
    links = []
    for l in _list(obj.get('links')):
        if isinstance(l, dict) and l.get('from') in ids and l.get('to') in ids and l.get('from') != l.get('to'):
            links.append({'from': l['from'], 'to': l['to'], 'relation': l.get('relation') if l.get('relation') in RELATIONS else 'related', 'note': _s(l.get('note'), 300) or '（无说明）'})
    impact = {i['beat']: _s(i.get('impact')) for i in _list(obj.get('impact')) if isinstance(i, dict) and i.get('beat') in ids and _s(i.get('impact'))}
    fr = obj.get('frame') if isinstance(obj.get('frame'), dict) else {}
    ly = fr.get('local_year')
    try:
        ly = int(ly) if ly is not None and str(ly).strip() not in ('', 'null') else None
    except (TypeError, ValueError):
        ly = None
    ends = [{'beat': x['beat'], 'subject': _s(x.get('subject')), 'predicate': x.get('predicate'), 'value': _s(x.get('value'), 200)}
            for x in _list(obj.get('ends')) if isinstance(x, dict) and x.get('beat') in ids and _s(x.get('subject')) and x.get('predicate') in ('injury', 'whereabouts', 'status')]
    missed = [{'beat': x['beat'], 'subject': _s(x.get('subject')), 'kind': x.get('kind'), 'value': _s(x.get('value'), 200)}
              for x in _list(obj.get('missed')) if isinstance(x, dict) and x.get('beat') in ids and _s(x.get('subject'))
              and x.get('kind') in ('death', 'vanish', 'moves', 'status', 'learns')]
    return {'summary': _s(obj.get('summary')), 'short': _s(obj.get('short'), 12), 'frame': {'label': _s(fr.get('label'), 80), 'local_year': ly, 'relation': _s(fr.get('relation'), 300)},
            'events': ev, 'links': links, 'impact': impact, 'ends': ends, 'missed': missed}


# ---------------------------------------------------------------------------------------------------------------
# 3. entities

def all_summaries(project, c):
    out = []
    for ch in c['chapters']:
        out += unit_summaries(project, c, ch['id'])
    return out


def mentions(project, c, resolver):
    """Every name the summaries use, as candidates: {key: {names, kind_hint, chapters, beats, notes, ...}}."""
    from .names import clean
    cand = {}
    units = {u['id']: u for u in c['units']}

    def touch(name, kind, chapter, beat=None, weight=1):
        n = clean(name)
        if not n or len(n) > 40:
            return None
        k = resolver.get(n)
        if not k:
            k = ('p:' if kind == 'place' else 'n:') + n
        e = cand.setdefault(k, {'key': k, 'names': collections.Counter(), 'kinds': collections.Counter(), 'chapters': [], 'beats': 0, 'notes': [], 'weight': 0})
        e['names'][n] += 1
        e['kinds'][kind] += 1
        if chapter not in e['chapters']:
            e['chapters'].append(chapter)
        if beat:
            e['beats'] += 1
        e['weight'] += weight
        return k

    for s in all_summaries(project, c):
        ch = s['chapter']
        u = units.get(s['unit'])
        if u and u['place']:
            touch(u['place'], 'place', ch)
        for n in s['people_notes']:
            k = touch(n['name'], 'person', ch, weight=0)
            if k:
                if n['who'] and len(cand[k]['notes']) < 4 and n['who'] not in cand[k]['notes']:
                    cand[k]['notes'].append(n['who'])
                for a in n['aliases_in_text']:
                    cand[k]['names'][clean(a)] += 0
        for b in s['beats']:
            for p in b['people']:
                touch(p['name'], 'person', ch, b['id'], 2 if p['presence'] != 'mentioned' else 1)
            for pl in b['places']:
                touch(pl, 'place', ch, b['id'])
            for m in b['motives']:
                touch(m['who'], 'person', ch, b['id'])
            for x in b['changes']:
                touch(x['subject'], 'place' if x['kind'] == 'condition' else 'person', ch, b['id'])
                if x['object']:
                    touch(x['object'], 'organization' if x['kind'] in ('joins', 'leaves', 'leads') else 'object', ch, b['id'])
                if x['kind'] == 'moves' and x['value']:
                    touch(x['value'], 'place', ch, b['id'], 0)
            for k in b['secret']['knowers']:
                touch(k, 'person', ch, b['id'])
    return cand


def entity_item(c, e):
    chars = c['characters']
    k = e['key']
    lines = [f'key: {k}', 'names used: ' + '、'.join(n for n, _ in e['names'].most_common(8))]
    ch = chars.get(k)
    if ch:
        if ch.get('servant'):
            sv = ch['servant']
            lines.append(f'source data: servant, class {sv.get("class")}, official name {ch["name"]}' + (f' (other server: {sv["otherName"]})' if sv.get('otherName') else ''))
        else:
            lines.append(f'source data: story character "{ch["name"]}"')
        labels = [l for l, _ in collections.Counter(ch['labels']).most_common(6)]
        lines.append('labels in the script: ' + '、'.join(labels))
    elif k == 'protagonist':
        lines.append('the protagonist')
    lines.append('kind hint: ' + e['kinds'].most_common(1)[0][0] + f'; appears in {e["beats"]} beats, chapters {", ".join(e["chapters"][:6])}')
    for n in e['notes'][:3]:
        lines.append('note: ' + n)
    return '\n'.join(lines)


def check_entities(keys):
    def check(obj):
        if not isinstance(obj, dict) or not isinstance(obj.get('entities'), list):
            return ['"entities" must be a list']
        got = {e.get('key') for e in obj['entities'] if isinstance(e, dict)}
        miss = [k for k in keys if k not in got]
        return ['missing keys: ' + ', '.join(miss[:15])] if miss else []
    return check


def describe_entities(project, client):
    from . import names
    c = corpus(project)
    resolver = names.from_corpus(c, project)
    cand = mentions(project, c, resolver)
    prot = project.get('protagonist', {})
    cand.pop('protagonist', None)   # described by the project file
    path = project.p('entities.json')
    # names the current summaries no longer use are dropped
    done = {k: v for k, v in (read_json(path, {}) or {}).items() if k in cand}
    # a candidate is described again when the names it is mentioned by changed (a name resolved elsewhere before);
    # the counts themselves always follow the current summaries
    sig = lambda e: sorted(n for n, _ in e['names'].most_common(3))
    for k, v in done.items():
        if sorted(v.get('sig') or sig({'names': collections.Counter(v.get('names') or {})})) != sig(cand[k]):
            v['version'] = 'stale'
        v.update(names=dict(cand[k]['names']), chapters=cand[k]['chapters'], weight=cand[k]['weight'])
    # entities of the base pack are kept as they are
    todo = [e for k, e in cand.items() if done.get(k, {}).get('version') != P.ENTITY_VERSION and e['weight'] > 0 and not k.startswith('base:')]
    todo.sort(key=lambda e: (-e['weight'], e['key']))
    batch = project.get('entities', {}).get('batch', 30)
    registry = '\n'.join(f'base:{e["id"]} {e["name"]}' + (f'（{"、".join(e.get("aliases", [])[:6])}）' if e.get('aliases') else '') for e in names.base_entities(project))
    jobs = []
    for i in range(0, len(todo), batch):
        part = todo[i:i + batch]
        keys = [e['key'] for e in part]
        system = P.ENTITY_SYSTEM.format(lang=lang_name(project))
        user = P.ENTITY_USER.format(work=project.get('pack', {}).get('title', project.name), items='\n\n'.join(entity_item(c, e) for e in part))
        if registry:
            system += P.ENTITY_BASE
            user += '\n\nExisting registry:\n' + registry
        jobs.append((i, (lambda s=system, u=user, ks=keys: client.call('entity', P.ENTITY_VERSION, s, u, check_entities(ks), max_tokens=12000))))
    if jobs:
        log(f'entities: {len(todo)} candidates in {len(jobs)} model calls')
        res = client.run_many(jobs, 'entity')
        for r in res.values():
            if isinstance(r, Exception) or not r:
                continue
            for e in r.get('entities', []):
                if isinstance(e, dict) and e.get('key') in cand:
                    k = e['key']
                    done[k] = {'key': k, 'name': _s(e.get('name'), 60) or cand[k]['names'].most_common(1)[0][0],
                               'aliases': [_s(a, 40) for a in _list(e.get('aliases')) if _s(a)],
                               'kind': e.get('kind') if e.get('kind') in ('person', 'organization', 'place', 'object', 'world', 'other') else 'other',
                               'description': _s(e.get('description'), 300), 'id': _s(e.get('id'), 60), 'same_as': _s(e.get('same_as')),
                               'skip': bool(e.get('skip')), 'names': dict(cand[k]['names']), 'chapters': cand[k]['chapters'], 'weight': cand[k]['weight'], 'sig': sig(cand[k]),
                               'version': P.ENTITY_VERSION}
        write_json(path, done)
    else:
        write_json(path, done)
        log('entities: nothing to do')
    log(f'entities: {len(done)} described — {client.ledger.summary()}')
