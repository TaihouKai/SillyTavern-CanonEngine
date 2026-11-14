"""How long what an event writes holds. Every effect of a pack says it (the pack lint refuses one that does not):
"lasting" (until a later change of the same fact), {"minutes": n}, or {"event": id} (until that event is over).
Who belongs where, who leads, who holds a thing, who knows what and who is alive last by their nature; for every other
state (where someone is, an injury, a status, a condition, a form) the model proposes how it ends, from the event and
the entity's next events. The proposals are kept in <work>/ends.json; a person checks each one into the review file
(projects/<name>.review.json) — until then the event is marked for review."""
from .review import end_key, load as load_review
from .util import log, read_json, write_json

VERSION = 'ends-2'
BATCH = 20
LASTING_PREDICATES = {'alive', 'members', 'leader', 'ally', 'holder', 'knows'}
NEXT = 6

SYSTEM = """You decide how long a state that a story's event leaves something in holds. The game keeps a state until it is over; a state that is really over but kept stays wrong for the rest of the story (a girl still "inside the floating tower" a day after the film ended), and a lasting one ended too early is lost. Each item gives the state, the event that sets it, and the entity's next events in time order (n1, n2, ...; the last of its own story is marked). Decide for each how it ends:
- "lasting": it holds until some later change of the same fact, however long: where someone lives or is based, a lasting injury or disability, a death, a new identity or form for good, imprisonment or exile, a post, an organization's dissolution, a place destroyed, a policy, an alliance.
- "event": it is over once one of the listed next events is over: in hospital until the event that has them out and about, inside a place until the end of the story there (its last event), held captive until their rescue, a fight's transformation until the fight's end. Give the event's n.
- "minutes": it is over by itself after a while, whatever happens next: knocked out (about 30), a short stay somewhere (the scene), exhausted (a few hours), a passing phenomenon. Give the minutes.
- "drop": it is no state to keep: a recovery or the end of an earlier state ("已痊愈", "已恢复", "已苏醒", "获救", "已脱身" — the event ends the earlier state, nothing new holds), a going away with no place ("离开", "离开X", "重新出现"), "已消灭"/"再次现界" for someone who is not gone for good, a feeling, a resolve, an attitude or a plan, or the same thing another state of this event already says.
Prefer "event" when one of the next events is where it plainly ends; "minutes" for what ends by itself within hours; "lasting" only for what would still be so weeks later unless something changes it. A moment's condition (knocked down, unconscious, overpowered, defeated in a fight, a short-lived form) is "minutes" or the event it lasts until, never "lasting". Where someone is: a place they live, work or are based at is lasting; a place they went to for the event (a vehicle, a battlefield, a building they went into, someone else's home, a trip abroad, a hospital stay) ends with their part in that story — "event" or "minutes", never "lasting".
Reply with a JSON object only: {"items": [{"n": 1, "until": "lasting"}, {"n": 2, "until": "event", "event": "n3", "why": "..."}, {"n": 3, "until": "minutes", "minutes": 60, "why": "..."}, {"n": 4, "until": "drop", "why": "..."}]} with one entry per item, in order; "why" in a few words."""

USER = """Work: {work}

{items}"""


def _at(e):
    w = e['when']['earliest']
    return w['day'] * 1440 + w['minute']


def todo(pack, review):
    """[(key, value, event, entity id, predicate, candidates)] for every effect whose end needs deciding and is not decided
    in the review file for its value."""
    chrono = sorted(pack['events'], key=_at)
    pos = {e['id']: i for i, e in enumerate(chrono)}
    last_of_arc = {}
    for e in chrono:
        last_of_arc[e.get('arc_id')] = e['id']
    out = []
    for ev in chrono:
        for ef in ev.get('canonical_effects') or []:
            if ef.get('op', 'set') != 'set':
                continue
            f = ef['fact']
            if f['predicate'] in LASTING_PREDICATES:
                continue
            k = end_key(ev['id'], f['entity_id'], f['predicate'])
            r = review['ends'].get(k)
            if r and r.get('value') == f['value']:
                continue
            nxt = [x for x in chrono[pos[ev['id']] + 1:] if f['entity_id'] in x['entity_ids']][:NEXT]
            last = last_of_arc.get(ev.get('arc_id'))
            if last and last != ev['id'] and last not in [x['id'] for x in nxt]:
                nxt.append(next(x for x in chrono if x['id'] == last))
            out.append((k, f['value'], ev, f['entity_id'], f['predicate'], nxt))
    return out


def check(n, cands):
    def c(obj):
        items = obj.get('items') if isinstance(obj, dict) else None
        if not isinstance(items, list) or len(items) != n:
            return [f'reply must be {{"items": [...]}} with exactly {n} entries, one per item']
        bad = []
        for i, x in enumerate(items):
            u = x.get('until') if isinstance(x, dict) else None
            if u == 'event' and x.get('event') not in cands[i]:
                bad.append(f'item {i + 1}: "event" must be one of {", ".join(cands[i]) or "(none: choose lasting or minutes)"}')
            elif u == 'minutes' and not (isinstance(x.get('minutes'), int) and x['minutes'] > 0):
                bad.append(f'item {i + 1}: "minutes" must be a positive whole number')
            elif u not in ('lasting', 'event', 'minutes', 'drop'):
                bad.append(f'item {i + 1}: "until" must be lasting, event, minutes or drop')
        return bad
    return c


def generate(project, client, pack):
    path = project.p('ends.json')
    known = read_json(path, {}) or {}
    review = load_review(project)
    names = {e['id']: (e['name'], e.get('kind')) for e in pack['entities']}
    items = [x for x in todo(pack, review) if not (known.get(x[0]) and known[x[0]].get('value') == x[1])]
    log(f'ends: {len(items)} states to decide')

    def text(x):
        k, val, ev, ent, pred, nxt = x
        s = ev.get('summary') or {}
        res = (s.get('result') if isinstance(s, dict) else '') or ''
        aft = (s.get('aftermath') if isinstance(s, dict) else '') or ''
        lines = [f'{names.get(ent, (ent, ""))[0]} ({names.get(ent, ("", "?"))[1]}) — {pred}: {val}',
                 f'   set by: {ev["title"]} [{ev["when"]["label"][:40]}]' + (f' — {res[:140]}' if res else '') + (f' 后续：{aft[:140]}' if aft else '')]
        for j, x2 in enumerate(nxt, 1):
            same = any((o.get('fact') or o).get('entity_id') == ent and (o.get('fact') or o).get('predicate') == pred for o in x2.get('canonical_effects') or [])
            lines.append(f'   n{j}: {x2["title"]} [{x2["when"]["label"][:30]}]' + ('（同一故事的最后一个事件）' if x2.get('arc_id') == ev.get('arc_id') and x2 is nxt[-1] else '') + ('（这件事里又改了这一项）' if same else ''))
        return '\n'.join(lines)

    batches = [items[i:i + BATCH] for i in range(0, len(items), BATCH)]

    def one(b):
        body = '\n'.join(f'{n}. {text(x)}' for n, x in enumerate(b, 1))
        cands = [[f'n{j}' for j in range(1, len(x[5]) + 1)] for x in b]
        r = client.call('ends', VERSION, SYSTEM, USER.format(work=pack.get('title', project.name), items=body), check(len(b), cands), max_tokens=4000)
        out = {}
        for x, it in zip(b, r['items']):
            u = it['until']
            until = u if u in ('lasting', 'drop') else {'minutes': it['minutes']} if u == 'minutes' else {'event': x[5][int(it['event'][1:]) - 1]['id']}
            out[x[0]] = {'value': x[1], 'until': until, 'why': str(it.get('why') or '')[:120]}
        return out

    res = client.run_many([(str(i), (lambda b=b: one(b))) for i, b in enumerate(batches)], 'ends')
    for r in res.values():
        if isinstance(r, dict):
            known.update(r)
    write_json(path, known)
    log(f'ends: {len(known)} proposals — {client.ledger.summary()}')
    return known
