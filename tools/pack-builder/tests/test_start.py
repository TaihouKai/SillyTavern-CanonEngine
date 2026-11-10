"""开局状态: an organization's members and leader when the story begins, from its page (cpb/start.py)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import start  # noqa: E402
from cpb.mock import mock  # noqa: E402


class FakeClient:
    class ledger:
        @staticmethod
        def summary():
            return 'mock'

    def __init__(self):
        self.users = []

    def call(self, task, version, system, user, check=None, max_tokens=None):
        self.users.append(user)
        r = mock(task, user)
        assert not check(r), check(r)
        return r

    def run_many(self, jobs, label):
        return {n: f() for n, f in jobs}


class Project:
    name = 't'

    def __init__(self, d):
        self.d = d

    def p(self, *a):
        return os.path.join(self.d, *a)


def ev(i, day, effects):
    return {'id': i, 'title': i, 'classification': 'SOFT', 'when': {'earliest': {'day': day, 'minute': 0}, 'label': f'D{day}'}, 'entity_ids': [], 'canonical_effects': effects}


class StartTest(unittest.TestCase):
    def test_members_at_the_start_from_the_page(self):
        pack = {'title': 'T', 'entities': [{'id': 'club', 'name': '社团', 'kind': 'organization'}, {'id': 'ann', 'name': '安妮', 'kind': 'person'},
                                          {'id': 'bo', 'name': '博文', 'kind': 'person'}, {'id': 'cy', 'name': '赛琳', 'kind': 'person'}, {'id': 'lone', 'name': '无页组织', 'kind': 'organization'}],
                'events': [ev('e1', 3, [{'op': 'add', 'entity_id': 'club', 'predicate': 'members', 'value': ['bo']}])]}
        wiki = {'社团': '社团的成员有安妮。后来博文加入。'}
        with tempfile.TemporaryDirectory() as d:
            pj, cl = Project(d), FakeClient()
            self.assertEqual(start.generate(pj, cl, pack, wiki), 1)
            # the page and the pack's own changes go in; candidates are the people the page or the changes name
            self.assertEqual(len(cl.users), 1)
            self.assertIn('加入 博文', cl.users[0])
            self.assertIn('ann | 安妮', cl.users[0])
            self.assertNotIn('cy | 赛琳', cl.users[0])
            # each starting member joins the record when they enter the story; one in no event is in the initial state
            # (not at the beginning of time: an organization formed later had members before it existed)
            pack['events'].append(ev('ann-appears', 5, []))
            pack['events'][-1]['entity_ids'] = ['ann']
            self.assertEqual(start.place(pj, {e['id']: e for e in pack['entities']}, pack['events']), [])
            self.assertEqual(pack['events'][-1]['canonical_effects'], [{'op': 'add', 'entity_id': 'club', 'predicate': 'members', 'value': ['ann']}])
            self.assertIn('club', pack['events'][-1]['entity_ids'])
            pack2 = {'entities': pack['entities'], 'events': [ev('e1', 3, [{'op': 'add', 'entity_id': 'club', 'predicate': 'members', 'value': ['bo']}])]}
            self.assertEqual([f['fact'] for f in start.place(pj, {e['id']: e for e in pack['entities']}, pack2['events'])], [{'entity_id': 'club', 'predicate': 'members', 'value': ['ann']}])
        # ids outside the candidates are sent back
        self.assertTrue(start.check_start({'ann'})({'members': ['zed'], 'leader': 'zed'}))
        self.assertFalse(start.check_start({'ann'})({'none': True}))
        # a member the page and the changes never name is sent back (live: 泷壶理后 among 天草式)
        self.assertTrue(start.check_start({'ann', 'bo'}, {'ann'})({'members': ['ann', 'bo'], 'leader': None}))


if __name__ == '__main__':
    unittest.main()
