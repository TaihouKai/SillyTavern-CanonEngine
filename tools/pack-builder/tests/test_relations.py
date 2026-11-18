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

    def test_facts_are_dated_stages_get_only_the_facts_true_when_they_start_and_the_writing_is_checked(self):
        ids = ['e1', 'e2', 'e3']
        chk = relations.check_facts(ids)
        facts = [{'at': 'before', 'fact': '青梅竹马'}, {'at': 'e1', 'fact': '一起上学'}, {'at': 'e2', 'fact': '他救了她'}, {'at': 'e3', 'fact': '后来才有的事'}]
        ok = {'known_before_start': True, 'known_how': '邻居', 'facts': facts, 'stages': [{'from_event': None, 'why': ''}, {'from_event': 'e2', 'why': '他救了她'}]}
        self.assertEqual(chk(ok), [])
        self.assertEqual(chk({'none': True}), [])
        self.assertIn('known_before_start true goes with stage 1 from_event null', '\n'.join(chk({**ok, 'known_before_start': False})))
        self.assertIn('"before" only when they knew each other', '\n'.join(chk({**ok, 'known_before_start': False, 'stages': [{'from_event': 'e1'}]})))
        self.assertIn('known_how is empty', '\n'.join(chk({**ok, 'known_how': ''})))
        self.assertIn('they share no event', '\n'.join(relations.check_facts([])({'known_before_start': False, 'facts': [{'at': 'x', 'fact': 'f'}], 'stages': [{'from_event': 'x'}]})))
        bad = {'known_before_start': True, 'known_how': 'x', 'facts': [{'at': 'zz', 'fact': 'f'}, {'at': 'e1', 'fact': ''}], 'stages': [{'from_event': None}, {'from_event': 'e3'}, {'from_event': 'e1'}, {'from_event': None}, {'from_event': 'e2'}, {'from_event': 'e3'}]}
        out = '\n'.join(chk(bad))
        for m in ('at most 5 stages', 'comes before the stage above', 'a later stage starts at a listed shared event', 'fact 2 is empty', 'at "zz" is not', 'no fact is dated at its event "e3"'):
            self.assertIn(m, out)
        # a stage shows only what is true when it starts: never a later fact (a fact between two starts waits)
        per = relations.stage_facts(facts, [None, 'e2'], ids)
        self.assertEqual([(f['fact'], new) for f, new in per[0]], [('青梅竹马', False)])
        self.assertEqual([(f['fact'], new) for f, new in per[1]], [('青梅竹马', False), ('一起上学', False), ('他救了她', True)])
        self.assertEqual([f['fact'] for f in relations.unshown(facts, [None, 'e2'], ids)], ['后来才有的事'])
        # the writing: one stage per start, a bond that is a state, each side one of the two
        w = relations.check_write([None, 'e2'], ('安妮', '博文'))
        good = {'stages': [{'bond': '青梅竹马，斗嘴不断却离不开', 'views': [{'who': '安妮', 'sees': '依赖他'}], 'together': '斗嘴'},
                           {'bond': '恋人', 'views': [{'who': '安妮', 'sees': '信任'}, {'who': '博文', 'sees': '守护'}], 'together': '形影不离'}]}
        self.assertEqual(w(good), [])
        out = '\n'.join(w({'stages': [{'bond': '从敌对转为战友', 'views': [{'who': 'A', 'sees': ''}]}]}))
        self.assertIn('write both sides', chr(10).join(w({'stages': [good['stages'][0], {**good['stages'][1], 'views': good['stages'][1]['views'][:1]}]})))
        self.assertIn('together is empty', chr(10).join(w({'stages': [good['stages'][0], {**good['stages'][1], 'together': ''}]})))
        for m in ('write exactly 2 stages', 'not a transition', 'one of the two names', 'a view without sees'):
            self.assertIn(m, out)
        # a side the facts do not tell is left out, not written as "the facts do not say"
        self.assertIn('a view about missing facts', '\n'.join(w({'stages': [good['stages'][0], {**good['stages'][1], 'views': [good['stages'][1]['views'][0], {'who': '博文', 'sees': '（此阶段事实未给出他的态度。）'}]}]})))
        # a fact told "before" that names a date after the story's start is a later fact
        st = (2020, 7, 19)
        self.assertEqual(relations.story_dates_in('9月未吹参加交流会；12月4日买礼物', st), ['9月', '12月4日'])
        self.assertEqual(relations.story_dates_in('一年前8月1日帮她保释；2019年10月相识；7月16日认识', st), [])
        cb = relations.check_facts(ids, start=st)
        self.assertIn('is after its start', '\n'.join(cb({**ok, 'facts': [{'at': 'before', 'fact': '9月两人一起开茶话会'}, *facts[1:]]})))
        self.assertEqual(cb(ok), [])
        self.assertIn('after the story starts', chr(10).join(cb({**ok, 'known_how': '9月15日一起探望过黑子'})))
        # stage 1 at an event starts where they first deal with each other: a fact is dated there
        self.assertIn('stage 1: no fact is dated at its event "e1"', '\n'.join(chk({'known_before_start': False, 'facts': [{'at': 'e2', 'fact': '他救了她'}], 'stages': [{'from_event': 'e1'}, {'from_event': 'e2'}]})))
        rel = relations.to_pack({'known_before_start': True, 'known_how': '邻居', 'stages': [{**good['stages'][0], 'from_event': None}, {**good['stages'][1], 'from_event': 'e2', 'why': '他救了她'}]}, 'ann', 'bo', ('安妮', '博文'))
        self.assertEqual(rel['stages'][0], {'from_event': None, 'bond': '青梅竹马，斗嘴不断却离不开', 'views': [{'who': 'ann', 'sees': '依赖他'}], 'why': '邻居', 'together': '斗嘴'})   # how they knew each other before
        self.assertEqual(rel['stages'][1]['views'], [{'who': 'ann', 'sees': '信任'}, {'who': 'bo', 'sees': '守护'}])
        self.assertEqual(rel['stages'][1]['why'], '他救了她')
        self.assertIsNone(relations.to_pack({'none': True}, 'ann', 'bo', ('安妮', '博文')))

    def test_address_forms_are_checked_and_dated_by_the_verified_stages(self):
        from cpb import address
        # a fact shows from the first verified stage at or after its event (the stages may start elsewhere than those
        # the facts were written for)
        evs = {'e1': {'when': {'earliest': {'day': 1}}}, 'e2': {'when': {'earliest': {'day': 5}}}, 'e3': {'when': {'earliest': {'day': 9}}}}
        facts = [{'at': 'before', 'fact': '邻居'}, {'at': 'e2', 'fact': '改口叫阿博'}, {'at': 'e3', 'fact': '后来的事'}]
        self.assertEqual(address.stage_facts(facts, [{'from_event': None}, {'from_event': 'e2'}], evs), [['邻居'], ['邻居', '改口叫阿博']])
        chk = address.check([['安妮'], ['安妮', '博文']], {'安妮': '博文', '博文': '安妮'})
        ok = {'stages': [{'n': 1, 'views': [{'who': '安妮', 'address': []}]}, {'n': 2, 'views': [{'who': '安妮', 'address': [{'term': '阿博', 'use': 'usually', 'when': ''}, {'term': '笨蛋', 'use': 'sometimes', 'when': '生气时'}]}, {'who': '博文', 'address': []}]}]}
        self.assertEqual(chk(ok), [])
        bad = lambda f: '\n'.join(chk({'stages': [ok['stages'][0], {'n': 2, 'views': [{'who': '安妮', 'address': f}]}]}))  # noqa: E731
        for term in ('「阿博」', '“老大”或“博文”', '以名字直呼博文', '老大（昔日称呼）', '阿博、博文'):
            self.assertIn('only the form itself', bad([{'term': term, 'use': 'usually'}]))
        self.assertIn('Japanese kana', bad([{'term': '博文さん', 'use': 'usually'}]))
        self.assertIn('plain full name', bad([{'term': '博文', 'use': 'usually'}]))
        self.assertIn('say when', bad([{'term': '阿博', 'use': 'sometimes', 'when': ''}]))
        self.assertIn('is always, so it is their only form', bad([{'term': '阿博', 'use': 'always'}, {'term': '笨蛋', 'use': 'sometimes', 'when': '生气时'}]))
        self.assertIn('not one of the sides listed', '\n'.join(chk({'stages': [{'n': 1, 'views': [{'who': '博文', 'address': []}]}, ok['stages'][1]]})))
        self.assertIn('give exactly 2 stages', '\n'.join(chk({'stages': ok['stages'][:1]})))

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

    def test_the_verified_relations_are_what_the_pack_gets_and_a_builder_run_only_proposes(self):
        golden = {'pairs': {
            'ann|bo': {'people': ['ann', 'bo'], 'stages': [{'from_event': None, 'bond': '青梅竹马', 'views': [{'who': 'old', 'sees': '信赖她'}]}], 'notes': ['开局时就认识']},
            'ann|cy': {'people': ['ann', 'cy'], 'stages': [{'from_event': 'gone', 'bond': '上下级', 'views': [{'who': 'ann', 'sees': '怕她'}]}]}},
            'rejected': {'bo|dee': '只是同场'}}
        pack = {'entities': PEOPLE, 'events': [ev('e1', 1, ['ann', 'bo'])], 'sources': [{'id': 'src'}]}
        n, miss = relations.attach_golden(pack, golden, {'old': 'bo'})
        self.assertEqual(pack['relations'], [{'people': ['ann', 'bo'], 'stages': [{'from_event': None, 'bond': '青梅竹马', 'views': [{'who': 'bo', 'sees': '信赖她'}]}], 'source_refs': ['src']}])
        self.assertEqual((n, len(miss)), (1, 1))
        self.assertIn('gone', miss[0])                       # never guessed at
        self.assertEqual(golden['pairs']['ann|bo']['stages'][0]['views'][0]['who'], 'old')   # the golden file is not touched
        # a run proposes: new pairs to read (not the rejected ones), pairs whose stages start elsewhere, and how the
        # pairs fixed by hand came out
        gen = {'ann|bo': {'people': ['ann', 'bo'], 'stages': [{'from_event': 'e1', 'bond': '朋友', 'views': []}]},
               'bo|dee': {'people': ['bo', 'dee'], 'stages': [{'from_event': None, 'bond': '同事', 'views': []}]},
               'cy|dee': {'people': ['cy', 'dee'], 'stages': [{'from_event': None, 'bond': '邻居', 'views': []}]}}
        cmp = relations.compare(golden, gen)
        self.assertEqual(cmp['only_builder'], ['cy|dee'])
        self.assertEqual(cmp['only_golden'], ['ann|cy'])
        self.assertEqual(cmp['starts_differ'], [{'pair': 'ann|bo', 'golden': [None], 'builder': ['e1']}])
        self.assertEqual(cmp['fixed'], {'ann|bo': "starts ['e1'] (verified [None])"})
        relations.adopt(golden, gen, ['cy|dee'], '读过：邻居')
        self.assertEqual(golden['pairs']['cy|dee']['notes'], ['读过：邻居'])

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


    def test_a_change_at_no_shared_event_is_an_orphan_listed_until_a_person_settles_it(self):
        # user 2026-11-18: a relation changes only through an event both are in; a fact the builder can date at none
        # of their shared events is returned (never dropped), and the checks list it until the pack has the event
        check = relations.check_facts(['e1'])
        base = {'none': False, 'known_before_start': False, 'known_how': '', 'facts': [{'at': 'e1', 'fact': '初识'}], 'stages': [{'from_event': 'e1', 'why': ''}]}
        self.assertEqual(check(base), [])
        self.assertEqual(check({**base, 'orphans': [{'fact': '成了保镖', 'when': '十月', 'what': ''}]}), ['orphan 1: fact, when and what must all be given'])
        self.assertIn('List it under orphans instead', relations.FACTS_SYSTEM)
        self.assertNotIn('cannot be dated: leave it out', relations.FACTS_SYSTEM)
        with tempfile.TemporaryDirectory() as d:
            write_json(f'{d}/ann__bo.json', {'people': ['ann', 'bo'], 'facts': [], 'stages': [], 'orphans': relations.clean_orphans([
                {'fact': '博文成了安妮的保镖', 'when': '10月', 'what': '安妮雇博文'}, {'fact': '', 'when': 'x', 'what': 'y'}])})
            pack = {'entities': PEOPLE, 'events': [ev('e1', 1, ['ann', 'bo']), ev('hire', 5, ['ann'])], 'calendar': {'origin_label': '2020-07-19'}}
            golden = {'pairs': {'ann|bo': {'people': ['ann', 'bo'], 'stages': [{'from_event': 'e1', 'bond': '同学', 'views': []}]}}}
            open_, bad = relations.orphan_problems(golden, d, pack)
            self.assertEqual(open_, ['安妮–博文（ann|bo）：博文成了安妮的保镖｜时间：10月｜所缺事件：安妮雇博文'])
            self.assertEqual(bad, [])
            # settled by an event that must list both and start a stage of the pair
            golden['orphans'] = {'ann|bo': {'博文成了安妮的保镖': {'event': 'hire'}}}
            self.assertEqual(relations.orphan_problems(golden, d, pack), ([], ['安妮–博文（ann|bo）：「博文成了安妮的保镖」→ 事件 hire 没有列出两人']))
            pack['events'][1]['entity_ids'].append('bo')
            self.assertEqual(relations.orphan_problems(golden, d, pack)[1], ['安妮–博文（ann|bo）：「博文成了安妮的保镖」→ 事件 hire 处没有这对关系的阶段'])
            golden['pairs']['ann|bo']['stages'].append({'from_event': 'hire', 'why': '雇佣', 'bond': '雇主与保镖', 'views': []})
            self.assertEqual(relations.orphan_problems(golden, d, pack), ([], []))
            # or accepted with a reason; a decision about a fact the builder no longer gives is stale
            golden['orphans'] = {'ann|bo': {'博文成了安妮的保镖': {'accepted': '资料没有时间'}, '旧的': {'accepted': 'x'}}}
            self.assertEqual(relations.orphan_problems(golden, d, pack), ([], ['安妮–博文（ann|bo）：「旧的」已不是生成器给出的孤儿事实（删掉这条决定）']))

    def test_an_opening_stage_that_names_a_date_after_the_start_is_listed(self):
        pack = {'entities': PEOPLE, 'events': [], 'calendar': {'origin_label': '2020-07-19'}}
        golden = {'pairs': {'ann|bo': {'people': ['ann', 'bo'], 'stages': [{'from_event': None, 'bond': '同学', 'why': '9月起成了搭档', 'views': []}]},
                            'ann|cy': {'people': ['ann', 'cy'], 'stages': [{'from_event': None, 'bond': '旧识', 'why': '一年前8月1日相识', 'views': []}]}}}
        self.assertEqual(relations.opening_dates(golden, pack), ['安妮–博文（ann|bo）：开局阶段写了 9月'])

    def test_an_event_the_pack_is_missing_is_added_from_the_review_file(self):
        pack = {'entities': PEOPLE, 'events': [ev('e1', 1, ['ann', 'bo'])], 'arcs': [], 'calendar': {'origin_label': '2020-07-19'}, 'sources': [{'id': 'src'}]}
        rv = {'added_events': {
            'x.hire': {'title': '安妮雇博文当保镖', 'summary': {'course': '安妮雇了博文。', 'result': '博文成了她的保镖。'}, 'when': {'from': '2020-07-21 10:00', 'to': '2020-07-21 12:00', 'label': '约2020-07-21 上午；文中：第三天'}, 'entity_ids': ['ann', 'bo'], 'source': '某页「人际关系」'},
            'x.bad': {'title': '缺资料出处', 'summary': {}, 'when': {'from': '2020-07-21 10:00', 'to': '2020-07-21 12:00', 'label': 'x'}, 'entity_ids': ['ann']},
            'e1': {'title': '重号', 'summary': {}, 'when': {}, 'entity_ids': ['ann'], 'source': 's'}}}
        miss = corrections.apply(pack, rv)
        e = next(x for x in pack['events'] if x['id'] == 'x.hire')
        self.assertEqual((e['when']['earliest'], e['when']['latest'], e['entity_ids'], e['classification'], e['source_refs']), ({'day': 2, 'minute': 600}, {'day': 2, 'minute': 720}, ['ann', 'bo'], 'FREE', ['src']))
        self.assertIn('人工补充', e['author_note'])
        self.assertEqual(sorted(m.split('：')[0] for m in miss), ['added_events.e1', 'added_events.x.bad'])


if __name__ == '__main__':
    unittest.main()
