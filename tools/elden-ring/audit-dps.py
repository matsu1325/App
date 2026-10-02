#!/usr/bin/env python3
"""Audit source coverage; intentionally does not infer attack cycles or DPS."""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path


def audit(root):
    paths = ['raw/frame-data/animations.json', 'raw/frame-data/attacks.json',
             'raw/frame-data/armaments.json', 'normalized/weapons.json',
             'normalized/spells.json']
    sources = {}
    data = {}
    for path in paths:
        raw = (root / path).read_bytes()
        data[path] = json.loads(raw)
        sources[path] = {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}
    animations, attacks, armaments, weapons, spells = [data[p] for p in paths]
    by_user = collections.defaultdict(list)
    for key, animation in animations.items():
        for user in animation.get('users', []):
            by_user[(user['type'], user['id'])].append((key, animation))

    modes = {}
    for mode in ['1h', '2h']:
        rows = []
        groups = set()
        for weapon in weapons:
            selected = [(k, a) for k, a in by_user[('Weapon', weapon['game_id'])]
                        if re.fullmatch(mode + r' R1 \d+', a['name'])]
            if not selected:
                continue
            groups.add(tuple(sorted(k for k, _ in selected)))
            rows.append({'weapon': weapon['name_en'], 'category': weapon['category'],
                         'dlc': weapon['dlc'], 'animations': len(selected),
                         'all_have_active_windows': all(a.get('events', {}).get('activeFrames') for _, a in selected),
                         'all_have_attack_cancel': all(any(c.get('type') in ['RightAttack', 'LightAttackOnly']
                             for c in a.get('events', {}).get('cancels', [])) for _, a in selected)})
        modes[mode] = {'weapons_with_named_r1_candidates': len(rows),
                       'dlc_flagged': sum(r['dlc'] for r in rows),
                       'unique_animation_sets': len(groups),
                       'with_active_and_cancel_on_every_candidate': sum(bool(r['all_have_active_windows'] and r['all_have_attack_cancel']) for r in rows),
                       'categories': dict(sorted(collections.Counter(r['category'] for r in rows).items())),
                       'without_named_r1': [w['name_en'] for w in weapons if w['name_en'] not in {r['weapon'] for r in rows}]}
    spell_rows = []
    for spell in spells:
        selected = [(k, a) for k, a in by_user[('Magic', spell['game_id'])]
                    if 'Mounted' not in a.get('labels', []) and not a['name'].startswith('Mounted')]
        spell_rows.append({'name': spell['name_en'], 'mapped': bool(selected),
                           'has_cast_window': any(e.get('type') == 'Cast' for _, a in selected for e in a.get('events', {}).get('activeFrames', [])),
                           'has_magic_cancel': any(c.get('type') == 'Magic' for _, a in selected for c in a.get('events', {}).get('cancels', []))})
    r1 = {k: a for k, a in animations.items() if re.fullmatch(r'[12]h R1 \d+', a['name']) and any(u['type'] == 'Weapon' for u in a.get('users', []))}
    refs = {ref for a in r1.values() for e in a.get('events', {}).get('activeFrames', [])
            for ref in e.get('params', {}).get('AtkParamID', [])}
    examples = {}
    for key in ['a023_030000', 'a401_045000', 'a401_045010', 'a401_045020', 'a401_045030']:
        a = animations[key]
        examples[key] = {'name': a['name'], 'active_windows': a.get('events', {}).get('activeFrames', []),
                         'attack_cancels': [c for c in a.get('events', {}).get('cancels', []) if c['type'] in ['RightAttack', 'LightAttackOnly', 'Magic', 'DexterityCastingSpeed']],
                         'cancel_from': a.get('cancelFrom', []),
                         'cycle_seconds': None, 'ranking_eligible': False}
    return {'schema_version': 1, 'status': 'source-coverage-only',
            'note': 'Candidate coverage is NOT verified DPS coverage. Timing units, transitions, hit selection, version and in-game cycles require validation.',
            'sources': sources, 'counts': {'animations': len(animations), 'attack_records': len(attacks),
                'frame_armaments': len(armaments), 'app_weapons': len(weapons), 'app_spells': len(spells)},
            'animation_versions': dict(collections.Counter(a.get('version', 'unknown') for a in animations.values())),
            'weapon_candidates': modes,
            'r1_reference_audit': {'animation_count': len(r1), 'distinct_attack_keys': len(refs),
                'missing_attack_keys': sorted(refs - attacks.keys()),
                'multi_reference_windows': sum(len(e.get('params', {}).get('AtkParamID', [])) > 1 for a in r1.values() for e in a.get('events', {}).get('activeFrames', [])),
                'animations_with_speed_gradients': sum(bool(a.get('events', {}).get('gradients')) for a in r1.values())},
            'spell_candidates': {'mapped_ground_animations': sum(r['mapped'] for r in spell_rows),
                'with_cast_and_magic_cancel': sum(r['has_cast_window'] and r['has_magic_cancel'] for r in spell_rows),
                'without_ground_mapping': [r['name'] for r in spell_rows if not r['mapped']]},
            'verified_dps_profiles': 0, 'examples': examples}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(audit(args.source_dir), ensure_ascii=False, indent=2) + '\n')
