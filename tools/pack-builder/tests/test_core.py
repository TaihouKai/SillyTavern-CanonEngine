"""Offline tests: parsing, dates, years, names, timeline, model-output handling, and the whole pipeline with the
stand-in model ending in a pack that Canon Engine's linter accepts. Run: python -m unittest discover -s tests"""
import json
import os
import shutil
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import assemble, dates, names, report, steps, timeline  # noqa: E402
from cpb.adapters import atlas, atlas_script  # noqa: E402
from cpb.config import Project, load_global  # noqa: E402
from cpb.llm import Client, extract_json, cost_of, is_peak  # noqa: E402
from cpb.mock import mock  # noqa: E402
from cpb.util import write_json, write_text  # noqa: E402

SCRIPT = """＄01-00-01-01-1-0
[charaSet A 8001000 0 玛修]
[charaSet B 98003000 1 ？？？]
[scene 10000]
[charaFadein A 0.1 1]
＠玛修
前辈，[r]这里是[#特异点:とくいてん]。
[k]
＠B：？？？
[%1]，听得到吗？
[k]
？1：听得到
？2：[&他:她]听不清
＠玛修
（只在选项2）
[k]
？！
＠
城市在燃烧。
[k]
"""


class ParseTest(unittest.TestCase):
    def test_script(self):
        ps = atlas_script.parse('x', SCRIPT, '立香', 'male')
        self.assertEqual(ps.cast['A']['figure'], 8001000)
        self.assertIn(8001000, ps.shown)
        self.assertNotIn(98003000, ps.shown)          # preloaded only
        says = [i for i in ps.items if i['t'] == 'say']
        self.assertEqual(says[0]['text'], '前辈，这里是特异点。')
        self.assertEqual(says[1]['text'], '立香，听得到吗？')
        self.assertEqual(says[1]['fig'], 98003000)      # "＠B：？？？" speaks from slot B
        ch = [i for i in ps.items if i['t'] == 'choice'][0]
        self.assertEqual(ch['options'], ['听得到', '他听不清'])
        self.assertEqual(says[2]['option'], 2)
        self.assertEqual([i for i in ps.items if i['t'] == 'narr'][0]['text'], '城市在燃烧。')
        text = atlas_script.render(ps.items, lambda f, l: l, '立香')
        self.assertIn('【立香的可选回应】1. 听得到 ／ 2. 他听不清', text)
        self.assertIn('（选项2）玛修：（只在选项2）', text)

    def test_years_positional(self):
        cn = '人类会在2016年灭亡，2017年不会到来。1431年的法国。'
        jp = '２０１５年に滅び、２０１６年は来ない。1431年のフランス。'
        self.assertEqual(atlas.apply_years(cn, {}, jp), '人类会在2015年灭亡，2016年不会到来。1431年的法国。')
        # whole dates: CN moved Solomon to its own release day
        self.assertEqual(atlas.apply_years('确定为2018年1月26日为止', {}, '２０１６年１２月３１日に確定するまで'), '确定为2016年12月31日为止')
        # counts differ: fall back to the learned map
        self.assertEqual(atlas.apply_years('2018年', {2018: 2017}, '２０１７年と２０１８年'), '2017年')

    def test_figure_key(self):
        svts = {800100: {'type': 'heroine', 'name': '玛修·基列莱特'}, 100100: {'type': 'normal', 'name': '阿尔托莉雅'}}
        self.assertEqual(atlas.figure_key(8001000, svts)[0], 's800100')
        self.assertEqual(atlas.figure_key(1001100, svts)[0], 's100100')     # a costume figure
        self.assertEqual(atlas.figure_key(98003003, svts)[0], 'f98003')     # an NPC's expression variant


class DatesTest(unittest.TestCase):
    def test_scan(self):
        f = dates.scan('坐标　公元2004年　1月　30日　日本。约90天后浮上。公元前2600年的苏美尔。三天后再见。December 26, 2019.')
        kinds = [(x['kind'], dates.label(x['value'])) for x in f]
        self.assertIn(('date', '2004年1月30日'), kinds)
        self.assertIn(('duration', '90天后'), kinds)
        self.assertIn(('bc_year', '公元前2600年'), kinds)
        self.assertIn(('duration', '3天后'), kinds)
        self.assertIn(('date', '2019年12月26日'), kinds)

    def test_cn_int(self):
        self.assertEqual(dates.cn_int('十二'), 12)
        self.assertEqual(dates.cn_int('一百五十'), 150)
        self.assertEqual(dates.cn_int('90'), 90)


class NamesTest(unittest.TestCase):
    def test_expand(self):
        self.assertEqual(names.expand('阿塔兰忒、卡米拉、骑士迪昂等从者'), ['阿塔兰忒', '卡米拉', '骑士迪昂'])
        self.assertEqual(names.expand('藤丸立香一行'), ['藤丸立香'])
        self.assertEqual(names.expand('玛修'), ['玛修'])

    def test_resolver(self):
        r = names.Resolver()
        r.add('阿尔托莉雅·潘德拉贡〔Alter〕', 'a', strong=True)
        r.add('吉尔', 'g1')
        r.add('吉尔', 'g2')
        self.assertEqual(r.get('Saber〔阿尔托莉雅·潘德拉贡〔Alter〕〕'), 'a')
        self.assertIsNone(r.get('吉尔'))                 # two people use it
        self.assertEqual(r.get('阿尔托莉雅·潘德拉贡〔Alter〕（通讯）'), 'a')

    def test_names_go_to_their_most_frequent_owner(self):
        # several figure sets carry one person's name; the name belongs to the character it is used for most
        corpus = {'characters': {
            's1': {'name': '玛修·基列莱特（shielder）', 'labels': {'玛修': 900}, 'servant': {'id': 1, 'class': 'shielder'}},
            'f1': {'name': '玛修', 'labels': {'玛修': 100, '温基': 20}, 'servant': None},
            'f2': {'name': '玛修', 'labels': {'玛修': 3}, 'servant': None},
        }}
        r = names.from_corpus(corpus, {})
        self.assertEqual(r.get('玛修'), 's1')
        self.assertEqual(r.get('玛修·基列莱特'), 's1')
        self.assertEqual(r.get('温基'), 'f1')


class TimelineTest(unittest.TestCase):
    def test_place(self):
        t = {'after_previous': 'next_day', 'days': 0, 'time_of_day': 'evening', 'duration_minutes': 30}
        self.assertEqual(timeline.place_beat(600, t), 1440 + 18 * 60)
        t = {'after_previous': 'days', 'days': 3, 'time_of_day': 'unknown', 'duration_minutes': 30}
        self.assertEqual(timeline.place_beat(600, t), 3 * 1440 + 9 * 60)

    def test_anchor_compression_and_windows(self):
        class P:
            def get(self, k, d=None):
                return {'timeline': {'origin_date': '2015-07-30', 'gap_days': 30, 'anchors': [{'chapter': 'b', 'start': '2015-08-05 08:00', 'basis': 'documented'}]}}.get(k, d)
        beat = lambda i, d: {'id': i, 'time': {'after_previous': 'days', 'days': d, 'time_of_day': 'unknown', 'duration_minutes': 60}}  # noqa: E731
        chs = [{'id': 'a'}, {'id': 'b'}]
        bb = {'a': [beat('a1', 0), beat('a2', 10), beat('a3', 10)], 'b': [beat('b1', 0)]}
        pos, rep, clock = timeline.compute(P(), chs, bb)
        self.assertEqual(clock.label(pos['b1']['start']), '2015-08-05 08:00')       # the anchor holds
        self.assertLess(pos['a3']['end'], pos['b1']['start'])                        # the stretch before it fits
        self.assertTrue(rep[0]['compressed'])
        order = ['a1', 'a2', 'a3', 'b1']
        w = timeline.windows(order, pos)
        for x, y in zip(order, order[1:]):
            self.assertLess(w[x][1], w[y][0])                                        # windows never touch


    def test_spread_between_anchors(self):
        class P:
            def get(self, k, d=None):
                return {'timeline': {'origin_date': '2015-07-30', 'gap_days': 7, 'anchors': [{'chapter': 'd', 'start': '2015-10-30 08:00', 'basis': 'documented'}]}}.get(k, d)
        beat = lambda i: {'id': i, 'time': {'after_previous': 'continuous', 'days': 0, 'time_of_day': 'unknown', 'duration_minutes': 60}}  # noqa: E731
        chs = [{'id': x} for x in 'abcde']
        pos, rep, clock = timeline.compute(P(), chs, {x: [beat(x + '1')] for x in 'abcde'})
        starts = [clock.date(pos[x + '1']['start']) for x in 'abcde']
        self.assertEqual(starts[0], '2015-07-30')
        self.assertEqual(starts[3], '2015-10-30')                                    # the anchor
        self.assertEqual(starts[1], '2015-08-30')                                    # a third of the way (92 days, 3 gaps), at 08:00
        self.assertEqual(clock.label(pos['b1']['start'])[-5:], '08:00')
        self.assertEqual(starts[4], '2015-11-06')                                    # after the last anchor: gap_days


    def test_time_of_and_stated_dates(self):
        self.assertEqual(timeline.time_of('现在是 16 时 30 分'), 16 * 60 + 30)
        self.assertEqual(timeline.time_of('PM9:30 船坞内'), 21 * 60 + 30)
        self.assertEqual(timeline.time_of('下午3点'), 15 * 60)
        self.assertIsNone(timeline.time_of('没有时间'))
        self.assertEqual(assemble.full_date('2017年　12月　31日晴朗的天空')[:3], (2017, 12, 31))
        self.assertIsNone(assemble.full_date('2017年的终结'))                       # a year alone pins nothing
        # a stated clock time places the beat at that time (today, or tomorrow when already past)
        t = {'after_previous': 'continuous', 'days': 0, 'time_of_day': 'unknown', 'duration_minutes': 10, 'stated': '现在是 16 时 30 分'}
        self.assertEqual(timeline.place_beat(9 * 60, t), 16 * 60 + 30)
        self.assertEqual(timeline.place_beat(17 * 60, t), 1440 + 16 * 60 + 30)


class ModelOutputTest(unittest.TestCase):
    def test_extract_json(self):
        self.assertEqual(extract_json('好的：\n```json\n{"a": 1}\n```'), {'a': 1})
        self.assertEqual(extract_json('x {"a": [1, 2]} y'), {'a': [1, 2]})

    def test_normalize_summary(self):
        s = steps.normalize_summary({'beats': [{'title': 'A', 'course': 'c', 'result': 'r', 'time': {'after_previous': 'weird', 'duration_minutes': '45'},
                                                 'changes': [{'subject': 'X', 'kind': 'explodes', 'value': 'v'}], 'people': ['Y'], 'importance': 'huge'}]})
        b = s['beats'][0]
        self.assertEqual(b['time']['after_previous'], 'unknown')
        self.assertEqual(b['time']['duration_minutes'], 45)
        self.assertEqual(b['changes'][0]['kind'], 'status')
        self.assertEqual(b['people'][0]['name'], 'Y')
        self.assertEqual(b['importance'], 'normal')

    def test_chapter_fixed_points(self):
        ids = ['b1', 'b2', 'b3', 'b4']
        out = steps.normalize_chapter({
            'events': [{'beat': b, 'class': 'SOFT'} for b in ids],
            'resolution': {'beat': 'b4', 'required': 'r', 'outcomes': [{'subject': 'X', 'predicate': 'status', 'value': 'won'}]},
            'fixed': [{'beat': 'b2', 'required': 'r', 'outcomes': [{'subject': 'Y', 'predicate': 'alive', 'value': False}]},
                      {'beat': 'b1', 'required': 'r', 'outcomes': [{'subject': 'Z', 'predicate': 'status', 'value': 'x'}]},
                      {'beat': 'b3', 'required': '', 'outcomes': []}]}, ids, 2)
        self.assertEqual([b for b in ids if out['events'][b]['class'] == 'HARD'], ['b2', 'b4'])   # resolution first, then the cap

    def test_split(self):
        parts = steps.split_text('a' * 50 + '\n——场景切换——\n' + 'b' * 50, 60)
        self.assertEqual(len(parts), 2)

    def test_cost(self):
        cfg = {'prices_usd_per_mtok': {'input_hit': 0.1, 'input_miss': 1.0, 'output': 2.0}, 'offpeak': {}}
        self.assertAlmostEqual(cost_of(cfg, {'prompt_tokens': 1_000_000, 'prompt_cache_hit_tokens': 500_000, 'completion_tokens': 1_000_000}), 0.05 + 0.5 + 2.0)
        import datetime as dt
        op = {'offpeak': {'discount': 0.5, 'peak_utc_hours': [[1, 4]], 'peak_weekdays': [0, 1, 2, 3, 4]}}
        self.assertTrue(is_peak(op, dt.datetime(2026, 10, 26, 2, 0)))     # Monday 02:00 UTC
        self.assertFalse(is_peak(op, dt.datetime(2026, 10, 25, 2, 0)))    # Sunday


class GroupingTest(unittest.TestCase):
    def test_group_candidates(self):
        d = {
            's102200': {'name': '吉尔·德·雷', 'id': 'gilles-de-rais', 'kind': 'person', 'aliases': ['吉尔'], 'names': {'吉尔': 3}, 'weight': 5},
            's500200': {'name': '吉尔·德·雷', 'id': 'gilles-de-rais', 'kind': 'person', 'aliases': ['吉尔'], 'names': {'吉尔': 9}, 'weight': 9},
            'f98005': {'name': '奥尔加玛丽·阿尼姆斯菲亚', 'id': 'olga', 'kind': 'person', 'aliases': ['所长'], 'names': {'奥尔加玛丽': 5}, 'weight': 8},
            'n:奥尔加玛丽·阿尼姆斯菲亚': {'name': '奥尔加玛丽·阿尼姆斯菲亚', 'id': 'olga-marie', 'kind': 'person', 'aliases': [], 'names': {}, 'weight': 2},
            'n:士兵们': {'name': '士兵们', 'id': 'soldiers', 'kind': 'person', 'aliases': [], 'names': {}, 'weight': 3, 'skip': True},
        }
        groups = {tuple(sorted(ks)) for _, ks in assemble.group_candidates(d, assemble.Report())}
        self.assertIn(('s102200',), groups)                         # two Gilles stay two
        self.assertIn(('s500200',), groups)
        self.assertIn(('f98005', 'n:奥尔加玛丽·阿尼姆斯菲亚'), groups)
        self.assertFalse(any('n:士兵们' in g for g in groups))


class PipelineTest(unittest.TestCase):
    """The whole pipeline on a tiny synthetic corpus with the stand-in model; the pack must pass canon-lint."""

    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix='cpb-test-')
        proj = {'name': 'synthetic', 'adapter': 'atlas', 'atlas': {'region': 'CN'}, 'protagonist': {'name': '主角', 'id': 'hero', 'gender': 'female'},
                'pack': {'pack_id': 'synthetic', 'title': '测试', 'language': 'zh-CN', 'description': '测试包'},
                'frames': {'default': '基地'}, 'timeline': {'origin_date': '2020-01-01', 'gap_days': 3}}
        path = os.path.join(self.dir, 'synthetic.json')
        write_json(path, proj)
        self.project = Project(path)
        self.project.work = os.path.join(self.dir, 'work')
        chars = {'s1': {'key': 's1', 'name': '阿琳', 'labels': {'阿琳': 5}, 'servant': None, 'units': [], 'lines': 5, 'spirit': False},
                 's2': {'key': 's2', 'name': '博恩', 'labels': {'博恩': 5}, 'servant': None, 'units': [], 'lines': 5, 'spirit': False}}
        units, chapters = [], []
        for ci in range(2):
            cid = f'w{ci + 1}'
            ids = []
            for ui in range(2):
                uid = f'{cid}.{ui + 1:03d}'
                ids.append(uid)
                units.append({'id': uid, 'chapter': cid, 'order': ui + 1, 'title': f'第{ui + 1}节', 'sub': '', 'quest_id': uid, 'quest_type': 'main',
                              'place': '港口', 'scripts': [uid], 'present': ['s1', 's2'], 'speakers': {'s1': 3, 's2': 2}, 'chars': 40})
                write_text(self.project.p('text', cid, f'{uid}.txt'), '阿琳：出发吧。\n博恩：好。')
            chapters.append({'id': cid, 'order': ci + 1, 'source_id': ci + 1, 'title': f'第{ci + 1}章', 'name': f'第{ci + 1}章', 'era': '', 'units': ids, 'event': False})
        write_json(self.project.p('corpus.json'), {'source': {'adapter': 'atlas', 'region': 'CN'}, 'protagonist': {'name': '主角', 'gender': 'female'},
                                                  'chapters': chapters, 'units': units, 'characters': chars})

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_pipeline(self):
        gcfg = load_global()
        cl = Client(gcfg['llm'], self.project, mock=mock)
        steps.summarize(self.project, cl)
        steps.edit_chapters(self.project, cl)
        steps.describe_entities(self.project, cl)
        pack, rep, chrep, clock, path = assemble.build(self.project)
        self.assertEqual(len(pack['events']), 8)                   # 2 chapters x 2 units x 2 beats
        self.assertEqual(sum(1 for e in pack['events'] if e['classification'] == 'HARD'), 2)
        res = report.lint(gcfg, path)
        if res is None:
            self.skipTest('canon-lint not available')
        self.assertTrue(res['ok'], res.get('errors'))

    def test_pipeline_long_chapters_in_parts(self):
        self.project.data['chapter'] = {'max_beats': 2}           # 4 beats per chapter -> 2 parts each
        gcfg = load_global()
        cl = Client(gcfg['llm'], self.project, mock=mock)
        steps.summarize(self.project, cl)
        steps.edit_chapters(self.project, cl)
        ed = json.load(open(self.project.p('chapters', 'w1.json'), encoding='utf8'))
        self.assertEqual(ed['parts'], 2)
        self.assertEqual(len(ed['events']), 4)
        self.assertEqual([b for b, e in ed['events'].items() if e['class'] == 'HARD'], ['w1.002.b2'])   # the last part's resolution


if __name__ == '__main__':
    unittest.main()
