"""Organization changes are written as who joins and who leaves (cpb/changes.py)."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import changes  # noqa: E402


def ev(i, day, effects, cls='SOFT'):
    return {'id': i, 'classification': cls, 'when': {'earliest': {'day': day, 'minute': 0}}, 'entity_ids': [], 'outcomes': [], 'canonical_effects': effects}


class ChangesTest(unittest.TestCase):
    def test_whole_list_becomes_joins_and_leaves(self):
        init = [{'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['a', 'b']}}]
        events = [ev('reshuffle', 2, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['b', 'c']}}])]
        events[0]['outcomes'] = [{'entity_id': 'org', 'predicate': 'members', 'value': ['b', 'c']}]
        changes.complete(events, init)
        self.assertEqual(events[0]['canonical_effects'], [changes.change('add', 'org', 'members', ['c']), changes.change('remove', 'org', 'members', ['a'])])
        self.assertEqual(events[0]['outcomes'], [changes.change('add', 'org', 'members', ['c']), changes.change('remove', 'org', 'members', ['a'])])

    def test_whole_list_keeps_who_joined_by_a_change(self):
        # a base pack's list written without someone a beat had added does not take them out (live: 天草式 left
        # 英国清教 at the base pack's next list); an empty list still empties the set
        init = [{'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['a', 'b']}}]
        events = [ev('j', 2, [changes.change('add', 'org', 'members', ['x'])]),
                  ev('list', 3, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['b', 'c']}}]),
                  ev('list2', 4, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['b']}}]),
                  ev('gone', 5, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'members', 'value': []}}])]
        changes.complete(events, init)
        self.assertEqual(events[1]['canonical_effects'], [changes.change('add', 'org', 'members', ['c']), changes.change('remove', 'org', 'members', ['a'])])
        self.assertEqual(events[2]['canonical_effects'], [changes.change('remove', 'org', 'members', ['c'])])
        self.assertEqual(events[3]['canonical_effects'], [changes.change('remove', 'org', 'members', ['b', 'x'])])

    def test_dissolved_organization_has_no_members(self):
        # a status that says the organization is gone takes everyone out (live: 黄金黎明 覆灭 with members in 2020);
        # a split or a near collapse does not
        init = [{'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['a', 'b']}}]
        events = [ev('split', 2, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'status', 'value': '内部分裂'}}]),
                  ev('gone', 3, [{'op': 'set', 'fact': {'entity_id': 'org', 'predicate': 'status', 'value': '覆灭'}}])]
        changes.complete(events, init)
        self.assertEqual(len(events[0]['canonical_effects']), 1)
        self.assertIn(changes.change('remove', 'org', 'members', ['a', 'b']), events[1]['canonical_effects'])
        # members again: it is not gone any more (live: 黄金黎明 覆灭 in 1900, its members brought back in 2020)
        events.append(ev('back', 9, [changes.change('add', 'org', 'members', ['a'])]))
        changes.complete(events, init)
        self.assertIn({'op': 'unset', 'entity_id': 'org', 'predicate': 'status'}, events[2]['canonical_effects'])

    def test_handover_and_death(self):
        init = [{'fact': {'entity_id': 'org', 'predicate': 'members', 'value': ['a', 'b']}},
                {'fact': {'entity_id': 'org', 'predicate': 'leader', 'value': 'a'}}]
        events = [
            ev('b-leads', 2, [changes.change('add', 'org', 'leader', 'b')]),
            ev('c-joins', 3, [changes.change('add', 'org', 'members', ['c'])]),
            ev('a-dies', 4, [{'op': 'set', 'fact': {'entity_id': 'a', 'predicate': 'alive', 'value': False}}]),
        ]
        changes.complete(events, init)
        # the new leader's event removes the one in office
        self.assertIn(changes.change('remove', 'org', 'leader', 'a'), events[0]['canonical_effects'])
        self.assertIn(changes.change('remove', 'org', 'leader', 'a'), events[0]['outcomes'])
        # a death takes the person out of the organization; nothing else is touched
        self.assertIn(changes.change('remove', 'org', 'members', ['a']), events[2]['canonical_effects'])
        self.assertIn('org', events[2]['entity_ids'])
        self.assertEqual(len(events[1]['canonical_effects']), 1)
        self.assertFalse(any(e.get('fact', e).get('predicate') == 'members' and e.get('op') == 'set' for x in events for e in x['canonical_effects']))


if __name__ == '__main__':
    unittest.main()
