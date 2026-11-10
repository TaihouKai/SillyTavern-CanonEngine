"""Organization changes as the engine reads them: who joins (op "add") and who leaves (op "remove") an entity set such
as members, and a leader handed over as "remove" of the old one and "add" of the new one. The engine applies them to
the fact as it stands in the game, so whatever play made of it is kept (the player in a canon organization, a leader
the Persona made). This pass walks all events in time order and completes what a single beat cannot know: a new
leader whose predecessor is named elsewhere, and a death that takes the person out of every organization."""
import re

SETS = ('members',)
SLOTS = ('leader',)
# an organization's status that says it is gone: nobody is in it any more (live: 黄金黎明 覆灭 in 1900 with its members
# still listed in 2020)
DISSOLVED = re.compile(r'瓦解|覆灭|解散|解体|灭亡|组织毁灭|全员被歼灭|成员全灭')
NOT_WHOLE = re.compile(r'部分|暂时|一度|分裂|濒临|险些|几乎|面临')


def effect_key(ef):
    """(entity, predicate, op) of an effect; set and unset share the key of a plain write."""
    f = ef.get('fact') or ef
    op = ef.get('op', 'set')
    return f.get('entity_id'), f.get('predicate'), op if op in ('add', 'remove') else 'set'


def effect_parts(ef):
    f = ef.get('fact') or ef
    return f.get('entity_id'), f.get('predicate'), f.get('value')


def change(op, ent, pred, value):
    return {'op': op, 'entity_id': ent, 'predicate': pred, 'value': value}


def complete(events, initial_facts):
    """Walk the events in time order: a new leader removes the one in office (when the event does not), a death
    removes the person from every organization they are in. Outcomes follow the effects added (not for HARD)."""
    sets, slots = {}, {}
    listed = {}     # who a whole list named (the initial state's or an event's): only they can drop out of one
    for f in initial_facts:
        e, p, v = f['fact']['entity_id'], f['fact']['predicate'], f['fact']['value']
        if p in SETS:
            sets[(e, p)] = set(v)
            listed[(e, p)] = set(v)
        elif p in SLOTS:
            slots[(e, p)] = v
    at = lambda x: (x['when']['earliest']['day'] * 1440 + x['when']['earliest']['minute']) if x['when'].get('earliest') else float('inf')  # noqa: E731
    out_by_death = {}       # who a death took out of which sets: a return puts them back
    gone_status = {}        # organizations whose status says they are gone
    for ev in sorted(events, key=at):
        added = []
        dead = set()
        for ef in list(ev['canonical_effects']):
            ent, pred, val = effect_parts(ef)
            op = ef.get('op', 'set')
            if pred in SETS:
                cur = sets.setdefault((ent, pred), set())
                if op == 'add':
                    cur |= set(val)
                    if gone_status.pop(ent, None) and not any(effect_key(x) == (ent, 'status', 'set') for x in ev['canonical_effects']):
                        added.append({'op': 'unset', 'entity_id': ent, 'predicate': 'status'})
                elif op == 'remove':
                    cur -= set(val)
                else:
                    # a whole list (an older pack, or unset) becomes who joins and who leaves against the set as it
                    # stands, as the engine reads it (live: a refined pack kept its base pack's whole-list writes).
                    # Who joined since by a change of their own and is not on the list stays: the list was written
                    # without them, not against them (live: 天草式, joined from a beat, left 英国清教 at the base
                    # pack's next list); an empty list or unset empties the set
                    new = set(val) if op == 'set' and isinstance(val, list) else set()
                    gone = cur - new if not new else (cur & listed.get((ent, pred), set())) - new
                    parts = ([change('add', ent, pred, sorted(new - cur))] if new - cur else []) + ([change('remove', ent, pred, sorted(gone))] if gone else [])
                    whole = lambda x: (x.get('fact') or x).get('entity_id') == ent and (x.get('fact') or x).get('predicate') == pred and x.get('op', 'set') not in ('add', 'remove')  # noqa: E731
                    i = ev['canonical_effects'].index(ef)
                    ev['canonical_effects'][i:i + 1] = parts
                    if any(whole(o) for o in ev.get('outcomes') or []):
                        ev['outcomes'] = [o for o in ev['outcomes'] if not whole(o)] + [dict(x) for x in parts]
                    sets[(ent, pred)] = cur - gone | new
                    listed[(ent, pred)] = new
            elif pred in SLOTS:
                holder = slots.get((ent, pred))
                if op == 'add' and holder not in (None, val):
                    if not any(effect_key(x) == (ent, pred, 'remove') for x in ev['canonical_effects']):
                        added.append(change('remove', ent, pred, holder))
                    slots[(ent, pred)] = val
                elif op == 'add':
                    slots[(ent, pred)] = val
                elif op == 'remove' and holder == val or op == 'unset':
                    slots.pop((ent, pred), None)
                elif op == 'set':
                    slots[(ent, pred)] = val
            elif pred == 'alive' and val is False:
                dead.add(ent)
            elif pred == 'alive' and val is True and out_by_death.get(ent):
                for (org, p_) in out_by_death.pop(ent):
                    if (org, p_) in sets and ent not in sets[(org, p_)]:
                        sets[(org, p_)].add(ent)
                        added.append(change('add', org, p_, [ent]))
            elif pred == 'status' and op == 'set':
                is_gone = isinstance(val, str) and DISSOLVED.search(val) and not NOT_WHOLE.search(val)
                if not is_gone:
                    gone_status.pop(ent, None)
                    continue
                gone_status[ent] = True
                gone = sorted(sets.get((ent, 'members')) or [])
                if gone and not any(effect_key(x) == (ent, 'members', 'remove') for x in ev['canonical_effects']):
                    added.append(change('remove', ent, 'members', gone))
                sets[(ent, 'members')] = set()
                if slots.get((ent, 'leader')) and not any(effect_key(x) == (ent, 'leader', 'remove') for x in ev['canonical_effects']):
                    added.append(change('remove', ent, 'leader', slots.pop((ent, 'leader'))))
        for (org, pred), cur in sets.items():
            gone = sorted(cur & dead)
            if not gone:
                continue
            for g in gone:
                out_by_death.setdefault(g, []).append((org, pred))
            mine = next((x for x in ev['canonical_effects'] + added if effect_key(x) == (org, pred, 'remove')), None)
            if mine:
                mine['value'] = sorted(set(mine['value']) | set(gone))
            else:
                added.append(change('remove', org, pred, gone))
            cur -= set(gone)
            if org not in ev['entity_ids']:
                ev['entity_ids'].append(org)
        for ef in added:
            ev['canonical_effects'].append(ef)
            if ev['classification'] != 'HARD' and ef['op'] != 'unset':     # an outcome states a value
                ev['outcomes'].append(dict(ef))
            if ef['entity_id'] not in ev['entity_ids']:
                ev['entity_ids'].append(ef['entity_id'])
    return events
