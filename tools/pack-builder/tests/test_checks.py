"""Quality checks run by every build (cpb/checks.py): each kind of problem found in packs so far."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import checks  # noqa: E402


class Project(dict):
    name = 't'

    def get(self, k, d=None):
        return super().get(k, d)


def ev(i, day, effects=(), ids=(), cast=(), title=None, cls='SOFT'):
    return {'id': i, 'title': title or i, 'classification': cls, 'when': {'earliest': {'day': day, 'minute': 0}}, 'entity_ids': list(ids),
            'cast': [{'entity_id': c} for c in cast], 'canonical_effects': list(effects), 'outcomes': [], 'required_description': None}


def st(ent, pred, val, op='set'):
    return {'op': op, 'fact': {'entity_id': ent, 'predicate': pred, 'value': val}} if op == 'set' else {'op': op, 'entity_id': ent, 'predicate': pred, 'value': val}


class ChecksTest(unittest.TestCase):
    def test_each_kind(self):
        ents = [{'id': 'a', 'name': '甲某人', 'aliases': [], 'kind': 'person'}, {'id': 'b', 'name': '乙', 'aliases': ['甲某人'], 'kind': 'person'},
                {'id': 'o', 'name': '会', 'aliases': [], 'kind': 'organization'}, {'id': 'x', 'name': '甲某人与乙', 'aliases': [], 'kind': 'person'}]
        pack = {'entities': ents, 'initial_state': {'facts': []}, 'events': [
            ev('e1', 1, [st('a', 'status', '昏迷'), st('a', 'alive', False)], ids=['a']),
            ev('e2', 40, [st('a', 'status', '回家')], ids=['a', 'o'], cast=['a']),
            ev('e3', 41, [st('o', 'status', '瓦解'), st('o', 'members', ['b'], 'add')], ids=['o', 'b']),
            ev('e4', 41, ids=['b'], title='同名'), ev('e5', 41, ids=['b'], title='同名'), ev('e6', 42, cls='HARD', ids=['b'])]}
        res, _ = checks.run(Project(checks={'leading': ['丙']}), pack)
        got = {t: ls for _, t, _, ls in res}
        self.assertEqual(len(got['死后仍在之后事件的在场人物里']), 1)
        self.assertEqual(len(got['人物的一时状态挂了三周以上']), 1)
        self.assertTrue(got['组织瓦解后仍有成员'])
        self.assertEqual(got['几个实体共用一个名字'], ['甲某人：a, b'])
        self.assertEqual(got['几个人写成了一个实体'], ['x 甲某人与乙'])
        self.assertEqual(got['主要人物缺失'], ['丙：没有这个实体'])
        self.assertEqual(len(got['同一天同标题的事件']), 1)
        self.assertEqual(got['HARD 事件缺少要求或结果'], ['e6 e6'])
        lines, summary = checks.section(Project(), pack)
        self.assertIn('## 质量检查', lines)
        self.assertTrue(summary.startswith('checks: '))


if __name__ == '__main__':
    unittest.main()
