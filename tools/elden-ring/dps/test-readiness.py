import unittest
from validate import load_payload
from readiness import compile_profile
from pathlib import Path

class ReadinessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_payload(Path('data/elden-ring-dps/payload.json'))

    def test_longsword_excludes_empty_ninth_stage_and_closes_loop(self):
        result = compile_profile(self.data, 'weapon:2000000:1h-r1')
        self.assertEqual(result['status'], 'model_candidate')
        self.assertEqual(len(result['steps']), 5)
        self.assertEqual([s['transition_source_frame'] for s in result['steps']], [17, 18, 19, 16, 44])
        self.assertEqual(result['cycle_source_frames'], 114)
        self.assertEqual(result['cycle_seconds'], 3.8)
        self.assertEqual(result['steps'][-1]['next_animation_id'], result['steps'][0]['animation_id'])
        self.assertFalse(result['ranking_eligible'])

    def test_dagger_six_steps_include_recovery(self):
        result = compile_profile(self.data, 'weapon:1000000:1h-r1')
        self.assertEqual(result['cycle_source_frames'], 96)
        self.assertEqual(len(result['steps']), 6)
        self.assertEqual(result['cycle_seconds'], 3.2)

    def test_speed_gradient_is_blocked_instead_of_ignored(self):
        result = compile_profile(self.data, 'weapon:2000000:2h-r1')
        self.assertEqual(result['status'], 'blocked')
        self.assertIn('speed_gradient_model_not_verified', result['blockers'])
        self.assertIsNone(result['cycle_seconds'])

    def test_spells_do_not_enter_melee_model(self):
        result = compile_profile(self.data, 'spell:4000:ground-cast')
        self.assertEqual(result['status'], 'blocked')
        self.assertFalse(result['ranking_eligible'])

    def test_every_model_closes_and_preserves_selected_references(self):
        candidates = 0
        for pid in self.data['profiles']:
            result = compile_profile(self.data, pid)
            self.assertFalse(result['ranking_eligible'])
            if result['status'] != 'model_candidate':
                self.assertIsNone(result['cycle_seconds'])
                self.assertTrue(result['blockers'])
                continue
            candidates += 1
            steps = result['steps']
            self.assertEqual(sum(s['transition_source_frame'] for s in steps), result['cycle_source_frames'])
            for i, step in enumerate(steps):
                self.assertEqual(step['next_animation_id'], steps[(i + 1) % len(steps)]['animation_id'])
                self.assertLess(step['cycle_hit_source_frame'], result['cycle_source_frames'])
                binding = next(b for b in self.data['profiles'][pid]['window_bindings']
                               if b['animation_id'] == step['animation_id'] and b['window_index'] == step['window_index'])
                self.assertEqual(binding['matched_attack_keys'], [step['attack_key']])
        self.assertEqual(candidates, 86)

if __name__ == '__main__': unittest.main()
