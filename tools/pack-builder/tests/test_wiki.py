"""Offline tests of the wiki-arc path: wikitext cleaning, the glossary, arc times, duplicate merging.
Run: python -m unittest discover -s tests"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import dedupe, timeline  # noqa: E402
from cpb.adapters import wiki_arcs  # noqa: E402


def beat(i, date='', clock='', after='continuous', tod='unknown', dur=30, course='x', people=()):
    return {'id': f'a.001.b{i}', 'title': f't{i}', 'course': course, 'result': '', 'background': '', 'trigger': '', 'aftermath': '', 'note': '',
            'people': [{'name': p, 'role': '', 'presence': 'onsite'} for p in people], 'places': [], 'motives': [], 'changes': [], 'extra': {},
            'secret': {'is_secret': False, 'knowers': []}, 'importance': 'normal',
            'time': {'date': date, 'clock': clock, 'after_previous': after, 'days': 0, 'time_of_day': tod, 'duration_minutes': dur, 'stated': ''}}


class CleanTest(unittest.TestCase):
    def test_templates_links_refs(self):
        t = "'''圣日耳曼篇'''发生于{{学区|15}}的[[类钻]]{{注|某魔法的禁书目录|小说|新约|12}}，[[加纳神华|加纳]]冒充{{nihongo|蓝花悦|{{ruby|藍花悦|あいはなえつ}}|Aihana Etsu}}。<ref>x</ref>"
        self.assertEqual(wiki_arcs.clean(t), '圣日耳曼篇发生于第15学区的类钻，加纳冒充蓝花悦。')

    def test_infobox_with_nested_templates_goes_alone(self):
        t = "{{Infobox story\n|a={{x|{{y}}}}\n}}\n正文\n== 参考资料 ==\n{{Scroll box|\n{{reflist}}\n}}"
        out = wiki_arcs.strip_page(t)
        self.assertIn('正文', out)
        self.assertNotIn('Infobox', out)
        self.assertNotIn('参考资料', out)

    def test_headings_stay_on_their_lines(self):
        self.assertEqual(wiki_arcs.clean('== 背景 ==\n=== 蜜蚁 ===\n文'), '## 背景\n### 蜜蚁\n文')

    def test_glossary_drops_parts_of_longer_names(self):
        g = wiki_arcs.glossary({'安娜·施普伦格尔': '{{Infobox character\n|英文名=Anna Sprengel\n}}', '杏奈': '{{Infobox character\n|英文名=Anna\n}}'})
        self.assertEqual(g.get('Anna Sprengel'), '安娜·施普伦格尔')
        self.assertNotIn('Anna', g)


class ArcTimeTest(unittest.TestCase):
    origin = dt.date(2020, 7, 19)
    arc = {'start': '2020-12-25', 'end': '2020-12-25'}

    def test_dated_and_between(self):
        bs = [beat(1, '2020-12-25', '07:00'), beat(2), beat(3, '2020-12-25', '10:00')]
        pos = timeline.place_arc(self.origin, self.arc, bs)
        s = [pos[b['id']][0] % 1440 for b in bs]
        self.assertEqual(s[0], 7 * 60)
        self.assertTrue(7 * 60 < s[1] < 10 * 60)
        self.assertEqual(s[2], 10 * 60)

    def test_part_of_day_never_goes_back(self):
        bs = [beat(1, '2020-12-25', '', tod='evening'), beat(2, '2020-12-25', '', tod='morning')]
        pos = timeline.place_arc(self.origin, self.arc, bs)
        self.assertGreater(pos[bs[1]['id']][0], pos[bs[0]['id']][0])

    def test_wrong_year_and_past(self):
        bs = [beat(1, '2019-12-25', '09:00'), beat(2, '2020-08-01', '09:00')]
        pos = timeline.place_arc(self.origin, self.arc, bs)
        day = lambda t: (self.origin + dt.timedelta(minutes=t)).isoformat()  # noqa: E731
        self.assertEqual(day(pos[bs[0]['id']][0]), '2020-12-25')
        self.assertEqual(day(pos[bs[1]['id']][0]), '2020-08-01')


class DedupeTest(unittest.TestCase):
    def test_merge_keeps_the_most(self):
        a = beat(1, course='短', people=['甲'])
        b = beat(2, '2020-12-25', course='更长的经过', people=['乙'])
        sums = [{'beats': [a, b]}]
        out = dedupe._merge_groups(sums, [[a['id'], b['id']]], {a['id']: a, b['id']: b})
        self.assertEqual(len(out[0]['beats']), 1)
        k = out[0]['beats'][0]
        self.assertEqual(k['id'], a['id'])
        self.assertEqual(k['course'], '更长的经过')
        self.assertEqual({p['name'] for p in k['people']}, {'甲', '乙'})
        self.assertEqual(k['time']['date'], '2020-12-25')


if __name__ == '__main__':
    unittest.main()
