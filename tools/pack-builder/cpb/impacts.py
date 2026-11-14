"""What an event changes beyond itself must be in its effects: the engine knows only what is written there, and an
aftermath told only in the summary's text (雷蒂丽 locked up, 艾丽莎 gone for good) never reaches the game. The model
reads each event's result, aftermath and impact and lists what they tell that the effects lack, with how long each
holds. The proposals are kept in <work>/impacts.json; a person checks each event's list into the review file
(projects/<name>.review.json) — until then the event is marked for review."""
from .util import log, read_json, write_json

VERSION = 'impacts-2'
BATCH = 8
PREDICATES = {
    'alive': 'true/false — alive or dead',
    'whereabouts': 'where the person is (a place they now live or are based, or where they are for a while)',
    'injury': 'a lasting injury or bodily condition, or its recovery (已痊愈)',
    'status': 'the situation of a person or an organization (被关押, 成为X, 解散, 失去能力, 下落不明…)',
    'condition': 'the physical condition of a place or thing: 完好 / 受损 / 毁坏',
    'form': 'a body or form (变成X, 恢复人形)',
    'knows': 'a secret or truth the person now knows',
    'leader': 'who leads an organization (op add/remove)',
    'members': 'who belongs to an organization (op add: joins; remove: leaves; value a list of names)',
    'ally': 'an organization\'s ally',
    'holder': 'who holds a thing',
}

SYSTEM = """You check a story's events. Each item gives an event's result, aftermath and impact as told, and the effects already recorded for it (what the game will know changed). List what the text tells the event changes in the world BEYOND the event itself — states that still hold after it (someone dead, locked up, gone missing, moved to live elsewhere, injured for weeks, joined or left a group, an organization dissolved, a place destroyed, a thing passing to someone, someone learning a secret) — that the recorded effects do not have yet. Not: what happens only within the event; feelings, impressions, attitudes, resolves, plans and intentions; what a later event of the story does (unless the aftermath says it is now so); anything already recorded (in other words or not); a recovery or the end of a state ("已痊愈", "获救", "已苏醒", "脱身"); a going away with no place ("离开"); someone "dead" (alive false) or "已消灭" who is only presumed dead, apparently dead, or comes back; where someone is only for a scene. Every name you write (the entity, and for holder/members/leader/ally the value) must be one of the item's names: a thing or group the item does not name is left out.
Each addition: "entity" (a name exactly as the item lists it among its names, or as the text writes it), "predicate" (one of the list), "value" (a short phrase in the story's language; for members/leader a list of names or a name), "op" ("set"; "add"/"remove" only for members and leader), and "until": how long it holds — "lasting" (until something changes it), {{"minutes": n}} (over by itself), or "story_end" (until the end of this story).
Predicates:
{predicates}
Most events add nothing: then "add": []. Reply with a JSON object only: {{"items": [{{"n": 1, "add": []}}, {{"n": 2, "add": [{{"entity": "...", "predicate": "...", "value": "...", "op": "set", "until": "lasting"}}]}}]}} with one entry per item, in order."""

USER = """Work: {work}

{items}"""


def _text(ev, names):
    s = ev.get('summary') or {}
    parts = [f'event: {ev["title"]}']
    for k, label in (('result', '结果'), ('aftermath', '后续'), ('impact', '影响')):
        v = s.get(k) if isinstance(s, dict) else None
        if v:
            parts.append(f'{label}：{v}')
    effs = []
    for o in ev.get('canonical_effects') or []:
        f = o.get('fact') or o
        nm = names.get(f['entity_id'], f['entity_id'])
        val = f.get('value')
        if isinstance(val, list):
            val = '、'.join(names.get(v, v) for v in val)
        elif isinstance(val, str) and val in names:
            val = names[val]
        effs.append(f'{nm}.{f["predicate"]} {o.get("op", "set")} {val}')
    parts.append('recorded effects: ' + ('; '.join(effs) if effs else '(none)'))
    parts.append('names: ' + '、'.join(names.get(i, i) for i in ev['entity_ids']))
    return '\n   '.join(parts)


def check(n):
    def c(obj):
        items = obj.get('items') if isinstance(obj, dict) else None
        if not isinstance(items, list) or len(items) != n:
            return [f'reply must be {{"items": [...]}} with exactly {n} entries, one per item']
        bad = []
        for i, x in enumerate(items):
            for a in (x.get('add') or []) if isinstance(x, dict) else []:
                if a.get('predicate') not in PREDICATES:
                    bad.append(f'item {i + 1}: predicate must be one of {", ".join(PREDICATES)}')
                u = a.get('until')
                if not (u in ('lasting', 'story_end') or (isinstance(u, dict) and isinstance(u.get('minutes'), int) and u['minutes'] > 0)):
                    bad.append(f'item {i + 1}: until must be "lasting", "story_end" or {{"minutes": n}}')
        return bad
    return c


def generate(project, client, pack):
    path = project.p('impacts.json')
    known = read_json(path, {}) or {}
    names = {e['id']: e['name'] for e in pack['entities']}
    items = [ev for ev in pack['events'] if ev['id'] not in known]
    log(f'impacts: {len(items)} events to check')
    system = SYSTEM.format(predicates='\n'.join(f'- {k}: {v}' for k, v in PREDICATES.items()))
    batches = [items[i:i + BATCH] for i in range(0, len(items), BATCH)]

    def one(b):
        body = '\n'.join(f'{n}. {_text(ev, names)}' for n, ev in enumerate(b, 1))
        r = client.call('impacts', VERSION, system, USER.format(work=pack.get('title', project.name), items=body), check(len(b)), max_tokens=4000)
        return {ev['id']: {'add': it.get('add') or []} for ev, it in zip(b, r['items'])}

    res = client.run_many([(str(i), (lambda b=b: one(b))) for i, b in enumerate(batches)], 'impacts')
    for r in res.values():
        if isinstance(r, dict):
            known.update(r)
    write_json(path, known)
    log(f'impacts: {sum(1 for v in known.values() if v["add"])} of {len(known)} events with additions — {client.ledger.summary()}')
    return known
