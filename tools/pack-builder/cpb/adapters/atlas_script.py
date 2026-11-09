"""Parser for Atlas Academy's FGO script files (the game's own story markup).

Markup in brief: `＠Speaker` (or `＠A：Speaker`, A = a character slot) opens a message that ends at `[k]`;
`＠` alone is narration. `[charaSet A 8001000 0 玛修]` puts a character figure in slot A. `？1：…` … `？！` are the
protagonist's choices; lines between two options belong to the option before them. `[%1]` is the protagonist's
name, `[&他:她]` picks by the protagonist's gender, `[#漢字:かな]` is ruby, `[r]` a line break, and the rest of the
bracket commands are staging (sound, camera, faces) that carry no story.
"""
import re

CMD = re.compile(r'\[([^\]]*)\]')
CHOICE = re.compile(r'^？(\d+)(?:[，,][^：:]*)?[：:](.*)$')
SHOW = {'charaFadein', 'charaFadeinFSL', 'charaFadeinFSR', 'charaPut', 'charaTalk', 'charaFadeTime', 'charaMove', 'charaMoveEase',
        'charaFace', 'charaFaceFade'}
SPEAKER = re.compile(r'^＠(?:([A-Z][A-Z0-9]?)[：:])?(.*)$')


class ParsedScript:
    def __init__(self, script_id):
        self.id = script_id
        self.cast = {}        # slot -> {'figure': int, 'label': str}
        self.figures = {}     # figure id -> set of labels used for it
        self.items = []       # {'t': 'say'|'narr'|'choice'|'scene', ...}
        self.speakers = []
        self.shown = set()    # figures actually brought on screen (charaSet alone only preloads them)

    def to_dict(self):
        return {
            'id': self.id,
            'figures': {str(k): sorted(v) for k, v in self.figures.items()},
            'items': self.items,
        }


def _inline(text, ctx):
    """Resolve inline markup inside a message line; drop staging commands."""
    def rep(m):
        body = m.group(1).strip()
        if body in ('r', 'sr'):
            return ctx['br']
        if body.startswith('%1'):
            return ctx['protagonist']
        if body.startswith('&'):
            parts = body[1:].split(':')
            if len(parts) == 2:
                return parts[0] if ctx['gender'] == 'male' else parts[1]
            return parts[0]
        if body.startswith('#'):
            inner = body[1:]
            return inner.split(':')[0]
        if body.startswith('line'):
            return '——'
        if body.startswith('image') or body.startswith('i '):
            return ''
        return ''
    out = CMD.sub(rep, text)
    return out.replace('　', ' ').strip()


def parse(script_id, text, protagonist='主人公', gender='female', cjk=True):
    ps = ParsedScript(script_id)
    ctx = {'protagonist': protagonist, 'gender': gender, 'br': '' if cjk else ' '}
    speaker = None      # None = outside a message; '' = narration
    slot = None
    sfig = None         # the figure in the speaker's slot when the message opens
    buf = []
    choice = None       # {'options': [...], 'cur': n}

    def emit(item):
        if choice is not None and choice.get('cur') is not None:
            item = dict(item, option=choice['cur'])
        ps.items.append(item)

    def flush():
        nonlocal speaker, slot, buf, sfig
        if speaker is None:
            return
        line = ctx['br'].join(x for x in (_inline(b, ctx) for b in buf) if x)
        if line:
            if speaker == '':
                emit({'t': 'narr', 'text': line})
            else:
                emit({'t': 'say', 'who': speaker, 'fig': sfig, 'text': line})
        speaker, slot, buf, sfig = None, None, [], None

    for raw in text.splitlines():
        line = raw.rstrip('\r')
        s = line.strip()
        if not s:
            continue
        if s.startswith('＄'):
            continue
        # staging commands on their own line
        if s.startswith('[') and s.endswith(']') and CMD.fullmatch(s):
            body = s[1:-1].strip()
            name = body.split(' ')[0]
            if name == 'k':
                flush()
            elif name == 'charaSet':
                parts = body.split(' ', 4)
                if len(parts) >= 3 and parts[2].isdigit():
                    fig = int(parts[2])
                    label = parts[4].strip() if len(parts) > 4 else ''
                    ps.cast[parts[1]] = {'figure': fig, 'label': label}
                    if label:
                        ps.figures.setdefault(fig, set()).add(label)
            elif name in SHOW and len(body.split(' ')) > 1:
                c = ps.cast.get(body.split(' ')[1])
                if c:
                    ps.shown.add(c['figure'])
            elif name == 'scene':
                parts = body.split(' ')
                if len(parts) > 1:
                    ps.items.append({'t': 'scene', 'id': parts[1]})
            elif speaker is not None and name in ('r', 'sr'):
                buf.append('')
            continue
        m = CHOICE.match(s)
        if m and speaker is None:
            if choice is None:
                choice = {'options': [], 'cur': None}
                ps.items.append({'t': 'choice', 'options': choice['options']})
            choice['options'].append(_inline(m.group(2), ctx))
            choice['cur'] = int(m.group(1))
            continue
        if s.startswith('？！') and speaker is None:
            choice = None
            continue
        m = SPEAKER.match(s)
        if m and speaker is None:
            slot = m.group(1)
            sfig = ps.cast.get(slot, {}).get('figure') if slot else None
            who = _inline(m.group(2), ctx)
            speaker = who
            if who:
                ps.speakers.append(who)
            buf = []
            continue
        if speaker is not None:
            # a message line may carry trailing inline [k]
            if '[k]' in s:
                buf.append(s.replace('[k]', ''))
                flush()
            else:
                buf.append(s)
            continue
        # stray text outside a message: keep as narration
        t = _inline(s, ctx)
        if t:
            emit({'t': 'narr', 'text': t})
    flush()
    return ps


def render(items, names, protagonist='主人公'):
    """Readable text for the model and for people. names(figure, label) -> display name."""
    out = []
    for it in items:
        pre = f'（选项{it["option"]}）' if it.get('option') else ''
        if it['t'] == 'say':
            out.append(f'{pre}{names(it.get("fig"), it["who"])}：{it["text"]}')
        elif it['t'] == 'narr':
            out.append(f'{pre}{it["text"]}')
        elif it['t'] == 'choice':
            opts = ' ／ '.join(f'{i + 1}. {o}' for i, o in enumerate(it['options']))
            out.append(f'【{protagonist}的可选回应】{opts}')
        elif it['t'] == 'scene':
            if out and out[-1] != '——场景切换——':
                out.append('——场景切换——')
    while out and out[-1] == '——场景切换——':
        out.pop()
    while out and out[0] == '——场景切换——':
        out.pop(0)
    return '\n'.join(out)
