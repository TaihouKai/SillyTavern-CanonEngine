"""The verified combat pool in the pack's shape (combat.place, combat.attach): what belongs to one entity is written on it,
the setting keeps what belongs to no one, who holds an object or belongs to an organization is a fact.
Run: python -m unittest discover -s tests"""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cpb import combat  # noqa: E402

P = lambda part='effect', text='x': {'part': part, 'text': text}  # noqa: E731


def pack():
    ent = lambda i, kind, name=None: {'id': i, 'name': name or i, 'aliases': [], 'kind': kind, 'static_description': i, 'source_refs': ['s']}  # noqa: E731
    ev = lambda i, effects=(): {'id': i, 'title': i, 'entity_ids': [], 'canonical_effects': list(effects)}  # noqa: E731
    return {'entities': [ent('ann', 'person'), ent('bo', 'person'), ent('cy', 'person'), ent('sword', 'object', '圣剑'),
                         ent('guild', 'organization', '剑士团'), ent('order', 'organization', '骑士会'), ent('suit', 'object', '铠甲')],
            'initial_state': {'facts': [{'fact': {'entity_id': 'order', 'predicate': 'members', 'value': ['guild']}}]},
            'events': [ev('e1', [{'op': 'add', 'entity_id': 'guild', 'predicate': 'members', 'value': ['bo']}]), ev('e2'), ev('e3')],
            'sources': [{'id': 's'}]}


def pool():
    n = lambda i, kind, name, origin='setting', owners=(), parts=True: {'id': i, 'kind': kind, 'name': name, 'gist': name + '的要点', 'text': name + '的全文', 'origin': origin, 'owner_ids': list(owners), **({'parts': [P()]} if kind == 'ability' and parts else {})}  # noqa: E731
    return {'basis': 'b',
            'nodes': [n('fencer', 'concept', '剑士'), n('blade-art', 'ability', '剑术', 'people', ['ann']),
                      n('sword-cb', 'ability', '圣剑'), n('guild-cb', 'concept', '剑士团'), n('rifle', 'ability', '步枪'),
                      n('war-cry', 'ability', '战吼', 'people', ['bo']), n('war-cry-2', 'ability', '战吼', 'people', ['cy']),
                      n('armour', 'concept', '铠甲'), n('fight-1', 'precedent', '一战')],
            'links': [{'from': 'ann', 'to': 'fencer', 'label': '是', 'origin': 'people'}, {'from': 'ann', 'to': 'blade-art', 'label': '能力', 'from_event': 'e2', 'origin': 'people'},
                      {'from': 'ann', 'to': 'sword-cb', 'label': '持有', 'origin': 'people'}, {'from': 'bo', 'to': 'guild-cb', 'label': '所属', 'origin': 'people'},
                      {'from': 'cy', 'to': 'guild-cb', 'label': '所属', 'origin': 'people'}, {'from': 'bo', 'to': 'rifle', 'label': '使用', 'origin': 'people'},
                      {'from': 'cy', 'to': 'rifle', 'label': '使用', 'origin': 'people'}, {'from': 'bo', 'to': 'war-cry', 'label': '能力', 'origin': 'people'},
                      {'from': 'cy', 'to': 'war-cry-2', 'label': '能力', 'origin': 'people'}, {'from': 'guild-cb', 'to': 'fencer', 'label': '成员是', 'origin': 'setting'},
                      {'from': 'blade-art', 'to': 'guild-cb', 'label': '源自', 'origin': 'setting'}, {'from': 'ann', 'to': 'armour', 'label': '穿', 'origin': 'people'}],
            'styles': {'ann': [{'from_event': None, 'start': 'a', 'force': 'a', 'response': 'a', 'limit': 'a', 'stop': 'a'}]}}


class PlaceTest(unittest.TestCase):
    def run_place(self, review, the_pool=None):
        d = tempfile.mkdtemp()
        proj = type('P', (), {'name': 'x', 'p': lambda self, *a: os.path.join(d, *a)})()
        os.makedirs(os.path.join(d, 'combat'), exist_ok=True)
        with open(combat.pool_path(proj), 'w', encoding='utf8') as f:
            json.dump(the_pool or pool(), f, ensure_ascii=False)
        combat.review_path = lambda project: os.path.join(d, 'review.json')
        combat.golden_path = lambda project: os.path.join(d, 'golden.json')
        with open(os.path.join(d, 'review.json'), 'w', encoding='utf8') as f:
            json.dump(review, f, ensure_ascii=False)
        return combat.place(proj, pack())

    def test_named_like_an_entity_must_be_decided(self):
        with self.assertRaises(SystemExit) as c:
            self.run_place({})
        self.assertIn('sword-cb 「圣剑」 is named like sword', str(c.exception))
        self.assertIn('guild-cb 「剑士团」 is named like guild', str(c.exception))

    def test_placement_ties_and_holders(self):
        rv = {'placement': {'sword-cb': {'entity': 'sword'}, 'guild-cb': {'entity': 'guild'}, 'war-cry-2': {'merge': 'war-cry'}, 'armour': {'entity': 'suit'}},
              'ties': {'ann|armour': 'link'},
              'holders': [{'object': 'sword', 'holder': 'ann', 'at': 'e1', 'until': 'e3'}]}
        with self.assertRaises(SystemExit) as c:   # cy is in no fact of the guild: decide
            self.run_place(rv)
        self.assertIn('"cy|guild-cb"', str(c.exception))
        rv['ties']['cy|guild-cb'] = 'drop'
        g = self.run_place(rv)
        E = g['entities']
        # the setting keeps what belongs to no one entity (a kind, a shared rifle, the precedent)
        self.assertEqual(sorted(n['id'] for n in g['nodes']), ['fencer', 'fight-1', 'rifle'])
        self.assertNotIn('owner_ids', g['nodes'][0])
        # a person's own ability, from when they have it, with its links into the setting (an entity's 战斗中 too)
        self.assertEqual(E['ann']['abilities'], [{'id': 'blade-art', 'name': '剑术', 'gist': '剑术的要点', 'text': '剑术的全文', 'parts': [P()], 'from_event': 'e2', 'links': [{'to': 'guild', 'label': '源自'}]}])
        # what an object is: its own ability; who holds it is a fact (the holder decided), not a link
        self.assertEqual([a['id'] for a in E['sword']['abilities']], ['sword-cb'])
        self.assertEqual(E['ann']['setting'], [{'node': 'fencer', 'label': '是'}, {'node': 'suit', 'label': '穿'}])
        # an organization: what it is in a fight, and its links further (its kind of member)
        self.assertEqual(E['guild']['fighting'], {'gist': '剑士团的要点', 'text': '剑士团的全文'})
        self.assertEqual(E['guild']['setting'], [{'node': 'fencer', 'label': '成员是'}])
        # bo belongs (a fact): no link; the shared rifle is a link of both; a merged node is one
        self.assertEqual(E['bo']['setting'], [{'node': 'rifle', 'label': '使用'}])
        self.assertEqual([a['id'] for a in E['bo']['abilities']], ['war-cry'])
        self.assertEqual(E['cy']['setting'], [{'node': 'rifle', 'label': '使用'}, {'node': 'war-cry', 'label': '能力'}])
        # into the pack: aspects on the entities, holders as effects of their event (lasting, or until an event)
        pk = pack()
        report = combat.attach(pk, g, 's')
        self.assertIn('1 holders', report)
        ents = {e['id']: e for e in pk['entities']}
        self.assertEqual(ents['ann']['aspects']['abilities'][0]['source_refs'], ['s'])
        self.assertEqual(ents['ann']['aspects']['combat_style'][0]['start'], 'a')
        self.assertEqual(pk['events'][0]['canonical_effects'][-1], {'op': 'set', 'fact': {'entity_id': 'sword', 'predicate': 'holder', 'value': 'ann'}, 'until': {'event': 'e3'}})
        self.assertIn('sword', pk['events'][0]['entity_ids'])
        self.assertEqual(combat.problems(pk, g)[:1], ['combat: bo (bo) has no verified 对抗倾向'])

    def test_member_of_a_member_organization_counts(self):
        # cy joins the order's guild through the order: a member of a member organization is in the larger one
        p = pool()
        p['links'] = [l for l in p['links'] if l['from'] != 'cy' or l['to'] != 'guild-cb'] + [{'from': 'bo', 'to': 'order-cb', 'label': '所属', 'origin': 'people'}]
        p['nodes'].append({'id': 'order-cb', 'kind': 'concept', 'name': '骑士会', 'gist': 'g', 'text': 't', 'origin': 'setting', 'owner_ids': []})
        rv = {'placement': {'sword-cb': {'entity': 'sword'}, 'guild-cb': {'entity': 'guild'}, 'order-cb': {'entity': 'order'}, 'armour': 'setting'},
              'holders': [{'object': 'sword', 'holder': 'ann', 'at': 'e1'}]}
        g = self.run_place(rv, p)
        # bo is in the guild (a fact), the guild in the order: no tie to decide, and no link (the facts carry it)
        self.assertFalse(any(x['node'] in ('guild', 'order') for x in g['entities']['bo'].get('setting', [])))

    def test_uses(self):
        p = pool()
        p['nodes'] += [{'id': 'feint', 'kind': 'ability', 'name': '佯攻', 'gist': 'g', 'text': 't', 'origin': 'people', 'owner_ids': ['ann'], 'parts': [P()]},
                       {'id': 'feint-2', 'kind': 'ability', 'name': '二段佯攻', 'gist': 'g', 'text': 't', 'origin': 'people', 'owner_ids': ['ann'], 'parts': [P()]}]
        p['links'] += [{'from': 'ann', 'to': 'feint', 'label': '能力', 'origin': 'people'}, {'from': 'ann', 'to': 'feint-2', 'label': '能力', 'origin': 'people'}]
        base = {'placement': {'sword-cb': {'entity': 'sword'}, 'guild-cb': {'entity': 'guild'}, 'armour': 'setting'}, 'ties': {'cy|guild-cb': 'drop'},
                'holders': [{'object': 'sword', 'holder': 'ann', 'at': 'e1'}]}
        g = self.run_place({**base, 'uses': {'feint': 'blade-art'}}, p)
        self.assertEqual({a['id']: a.get('of') for a in g['entities']['ann']['abilities']}, {'blade-art': None, 'feint': 'blade-art', 'feint-2': None})
        for bad, msg in (({'feint': 'war-cry'}, "war-cry is bo's"), ({'feint': 'blade-art', 'feint-2': 'feint'}, 'that one is a use itself'), ({'feint': 'feint'}, 'of itself'), ({'feint': 'nothing'}, 'must be abilities')):
            with self.assertRaises(SystemExit) as c:
                self.run_place({**base, 'uses': bad}, p)
            self.assertIn(msg, str(c.exception))
        pk = pack()
        combat.attach(pk, g, 's')
        ann = next(e for e in pk['entities'] if e['id'] == 'ann')
        self.assertEqual([a.get('of') for a in ann['aspects']['abilities']], [None, 'blade-art', None])


if __name__ == '__main__':
    unittest.main()
