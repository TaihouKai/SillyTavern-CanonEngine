"""Which states of organizations, places and things last. A beat writes what it leaves an organization or a place in
as its status, and a status holds until an event writes another one, so a situation of that moment stays the state
for months (live: 学园都市's status was 八成区域停电 from the first night of the story on). The model tells for each
such status whether it lasts until something changes it (瓦解, 被解体, 公开承认魔法存在) or passes of itself (a
blackout, an attack under way, a heatwave); a passing one is left to the event's account, not kept as a state.

The decisions are kept in <work>/lasting.json by entity and value, so a rebuild applies them without the model."""
import os

from .util import log, read_json, write_json

LASTING_VERSION = 'lasting-2'
BATCH = 40

LASTING_SYSTEM = """You sort the states a story's events leave organizations, places and things in. Each item is a status an event wrote for an organization, a place, a city, a thing or the world; the game keeps it as that entity's current state until a later event writes another one, possibly months later. Decide for each:
- "lasting": the entity stays so until something changes it: dissolved, destroyed, taken over, disbanded, under new rule, publicly admits something, an alliance or agreement made, a policy adopted, a ban, a long-term occupation.
- "passing": a situation of that moment that ends by itself within hours or days and that nobody would still give as the entity's state weeks later: a blackout, an attack or invasion under way, a fight in progress, damage being dealt right now, a weather or temperature extreme, traffic paralysed, an evacuation, an alarm, a short lockdown, members being defeated in one fight, a decision about to be carried out, a site taken in one operation, a spell, ritual or phenomenon taking effect that the story undoes or that wears off (people swapped, a barrier up, a building sealed), something starting to happen.
When unsure, answer "lasting".
Reply with a JSON object only: {"items": [{"n": 1, "is": "lasting"}, ...]} with one entry per item, in order."""

PEOPLE_VERSION = 'lasting-people-1'

# a person's status stays the same way (live: 一方通行 「黑翼暴走后力竭昏倒」 and 土御门元春 「昏迷」 for a month)
PEOPLE_SYSTEM = """You sort the states a story's events leave people in. Each item is a status an event wrote for a person; the game keeps it as that person's current state until a later event writes another one, possibly weeks later. Decide for each:
- "lasting": they stay so until something changes it: arrested or imprisoned, under someone's command, joined or left a side, took a post, lost their memory, became something (a god, a ghost, an artificial body), exiled, in hiding, a debt or a vow, a reputation.
- "passing": a situation of that moment that ends by itself within hours or days: knocked out, fainted, unconscious, exhausted, panicking, fighting, fleeing, chasing, cornered, in a standoff, on the way somewhere, about to do something, having just learned or decided something in the scene.
When unsure, answer "lasting".
Reply with a JSON object only: {"items": [{"n": 1, "is": "lasting"}, ...]} with one entry per item, in order."""

LASTING_USER = """Work: {work}

{items}"""


def key_of(ent, value):
    return f'{ent}|{value}'


def statuses(pack, people=False):
    """(event, effect index, entity, value) for every status an event sets on an entity that is not a person (people:
    on a person)."""
    kind = {e['id']: e.get('kind') for e in pack['entities']}
    want = (lambda k: k == 'person') if people else (lambda k: k not in (None, 'person'))  # noqa: E731
    out = []
    for ev in pack['events']:
        for i, ef in enumerate(ev.get('canonical_effects') or []):
            f = ef.get('fact') or {}
            if ef.get('op', 'set') == 'set' and f.get('predicate') == 'status' and want(kind.get(f.get('entity_id'))):
                out.append((ev, i, f['entity_id'], f['value']))
    return out


def check_items(n):
    def check(obj):
        items = obj.get('items') if isinstance(obj, dict) else None
        if not isinstance(items, list) or len(items) != n:
            return [f'reply must be {{"items": [...]}} with exactly {n} entries, one per item']
        bad = [str(x.get('n', '?')) for x in items if not isinstance(x, dict) or x.get('is') not in ('lasting', 'passing')]
        return [f'items {", ".join(bad[:10])}: "is" must be "lasting" or "passing"'] if bad else []
    return check


def generate(project, client, pack):
    """Decides every status of the pack not decided yet; returns the decisions ({key: "lasting"/"passing"})."""
    path = project.p('lasting.json')
    known = read_json(path, {}) or {}
    names = {e['id']: (e['name'], e.get('kind')) for e in pack['entities']}
    for people, system, version in ((False, LASTING_SYSTEM, LASTING_VERSION), (True, PEOPLE_SYSTEM, PEOPLE_VERSION)):
        _decide(project, client, pack, known, names, people, system, version)
    write_json(path, known)
    log(f'lasting: {sum(1 for v in known.values() if v == "passing")} passing of {len(known)} statuses — {client.ledger.summary()}')
    return known


def _decide(project, client, pack, known, names, people, system, version):
    todo, seen = [], set()
    for ev, _, ent, val in statuses(pack, people):
        k = key_of(ent, val)
        if k in known or k in seen:
            continue
        seen.add(k)
        res = (ev.get('summary') or {}).get('result') or ''
        todo.append((k, f'{names[ent][0]} ({names[ent][1]}) — status: {val}\n   event:{ev["title"]}{f" — {res[:160]}" if res else ""}'))
    batches = [todo[i:i + BATCH] for i in range(0, len(todo), BATCH)]

    def one(b):
        items = '\n'.join(f'{n}. {text}' for n, (_, text) in enumerate(b, 1))
        r = client.call('lasting', version, system, LASTING_USER.format(work=pack.get('title', project.name), items=items), check_items(len(b)), max_tokens=3000)
        return {k: x['is'] for (k, _), x in zip(b, r['items'])}

    res = client.run_many([(str(i), (lambda b=b: one(b))) for i, b in enumerate(batches)], 'lasting')
    for r in res.values():
        if isinstance(r, dict):
            known.update(r)


def apply(pack, path):
    """Takes the passing statuses out of the events' effects and outcomes (a HARD event left with no outcome is
    SOFT); returns how many were taken out."""
    known = read_json(path, {}) if os.path.isfile(path) else {}
    if not known:
        return 0
    n = 0
    for ev, i, ent, val in sorted(statuses(pack) + statuses(pack, True), key=lambda x: -x[1]):   # later effects of an event first
        if known.get(key_of(ent, val)) != 'passing':
            continue
        same = lambda o: (o.get('fact') or o).get('entity_id') == ent and (o.get('fact') or o).get('predicate') == 'status' and (o.get('fact') or o).get('value') == val  # noqa: E731
        del ev['canonical_effects'][i]
        ev['outcomes'] = [o for o in ev.get('outcomes') or [] if not same(o)]
        if ev.get('classification') == 'HARD' and not ev['outcomes']:
            # a moment's situation was all its contract bound: no lasting outcome to hold it to (live: ITEM
            # 「追击起床闹钟中」 as a HARD outcome kept for ten months)
            ev['classification'] = 'SOFT'
            ev['required_description'] = None
        n += 1
    return n
