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
