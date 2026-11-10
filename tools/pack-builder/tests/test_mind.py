"""思考方式 (cpb/mind.py): who gets one, the reply checks and how it goes into the pack."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import mind  # noqa: E402

OK = {'deliberation': 'habitual', 'sharpness': 'sharp', 'approach': '先摸底再出手', 'thinks_hard_about': '', 'speaks': '只问不答'}


class FakeLedger:
    def summary(self):
        return 'fake'


class FakeClient:
    """Answers every person; records who was asked."""
    def __init__(self):
        self.asked, self.ledger = [], FakeLedger()

    def call(self, task, version, system, user, check=None, max_tokens=None):
        self.asked.append(user.split('Person: ')[1].split('\n')[0])
        return dict(OK)

    def run_many(self, jobs, label):
        return {k: f() for k, f in jobs}


class Project:
    name = 'x'

    def __init__(self, d):
        self.d = d

    def p(self, *a):
        return os.path.join(self.d, *a)


class MindTest(unittest.TestCase):
    def test_check(self):
        check = mind.check_mind(['白井黑子'])
        self.assertEqual(check(OK), [])
        self.assertEqual(check({'none': True}), [])
        self.assertTrue(check({**OK, 'deliberation': 'often'}))
        self.assertTrue(check({**OK, 'approach': ''}))
        self.assertTrue(any('白井黑子' in p for p in check({**OK, 'blind': '总把白井黑子当作威胁'})))

    def test_only_people_with_a_page(self):
        pack = {'title': 'w', 'events': [], 'entities': [
            {'id': 'a', 'name': '甲', 'aliases': [], 'kind': 'person'},
            {'id': 'b', 'name': '路人乙', 'aliases': [], 'kind': 'person'},
            {'id': 'c', 'name': '某地', 'aliases': [], 'kind': 'place'},
            {'id': 'd', 'name': '丁丁', 'aliases': ['丁'], 'kind': 'person'}]}
        with tempfile.TemporaryDirectory() as d:
            cl = FakeClient()
            n = mind.generate(Project(d), cl, pack, {'甲': 'page of 甲', '某地': 'a place', '丁': 'page of 丁'}, out_dir=d)
            self.assertEqual(n, 2)
            self.assertEqual(sorted(cl.asked), ['丁丁（丁）', '甲'])
            self.assertEqual(mind.attach(pack, d), 2)
            self.assertEqual(pack['entities'][0]['mind'], {'deliberation': 'habitual', 'sharpness': 'sharp', 'approach': '先摸底再出手', 'speaks': '只问不答'})
            self.assertNotIn('mind', pack['entities'][1])

    def test_attach_skips_none_and_bad(self):
        with tempfile.TemporaryDirectory() as d:
            for i, body in (('a', {'none': True}), ('b', {**OK, 'sharpness': 'genius'}), ('c', OK)):
                with open(os.path.join(d, f'{i}.json'), 'w', encoding='utf8') as f:
                    json.dump(body, f)
            pk = {'entities': [{'id': x, 'name': x, 'kind': 'person'} for x in 'abc']}
            self.assertEqual(mind.attach(pk, d), 1)
            self.assertEqual([e.get('mind', {}).get('deliberation') for e in pk['entities']], [None, None, 'habitual'])


if __name__ == '__main__':
    unittest.main()
