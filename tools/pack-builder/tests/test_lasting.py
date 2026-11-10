"""Passing statuses of organizations and places leave the pack's states (cpb/lasting.py); an organization "joining"
another on terms that name it made an agreement, it did not become a member (cpb/assemble.py)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import lasting  # noqa: E402
from cpb.assemble import FactState, Report  # noqa: E402
from cpb.mock import mock  # noqa: E402
from cpb.util import write_json  # noqa: E402


def st(ent, val):
    return {'op': 'set', 'fact': {'entity_id': ent, 'predicate': 'status', 'value': val}}


class FakeClient:
    class ledger:
        @staticmethod
        def summary():
            return 'mock'

    def call(self, task, version, system, user, check=None, max_tokens=None):
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


def pack():
    return {'title': 'T', 'entities': [{'id': 'city', 'name': '城', 'kind': 'organization'}, {'id': 'p', 'name': '人', 'kind': 'person'}],
            'events': [{'id': 'e1', 'title': '袭击', 'classification': 'SOFT', 'canonical_effects': [st('city', '被大量元素占据并袭击'), st('p', '被袭击'), st('city', '瓦解')],
                        'outcomes': [st('city', '被大量元素占据并袭击')['fact'], st('city', '瓦解')['fact']]},
                       {'id': 'e2', 'title': '契约', 'classification': 'HARD', 'canonical_effects': [st('city', '遭到袭击')], 'outcomes': [st('city', '遭到袭击')['fact']]}]}


class LastingTest(unittest.TestCase):
    def test_passing_statuses_leave_the_states(self):
        with tempfile.TemporaryDirectory() as d:
            pj, pk = Project(d), pack()
            known = lasting.generate(pj, FakeClient(), pk)
            # a person's status too (live: 一方通行 「黑翼暴走后力竭昏倒」 for a month)
            self.assertEqual(known, {'city|被大量元素占据并袭击': 'passing', 'city|瓦解': 'lasting', 'city|遭到袭击': 'passing', 'p|被袭击': 'passing'})
            n = lasting.apply(pk, pj.p('lasting.json'))
            self.assertEqual(n, 3)
            # the lasting one stays; a HARD event bound to nothing else is SOFT
            self.assertEqual(pk['events'][0]['canonical_effects'], [st('city', '瓦解')])
            self.assertEqual(pk['events'][0]['outcomes'], [st('city', '瓦解')['fact']])
            self.assertEqual(pk['events'][1]['canonical_effects'], [])
            self.assertEqual(pk['events'][1]['classification'], 'SOFT')
            # decided once: a rebuild applies the file
            write_json(pj.p('lasting.json'), known)
            pk2 = pack()
            self.assertEqual(lasting.apply(pk2, pj.p('lasting.json')), 3)

    def test_an_agreement_is_not_membership(self):
        by_id = {'church': {'kind': 'organization'}, 'city': {'kind': 'organization'}, 'coalition': {'kind': 'organization'}}
        fs, out = FactState(by_id, Report()), []
        put = lambda e, p, v, op='set': out.append((e, p, v, op))  # noqa: E731
        fs.apply('church', 'joins', '与学园都市达成合作协议', '学园都市', 'city', put)
        fs.apply('church', 'joins', '与罗马正教、俄罗斯成教联合', '十字教联合', 'coalition', put)
        self.assertEqual(out, [('church', 'ally', 'city', 'set'), ('coalition', 'members', ['church'], 'add')])


if __name__ == '__main__':
    unittest.main()
