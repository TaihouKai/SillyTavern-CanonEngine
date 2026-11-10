"""The master clock (code, no model): where each beat sits on the home side's lived time.

Chapters follow each other in story order. A chapter starts at its anchor from the project file, or a gap after
the previous one. Inside a chapter, beats follow the time cues of the summaries (right after, later that day, next
day, N days later, time of day, duration). When the beats before an anchor run past it, that stretch is
compressed to fit, so the anchor holds. Everything except the anchors is an editorial estimate, and says so.
"""
import datetime as dt
import re

HOUR = {'dawn': 5, 'morning': 8, 'noon': 12, 'afternoon': 15, 'evening': 18, 'night': 21}
DAY = 1440


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
    m = TIME_RX.search(text or '')
    if not m:
        return None
    h, mi = int(m.group(2)), int(m.group(3) or 0)
    if m.group(1) in ('下午', '晚上', 'PM', '午後') and h < 12:
        h += 12
    return h * 60 + mi if 0 <= h < 24 and 0 <= mi < 60 else None


def place_beat(cursor, time):
    """Start of a beat given the previous beat's end (cursor) and its time cues."""
    after, tod = time['after_previous'], time['time_of_day']
    h = HOUR.get(tod)
    said = time_of(time.get('stated'))
    if said is not None and after in ('continuous', 'same_day', 'unknown'):
        at = (cursor // DAY) * DAY + said      # a clock time the text states: that time today, or tomorrow
        return at if at >= cursor else at + DAY
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


def windows(order, pos):
    """Event windows: from a beat's start to just before the next beat, at most a day; never overlapping."""
    out = {}
    for i, bid in enumerate(order):
        s = pos[bid]['start']
        e = pos[bid]['end']
        nxt = pos[order[i + 1]]['start'] if i + 1 < len(order) else None
        hi = max(e, s)
        if nxt is not None:
            hi = min(max(hi, min(nxt - 1, s + DAY)), nxt - 1) if nxt > s else s
        else:
            hi = max(hi, s + 120)
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


def place_arc(origin, arc, beats):
    """{beat id: (start, end, dated)} for an arc's beats, in the pack's minutes."""
    s0, e0 = _day(origin, arc['start']), _day(origin, arc['end'])
    lo, hi = s0 * DAY + 8 * 60, e0 * DAY + 22 * 60
    fixed, past = {}, {}
    for i, b in enumerate(beats):
        t = b['time']
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
                past[beats[i]['id']] = (d * DAY + (c if c is not None else 9 * 60), d * DAY + (c if c is not None else 9 * 60) + max(5, t['duration_minutes']), True)
                continue
            if s0 - 3 <= d <= e0 + 3:
                c = _clock(t.get('clock'))
                if c is None:
                    c = time_of(t.get('stated'))
                if c is None and t.get('time_of_day') in HOUR:
                    c = HOUR[t['time_of_day']] * 60
                prev = fixed[max(fixed)] if fixed else None
                if c is None:
                    # no time of day: after the previous dated beat of that day, else the morning
                    c = prev % DAY + 30 if prev is not None and prev // DAY == d else 9 * 60
                elif prev is not None and prev // DAY == d and d * DAY + c <= prev and t['after_previous'] != 'parallel' and _clock(t.get('clock')) is None:
                    # only a part of the day ("morning") that would put it before the beat it follows: right after it
                    c = prev % DAY + 30
                if prev is not None and d * DAY + c == prev and t['after_previous'] != 'parallel':
                    c += 10
                fixed[i] = d * DAY + c
    if past:
        rest = [b for b in beats if b['id'] not in past]
        keep = {b['id']: j for j, b in enumerate(rest)}
        out = place_arc(origin, arc, rest) if rest else {}
        return {**out, **past}
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
    return {beats[i]['id']: out[i] for i in range(len(beats))}
