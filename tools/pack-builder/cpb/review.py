"""A person's decisions on what the sources and the models do not settle, kept with the project (projects/<name>.review.json,
in git): the builder applies them on every build, and marks for review (`review` on the event; the pack lint refuses
such a pack) whatever has no decision yet. Nothing a person decided is lost on a rebuild, and nothing undecided slips
through.

  times:   event id -> {"from": "YYYY-MM-DD HH:MM", "to": "YYYY-MM-DD HH:MM", "precision": ..., "note": ...}
           the event's window as checked (precision: minute, range, part_of_day, day, days, month, year)
  ends:    "<event id>|<entity id>|<predicate>" -> {"value": ..., "until": "lasting" | {"minutes": n} | {"event": id} | "drop", "note": ...}
           how long what the event writes holds (decided for that value: another value is undecided again); "drop":
           the state is wrong (the summary misread the source) and leaves the event
  impacts: event id -> {"effects": [{"entity": id, "predicate": ..., "value": ..., "op": "set"|"add"|"remove", "until": ...}], "note": ...}
           what the event changes beyond itself that its summary tells and its effects did not have, checked
  warnings: a canon-lint warning (a part of its text) -> why it is accepted; every other warning is a problem of the
           build's checks
  duplicates: "a|b" -> {"same": bool, "keep": id, "carry": bool}: one event told twice (merged), or not
  events, entities, texts, minds: corrections of what the summaries and models got wrong (cpb/corrections.py)
  start:   organization id -> {"drop": [ids], "at": {id: event id}}: who the start model put in it wrongly (a former
           member, one it only met), or when someone enters it (cpb/start.py)
"""
import datetime as dt
import os

from .util import read_json, write_json

DAY = 1440


def path(project):
    return os.path.splitext(project.path)[0] + '.review.json'


SECTIONS = ('times', 'ends', 'impacts', 'warnings', 'duplicates', 'events', 'entities', 'minds', 'start')


def load(project):
    d = read_json(path(project), {}) or {}
    for k in SECTIONS:
        d.setdefault(k, {})
    d.setdefault('texts', [])
    return d


def save(project, data):
    out = {k: dict(sorted(data.get(k, {}).items())) for k in SECTIONS}
    out['texts'] = list(data.get('texts') or [])
    write_json(path(project), out, indent=1)


def to_tick(origin, s):
    """'YYYY-MM-DD HH:MM' -> pack minutes from the origin date."""
    d, hm = s.strip().split(' ') if ' ' in s.strip() else (s.strip(), '00:00')
    y, m, dd = (int(x) for x in d.split('-'))
    h, mi = (int(x) for x in hm.split(':'))
    return (dt.date(y, m, dd) - origin).days * DAY + h * 60 + mi


def from_tick(origin, t):
    d = origin + dt.timedelta(days=t // DAY)
    m = t % DAY
    return f'{d.year:04d}-{d.month:02d}-{d.day:02d} {m // 60:02d}:{m % 60:02d}'


def end_key(event_id, entity, predicate):
    return f'{event_id}|{entity}|{predicate}'
