"""Step: the free part of the timeline. Scans every unit for stated dates and writes a readable skeleton report."""
import collections

from . import dates
from .util import log, read_json, read_text, write_json, write_text


def corpus(project):
    c = read_json(project.p('corpus.json'))
    if not c:
        raise SystemExit('run "corpus" first')
    return c


def unit_text(project, unit):
    return read_text(project.p('text', unit['chapter'], f'{unit["id"]}.txt'), '')


def scan(project):
    c = corpus(project)
    out = {}
    for u in c['units']:
        found = dates.scan(unit_text(project, u))
        out[u['id']] = [{k: f[k] for k in ('kind', 'text', 'value', 'context')} for f in found]
    write_json(project.p('dates.json'), out)
    n = sum(len(v) for v in out.values())
    log(f'dates: {n} stated dates/durations in {sum(1 for v in out.values() if v)} of {len(out)} units')
    return out


def report(project):
    c = corpus(project)
    found = read_json(project.p('dates.json')) or scan(project)
    chars = c['characters']
    units = {u['id']: u for u in c['units']}
    lines = [f'# 骨架：{project.get("pack", {}).get("title", project.name)}', '',
             f'来源：{c["source"]["adapter"]} / {c["source"].get("region")}；年份对齐到 {c["source"].get("year_region") or "（不对齐）"}。', '']
    ym = c['source'].get('year_map') or {}
    if ym:
        lines += ['年份换算（本服 → 对齐服）：' + '，'.join(f'{a}→{b}' for a, b in sorted(ym.items())), '']
    total = sum(u['chars'] for u in c['units'])
    lines += [f'共 {len(c["chapters"])} 章，{len(c["units"])} 个单元（关卡），正文约 {total:,} 字。', '']
    for ch in c['chapters']:
        cu = [units[i] for i in ch['units']]
        lines += [f'## {ch["title"]}（{ch["id"]}）', '', f'- 当地年代（数据自带）：{ch["era"] or "无"}',
                  f'- 单元数：{len(cu)}；正文 {sum(u["chars"] for u in cu):,} 字', '']
        cast = collections.Counter()
        for u in cu:
            for k, n in u['speakers'].items():
                cast[k] += n
        top = '、'.join(f'{chars[k]["name"]}({n})' for k, n in cast.most_common(14))
        lines += [f'- 主要说话人（台词数）：{top}', '', '| # | 单元 | 地点 | 出场 | 字数 | 明示的日期/时长 |', '|---|---|---|---|---|---|']
        for u in cu:
            who = '、'.join(chars[k]['name'] for k in u['present'][:8])
            ds = '；'.join(f'{f["text"]}' for f in found.get(u['id'], []) if f['kind'] in ('date', 'bc_year', 'month_day', 'duration'))[:160]
            title = (u['sub'].strip() + ' ' if u['sub'].strip() else '') + u['title']
            lines.append(f'| {u["order"]} | {title} | {u["place"]} | {who} | {u["chars"]:,} | {ds} |')
        lines.append('')
    write_text(project.p('skeleton.md'), '\n'.join(lines))
    log(f'skeleton report: {project.p("skeleton.md")}')
