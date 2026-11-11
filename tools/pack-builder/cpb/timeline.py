"""The master clock (code, no model): where each beat sits on the home side's lived time.

Chapters follow each other in story order. A chapter starts at its anchor from the project file, or a gap after
the previous one. Inside a chapter, beats follow the time cues of the summaries (right after, later that day, next
day, N days later, time of day, duration). When the beats before an anchor run past it, that stretch is
compressed to fit, so the anchor holds. Everything except the anchors is an editorial estimate, and says so.
"""
import datetime as dt
import re

HOUR = {'small_hours': 2, 'dawn': 5, 'morning': 8, 'day': 10, 'noon': 12, 'afternoon': 15, 'evening': 18, 'night': 21, 'late': 23}
DAY = 1440
# the part of the day the text's own words name, before the summary's time_of_day (live: "9月20日凌晨" coded "night"
# sat at 21:00 that evening, after the day it began, and the morning's beats were pushed after it)
PART_WORDS = [('凌晨', 'small_hours'), ('天亮前', 'small_hours'), ('清晨', 'dawn'), ('早上', 'morning'), ('早晨', 'morning'), ('上午', 'morning'),
              ('正午', 'noon'), ('中午', 'noon'), ('白天', 'day'), ('下午', 'afternoon'), ('傍晚', 'evening'), ('黄昏', 'evening'),
              ('日落', 'evening'), ('深夜', 'late'), ('半夜', 'late'), ('夜晚', 'night'), ('晚上', 'night'), ('夜里', 'night')]


def part_of(time):
    """The part of the day of a beat: the first the stated words name, else the summary's time_of_day."""
    said = (time or {}).get('stated') or ''
    if 'UTC' in said:
        # another place's clock: only what is said before it ("中午（即深夜 UTC+0）"); a time given only there is not ours
        said = said.split('（')[0] if '（' in said and 'UTC' not in said.split('（')[0] else ''
    # the end of a span ("补习至黄昏结束") is not when the beat is
    hits = [(i, p) for w, p in PART_WORDS for i in [m.start() for m in re.finditer(w, said)] if not re.search(r'[至到~～]\s*$', said[max(0, i - 2):i])]
    if hits:
        return min(hits)[1]
    return (time or {}).get('time_of_day')


def year_of(stated, origin_year):
    """The year a text gives without a date ("829年", "1519-1521年", "公元4世纪", "20世纪70年代", "2年前"), else None."""
    s = stated or ''
    m = re.search(r'(?<!\d)(\d{3,4})(?:\s*[-–~～]\s*(\d{3,4}))?年(?!前|后|代|\s*\d{1,2}月)', s)
    if m:
        a, b = int(m.group(1)), int(m.group(2) or m.group(1))
        return (a + b) // 2
    m = re.search(r'(\d{1,2})世纪(\d)0年代', s)
    if m:
        return (int(m.group(1)) - 1) * 100 + int(m.group(2)) * 10 + 5
    m = re.search(r'公元(\d{1,2})世纪', s)
    if m:
        return (int(m.group(1)) - 1) * 100 + 50
    m = re.search(r'(?<![\d年月])(\d{1,2})年前', s)
    if m and not re.search(r'\d月|\d日', s):
        return origin_year - int(m.group(1))
    return None


def parse_dt(s):
    s = s.strip()
    for f in ('%Y-%m-%d %H:%M', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(s, f)
        except ValueError:
            pass
    raise ValueError(f'bad date: {s} (use YYYY-MM-DD or YYYY-MM-DD HH:MM)')


class Clock:
    def __init__(self, origin_date):
        self.origin = parse_dt(origin_date)

    def tick(self, s):
        d = parse_dt(s) - self.origin
        return d.days * DAY + d.seconds // 60

    def label(self, t):
        return (self.origin + dt.timedelta(minutes=t)).strftime('%Y-%m-%d %H:%M')

    def date(self, t):
        return (self.origin + dt.timedelta(minutes=t)).strftime('%Y-%m-%d')


def _at_hour(t, hour):
    return (t // DAY) * DAY + hour * 60


TIME_RX = re.compile(r'(上午|下午|晚上|夜里|凌晨|AM|PM|午前|午後)?\s*(\d{1,2})\s*[时時:：点]\s*(\d{1,2})?')


def time_of(text):
    """Minute of the day a text states ("16 时 30 分", "PM9:30", "下午3点"), else None."""
    text = text or ''
    for m in TIME_RX.finditer(text):
        # the end of a span or a deadline ("放学后~19:00前") is not when the beat is
        if re.search(r'[~～至到]\s*$', text[:m.start()]):
            continue
        before = re.match(r'\s*分?\s*(?:之前|以前|前(?!往|进|来|去|后))', text[m.end():])
        h, mi = int(m.group(2)), int(m.group(3) or 0)
        if m.group(1) in ('下午', '晚上', 'PM', '午後') and h < 12:
            h += 12
        if m.group(1) == '凌晨' and h == 12:
            h = 0
        if not (0 <= h < 24 and 0 <= mi < 60):
            return None
        # a deadline ("2:00前"): a little before it
        return (h * 60 + mi - 30) % DAY if before else h * 60 + mi
    return None


def place_beat(cursor, time):
    """Start of a beat given the previous beat's end (cursor) and its time cues."""
    after, tod = time['after_previous'], part_of(time)
    h = HOUR.get(tod)
    said = _clock(time.get('clock'))
    if said is None:
        said = time_of(time.get('stated'))
    small = cursor % DAY < 6 * 60   # past midnight: still the night before, "the next day" is today
    if tod in ('night', 'late') and small:
        h = None                        # a night beat after midnight is still in that night (not the next evening)
    if said is not None and after == 'next_day' and small:
        # "the next day, 4:00" after a night past midnight: today; when the beats before ran past it, right after them
        return max((cursor // DAY) * DAY + said, cursor)
    if said is not None and after in ('continuous', 'same_day', 'unknown'):
        at = (cursor // DAY) * DAY + said      # a clock time the text states: that time today, or tomorrow
        return at if at >= cursor else at + DAY
    if after == 'next_day' and small:
        # the morning after a night that ran past midnight: this calendar day
        return max(_at_hour(cursor, h if h is not None else 8), cursor)
    if after == 'continuous':
        start = cursor
        if h is not None and _at_hour(cursor, h) > cursor and _at_hour(cursor, h) - cursor < 6 * 60:
            start = _at_hour(cursor, h)
    elif after == 'same_day':
        start = cursor + 90
        if h is not None and _at_hour(cursor, h) > start:
            start = _at_hour(cursor, h)
    elif after == 'next_day':
        start = _at_hour(cursor + DAY, h if h is not None else 8)
    elif after == 'days':
        start = _at_hour(cursor + max(1, time['days']) * DAY, h if h is not None else 9)
    else:
        start = cursor + 30
        if h is not None and _at_hour(cursor, h) > start:
            start = _at_hour(cursor, h)
    return start


def compute(project, chapters, beats_by_chapter, beat_anchors=None):
    """{beat_id: {start, end}} plus a per-chapter report. beats_by_chapter: {chapter_id: [beat, ...]} in order.

    beat_anchors: {beat_id: (tick, label)}, dates the story itself states for a beat (a scene headed
    "2017年12月31日"). A chapter is cut into segments at its anchored beats; the segments, not whole chapters,
    are what anchors pin and what shares the time between two anchors.
    """
    beat_anchors = beat_anchors or {}
    tl = project.get('timeline', {})
    clock = Clock(tl.get('origin_date', '2000-01-01'))
    anchors = {a['chapter']: a for a in tl.get('anchors', [])}
    gap = int(tl.get('gap_days', 14))
    gaps = tl.get('gaps', {})
    first_start = clock.tick(tl['start']) if tl.get('start') else 8 * 60
    # segments: a chapter's beats, cut before each anchored beat
    segs = []
    for ch in chapters:
        cur = None
        for b in beats_by_chapter.get(ch['id'], []):
            if cur is None or b['id'] in beat_anchors:
                cur = {'chapter': ch['id'], 'beats': [], 'first_of_chapter': cur is None}
                segs.append(cur)
            cur['beats'].append(b)
    rel, length = {}, []
    for sg in segs:
        t, first = 0, True
        for b in sg['beats']:
            s = t if first else place_beat(t, b['time'])
            first = False
            e = s + max(5, b['time']['duration_minutes'])
            rel[b['id']] = (s, e)
            t = e
        length.append(t)
    n = len(segs)
    fixed, why = {}, {}
    for i, sg in enumerate(segs):
        b0 = sg['beats'][0]['id']
        if b0 in beat_anchors:
            fixed[i], why[i] = beat_anchors[b0][0], beat_anchors[b0][1]
        elif sg['first_of_chapter'] and sg['chapter'] in anchors:
            fixed[i], why[i] = clock.tick(anchors[sg['chapter']]['start']), 'anchor'
    if 0 not in fixed:
        fixed[0] = first_start
    # anchors only move forward: one earlier than an anchor before it is dropped
    last_t = None
    for i in sorted(fixed):
        if last_t is not None and fixed[i] <= last_t:
            del fixed[i]
            continue
        last_t = fixed[i]
    keys = sorted(fixed)
    start, scale, note = [None] * n, [1.0] * n, [None] * n
    for k, i in enumerate(keys):
        start[i] = fixed[i]
        j = keys[k + 1] if k + 1 < len(keys) else None
        if j is None:
            t = start[i] + length[i]
            for m in range(i + 1, n):
                g = int(gaps.get(segs[m]['chapter'], gap)) if segs[m]['first_of_chapter'] else 0
                start[m] = _at_hour(t + g * DAY, 8) if g > 0 else t + 60
                t = start[m] + length[m]
            break
        span = fixed[j] - fixed[i]
        content = sum(length[m] for m in range(i, j))
        slots = j - i
        if content + 60 * slots <= span:
            g = (span - content) / slots
            t = start[i]
            prev_end = start[i]
            for m in range(i, j):
                if m > i:
                    start[m] = _at_hour(int(t), 8) if _at_hour(int(t), 8) >= prev_end else int(t)
                prev_end = start[m] + length[m]
                t = prev_end + g
                if slots > 1:
                    note[m] = f'均分间隔约{g / DAY:.1f}天'
        else:
            f = max(0.01, (span - 60 * slots) / content) if content else 1.0
            t = start[i]
            for m in range(i, j):
                start[m] = int(t) if m > i else start[i]
                scale[m] = f
                note[m] = f'压缩×{f:.3f}'
                t = start[m] + length[m] * f + 60
    pos = {}
    for m, sg in enumerate(segs):
        f = scale[m]
        for b in sg['beats']:
            s, e = rel[b['id']]
            pos[b['id']] = {'start': start[m] + int(s * f), 'end': start[m] + max(int(e * f), int(s * f) + 1)}
    # strictly increasing starts, so windows never touch (a dependent event starts after its prerequisite)
    last = None
    for ch in chapters:
        for b in beats_by_chapter.get(ch['id'], []):
            p = pos[b['id']]
            if last is not None and p['start'] <= last:
                p['start'] = last + 1
            p['end'] = max(p['end'], p['start'] + 1)
            last = p['start']
    rep = []
    for ch in chapters:
        idx = [m for m, sg in enumerate(segs) if sg['chapter'] == ch['id']]
        if not idx:
            continue
        bs = beats_by_chapter[ch['id']]
        stated = [why[m] for m in idx if m in why and why[m] != 'anchor' and m in fixed]
        notes = [note[m] for m in idx if note[m]]
        f = [scale[m] for m in idx if scale[m] != 1.0]
        rep.append({'chapter': ch['id'], 'start': pos[bs[0]['id']]['start'], 'end': max(pos[b['id']]['end'] for b in bs), 'anchor': anchors.get(ch['id']),
                    'compressed': round(min(f), 3) if f else None,
                    'note': '；'.join(([notes[0]] if notes else []) + ([f'文中日期：{"、".join(stated)}'] if stated else []))})
    for r in rep:
        r['start_label'] = clock.label(r['start'])
        r['end_label'] = clock.label(r['end'])
    return pos, rep, clock


SLACK = 120
# the end of a part of the day, in minutes from the start of its day (night runs into the next day)
PART_END = {'small_hours': 6 * 60, 'day': 18 * 60, 'late': DAY + 3 * 60, 'dawn': 8 * 60, 'morning': 12 * 60, 'noon': 14 * 60, 'afternoon': 18 * 60, 'evening': 21 * 60, 'night': DAY + 3 * 60}


def _clocked(time):
    return _clock(time.get('clock')) is not None or time_of(time.get('stated')) is not None


def day_only(time):
    """Do the sources give only the day of the beat? (no clock, no part of the day, not tied to the beat before it)"""
    if not time or _clocked(time) or part_of(time) in HOUR:
        return False
    return time.get('after_previous') not in ('continuous', 'same_day', 'parallel')


def windows(order, pos, times=None, loose=(), chapter_of=None):
    """Event windows: the beat's own length, at least SLACK minutes; a beat of which the sources give only a part of
    the day, to the end of that part; only the day (`loose`: placed at a day without a time, or `day_only`), to the
    end of that day. Never past the next beat of its own story (beats of another story may run at the same time; with
    no chapter_of, the next beat of all). The next beat is not a bound to reach: a beat with nothing soon after it (the
    last of a story, or one with days to the next) keeps its own length (live: a film's climax at 12:30 ran until 07:59
    the next morning, when the next story began, and a HARD event was due only then)."""
    times = times or {}
    ch = chapter_of or {}
    out = {}
    for i, bid in enumerate(order):
        s = pos[bid]['start']
        e = pos[bid]['end']
        nxt = next((pos[x]['start'] for x in order[i + 1:] if ch.get(x) == ch.get(bid)), None)
        hi = max(e, s + SLACK)
        t = times.get(bid) or {}
        if bid in loose or day_only(t):
            hi = max(hi, (s // DAY + 1) * DAY - 1)
        elif part_of(t) in PART_END and not _clocked(t):
            tod, m = part_of(t), s % DAY
            if tod in ('night', 'late') and m < 12 * 60:
                m += DAY  # a night that has passed midnight
            # only when the beat starts in that part of the day (one pushed out of it by the beats before keeps its own length)
            if HOUR[tod] * 60 - 60 <= m <= PART_END[tod]:
                hi = max(hi, s - m + PART_END[tod])
        if nxt is not None:
            hi = min(hi, nxt - 1) if nxt > s else s
        out[bid] = (s, max(s, hi))
    return out


# ---- arcs with dates of their own (a project's "arcs": start and end per chapter, from the sources' chronology)

def _day(origin, s):
    return (dt.date.fromisoformat(s) - origin).days


def _clock(s):
    m = re.fullmatch(r'(\d{1,2}):(\d{2})', s or '')
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


def place_arc(origin, arc, beats, loose=None):
    """{beat id: (start, end, dated)} for an arc's beats, in the pack's minutes. `loose` (a set) gets the beats placed
    at a day the sources give without any time of it."""
    s0, e0 = _day(origin, arc['start']), _day(origin, arc['end'])
    lo, hi = s0 * DAY + 8 * 60, e0 * DAY + 22 * 60
    fixed, past = {}, {}
    yearly = set()
    for i, b in enumerate(beats):
        t = b['time']
        if not t.get('date') and year_of(t.get('stated'), origin.year) is not None:
            # a year the text gives (the day in it is not known: an estimate, not a date of the sources)
            t = {**t, 'date': f'{year_of(t.get("stated"), origin.year):04d}-01-01'}
            yearly.add(b['id'])
        if t.get('date'):
            try:
                d = _day(origin, t['date'])
                if not s0 - 3 <= d <= e0 + 3:
                    # a wrong year (the arc's month and day in another year) is the arc's year
                    for y in range(int(arc['start'][:4]), int(arc['end'][:4]) + 1):
                        dd = _day(origin, f'{y}{t["date"][4:]}')
                        if s0 - 3 <= dd <= e0 + 3:
                            d = dd
            except ValueError:
                continue
            if not s0 - 3 <= d <= e0 + 3 and d < s0:
                # a happening of the past the sources tell here: at its own date (out of the arc's sequence)
                c = _clock(t.get('clock'))
                if c is None and loose is not None:
                    loose.add(beats[i]['id'])
                past[beats[i]['id']] = (d * DAY + (c if c is not None else 9 * 60), d * DAY + (c if c is not None else 9 * 60) + max(5, t['duration_minutes']), True)
                continue
            if s0 - 3 <= d <= e0 + 3:
                c = _clock(t.get('clock'))
                if c is None:
                    c = time_of(t.get('stated'))
                if c is None and part_of(t) in HOUR:
                    c = HOUR[part_of(t)] * 60
                prev = fixed[max(fixed)] if fixed else None
                if c is None:
                    # no time of day: after the previous dated beat of that day, else the morning (the day is all
                    # that is known)
                    if prev is not None and prev // DAY == d:
                        c = prev % DAY + 30
                        # later the same day as a beat of which only the day is known: so is this one's (not one
                        # that follows right after it: that one keeps close to it)
                        if loose is not None and beats[max(fixed)]['id'] in loose and t['after_previous'] not in ('continuous', 'parallel'):
                            loose.add(b['id'])
                    else:
                        c = 9 * 60
                        if loose is not None:
                            loose.add(b['id'])
                elif prev is not None and prev // DAY == d and d * DAY + c <= prev and t['after_previous'] != 'parallel' and _clock(t.get('clock')) is None:
                    # only a part of the day ("morning") that would put it before the beat it follows: right after it
                    c = prev % DAY + 30
                if prev is not None and d * DAY + c == prev and t['after_previous'] != 'parallel':
                    c += 10
                fixed[i] = d * DAY + c
    if past:
        rest = [b for b in beats if b['id'] not in past]
        keep = {b['id']: j for j, b in enumerate(rest)}
        out = place_arc(origin, arc, rest, loose) if rest else {}
        return {**out, **{k: (v[0], v[1], v[2] and k not in yearly) for k, v in past.items()}}
    # segments between dated beats (the arc's start and end bound the first and the last)
    out = {}
    idx = sorted(fixed)
    bounds = [(-1, lo)] + [(i, fixed[i]) for i in idx] + [(len(beats), max(hi, max(fixed.values(), default=hi)))]
    for (a, ta), (z, tz) in zip(bounds, bounds[1:]):
        if a >= 0:
            out[a] = (ta, ta + max(5, beats[a]['time']['duration_minutes']), True)
        seg = list(range(a + 1, z))
        if not seg:
            continue
        cur = out[a][1] if a >= 0 else ta
        prev_start = out[a][0] if a >= 0 else ta
        rel = []
        for i in seg:
            t = beats[i]['time']
            if t['after_previous'] == 'parallel':
                st = prev_start
            elif a < 0 and i == seg[0]:
                st = ta
            else:
                st = place_beat(cur, t)
            en = st + max(5, t['duration_minutes'])
            rel.append((st, en))
            prev_start, cur = st, en
        # compress into [ta, tz) when the cues run past the next dated beat (or the arc's end)
        last = max(e for _, e in rel)
        room = tz - ta
        if tz > ta and (z < len(beats) and last >= tz or z == len(beats) and last > tz):
            span = last - ta
            f = max(0.01, (room - 1) / span) if span > 0 else 1.0
            rel = [(ta + int((s - ta) * f), ta + max(int((e - ta) * f), int((s - ta) * f) + 1)) for s, e in rel]
        for i, (s, e) in zip(seg, rel):
            out[i] = (s, e, False)
    return {beats[i]['id']: (out[i][0], out[i][1], out[i][2] and beats[i]['id'] not in yearly) for i in range(len(beats))}
