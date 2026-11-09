"""常态 (cpb/nature.py): the event list given to the model, the reply checks and the code-side filters."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import nature  # noqa: E402


def ev(i, day, eids, outcomes=(), effects=()):
    return {'id': i, 'title': i, 'when': {'earliest': {'day': day, 'minute': 0}, 'label': f'D{day}'},
            'entity_ids': list(eids), 'outcomes': list(outcomes), 'canonical_effects': list(effects)}


V = {'habits': 'h', 'uses': 'u', 'others': 'o', 'limits': 'l', 'lasts': 'for_good'}

PACK = {'events': [
    ev('past', -30, ['a']),
    ev('start', 1, ['a', 'b']),
    ev('shot', 40, ['a', 'b'], effects=[{'op': 'set', 'fact': {'entity_id': 'a', 'predicate': 'injury', 'value': 'head wound'}}]),
    ev('healed', 45, ['a']),
    ev('sealed', 90, ['a'], outcomes=[{'entity_id': 'a', 'predicate': 'status', 'value': 'sealed'}]),
]}


class NatureTest(unittest.TestCase):
    def test_event_lines_split_at_the_story_start_and_show_own_changes(self):
        before, after, ids = nature.event_lines(PACK, 'a', start_day=0)
        self.assertEqual(len(before), 1)
        self.assertEqual(ids, ['start', 'shot', 'healed', 'sealed'])
        # a canonical effect nests its fact under "fact"; it is still this person's change
        self.assertIn('变化：injury=head wound', after[1])
        # another person at the same event has no change of their own
        self.assertNotIn('变化', nature.event_lines(PACK, 'b', start_day=0)[1][1])

    def test_checks(self):
        ids = ['start', 'shot', 'sealed']
        check = nature.check_nature(ids)
        self.assertEqual(check({'none': True}), [])
        self.assertTrue(check({'versions': [{**V, 'from_event': 'shot'}]}))                         # first must be null
        self.assertTrue(check({'versions': [V, {**V, 'from_event': 'past'}]}))                       # not a listed event
        self.assertTrue(check({'versions': [V, {**V, 'from_event': 'sealed', 'until_event': 'shot', 'lasts': 'until'}]}))  # end before start
        self.assertTrue(check({'versions': [{**V, 'others': ''}]}))                                 # every field written
        # what a later version introduces is not there before it
        early = {**V, 'habits': 'wears the 凯尔特十字架'}
        probs = check({'versions': [early, {**V, 'from_event': 'sealed', 'introduces': ['凯尔特十字架']}]})
        self.assertTrue(any('凯尔特十字架' in p for p in probs))
        # between two later versions it may stay (a device kept from one change to the next)
        self.assertEqual(check({'versions': [V, {**V, 'habits': '轮椅', 'from_event': 'shot'}, {**V, 'from_event': 'sealed', 'introduces': ['轮椅']}]}), [])
        self.assertEqual(check({'versions': [V, {**V, 'habits': 'x', 'from_event': 'sealed', 'introduces': ['凯尔特十字架']}]}), [])

    def test_short_states_and_repeats_are_dropped(self):
        obj = {'versions': [V, {**V, 'habits': 'hurt', 'from_event': 'shot', 'until_event': 'healed', 'lasts': 'until'}, {**V, 'from_event': 'healed'},
                            {**V, 'habits': 'sealed', 'from_event': 'sealed'}]}
        out = nature.drop_short(PACK, obj)
        # five days of a wound: a passing state; the return from it repeats version 1 word for word
        self.assertEqual([v.get('from_event') for v in out['versions']], [None, 'sealed'])
        self.assertEqual(len(out['dropped']), 2)
        # a state the model calls passing is dropped whatever its length
        out = nature.drop_short(PACK, {'versions': [V, {**V, 'habits': 'awakened', 'from_event': 'sealed', 'lasts': 'passing'}]})
        self.assertEqual(len(out['versions']), 1)
        self.assertTrue(nature.check_nature(['sealed'])({'versions': [V, {**V, 'from_event': 'sealed', 'lasts': 'until'}]}))


class PerceiveTest(unittest.TestCase):
    def test_check_and_attach(self):
        check = nature.check_perceive(2)
        self.assertEqual(check({'versions': [{'kinds': ['thoughts'], 'how': 'in sight'}, None]}), [])
        self.assertTrue(check({'versions': [None]}))                                   # one per version
        self.assertTrue(check({'versions': [{'kinds': ['telepathy']}, None]}))          # only the listed kinds
        import tempfile, json, os
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, 'a.json'), 'w', encoding='utf8') as f:
                json.dump({'versions': [{**V, 'from_event': None, 'perceives': {'kinds': ['thoughts'], 'how': 'in sight'}}]}, f)
            pk = {'events': [], 'entities': [{'id': 'a', 'name': 'A', 'kind': 'person'}]}
            self.assertEqual(nature.attach(pk, d), 1)
            self.assertEqual(pk['entities'][0]['nature'][0]['perceives'], {'kinds': ['thoughts'], 'how': 'in sight'})


class FakeClient:
    def __init__(self, story):
        self.story = story

    def call(self, task, version, system, user, check=None, max_tokens=None):
        return {'story': self.story}


class StoryTest(unittest.TestCase):
    PACK = {'entities': [{'id': 'me', 'name': '御坂10032号', 'aliases': ['御坂'], 'kind': 'person'},
                         {'id': 'k', 'name': '白井黑子', 'aliases': ['黑子'], 'kind': 'person'},
                         {'id': 'm', 'name': '御坂美琴', 'aliases': ['美琴', '御坂'], 'kind': 'person'},
                         {'id': 'y', 'name': '木原唯一', 'aliases': ['唯一'], 'kind': 'person'}],
            'events': [{'id': 'e1', 'entity_ids': ['me', 'k', 'm']}, {'id': 'e2', 'entity_ids': ['y']}]}

    def test_names_outside_limits_are_sent_back(self):
        names = nature.other_names(self.PACK, 'me')
        self.assertIn('白井黑子', names)
        self.assertNotIn('御坂', names)          # part of her own name: her 「御坂……」 speech is not someone else
        self.assertNotIn('唯一', names)          # never shares an event with her: the common word stays a word
        check = nature.check_nature([], names)
        self.assertTrue(check({'versions': [{**V, 'uses': '对白井黑子施以电击'}]}))
        self.assertEqual(check({'versions': [{**V, 'habits': '说话用「御坂……」', 'limits': '对美琴无效'}]}), [])

    def test_story_sentences_are_removed(self):
        obj = {'versions': [{**V, 'uses': '对纠缠的人放电。曾把信号塔射上平流层。', 'others': '黑子总被电。朋友知道她会放电。'}]}
        out = nature.strip_story(FakeClient(['曾把信号塔射上平流层', '黑子总被电', 'not in the text at all']), obj)
        v = out['versions'][0]
        self.assertEqual(v['uses'], '对纠缠的人放电。')
        self.assertEqual(v['others'], '朋友知道她会放电。')
        self.assertEqual(len(out['removed_story']), 2)


if __name__ == '__main__':
    unittest.main()
