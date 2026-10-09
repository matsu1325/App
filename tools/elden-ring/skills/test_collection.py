"""Boundary tests for safe graph traversal and reference selection."""
import tempfile
import unittest
from pathlib import Path

from common import bullet_topology, cycle_witnesses, select_bindings, verify_manifest, walk_graph


class ReferenceGraphTest(unittest.TestCase):
    def test_cycle_stops_and_keeps_missing_edge(self):
        source = {'bullet:1': {'edges': [{'node': 'bullet:2', 'field': 'HitBulletID'}]},
                  'bullet:2': {'edges': [{'node': 'bullet:1', 'field': 'intervalCreateBulletId'},
                                         {'node': 'attack:99', 'field': 'atkId_Bullet'}]}}
        nodes, missing = walk_graph(['bullet:1'], source.get)
        self.assertEqual(set(nodes), {'bullet:1', 'bullet:2'})
        self.assertEqual(missing, ['attack:99'])
        self.assertEqual(len(cycle_witnesses(nodes)), 1)

    def test_shared_child_is_not_a_cycle(self):
        source = {'root': {'edges': [{'node': 'a', 'field': 'first'}, {'node': 'b', 'field': 'second'}]},
                  'a': {'edges': [{'node': 'b', 'field': 'shared'}]}, 'b': {'edges': []}}
        nodes, missing = walk_graph(['root'], source.get)
        self.assertEqual(missing, [])
        self.assertEqual(cycle_witnesses(nodes), [])

    def test_self_effect_reference_is_recorded(self):
        source = {'effect:1': {'edges': [{'node': 'effect:1', 'field': 'replaceSpEffectId'}]}}
        nodes, _ = walk_graph(['effect:1'], source.get)
        self.assertEqual(cycle_witnesses(nodes)[0]['from'], 'effect:1')

    def test_traversal_limit_is_not_silent_truncation(self):
        def resolve(key):
            return {'edges': [{'node': str(int(key) + 1), 'field': 'child'}]}
        with self.assertRaisesRegex(ValueError, 'limit'):
            walk_graph(['1'], resolve, max_nodes=4)


class AttackSelectionTest(unittest.TestCase):
    def test_duplicate_alias_does_not_double_damage(self):
        source = {'one': {'refs': {'key': 'one', 'atkParamId': 10, 'bulletId': 20},
                          'physicalDamageMV': 0, 'weapons': ['Moonveil']},
                  'alias': {'refs': {'key': 'alias', 'atkParamId': 10, 'bulletId': 20},
                            'physicalDamageMV': 0, 'weapons': ['Moonveil']}}
        binding = select_bindings(list(source), source, 'Moonveil')
        self.assertEqual(binding['resolution'], 'unique_or_exact_alias')
        self.assertEqual(len(binding['exact_alias_groups']), 1)
        self.assertIsNone(binding['hit_count'])

    def test_distinct_damage_components_are_not_aliases(self):
        source = {'one': {'refs': {'key': 'one', 'atkParamId': 10, 'bulletId': 20},
                          'physicalDamageMV': 100, 'weapons': ['W']},
                  'two': {'refs': {'key': 'two', 'atkParamId': 10, 'bulletId': 20},
                          'physicalDamageMV': 200, 'weapons': ['W']}}
        binding = select_bindings(list(source), source, 'W')
        self.assertEqual(binding['resolution'], 'multiple_components_require_hit_semantics')

    def test_missing_reference_blocks_even_when_one_candidate_matches(self):
        source = {'one': {'refs': {'key': 'one'}, 'weapons': ['W']}}
        self.assertEqual(select_bindings(['one', 'missing'], source, 'W')['resolution'], 'missing_reference')

    def test_unavailable_weapon_is_not_assigned_an_attack(self):
        source = {'one': {'refs': {'key': 'one'}, 'weapons': ['W']}}
        self.assertEqual(select_bindings(['one'], source, 'Other')['resolution'], 'no_applicable_reference')


class BulletTopologyTest(unittest.TestCase):
    def test_parent_and_child_are_not_two_emission_roots(self):
        nodes = {'bullet:1': {'edges': [{'node': 'bullet:2', 'field': 'intervalCreateBulletId'},
                                        {'node': 'attack:9', 'field': 'atkId_Bullet'}]},
                 'bullet:2': {'edges': []}}
        topology = bullet_topology(['bullet:1', 'bullet:2'], nodes)
        self.assertEqual(topology['candidate_emission_roots'], ['bullet:1'])
        self.assertEqual(topology['parent_descendant_relations'], [{'parent': 'bullet:1', 'descendant': 'bullet:2'}])
        self.assertIsNone(topology['hit_count'])

    def test_cycle_does_not_fabricate_an_emission_root(self):
        nodes = {'bullet:1': {'edges': [{'node': 'bullet:2', 'field': 'HitBulletID'}]},
                 'bullet:2': {'edges': [{'node': 'bullet:1', 'field': 'HitBulletID'}]}}
        topology = bullet_topology(list(nodes), nodes)
        self.assertIsNone(topology['candidate_emission_roots'])
        self.assertTrue(topology['cycle_witnesses'])

    def test_missing_child_stays_visible(self):
        nodes = {'bullet:1': {'edges': [{'node': 'bullet:99', 'field': 'HitBulletID'}]}}
        self.assertEqual(bullet_topology(['bullet:1'], nodes)['missing_bullet_nodes'], ['bullet:99'])


class SnapshotTest(unittest.TestCase):
    def test_changed_source_blocks_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'source.json').write_text('{}')
            with self.assertRaisesRegex(ValueError, 'changed'):
                verify_manifest(root, [{'id': 'frame:source', 'file': 'source.json',
                                        'actual_sha256': 'incorrect', 'sha256': 'incorrect'}])


if __name__ == '__main__':
    unittest.main()
