"""A stand-in model for tests and dry runs: deterministic, free, shaped like the real replies (not like their quality)."""
import re
import zlib


def _names(user):
    m = re.search(r'Who appears[^:]*: (.*)', user)
    if not m:
        return []
    return [re.sub(r'\(\d+\)$', '', x).strip() for x in m.group(1).split('、') if x.strip() and x.strip() != '（无）']


def mock(task, user):
    if task == 'summary':
        who = _names(user)[:4] or ['某人']
        title = re.search(r'This section: #\d+ 「(.*?)」', user)
        t = title.group(1) if title else '一段剧情'
        beats = []
        for i in range(2):
            beats.append({
                'title': f'{t}（{i + 1}）', 'background': '', 'trigger': f'{who[0]}行动起来', 'motives': [{'who': who[0], 'motive': '完成眼前的任务'}],
                'course': f'{"、".join(who)}在这里经历了“{t}”的第{i + 1}段。', 'result': f'第{i + 1}段结束。', 'aftermath': '', 'note': '', 'extra': {'测试': '模拟数据'} if i else {},
                'people': [{'name': n, 'role': '在场', 'presence': 'onsite'} for n in who], 'places': [],
                'time': {'after_previous': 'continuous' if i else 'same_day', 'days': 0, 'time_of_day': 'unknown', 'duration_minutes': 45, 'stated': ''},
                'changes': ([{'subject': who[-1], 'kind': 'learns', 'value': f'知道了“{t}”的真相', 'object': ''}] if i else []),
                'secret': {'is_secret': False, 'knowers': []}, 'importance': 'normal'})
        return {'recap': f'模拟：{t}。', 'beats': beats, 'people_notes': [{'name': n, 'aliases_in_text': [], 'who': f'{n}（模拟描述）'} for n in who], 'open_questions': []}
    if task == 'chapter':
        ids = re.findall(r'^\[(w[^\]]+)\]', user, re.M)
        who = re.findall(r'人物：([^\n、]+)', user)
        events = [{'beat': b, 'class': 'SOFT', 'why': '模拟', 'hook': ''} for b in ids]
        resolution = None
        if ids:
            resolution = {'beat': ids[-1], 'why': '章节结局（模拟）', 'required': '本章的目标达成。',
                          'outcomes': [{'subject': (who[-1] if who else '某人').replace('(通讯)', ''), 'predicate': 'status', 'value': '完成本章目标'}]}
        links = [{'from': a, 'to': b, 'relation': 'precedes', 'note': '模拟顺序'} for a, b in zip(ids, ids[1:])][:5]
        return {'summary': '模拟章节概要。', 'frame': {'label': '模拟框架', 'local_year': None, 'relation': ''}, 'resolution': resolution, 'fixed': [],
                'events': events, 'links': links, 'impact': [{'beat': ids[0], 'impact': '后续都以此为前提（模拟）。'}] if ids else [], 'ends': []}
    if task == 'entity':
        keys = re.findall(r'^key: (.+)$', user, re.M)
        out = []
        for i, k in enumerate(keys):
            nm = re.search(r'key: ' + re.escape(k) + r'\nnames used: ([^\n、]+)', user)
            name = nm.group(1) if nm else k
            out.append({'key': k, 'name': name, 'aliases': [], 'kind': 'place' if k.startswith('p:') else 'person',
                        'description': f'{name}（模拟描述）。', 'id': f'mock-{i}-{zlib.crc32(k.encode('utf8')) % 10000}', 'same_as': '', 'skip': False})
        return {'entities': out}
    if task.startswith('dedupe'):   # nothing is a duplicate (both the group listing and the pair check)
        return {'groups': [], 'same': False, 'why': '模拟'}
    if task == 'ends':   # a state that names an attack is over within the hour, the rest lasts
        items = re.findall(r'^(\d+)\. .*? — \w+: (.*)$', user, re.M)
        return {'items': [{'n': int(n), 'until': 'minutes', 'minutes': 60} if '袭击' in v else {'n': int(n), 'until': 'lasting'} for n, v in items]}
    if task == 'impacts':   # nothing beyond the events
        return {'items': [{'n': int(n), 'add': []} for n in re.findall(r'^(\d+)\. ', user, re.M)]}
    if task == 'deaths':   # whoever is present later came back
        return {'items': [{'n': int(n), 'is': 'returned'} for n in re.findall(r'^(\d+)\. ', user, re.M)]}
    if task == 'start':   # the first candidate is a member
        m = re.search(r'^Candidate people[^\n]*\n([^ |\n]+) \|', user, re.M)
        return {'members': [m.group(1)], 'leader': None, 'why': '（模拟）'} if m else {'none': True}
    if task == 'mind':
        return {'deliberation': 'situational', 'sharpness': 'plain', 'approach': '（模拟）照常处理', 'speaks': '（模拟）'}
    if task == 'nature':
        return {'none': True}
    if task == 'nature_perceive':
        return {'versions': [None] * len(re.findall(r'^Version \d+:', user, re.M))}
    if task == 'nature_story':
        return {'story': []}
    if task == 'nature_verify':
        return {'supported': False, 'quote': ''}
    return {}
