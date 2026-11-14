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

    def test_window_is_the_beats_own_time(self):
        D = timeline.DAY
        tight = {'after_previous': 'continuous', 'time_of_day': 'unknown', 'clock': '', 'stated': ''}
        pos = {'a': {'start': 61 * D + 720, 'end': 61 * D + 750}, 'b': {'start': 61 * D + 750, 'end': 61 * D + 780}, 'c': {'start': 62 * D + 480, 'end': 62 * D + 540}}
        w = timeline.windows(['a', 'b', 'c'], pos, {'a': tight, 'b': tight, 'c': tight})
        self.assertEqual(w['a'], (61 * D + 720, 61 * D + 749))                      # up to the next beat, no further
        self.assertEqual(w['b'], (61 * D + 750, 61 * D + 750 + timeline.SLACK))     # the last of a story: its own time, not until the next story
        self.assertEqual(w['c'], (62 * D + 480, 62 * D + 480 + timeline.SLACK))
        long = {'a': {'start': 10 * D + 540, 'end': 12 * D + 540}}                  # a beat that lasts two days keeps them
        self.assertEqual(timeline.windows(['a'], long, {'a': tight})['a'], (10 * D + 540, 12 * D + 540))
        dayonly = {'after_previous': 'days', 'days': 3, 'time_of_day': 'unknown', 'clock': '', 'stated': '7月10日'}
        p2 = {'a': {'start': 9 * D + 540, 'end': 9 * D + 600}, 'b': {'start': 15 * D + 540, 'end': 15 * D + 600}}
        self.assertEqual(timeline.windows(['a', 'b'], p2, {'a': dayonly})['a'], (9 * D + 540, 10 * D - 1))   # only the day known: that day
        self.assertEqual(timeline.windows(['a', 'b'], p2, {'a': {**dayonly, 'stated': '7月10日21:00'}})['a'], (9 * D + 540, 9 * D + 540 + timeline.SLACK))
        self.assertEqual(timeline.windows(['a', 'b'], p2, {}, loose={'a'})['a'], (9 * D + 540, 10 * D - 1))           # placed at a day without a time
        night = {'after_previous': 'unknown', 'time_of_day': 'night', 'clock': '', 'stated': '6月30日夜里'}
        p3 = {'a': {'start': 9 * D + 1260, 'end': 9 * D + 1320}, 'b': {'start': 15 * D + 540, 'end': 15 * D + 600}}
        self.assertEqual(timeline.windows(['a', 'b'], p3, {'a': night})['a'], (9 * D + 1260, 10 * D + 180))   # a part of the day: to its end
        p5 = {'a': {'start': 10 * D + 15, 'end': 10 * D + 75}, 'b': {'start': 15 * D + 540, 'end': 15 * D + 600}}
        self.assertEqual(timeline.windows(['a', 'b'], p5, {'a': night})['a'], (10 * D + 15, 10 * D + 180))     # past midnight: this morning
        evening = {'after_previous': 'same_day', 'time_of_day': 'evening', 'clock': '', 'stated': ''}
        self.assertEqual(timeline.windows(['a', 'b'], p5, {'a': evening})['a'], (10 * D + 15, 10 * D + 15 + timeline.SLACK))  # pushed out of its part of the day
        # another story's beat does not end it; its own story's next beat does
        p4 = {'a': {'start': 10 * D + 540, 'end': 13 * D + 540}, 'x': {'start': 11 * D + 540, 'end': 11 * D + 600}, 'b': {'start': 14 * D + 540, 'end': 14 * D + 600}}
        w4 = timeline.windows(['a', 'x', 'b'], p4, {}, chapter_of={'a': 'one', 'x': 'two', 'b': 'one'})
        self.assertEqual(w4['a'], (10 * D + 540, 13 * D + 540))

    def test_the_texts_own_words(self):
        self.assertEqual(timeline.part_of({'stated': '一年前9月20日凌晨', 'time_of_day': 'night'}), 'small_hours')   # not 21:00 that evening
        self.assertEqual(timeline.part_of({'stated': '9月19日中午（即9月19日深夜 UTC+0）', 'time_of_day': 'night'}), 'noon')
        self.assertEqual(timeline.part_of({'stated': '', 'time_of_day': 'evening'}), 'evening')
        self.assertEqual(timeline.year_of('公元9世纪；829年制造完成', 2020), 829)
        self.assertEqual(timeline.year_of('1519-1521年', 2020), 1520)
        self.assertEqual(timeline.year_of('20世纪70年代', 2020), 1975)
        self.assertEqual(timeline.year_of('公元4世纪', 2020), 350)
        self.assertEqual(timeline.year_of('2年前', 2020), 2018)
        self.assertIsNone(timeline.year_of('距今至少约4000年前', 2020))
        self.assertIsNone(timeline.year_of('1年前7月31日', 2020))
        self.assertIsNone(timeline.year_of('1900年4月', 2020))

    def test_clock_words(self):
        self.assertIsNone(timeline.time_of('放学后~19:00前'))
        self.assertEqual(timeline.time_of('12月5日2:00前'), 90)                      # a deadline: a little before it
        self.assertEqual(timeline.part_of({'stated': '12月29日（补习至黄昏结束）', 'time_of_day': 'morning'}), 'morning')
        self.assertEqual(timeline.part_of({'stated': '10月初某日夜晚 UTC+1', 'time_of_day': 'morning'}), 'morning')
        self.assertEqual(timeline.time_of('晚上7点'), 19 * 60)
        self.assertEqual(timeline.time_of('凌晨12点'), 0)
        self.assertEqual(timeline.time_of('16:00前往，17:00抵达'), 16 * 60)
        self.assertEqual(timeline.time_of('八点前 / 10:00开始'), 10 * 60)
        self.assertEqual(timeline.time_of('深夜十二点三十分'), 30)
        self.assertEqual(timeline.time_of('早上八点半'), 8 * 60 + 30)

    def test_unknown_times_narrowed_by_the_order(self):
        # live: five beats of one afternoon between an event at 13:00 and one of 中午 they lead to were each 12:00–17:59
        w = lambda lo, hi, p='part_of_day': {'earliest': {'day': 0, 'minute': lo}, 'latest': {'day': 0, 'minute': hi}, 'precision': p, 'label': 'x；文中：下午'}  # noqa: E731
        ev = [{'id': 'meet', 'when': w(780, 810, 'range')}, {'id': 'b1', 'when': w(720, 1079)}, {'id': 'b2', 'when': w(720, 1079)}, {'id': 'noon', 'when': w(660, 839)}]
        edges = [{'from': 'meet', 'to': 'b1', 'relation': 'enables'}, {'from': 'b1', 'to': 'b2', 'relation': 'precedes'}, {'from': 'b2', 'to': 'noon', 'relation': 'enables'}]
        import datetime as dt
        bad = assemble.narrow_by_order(ev, edges, dt.datetime(2020, 1, 1))
        self.assertEqual(bad, [])
        got = {e['id']: (e['when']['earliest']['minute'], e['when']['latest']['minute']) for e in ev}
        self.assertEqual(got['b1'], (780, 839))
        self.assertEqual(got['b2'], (780, 839))
        self.assertEqual(got['noon'], (780, 839))
        self.assertEqual(got['meet'], (780, 810))                                       # a known time is not changed
        self.assertTrue(ev[1]['when']['label'].endswith('；文中：下午'))                 # the source text stays last
        self.assertIn('按先后在', ev[1]['when']['label'])

    def test_windows_are_marked_until_each_has_its_time(self):
        # live: 上条乘滑翔机升空 and 上条与莎特奥拉对决 shown (and played) as one moment, "1~8/8" of one evening
        w = lambda lo, hi, p='part_of_day': {'earliest': {'day': 0, 'minute': lo}, 'latest': {'day': 0, 'minute': hi}, 'precision': p}  # noqa: E731
        ev = [{'id': 'a', 'arc_id': 's', 'when': w(1080, 1259)}, {'id': 'b', 'arc_id': 's', 'when': w(1080, 1259)},
              {'id': 'c', 'arc_id': 's', 'when': w(1080, 1110, 'range')},                     # a known time shares nothing
              {'id': 'd', 'arc_id': 't', 'when': w(1080, 1259)},                              # another story's evening
              {'id': 'e', 'arc_id': 's', 'when': w(1080, 1260)}]                              # a window of its own
        marks = {}
        assemble.mark_shared_windows(ev, {}, marks)
        self.assertEqual(sorted(marks), ['a', 'b', 'd', 'e'])
        self.assertIn('需要分配一个时间', marks['d'][0])                                   # a lone window needs its moment too
        self.assertIn('第 1/2 件', marks['a'][0])
        self.assertIn('第 2/2 件', marks['b'][0])

    def test_one_event_told_twice_is_merged(self):
        # live: 药味久子的下场 (agitate.001) and 药味久子被击碎 (agitate.003), the same scene in two parts of a story
        w = {'earliest': {'day': 0, 'minute': 600}, 'latest': {'day': 0, 'minute': 630}, 'precision': 'range'}
        st = lambda ent, v, u='lasting': {'op': 'set', 'fact': {'entity_id': ent, 'predicate': 'status', 'value': v}, 'until': u}  # noqa: E731
        ev = lambda i, effs, cls='SOFT', ents=('a',): {'id': i, 'title': i, 'classification': cls, 'when': dict(w), 'entity_ids': list(ents), 'location_ids': [],  # noqa: E731
                                                       'cast': [], 'canonical_effects': effs, 'outcomes': [], 'author_note': ''}
        pack = {'events': [ev('k', [st('a', '倒下')]), ev('g', [st('a', '别的说法'), st('b', '旁观')], ents=('a', 'b')), ev('h', [st('c', '错的')]),
                           ev('later', [st('d', 'x', {'event': 'g'})])],
                'edges': [{'from': 'g', 'to': 'later', 'relation': 'enables'}, {'from': 'k', 'to': 'later', 'relation': 'enables'}],
                'arcs': [{'id': 's', 'event_ids': ['k', 'g', 'h', 'later']}]}
        rv = {'duplicates': {'g|k': {'same': True, 'keep': 'k'}, 'h|k': {'same': True, 'keep': 'k', 'carry': False}, 'k|later': {'same': False}}}
        marks = {}
        self.assertEqual(assemble.merge_duplicates(pack, rv, marks), {'g': 'k', 'h': 'k'})
        k = pack['events'][0]
        self.assertEqual([e['id'] for e in pack['events']], ['k', 'later'])
        self.assertEqual([o['fact']['value'] for o in k['canonical_effects']], ['倒下', '旁观'])   # the kept one's own, plus what only the other said
        self.assertEqual(k['entity_ids'], ['a', 'b'])
        self.assertEqual(pack['events'][1]['canonical_effects'][0]['until'], {'event': 'k'})       # an end that pointed at the gone one
        self.assertEqual(len(pack['edges']), 1)                                                     # two links became one
        self.assertEqual(pack['arcs'][0]['event_ids'], ['k', 'later'])

    def test_a_given_time_is_labelled_short(self):
        # live: the GM's list of required events read "2021-01-13 14:00（编辑推定（原文没有确切时刻……；原窗口：……））"
        class Clock:
            label = staticmethod(lambda t: f'D{t // 1440} {t % 1440 // 60:02d}:{t % 60:02d}')
        cx = {'precision': 'range', 'lo': 19 * 60, 'hi': 19 * 60 + 30}
        self.assertEqual(assemble.when_label(Clock, dict(cx, note='编辑推定（原文没有确切时刻，按先后排定）：很长的理由'), False), '约D0 19:00（编辑推定）')
        self.assertEqual(assemble.when_label(Clock, dict(cx, note='9月8日晚上'), False), 'D0 19:00（9月8日晚上）')   # a person's words on the time stay

    def test_a_stated_time_is_the_start_and_ends_before_what_follows(self):
        # live: "17:00" placed at 17:01 behind the beat before it; 病毒提前启动 20:00–20:30 and 头部中枪 at 20:12, which it enables
        import datetime as dt
        D = timeline.DAY
        origin = dt.date(2020, 1, 1)
        arc = {'start': '2020-01-01', 'end': '2020-01-01'}
        beats = [{'id': 'a', 'time': {'stated': '1月1日17:00', 'duration_minutes': 40, 'after_previous': 'unknown'}},
                 {'id': 'b', 'time': {'stated': '17:25', 'duration_minutes': 30, 'after_previous': 'continuous'}},
                 {'id': 'c', 'time': {'stated': '', 'clock': '17:30', 'time_of_day': 'evening', 'after_previous': 'continuous'}}]
        cx = timeline.certainty(origin, arc, beats, {'a': (17 * 60 + 1, 17 * 60 + 41), 'b': (17 * 60 + 41, 18 * 60 + 11), 'c': (18 * 60 + 11, 18 * 60 + 41)}, {'a'}, set())
        self.assertEqual((cx['a']['precision'], cx['a']['lo']), ('range', 17 * 60))     # the stated time, not the order's 17:01
        self.assertEqual(cx['b']['lo'], 17 * 60 + 25)
        self.assertEqual(cx['c']['precision'], 'part_of_day')                           # a clock no source states is no time
        when = lambda c: {'earliest': {'day': c['lo'] // D, 'minute': c['lo'] % D}, 'latest': {'day': c['hi'] // D, 'minute': c['hi'] % D}, 'precision': c['precision']}  # noqa: E731
        events = [{'id': k, 'when': when(cx[k])} for k in ('a', 'b')]
        assemble.end_before_dependents(events, [{'from': 'a', 'to': 'b', 'relation': 'enables'}], cx)
        self.assertEqual(events[0]['when']['latest'], {'day': 0, 'minute': 17 * 60 + 24})  # over before b begins
        cx['a']['checked'] = True                                                          # a person's window stays as it is
        events = [{'id': k, 'when': when(cx[k])} for k in ('a', 'b')]
        assemble.end_before_dependents(events, [{'from': 'a', 'to': 'b', 'relation': 'enables'}], cx)
        self.assertEqual(events[0]['when']['latest'], {'day': 0, 'minute': 17 * 60 + 40})

    def test_a_night_past_midnight(self):
        D = timeline.DAY
        cur = 3 * D + 50                                                              # 00:50, the night of day 2
        night = {'after_previous': 'same_day', 'days': 0, 'time_of_day': 'night', 'stated': '某日夜晚'}
        self.assertEqual(timeline.place_beat(cur, night), cur + 90)                   # still that night, not the next evening
        nxt = {'after_previous': 'next_day', 'days': 0, 'time_of_day': 'dawn', 'clock': '04:00', 'stated': '某日的次日4:00'}
        self.assertEqual(timeline.place_beat(cur, nxt), 3 * D + 240)                  # "the next day" of that night is today
        self.assertEqual(timeline.place_beat(18 * 60, {'after_previous': 'continuous', 'days': 0, 'time_of_day': 'evening', 'clock': '19:00', 'stated': ''}), 19 * 60)


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
        # nothing a person has not checked passes: every event is marked, and the lint refuses the pack
        self.assertFalse(res['ok'])
        self.assertTrue(all(e['path'].endswith('/review') for e in res['errors']), res['errors'])
        self.assertTrue(all('时间未经人工核对' in e['review'] for e in pack['events']))
        # a person checks each event's time, the end of each state and its impacts: the next build applies them
        import datetime as dt_
        from cpb import review
        origin = dt_.date.fromisoformat(self.project['timeline']['origin_date'])
        rv = review.load(self.project)
        for e in pack['events']:
            lo = e['when']['earliest']['day'] * 1440 + e['when']['earliest']['minute']
            hi = e['when']['latest']['day'] * 1440 + e['when']['latest']['minute']
            rv['times'][e['id']] = {'from': review.from_tick(origin, lo), 'to': review.from_tick(origin, hi), 'precision': 'range' if hi > lo else 'minute', 'note': 'checked'}
            rv['impacts'][e['id']] = {'effects': [], 'note': 'nothing beyond the event'}
            for o in e['canonical_effects']:
                f = o.get('fact')
                if f and f['predicate'] not in ('alive', 'members', 'leader', 'ally', 'holder', 'knows'):
                    rv['ends'][review.end_key(e['id'], f['entity_id'], f['predicate'])] = {'value': f['value'], 'until': {'minutes': 60}}
        review.save(self.project, rv)
        pack, rep, chrep, clock, path = assemble.build(self.project)
        self.assertFalse(any('review' in e for e in pack['events']))
        self.assertTrue(all('until' in o for e in pack['events'] for o in e['canonical_effects'] if o.get('op', 'set') != 'unset'))
        res = report.lint(gcfg, path)
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
