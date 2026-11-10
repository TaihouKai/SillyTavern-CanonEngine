"""Deaths that do not hold. A beat writes "dies" for someone thrown into the sea and presumed dead, or for someone who
is brought back later, and the person stays dead for the rest of the pack while they take part in it (live: 上条当麻
"died" in the Arctic Ocean and was dead in 230 later events). For each death followed by the person's presence in a
later event, the model reads the death and the later appearances and tells: "died" (what appears later is a body,
a memory, a ghost or a double), "returned" (died and came back: revived, rebuilt, re-formed) or "survived" (was only
thought dead, or the beat was wrong). `build` then keeps the death, brings the person back at their first later
appearance, or replaces the death by their being missing until then.

Decisions are kept in <work>/deaths.json by event and person, so a rebuild applies them without the model."""
import os

from .util import log, read_json, write_json

DEATHS_VERSION = 'deaths-2'

DEATHS_SYSTEM = """You check deaths recorded in a story's history database. Each item gives a person, the event where the database says they die, and later events where the database has them present. Decide from the accounts:
- "died": they are dead for good after it; what is present later is their body, a memory or flashback, a ghost, a recording, a double or someone else of that name.
- "returned": the accounts say they were really dead and later came back as themselves (revived, rebuilt or re-formed, brought back by a power).
- "survived": they did not die — thought dead, lost, missing, faked; found or rescued alive, or the account says they lived. Falling, sinking or vanishing and turning up alive later is "survived", not "returned".
why: a few words from the accounts. Reply with a JSON object only: {"items": [{"n": 1, "is": "died", "why": ""}, ...]}, one entry per item, in order."""

DEATHS_USER = """Work: {work}

{items}"""


def key_of(eid, person):
    return f'{eid}|{person}'


def _at(e):
    w = e['when']['earliest']
    return w['day'] * 1440 + w['minute']


def _account(e):
    s = e.get('summary') or {}
    return f'「{e["title"]}」（{(e.get("when") or {}).get("label", "")}）{(s.get("course") or "")[:260]} 结果：{(s.get("result") or "")[:120]}'


def later_presence(events):
    """(death event, person, later events with them in the cast) for every death followed by their presence."""
    timed = sorted(events, key=_at)
    out = []
    for i, e in enumerate(timed):
        for ef in e.get('canonical_effects') or []:
            f = ef.get('fact') or {}
            if ef.get('op', 'set') == 'set' and f.get('predicate') == 'alive' and f.get('value') is False:
                who = f['entity_id']
                later = []
                for x in timed[i + 1:]:
                    if any((y.get('fact') or {}).get('entity_id') == who and (y.get('fact') or {}).get('predicate') == 'alive' for y in x.get('canonical_effects') or []):
                        break       # the next death or return of theirs takes over
                    if who in [c['entity_id'] for c in x.get('cast') or []]:
                        later.append(x)
                if later:
                    out.append((e, who, later))
    return out


def check_items(n):
    def check(obj):
        items = obj.get('items') if isinstance(obj, dict) else None
        if not isinstance(items, list) or len(items) != n:
            return [f'reply must be {{"items": [...]}} with exactly {n} entries, one per item']
        bad = [str(x.get('n', '?')) for x in items if not isinstance(x, dict) or x.get('is') not in ('died', 'returned', 'survived')]
        return [f'items {", ".join(bad[:10])}: "is" must be died, returned or survived'] if bad else []
    return check


def generate(project, client, pack):
    path = project.p('deaths.json')
    known = read_json(path, {}) or {}
    names = {e['id']: e['name'] for e in pack['entities']}
    todo = []
    for e, who, later in later_presence(pack['events']):
        k = key_of(e['id'], who)
        if k in known:
            continue
        shown = later[:2] + ([later[-1]] if len(later) > 2 else [])
        todo.append((k, f'{names.get(who, who)} — dies in: {_account(e)}\n   later present ({len(later)} events), e.g.:\n' + '\n'.join(f'   · {_account(x)}' for x in shown)))
    batches = [todo[i:i + 12] for i in range(0, len(todo), 12)]

    def one(b):
        items = '\n\n'.join(f'{n}. {text}' for n, (_, text) in enumerate(b, 1))
        r = client.call('deaths', DEATHS_VERSION, DEATHS_SYSTEM, DEATHS_USER.format(work=pack.get('title', project.name), items=items), check_items(len(b)), max_tokens=2500)
        return {k: {'is': x['is'], 'why': str(x.get('why') or '')[:200]} for (k, _), x in zip(b, r['items'])}

    res = client.run_many([(str(i), (lambda b=b: one(b))) for i, b in enumerate(batches)], 'deaths')
    for r in res.values():
        if isinstance(r, dict):
            known.update(r)
    write_json(path, known)
    log(f'deaths: {sum(1 for v in known.values() if v["is"] != "died")} of {len(known)} deaths do not hold — {client.ledger.summary()}')
    return known


MISSING = '下落不明（被认为已死亡）'
BACK = '重新出现'


def apply(events, path, rep=None):
    """A death that does not hold: "returned" brings the person back (alive) at their first later appearance;
    "survived" becomes their being missing from the death until that appearance. Returns (whereabouts values that
    settle, how many changed)."""
    known = read_json(path, {}) if os.path.isfile(path) else {}
    n = 0
    for e, who, later in later_presence(events):
        d = (known.get(key_of(e['id'], who)) or {}).get('is')
        if d not in ('returned', 'survived'):
            continue
        first = later[0]
        if d == 'survived':
            same = lambda o: (o.get('fact') or o).get('entity_id') == who and (o.get('fact') or o).get('predicate') in ('alive', 'whereabouts')  # noqa: E731
            e['canonical_effects'] = [o for o in e['canonical_effects'] if not same(o)] + [{'op': 'set', 'fact': {'entity_id': who, 'predicate': 'whereabouts', 'value': MISSING}}]
            e['outcomes'] = [o for o in e.get('outcomes') or [] if not same(o)] + ([{'entity_id': who, 'predicate': 'whereabouts', 'value': MISSING}] if e.get('classification') != 'HARD' else [])
            fact = {'entity_id': who, 'predicate': 'whereabouts', 'value': BACK}
        else:
            fact = {'entity_id': who, 'predicate': 'alive', 'value': True}
        if any((o.get('fact') or o).get('entity_id') == who and (o.get('fact') or o).get('predicate') == fact['predicate'] for o in first['canonical_effects']):
            n += 1
            continue        # the appearance itself says where they are (or that they live)
        first['canonical_effects'].append({'op': 'set', 'fact': fact})
        if first.get('classification') != 'HARD':
            first.setdefault('outcomes', []).append(dict(fact))
        if rep:
            rep.add('deaths', f'{who}：{e["id"]} 的死亡{"不成立（被认为已死亡）" if d == "survived" else "之后复活"}，在 {first["id"]}（{first["title"]}）重新出现')
        n += 1
    return {BACK}, n
