"""Source adapter: story arcs described by MediaWiki wikis (fan wikis), one chapter per arc.

The project file lists the arcs (id, title, dates) and, for each, the pages that describe it:
- huiji: pages of a Chinese wiki (the arc's own page; its names and dates are the pack's);
- kaoju: sections of date-research pages ("page#section"), the most precise dates;
- fandom: pages of an English wiki (the arc's page, often more detailed);
- chron: headings of the "Chronology" sections of the English wiki's character pages ([series or "*", heading]); each
  character's account of the arc. Used when the arc's own page is thin (a page shorter than
  wiki.chronology_when_page_below x the accounts), since the accounts then hold what the page leaves out;
- fandom_volumes: volume pages whose chapter pages' "Synopsis" sections are added.
Lines of the Chinese wiki's timeline pages that name the arc are added too.

Downloads go through a headless browser (cpb/tools/wiki_fetch.cjs): these wikis refuse plain HTTP clients.
"""
import os
import re
import subprocess

from ..util import ROOT, log, read_json, write_json, write_text, warn

SPLIT = '\n——场景切换——\n'


# ---------------------------------------------------------------------------------------------------------------
# fetch

def fetch(project, refresh=False):
    cfg = project['wiki']
    for job in cfg.get('fetch', []):
        out = os.path.join(ROOT, job['out'])
        if os.path.exists(out) and not refresh:
            continue
        path = project.p('raw', f'job-{os.path.basename(job["out"])}')
        write_json(path, dict(job, out=out))
        log(f'downloading {job["site"]} (headless browser)')
        subprocess.run(['node', os.path.join(ROOT, 'cpb', 'tools', 'wiki_fetch.cjs'), path], check=True)
    for k in ('fandom', 'huiji'):
        if not os.path.exists(os.path.join(ROOT, cfg[k])):
            raise SystemExit(f'missing {cfg[k]}: add a wiki.fetch job for it or download it')


# ---------------------------------------------------------------------------------------------------------------
# wikitext -> plain text

TEMPLATE_KEEP_FIRST = {'rl', 'rs', 'lj', 'ruby', 'nihongo', '小灰', 'dcp', 'w', 'lang', 'nowrap', 'tooltip', 'sic', 'small', 'big', 'color',
                       '黑幕', 'heimu', 'pinyin', 'abbr', 'ja', 'lang-ja', 'rp', 'trackx', 'unbulleted list'}


def _template(body):
    parts = body.split('|')
    name = parts[0].strip().lower()
    args = [p.strip() for p in parts[1:] if '=' not in p.split('|')[0] or p.strip().startswith('http')]
    if name == '学区' and args:
        return f'第{args[0]}学区'
    if name == '等级' and args:
        return f'Level {args[0]}'
    if name in TEMPLATE_KEEP_FIRST:
        return args[0] if args else ''
    if name.startswith('dcp') and args:
        return args[0]
    if name in ('qvl', 'qcl') and len(args) >= 2:
        return ''
    return ''


def clean(text):
    """Readable text from wikitext: templates, references, comments, files and markup removed; links kept as text."""
    t = text or ''
    t = re.sub(r'<!--.*?-->', '', t, flags=re.S)
    t = re.sub(r'<ref[^>/]*/>', '', t)
    t = re.sub(r'<ref[^>]*>.*?</ref>', '', t, flags=re.S)
    t = re.sub(r'<gallery[^>]*>.*?</gallery>', '', t, flags=re.S | re.I)
    t = re.sub(r'<references[^>]*/?>', '', t)
    for _ in range(8):
        n = re.sub(r'\{\{([^{}]*)\}\}', lambda m: _template(m.group(1)), t)
        if n == t:
            break
        t = n
    t = re.sub(r'\{\|.*?\|\}', lambda m: re.sub(r'^\s*[|!]-?', '', m.group(0).replace('||', '；').replace('!!', '；'), flags=re.M), t, flags=re.S)
    t = re.sub(r'\[\[(?:File|Image|文件|图像|Category|分类)\s*:[^\[\]]*(?:\[\[[^\]]*\]\][^\[\]]*)*\]\]', '', t, flags=re.I)
    t = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r'\[https?://\S+\s+([^\]]*)\]', r'\1', t)
    t = re.sub(r"'{2,}", '', t)
    t = re.sub(r'<br\s*/?>', '\n', t, flags=re.I)
    t = re.sub(r'</?(?:span|div|font|small|big|center|u|s|i|b|sup|sub|blockquote|poem|p)[^>]*>', '', t, flags=re.I)
    t = re.sub(r'^[ 	]*(=+)[ 	]*(.*?)[ 	]*=+[ 	]*$', lambda m: '#' * len(m.group(1)) + ' ' + m.group(2), t, flags=re.M)
    t = re.sub(r'^\*+\s*', '- ', t, flags=re.M)
    t = re.sub(r'^:+\s*', '', t, flags=re.M)
    t = re.sub(r'[ \t]+\n', '\n', t)
    t = re.sub(r'\n{3,}', '\n\n', t)
    return t.strip()


DROP_SECTIONS = {'gallery', 'trivia', 'references', 'navigation', 'external links', 'quotes', 'adapted to', 'notes', 'cultural references',
                 'referbacks', 'unanswered questions', 'characters', 'abilities', 'locations', 'new characters', 'new abilities', 'new locations',
                 '注释', '参考资料', '图集', '外文出版', '名词索引', '人物角色', '名词术语', '地点区域', '相关条目'}


def sections(text, level=2):
    """[(heading, body)] of a page's level-n sections; the text before the first heading has heading ''."""
    out, head, buf = [], '', []
    rx = re.compile(r'^(={%d})\s*([^=].*?)\s*\1\s*$' % level)
    for line in text.split('\n'):
        m = rx.match(line)
        if m:
            out.append((head, '\n'.join(buf)))
            head, buf = m.group(2), []
        else:
            buf.append(line)
    out.append((head, '\n'.join(buf)))
    return out


def drop_templates(text, prefix):
    """The text without the templates whose name starts with prefix (braces balanced, so nested templates go too)."""
    out, i, low = [], 0, text.lower()
    while True:
        j = low.find('{{' + prefix, i)
        if j < 0:
            out.append(text[i:])
            return ''.join(out)
        out.append(text[i:j])
        depth, k = 0, j
        while k < len(text):
            if text.startswith('{{', k):
                depth += 1
                k += 2
            elif text.startswith('}}', k):
                depth -= 1
                k += 2
                if depth == 0:
                    break
            else:
                k += 1
        i = k


def strip_page(text):
    """A page without its infobox and its non-story sections."""
    t = drop_templates(text or '', 'infobox')
    keep = []
    for head, body in sections(t, 2):
        if head.strip().lower() in DROP_SECTIONS:
            continue
        sub = []
        for h3, b3 in sections(body, 3):
            if h3.strip().lower() in DROP_SECTIONS:
                continue
            sub.append((f'=== {h3} ===\n' if h3 else '') + b3)
        keep.append((f'== {head} ==\n' if head else '') + '\n'.join(sub))
    return '\n'.join(keep)


def chronologies(fandom):
    """{(series, heading): [(character, text)]} from the "Chronology" sections of the English wiki's pages."""
    out = {}
    for title, v in fandom.items():
        if not v or 'Chronology' not in v:
            continue
        m = re.search(r'\n==\s*Chronology\s*==\s*\n(.*?)(?=\n==[^=]|\Z)', v, re.S)
        if not m:
            continue
        series = ''
        parts = re.split(r'\n(={3,4})\s*([^=\n]+?)\s*={3,4}\s*\n', '\n' + m.group(1))
        for i in range(1, len(parts), 3):
            lvl, name, body = parts[i], parts[i + 1].strip(), parts[i + 2]
            if lvl == '===':
                series = name
                if not name.endswith('Arc'):
                    continue
            out.setdefault((series, name), []).append((title, body))
    return out


def kaoju_section(huiji, ref):
    page, _, sec = ref.partition('#')
    v = huiji.get(page) or ''
    for head, body in sections(v, 2):
        if head.strip() == sec.strip():
            return body
    warn(f'考据 section not found: {ref}')
    return ''


def timeline_lines(huiji, pages, arc_names):
    """The timeline entries (with their sub-bullets and date headings) that name one of the arc's pages."""
    out = []
    for page in pages:
        v = huiji.get(page) or ''
        date, take = '', False
        for line in v.split('\n'):
            m = re.match(r'^(=+)\s*(.+?)\s*=+\s*$', line)
            if m:
                if len(m.group(1)) >= 3:
                    date = m.group(2)
                take = False
                continue
            if line.startswith('*') and not line.startswith('**'):
                names = re.findall(r'【\[\[([^\]|]+?)(?:\|[^\]]*)?\]\]】', line)
                take = any(n in arc_names for n in names)
                if take:
                    out.append(f'{date}：{line}')
                continue
            if take and line.startswith('**'):
                out.append(line)
    return '\n'.join(out)


# ---------------------------------------------------------------------------------------------------------------
# glossary (English name -> Chinese name)

def glossary(huiji):
    g = {}
    for title, v in huiji.items():
        if not v:
            continue
        for k in ('英文名', '英文'):
            m = re.search(r'\|\s*' + k + r'\s*=\s*([^\n|{}]+)', v)
            if m and re.search('[A-Za-z]', m.group(1)):
                g.setdefault(m.group(1).strip(), title)
        for m in re.finditer(r'\{\{nihongo\|([^|{}]+)\|(?:[^|{}]|\{\{[^{}]*\}\})*\|([A-Za-z][^|{}]+?)\s*(?:\||\}\})', v, re.I):
            g.setdefault(m.group(2).strip(), m.group(1).strip())
    g = {k: v for k, v in g.items() if 2 < len(k) < 60 and k.lower() not in GLOSSARY_STOP}
    # a single word that is part of a longer name belongs to whoever the text means ("Anna" of "Anna Sprengel" is not
    # the 杏奈 whose page lists "Anna"): left to the model
    words = {}
    for k, v in g.items():
        if ' ' in k:
            for w in k.split():
                words.setdefault(w, set()).add(v)
    return {k: v for k, v in g.items() if ' ' in k or not (words.get(k, set()) - {v})}


GLOSSARY_STOP = {'sister', 'sisters', 'eve', 'group', 'block', 'school', 'item', 'member', 'arc', 'level', 'magic', 'god', 'queen', 'king', 'the',
                 'side', 'science', 'church', 'saint', 'professor', 'doctor', 'leader', 'boss', 'girl', 'boy', 'man', 'woman', 'mother', 'father'}


def glossary_for(text, g):
    hits = [(en, zh) for en, zh in g.items() if re.search(r'(?<![A-Za-z])' + re.escape(en) + r'(?![A-Za-z])', text)]
    hits.sort(key=lambda x: -text.count(x[0]))
    return '；'.join(f'{en}={zh}' for en, zh in hits[:400])


# ---------------------------------------------------------------------------------------------------------------
# corpus

def build_corpus(project):
    cfg = project['wiki']
    fandom = read_json(os.path.join(ROOT, cfg['fandom']), {})
    huiji = read_json(os.path.join(ROOT, cfg['huiji']), {})
    g = glossary(huiji)
    chron = chronologies(fandom)
    ratio = float(cfg.get('chronology_when_page_below', 0.6))
    limit = int(project.get('summary', {}).get('max_chars', 60000))
    chapters, units = [], []
    report = []
    for i, a in enumerate(project['arcs']):
        cid = a['id']
        zh = []
        for p in a.get('huiji', []):
            if huiji.get(p):
                zh.append(f'【中文维基：{p}】\n' + clean(strip_page(huiji[p])))
            else:
                warn(f'{cid}: huiji page missing: {p}')
        tl = timeline_lines(huiji, cfg.get('timelines', []), set(a.get('huiji', [])) | {a['title']})
        if tl:
            zh.append('【中文维基：时间线】\n' + clean(tl))
        for ref in a.get('kaoju', []):
            s = kaoju_section(huiji, ref)
            if s:
                zh.append(f'【中文维基：日期考据 {ref.split("#")[-1]}】\n' + clean(s))
        en_page = []
        for p in a.get('fandom', []):
            if fandom.get(p):
                en_page.append(f'【English wiki: {p}】\n' + clean(strip_page(fandom[p])))
            else:
                warn(f'{cid}: fandom page missing: {p}')
        for vol in a.get('fandom_volumes', []):
            chs = sorted((t for t in fandom if t.startswith(vol + '/')), key=_chapter_order)
            for t in chs:
                m = re.search(r'==\s*Synopsis\s*==(.*?)(?=\n==[^=]|\Z)', fandom.get(t) or '', re.S)
                s = clean(m.group(1)) if m else ''
                if len(s) > 80:
                    en_page.append(f'【English wiki: {t}】\n{s}')
        accounts = []
        for series, head in a.get('chron', []):
            for (ser, h), items in chron.items():
                if h == head and (series == '*' or ser == series):
                    for who, body in items:
                        accounts.append((who, clean(body)))
        page_len = sum(len(x) for x in en_page)
        acc_len = sum(len(x[1]) for x in accounts)
        use_acc = accounts and page_len < ratio * acc_len
        en = list(en_page)
        if use_acc:
            # longest accounts first: they carry the main thread; every account is kept (the minor ones hold the
            # scenes the arc's page leaves out)
            for who, body in sorted(accounts, key=lambda x: -len(x[1])):
                en.append(f'【English wiki, {who}\'s account of this arc】\n{body}')
        zh_text = '\n\n'.join(zh)
        en_blocks = en
        # one unit when it fits, else consecutive parts of the English text, each with the Chinese text as reference
        total = len(zh_text) + sum(len(x) for x in en_blocks)
        groups = [en_blocks]
        if total > limit and en_blocks:
            room = max(20000, limit - len(zh_text))
            groups, cur, n = [], [], 0
            for b in _split_blocks(en_blocks, room):
                if cur and n + len(b) > room:
                    groups.append(cur)
                    cur, n = [], 0
                cur.append(b)
                n += len(b)
            if cur:
                groups.append(cur)
            # the Chinese texts are a part of their own too: what only they tell (live: the English parts of
            # 第三次世界大战篇 told its last day, and the Russian days before it, in the Chinese page only, were lost)
            if zh_text:
                groups.append(None)
        uids = []
        for k, grp in enumerate(groups):
            uid = f'{cid}.{k + 1:03d}'
            body = SPLIT.join(grp) if grp is not None else ''
            if grp is None:
                text = f'【本部分：中文资料（全篇）；第{k + 1}/{len(groups)}部分】\n' + zh_text
            elif len(groups) == 1:
                text = (zh_text + ('\n\n' if zh_text and body else '') + body).strip()
            else:
                text = ('【中文参考资料（全篇；本部分只摘要下面英文部分所写的情节，中文资料用于译名、日期和补充细节）】\n' + zh_text + '\n\n' if zh_text else '') + \
                    f'【本部分：英文资料第{k + 1}/{len(groups)}部分】\n' + body
            gl = glossary_for(text, g)
            if gl:
                text = f'【译名对照（英文→中文）】{gl}\n\n' + text
            write_text(project.p('text', cid, f'{uid}.txt'), text)
            units.append({'id': uid, 'chapter': cid, 'order': k + 1, 'title': a['title'] + (f'（第{k + 1}部分）' if len(groups) > 1 else ''), 'sub': '',
                          'place': '', 'present': [], 'speakers': {}, 'chars': len(text), 'scripts': [], 'part_of': len(groups), **({'zh_only': True} if grp is None else {})})
            uids.append(uid)
        report.append(f'{cid}: zh {len(zh_text):,} / page {page_len:,} / accounts {acc_len:,}{" (used)" if use_acc else ""} -> {len(groups)} unit(s)')
        chapters.append({'id': cid, 'order': i + 1, 'source_id': cid, 'title': a['title'], 'name': a['title'], 'era': '', 'units': uids, 'event': False,
                         'start': a['start'], 'end': a['end']})
    corpus = {'source': {'adapter': 'wiki_arcs', 'region': 'wiki'}, 'protagonist': {'name': project.get('protagonist', {}).get('name', '主人公')},
              'chapters': chapters, 'units': units, 'characters': {}}
    write_json(project.p('corpus.json'), corpus)
    write_text(project.p('sources.txt'), '\n'.join(report))
    log(f'corpus: {len(chapters)} arcs, {len(units)} units, {sum(u["chars"] for u in units):,} characters of text (per arc: {project.p("sources.txt")})')
    return corpus


def _chapter_order(t):
    name = t.split('/', 1)[1]
    if name.startswith('Prologue'):
        return (0, 0, name)
    m = re.search(r'Chapter (\d+)', name)
    if m:
        return (1, int(m.group(1)), name)
    if name.startswith('Between'):
        return (1, 99, name)
    if name.startswith('Epilogue'):
        return (2, 0, name)
    return (3, 0, name)


def _split_blocks(blocks, room):
    """Blocks no longer than room: a long block is cut at its section headings (then at paragraphs)."""
    out = []
    for b in blocks:
        if len(b) <= room:
            out.append(b)
            continue
        head = b.split('\n', 1)[0]
        cur = ''
        for para in re.split(r'\n(?=#{2,4} )', b):
            while len(para) > room:
                cut = para.rfind('\n\n', 0, room)
                cut = cut if cut > room // 3 else room
                out.append((cur + '\n' + para[:cut]).strip() if cur else para[:cut])
                cur = ''
                para = head + '（续）\n' + para[cut:].lstrip()
            if cur and len(cur) + len(para) > room:
                out.append(cur)
                cur = head + '（续）\n'
            cur = (cur + '\n' + para) if cur else para
        if cur.strip():
            out.append(cur)
    return out
