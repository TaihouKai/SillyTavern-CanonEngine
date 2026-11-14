"""A whole-pack read's findings: a person's corrections in the review file (cpb/corrections.py), the checks that list
each kind of problem it found (cpb/checks.py text_problems), and the builder changes that came with them."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import assemble, changes, checks, corrections, start  # noqa: E402


def ev(i, day, effects=(), ents=(), title=None, **kw):
    e = {'id': i, 'title': title or i, 'classification': 'SOFT', 'when': {'earliest': {'day': day, 'minute': 0}, 'latest': {'day': day, 'minute': 30}, 'label': f'D{day}'},
         'entity_ids': list(ents), 'location_ids': [], 'canonical_effects': [dict(x) for x in effects],
         'summary': {'course': kw.get('course', '经过。'), 'result': '结果。'}, 'outcomes': []}
    e.update({k: v for k, v in kw.items() if k != 'course'})
    return e


def setf(ent, pred, val, until='lasting'):
    return {'op': 'set', 'fact': {'entity_id': ent, 'predicate': pred, 'value': val}, 'until': until}


def chg(op, ent, pred, val):
    return {'op': op, 'entity_id': ent, 'predicate': pred, 'value': val, 'until': 'lasting'}


def pack(events, ents):
    return {'events': events, 'entities': ents, 'initial_state': {'facts': []}, 'arcs': [{'id': 'arc.a', 'title': '甲篇', 'summary': '概要'}]}


PEOPLE = [{'id': 'ann', 'name': '安妮', 'kind': 'person', 'aliases': []}, {'id': 'bo', 'name': '博文', 'kind': 'person', 'aliases': []},
          {'id': 'club', 'name': '社团', 'kind': 'organization', 'aliases': []}, {'id': 'cat', 'name': '猫', 'kind': 'other', 'aliases': []},
          {'id': 'box', 'name': '盒子', 'kind': 'object', 'aliases': []}]


class CorrectionsTest(unittest.TestCase):
    def test_event_corrections(self):
        e = ev('a.001.b1', 1, [chg('add', 'club', 'members', ['ann', 'bo']), setf('ann', 'status', '入会')], ents=['ann', 'bo', 'club'],
               cast=[{'entity_id': 'ann', 'role': '新人'}, {'entity_id': 'bo', 'role': '旧人'}],
               visibility={'mode': 'secret', 'knower_ids': ['ann', 'bo']}, course='安妮与博文入会。')
        e['summary']['motives'] = [{'who': '博文', 'entity_ids': ['bo'], 'motive': '陪安妮。'}]
        p = pack([e], [dict(x) for x in PEOPLE])
        rv = {'events': {'a.001.b1': {'drop': [{'entity': 'club', 'predicate': 'members', 'value': ['bo']}], 'unlink': ['bo'],
                                      'texts': [{'old': '与博文', 'new': ''}, {'old': '不存在的字', 'new': 'x'}]}}}
        miss = corrections.apply(p, rv)
        x = p['events'][0]
        # who the change took in, less the one wrongly listed; the unlinked one gone with their motive and role
        self.assertEqual([o['value'] for o in x['canonical_effects'] if o.get('predicate') == 'members'], [['ann']])
        self.assertNotIn('bo', x['entity_ids'])
        self.assertEqual([c['entity_id'] for c in x['cast']], ['ann'])
        self.assertEqual(x['summary']['motives'], [])
        self.assertEqual(x['visibility']['knower_ids'], ['ann'])
        self.assertEqual(x['summary']['course'], '安妮入会。')
        # a correction that finds nothing is listed (a stale decision)
        self.assertEqual(miss, ['events.a.001.b1.texts：「不存在的字」没找到'])

    def test_recast_and_entity_merge(self):
        e1 = ev('a.001.b1', 1, [setf('ann', 'status', '被认错')], ents=['ann'])
        e2 = ev('a.001.b2', 2, [chg('add', 'club', 'members', ['ann']), setf('box', 'holder', 'bo')], ents=['ann', 'box', 'bo'])
        ents = [dict(x) for x in PEOPLE] + [{'id': 'ann2', 'name': '安妮（重复）', 'kind': 'person', 'aliases': ['小安']},
                                            {'id': 'place', 'name': '某地（地点）', 'kind': 'place', 'aliases': []}]
        e2['location_ids'] = ['place']
        p = pack([e1, e2], ents)
        p['initial_state']['facts'] = [{'fact': {'entity_id': 'club', 'predicate': 'members', 'value': ['ann2']}}]
        rv = {'events': {'a.001.b1': {'recast': {'ann': 'bo'}}},
              'entities': {'ann2': {'merge_into': 'ann'}, 'place': {'drop': True}, 'box': {'name': '箱子', 'kind': 'object', 'aliases_add': ['盒子']}}}
        self.assertEqual(corrections.apply(p, rv), [])
        self.assertEqual(p['events'][0]['canonical_effects'][0]['fact']['entity_id'], 'bo')
        self.assertEqual(p['events'][0]['entity_ids'], ['bo'])
        ids = {x['id'] for x in p['entities']}
        self.assertNotIn('ann2', ids)
        self.assertNotIn('place', ids)
        ann = next(x for x in p['entities'] if x['id'] == 'ann')
        self.assertEqual(sorted(ann['aliases']), ['安妮（重复）', '小安'])
        self.assertEqual(p['initial_state']['facts'][0]['fact']['value'], ['ann'])
        self.assertEqual(p['events'][1]['location_ids'], [])
        box = next(x for x in p['entities'] if x['id'] == 'box')
        self.assertEqual((box['name'], box['aliases']), ('箱子', ['盒子']))

    def test_wordings_everywhere_and_an_empty_part_goes(self):
        e = ev('a.001.b1', 1, [setf('ann', 'knows', '奥莉弗的秘密')], course='奥莉弗来了。')
        e['summary']['aftermath'] = '只是重复。'
        ents = [dict(x) for x in PEOPLE]
        ents[0]['static_description'] = '奥莉弗的朋友。'
        p = pack([e], ents)
        rv = {'texts': [{'old': '奥莉弗', 'new': '奥利芙'}], 'events': {'a.001.b1': {'texts': [{'old': '只是重复。', 'new': ''}]}}}
        self.assertEqual(corrections.apply(p, rv), [])
        x = p['events'][0]
        self.assertEqual((x['summary']['course'], x['canonical_effects'][0]['fact']['value']), ('奥利芙来了。', '奥利芙的秘密'))
        self.assertNotIn('aftermath', x['summary'])
        self.assertEqual(p['entities'][0]['static_description'], '奥利芙的朋友。')

    def test_people_fixes(self):
        ents = [dict(PEOPLE[0], nature=[{'from_event': None, 'habits': '习惯；', 'uses': '用', 'others': '', 'limits': '限'}], mind={'approach': '主杀派的做法'})]
        p = pack([], ents)
        rv = {'minds': {'ann': {'nature': {'start': {'habits': '习惯。', 'others': '旁人知道。'}}}}, 'texts': [{'old': '主杀派', 'new': '杀害派', 'people': True}]}
        self.assertEqual(corrections.apply_people(p, rv) + corrections.apply(p, rv, people=True), [])
        v = p['entities'][0]['nature'][0]
        self.assertEqual((v['habits'], v['others'], p['entities'][0]['mind']['approach']), ('习惯。', '旁人知道。', '杀害派的做法'))


class ChecksTest(unittest.TestCase):
    def test_whole_pack_read_kinds(self):
        ents = [dict(x) for x in PEOPLE] + [{'id': 'g', 'name': 'GROUP」联络人', 'kind': 'person', 'aliases': ['GROUP」管理者'], 'static_description': '故事中登场的人物。'}]
        evs = [ev('a.001.b0', 0, [setf('bo', 'alive', True)], ents=['bo', 'ann']),                           # born: no revival
               ev('a.001.b1', 1, [chg('add', 'cat', 'members', ['ann']), setf('ann', 'alive', True), setf('club', 'alive', False),
                                  setf('ann', 'injury', '伤口已缝合'), setf('box', 'holder', 'box')], ents=['ann', 'bo'],
                  course='见open_questions。此 beat 很 reluctantly。'),
               ev('a.001.b2', 2, [setf('bo', 'alive', False), setf('ann', 'status', '等着', until={'event': 'a.001.b1'})], ents=['bo']),
               ev('a.001.b3', 3, [chg('add', 'club', 'members', ['bo'])], ents=['bo'])]
        for x in ents:
            x.setdefault('static_description', '社团里的人。')
        ents[0]['nature'] = [{'from_event': None, 'habits': '习惯；', 'uses': '用。', 'others': '', 'limits': '同时因为他太强。'}]
        out = {t: ls for _, t, _, ls in checks.text_problems(pack(evs, ents), ['texts：「x」没找到'])}
        self.assertEqual(len(out['谓词与实体种类不符']), 3)       # members on a cat, alive on a club, holder of itself
        self.assertEqual(len(out['没死过的人「复活」']), 1)       # ann, not bo (born)
        self.assertEqual(len(out['死人加入组织']), 1)
        self.assertEqual(len(out['状态的结束事件不在它之后']), 1)
        self.assertEqual(len(out['把治疗写成了伤']), 1)
        self.assertEqual(len(out['正文里有研究过程的话']), 1)
        self.assertTrue(any('reluctantly' in x and 'beat' in x for x in out['中文正文里夹着英文词']))
        self.assertEqual(len(out['常态、思考方式的文字残缺']), 3)    # cut off, starts mid-sentence, empty
        self.assertEqual(len(out['名字、别名里的引号不成对']), 2)
        self.assertEqual(len(out['空洞的实体描述']), 1)
        self.assertEqual(out['核对文件里的更正没有对上'], ['texts：「x」没找到'])


class BuilderTest(unittest.TestCase):
    def test_plain_text(self):
        e1 = ev('a.001.b1', 1, title='相遇')
        e2 = ev('a.001.b2', 2, course='为a.001.b1埋下伏笔；此 beat 是本 arc 的转折。')
        ents = [{'id': 'x', 'name': 'X', 'kind': 'place', 'static_description': '在 a 章节中作为场景出现。'}]
        p = pack([e1, e2], ents)
        self.assertEqual(assemble.plain_text(p), 2)
        self.assertEqual(p['events'][1]['summary']['course'], '为「相遇」埋下伏笔；此事件是本篇章的转折。')
        self.assertEqual(ents[0]['static_description'], '在甲篇中作为场景出现。')

    def test_a_dead_leader_leads_nothing_and_a_return_gives_it_back(self):
        evs = [ev('b1', 1, [chg('add', 'club', 'leader', 'ann'), chg('add', 'club', 'members', ['ann'])]),
               ev('b2', 2, [setf('ann', 'alive', False)]), ev('b3', 3, [setf('ann', 'alive', True)])]
        changes.complete(evs, [])
        ops = lambda e: sorted((x['op'], x['predicate']) for x in e['canonical_effects'] if x.get('entity_id') == 'club')  # noqa: E731
        self.assertEqual(ops(evs[1]), [('remove', 'leader'), ('remove', 'members')])
        self.assertEqual(ops(evs[2]), [('add', 'leader'), ('add', 'members')])

    def test_a_revival_is_no_place(self):
        st = assemble.FactState({'ann': {'kind': 'person'}}, None)
        put = []
        st.apply('ann', 'revive', '被唤醒', '', None, lambda *a: put.append(a))
        self.assertEqual(put, [('ann', 'status', '复活（被唤醒）')])

    def test_start_fixes_and_the_dead(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, 'start'))
            with open(os.path.join(d, 'start', 'club.json'), 'w', encoding='utf-8') as f:
                json.dump({'id': 'club', 'members': ['ann', 'bo', 'cy'], 'leader': 'cy', 'why': 'page'}, f)

            class P:
                def p(self, *a):
                    return os.path.join(d, *a)
            by_id = {x['id']: x for x in PEOPLE + [{'id': 'cy', 'name': '赛琳', 'kind': 'person'}]}
            evs = [ev('b1', 1, [setf('bo', 'alive', False)], ents=['bo']), ev('b2', 2, [], ents=['club', 'ann']), ev('b3', 3, [], ents=['cy'])]
            init = start.place(P(), by_id, evs, {'club': {'drop': ['cy'], 'at': {'ann': 'b3'}}})
            # ann where a person put her, bo dead before the club is seen, cy (leader) taken out
            self.assertEqual(evs[2]['canonical_effects'], [{'op': 'add', 'entity_id': 'club', 'predicate': 'members', 'value': ['ann']}])
            self.assertEqual(evs[1]['canonical_effects'], [])
            self.assertEqual(init, [])


if __name__ == '__main__':
    unittest.main()
