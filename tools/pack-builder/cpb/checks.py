"""Quality checks of a built pack (code, no model), run by every `build` and written into the report: each kind of
problem found in packs so far, checked over the whole pack, so it shows before the pack is handed over (user: "这个
history pack 永远小问题不断"). A "problem" should be none; a "review" list is what the steps decided and a person
may want to look over. Project options (`checks`): `leading`, names of the characters who must be there with their
常态 and 思考方式; `dates`, days (YYYY-MM-DD) to show the organizations at."""
import collections
import datetime as dt
import os
import re

from .lasting import MOMENT
from .util import ROOT, read_json

DAY = 1440


def _at(e):
    w = e['when']['earliest']
    return w['day'] * DAY + w['minute']


def _f(x):
    return x.get('fact') or x


class _Replay:
    """The pack's facts as the events change them, in time order."""

    def __init__(self, pack):
        self.facts = {(f['fact']['entity_id'], f['fact']['predicate']): f['fact']['value'] for f in pack['initial_state']['facts']}

    def apply(self, x):
        f, op = _f(x), x.get('op', 'set')
        k = (f.get('entity_id'), f.get('predicate'))
        v = f.get('value')
        if op == 'set':
            self.facts[k] = v
        elif op == 'unset':
            self.facts.pop(k, None)
        elif op == 'add':
            self.facts[k] = sorted(set(self.facts.get(k) or []) | set(v)) if isinstance(v, list) else v
        elif op == 'remove':
            if isinstance(v, list):
                self.facts[k] = [m for m in self.facts.get(k) or [] if m not in v]
            elif self.facts.get(k) == v:
                self.facts.pop(k, None)

    def get(self, ent, pred):
        return self.facts.get((ent, pred))


def run(project, pack):
    """[(kind "problem"/"review", title, what it means, [lines])]."""
    E = {e['id']: e for e in pack['entities']}
    N = lambda i: E.get(i, {}).get('name', i)  # noqa: E731
    evs = sorted(pack['events'], key=_at)
    origin = dt.date.fromisoformat((project.get('timeline') or {}).get('origin_date', '2000-01-01'))
    def date(t):
        try:
            return (origin + dt.timedelta(days=t // DAY)).isoformat()
        except OverflowError:
            return '0000-00-00'     # before the calendar's first year (prehistory)
    wk = project.get('wiki') or {}
    pages = read_json(os.path.join(ROOT, wk['huiji']), {}) if wk.get('huiji') else {}
    persons = [e for e in pack['entities'] if e['kind'] == 'person']
    out = []

    def add(kind, title, what, lines):
        out.append((kind, title, what, lines))

    # time
    if project.get('arcs'):
        arcs = {f'arc.{a["id"]}': a for a in project['arcs']}
        far = []
        for e in evs:
            a = arcs.get(e.get('arc_id'))
            if not a:
                continue
            d = date(_at(e))
            try:
                lo = (dt.date.fromisoformat(a['start']) - dt.timedelta(days=3)).isoformat()
            except OverflowError:
                lo = '0000-00-00'
            hi = (dt.date.fromisoformat(a['end']) + dt.timedelta(days=3)).isoformat()
            if d < lo or d > hi:
                far.append(f'{e["id"]} {e["title"]}：{d}，篇章 {a["title"]} 为 {a["start"]}–{a["end"]}')
        add('review', '事件日期离所在篇章超过 3 天', '篇章的起止来自资料年表；差几天常是资料自己的日期，差很多多半是日期认错', far)
        add('problem', '没有事件的篇章', '资料有这一篇，包里却没有一件事', [a['title'] for k, a in arcs.items() if not any(e.get('arc_id') == k for e in evs)])

    # replay: the dead, organizations, statuses
    rp = _Replay(pack)
    dead_cast, org_long, person_long, early, after_gone = [], [], [], [], []
    status_at = {}
    seen = {}
    for e in evs:
        for i in e['entity_ids']:
            seen.setdefault(i, _at(e))
    snaps = {}
    dates = sorted((project.get('checks') or {}).get('dates') or [])
    marks = [(d, ((dt.date.fromisoformat(d) - origin).days) * DAY) for d in dates]
    mi = 0

    def snap(label):
        rows = []
        for o in pack['entities']:
            if o['kind'] != 'organization':
                continue
            ms = [m for m in rp.get(o['id'], 'members') or [] if rp.get(m, 'alive') is not False]
            ld, stv = rp.get(o['id'], 'leader'), rp.get(o['id'], 'status')
            if ms or ld or stv:
                rows.append(f'{o["name"]} | 首领 {N(ld) if ld else "—"} | {"、".join(N(m) for m in ms) or "—"}' + (f' | 状态 {stv}' if stv else ''))
        snaps[label] = rows
    for e in evs:
        while mi < len(marks) and _at(e) > marks[mi][1]:
            snap(marks[mi][0])
            mi += 1
        if e['classification'] != 'FREE':
            for c in e.get('cast') or []:
                if rp.get(c['entity_id'], 'alive') is False:
                    dead_cast.append(f'{N(c["entity_id"])}：{e["id"]} {e["title"]}（{date(_at(e))}）')
        for x in e['canonical_effects']:
            f = _f(x)
            ent, pred = f.get('entity_id'), f.get('predicate')
            if pred == 'status' and x.get('op', 'set') == 'set':
                prev = status_at.get(ent)
                if prev:
                    days = (_at(e) - prev[1]) // DAY
                    if E.get(ent, {}).get('kind') == 'person' and days > 21 and MOMENT.search(str(prev[0])):
                        person_long.append(f'{N(ent)}：「{prev[0]}」从 {date(prev[1])} 起挂了 {days} 天')
                    elif E.get(ent, {}).get('kind') not in (None, 'person') and days > 60:
                        org_long.append(f'{N(ent)}：「{prev[0]}」从 {date(prev[1])} 起挂了 {days} 天')
                status_at[ent] = (f.get('value'), _at(e))
            if pred == 'members' and x.get('op') == 'add' and _at(e) < seen.get(ent, _at(e)):
                early.append(f'{N(ent)}：{e["id"]} 在它出场之前加入成员')
            rp.apply(x)
        for o in pack['entities']:
            if o['kind'] == 'organization' and re.search(r'瓦解|覆灭|解散|解体|灭亡', str(rp.get(o['id'], 'status') or '')) and rp.get(o['id'], 'members'):
                after_gone.append(f'{o["name"]}：状态「{rp.get(o["id"], "status")}」时还有成员（{e["id"]}）')
    while mi < len(marks):
        snap(marks[mi][0])
        mi += 1
    add('review', '死后仍在之后事件的在场人物里', '死亡判断（deaths）已逐个看过：之后出现的是尸体、回忆、幽灵或 ω 世界之类；新出现的要看', dead_cast)
    add('problem', '人物的一时状态挂了三周以上', '昏迷、交战、赶往某处这类状态一直挂着，GM 会当成现状', person_long)
    add('review', '组织、地点的状态挂了两个月以上', '持续的状态（瓦解、结盟）可以挂很久；一时的不该', org_long)
    add('problem', '成员在组织出场之前加入', '开局状态应在成员出场后才加入', early)
    add('problem', '组织瓦解后仍有成员', '', sorted(set(after_gone)))

    # entities
    named = collections.defaultdict(set)
    for e in pack['entities']:
        for n in [e['name'], *(e.get('aliases') or [])]:
            named[n].add(e['id'])
    add('problem', '几个实体共用一个名字', '运行时会当成含糊的指称', [f'{n}：{", ".join(sorted(ids))}' for n, ids in named.items() if len(ids) > 1])
    add('problem', '几个人写成了一个实体', '「甲与乙」「甲、乙、丙」应分给每个人', [f'{e["id"]} {e["name"]}' for e in pack['entities'] if e['kind'] in ('person', 'organization') and len([x for x in re.split(r'[、与和]', e['name']) if x and any(q['name'].startswith(x) for q in persons)]) >= 2])
    add('problem', '以别人名字开头命名、又没有自己页面的人物', '多半是别人的简称（泷壶之于泷壶理后）', [f'{e["id"]} {e["name"]}' for e in persons if len(e['name']) >= 2 and pages and e['name'] not in pages
                                                                                    and any(q is not e and q['name'].startswith(e['name']) and len(q['name']) > len(e['name']) and not re.match(r'[（(的]', q['name'][len(e['name'])]) for q in persons)])
    events_of = collections.Counter(i for e in evs for i in e['entity_ids'])
    add('review', '不在任何事件里的人物', '只在描述里出现的人', [f'{e["id"]} {e["name"]}' for e in persons if not events_of[e['id']]])
    lead = (project.get('checks') or {}).get('leading') or []
    by_name = {}
    for e in pack['entities']:
        for n in [e['name'], *(e.get('aliases') or [])]:
            by_name.setdefault(n, e)
    lines = []
    for n in lead:
        e = by_name.get(n)
        if not e:
            lines.append(f'{n}：没有这个实体')
        elif e['kind'] == 'person' and not e.get('mind') and pages.get(e['name']):
            lines.append(f'{n} [{e["id"]}]：有页面却没有思考方式')
    add('problem', '主要人物缺失', '项目 checks.leading 列出的人物和组织（普通人没有常态是正常的，不算）', lines)
    # what the previous build had and this one lost (live: 风纪委员, 警备员 and 对马 went missing in a rebuild, and no other
    # check named them)
    last = read_json(project.p('out', 'entities-last.json'), None) if hasattr(project, 'p') else None
    if last is not None:
        now = {e['id'] for e in pack['entities']} | {n for e in pack['entities'] for n in [e['name'], *(e.get('aliases') or [])]}
        add('review', '上次构建有、这次没了的实体', '合并、改名或删掉的：看一眼是不是该没', [f'{i} {n}' for i, n in sorted(last.items()) if i not in now and n not in now])

    # events
    by_title = collections.defaultdict(list)
    for e in evs:
        by_title[(re.sub(r'（[^）]*）$', '', e['title']), date(_at(e)))].append(e['id'])
    add('problem', '同一天同标题的事件', '多半是同一件事记了两次', [f'{t}（{d}）：{", ".join(ids)}' for (t, d), ids in by_title.items() if len(ids) > 1])
    add('problem', 'HARD 事件缺少要求或结果', '', [f'{e["id"]} {e["title"]}' for e in evs if e['classification'] == 'HARD' and (not e.get('required_description') or not e.get('outcomes'))])
    add('review', '没有任何相关实体的事件', '背景历史可以如此；故事内的事件不该', [f'{e["id"]} {e["title"]}' for e in evs if not e['entity_ids']])
    return out, snaps


def section(project, pack):
    """The report's lines for the checks, and a one-line summary."""
    res, snaps = run(project, pack)
    probs = [(t, ls) for k, t, _, ls in res if k == 'problem' and ls]
    L = ['## 质量检查', '', '每次 `build` 自动跑（代码检查，不调用模型）。「问题」应为 0；「复核」是各步骤的判断结果，供人过目。', '',
         '| 检查 | 类别 | 数量 |', '|---|---|---|']
    for k, t, _, ls in res:
        L.append(f'| {t} | {"问题" if k == "problem" else "复核"} | {len(ls)} |')
    for k, t, what, ls in res:
        if ls:
            L += ['', f'### {t}（{len(ls)}）', ''] + ([what, ''] if what else []) + [f'- {x}' for x in ls[:150]] + ([f'- ……另有 {len(ls) - 150} 条'] if len(ls) > 150 else [])
    for d, rows in snaps.items():
        L += ['', f'### 组织一览：{d}（{len(rows)}）', ''] + [f'- {r}' for r in rows]
    summary = f'checks: {sum(len(ls) for _, ls in probs)} problems in {len(probs)} kinds' + (f' ({"; ".join(f"{t} {len(ls)}" for t, ls in probs)})' if probs else '')
    return L, summary
