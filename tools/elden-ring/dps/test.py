#!/usr/bin/env python3
import copy
import unittest
from pathlib import Path
from prepare import select_attacks
from validate import load_payload, validate

PAYLOAD = Path(__file__).resolve().parents[3] / 'data/elden-ring-dps/payload.json'


class DpsDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_payload(PAYLOAD)

    def test_all_cross_references(self):
        self.assertEqual(validate(self.data)['profiles_checked'], 1189)

    def test_longsword_alternatives_are_not_two_hits(self):
        profile = self.data['profiles']['weapon:2000000:1h-r1']
        b = next(x for x in profile['window_bindings'] if x['animation_id'] == 'a023_030000')
        self.assertEqual(b['candidate_attack_keys'], ['100200000:768', '100200000:876'])
        self.assertEqual(b['matched_attack_keys'], ['100200000:768'])
        self.assertEqual(b['resolution'], 'unique_applicable_reference')
        self.assertIsNone(profile['cycle_seconds'])
        self.assertEqual(profile['transition_edges'], [])
        self.assertFalse(profile['ranking_eligible'])

    def test_pebble_selects_only_its_own_projectile(self):
        p = self.data['profiles']['spell:4000:ground-cast']
        b = next(x for x in p['window_bindings'] if x['animation_id'] == 'a401_045010')
        self.assertEqual(b['matched_attack_keys'], ['40000:2904'])
        self.assertEqual(b['coefficient_variant_ids'], {'40000:2904': ['spell:4000:row:2']})
        self.assertEqual(b['bullet_roots'], [10400000])
        self.assertEqual(self.data['spell_coefficients']['spell:4000:row:2']['typed_attack_coefficient']['magic'], 152)

    def test_source_timing_not_converted_or_overwritten(self):
        animation = self.data['animations']['a023_030000']
        self.assertEqual(animation['active_windows'][0]['range_source_frames'], [13, 16])
        gradients = self.data['animations']['a137_030000']['speed_gradients']
        self.assertEqual(gradients[0], {'range': [0, 11], 'startSpeed': 1.2, 'endSpeed': 1.2})
        self.assertIsNone(self.data['time_base']['seconds_per_unit'])

    def test_missing_bullet_remains_visible(self):
        self.assertIn(10501011, self.data['missing_references']['bullets'])
        affected = [p for p in self.data['profiles'].values() if any(10501011 in b['missing_bullet_ids'] for b in p['window_bindings'])]
        self.assertTrue(affected)
        self.assertTrue(all('missing_bullet_reference' in p['validation']['blockers'] for p in affected))

    def test_no_fallback_to_wrong_entity_or_first_candidate(self):
        attacks = {'a': {'weapons': ['A']}, 'b': {'weapons': ['A']}}
        self.assertEqual(select_attacks(['a', 'b'], 'A', attacks)['resolution'], 'multiple_applicable_references')
        self.assertEqual(select_attacks(['a'], 'a', attacks)['matched_attack_keys'], [])
        self.assertEqual(select_attacks(['a', 'missing'], 'A', attacks)['resolution'], 'missing_reference')
        self.assertEqual(select_attacks([], 'A', attacks)['resolution'], 'no_attack_reference')

    def test_wrong_coefficient_join_is_rejected(self):
        broken = copy.deepcopy(self.data)
        p = broken['profiles']['spell:4000:ground-cast']
        b = next(x for x in p['window_bindings'] if x['animation_id'] == 'a401_045010')
        b['coefficient_variant_ids']['40000:2904'] = ['spell:4001:row:3']
        with self.assertRaises((AssertionError, KeyError)):
            validate(broken)


if __name__ == '__main__':
    unittest.main()
