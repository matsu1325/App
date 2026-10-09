#!/usr/bin/env python3
"""Validate the generated all-skill dataset and known pilot regression cases."""
import argparse
import base64
import csv
import gzip
import hashlib
from pathlib import Path

from common import read, reachable, sha256

ROOT = Path(__file__).resolve().parents[3]


def verify(root):
    index = read(root / 'index.json')
    for name, entry in index['files'].items():
        assert sha256(root / name) == entry['sha256'], f'file changed: {name}'
        assert (root / name).stat().st_size == entry['bytes'], f'size changed: {name}'
    wrapper = read(root / 'payload.json')
    packed = gzip.decompress(base64.b64decode(wrapper['data']))
    assert hashlib.sha256(packed).hexdigest() == wrapper['sha256'], 'payload hash mismatch'
    assert len(packed) == wrapper['raw_bytes'], 'payload size mismatch'
    with (root / 'coverage.csv').open(encoding='utf-8-sig', newline='') as handle:
        assert len(list(csv.DictReader(handle))) == 278, 'coverage CSV is incomplete'
    skills, actions, nodes, variants, audit = [read(root / (name + '.json')) for name in
                                             ['skills', 'actions', 'parameters', 'attack-variants', 'audit']]
    assert len(skills) == audit['counts']['catalog_rows'] == 278
    playable = [s for s in skills.values() if s['classification'] == 'player_linked_candidate']
    assert len(playable) == 267 and all(s['actions'] for s in playable)
    assert skills['1']['classification'] == skills['10']['classification'] == 'no_skill'
    assert skills['101']['skill_id'] != skills['5590']['skill_id'], 'same-name skills merged'
    assert audit['counts']['measured_cases'] == audit['counts']['simulator_ready_skills'] == 0
    for skill in skills.values():
        assert not skill['validation']['simulator_ready']
        for cost in skill['costs'].values():
            assert (cost['fp'] is None) == cost['sentinel'], 'unknown FP converted to zero'
    for action in actions.values():
        assert action['damage'] is action['dps'] is action['damage_per_fp'] is action['cycle_seconds'] is None
        assert action['input_sequence'] is action['fp_total'] is action['hit_count'] is None
        deps = reachable(action['parameter_roots'] + action['candidate_parameter_roots'], nodes)
        assert deps == action['dependency_nodes'], f"incomplete graph: {action['action_id']}"
        assert sorted(key for key in deps if key not in nodes) == action['missing_dependency_nodes']
        if action['missing_dependency_nodes']:
            assert 'missing_parameter_dependency' in action['blockers']
        for window in action['windows']:
            for binding in window['weapon_bindings'].values():
                assert binding['hit_count'] is None
    # The six normal pilot actions and their FP-insufficient parameters are distinct.
    coefficients = {300300820: 240, 300300821: 138, 300000010: 187, 300000011: 90,
                    300000560: 190, 300000561: 115, 300000565: 245, 300000566: 135,
                    300000700: 200, 300000701: 120, 300000705: 240, 300000706: 155}
    for param_id, mv in coefficients.items():
        node = nodes[f'attack:{param_id}']
        assert all(value == mv for value in node['typed_mv'].values()), f'pilot regression: {param_id}'
        assert all(value == 0 for value in node['typed_flat'].values())
    expected_fp = {100: {'L2': 20}, 101: {'L2': 9}, 114: {'L2': 0, 'R1': 10, 'R2': 15},
                   115: {'L2': 0, 'R1': 6, 'R2': 8}}
    for skill_id, costs in expected_fp.items():
        for button, value in costs.items():
            assert skills[str(skill_id)]['costs'][button]['fp'] == value
    # Same attack parameter, different bullet IDs: preserve the emitted parent/child graph.
    moon = actions['1178:a778_040060']
    projectile = next(window for window in moon['windows'] if window['source_type'] == 'Bullet')
    binding = projectile['weapon_bindings']['Moonveil']
    assert len(binding['matched_refs']) == 2 and len(binding['exact_alias_groups']) == 2
    assert binding['resolution'] == 'multiple_components_require_hit_semantics'
    assert binding['bullet_topology']['candidate_emission_roots'] == ['bullet:2950']
    assert binding['bullet_topology']['parent_descendant_relations'] == [{'parent': 'bullet:2950', 'descendant': 'bullet:2951'}]
    assert {'field': 'intervalCreateBulletId', 'node': 'bullet:2951'} in nodes['bullet:2950']['edges']
    assert nodes['bullet:2950']['fields']['isUseSharedHitList'] == 1
    # A real two-window followup must remain two distinct attack windows.
    savage = actions['4150:a882_040010']
    assert len(savage['windows']) == 2
    for window, mv in zip(savage['windows'], [68, 155]):
        binding = window['weapon_bindings']['Longsword']
        assert binding['resolution'] == 'unique_or_exact_alias'
        attack = variants[binding['matched_refs'][0]]
        assert attack['source_fields']['physicalDamageMV'] == mv
    # Buffs retain enemy/player rates and activation uncertainty separately.
    for skill_id, effect_id, rate in [(600, 1691, 1.6), (601, 1701, 1.8)]:
        assert f'effect:{effect_id}' in skills[str(skill_id)]['candidate_effect_roots']
        effect = nodes[f'effect:{effect_id}']
        assert effect['fields']['atkEnemyDmgCorrectRate_Physics'] == rate
        assert effect['activation_and_consumption_verified'] is False
        assert effect['duration_seconds_raw'] == 10
    assert audit['variant_validation_counts']['raw_generated_mv'].get('mismatch', 0) == 0
    assert audit['variant_validation_counts']['raw_generated_flat'].get('mismatch', 0) == 0
    assert audit['variant_validation_counts']['reference_sheet_mv'].get('mismatch', 0) == 0
    print(f"validated {len(skills)} catalog rows, {len(actions)} actions, {len(nodes)} parameter nodes")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ROOT / 'data/elden-ring-skills/all')
    verify(parser.parse_args().data)
