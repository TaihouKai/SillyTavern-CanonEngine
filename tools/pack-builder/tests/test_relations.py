"""关系: the pairs (from the pages' entries and shared events, decided in code), the model's reply checked and turned
into the pack's format, attached on every build, fixed in the review file, and checked."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import checks, corrections, relations  # noqa: E402
from cpb.util import write_json  # noqa: E402


class P(dict):
    """A project: its config (spelling) only."""
    name = 'test'


def ev(i, day, ents):
    return {'id': i, 'title': i, 'classification': 'SOFT', 'when': {'earliest': {'day': day, 'minute': 0}, 'latest': {'day': day, 'minute': 30}, 'label': f'D{day}'},
            'entity_ids': list(ents), 'location_ids': [], 'canonical_effects': [], 'outcomes': [], 'summary': {'result': f'{i}的结果。'}}


PEOPLE = [{'id': 'ann', 'name': '安妮', 'kind': 'person', 'aliases': ['小安']}, {'id': 'bo', 'name': '博文', 'kind': 'person', 'aliases': []},
          {'id': 'cy', 'name': '麦野沈利', 'kind': 'person', 'aliases': []}, {'id': 'dee', 'name': '迪', 'kind': 'person', 'aliases': []},
          {'id': 'club', 'name': '社团', 'kind': 'organization', 'aliases': []}]
PAGE_ANN = """开头
==人际关系==
;[[博文]]
:安妮的青梅竹马，叫他「阿博」。
;{{rl|麦野沉利}}
:安妮的上司。
;[[社团]]
:她所在的社团。
==能力==
===博文===
不是关系（能力一节）。
==作中行动==
安妮和博文一起出发。
"""
PAGE_BO = """==日常生活==
===家人===
====安妮====
博文把安妮当妹妹看。
==作中行动==
某日，博文为安妮挡下一击。之后两人和好。
"""


class RelationsTest(unittest.TestCase):
    def test_pairs_come_from_the_pages_and_from_shared_events(self):
        ents = rel = relations.rel_entries(PAGE_ANN)
        self.assertEqual([n for n, _ in rel], [['博文'], ['麦野沉利'], ['社团']])   # 能力 and the plot record are skipped
        self.assertEqual(relations.rel_entries(PAGE_BO), [(['家人'], ''), (['安妮'], '博文把安妮当妹妹看。')][1:])
        pack = {'entities': PEOPLE, 'events': [ev(f'e{i}', i, ['dee', 'bo']) for i in range(3)] + [ev('x', 5, ['ann', 'bo'])]}
        c = relations.candidates(P({'spelling': {'沉利': '沈利'}}), pack, {'安妮': PAGE_ANN, '博文': PAGE_BO}, min_shared=3)
        self.assertEqual(sorted(c), ['ann|bo', 'ann|cy', 'bo|dee'])   # the source's spelling finds 麦野沈利; 社团 is no person
        self.assertIn('青梅竹马', c['ann|bo']['entries']['ann'])
        self.assertIn('妹妹', c['ann|bo']['entries']['bo'])
        self.assertEqual(c['bo|dee']['entries'], {})
        # the lines of a page that mention the other, outside the entries
        self.assertIn('挡下一击', relations.mentions(PAGE_BO, ['安妮']))
        del ents

    def test_the_reply_is_checked_and_turned_into_the_pack_format(self):
        chk = relations.check_relation(['e1', 'e2'], ('安妮', '博文'))
        ok = {'known_before_start': True, 'known_how': '邻居', 'stages': [{'from_event': None, 'bond': '青梅竹马', 'views': [{'who': '安妮', 'calls': '阿博', 'sees': '依赖他'}], 'together': '斗嘴'},
                         {'from_event': 'e2', 'why': '他救了她', 'bond': '恋人', 'views': [{'who': '安妮', 'sees': '信任'}, {'who': '博文', 'sees': '守护'}]}]}
        self.assertEqual(chk(ok), [])
        self.assertEqual(chk({'none': True}), [])
        self.assertIn('known_before_start true goes with stage 1 from_event null', '\n'.join(chk({**ok, 'known_before_start': False})))
        self.assertIn('known_how is empty', '\n'.join(chk({**ok, 'known_how': ''})))
        self.assertIn('they share no event', '\n'.join(relations.check_relation([], ('安妮', '博文'))({'known_before_start': False, 'stages': [{'from_event': 'x', 'bond': 'b', 'views': [{'who': '安妮', 'sees': 's'}]}]})))
        bad = {'known_before_start': False, 'stages': [{'from_event': 'e2', 'bond': 'x', 'views': [{'who': '安妮', 'sees': 'a'}]}, {'from_event': 'e1', 'bond': '', 'views': [{'who': 'A', 'sees': 'a'}]},
                          {'from_event': None, 'bond': 'y', 'views': [{'who': '博文', 'sees': ''}]}, {'from_event': 'zz', 'bond': 'y', 'views': []}, {'from_event': 'e2', 'bond': 'y', 'views': [{'who': '博文', 'sees': 'b'}]}, {'from_event': 'e2', 'bond': 'y', 'views': [{'who': '博文', 'sees': 'b'}]}]}
        out = '\n'.join(chk(bad))
        for m in ('at most 5 stages', 'comes before the stage above', 'bond is empty', 'one of the two names', 'a later stage starts at a listed shared event', 'a view without sees', '"zz" is not one of the listed'):
            self.assertIn(m, out)
        rel = relations.to_pack(ok, 'ann', 'bo', ('安妮', '博文'))
        self.assertEqual(rel['stages'][0], {'from_event': None, 'bond': '青梅竹马', 'views': [{'who': 'ann', 'calls': '阿博', 'sees': '依赖他'}], 'why': '邻居', 'together': '斗嘴'})   # how they knew each other before
        self.assertEqual(rel['stages'][1]['views'], [{'who': 'ann', 'sees': '信任'}, {'who': 'bo', 'sees': '守护'}])
        self.assertEqual(rel['stages'][1]['why'], '他救了她')
        self.assertIsNone(relations.to_pack({'none': True}, 'ann', 'bo', ('安妮', '博文')))

    def test_attach_follows_merges_and_lists_a_stage_whose_event_is_gone(self):
        with tempfile.TemporaryDirectory() as d:
            write_json(f'{d}/ann__old.json', {'version': relations.RELATION_VERSION, 'people': ['ann', 'old'], 'names': ['安妮', '老博'], 'stages': [{'from_event': None, 'bond': '朋友', 'views': [{'who': '老博', 'sees': '照顾她'}]}]})
            write_json(f'{d}/ann__cy.json', {'version': relations.RELATION_VERSION, 'people': ['ann', 'cy'], 'names': ['安妮', '麦野沈利'], 'stages': [{'from_event': None, 'bond': '上下级', 'views': [{'who': '安妮', 'sees': '怕她'}]}, {'from_event': 'gone', 'bond': '仇人', 'views': [{'who': '安妮', 'sees': '恨她'}]}]})
            write_json(f'{d}/bo__dee.json', {'version': relations.RELATION_VERSION, 'people': ['bo', 'dee'], 'names': ['博文', '迪'], 'none': True})
            write_json(f'{d}/bo__old.json', {'version': relations.RELATION_VERSION, 'people': ['bo', 'old'], 'names': ['博文', '老博'], 'stages': [{'from_event': None, 'bond': '同一人', 'views': [{'who': '博文', 'sees': 'x'}]}]})
            write_json(f'{d}/ann__dee.json', {'version': 'relation-0', 'people': ['ann', 'dee'], 'names': ['安妮', '迪'], 'stages': [{'from_event': None, 'bond': '旧的', 'views': []}]})
            pack = {'entities': PEOPLE, 'events': [ev('e1', 1, ['ann', 'bo'])], 'sources': [{'id': 'src'}]}
            n, miss = relations.attach(pack, d, {'old': 'bo'})
        self.assertEqual(n, 1)
        self.assertEqual(pack['relations'], [{'people': ['ann', 'bo'], 'stages': [{'from_event': None, 'bond': '朋友', 'views': [{'who': 'bo', 'sees': '照顾她'}]}], 'source_refs': ['src']}])
        self.assertEqual(len(miss), 2)
        self.assertIn('gone', miss[0])
        self.assertIn('旧版（relation-0）', miss[1])   # a file of an older prompt is never used

    def test_the_review_file_fixes_relations(self):
        def fresh():
            return {'sources': [{'id': 'src'}], 'relations': [
                {'people': ['ann', 'bo'], 'stages': [{'from_event': None, 'bond': '朋友', 'views': [{'who': 'ann', 'calls': '阿博', 'sees': '依赖他'}, {'who': 'bo', 'sees': '照顾她'}], 'together': '斗嘴'}], 'source_refs': ['src']},
                {'people': ['bo', 'dee'], 'stages': [{'from_event': None, 'bond': '同事', 'views': [{'who': 'bo', 'sees': 'x'}]}], 'source_refs': ['src']}]}
        p = fresh()
        miss = corrections.apply_relations(p, {'relations': {
            'dee|bo': {'drop': True},
            'bo|ann': {'edit': {'start': {'bond': '青梅竹马', 'together': '', 'views': {'ann': {'calls': '', 'sees': '信赖他'}, 'bo': None}}, 'e9': {'bond': 'x'}}},
            'ann|cy': {'stages': [{'from_event': None, 'bond': '上下级', 'views': [{'who': 'ann', 'sees': '怕她'}]}]},
            'cy|dee': {'drop': True},
        }})
        self.assertEqual([r['people'] for r in p['relations']], [['ann', 'bo'], ['ann', 'cy']])
        self.assertEqual(p['relations'][0]['stages'][0], {'from_event': None, 'bond': '青梅竹马', 'views': [{'who': 'ann', 'sees': '信赖他'}]})
        self.assertEqual(p['relations'][1]['source_refs'], ['src'])
        self.assertEqual(miss, ['relations.bo|ann.edit.e9：没有这一阶段', 'relations.cy|dee：包里没有这对人物的关系'])
        # a wording fixed everywhere reaches the relations too (people texts)
        p = fresh()
        self.assertEqual(corrections.apply({'events': [], 'entities': [], 'initial_state': {'facts': []}, **p}, {'texts': [{'old': '依赖', 'new': '信赖', 'people': True}]}, people=True), [])

    def test_checks_list_a_stage_neither_takes_part_in_and_pairs_with_many_events_and_none(self):
        evs = [ev(f'e{i}', i, ['ann', 'bo']) for i in range(16)] + [ev('solo', 20, ['ann'])]
        pack = {'entities': PEOPLE, 'events': evs, 'initial_state': {'facts': []}, 'arcs': [],
                'relations': [{'people': ['ann', 'cy'], 'stages': [{'from_event': None, 'bond': '上下级', 'views': [{'who': 'ann', 'sees': '怕她'}]}, {'from_event': 'solo', 'bond': '仇人', 'views': [{'who': 'ann', 'sees': '恨她'}]}], 'source_refs': []}]}
        res, _ = checks.run(P({}), pack)
        got = {t: ls for _, t, _, ls in res}
        self.assertEqual(got['关系的阶段不在两人共同的事件上'], ['安妮–麦野沈利：solo 里没有麦野沈利'])
        self.assertEqual(got['共同事件很多却没有关系的人物对'], ['安妮–博文：16 件'])
        # the relations' texts are read like the rest (a word left in English, a cut-off sentence)
        pack['relations'][0]['stages'][1]['views'][0]['sees'] = '恨她，trust 不再'
        pack['relations'][0]['stages'][0]['together'] = '她一开口他就，'
        probs = {t: ls for _, t, _, ls in checks.text_problems(pack)}
        self.assertEqual([x for x in probs['中文正文里夹着英文词'] if x.startswith('关系')], ['关系 安妮–麦野沈利(solo).安妮.sees：trust——恨她，trust 不再'])
        self.assertTrue(any(x.startswith('关系 安妮–麦野沈利(开局).together') for ls in probs.values() for x in ls), probs)


if __name__ == '__main__':
    unittest.main()
