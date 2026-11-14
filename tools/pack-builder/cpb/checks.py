"""Quality checks of a built pack (code, no model), run by every `build` and written into the report: each kind of
problem found in packs so far, checked over the whole pack, so it shows before the pack is handed over (user: "这个
history pack 永远小问题不断"). A "problem" should be none; a "review" list is what the steps decided and a person
may want to look over. Project options (`checks`): `leading`, names of the characters who must be there with their
常态 and 思考方式; `dates`, days (YYYY-MM-DD) to show the organizations at."""
import collections
import datetime as dt
import os
import re

from .changes import DISSOLVED, NOT_WHOLE
from .util import ROOT, read_json

DAY = 1440
# a person's status that is a moment's (knocked out, fighting, on the way): one hanging for weeks is a leftover
MOMENT = re.compile(r'被击倒|昏迷|昏倒|晕倒|正在|中$|对峙|交战|逃跑|追击|战斗|待命|赶往|前往')


def _at(e):
    w = e['when']['earliest']
    return w['day'] * DAY + w['minute']


def _f(x):
    return x.get('fact') or x


class _Replay:
    """The pack's facts as the events change them, in time order."""

    def __init__(self, pack, end_of=None):
        self.facts = {(f['fact']['entity_id'], f['fact']['predicate']): f['fact']['value'] for f in pack['initial_state']['facts']}
        self.ends = {}
        self.end_of = end_of or (lambda x, at: float('inf'))

    def apply(self, x, at=None):
        f, op = _f(x), x.get('op', 'set')
        k = (f.get('entity_id'), f.get('predicate'))
        v = f.get('value')
        self.ends.pop(k, None)
        if op == 'set':
            self.facts[k] = v
            if at is not None:
                self.ends[k] = self.end_of(x, at)
        elif op == 'unset':
            self.facts.pop(k, None)
        elif op == 'add':
            self.facts[k] = sorted(set(self.facts.get(k) or []) | set(v)) if isinstance(v, list) else v
        elif op == 'remove':
            if isinstance(v, list):
                self.facts[k] = [m for m in self.facts.get(k) or [] if m not in v]
            elif self.facts.get(k) == v:
                self.facts.pop(k, None)

    def get(self, ent, pred, at=None):
        """The fact as it stands; at a time (`at`), none once its own end has passed (an effect's "until")."""
        if at is not None and self.ends.get((ent, pred), float('inf')) < at:
            return None
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
    ends_at = {e['id']: e['when']['latest']['day'] * DAY + e['when']['latest']['minute'] for e in pack['events'] if e['when'].get('latest')}

    def _end(x, at):
        u = x.get('until')
        if isinstance(u, dict) and 'minutes' in u:
            return at + u['minutes']
        if isinstance(u, dict) and 'event' in u:
            return ends_at.get(u['event'], float('inf'))
        return float('inf')
    rp = _Replay(pack, _end)
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
                    # a status holds until the next one, or until its own end ("until") when that comes first
                    days = (min(_at(e), prev[2]) - prev[1]) // DAY
                    if E.get(ent, {}).get('kind') == 'person' and days > 21 and MOMENT.search(str(prev[0])):
                        person_long.append(f'{N(ent)}：「{prev[0]}」从 {date(prev[1])} 起挂了 {days} 天')
                    elif E.get(ent, {}).get('kind') not in (None, 'person') and days > 60:
                        org_long.append(f'{N(ent)}：「{prev[0]}」从 {date(prev[1])} 起挂了 {days} 天')
                status_at[ent] = (f.get('value'), _at(e), _end(x, _at(e)))
            if pred == 'members' and x.get('op') == 'add' and _at(e) < seen.get(ent, _at(e)):
                early.append(f'{N(ent)}：{e["id"]} 在它出场之前加入成员')
            rp.apply(x, _at(e))
        for o in pack['entities']:
            st = rp.get(o['id'], 'status', _at(e))
            if o['kind'] == 'organization' and DISSOLVED.search(str(st or '')) and not NOT_WHOLE.search(str(st or '')) and rp.get(o['id'], 'members'):
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

    # the version: a pack that differs from the one released (project pack.release) has a higher version — set by
    # hand in pack.pack_version (major: a format an older engine does not read, or a change of meaning; minor: content)
    rel = (project.get('pack') or {}).get('release')
    released = read_json(os.path.join(ROOT, rel), None) if rel else None
    if released:
        ver = lambda p: tuple(int(x) for x in re.findall(r'\d+', str(p.get('pack_version', '0')))[:3])  # noqa: E731
        strip = lambda p: {k: v for k, v in p.items() if k != 'pack_version'}  # noqa: E731
        bad = []
        if ver(pack) < ver(released):
            bad.append(f'版本 {pack.get("pack_version")} 低于已发布的 {released.get("pack_version")}')
        elif ver(pack) == ver(released) and strip(pack) != strip(released):
            bad.append(f'内容和已发布的 {released.get("pack_version")}（{rel}）不同，版本号却没变：提高 pack.pack_version')
        add('problem', '历史包变了，版本号没变', '游戏里换包、看版本都靠它', bad)
    return out, snaps


def section(project, pack, lint_res=None):
    """The report's lines for the checks, and a one-line summary."""
    res, snaps = run(project, pack)
    from . import review as reviews
    rv = reviews.load(project) if hasattr(project, 'path') else {'times': {}, 'warnings': {}}
    origin = dt.date.fromisoformat((project.get('timeline') or {}).get('origin_date', '2000-01-01'))
    res.append(('problem', '时间和文中不符', '窗口的开始、日期或时段与事件自己的文中时间对不上（核对文件里写明理由的除外）',
                source_mismatches(pack, origin, {k: v.get('note', '') for k, v in rv['times'].items()})))
    notes = {k: v.get('note', '') for k, v in rv['times'].items()}
    res.append(('review', '人定时间与文中不同', '核对文件里写明了理由；理由要说得通', source_mismatches(pack, origin, notes, noted=True)))
    res.append(('problem', '窗口与先后关系不符', '后一件事不能比前一件开始得早，前一件不能比后一件结束得晚', order_mismatches(pack)))
    res.append(('problem', '没有出处的确切时间', '记为确切时间（minute/range）的，文中必须有时刻，或核对文件里写明来由', invented_precision(pack, notes)))
    res.append(('problem', '疑似同一件事记了两次', '时间相近、人物相同、标题或经过相似；在核对文件 duplicates 里决定：同一件（合并）或不是', undecided_duplicates(pack, rv.get('duplicates') or {})))
    from . import corrections
    res += text_problems(pack, corrections.read_misses(project))
    res.append(('problem', 'canon-lint 警告未处理', '每条警告都要改掉，或在核对文件 warnings 里写明为什么接受', lint_findings(lint_res, rv.get('warnings') or {})))
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


# ---- what the pack says against what the sources say (code, every build) ------------------------------------------
# live 2026-11-14: a whole-pack review accepted 1421 windows "as the sources give them" while 40 of them did not start at
# the time the sources state (17:00 placed at 17:01, 19:00 at 19:10) and 14 overlapped the events they enable — the
# lint said so in warnings nobody acted on. A principle without a check is a wish: each kind is compared here.

def _stated(e):
    lab = e['when'].get('label') or ''
    return lab.split('文中：', 1)[1] if '文中：' in lab else ''


def source_mismatches(pack, origin, notes, noted=False):
    """[line] for every event whose window does not agree with the time its own source text states: the clock time it
    starts at, the day it is on, the part of the day it is in. A window a person set with a note saying why (the
    review file: a time zone converted, a span read) is theirs and no problem; one taken over "as the sources give
    it" is. noted=True lists the person's ones instead, with their reason, to be looked over: a note silences the
    check, so a note written without reading the source would hide a wrong time (live 2026-11-14: 1295 placed times
    under one note, 7 of them against their source)."""
    from . import timeline
    out = []
    for e in pack['events']:
        note = notes.get(e['id']) or ''
        if (bool(note) and not note.startswith('核对')) != noted:
            continue
        n0 = len(out)
        st = _stated(e)
        if not st or 'UTC' in st or e.get('frame_id'):
            continue
        w = e['when']
        lo = w['earliest']['day'] * DAY + w['earliest']['minute']
        hi = w['latest']['day'] * DAY + w['latest']['minute']
        p = w['precision']
        clock = timeline.time_of(st)
        if clock is not None and p in ('minute', 'range', 'part_of_day', 'day'):
            if p not in ('minute', 'range'):
                out.append(f'{e["id"]} {e["title"]}：文中有时刻（{st[:30]}），时间却只记到{ {"part_of_day": "时段", "day": "天"}[p] }')
            elif lo % DAY != clock:
                out.append(f'{e["id"]} {e["title"]}：文中 {st[:30]}，开始却是 {lo % DAY // 60:02d}:{lo % 60:02d}')
        part = timeline.part_of({'stated': st}) if clock is None else None
        if part in timeline.PART_SPAN and p in ('part_of_day', 'range', 'minute'):
            a, z = timeline.PART_SPAN[part]
            d = lo // DAY - (1 if part in ('night', 'late') and lo % DAY < 6 * 60 else 0)
            if not (d * DAY + a <= lo and hi <= d * DAY + z):
                out.append(f'{e["id"]} {e["title"]}：文中说{timeline.PART_ZH[part]}（{st[:30]}），窗口不在这个时段里')
        m = re.search(r'(?<![0-9年])([0-9]{1,2})月([0-9]{1,2})日', st)
        if m and not re.search(r'[0-9]+日\s*[前后]|之前|之后|以前|以后', st[m.end():m.end() + 3]) and p not in ('month', 'year'):
            mo, dd = int(m.group(1)), int(m.group(2))
            day_of = lambda t: (origin + dt.timedelta(days=t // DAY))  # noqa: E731
            ds = {(x.month, x.day) for x in (day_of(t) for t in range(lo - lo % DAY, hi + 1, DAY))}
            if (mo, dd) not in ds:
                out.append(f'{e["id"]} {e["title"]}：文中 {mo}月{dd}日，窗口却在 {day_of(lo).isoformat()}' + (f' 至 {day_of(hi).isoformat()}' if hi // DAY != lo // DAY else ''))
        if noted:
            out[n0:] = [f'{x}（理由：{note}）' for x in out[n0:]]
    return out


def lint_findings(lint_res, accepted):
    """Every canon-lint warning is a problem until the review file accepts it with a reason (`warnings`: message ->
    why): a warning is how the lint reports data that is likely wrong, and a pack is not handed over with it unread."""
    out = []
    for x in (lint_res or {}).get('warnings', []):
        msg = f'{x.get("path", "")} {x.get("message", "")}'.strip()
        if not any(k in msg for k in accepted):
            out.append(msg[:240])
    return out


def order_mismatches(pack):
    """[line] for every enables / precedes link whose windows do not hold the order: the later event may begin before
    the earlier one could (its window opens first), the earlier may end after the later one must have (its window
    closes last), or the later one is over before the earlier begins. The builder narrows windows by the order
    (assemble.narrow_by_order); a link left like this is a window or a link that is wrong."""
    by_id = {e['id']: e for e in pack['events']}
    tick = lambda w: w['day'] * DAY + w['minute']  # noqa: E731
    out = []
    for ed in pack.get('edges') or []:
        if ed.get('relation') not in ('enables', 'precedes'):
            continue
        a, z = by_id.get(ed['from']), by_id.get(ed['to'])
        if not a or not z or not a['when'].get('earliest') or not z['when'].get('earliest'):
            continue
        alo, ahi, zlo, zhi = tick(a['when']['earliest']), tick(a['when']['latest']), tick(z['when']['earliest']), tick(z['when']['latest'])
        why = '后一件在前一件开始之前就结束了' if zhi < alo else '后一件的窗口比前一件开得早' if zlo < alo else '前一件的窗口比后一件关得晚' if ahi > zhi else ''
        if why:
            out.append(f'{a["id"]} {a["title"]} → {z["id"]} {z["title"]}（{ed["relation"]}）：{why}')
    return out


def invented_precision(pack, notes):
    """[line] for every event given a known time (minute / range) that its source text does not state as a clock time
    and no person explained in the review file: a time no one stated is "some time then", never an exact one."""
    from . import timeline
    out = []
    for e in pack['events']:
        if e['when'].get('precision') not in ('minute', 'range') or e.get('frame_id'):
            continue
        note = notes.get(e['id']) or ''
        if note and not note.startswith('核对'):
            continue
        st = _stated(e)
        if timeline.time_of(st) is None and not re.search(r'UTC', st):
            out.append(f'{e["id"]} {e["title"]}：记为确切时间，文中却没有时刻（{st[:30] or "无文中时间"}）')
    return out


# ---- the same event told twice (code, every build) ------------------------------------------------------------------
# live 2026-11-14: once every event had its own time, pairs of events of one story turned up at the very same minute —
# 「药味久子的下场」/「药味久子被击碎」, 「上条与托尔的最后一战」/「上条当麻与托尔的决战」: a chapter told again in a
# later part of its story (or in another story) became a second event, and the GM saw it happen twice. Pairs close in
# time, with the same people and alike in title or course, are listed until a person decides them (review file
# `duplicates`: the same → merged into the one kept; or not the same).

def _grams(s):
    s = re.sub(r'[「」『』，。、·（）()\s]|vs\.?', '', s or '')
    return {s[i:i + 2] for i in range(len(s) - 1)} or ({s} if s else set())


def _course(e):
    s = e.get('summary')
    return s.get('course', '') if isinstance(s, dict) else str(s or '')


def duplicate_score(a, b):
    """How alike two events are: who is in them, the title, the course (0..1)."""
    ents = lambda e: set(e.get('entity_ids') or []) | {c['entity_id'] for c in e.get('cast') or []}  # noqa: E731
    ea, eb = ents(a), ents(b)
    if not ea or not eb:
        return 0.0
    sim = lambda x, y: len(x & y) / max(1, min(len(x), len(y)))  # noqa: E731
    return 0.4 * sim(ea, eb) + 0.3 * sim(_grams(a['title']), _grams(b['title'])) + 0.3 * sim(_grams(_course(a)), _grams(_course(b)))


DUPLICATE_AT = 0.45
DUPLICATE_GAP = 12 * 60


def duplicate_candidates(pack, at=DUPLICATE_AT):
    """[(score, a, b)] pairs of events within half a day of each other that are alike enough to be one. Only events of
    different parts (chunks) are compared: one part tells its beats once, the neighbours in it share their people by
    nature; a retelling is in another part or another story."""
    T = lambda w: w['day'] * DAY + w['minute']  # noqa: E731
    evs = sorted(pack['events'], key=lambda e: T(e['when']['earliest']))
    part = lambda e: e['id'].rsplit('.', 1)[0]  # noqa: E731
    out = []
    for i, a in enumerate(evs):
        a_hi = T(a['when'].get('latest') or a['when']['earliest'])
        for b in evs[i + 1:]:
            if T(b['when']['earliest']) - a_hi > DUPLICATE_GAP:
                break
            if part(a) == part(b):
                continue
            s = duplicate_score(a, b)
            if s >= at:
                out.append((s, *sorted((a['id'], b['id']))))
    return sorted(out, reverse=True)


def duplicate_key(a, b):
    return '|'.join(sorted((a, b)))


def undecided_duplicates(pack, decided):
    titles = {e['id']: e['title'] for e in pack['events']}
    return [f'{a} {titles[a]} ⇄ {b} {titles[b]}（相似 {s:.2f}）' for s, a, b in duplicate_candidates(pack) if duplicate_key(a, b) not in decided]


# ---- what a whole-pack read found (2026-11-14), each kind a check -------------------------------------------------
# A person read the pack event by event: states on the wrong kind of entity (members on a cat, holder on a person),
# a revival of someone never dead, an end before its own beginning, research notes and English words in the text, texts
# cut off mid-sentence, names with half a quote mark, empty descriptions. Each is listed here until it is fixed in the
# review file (cpb/corrections.py) — a principle without a check is a wish.

RESEARCH = re.compile(r'open_questions|维基|[Ww]iki|英文资料|中文资料|资料(?:里|中)?(?:写|称|说)|考据|可能指|待核|需(?:要)?[^，。；]{0,10}核对|与英文|原文为英文')
# words a text may keep in Latin letters: terms of the setting written so (the pack's own names add theirs), units and
# abbreviations
LATIN_OK = {'AIM', 'Level', 'LEVEL', 'UFO', 'DNA', 'GPS', 'LED', 'CEO', 'SNS', 'VR', 'UTC', 'ID', 'IC', 'USB', 'PDA', 'AED',
            'MAR', 'RV', 'SOS', 'BREAK', 'Five', 'Over', 'FIVE', 'Modelcase', 'ModelCase', 'OS', 'RAILGUN', 'MELTDOWNER',
            'ACCELERATOR', 'MENTAL', 'OUT', 'Out', 'Sider', 'Secret', 'SECRET', 'Hula', 'Hoop', 'LAShTAL', 'HsAFH',
            'Licht', 'Liebe', 'Leben', 'PM', 'AM', 'App', 'KM', 'km', 'kg', 'cm', 'mm', 'MSR', 'HMLa', 'RPG',
            'LSS', 'STUDY', 'ITEM', 'SCHOOL', 'GROUP', 'BLOCK', 'MEMBER', 'DA', 'BLAU', 'Green', 'Mart', 'Seventh', 'Mist',
            'Fifteen', 'Bells', 'Sunny', 'Watcher', 'Human', 'DIY', 'Au', 'GHz', 'MHz', 'CD', 'DVD', 'TV', 'PC', 'AI',
            # the setting's own terms, written so in the translations too
            'SYSTEM', 'UAV', 'SDI', 'HsMLR', 'HsAAT', 'HsB', 'HsF', 'HsPS', 'Angelica', 'Gekota', 'fps', 'ATM', 'Ars', 'Magna',
            'Fortis', 'Innocentius', 'Keter', 'RSPK', 'Capacity', 'Down', 'Limen', 'Honos', 'Auribus', 'oculi',
            'fideliores', 'sunt', 'Shadow', 'Metal', 'APP', 'Ideal', 'Testament', 'telesma', 'Persona', 'Superiore', 'Dio',
            'Friulian', 'VIP', 'CIA', 'ANGEL', 'Nu-AD', 'VTOL', 'Ex', 'Voto', 'Welcome', 'back', 'hero', 'cp', 'ICU',
            'Clairpharm', 'NPC', 'Agitate', 'Halation', 'Game', "Designers'", 'Gel', 'DEADLOCK', 'Outsider', 'Model',
            'case', 'AAA', 'P-Phone', 'Dianoid', 'Anti-Art', 'Attachment', 'Sphere', 'Live', 'House', 'La', 'skiðblaðnir',
            'Counter', 'Stop'}
TREATED_AS_INJURY = re.compile(r'(?:已|经[^，。；]{0,10})(?:包扎|缝合|处理|治疗|稳定)|得到(?:处理|治疗|救治)|无碍|可正常|靠[^，。；]{0,8}恢复')
VACUOUS = re.compile(r'^(?:（无描述）|故事中(?:登场|出现)的(?:人物|角色)|在故事中登场的(?:人物|角色))|(?:故事中登场的|在[^，。]{0,12}(?:章节|篇章|篇)中登场的)(?:人物|角色)。?$'
                     r'|与相关事件有(?:关|所牵连)。?$|^与[^，。]{1,16}相关的(?:人物|角色|英国人物)。?$|以[^，。]{1,10}为名的组织。?$|^名为[^，。]{1,12}的(?:场所|地点)|^故事中的一处(?:地点|场所)')
HALF_QUOTE = re.compile(r'^[^「]*」|「[^」]*$|^[^“]*”|“[^”]*$')
CUT_OFF = re.compile(r'[；，、：]$')
DANGLING = re.compile(r'^(?:同时(?:因为|也|又|，)|则|而且|并且|另外|但)')
NATURE_FIELDS = ('habits', 'uses', 'others', 'limits')


def _texts_of_event(e):
    s = e.get('summary') or {}
    out = [('标题', e.get('title') or '')] + [(f, s.get(f) or '') for f in ('background', 'trigger', 'course', 'result', 'aftermath', 'impact', 'note')]
    out += [('动机', m.get('motive') or '') for m in s.get('motives') or []]
    out += [('要求', e.get('required_description') or ''), ('hook', (e.get('participation') or {}).get('hook') or ''), ('时间', (e.get('when') or {}).get('label') or '')]
    out += [('角色', c.get('role') or '') for c in e.get('cast') or []]
    out += [('作者注', e.get('author_note') or '')]
    out += [(f'效果 {(_f(x)).get("predicate")}', (_f(x)).get('value')) for x in e.get('canonical_effects') or []
            if isinstance((_f(x)).get('value'), str) and (_f(x)).get('predicate') not in ('members', 'leader', 'holder', 'ally')]
    return [(k, t) for k, t in out if t]


def _texts_of_entity(x):
    out = [('描述', x.get('static_description') or '')]
    out += [(f'思考方式.{k}', v) for k, v in (x.get('mind') or {}).items() if isinstance(v, str) and k not in ('deliberation', 'sharpness')]
    for v in x.get('nature') or []:
        out += [(f'常态({v.get("from_event") or "开局"}).{k}', v.get(k) or '') for k in ('why', *NATURE_FIELDS)]
    return [(k, t) for k, t in out if t]


def latin_words(text, ok):
    """Words in Latin letters a Chinese text should not have (inside 「」 『』 quotes and 【】 a term may keep its own
    spelling)."""
    bare = re.sub(r'「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|【[^】]*】|[a-z][a-z0-9-]*\.\d{3}\.b\d+', '', text)
    return [w for w in re.findall(r"[A-Za-z][A-Za-z']*(?:-[A-Za-z]+)*", bare) if len(w) >= 3 and w not in ok and w.upper() not in ok]


def text_problems(pack, misses=()):
    """[(kind, title, what, lines)] of the whole-pack read's kinds."""
    E = {e['id']: e for e in pack['entities']}
    N = lambda i: E.get(i, {}).get('name', i)  # noqa: E731
    kind = lambda i: E.get(i, {}).get('kind')  # noqa: E731
    evs = sorted(pack['events'], key=_at)
    at = {e['id']: _at(e) for e in evs}
    ok = set(LATIN_OK)
    for x in pack['entities']:
        for n in [x['name'], *(x.get('aliases') or [])]:
            ok.update(re.findall(r"[A-Za-z][A-Za-z']*(?:-[A-Za-z]+)*", n or ''))
    out = []
    wrong_kind, revive, early_end, treated, dead_join = [], [], [], [], []
    dead = {}
    for f in pack['initial_state']['facts']:
        if f['fact']['predicate'] == 'alive' and f['fact']['value'] is False:
            dead[f['fact']['entity_id']] = '开局'
    seen = set()
    for e in evs:
        where = f'{e["id"]} {e["title"]}'
        # one coming back in this event is alive when they rejoin in it; one born in it is no revival
        for x in e['canonical_effects']:
            f = _f(x)
            if f.get('predicate') == 'alive' and x.get('op', 'set') == 'set' and f.get('value') is True:
                ent = f.get('entity_id')
                if not dead.get(ent) and ent in seen:
                    revive.append(f'{where}：{N(ent)}.alive=True，此前并没有死')
                dead[ent] = None
        seen.update(e.get('entity_ids') or [])
        for x in e['canonical_effects']:
            f, op = _f(x), x.get('op', 'set')
            ent, pred, v = f.get('entity_id'), f.get('predicate'), f.get('value')
            if pred in ('members', 'leader') and kind(ent) != 'organization':
                wrong_kind.append(f'{where}：{N(ent)}（{kind(ent)}）.{pred}——成员与首领只属于组织')
            if pred == 'members' and op != 'set':
                for m in v if isinstance(v, list) else [v]:
                    if kind(m) not in ('person', 'organization'):
                        wrong_kind.append(f'{where}：{N(ent)}.members 里的 {N(m)} 是 {kind(m)}')
                    if op == 'add' and dead.get(m):
                        dead_join.append(f'{where}：{N(m)} 已死（{dead[m]}），却加入 {N(ent)}')
            if pred == 'leader' and isinstance(v, str) and kind(v) != 'person':
                wrong_kind.append(f'{where}：{N(ent)}.leader 是 {N(v)}（{kind(v)}）')
            if pred == 'holder' and (kind(ent) == 'person' or v == ent):
                wrong_kind.append(f'{where}：{N(ent)}.holder={N(v)}——持有者写在物上，且不能是自己')
            if pred in ('alive', 'injury') and kind(ent) != 'person':
                wrong_kind.append(f'{where}：{N(ent)}（{kind(ent)}）.{pred}——只属于人物')
            if pred == 'condition' and kind(ent) == 'person':
                wrong_kind.append(f'{where}：{N(ent)}.condition——人物的状态不是物的完好与否')
            if pred == 'injury' and op == 'set' and TREATED_AS_INJURY.search(str(v or '')):
                treated.append(f'{where}：{N(ent)}.injury=「{v}」')
            u = x.get('until')
            if isinstance(u, dict) and u.get('event') in at and at[u['event']] <= at[e['id']]:
                early_end.append(f'{where}：{N(ent)}.{pred} 结束于 {u["event"]}，它不在本事件之后')
        # the event's deaths count after its own joins (one dying in it was alive when it began)
        for x in e['canonical_effects']:
            f = _f(x)
            if f.get('predicate') == 'alive' and x.get('op', 'set') == 'set' and f.get('value') is False:
                dead[f.get('entity_id')] = e['id']
    out.append(('problem', '谓词与实体种类不符', '成员、首领只在组织上；持有者在物上；生死与伤只在人物上；物的完好与否不写在人身上', wrong_kind))
    out.append(('problem', '没死过的人「复活」', 'alive=True 只用于此前死去、后来复生的人', revive))
    out.append(('problem', '死人加入组织', '加入时此人已死（开局名单或事件里的加入）', dead_join))
    out.append(('problem', '状态的结束事件不在它之后', 'until 指向的事件必须晚于写下状态的事件', early_end))
    out.append(('problem', '把治疗写成了伤', '「已包扎」「经…处理」「已稳定」是旧伤的结束或伤后情况，不是新的伤', treated))
    research, latin, cut = [], [], []

    def scan(label, t):
        m = RESEARCH.search(t)
        if m:
            research.append(f'{label}：{m.group(0)}——{t[:60]}')
        w = latin_words(t, ok)
        if w:
            latin.append(f'{label}：{"、".join(dict.fromkeys(w))}——{t[:50]}')
    for e in evs:
        for k, t in _texts_of_event(e):
            scan(f'{e["id"]} {k}', t)
    for a in pack.get('arcs') or []:
        for k in ('title', 'summary'):
            scan(f'{a["id"]} {k}', a.get(k) or '')
    for f in pack['initial_state']['facts']:
        scan(f'开局 {f["fact"]["entity_id"]}.{f["fact"]["predicate"]}', f.get('note') or '')
    for x in pack['entities']:
        texts = _texts_of_entity(x)
        for k, t in texts:
            scan(f'{x["id"]} {x["name"]} {k}', t)
        for k, t in texts:
            if k != '描述' and (CUT_OFF.search(t.strip()) or DANGLING.match(t.strip())):
                cut.append(f'{x["id"]} {x["name"]} {k}：…{t.strip()[-24:]}')
        for v in x.get('nature') or []:
            filled = [k for k in NATURE_FIELDS if (v.get(k) or '').strip()]
            empty = [k for k in NATURE_FIELDS if not (v.get(k) or '').strip()]
            if filled and empty:
                cut.append(f'{x["id"]} {x["name"]} 常态({v.get("from_event") or "开局"})：{"、".join(empty)} 是空的')
    out.append(('problem', '正文里有研究过程的话', '待核对、见维基、考据……是做包时的笔记，GM 读到会当成剧情；改成定论或删去', research))
    out.append(('problem', '中文正文里夹着英文词', '英文资料的原词没译出来；设定里本就写作英文的名称（实体名里有的）不算', latin))
    out.append(('problem', '常态、思考方式的文字残缺', '空着的一项、以「；」收尾的半句、缺了前半句（「同时…」「则…」）', cut))
    half, vac = [], []
    for x in pack['entities']:
        for n in [x['name'], *(x.get('aliases') or [])]:
            if n and HALF_QUOTE.search(n):
                half.append(f'{x["id"]}：「{n}」')
        d = (x.get('static_description') or '').strip()
        if not d or VACUOUS.search(d):
            vac.append(f'{x["id"]} {x["name"]}：{d or "（空）"}')
    out.append(('problem', '名字、别名里的引号不成对', '「GROUP」联络人 一类：名字被从引号中间截断了', half))
    out.append(('problem', '空洞的实体描述', '「故事中登场的人物」「与相关事件有关」说不出是谁；按事件写一句', vac))
    out.append(('problem', '核对文件里的更正没有对上', '改的文字、事件或实体已经不在了：删掉这条，或改成对得上的', list(misses)))
    return out
