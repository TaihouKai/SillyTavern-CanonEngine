"""Step: assemble the Canon Engine pack (code, no model) from the corpus, summaries, chapter edits and entities."""
import collections
import datetime as dt
import os
import re

from . import changes as org_changes, dates, deaths, names, review as reviews, start as start_state, timeline
from .skeleton import corpus, unit_text
from .steps import all_summaries
from .util import ROOT, read_json, write_json, uniq

ID_OK = re.compile(r'^[a-z][a-z0-9_.-]*$')
DEFAULT_HOOK = '若玩家在附近且合理知情，可提供在场或介入的机会；不强迫玩家参与。'
# everyday words that never identify one character (a project adds its setting's own, e.g. FGO's class names)
GENERIC_ALIASES = {'士兵', '市民', '村民', '医生', '少女', '少年', '男人', '女人', '老人', '孩子', '小孩', '小姑娘', '姑娘', '小妹妹', '小子', '大叔', '大姐', '大哥',
                   '小姐', '先生', '夫人', '王', '国王', '王后', '王妃', '皇帝', '皇后', '骑士', '神父', '店长', '老师', '前辈', '后辈', '敌人', '那家伙', '那个人',
                   '？？？', '???', '谜之人物', '神秘人',
                   '学校', '城市', '城镇', '村庄', '村子', '森林', '城堡', '王宫', '宫殿', '街道', '广场', '教会', '教堂', '港口', '海边', '房间', '走廊',
                   '大楼', '基地', '据点', '营地', '战场', '地下', '外面', '这里', '那里'}

PREDICATES = [
    {'id': 'alive', 'description': '人物是否在世（尚未出生者视为“未发生死亡”）。', 'value_type': 'boolean'},
    {'id': 'whereabouts', 'description': '人物当前的去向/所在；被消灭、退场的从者写明已消灭。', 'value_type': 'string'},
    {'id': 'injury', 'description': '人物持续性的伤势或身体状况。', 'value_type': 'string'},
    {'id': 'status', 'description': '人物、组织或存在的当前处境（被捕、被解放、与御主缔结契约等）。', 'value_type': 'string'},
    {'id': 'condition', 'description': '地点、建筑或物体的物理状况。', 'value_type': 'string', 'allowed_values': ['完好', '受损', '毁坏']},
    {'id': 'knows', 'description': '人物掌握的重要秘密或真相（写在知情者身上）。', 'value_type': 'string'},
    {'id': 'leader', 'description': '组织的实际领导者。', 'value_type': 'entity_ref'},
    {'id': 'members', 'description': '组织的主要成员。事件写加入（add）与离开（remove）的人，不写整份名单。', 'value_type': 'entity_set'},
    {'id': 'ally', 'description': '组织的同盟或合作对象。', 'value_type': 'entity_ref'},
    {'id': 'holder', 'description': '物品当前的持有者。', 'value_type': 'entity_ref'},
    {'id': 'form', 'description': '人物的身体形态。', 'value_type': 'string'},
]


def slug(s):
    s = (s or '').lower().strip()
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    if s and not s[0].isalpha():
        s = 'e-' + s
    return s[:48]


class Report:
    def __init__(self):
        self.items = collections.defaultdict(list)

    def add(self, kind, text):
        self.items[kind].append(text)


def group_candidates(described, rep, chars=None, pages=None):
    """Which described candidates are one entity: [(representative key, [keys])], heaviest first.

    Joined: the model's same_as links; a name-only candidate whose name one source character already uses; and
    candidates with the same slug, unless that would join two distinct source characters (Gilles de Rais the
    marshal and Gilles de Rais the Caster share a name and are two people).
    Two source characters are joined when they never appear in the same unit and the model calls them one person,
    or one is an NPC figure set named by a name the other is called by at least 20 times: a game draws one person
    with different figure sets from chapter to chapter (Mash had five). Two servants are never joined.
    """
    chars = chars or {}
    units_of = {k: set((chars.get(k) or {}).get('units') or []) for k in described}
    keys = [k for k, d in described.items() if not d.get('skip')]
    parent = {k: k for k in keys}

    def find(k):
        while parent[k] != k:
            parent[k] = parent[parent[k]]
            k = parent[k]
        return k

    def sourced(root_):
        return {k for k in keys if find(k) == root_ and not k.startswith(('n:', 'p:'))}

    def apart(xs, ys):
        """Source characters that never share a unit (each has some units), and at most one servant among them."""
        ux = set().union(*(units_of.get(k, set()) for k in xs))
        uy = set().union(*(units_of.get(k, set()) for k in ys))
        servants = [k for k in xs | ys if k.startswith('s') and k[1:].isdigit()]
        return bool(ux) and bool(uy) and not (ux & uy) and len(servants) <= 1

    def union(a, b, why, figure_ok=False):
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        if sourced(ra) and sourced(rb) and not (figure_ok and apart(sourced(ra), sourced(rb))):
            return
        parent[rb] = ra
        rep.add('merged', f'{described[a]["name"]}（{a}）＝{described[b]["name"]}（{b}）：{why}')

    for k in keys:
        s = described[k].get('same_as')
        if s and s in parent and s != k:
            union(s, k, '模型判定为同一人', figure_ok=True)
    # an NPC figure set named like someone who is called that name at least 20 times elsewhere (the name's owner)
    owner = {}
    for k in keys:
        for lab, n in ((chars.get(k) or {}).get('labels') or {}).items():
            lab = names.clean(lab)
            if lab and n >= 20 and n > owner.get(lab, (None, 0))[1]:
                owner[lab] = (k, n)
    for k in keys:
        if not (k.startswith('f') and k[1:].isdigit()):
            continue
        o = owner.get(names.clean(described[k]['name']))
        if o and o[0] != k:
            union(o[0], k, f'立绘套，与“{described[k]["name"]}”从未同场', figure_ok=True)
    # names a source-backed entity uses
    used_by = collections.defaultdict(set)
    for k in keys:
        if k.startswith(('n:', 'p:')):
            continue
        d = described[k]
        for n in [d['name']] + d.get('aliases', []) + list((d.get('names') or {}).keys()):
            used_by[names.clean(n)].add(k)
    for k in keys:
        if not k.startswith(('n:', 'p:')):
            continue
        d = described[k]
        hits = set()
        for n in [d['name'], k[2:]]:
            hits |= used_by.get(names.clean(n), set())
        if len(hits) == 1:
            union(next(iter(hits)), k, '名字与该角色一致')
    by_slug = collections.defaultdict(list)
    for k in keys:
        sl = slug(described[k].get('id'))
        if sl:
            by_slug[sl].append(k)
    # one id for two candidates of one kind is one entity, unless the sources give each a page of its own: the model
    # gave 警备员 and 风纪委员 both the id "judgment", and 风纪委员 vanished into 警备员
    def named_alike(a, b):
        pa, pb = page_title(described[a], pages), page_title(described[b], pages)
        return not (pa and pb and pa != pb)
    for sl, ks in by_slug.items():
        for k in ks[1:]:
            if described[k]['kind'] == described[ks[0]]['kind'] and named_alike(ks[0], k):
                union(ks[0], k, f'同一标识 {sl}')
    groups = collections.defaultdict(list)
    for k in keys:
        groups[find(k)].append(k)
    out = []
    for r, ks in groups.items():
        ks.sort(key=lambda k: (k.startswith(('n:', 'p:')), -described[k].get('weight', 0)))
        out.append((ks[0], ks))
    out.sort(key=lambda x: -sum(described[k].get('weight', 0) for k in x[1]))
    return out


def norm_name(s):
    """A name as the engine compares names: case, spaces and punctuation aside."""
    return re.sub(r'[\s·・._\-\'"“”‘’「」『』]+', '', str(s or '').lower())


# what a description must not say: it is read as standing truth, and a change is an event's (the engine's lint warns)
TEMPORAL = re.compile(r'已死|死亡|已经|现在是|目前|成为了|被杀|遇害|身亡')


def stable(desc):
    """A description without what can change: a clause that says someone died or what is so "now" goes (that is an
    event's business); 死亡保险 is a kind of insurance."""
    d = (desc or '').replace('死亡保险', '寿险')
    if not TEMPORAL.search(d):
        return d
    parts = [x for x in re.split(r'(?<=[，。；])', d) if x and not TEMPORAL.search(x)]
    return ''.join(parts).rstrip('，；') + ('。' if parts and not ''.join(parts).endswith('。') else '')


def page_title(d, pages):
    """The title of the wiki page a candidate has (by its name or an alias), or None."""
    if not pages:
        return None
    return next((n for n in [d.get('name')] + list(d.get('aliases') or []) if n and n in pages), None)


def page_kind(title, pages):
    """The kind of entity a wiki page is about, from its infobox (person, organization, place), or None."""
    m = re.match(r'\s*(?:\{\{[^{}]*\}\}\s*)*\{\{Infobox (character|organization|location)', pages.get(title or '') or '', re.I)
    return {'character': 'person', 'organization': 'organization', 'location': 'place'}.get(m.group(1).lower()) if m else None


def page_english(d, pages):
    t = page_title(d, pages)
    m = re.search(r'\|\s*英文(?:名)?\s*=\s*([^\n|{}]+)', pages.get(t) or '') if t else None
    return m.group(1).strip() if m else ''


def build_entities(project, c, rep):
    """The pack's entities, and a resolver from names to their ids."""
    described = read_json(project.p('entities.json'), {}) or {}
    generic = GENERIC_ALIASES | {g.lower() for g in project.get('generic_aliases', [])}
    chars = c['characters']
    prot = project.get('protagonist', {})
    ents, key_id = [], {}
    used_ids = set()

    def take_id(want, key):
        base = want if want and ID_OK.match(want) else ''
        if not base:
            if key.startswith('s') and key[1:].isdigit():
                base = f'svt-{key[1:]}'
            elif key.startswith('f') and key[1:].isdigit():
                base = f'npc-{key[1:]}'
            else:
                base = f'e-{len(used_ids) + 1}'
        i, out = 2, base
        while out in used_ids:
            out = f'{base}-{i}'
            i += 1
        used_ids.add(out)
        return out

    pid = take_id(slug(prot.get('id', 'protagonist')) or 'protagonist', 'protagonist')
    key_id['protagonist'] = pid
    ents.append({'id': pid, 'name': prot.get('name', '主人公'), 'aliases': list(prot.get('aliases', [])), 'kind': 'person',
                 'static_description': prot.get('description') or '原作的主人公。', 'source_refs': ['source-scripts'], '_names': {}})

    # one wiki's pages (the Chinese one for a wiki project): the same entity has a page in each
    wk = project.get('wiki') or {}
    pages = read_json(os.path.join(ROOT, wk['huiji']), {}) if wk.get('huiji') else {}
    groups = group_candidates(described, rep, c.get('characters') or {}, pages)
    # candidates of one kind and one name are one entity (live: 史提尔·马格努斯 twice, 英国清教 three times, each
    # described in another batch); the one the story names most keeps its description. A servant's figures stay apart
    # (one name, several classes)
    weight = lambda g: sum(described[k].get('weight', 0) for k in g[1])  # noqa: E731
    one = {}
    for g in sorted(groups, key=lambda g: -weight(g)):
        d = described[g[0]]
        k = (norm_name(d['name']), d['kind'])
        if k in one and not any(chars.get(x, {}).get('servant') for x in g[1] + one[k][1]):
            one[k][1].extend(g[1])
            rep.add('merged', f'{d["name"]}（{g[0]}）与同名同类的 {described[one[k][0]]["name"]}（{one[k][0]}）合并')
            continue
        one.setdefault(k, g) if k not in one else one.setdefault((k, g[0]), g)
    groups = list(one.values())
    # one name, two kinds (卡提纳正统 as a thing and as a "person"), or one's name another's alias (马瑟斯 of 山缪·李德·
    # 麦奎恩·马瑟斯): one entity, the heavier, unless the wiki gives each a page of its own; a place keeps its own
    # (迦勒底 the institution and 迦勒底 the base, below)
    def page_of_group(g):
        return page_title(described[g[0]], pages)
    merged_into, lead_key = {}, {}
    order = sorted(groups, key=lambda g: -weight(g))
    for i, g in enumerate(order):
        if id(g) in merged_into or any(chars.get(x, {}).get('servant') for x in g[1]):
            continue
        d = described[g[0]]
        gn = norm_name(d['name'])
        ga = {norm_name(a) for k in g[1] for a in described[k].get('aliases', [])}
        for h in order[i + 1:]:
            if id(h) in merged_into or any(chars.get(x, {}).get('servant') for x in h[1]):
                continue
            e = described[h[0]]
            if 'place' in (d['kind'], e['kind']):
                continue
            hn = norm_name(e['name'])
            ha = {norm_name(a) for k in h[1] for a in described[k].get('aliases', [])}
            same = gn == hn or (d['kind'] == e['kind'] and (hn in ga or gn in ha))
            pg, ph = page_of_group(g), page_of_group(h)
            if not same or (pg and ph and pg != ph):
                continue
            pk = page_kind(pg or ph, pages)
            # the kind its page says, else a thing or a group over a "person" by its name (卡提纳正统 is a sword)
            if d['kind'] != e['kind'] and (pk == e['kind'] or (pk is None and d['kind'] == 'person' and e['kind'] in ('object', 'organization', 'other', 'world'))):
                # the other one is of the kind its page says: it keeps the entity (its key first)
                g[1].extend(h[1])
                lead_key[id(g)] = h[0]
            else:
                g[1].extend(h[1])
            merged_into[id(h)] = g
            rep.add('merged', f'{e["name"]}（{h[0]}，{e["kind"]}）与 {d["name"]}（{g[0]}，{d["kind"]}）同名或互为别名，合并')
    groups = [(lead_key.get(id(g), g[0]), g[1]) for g in groups if id(g) not in merged_into]
    # a vague word is no entity (学校, 城市): the summaries use it for whatever place is meant. Only the built-in words: a
    # project's generic aliases are words no person goes by, and some name an organization (live: 风纪委员, 警备员 were lost)
    kept = []
    for g in groups:
        if described[g[0]]['kind'] in ('place', 'other') and names.clean(described[g[0]]['name']).lower() in GENERIC_ALIASES:
            rep.add('merged', f'{described[g[0]]["name"]}（{g[0]}）是通用词，不作实体')
            continue
        kept.append(g)
    groups = kept
    # a few people named together (史提尔·马格努斯与神裂火织, 史蒂芬妮、麦野、泷壶、绢旗) are not an entity of their own:
    # their names go to each of them (live: 16 such "people", one of them an ITEM member of 天草式 at the start)
    single = {names.clean(described[g[0]]['name']) for g in groups}
    single |= {names.clean(a) for g in groups for k in g[1] for a in described[k].get('aliases', [])}
    def several(n):
        parts = [p for p in (x.strip() for x in names.PAIR_SEP.split(names.clean(n))) if p]
        return len(parts) >= 2 and sum(1 for p in parts if p in single or any(s.startswith(p) for s in single if len(p) >= 2)) >= 2
    kept = []
    for g in groups:
        if described[g[0]]['kind'] in ('person', 'organization') and several(described[g[0]]['name']):
            rep.add('merged', f'{described[g[0]]["name"]}（{g[0]}）是几个人一起，不作实体')
            continue
        kept.append(g)
    groups = kept
    # a person named by what is only the start of another person's name, with no page of their own, is that person
    # (泷壶 of 泷壶理后); a name among its aliases that is someone's page of their own is that someone (live: 天草式's
    # 对马 and 泷壶理后 were one entity, "泷壶", with 泷壶理后's description and 对马's id)
    is_person_page = lambda t: bool(re.match(r'\s*(?:\{\{[^{}]*\}\}\s*)*\{\{Infobox character', pages.get(t) or '', re.I))  # noqa: E731
    by_name = {names.clean(described[g[0]]['name']): g for g in groups if described[g[0]]['kind'] == 'person'}
    for g in list(groups):
        d = described[g[0]]
        n = names.clean(d['name'])
        if d['kind'] != 'person' or n in pages or len(n) < 2:
            continue
        longer = [h for m, h in by_name.items() if h is not g and m.startswith(n) and len(m) > len(n) and m in pages]
        if len(longer) != 1:
            continue
        h = longer[0]
        h[1].extend(g[1])
        groups.remove(g)
        rep.add('merged', f'{d["name"]}（{g[0]}）是 {described[h[0]]["name"]} 的简称，并入')
    # after every merge: a name an entity goes by that is someone's page of their own, and no entity's name, is that
    # someone (live: 天草式's 对马 ended up as an alias of 泷壶理后, through the short name 泷壶)
    entity_names = {norm_name(described[g[0]]['name']) for g in groups}
    for g in list(groups):
        if described[g[0]]['kind'] != 'person':
            continue
        own_name = norm_name(described[g[0]]['name'])
        own = uniq([a for k in g[1] for a in described[k].get('aliases', []) + list((described[k].get('names') or {}).keys())
                    if is_person_page(a) and norm_name(a) != own_name and norm_name(a) not in entity_names and a != page_title(described[g[0]], pages)])
        if not own:
            continue
        gone = set(own) | {page_english({'name': a}, pages) for a in own}
        for k in g[1]:
            described[k] = dict(described[k], aliases=[a for a in described[k].get('aliases', []) if a not in gone],
                                names={x: c for x, c in (described[k].get('names') or {}).items() if x not in gone})
        for a in own:
            k = f'page:{a}'
            en = page_english({'name': a}, pages)
            described[k] = {'key': k, 'name': a, 'aliases': [en] if en else [], 'kind': 'person', 'description': page_lead(project, a) or a,
                            'id': slug(en) or slug(a), 'weight': 1, 'names': {a: 1}}
            groups.append((k, [k]))
            entity_names.add(norm_name(a))
            rep.add('merged', f'{a} 有自己的页面，从 {described[g[0]]["name"]} 分出')
    # people and organizations get the plain slug; a place of the same name gets "-place" (迦勒底 the institution
    # and 迦勒底 the base)
    groups.sort(key=lambda g: described[g[0]]['kind'] == 'place')
    spirits = set()
    # an id two entities want goes by the sources: each takes its own page's English name (风纪委员 is Judgment,
    # 警备员 Anti-Skill)
    wants = collections.Counter(slug(described[r].get('id')) for r, _ in groups)
    for r, ks in groups:
        d = described[r]
        want = slug(d.get('id'))
        if wants[want] > 1 and slug(page_english(d, pages)):
            want = slug(page_english(d, pages))
        if d['kind'] == 'place' and want in used_ids:
            want = f'{want}-place'
        eid = take_id(want, r)
        nm = collections.Counter()
        for k in ks:
            key_id[k] = eid
            for n, cnt in (described[k].get('names') or {}).items():
                nm[names.clean(n)] += cnt or 1
            if chars.get(k, {}).get('spirit'):
                spirits.add(eid)
        desc = stable(d.get('description')) or '（无描述）'
        ents.append({'id': eid, 'name': d['name'], 'aliases': [a for k in ks for a in [described[k]['name']] + described[k].get('aliases', [])], 'kind': d['kind'],
                     'static_description': desc, 'source_refs': ['source-scripts'], '_names': dict(nm)})
    # one name for two people: a servant's class tells them apart (Gilles de Rais as Saber and as Caster)
    by_name = collections.defaultdict(list)
    for e in ents:
        by_name[e['name']].append(e)
    rep_key = {eid: k for k, eid in key_id.items() if k in chars}
    for nm_, es in by_name.items():
        if len(es) > 1:
            for e in es:
                ch = chars.get(rep_key.get(e['id'], ''), {})
                cls = (ch.get('servant') or {}).get('class')
                if cls:
                    e['name'] = f'{nm_}（{cls[:1].upper() + cls[1:]}）'
    # one name for a place and an organization (a base that is both): the place says so
    by_name = collections.defaultdict(list)
    for e in ents:
        by_name[e['name']].append(e)
    for nm_, es in by_name.items():
        if len(es) > 1 and len({e['kind'] for e in es}) == len(es):
            for e in es:
                if e['kind'] == 'place':
                    e['name'] = f'{nm_}（地点）'
                    e['aliases'] = [a for a in e['aliases'] if a != nm_]
                    e['_names'] = {}
    # aliases: the names the story used plus the model's, without generic words. A name several entities use goes
    # to the one the story calls by it far more often (3x), else to none.
    uses = collections.defaultdict(collections.Counter)
    for e in ents:
        for a in [e['name']] + e['aliases']:
            uses[names.clean(a)][e['id']] += 1
        for a, n in e['_names'].items():
            uses[names.clean(a)][e['id']] += max(1, n)
    entity_names = {norm_name(x['name']) for x in ents}
    for e in ents:
        al = []
        for a in uniq([names.clean(x) for x in e['aliases'] + list(e['_names'])]):
            if not a or a == e['name'] or a.lower() in generic or len(a) < 2 and not a.isalpha() or not re.search(r'[^\W\d_]', a):
                continue
            if '〔' in a and a.endswith('〕') and a.split('〔')[0].lower() in generic:
                continue
            if '未在文本中出现' in a or a.startswith('？'):
                continue
            if norm_name(a) in entity_names and norm_name(a) != norm_name(e['name']):
                continue        # another entity's own name (恋查（#029） is not an alias of 恋查)
            u = uses[a]
            if len(u) > 1:
                (top, n1), (_, n2) = u.most_common(2)
                if top != e['id']:
                    continue
                if n1 < 3 * n2:
                    rep.add('alias_collision', f'“{a}” 被 {", ".join(sorted(u))} 共用，未作别名')
                    continue
            al.append(a)
        e['aliases'] = al
    names_seen = collections.Counter(e['name'] for e in ents)
    for e in ents:
        if names_seen[e['name']] > 1:
            rep.add('name_collision', f'同名实体：{e["name"]}（{e["id"]}）')
    # groups the sources describe on a page of their own but the summaries never write as an organization (a rank
    # such as the Level 5s): the project names them (groups: [{id, name, aliases, page}]); their members come from the
    # page in 开局状态. Their aliases are theirs even when generic for anyone else (超能力者 of a person is a rank)
    have = {names.clean(n) for e in ents for n in [e['name']] + e['aliases']}
    for g in project.get('groups', []):
        if names.clean(g['name']) in have or g['id'] in used_ids:
            continue
        used_ids.add(g['id'])
        ents.append({'id': g['id'], 'name': g['name'], 'aliases': [a for a in g.get('aliases', []) if names.clean(a) not in have], 'kind': g.get('kind', 'organization'),
                     'static_description': g.get('description') or page_lead(project, g.get('page') or g['name']) or g['name'], 'source_refs': ['source-scripts'], '_names': {}})
    # resolver over the pack's ids
    # resolving a summary's names is wider than aliases: a title the story uses for one person ("所长" in a chapter
    # with one director) still resolves when that person is far its most frequent owner
    res = names.Resolver()
    for e in ents:
        res.add(e['name'], e['id'], strong=True)
    for a, u in uses.items():
        if not a:
            continue
        top = u.most_common(2)
        if len(top) == 1 or top[0][1] >= 3 * top[1][1]:
            res.add(a, top[0][0])
    for g in project.get('groups', []):
        for a in g.get('aliases', []):
            if any(e['id'] == g['id'] and a in e['aliases'] for e in ents):
                res.add(a, g['id'])
    base = names.from_corpus(c, project)
    for e in ents:
        e.pop('_names', None)
    return ents, res, key_id, base, spirits


def page_lead(project, title):
    """The first sentences of a wiki page (the project's wiki), for a group's description; '' without one."""
    from .nature import clean_wikitext, wiki_pages
    t = wiki_pages(project).get(title) or ''
    t = re.sub(r'^\s*\{\{[^{}]*(?:\{\{[^{}]*\}\}[^{}]*)*\}\}', '', t, flags=re.S)
    t = clean_wikitext(t, 4000)
    t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    first = next((x.strip() for x in t.split('\n') if x.strip() and not x.strip().startswith(('=', '[', '{', '|'))), '')
    if first and first[0] in '，,、。；：':
        first = title + first      # the name was a template the cleaning took out ({{Nihongo|海原|…}}，全名不明…)
    return first[:200]


def resolve(res, base, key_id, name):
    i = res.get(name)
    if i:
        return i
    k = base.get(name)
    if k and k in key_id:
        return key_id[k]
    return None


def value_for(pred, v, res, base, key_id):
    if pred == 'alive':
        if isinstance(v, bool):
            return v
        s = str(v).strip().lower()
        return not (s in ('false', '0', 'no', '否', '死亡', '已死亡', 'dead') or '死' in s)
    if pred in ('leader', 'holder'):
        return resolve(res, base, key_id, str(v)) if v not in (None, '') else None
    if pred == 'members':
        vs = v if isinstance(v, list) else [v]
        ids = [resolve(res, base, key_id, str(x)) for x in vs]
        return sorted({x for x in ids if x})
    s = str(v).strip() if v is not None else ''
    return s or None


def eids_add(i, eids):
    if i:
        eids.append(i)
    return i


ORG_KINDS = {'organization', 'world', 'other'}
# a lasting injury (a lost limb, an artificial eye) is a settled state; being knocked out is over within the scene
INJURY_LASTING = r'失去(?:了)?(?:一条|一只|双|左|右|两)?(?:手|臂|腿|眼|足|脚)|截肢|义肢|义眼|残疾|瘫痪'
# facts of a moment, not of a person's life: where they went (not a home), a captivity or a hiding, a disguise or a
# transformation of a fight (live: 上条当麻 stayed 「恩底弥翁内部」 into the next day's 大霸星祭, and a reviewer sent a
# reply back for saying he was at the games)
WHERE_HOME = r'^(?!离开|前往|乘|登上|被)(?:.*宿舍(?!之外)|.*公寓$)|的家$|^家$|^学园都市$|回到学园都市|返回学园都市|爱穗处$|基地$|^重新出现$|^再次现界|^已消灭'
STATUS_MOMENT = r'逮捕|控制(?!权)|拘留|拘押|俘虏|关押(?!于)|绑架|掳走|带走|擒获|被[^，。]{0,6}束缚|看管|藏匿|伪装|潜伏|行踪不明|无法行动|被制服|收押|准备自首|与[^，。]{1,8}同行'
STATUS_LASTING = r'监狱|处刑塔|牢房|终身|永久'
STATUS_RELEASE = r'获释|离开拘留所|脱离[^，。；]*|释放|解除|放弃带走|恢复'
FORM_MOMENT = r'外貌|外形|伪装|黑翼|白翼|光环|八条龙|强制进化|实体化|借用'
INJURY_PASSING = r'^(?:被[^，。；]{0,12})?(?:击倒|打倒|击飞|昏迷|昏倒|晕倒|晕厥|失去意识|昏过去|倒地|倒下|失神|被吹飞)[^，。；]{0,8}$'
CONDITION_WORDS = ((('毁', '塌', '炸', '摧', '烧尽', '沉没', '坠毁', '消失', '覆灭'), '毁坏'), (('修复', '重建', '复原', '恢复原状'), '完好'),
                   (('损', '破', '裂', '坏', '烧', '洞'), '受损'))


def physical(pred, val):
    """(predicate, value) with a physical condition among 完好/受损/毁坏: whatever else a beat says of a place (a
    blackout, a sealed building) is its status."""
    if pred != 'condition' or val in ('完好', '受损', '毁坏') or not isinstance(val, str):
        return pred, val
    for words, v in CONDITION_WORDS:
        if any(w in val for w in words):
            return pred, v
    return 'status', val
THING_KINDS = {'object', 'other', 'place', 'world'}


class FactState:
    """Turns summary changes into facts with the pack's predicates, checking each predicate's domain, and keeps the
    running state the facts depend on (organization members, settled values)."""

    def __init__(self, by_id, rep, spirits=()):
        self.by_id = by_id
        self.rep = rep
        self.spirits = set(spirits)     # summoned beings: their "death" is being destroyed, and they can come back
        self.members = {}
        self.recovery_values, self.settled_where, self.alive_changed = set(), set(), set()
        self.injured = set()

    def kind(self, i):
        return self.by_id.get(i, {}).get('kind')

    def checked(self, ent, pred, val):
        """(entity, predicate, value) with the domain fixed, or None: holder belongs on a thing, members and
        leader on an organization."""
        if not ent or val in (None, '', []):
            return None
        if pred == 'alive' and val is False and ent in self.spirits:
            return ent, 'whereabouts', '已消灭'
        if pred == 'holder':
            if self.kind(ent) == 'person' and isinstance(val, str) and self.kind(val) in THING_KINDS:
                ent, val = val, ent                     # "立香 holder 圣杯" means 圣杯 is held by 立香
            if self.kind(ent) == 'person':
                return None
        if pred in ('members', 'leader') and self.kind(ent) not in ORG_KINDS:
            return None
        if pred == 'condition' and self.kind(ent) == 'person':
            return ent, 'status', val       # a person's state is not a physical condition of a place or thing
        return (ent, *physical(pred, val))

    def apply(self, sid, k, v, obj_name, oid, put):
        # put(entity, predicate, value, op): op "add"/"remove" is who joins or leaves (see changes.py)
        if k in ('joins', 'leaves'):
            if oid and self.kind(sid) != 'person' and v and obj_name and obj_name in v:
                # an organization "joining" another on terms that name it made an agreement with it, it did not
                # become part of it (live: 英国清教 joins 学园都市, 「与学园都市达成合作协议」)
                put(sid, 'ally', oid)
            elif oid and self.kind(oid) in ORG_KINDS:
                cur = set(self.members.get(oid, set()))
                (cur.add if k == 'joins' else cur.discard)(sid)
                self.members[oid] = cur
                put(oid, 'members', [sid], 'add' if k == 'joins' else 'remove')
            elif obj_name:
                put(sid, 'status', f'{"加入" if k == "joins" else "离开"}{obj_name}')
            return
        if k == 'leads':
            if oid and self.kind(oid) in ORG_KINDS:
                put(oid, 'leader', sid, 'add')     # the one in office leaves it (changes.complete)
            elif obj_name:
                put(sid, 'status', f'领导{obj_name}')
            return
        if k == 'obtains':
            if oid and self.kind(oid) != 'person':
                put(oid, 'holder', sid)
            elif obj_name:
                put(sid, 'status', f'获得{obj_name}')
            return
        if k == 'death' and sid in self.spirits:
            k = 'vanish'
        if k == 'death':
            put(sid, 'alive', False)
            self.alive_changed.add(sid)
            for org, cur in list(self.members.items()):
                if sid in cur:
                    cur = set(cur)
                    cur.discard(sid)
                    self.members[org] = cur
                    put(org, 'members', [sid], 'remove')
        elif k == 'vanish':
            put(sid, 'whereabouts', f'已消灭（{v}）' if v else '已消灭')
        elif k == 'revive':
            w = f'再次现界（{v}）' if v else '再次现界'
            put(sid, 'whereabouts', w)
            self.settled_where.add(w)
        elif k == 'injury':
            if re.search(INJURY_PASSING, v or ''):
                return      # knocked out, fainted: over within the scene, not a lasting injury
            put(sid, 'injury', v or '受伤')
            self.injured.add(sid)
        elif k == 'recovery':
            val = v or '已痊愈'
            if sid not in self.injured:
                # only an injury that was recorded can end; anything else that "recovers" (memories) is a status
                put(sid, 'status', val)
                return
            self.injured.discard(sid)
            put(sid, 'injury', val)
            self.recovery_values.add(val)
        elif k == 'moves':
            put(sid, 'whereabouts', v)
            if v:
                self.settled_where.add(v)
        elif k == 'learns':
            put(sid, 'knows', v)
        elif k == 'condition':
            put(sid, *physical('condition', v))
        elif k == 'form':
            put(sid, 'form', v)
        else:
            put(sid, 'status', v)


def chapter_ends(edits, R, beats_by_ch):
    """The chapter edit's additions, as summary changes per beat: temporary conditions that end later in the
    chapter, and lasting changes the summaries missed (a death only implied afterwards)."""
    out = collections.defaultdict(list)
    kind_of = {'injury': 'recovery', 'whereabouts': 'moves', 'status': 'status'}
    for cid, ed in edits.items():
        ids = {b['id'] for b in beats_by_ch.get(cid, [])}
        for x in (ed or {}).get('ends', []):
            if x.get('beat') in ids and x.get('predicate') in kind_of:
                out[x['beat']].append({'subject': x['subject'], 'kind': kind_of[x['predicate']], 'value': x.get('value') or '', 'object': ''})
        for x in (ed or {}).get('missed', []):
            if x.get('beat') in ids:
                out[x['beat']].append({'subject': x['subject'], 'kind': x['kind'], 'value': x.get('value') or '', 'object': ''})
    return out


def full_date(text):
    """(year, month, day, minute of day or None) for the first full date a text states, else None."""
    if not text:
        return None
    for f in dates.scan(text):
        v = f['value']
        if f['kind'] == 'date' and v.get('day') and v.get('month') and v.get('year'):
            rest = text[text.find(f['text']) + len(f['text']):][:40] if f['text'] in text else ''
            return v['year'], v['month'], v['day'], timeline.time_of(rest) if rest else timeline.time_of(text)
    return None


ERA_RX = re.compile(r'^(AD|A\.D\.|BC|B\.C\.)\s*[:.]?\s*(\d{1,5})(\?)?$', re.I)


def era_year(era):
    """'AD:1431' -> (1431, ''), 'B.C.1000?' -> (-1000, '?'); None for anything else."""
    m = ERA_RX.match((era or '').strip())
    if not m:
        return None
    y = int(m.group(2))
    return (-y if m.group(1).upper().startswith('B') else y), m.group(3) or ''


def chapter_frame(project, ch, fr):
    """A chapter set in another time or world gets a time frame (the engine's frames): its local era is in the data
    and is not the home side's present. Local dates are not known day by day, so the clock is a label."""
    era = (ch.get('era') or '').strip()
    if era in ('', '-'):
        return None
    tl = project.get('timeline', {})
    oy = int(str(tl.get('origin_date', '2000'))[:4])
    lo, hi = tl.get('home_years', [oy - 1, oy + 30])
    ey = era_year(era)
    if ey and ey[0] > 0 and lo <= ey[0] <= hi and not ey[1]:
        return None
    if ey:
        y, q = ey
        label = (f'公元前{-y}年' if y < 0 else f'公元{y}年') + ('（？）' if q else '') + '，具体日期不明'
    else:
        label = f'当地年代：{era}'
    desc = ' '.join(x for x in [fr.get('relation') or '', f'当地年代（数据）：{era}。'] if x)
    return {'id': f'frame.{ch["id"]}', 'name': (fr.get('label') or ch['title']).strip()[:80], 'description': desc[:400],
            'clock': {'kind': 'unlinked', 'label': label}}


def stated_anchors(project, chapters, beats_by_ch, units, unit_of, clock):
    """Dates the story itself states for a beat, in the home calendar: the beat's stated time, else (for a unit's
    first beat) a date heading the unit's text or in its title. Only full dates (year, month, day) within the
    home years, and only for beats at home or in a chapter without a local era of its own."""
    tl = project.get('timeline', {})
    oy = clock.origin.year
    lo, hi = tl.get('home_years', [oy - 1, oy + 30])
    out = {}
    started = set()
    for ch in chapters:
        local = (ch.get('era') or '-') not in ('', '-')
        for b in beats_by_ch[ch['id']]:
            u = units[unit_of[b['id']]]
            first = u['id'] not in started
            started.add(u['id'])
            if local and not b.get('home'):
                continue
            cands = [('文中', b['time']['stated'])]
            if first:
                cands += [('开头', unit_text(project, u)[:160]), ('标题', u['title'])]
            for src_, text in cands:
                d = full_date(text)
                if d and lo <= d[0] <= hi:
                    y, mo, da, mi = d
                    if mi is None:
                        mi = timeline.time_of(b['time']['stated'])
                    try:
                        t = clock.tick(f'{y:04d}-{mo:02d}-{da:02d}') + (mi if mi is not None else 8 * 60)
                    except ValueError:
                        continue
                    out[b['id']] = (t, f'{y}年{mo}月{da}日（{src_}）')
                    break
    return out


LASTING_PREDICATES = {'alive', 'members', 'leader', 'ally', 'holder', 'knows'}


def _target(o):
    f = o.get('fact') or o
    return f['entity_id'], f['predicate']


def _story_end(events, ev):
    """The last event of an event's story (by time)."""
    at = lambda x: x['when']['earliest']['day'] * 1440 + x['when']['earliest']['minute']  # noqa: E731
    mine = [x for x in events if x.get('arc_id') == ev.get('arc_id')]
    return max(mine, key=at)['id'] if mine else None


def _until(u, events, ev):
    """A review or proposal "until" as the pack writes it ("story_end": the last event of the story)."""
    if u == 'story_end':
        last = _story_end(events, ev)
        return {'event': last} if last and last != ev['id'] else 'lasting'
    return u


def apply_impacts(events, rv, proposals, marks_of, by_id):
    """Adds what an event changes beyond itself (checked in the review file, else proposed, marked)."""
    lookup = {}
    for e in by_id.values():
        for n in [e.get('name')] + list(e.get('aliases') or []):
            if n:
                lookup.setdefault(n, e['id'])
    for ev in events:
        r = rv['impacts'].get(ev['id'])
        adds = r['effects'] if r else [dict(a, entity=lookup.get(a.get('entity'), a.get('entity'))) for a in (proposals.get(ev['id']) or {}).get('add', [])]
        if not r:
            marks_of.setdefault(ev['id'], []).append('影响未经人工核对' if ev['id'] in proposals else '影响尚未分析（运行 impacts）')
        for a in adds:
            ent = a.get('entity')
            if ent not in by_id:
                marks_of.setdefault(ev['id'], []).append(f'影响里的“{ent}”不是包里的实体')
                continue
            op = a.get('op') or 'set'
            val = a.get('value')
            if a['predicate'] == 'alive' and not isinstance(val, bool):
                val = str(val).strip().lower() not in ('false', '死亡', '死', '已死亡', 'dead', '0')
            if a['predicate'] in ('members', 'leader', 'holder', 'ally') and isinstance(val, (str, list)):
                vals = val if isinstance(val, list) else [val]
                ids = [lookup.get(v, v) for v in vals]
                if any(i not in by_id for i in ids):
                    marks_of.setdefault(ev['id'], []).append(f'影响里的“{"、".join(str(v) for v in vals)}”不是包里的实体')
                    continue
                val = ids if a['predicate'] == 'members' else ids[0]
            pred = a['predicate']
            if pred == 'condition':
                pred, val = physical(pred, val)
            eff = {'op': op, 'fact': {'entity_id': ent, 'predicate': pred, 'value': val}} if op == 'set' else {'op': op, 'entity_id': ent, 'predicate': pred, 'value': val}
            eff['until'] = _until(a.get('until', 'lasting'), events, ev)
            same = [o for o in ev['canonical_effects'] if _target(o) == (ent, pred)]
            if same and not a.get('replace'):
                # the event already writes this fact: a checked impact says replace to change it
                marks_of.setdefault(ev['id'], []).append(f'影响 {ent}.{pred} 与事件已有的效果重叠') if not r else None
                continue
            if same:
                ev['canonical_effects'] = [o for o in ev['canonical_effects'] if o not in same]
                for o in ev.get('outcomes') or []:
                    if (o['entity_id'], o['predicate']) == (ent, pred) and o.get('op', 'set') == op:
                        o['value'] = val
            ev['canonical_effects'].append(eff)
            if ent not in ev['entity_ids']:
                ev['entity_ids'].append(ent)


def apply_ends(events, rv, proposals, marks_of, by_id):
    """Gives every effect its "until": lasting by its nature, else the review file's decision for that value, else the
    model's proposal (marked), else lasting (marked)."""
    ids = {e['id'] for e in events}
    for ev in events:
        unchecked = undecided = 0
        # a state a person found wrong (the summary misread the source): out, with its outcome
        def decided(o):
            k = reviews.end_key(ev['id'], *_target(o))
            r = rv['ends'].get(k)
            if r and r.get('value') == o['fact']['value']:
                return r, True
            p = proposals.get(k)
            return (p, False) if p and p.get('value') == o['fact']['value'] else (None, False)
        drop = [o for o in ev['canonical_effects'] if o.get('op', 'set') == 'set' and (decided(o)[0] or {}).get('until') == 'drop']
        proposed_drops = sum(1 for o in drop if not decided(o)[1])
        if proposed_drops:
            marks_of.setdefault(ev['id'], []).append(f'{proposed_drops} 项状态被提议删去，未经人工核对')
        if drop:
            gone = {_target(o) for o in drop}
            ev['canonical_effects'] = [o for o in ev['canonical_effects'] if o not in drop]
            ev['outcomes'] = [o for o in ev.get('outcomes') or [] if (o['entity_id'], o['predicate']) not in gone]
            # a HARD event whose required results were all wrong locks what it still writes (as one that names none);
            # one that writes nothing more requires nothing: it is no contract, so not HARD
            if ev.get('classification') == 'HARD' and not ev['outcomes']:
                ev['outcomes'] = [dict(o['fact']) if o.get('op', 'set') == 'set' else {k: o[k] for k in ('entity_id', 'predicate', 'value', 'op')}
                                  for o in ev['canonical_effects'] if o.get('op', 'set') != 'unset']
                if not ev['outcomes']:
                    ev['classification'], ev['required_description'] = 'SOFT', None
        for o in ev['canonical_effects']:
            op = o.get('op', 'set')
            if op == 'unset':
                continue
            ent, pred = _target(o)
            if pred in LASTING_PREDICATES or op != 'set':
                o['until'] = 'lasting'
                continue
            if 'until' in o:        # a checked impact brings its own
                continue
            key = reviews.end_key(ev['id'], ent, pred)
            val = o['fact']['value']
            r = rv['ends'].get(key)
            if r and r.get('value') == val:
                o['until'] = _until(r['until'], events, ev)
            elif (proposals.get(key) or {}).get('value') == val:
                o['until'] = _until(proposals[key]['until'], events, ev)
                unchecked += 1
            else:
                o['until'] = 'lasting'
                undecided += 1
            u = o['until']
            if isinstance(u, dict) and 'event' in u and (u['event'] not in ids or u['event'] == ev['id']):
                o['until'] = 'lasting'
                marks_of.setdefault(ev['id'], []).append(f'{ent}.{pred} 的结束事件 {u["event"]} 不可用')
        if unchecked:
            marks_of.setdefault(ev['id'], []).append(f'{unchecked} 项状态的持续时间未经人工核对')
        if undecided:
            marks_of.setdefault(ev['id'], []).append(f'{undecided} 项状态还没有结束方式（运行 ends）')


def when_label(clock, cx, dated):
    """An event's time as people read it: the time when the sources give it, else what they give (a part of a day, a
    day, a month, years), never a made-up hour."""
    p, lo, hi = cx['precision'], cx['lo'], cx['hi']
    day = lambda t: clock.label(t).split(' ')[0]  # noqa: E731
    note = cx.get('note') or ''
    if note and not note.startswith('核对'):
        # a person set this window: their words say what is known of the time
        if p in ('minute', 'range'):
            return f'{clock.label(lo)}（{note}）'
        return note if '不详' in note else f'{note}（具体时间不详）'
    if p in ('minute', 'range'):
        lab = clock.label(lo)
    elif p == 'part_of_day':
        lab = f'{day(lo)} {cx.get("part") or ""}（具体时间不详）'
    elif p == 'day':
        lab = f'{day(lo)}（当天，具体时间不详）'
    elif p == 'days':
        lab = f'{day(lo)} 至 {day(hi)}（具体时间不详）'
    elif p == 'month':
        lab = f'{day(lo)[:7]}（具体日期不详）'
    else:
        lab = f'{day(lo)[:4]}–{day(hi)[:4]}年间（具体日期不详）' if day(lo)[:4] != day(hi)[:4] else f'{day(lo)[:4]}年（具体日期不详）'
    return lab if dated or cx.get('checked') or p not in ('minute', 'range') else f'约{lab}（编辑推定）'


def spelled(project, pack):
    """The pack with the project's spelling ("spelling": {"沉利": "沈利"}) in every text: the names as the user's
    lorebooks write them, kept on every rebuild (the sources and the models write the other form)."""
    sp = project.get('spelling') or {}
    if not sp:
        return pack

    def fix(x):
        if isinstance(x, str):
            for a, b in sp.items():
                x = x.replace(a, b)
            return x
        if isinstance(x, list):
            return [fix(v) for v in x]
        if isinstance(x, dict):
            return {fix(k): fix(v) for k, v in x.items()}
        return x
    return fix(pack)


def write_pack(project, path, pack):
    write_json(path, spelled(project, pack), indent=1)


def build(project, out_path=None, raw=False):
    """raw: without the steps that read a built pack and are applied to it (开局状态, deaths), for those steps."""
    c = corpus(project)
    rep = Report()
    cfg_pack = project.get('pack', {})
    lang = cfg_pack.get('language', 'zh-CN')
    ents, res, key_id, base, spirits = build_entities(project, c, rep)
    by_id = {e['id']: e for e in ents}
    R = lambda n: resolve(res, base, key_id, n)  # noqa: E731

    def RR(n):
        """The ids a name of the summary stands for: its entity, or each of a few people named together."""
        i = R(n)
        if i:
            return [i]
        parts = [x.strip() for x in names.PAIR_SEP.split(names.clean(n)) if x.strip()]
        return uniq([j for j in (R(x) for x in parts) if j]) if len(parts) >= 2 else []

    sums = all_summaries(project, c)
    units = {u['id']: u for u in c['units']}
    beats_by_ch = collections.defaultdict(list)
    unit_of = {}
    for s in sums:
        for b in s['beats']:
            beats_by_ch[s['chapter']].append(b)
            unit_of[b['id']] = s['unit']
    chapters = [ch for ch in c['chapters'] if beats_by_ch.get(ch['id'])]
    edits = {ch['id']: read_json(project.p('chapters', f'{ch["id"]}.json')) for ch in chapters}
    for ch in chapters:
        if not edits[ch['id']]:
            rep.add('missing', f'{ch["id"]} 没有章节编辑结果（分类、关联）；全部按 SOFT 处理')

    clock0 = timeline.Clock(project.get('timeline', {}).get('origin_date', '2000-01-01'))
    dated = set()
    loose = set()
    squeezed = set()
    rv = reviews.load(project)
    marks_of = {}
    if project.get('arcs'):
        # each chapter has dates of its own (the sources' chronology): a beat with a date sits there, the ones between
        # follow their cues; chapters running at the same time interleave (live: 超电磁炮 and 禁书目录 in one July)
        arc_of = {a['id']: a for a in project['arcs']}
        origin = dt.date.fromisoformat(project['timeline']['origin_date'])
        pos = {}
        for ch in chapters:
            for bid, (s, e, d) in timeline.place_arc(origin, arc_of[ch['id']], beats_by_ch[ch['id']], loose, squeezed).items():
                pos[bid] = {'start': s, 'end': e}
                if d:
                    dated.add(bid)
        clock = clock0
        chrep = [{'chapter': ch['id'], 'start': min(pos[b['id']]['start'] for b in beats_by_ch[ch['id']]), 'end': max(pos[b['id']]['end'] for b in beats_by_ch[ch['id']]),
                  'anchor': None, 'compressed': None, 'note': f'{arc_of[ch["id"]]["start"]}–{arc_of[ch["id"]]["end"]}'} for ch in chapters]
        for r in chrep:
            r['start_label'], r['end_label'] = clock.label(r['start']), clock.label(r['end'])
        seq = {b['id']: (i, j) for i, ch in enumerate(chapters) for j, b in enumerate(beats_by_ch[ch['id']])}
        order = sorted(seq, key=lambda x: (pos[x]['start'], seq[x]))
        # strictly increasing starts, so windows never touch (two beats at one minute happen one after the other)
        last = None
        for x in order:
            if last is not None and pos[x]['start'] <= last:
                pos[x]['start'] = last + 1
            pos[x]['end'] = max(pos[x]['end'], pos[x]['start'] + 1)
            last = pos[x]['start']
    else:
        pos, chrep, clock = timeline.compute(project, chapters, beats_by_ch, stated_anchors(project, chapters, beats_by_ch, units, unit_of, clock0))
        order = [b['id'] for ch in chapters for b in beats_by_ch[ch['id']]]
    # how well each event's time is known: its window covers that much (see timeline.certainty); a person's checked
    # window (the review file) over it
    if project.get('arcs'):
        cert = {}
        for ch in chapters:
            cert.update(timeline.certainty(origin, arc_of[ch['id']], beats_by_ch[ch['id']], {b['id']: (pos[b['id']]['start'], pos[b['id']]['end']) for b in beats_by_ch[ch['id']]}, dated, squeezed))
    else:
        cert = {bid: {'precision': 'range', 'lo': p_['start'], 'hi': max(p_['end'], p_['start'] + 30), 'review': '资料没有给出日期，只知道先后顺序'} for bid, p_ in pos.items()}
    origin_d = dt.date.fromisoformat(project['timeline']['origin_date'])
    for bid, x in rv['times'].items():
        if bid in cert:
            old = cert[bid]
            lo, hi = reviews.to_tick(origin_d, x['from']), reviews.to_tick(origin_d, x['to'])
            same = (old['precision'], old['lo'], old['hi']) == (x['precision'], lo, hi)
            cert[bid] = {'precision': x['precision'], 'lo': lo, 'hi': hi, 'review': None, 'checked': True,
                         'part': old.get('part') if same else None, 'note': '' if same else x.get('note', '')}
    win = timeline.windows(order, pos, {b['id']: b['time'] for bs in beats_by_ch.values() for b in bs}, loose,
                           {b['id']: chid for chid, bs in beats_by_ch.items() for b in bs})

    # places: every place entity, so location ids can be checked
    place_ids = {e['id'] for e in ents if e['kind'] == 'place'}
    titles = collections.Counter(b['title'] for ch in chapters for b in beats_by_ch[ch['id']])
    frames = {}
    events, arcs, edges = [], [], []
    st = FactState(by_id, rep, spirits)
    used_titles = set()
    dropped = collections.Counter()
    ends = chapter_ends(edits, R, beats_by_ch)

    for ch in chapters:
        cid = ch['id']
        ed = edits.get(cid) or {'events': {}, 'links': [], 'impact': {}, 'summary': '', 'frame': {}}
        fr = ed.get('frame') or {}
        frame_label = fr.get('label') or (f'当地年代：{ch["era"]}' if ch['era'] and ch['era'] != '-' else '')
        # a chapter without an era of its own runs on the home calendar: a dated label would only contradict it
        if ch['era'] in ('', '-') and re.search(r'\d{3,4}\s*年', frame_label):
            frame_label = ''
        short = ed.get('short') or (ch['name'] if ch['name'] and not re.search(r'\d', ch['name']) else ch['title'][:10])
        frame = chapter_frame(project, ch, fr)
        if frame:
            frames[cid] = frame
        arc_id = f'arc.{cid}'
        arc_events = []
        prev_title = None
        for b in beats_by_ch[cid]:
            bid = b['id']
            ev = ed['events'].get(bid) or {'class': 'SOFT', 'why': '', 'required': '', 'outcomes': [], 'hook': ''}
            cls = ev['class']
            # a title several events share says where it belongs: the chapter's short name, then the unit
            title = b['title']
            if titles[b['title']] > 1:
                if sum(1 for x in beats_by_ch[cid] if x['title'] == b['title']) > 1:
                    ut = units[unit_of[bid]]['title']
                    title = f'{title}·{ut}' if ut and not any(x['title'] == b['title'] and units[unit_of[x['id']]]['title'] == ut and x['id'] != bid
                                                               for x in beats_by_ch[cid]) else f'{title}·第{units[unit_of[bid]]["order"]}节'
                else:
                    title = f'{title}（{short}）'
            n_ = 2
            base_title = title
            while title in used_titles:
                title = f'{base_title}（{n_}）'
                n_ += 1
            used_titles.add(title)
            # entities
            ppl = [p for p in b['people'] if p['presence'] != 'mentioned']
            eids = []
            for p in ppl:
                ids_ = RR(p['name'])
                if ids_:
                    eids.extend(ids_)
                else:
                    dropped[p['name']] += 1
            motives = []
            for m in b['motives']:
                mid = R(m['who'])
                motives.append({'who': m['who'], 'entity_ids': [mid] if mid else [], 'motive': m['motive']})
                if mid:
                    eids.append(mid)
            locs = []
            for pl in b['places'] + ([units[unit_of[bid]]['place']] if units[unit_of[bid]]['place'] else []):
                i = R(f'{pl}（地点）') or R(pl)
                if i and i in place_ids:
                    locs.append(i)
            # changes -> facts
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

            changes = list(b['changes']) + ends.get(bid, [])
            for x in changes:
                subs = uniq([i for i in (R(n) for n in names.expand(x['subject'])) if i])
                if not subs:
                    dropped[f'{x["subject"]}（{x["kind"]}）'] += 1
                    continue
                for sid in subs:
                    eids.append(sid)
                    oid = eids_add(R(x['object']) if x.get('object') else None, eids)
                    st.apply(sid, x['kind'], x['value'], x.get('object') or '', oid, put)
            hard_outs = []
            if cls == 'HARD':
                for o in ev['outcomes']:
                    oid = R(o['subject'])
                    val = value_for(o['predicate'], o['value'], res, base, key_id)
                    fact = st.checked(oid, o['predicate'], val)
                    if fact:
                        hard_outs.append(fact)
                        eids.append(fact[0])
                    else:
                        dropped[f'HARD结果 {o["subject"]}.{o["predicate"]}={o["value"]}'] += 1
                for oid, pr, val in hard_outs:
                    if pr == 'alive':
                        st.alive_changed.add(oid)
                    if pr == 'members':
                        facts[(oid, pr, 'add')] = sorted(set(facts.get((oid, pr, 'add'), [])) | set(val))
                    elif pr == 'leader':
                        facts[(oid, pr, 'add')] = val
                    else:
                        facts[(oid, pr)] = val
                if not hard_outs and not facts:
                    rep.add('downgraded', f'{bid} {b["title"]}：HARD 但没有可用的结果事实，改为 SOFT')
                    cls = 'SOFT'
            eids = [i for i in uniq(eids) if i in by_id]
            for key in facts:
                if key[0] not in eids and key[0] in by_id:
                    eids.append(key[0])
            # outcomes: a fact, or (op add/remove) who joins or leaves; effects: the same as the engine writes them
            all_facts = [{'entity_id': k[0], 'predicate': k[1], 'value': v, **({'op': k[2]} if len(k) == 3 else {})} for k, v in facts.items() if k[0] in by_id]
            effects = [{'op': 'set', 'fact': o} if 'op' not in o else dict(o) for o in all_facts]
            # a HARD event locks only the outcomes its contract names; the rest are its incidental effects
            if cls == 'HARD' and hard_outs:
                locked = {(e, p) for e, p, _ in hard_outs}
                outcomes = [o for o in all_facts if (o['entity_id'], o['predicate']) in locked]
            else:
                outcomes = all_facts
            # time
            cx = cert[bid]
            s, e = cx['lo'], cx['hi']
            lab = when_label(clock, cx, bid in dated)
            # an event in the chapter's frame gets its local era from the frame; other labels stay in the text
            in_frame = bool(frame) and not b.get('home')
            if frame_label and not b.get('home') and not in_frame:
                lab += f'；{frame_label}'
            if b['time']['stated']:
                lab += f'；文中：{b["time"]["stated"]}'
            when = {'earliest': {'day': s // 1440, 'minute': s % 1440}, 'latest': {'day': e // 1440, 'minute': e % 1440},
                    'precision': 'minute' if s == e and cx['precision'] == 'range' else cx['precision'], 'label': lab,
                    'basis': 'documented' if bid in dated or cx.get('checked') else 'editorial',
                    'notes': cx.get('note') or ('日期出自资料。' if bid in dated else '按剧情先后与文中的时间提示推定。')}
            marks = [f'时间：{cx["review"]}'] if cx.get('review') else []
            if not cx.get('checked'):
                marks.append('时间未经人工核对')
            # summary
            summ = {}
            for f in ('background', 'trigger'):
                if b[f]:
                    summ[f] = b[f]
            if 'trigger' not in summ and cls != 'FREE':
                summ['trigger'] = f'承接“{prev_title}”。' if prev_title else f'{ch["title"]}的开端。'
            if motives:
                summ['motives'] = motives
            summ['course'] = b['course'] or b['title']
            summ['result'] = b['result'] or '（原文未交代）'
            if b['aftermath']:
                summ['aftermath'] = b['aftermath']
            imp = ed.get('impact', {}).get(bid)
            if imp:
                summ['impact'] = imp
            note = [b['note']] if b['note'] else []
            note += [f'【{k}】{v}' for k, v in b['extra'].items()]
            if note:
                summ['note'] = ' '.join(note)
            # cast: the people there, from the start of the event
            cast = []
            if len([p for p in ppl if p['presence'] == 'onsite']) >= 2:
                for p in ppl:
                    for i in RR(p['name']):
                        if p['presence'] == 'onsite' and i in eids and i not in [x['entity_id'] for x in cast] and by_id[i]['kind'] == 'person':
                            cast.append({'entity_id': i, 'at': dict(when['earliest']), 'role': p['role'] or '在场'})
            vis = {'mode': 'public', 'knower_ids': []}
            if b['secret']['is_secret']:
                kn = [x for x in uniq([R(k) for k in b['secret']['knowers']]) if x]
                vis = {'mode': 'secret', 'knower_ids': kn}
                eids = uniq(eids + kn)
            event = {
                'id': bid, 'title': title, 'summary': summ, 'classification': cls,
                'required_description': (ev['required'] or b['result']) if cls == 'HARD' else None,
                'when': when, 'entity_ids': eids, 'location_ids': uniq(locs), 'arc_id': arc_id,
                'canonical_preconditions': {'all': []}, 'outcomes': outcomes, 'canonical_effects': effects, 'visibility': vis,
                'participation': {'offer': 'when_relevant', 'hook': ev.get('hook') or DEFAULT_HOOK},
                'source_refs': ['source-scripts'],
                'author_note': f'来源脚本：{", ".join(units[unit_of[bid]]["scripts"])}（{units[unit_of[bid]]["title"]}）' + (f'。分类理由：{ev["why"]}' if ev.get('why') else ''),
            }
            if cast:
                event['cast'] = cast
            if in_frame:
                event['frame_id'] = frame['id']
            events.append(event)
            marks_of[bid] = marks
            arc_events.append(bid)
            prev_title = title
        # links inside the chapter, in time order only
        rank = {x: i for i, x in enumerate(order)}
        for l in ed.get('links', []):
            a, z = l['from'], l['to']
            if a not in rank or z not in rank:
                continue
            if l['relation'] in ('enables', 'precedes', 'motivates') and rank[a] >= rank[z]:
                rep.add('link_dropped', f'{a} → {z}（{l["relation"]}）方向与时间顺序相反，已舍弃')
                continue
            edges.append({'id': f'edge.{len(edges) + 1}', 'from': a, 'to': z, 'relation': l['relation'], 'basis': 'inferred', 'source_refs': ['source-scripts'], 'note': l['note']})
        recaps = [s['recap'] for s in sums if s['chapter'] == cid and s['recap']]
        arcs.append({'id': arc_id, 'title': ch['title'], 'summary': ed.get('summary') or ' '.join(recaps)[:600] or ch['title'], 'event_ids': arc_events})

    # deaths that do not hold (cpb/deaths.py: decided by the model, applied here)
    back, n_back = deaths.apply(events, project.p('deaths.json'), rep, ents) if not raw else (set(), 0)
    by_id.update({e['id']: e for e in ents if e['id'] not in by_id})
    # time frames: a place used only by the events of one frame belongs to it (the engine then knows a scene there is in
    # that frame); places also used at home or in several frames stay in the main frame
    place_frames = collections.defaultdict(set)
    for e in events:
        for l in e['location_ids']:
            place_frames[l].add(e.get('frame_id'))
    for ent in ents:
        fs = place_frames.get(ent['id'])
        if ent['kind'] == 'place' and fs and len(fs) == 1 and None not in fs:
            ent['frame_id'] = next(iter(fs))
    used_frames = {e.get('frame_id') for e in events}
    frame_list = [f for f in frames.values() if f['id'] in used_frames]

    preds = [dict(p) for p in PREDICATES]
    first = min(win[b][0] for b in order)
    last = max(win[b][1] for b in order)
    start = (first // 1440 - 1) * 1440
    end = (last // 1440 + 1) * 1440 + 1439
    init_facts = [{'fact': {'entity_id': i, 'predicate': 'alive', 'value': True}, 'source_refs': ['source-scripts'], 'note': '基线'}
                  for i in sorted(st.alive_changed) if by_id.get(i, {}).get('kind') == 'person'] + (start_state.place(project, by_id, events) if not raw else [])
    src = c['source']
    tl = project.get('timeline', {})
    pack = {
        'schema_version': '1.0.0',
        'pack_id': cfg_pack.get('pack_id', project.name),
        'pack_version': cfg_pack.get('pack_version', '0.1.0'),
        'title': cfg_pack.get('title', project.name),
        'language': lang,
        'description': cfg_pack.get('description', project.name),
        'calendar': {
            'system': 'relative_day',
            'origin_label': tl.get('origin_note') or f'第0天 = {tl.get("origin_date")}',
            'day_length_minutes': 1440,
            'time_zone_label': cfg_pack.get('time_zone_label', '故事当地时间'),
            **({'main_frame_name': project.get('frames', {}).get('default')} if project.get('frames', {}).get('default') else {}),
            'notes': f'主时钟是{project.get("frames", {}).get("default") or "故事主线一侧"}一侧经历的时间，只会向前走；特异点等地的当地年代见时空框架（frames）。'
                     + (f'年份按 {src.get("year_region")} 服惯例换算（' + '，'.join(f'{a}→{b}' for a, b in sorted((src.get("year_map") or {}).items())) + '）。' if src.get('year_map') else '')
                     + '除锚点外，具体日期为编辑推定。',
        },
        **({'frames': frame_list} if frame_list else {}),
        'coverage': {'start': {'day': start // 1440, 'minute': 0}, 'end': {'day': end // 1440, 'minute': 1439},
                     'notes': f'覆盖 {chapters[0]["title"]} 至 {chapters[-1]["title"]}。'},
        'sources': [{'id': 'source-scripts', 'title': project.get('source_title', '剧情脚本（Atlas Academy 数据）'),
                     'locator': project.get('source_locator', f'https://static.atlasacademy.io/{src.get("region")}/Script/'), 'kind': 'primary',
                     'notes': '每个事件的 author_note 列出它所依据的脚本编号。摘要由模型根据脚本撰写，经代码整理。'}],
        'predicates': preds,
        'entities': ents,
        'initial_state': {'at': {'day': start // 1440, 'minute': 0}, 'facts': init_facts},
        'arcs': arcs,
        'events': events,
        'edges': edges,
    }
    for k, n in dropped.most_common():
        rep.add('unresolved', f'{k} ×{n}')
    # what an event changes beyond itself that its summary tells and its effects missed: a person's checked list
    # (the review file), else the model's proposal (impacts.json), marked until a person checks it
    pack = spelled(project, pack)
    apply_impacts(pack['events'], rv, read_json(project.p('impacts.json'), {}) or {}, marks_of, by_id)
    # every effect says how long it holds (the pack lint refuses one that does not): lasting by its nature, else a
    # person's decision (the review file), else the model's proposal (ends.json), marked until a person checks it
    apply_ends(pack['events'], rv, read_json(project.p('ends.json'), {}) or {}, marks_of, by_id)
    # who leaves with a death or a dissolution, a leader handed over: over the effects as they finally are (the
    # checked impacts among them); what this adds is a change of who belongs, which lasts
    pack['events'] = org_changes.complete(pack['events'], init_facts)
    for e in pack['events']:
        for o in e['canonical_effects']:
            if o.get('op') in ('add', 'remove'):
                o.setdefault('until', 'lasting')
    for e in pack['events']:
        if marks_of.get(e['id']):
            e['review'] = '；'.join(marks_of[e['id']])
    out_path = out_path or project.p('out', f'{pack["pack_id"]}.canon.json')
    pack = spelled(project, pack)
    write_json(out_path, pack, indent=1)
    return pack, rep, chrep, clock, out_path
