"""Source adapter: Atlas Academy (FGO game data, https://atlasacademy.io).

Produces the generic corpus (chapters -> units -> rendered text, characters, places) from:
- export/<region>/nice_war.json: chapters ("wars"), their era (`age`), quests, spots, and each quest's scripts;
- export/<region>/basic_svt.json: servant names, so a character figure id maps to its official name;
- static.atlasacademy.io/<region>/Script/..: the story scripts themselves.

A second region (year_region, e.g. JP) is read only to align story years: each server shifts the in-world
"present" year by its own release delay (JP 2017 = CN 2018 = NA 2019 for the same scene).
"""
import collections
import os
import re

from .. import net
from ..util import log, read_json, write_json, write_text, read_text, warn, uniq
from . import atlas_script

API = 'https://api.atlasacademy.io/export'
MASK = re.compile(r'^[？?！!…・·\s]*$|^[？?]{2,}')


def _raw(project, *parts):
    return project.p('raw', 'atlas', *parts)


def _war_file(project, region):
    return _raw(project, region, 'nice_war.json')


def _script_file(project, region, sid):
    return _raw(project, region, 'Script', sid[:2], sid + '.txt')


def _script_url(url, region):
    return re.sub(r'/(JP|NA|CN|KR|TW)/Script/', f'/{region}/Script/', url)


def select(project, wars):
    """The chapters and units in scope, in story order."""
    cfg = project['atlas']
    want = cfg.get('wars', 'main')
    types = set(cfg.get('quest_types', ['main']))
    exclude = set(cfg.get('exclude_wars', []))
    by_id = {w['id']: w for w in wars}
    if want == 'main':
        ids = sorted(w['id'] for w in wars if w['id'] < 1000 and 'mainScenario' in (w.get('flags') or []))
    else:
        ids = []
        for x in want:
            if isinstance(x, list):
                ids += [w for w in sorted(by_id) if x[0] <= w <= x[1]]
            else:
                ids.append(x)
    ids = [i for i in uniq(ids) if i in by_id and i not in exclude]
    chapters = []
    for wid in ids:
        w = by_id[wid]
        quests = {}
        for sp in w.get('spots', []):
            for q in sp.get('quests', []):
                if q['type'] not in types or q['id'] in quests:
                    continue
                scripts = []
                for ph in q.get('phaseScripts', []):
                    for s in ph.get('scripts', []):
                        scripts.append({'id': s['scriptId'], 'url': s['script'], 'phase': ph['phase']})
                scripts = sorted({s['id']: s for s in scripts}.values(), key=lambda s: s['id'])
                if scripts:
                    quests[q['id']] = {'quest': q, 'spot': sp.get('name') or q.get('spotName') or '', 'scripts': scripts}
        units = sorted(quests.values(), key=lambda u: (u['scripts'][0]['id'], u['quest']['id']))
        # the war's own opening script (startType "script") comes first
        if w.get('script') and str(w.get('scriptId') or '') not in ('NONE', '', '0') and not any(s['id'] == w['scriptId'] for u in units for s in u['scripts']):
            units.insert(0, {'quest': {'id': f'{wid}-opening', 'name': '开场', 'type': 'opening', 'chapterSubStr': ''}, 'spot': '',
                             'scripts': [{'id': w['scriptId'], 'url': w['script'], 'phase': 0}]})
        if units:
            chapters.append({'war': w, 'units': units})
    return chapters


def fetch(project, refresh=False):
    cfg = project['atlas']
    region = cfg.get('region', 'CN')
    yreg = cfg.get('year_region')
    for r in uniq([region] + ([yreg] if yreg else [])):
        for name in ('nice_war.json', 'basic_svt.json'):
            path = _raw(project, r, name)
            if refresh or not os.path.exists(path):
                log(f'downloading {r}/{name}')
                net.get(f'{API}/{r}/{name}', path, refresh=True, timeout=300)
    wars = read_json(_war_file(project, region))
    chapters = select(project, wars)
    jobs = []
    for ch in chapters:
        for u in ch['units']:
            for s in u['scripts']:
                jobs.append((_script_url(s['url'], region), _script_file(project, region, s['id'])))
                if yreg and yreg != region:
                    jobs.append((_script_url(s['url'], yreg), _script_file(project, yreg, s['id'])))
    missing = net.get_many(jobs, workers=cfg.get('download_workers', 6), label='scripts')
    n_units = sum(len(c['units']) for c in chapters)
    log(f'fetched: {len(chapters)} chapters, {n_units} units, {len(jobs)} script files ({missing} unavailable)')


# ---------------------------------------------------------------------------------------------------------------
# characters

def _servants(project):
    cfg = project['atlas']
    region = cfg.get('region', 'CN')
    svts = read_json(_raw(project, region, 'basic_svt.json'), [])
    out = {s['id']: dict(s) for s in svts if s.get('type') in ('normal', 'heroine')}
    # the other server's name too: a server's own name list can be off (CN lists svt 400100 Medusa as 歌果)
    other = cfg.get('year_region')
    if other and other != region:
        for s in read_json(_raw(project, other, 'basic_svt.json'), []) or []:
            if s['id'] in out:
                out[s['id']]['otherName'] = s.get('name')
    return out


def figure_key(fig, servants):
    """A stable character key for a figure id: the servant it belongs to, or the NPC figure family."""
    for sid in (fig // 10, (fig // 1000) * 100, fig // 100 * 10):
        s = servants.get(sid)
        if s and s.get('type') in ('normal', 'heroine'):
            return f's{sid}', s
    return f'f{fig // 1000}', None


def is_mask(label):
    return bool(MASK.match(label or '')) or (label or '').startswith('？？？') or (label or '').startswith('???')


# ---------------------------------------------------------------------------------------------------------------
# years

YEAR = re.compile(r'(?<![0-9０-９])([0-9０-９]{4})(?=\s*年)')


def _years(text):
    from ..util import halfwidth_digits
    return [int(halfwidth_digits(m.group(1))) for m in YEAR.finditer(text)]


def year_map(project, chapters):
    """Learn how this server's years map to year_region's: positional pairs from scripts whose year lists line up."""
    cfg = project['atlas']
    region, yreg = cfg.get('region', 'CN'), cfg.get('year_region')
    if not yreg or yreg == region:
        return {}, {}
    pairs = collections.defaultdict(collections.Counter)
    for ch in chapters:
        for u in ch['units']:
            for s in u['scripts']:
                a = read_text(_script_file(project, region, s['id']), '')
                b = read_text(_script_file(project, yreg, s['id']), '')
                ya, yb = _years(a), _years(b)
                if ya and len(ya) == len(yb):
                    for x, y in zip(ya, yb):
                        pairs[x][y] += 1
    mapping, stats = {}, {}
    for x, c in pairs.items():
        y, n = c.most_common(1)[0]
        total = sum(c.values())
        stats[x] = dict(c)
        if y != x and n >= 2 and n / total >= 0.8:
            mapping[x] = y
    return mapping, stats


DATE = re.compile(r'(?<![0-9０-９])([0-9０-９]{4})\s*年(?:\s*([0-9０-９]{1,2})\s*月)?(?:\s*([0-9０-９]{1,2})\s*日)?')


def _dates(text):
    from ..util import halfwidth_digits
    return [tuple(int(halfwidth_digits(g)) if g else None for g in m.groups()) for m in DATE.finditer(text)]


def apply_years(text, mapping, other=None):
    """Rewrite this server's story dates as year_region's. A server moves the in-world "present" to its own
    release time, whole dates included (Solomon: JP 2016年12月31日, CN 2018年1月26日). With the other server's
    version of the same script (other) and the same number of dates in both, each date is replaced by its
    counterpart; else only years, by the learned map."""
    from ..util import halfwidth_digits
    if other is not None:
        da, db = _dates(text), _dates(other)
        if da and len(da) == len(db) and all(x[0] == y[0] or mapping.get(x[0]) == y[0] or abs(x[0] - y[0]) <= 3 for x, y in zip(da, db)):
            it = iter(db)

            def full(m):
                y, mo, d = next(it)
                return f'{y}年' + (f'{mo}月' if mo else '') + (f'{d}日' if d else '')
            return DATE.sub(full, text)
    if not mapping:
        return text

    def rep(m):
        y = int(halfwidth_digits(m.group(1)))
        return str(mapping.get(y, y)) if y in mapping else m.group(1)
    return YEAR.sub(rep, text)


# ---------------------------------------------------------------------------------------------------------------
# corpus

def build_corpus(project):
    cfg = project['atlas']
    region = cfg.get('region', 'CN')
    prot = project.get('protagonist', {})
    pname, gender = prot.get('name', '主人公'), prot.get('gender', 'female')
    cjk = project.get('pack', {}).get('language', 'zh-CN')[:2] in ('zh', 'ja')
    wars = read_json(_war_file(project, region))
    if not wars:
        raise SystemExit('run fetch first')
    chapters = select(project, wars)
    servants = _servants(project)
    # the other server's quest names, to align the dates in quest titles ("序／2018年 12月31日")
    other_qname = {}
    if cfg.get('year_region') and cfg.get('year_region') != region:
        for w in read_json(_war_file(project, cfg['year_region'])) or []:
            for sp in w.get('spots', []):
                for q in sp.get('quests', []):
                    other_qname[q['id']] = q.get('name') or ''
    ymap, ystats = year_map(project, chapters)
    if ymap:
        log('year alignment (this server -> %s): %s' % (cfg.get('year_region'), ', '.join(f'{a}->{b}' for a, b in sorted(ymap.items()))))

    # pass 1: parse every script, collect figure labels
    parsed = {}
    labels = collections.defaultdict(collections.Counter)     # key -> label counts
    for ch in chapters:
        for u in ch['units']:
            for s in u['scripts']:
                raw = read_text(_script_file(project, region, s['id']))
                if raw is None:
                    warn('missing script', s['id'])
                    continue
                yreg = cfg.get('year_region')
                other = read_text(_script_file(project, yreg, s['id'])) if yreg and yreg != region else None
                raw = apply_years(raw, ymap, other)
                ps = atlas_script.parse(s['id'], raw, pname, gender, cjk)
                parsed[s['id']] = ps
                for fig, labs in ps.figures.items():
                    k, _ = figure_key(fig, servants)
                    for lab in labs:
                        labels[k][lab] += 1
                for it in ps.items:
                    if it['t'] == 'say' and it.get('fig'):
                        k, _ = figure_key(it['fig'], servants)
                        labels[k][it['who']] += 1

    chars = {}
    for k, c in labels.items():
        real = [(l, n) for l, n in c.most_common() if not is_mask(l)]
        svt = servants.get(int(k[1:])) if k.startswith('s') else None
        name = svt['name'] if svt else (real[0][0] if real else c.most_common(1)[0][0])
        chars[k] = {'key': k, 'name': name, 'labels': dict(c), 'servant': ({'id': svt['id'], 'class': svt.get('className'), 'collectionNo': svt.get('collectionNo'),
                    'otherName': svt.get('otherName')} if svt else None), 'units': [], 'lines': 0,
                    # a servant is a summoned spirit (Mash, a demi-servant, is a living human)
                    'spirit': bool(svt and svt.get('type') == 'normal')}
    # two servants with one name (Gilles de Rais as Saber and as Caster) are told apart by class
    same = collections.Counter(c['name'] for c in chars.values() if c['servant'])
    for c in chars.values():
        if c['servant'] and same[c['name']] > 1:
            c['name'] = f"{c['name']}（{c['servant']['class']}）"
    for k, v in (project['atlas'].get('merge_characters') or {}).items():
        if k in chars and v in chars:
            for l, n in chars[k]['labels'].items():
                chars[v]['labels'][l] = chars[v]['labels'].get(l, 0) + n
            chars[k]['merged_into'] = v
    # a label that only one character uses identifies it (for speakers without a slot)
    owners = collections.defaultdict(set)
    for k, c in labels.items():
        for l in c:
            if not is_mask(l):
                owners[l].add(chars[k].get('merged_into') or k)
    label_owner = {l: next(iter(ks)) for l, ks in owners.items() if len(ks) == 1}

    def key_of(fig, label):
        k = figure_key(fig, servants)[0] if fig else label_owner.get(label)
        while k in chars and chars[k].get('merged_into'):
            k = chars[k]['merged_into']
        return k

    def display(fig, label):
        k = key_of(fig, label)
        if not k or k not in chars:
            return label
        c = chars[k]
        if c['servant']:
            canon = c['name']
            return canon if (label == canon or not label) else f'{label}〔{canon}〕'
        # an NPC figure is often reused for several unnamed people: keep the label, unmask it only
        if is_mask(label):
            real = [l for l, _ in collections.Counter(c['labels']).most_common() if not is_mask(l)]
            return f'{label}〔{real[0]}〕' if real else label
        return label

    out_chapters, out_units = [], []
    for ci, ch in enumerate(chapters):
        w = ch['war']
        cid = f'w{w["id"]}'
        unit_ids = []
        for ui, u in enumerate(ch['units']):
            q = u['quest']
            uid = f'{cid}.{ui + 1:03d}'
            blocks, present, speakers = [], collections.Counter(), collections.Counter()
            for s in u['scripts']:
                ps = parsed.get(s['id'])
                if not ps:
                    continue
                for fig in ps.shown:
                    labs = ps.figures.get(fig) or ['']
                    k = key_of(fig, sorted(labs)[0])
                    if k:
                        present[k] += 1
                for it in ps.items:
                    if it['t'] == 'say':
                        k = key_of(it.get('fig'), it['who'])
                        if k:
                            speakers[k] += 1
                            present[k] += 0
                blocks.append(atlas_script.render(ps.items, display, pname))
            text = '\n——场景切换——\n'.join(b for b in blocks if b)
            for k in present:
                if k in chars:
                    chars[k]['units'].append(uid)
                    chars[k]['lines'] += speakers.get(k, 0)
            spot = u['spot']
            war_names = (w.get('name') or '') + (w.get('longName') or '')
            place = spot if spot and spot not in war_names and '序章' not in spot else ''
            unit = {
                'id': uid, 'chapter': cid, 'order': ui + 1, 'title': apply_years(q.get('name') or '', ymap, other_qname.get(q['id'])), 'sub': q.get('chapterSubStr') or '',
                'quest_id': q['id'], 'quest_type': q.get('type'), 'place': place, 'scripts': [s['id'] for s in u['scripts']],
                'present': [k for k, _ in present.most_common() if k in chars],
                'speakers': {k: n for k, n in speakers.most_common() if k in chars},
                'chars': len(text),
            }
            write_text(project.p('text', cid, f'{uid}.txt'), text)
            out_units.append(unit)
            unit_ids.append(uid)
        title = apply_years((w.get('longName') or w.get('name') or cid).replace('\n', ' '), ymap)
        out_chapters.append({'id': cid, 'order': ci + 1, 'source_id': w['id'], 'title': title, 'name': apply_years(w.get('name') or '', ymap),
                             'era': apply_years(w.get('age') or '', ymap), 'units': unit_ids, 'event': bool(w.get('eventId'))})
    corpus = {
        'source': {'adapter': 'atlas', 'region': region, 'year_region': cfg.get('year_region'), 'year_map': {str(k): v for k, v in ymap.items()},
                   'year_pairs': {str(k): {str(a): b for a, b in v.items()} for k, v in ystats.items()}},
        'protagonist': {'name': pname, 'gender': gender},
        'chapters': out_chapters,
        'units': out_units,
        'characters': chars,
    }
    write_json(project.p('corpus.json'), corpus)
    tot = sum(u['chars'] for u in out_units)
    log(f'corpus: {len(out_chapters)} chapters, {len(out_units)} units, {len(chars)} characters, {tot:,} characters of text')
    return corpus
