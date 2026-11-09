"""Finds the dates and durations a text states outright (no model): the anchors for the timeline.

Generic: Chinese/Japanese (2004年1月30日, 公元前2600年, 三天后, 约90天) and English (December 26, 2019; 3 days later).
"""
import re

from .util import halfwidth_digits

CN_NUM = {'零': 0, '〇': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9}
CN_UNIT = {'十': 10, '百': 100, '千': 1000, '万': 10000}


def cn_int(s):
    """'三' -> 3, '十二' -> 12, '一百五十' -> 150, '90' -> 90."""
    s = halfwidth_digits(s)
    if s.isdigit():
        return int(s)
    total, cur = 0, 0
    for ch in s:
        if ch in CN_NUM:
            cur = CN_NUM[ch]
        elif ch in CN_UNIT:
            total += (cur or 1) * CN_UNIT[ch]
            cur = 0
        else:
            return None
    return total + cur


NUM = r'[0-9０-９]+|[零〇一二两三四五六七八九十百千万]+'
PATTERNS = [
    # 公元2004年1月30日 / 2018年 12月 31日 / 西暦2015年
    ('date', re.compile(r'(?:公元|西历|西暦|A\.?D\.?\s*)?\s*([0-9０-９]{3,4})\s*年\s*([0-9０-９]{1,2})\s*月\s*(?:([0-9０-９]{1,2})\s*日)?')),
    ('bc_year', re.compile(r'(?:公元前|紀元前|纪元前|B\.?C\.?\s*)\s*([0-9０-９]{1,5})\s*年?')),
    ('year', re.compile(r'(?:公元|西历|西暦|A\.?D\.?\s*)?\s*(?<![0-9０-９])([0-9０-９]{3,4})\s*年(?![0-9０-９]*\s*[0-9０-９]{1,2}\s*月)(?!间|代|来|後|后|前|历)')),
    ('month_day', re.compile(r'(?<![年0-9０-９])([0-9０-９]{1,2})\s*月\s*([0-9０-９]{1,2})\s*日')),
    ('duration', re.compile(r'(?:约|大约|将近|整整|足足)?\s*(' + NUM + r')\s*(个?小时|天|日|周|星期|个月|年)\s*(后|之后|以后|前|之前|以前|间|内|来|左右)')),
    ('en_date', re.compile(r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b')),
    ('en_duration', re.compile(r'\b(\d+|one|two|three|four|five|six|seven|ten)\s+(hours?|days?|weeks?|months?|years?)\s+(later|ago|after|before)\b', re.I)),
]
MONTHS = {m: i + 1 for i, m in enumerate(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])}
EN_NUM = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'ten': 10}
UNIT_DAYS = {'小时': 1 / 24, '个小时': 1 / 24, '天': 1, '日': 1, '周': 7, '星期': 7, '个月': 30, '年': 365,
             'hour': 1 / 24, 'day': 1, 'week': 7, 'month': 30, 'year': 365}


def scan(text, context=40):
    """[{kind, text, value, at, context}] in text order; overlapping weaker matches are dropped."""
    found = []
    taken = []

    def free(a, b):
        return all(b <= x or a >= y for x, y in taken)

    for kind, rx in PATTERNS:
        for m in rx.finditer(text):
            a, b = m.span()
            if not free(a, b):
                continue
            g = m.groups()
            v = None
            if kind == 'date':
                y, mo = int(halfwidth_digits(g[0])), int(halfwidth_digits(g[1]))
                d = int(halfwidth_digits(g[2])) if g[2] else None
                if not 1 <= mo <= 12 or (d is not None and not 1 <= d <= 31):
                    continue
                v = {'year': y, 'month': mo, 'day': d}
            elif kind == 'bc_year':
                v = {'year': -int(halfwidth_digits(g[0]))}
            elif kind == 'year':
                v = {'year': int(halfwidth_digits(g[0]))}
            elif kind == 'month_day':
                mo, d = int(halfwidth_digits(g[0])), int(halfwidth_digits(g[1]))
                if not (1 <= mo <= 12 and 1 <= d <= 31):
                    continue
                v = {'month': mo, 'day': d}
            elif kind == 'duration':
                n = cn_int(g[0])
                if n is None or n == 0:
                    continue
                v = {'n': n, 'unit': g[1], 'rel': g[2], 'days': round(n * UNIT_DAYS.get(g[1], 1), 3)}
            elif kind == 'en_date':
                v = {'year': int(g[2]), 'month': MONTHS[g[0]], 'day': int(g[1])}
                kind = 'date'
            elif kind == 'en_duration':
                n = int(g[0]) if g[0].isdigit() else EN_NUM.get(g[0].lower())
                unit = g[1].lower().rstrip('s')
                v = {'n': n, 'unit': unit, 'rel': g[2].lower(), 'days': round(n * UNIT_DAYS.get(unit, 1), 3)}
                kind = 'duration'
            taken.append((a, b))
            ctx = text[max(0, a - context): b + context].replace('\n', ' ')
            found.append({'kind': kind, 'text': m.group(0).strip(), 'value': v, 'at': a, 'context': ctx})
    found.sort(key=lambda x: x['at'])
    return found


def label(v):
    """Human label for a scanned value."""
    if 'n' in v:
        return f"{v['n']}{v['unit']}{v['rel']}"
    y = v.get('year')
    ys = '' if y is None else (f'公元前{-y}年' if y < 0 else f'{y}年')
    md = (f"{v['month']}月" if v.get('month') else '') + (f"{v['day']}日" if v.get('day') else '')
    return ys + md
