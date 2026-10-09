"""Guard against treating alternative weapon references as multiple hits."""
import unittest

from pilot import select_candidate


class CandidateSelectionTest(unittest.TestCase):
    def test_alternatives_are_not_added(self):
        attacks = {'normal': {'weapons': ['Longsword']},
                   'strike': {'weapons': ['Stone-Sheathed Sword']}}
        self.assertEqual(select_candidate(list(attacks), attacks, 'Longsword'), 'normal')
        self.assertEqual(select_candidate(list(attacks), attacks, 'Stone-Sheathed Sword'), 'strike')

    def test_missing_weapon_blocks(self):
        with self.assertRaises(ValueError):
            select_candidate(['a'], {'a': {'weapons': ['Longsword']}}, 'Uchigatana')

    def test_overlapping_candidates_block(self):
        with self.assertRaises(ValueError):
            select_candidate(['a', 'b'], {'a': {'weapons': ['Longsword']},
                                         'b': {'weapons': ['Longsword']}}, 'Longsword')

    def test_empty_window_blocks(self):
        with self.assertRaises(ValueError):
            select_candidate([], {}, 'Longsword')


if __name__ == '__main__':
    unittest.main()
