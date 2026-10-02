#!/usr/bin/env python3
"""Compile conservative, explicitly unverified timing hypotheses for review.

This sidecar does not promote the schema-v1 candidate payload to verified data.
"""
import argparse
import collections
import json
from pathlib import Path
from validate import load_payload

# Explicit normalized-category mapping to GetAttackMaxNumber in the pinned HKS.
COMBO_LENGTH = {
    'Dagger': 6, 'Straight Sword': 5, 'Greatsword': 4, 'Colossal Sword': 3,
    'Curved Sword': 6, 'Curved Greatsword': 4, 'Katana': 5, 'Great Katana': 4,
    'Thrusting Sword': 6, 'Heavy Thrusting Sword': 5, 'Axe': 5, 'Greataxe': 4,
    'Hammer': 5, 'Great Hammer': 4, 'Colossal Weapon': 3, 'Flail': 4,
    'Spear': 4, 'Great Spear': 3, 'Halberd': 4, 'Reaper': 4, 'Whip': 4,
    'Light Greatsword': 5,
}
HYPOTHESES = [
    'source_frame_is_1_over_30_second',
    'animation_event_names_correspond_to_hks_states',
    'earliest_compatible_regular_cancel_is_repeat_transition',
    'one_active_window_hits_exactly_once',
    'no_extra_blend_input_or_hitstop_delay',
    'unlimited_stamina_and_fp',
    'no_conditional_buffs_or_status_procs',
    'hks_community_edits_do_not_affect_this_path',
]


def compile_profile(data, pid):
    profile = data['profiles'][pid]
    entity = data['entities'][profile['entity_id']]
    reasons, steps = [], []
    result = {'profile_id': pid, 'status': 'blocked', 'ranking_eligible': False,
              'hypothesis_set': 'standard-melee-v1', 'steps': [], 'cycle_seconds': None,
              'cycle_source_frames': None, 'blockers': reasons,
              'evidence_ids': ['explorer-time-base', 'hks-r1-state-branches', 'hks-combo-length']}
    if entity['kind'] != 'weapon':
        reasons.append('spell_stage_graph_requires_individual_review')
        return result
    length = COMBO_LENGTH.get(entity['category'])
    if length is None:
        reasons.append('category_not_in_initial_model')
    if entity.get('motion_parameters', {}).get('isDualBlade') != 0:
        reasons.append('paired_weapon_requires_individual_review')
    if entity.get('motion_parameters', {}).get('spAtkcategory') != 0:
        reasons.append('special_weapon_category_requires_individual_review')
    if reasons:
        return result
    hand = profile['action'][:2]
    ids = []
    for number in range(1, length + 1):
        matches = [aid for aid in profile['animation_ids']
                   if data['animations'][aid]['name'] == f'{hand} R1 {number}']
        if len(matches) != 1:
            reasons.append(f'stage_{number}_not_unique')
        else:
            ids.append(matches[0])
    if reasons:
        return result
    elapsed = 0
    for i, aid in enumerate(ids):
        animation = data['animations'][aid]
        target_id = ids[(i + 1) % len(ids)]
        target = data['animations'][target_id]
        if animation['speed_gradients']:
            reasons.append('speed_gradient_model_not_verified')
        windows = animation['active_windows']
        if len(windows) != 1 or windows[0]['type'] != 'Attack':
            reasons.append('requires_single_melee_window')
            continue
        binding = next(b for b in profile['window_bindings'] if b['animation_id'] == aid and b['window_index'] == 0)
        if binding['resolution'] != 'unique_applicable_reference':
            reasons.append('requires_unique_attack_reference')
            continue
        attack_key = binding['matched_attack_keys'][0]
        attack = data['attacks'][attack_key]
        fields = attack['source_fields']
        if attack['refs'].get('bulletId') is not None:
            reasons.append('projectile_attack_requires_individual_review')
        if any(fields.get(t + 'DamageFlat') != 0 for t in ['physical', 'magic', 'fire', 'lightning', 'holy']):
            reasons.append('flat_attack_component_requires_individual_review')
        for t in ['phys', 'magic', 'fire', 'lightning', 'holy']:
            if fields.get(t + 'DamageRateFinal') != 1:
                reasons.append('final_damage_multiplier_requires_individual_review')
        cancels = [c for c in animation['cancel_windows']
                   if c['type'] in ['RightAttack', 'LightAttackOnly']
                   and c['type'] in target['cancel_from_types']
                   and 'Regular' in c['ranges_source_frames']]
        if not cancels:
            reasons.append('no_compatible_regular_cancel')
            continue
        cancel = min(cancels, key=lambda c: c['ranges_source_frames']['Regular'][0])
        end = cancel['ranges_source_frames']['Regular'][0]
        start, last = windows[0]['range_source_frames']
        if end <= 0 or last > end:
            reasons.append('attack_window_extends_after_transition')
            continue
        steps.append({'animation_id': aid, 'next_animation_id': target_id,
            'window_index': 0, 'attack_key': attack_key,
            'transition_source_frame': end, 'cancel_type': cancel['type'],
            'hit_source_frame': start, 'cycle_hit_source_frame': elapsed + start,
            'duration_seconds': end / 30})
        elapsed += end
    result['blockers'] = sorted(set(reasons))
    if not reasons and len(steps) == length:
        result.update(status='model_candidate', steps=steps,
                      cycle_source_frames=elapsed, cycle_seconds=elapsed / 30)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--payload', type=Path, default=Path('data/elden-ring-dps/payload.json'))
    parser.add_argument('--output-dir', type=Path, default=Path('data/elden-ring-dps'))
    args = parser.parse_args()
    data = load_payload(args.payload)
    profiles = {pid: compile_profile(data, pid) for pid in sorted(data['profiles'])}
    result = {'schema_version': 1, 'kind': 'preimplementation-review',
        'base_payload_sha256': json.loads(args.payload.read_text())['sha256'],
        'hypothesis_sets': {'standard-melee-v1': HYPOTHESES},
        'time_base': {'source_units_per_second': 30, 'status': 'source_display_confirmed',
                      'in_game_verified': False, 'evidence_id': 'explorer-time-base'},
        'profiles': profiles}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'readiness.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    report = {'model_candidates': sum(p['status'] == 'model_candidate' for p in profiles.values()),
        'verified_ranking_profiles': 0,
        'blocker_counts': dict(collections.Counter(r for p in profiles.values() for r in p['blockers'])),
        'examples': {pid: profiles[pid] for pid in ['weapon:2000000:1h-r1', 'weapon:1000000:1h-r1',
                                                    'weapon:9000000:1h-r1', 'weapon:2000000:2h-r1']}}
    (args.output_dir / 'readiness-summary.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'examples'}))


if __name__ == '__main__':
    main()
