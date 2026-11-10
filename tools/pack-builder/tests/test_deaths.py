"""Deaths that do not hold: died for good, came back, or only thought dead (cpb/deaths.py)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import deaths  # noqa: E402
from cpb.util import write_json  # noqa: E402


def ev(i, day, effects=(), cast=()):
    return {'id': i, 'title': i, 'classification': 'SOFT', 'when': {'earliest': {'day': day, 'minute': 0}, 'label': f'D{day}'},
            'canonical_effects': list(effects), 'outcomes': [dict(x['fact']) for x in effects], 'cast': [{'entity_id': c} for c in cast]}


def dies(who):
    return {'op': 'set', 'fact': {'entity_id': who, 'predicate': 'alive', 'value': False}}


class DeathsTest(unittest.TestCase):
    def test_kept_brought_back_or_missing(self):
        events = [ev('a-dies', 1, [dies('a')]), ev('b-dies', 1, [dies('b')]), ev('c-dies', 1, [dies('c')]), ev('later', 3, cast=['a', 'b', 'c']), ev('d-dies', 4, [dies('d')])]
        self.assertEqual([(e['id'], w, [x['id'] for x in l]) for e, w, l in deaths.later_presence(events)], [('a-dies', 'a', ['later']), ('b-dies', 'b', ['later']), ('c-dies', 'c', ['later'])])
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, 'deaths.json')
            write_json(path, {'a-dies|a': {'is': 'died'}, 'b-dies|b': {'is': 'returned'}, 'c-dies|c': {'is': 'survived'}})
            settled, n = deaths.apply(events, path)
        self.assertEqual(n, 2)
        later = events[3]['canonical_effects']
        self.assertIn({'op': 'set', 'fact': {'entity_id': 'b', 'predicate': 'alive', 'value': True}}, later)
        self.assertIn({'op': 'set', 'fact': {'entity_id': 'c', 'predicate': 'whereabouts', 'value': deaths.BACK}}, later)
        self.assertEqual(events[2]['canonical_effects'], [{'op': 'set', 'fact': {'entity_id': 'c', 'predicate': 'whereabouts', 'value': deaths.MISSING}}])
        self.assertEqual(events[0]['canonical_effects'], [dies('a')])
        self.assertEqual(settled, {deaths.BACK})


if __name__ == '__main__':
    unittest.main()
