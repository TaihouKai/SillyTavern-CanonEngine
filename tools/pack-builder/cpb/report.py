"""Step: lint the pack with Canon Engine's own linter and write the authoring report."""
import collections
import json
import os
import subprocess

from .util import ROOT, log, read_json, warn, write_text


def lint(gcfg, pack_path):
    tool = gcfg.get('canon_lint') or ''
    tool = tool if os.path.isabs(tool) else os.path.normpath(os.path.join(ROOT, tool))
    if not os.path.exists(tool):
        warn(f'canon-lint not found at {tool} (set "canon_lint" in config.json); skipping lint')
        return None
    r = subprocess.run([gcfg.get('node', 'node'), tool, pack_path, '--json'], capture_output=True, text=True, encoding='utf8')
    try:
        out = json.loads(r.stdout)
        return out[0] if isinstance(out, list) else out
    except json.JSONDecodeError:
        warn('canon-lint output was not JSON: ' + (r.stdout or r.stderr)[:500])
        return None


def _msg(x):
    if isinstance(x, str):
        return x
    if isinstance(x, dict):
        return ' '.join(str(x.get(k)) for k in ('path', 'code', 'message') if x.get(k))
    return str(x)


def write(project, pack, rep, chrep, clock, pack_path, lint_res, ledger=None):
    ev = pack['events']
    cls = collections.Counter(e['classification'] for e in ev)
    L = [f'# 构建报告：{pack["title"]}', '',
         f'- 文件：`{pack_path}`',
         f'- {len(ev)} 个事件（HARD {cls["HARD"]} / SOFT {cls["SOFT"]} / FREE {cls["FREE"]}），{len(pack["entities"])} 个实体，{len(pack["edges"])} 条关联，{len(pack["arcs"])} 个章节弧',
         f'- 时间：{pack["calendar"]["origin_label"]}', '']
    if lint_res is not None:
        errs, warns = lint_res.get('errors', []), lint_res.get('warnings', [])
        L += [f'## canon-lint：{"通过" if lint_res.get("ok") else "有错误"}（错误 {len(errs)}，警告 {len(warns)}）', '']
        for x in errs[:60]:
            L.append(f'- 错误：{_msg(x)}')
        wk = collections.Counter(_msg(x).split(':')[0][:80] for x in warns)
        if warns:
            L += ['', '警告（前 60 条）：', '']
            for x in warns[:60]:
                L.append(f'- {_msg(x)}')
        L.append('')
    L += ['## 时间线（主时钟）', '', '| 章 | 开始 | 结束 | 锚点 | 排法 |', '|---|---|---|---|---|']
    titles = {a['id'][4:]: a['title'] for a in pack['arcs']}
    for r in chrep:
        a = r['anchor']
        L.append(f'| {titles.get(r["chapter"], r["chapter"])} | {r["start_label"]} | {r["end_label"]} | {a["start"] + "（" + a["basis"] + "）" if a else ""} | '
                 f'{r.get("note") or ""} |')
    L += ['', '## HARD 事件（不可变要求）', '']
    for e in ev:
        if e['classification'] == 'HARD':
            outs = '；'.join(f'{o["entity_id"]}.{o["predicate"]}={o["value"]}' for o in e['outcomes'])
            L.append(f'- **{e["title"]}**（{e["id"]}，{e["when"]["label"]}）：{e["required_description"]}  \n  结果：{outs}')
    names = {'downgraded': '改为 SOFT 的 HARD', 'unresolved': '未能对应到实体的名字（这些人物/变化没进包）', 'alias_collision': '别名冲突（未作别名）',
             'name_collision': '同名实体', 'link_dropped': '舍弃的关联', 'missing': '缺少的步骤结果', 'healed': '按“已恢复”处理的伤势（编辑推定）',
             'merged': '合并为同一实体的候选', 'old_unmapped': '原有事件中没有对应片段、原样保留的', 'old_folded': '一个片段合并了多个原有事件',
             'old_multi': '被多个篇章认领的原有事件', 'order': '按前提条件调整的时间'}
    for k, title in names.items():
        items = rep.items.get(k)
        if items:
            L += ['', f'## {title}（{len(items)}）', ''] + [f'- {x}' for x in items[:150]]
            if len(items) > 150:
                L.append(f'- ……另有 {len(items) - 150} 条')
    # open questions from the summaries
    qs = []
    for ch in project_chapters(project):
        for f in sorted(os.listdir(project.p('summaries', ch))) if os.path.isdir(project.p('summaries', ch)) else []:
            s = read_json(project.p('summaries', ch, f))
            for q in (s or {}).get('open_questions', []):
                qs.append(f'{s["unit"]} {s["title"]}：{q}')
    if qs:
        L += ['', f'## 摘要里的存疑之处（{len(qs)}）', ''] + [f'- {q}' for q in qs[:200]]
    if ledger:
        L += ['', f'模型用量（本次运行）：{ledger.summary()}']
    path = project.p('out', 'report.md')
    write_text(path, '\n'.join(L) + '\n')
    log(f'report: {path}')
    return path


def project_chapters(project):
    c = read_json(project.p('corpus.json'), {}) or {}
    return [ch['id'] for ch in c.get('chapters', [])]
