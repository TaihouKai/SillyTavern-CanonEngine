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
    def test_windows_against_their_source_and_lint_warnings(self):
        # live 2026-11-14: 40 windows "as the sources give them" did not start at the stated time; 14 lint warnings were left
        import datetime as dt
        def e(i, stated, lo, hi, p='range'):
            return {'id': i, 'title': i, 'when': {'earliest': {'day': lo // 1440, 'minute': lo % 1440}, 'latest': {'day': hi // 1440, 'minute': hi % 1440}, 'precision': p, 'label': f'x；文中：{stated}'}}
        pack = {'events': [e('a', '1月1日17:00', 17 * 60 + 1, 17 * 60 + 31), e('b', '1月1日17:00', 17 * 60, 17 * 60 + 30), e('c', '1月2日', 0, 1439, 'day'),
                           e('d', '1月1日傍晚', 8 * 60, 9 * 60, 'part_of_day'), e('f', '10月18日0:00（UTC+0）', 9 * 60, 9 * 60 + 30), e('g', '1年前1月1日13:00', 12 * 60, 15 * 60)]}
        out = checks.source_mismatches(pack, dt.date(2020, 1, 1), {})
        self.assertEqual(sorted(x.split(' ')[0] for x in out), ['a', 'c', 'd', 'g'])        # f: another time zone, converted by a person
        self.assertEqual(checks.source_mismatches(pack, dt.date(2020, 1, 1), {'a': '17:00 后紧接前一件事', 'c': '核对：按资料'})[0].split(' ')[0], 'c')
        # a person's reason takes it out of the problems but not out of sight
        noted = checks.source_mismatches(pack, dt.date(2020, 1, 1), {'a': '17:00 后紧接前一件事', 'c': '核对：按资料'}, noted=True)
        self.assertEqual(len(noted), 1)
        self.assertTrue(noted[0].startswith('a ') and noted[0].endswith('（理由：17:00 后紧接前一件事）'))
        # an exact time no source states (a clock the summary filled in) and windows that do not hold the order
        pack2 = {'events': [e('h', '9月2日中午', 12 * 60, 12 * 60 + 30), e('i', '', 13 * 60, 13 * 60 + 30), e('j', '下午', 12 * 60, 17 * 60 + 59, 'part_of_day'),
                            e('k', '下午', 12 * 60, 17 * 60 + 59, 'part_of_day')],
                 'edges': [{'from': 'i', 'to': 'j', 'relation': 'enables'}, {'from': 'j', 'to': 'k', 'relation': 'precedes'}]}
        self.assertEqual(sorted(x.split(' ')[0] for x in checks.invented_precision(pack2, {})), ['h', 'i'])
        self.assertEqual(checks.invented_precision(pack2, {'h': '中午，送别时刻据番外推定'}), [checks.invented_precision(pack2, {})[1]])
        self.assertEqual([x.split(' ')[0] for x in checks.order_mismatches(pack2)], ['i'])   # j may open before i does
        lint = {'warnings': [{'path': '/events/1/when', 'message': '"x" depends on "y" but its window overlaps'}]}
        self.assertEqual(len(checks.lint_findings(lint, {})), 1)
        self.assertEqual(checks.lint_findings(lint, {'"x" depends on "y"': 'they run in parallel in the source'}), [])

    def test_version_follows_content(self):
        # live: six rebuilds of the Toaru pack, one in a new format, all went out as 3.0.0
        import json
        import tempfile
        base = {'pack_version': '3.0.0', 'entities': [], 'initial_state': {'facts': []}, 'events': [], 'description': 'a'}
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8') as f:
            json.dump(base, f)
        try:
            def problems(pack):
                res, _ = checks.run(Project(pack={'release': f.name}), pack)
                return {t: ls for _, t, _, ls in res}['历史包变了，版本号没变']
            self.assertEqual(problems(dict(base)), [])                                        # the released pack itself
            self.assertEqual(len(problems(dict(base, description='b'))), 1)                    # changed, same version
            self.assertEqual(problems(dict(base, description='b', pack_version='4.0.0')), [])  # changed, raised
            self.assertEqual(len(problems(dict(base, pack_version='2.9.0'))), 1)               # lower than released
        finally:
            os.unlink(f.name)

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
