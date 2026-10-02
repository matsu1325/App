#!/usr/bin/env python3
"""Prepare lossless reference bindings for DPS research, not verified DPS values.

Only the selected event/attack/parameter fields are copied. Source IDs and hashes
remain available. Never infer animation transitions or treat alternatives as hits.
"""
import argparse
import base64
import collections
import gzip
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INPUTS = {
    'animations': 'raw/frame-data/animations.json',
    'attacks': 'raw/frame-data/attacks.json',
    'magic': 'raw/frame-data/Magic.json',
    'bullets': 'raw/frame-data/Bullet.json',
    'weapon_params': 'raw/frame-data/EquipParamWeapon.json',
    'weapons': 'normalized/weapons.json',
    'spells': 'normalized/spells.json',
    'spell_variants': 'normalized/spell-variants.json',
}
DAMAGE_FIELDS = ['physicalDamageMV', 'magicDamageMV', 'fireDamageMV',
    'lightningDamageMV', 'holyDamageMV', 'physicalDamageFlat', 'magicDamageFlat',
    'fireDamageFlat', 'lightningDamageFlat', 'holyDamageFlat', 'physAttribute',
    'physDamageRateFinal', 'magicDamageRateFinal', 'fireDamageRateFinal',
    'lightningDamageRateFinal', 'holyDamageRateFinal', 'statusMV', 'buffMV',
    'staminaCost', 'staminaCostCharged', 'damageLevel', 'poiseDamageMV',
    'poiseDamageFlat', 'saDamageRateFinal', 'atkBehaviorIds', 'shieldChip']
BULLET_FIELDS = ['atkId_Bullet', 'life', 'shootInterval', 'numShoot',
    'dmgHitRecordLifeTime', 'HitBulletID', 'intervalCreateBulletId',
    'spEffectIDForShooter', 'spEffectId0', 'spEffectId1', 'spEffectId2',
    'spEffectId3', 'spEffectId4', 'createLimitGroupId', 'hitSphere',
    'hitRadius', 'hitRadiusMax', 'hitRadiusDmg', 'dist', 'maxVellocity',
    'minVellocity', 'initVellocity', 'homingAngle', 'isPenetrate', 'isHitBothTeam']


def encode_json(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'), allow_nan=False).encode()


def load_sources(source_dir):
    data, provenance = {}, {}
    for key, rel in INPUTS.items():
        raw = (source_dir / rel).read_bytes()
        data[key] = json.loads(raw)
        provenance[key] = {'path': rel, 'sha256': hashlib.sha256(raw).hexdigest(),
                           'bytes': len(raw)}
        if rel.startswith('raw/frame-data/'):
            provenance[key]['url'] = 'https://er-frame-data.nyasu.business/generated/1.17/' + Path(rel).name
    return data, provenance


def select_attacks(candidate_keys, entity_name, attacks):
    """Name is an exact source applicability label, not a fuzzy localized match."""
    matched = [key for key in candidate_keys
               if key in attacks and entity_name in attacks[key].get('weapons', [])]
    missing = [key for key in candidate_keys if key not in attacks]
    if missing:
        resolution = 'missing_reference'
    elif not candidate_keys:
        resolution = 'no_attack_reference'
    elif not matched:
        resolution = 'no_applicable_reference'
    elif len(matched) > 1:
        resolution = 'multiple_applicable_references'
    else:
        resolution = 'unique_applicable_reference'
    # Unique is an applicability result, not a verified hit-count/damage result.
    return {'candidate_attack_keys': list(candidate_keys),
            'matched_attack_keys': matched, 'missing_attack_keys': missing,
            'resolution': resolution,
            'selection_basis': 'exact_source_entity_name_in_attack_weapons'}


def prepare(data, provenance):
    animations, attacks = data['animations'], data['attacks']
    magic = {r['Row ID']: r for r in data['magic']}
    weapon_params = {r['Row ID']: r for r in data['weapon_params']}
    source_bullets = {r['Row ID']: r for r in data['bullets']}
    users = collections.defaultdict(set)
    for aid, a in animations.items():
        for user in a.get('users', []):
            users[(user['type'], user['id'])].add(aid)
    variants = {}
    variant_index = collections.defaultdict(list)
    for v in data['spell_variants']:
        variants[v['id']] = {k: v.get(k) for k in ['spell_id', 'attack_id',
            'name_en', 'fp', 'charged_fp', 'stamina', 'charged_stamina',
            'typed_attack_coefficient', 'only_int', 'only_faith', 'no_scale']}
        variants[v['id']]['source'] = v.get('source_fields', {}).get('_source')
        variant_index[(v['spell_id'], v['attack_id'])].append(v['id'])
    entities, profiles = {}, {}
    used_animations = set()
    referenced_attacks = set()
    for kind, rows in [('weapon', data['weapons']), ('spell', data['spells'])]:
        for row in rows:
            eid = row['id']
            entity = {k: row.get(k) for k in ['game_id', 'name_en', 'name_ja']}
            entity.update(kind=kind, category=row.get('category', row.get('type')),
                          source_id='weapons' if kind == 'weapon' else 'spells')
            if kind == 'weapon':
                entity['dlc'] = row.get('dlc')
                params = weapon_params.get(row['game_id'], {})
                entity['motion_parameters'] = {k: params.get(k) for k in [
                    'wepmotionCategory', 'wepmotionOneHandId', 'wepmotionBothHandId',
                    'spAtkcategory', 'isDualBlade']}
                actions = ['1h-r1', '2h-r1']
            else:
                params = magic.get(row['game_id'], {})
                entity['cast_parameters'] = {k: params.get(k) for k in [
                    'refType', 'mp', 'mp_charge', 'stamina', 'stamina_charge',
                    'analogDexterityMin', 'analogDexterityMax', 'overDexterity',
                    'consumeLoopMP_forMenu', 'replaceMagicId', 'ezStateBehaviorType']}
                entity['magic_references'] = [{'slot': n, 'ref_id': params.get(f'refId{n}'),
                    'category': params.get(f'refCategory{n}'), 'consume_type': params.get(f'consumeType{n}')}
                    for n in range(1, 11) if params.get(f'refId{n}', -1) != -1]
                actions = ['ground-cast']
            entities[eid] = entity
            possible = users[('Weapon' if kind == 'weapon' else 'Magic', row['game_id'])]
            for action in actions:
                if kind == 'weapon':
                    hand = action[:2]
                    chosen = [aid for aid in possible if re.fullmatch(hand + r' R1 \d+', animations[aid]['name'])]
                else:
                    chosen = [aid for aid in possible if 'Mounted' not in animations[aid].get('labels', [])
                              and not animations[aid]['name'].startswith('Mounted')]
                chosen.sort()  # Stable order only, not the combo sequence.
                bindings, blockers = [], {'time_unit_unverified', 'transitions_unverified',
                    'hit_count_unverified', 'cycle_unverified', 'in_game_validation_missing',
                    'game_version_diff_unverified'}
                if not chosen:
                    blockers.add('no_named_animation_candidates')
                for aid in chosen:
                    a = animations[aid]
                    if a.get('events', {}).get('gradients'):
                        blockers.add('speed_gradient_requires_evaluation')
                    if not a.get('events', {}).get('activeFrames'):
                        blockers.add('animation_without_active_window')
                    for i, event in enumerate(a.get('events', {}).get('activeFrames', [])):
                        keys = event.get('params', {}).get('AtkParamID', [])
                        selected = select_attacks(keys, row['name_en'], attacks)
                        referenced_attacks.update(keys)
                        binding = {'animation_id': aid, 'window_index': i, **selected}
                        if selected['resolution'] != 'unique_applicable_reference':
                            blockers.add(selected['resolution'])
                        if kind == 'spell':
                            binding['coefficient_variant_ids'] = {key: variant_index.get(
                                (eid, attacks[key].get('refs', {}).get('atkParamId')), [])
                                for key in selected['matched_attack_keys']}
                            if any(len(v) != 1 for v in binding['coefficient_variant_ids'].values()):
                                blockers.add('spell_coefficient_requires_selection')
                        bindings.append(binding)
                if kind == 'spell':
                    blockers.add('casting_speed_and_cast_stage_unverified')
                used_animations.update(chosen)
                pid = eid + ':' + action
                profiles[pid] = {'entity_id': eid, 'action': action,
                    'animation_ids': chosen, 'window_bindings': bindings,
                    'transition_edges': [], 'cycle_seconds': None,
                    'ranking_eligible': False,
                    'validation': {'status': 'unverified', 'blockers': sorted(blockers), 'evidence': []}}
    normalized_animations = {}
    for aid in sorted(used_animations):
        a = animations[aid]
        events = a.get('events', {})
        normalized_animations[aid] = {'name': a['name'], 'version': a.get('version'),
            'labels': a.get('labels', []), 'source_id': 'animations',
            'source_key': a.get('sourceKey'), 'source_hash': a.get('hash'),
            'section': a.get('section'), 'motion_category': a.get('motionCategory'),
            'active_windows': [{'index': i, 'type': e.get('type'),
                'range_source_frames': e.get('range'), 'source_params': e.get('params', {})}
                for i, e in enumerate(events.get('activeFrames', []))],
            'cancel_windows': [{'type': c.get('type'), 'ranges_source_frames': c.get('range')}
                for c in events.get('cancels', [])],
            'cancel_from_types': a.get('cancelFrom', []),
            'speed_gradients': events.get('gradients', []),
            'blend_ranges_source_frames': events.get('blend', []),
            'effect_windows': events.get('spEffects', [])}
    attack_catalog = {key: {'source_id': 'attacks', 'refs': attacks[key].get('refs', {}),
        'applicable_source_names': attacks[key].get('weapons', []),
        'source_fields': {field: attacks[key].get(field) for field in DAMAGE_FIELDS},
        'bullet_data': attacks[key].get('bulletData', {})}
        for key in sorted(referenced_attacks) if key in attacks}
    # Graph nodes are potential bullet effects. Neither root nor child count is a hit count.
    roots = {a['refs'].get('bulletId') for a in attack_catalog.values()}
    todo = collections.deque(sorted(x for x in roots if isinstance(x, int) and x > 0))
    bullets, missing_bullets = {}, set()
    while todo:
        bid = todo.popleft()
        if str(bid) in bullets or bid in missing_bullets:
            continue
        b = source_bullets.get(bid)
        if b is None:
            missing_bullets.add(bid)
            continue
        children = {f: b[f] for f in ['HitBulletID', 'intervalCreateBulletId'] if b.get(f, -1) > 0}
        bullets[str(bid)] = {'source_id': 'bullets', 'source_fields': {f: b.get(f) for f in BULLET_FIELDS},
                             'child_references': children}
        todo.extend(children.values())
    def bullet_gaps(root_ids):
        pending, seen, missing = list(root_ids), set(), set()
        while pending:
            bid = pending.pop()
            if bid in seen:
                continue
            seen.add(bid)
            if str(bid) not in bullets:
                missing.add(bid)
            else:
                pending.extend(bullets[str(bid)]['child_references'].values())
        return sorted(missing)

    for profile in profiles.values():
        profile_missing = set()
        for binding in profile['window_bindings']:
            root_ids = sorted({attack_catalog[k]['refs'].get('bulletId')
                for k in binding['matched_attack_keys']
                if isinstance(attack_catalog[k]['refs'].get('bulletId'), int)
                and attack_catalog[k]['refs']['bulletId'] > 0})
            binding['bullet_roots'] = root_ids
            binding['missing_bullet_ids'] = bullet_gaps(root_ids)
            profile_missing.update(binding['missing_bullet_ids'])
        if profile_missing:
            profile['validation']['blockers'].append('missing_bullet_reference')
            profile['validation']['blockers'].sort()
    package = {'schema_version': 1, 'status': 'implementation-candidates-unverified',
        'game_version': '1.17 source snapshot; 1.17.1 full diff unverified',
        'time_base': {'unit': 'source_frame', 'seconds_per_unit': None, 'verified': False},
        'sources': provenance, 'entities': entities, 'profiles': profiles,
        'animations': normalized_animations, 'attacks': attack_catalog,
        'spell_coefficients': variants, 'bullets': bullets,
        'missing_references': {'attacks': sorted(referenced_attacks - attacks.keys()),
                               'bullets': sorted(missing_bullets)}}
    return package


def coverage(package):
    profiles = package['profiles']
    bindings = [b for p in profiles.values() for b in p['window_bindings']]
    return {'schema_version': 1, 'status': package['status'],
        'counts': {k: len(package[k]) for k in ['entities', 'profiles', 'animations', 'attacks', 'spell_coefficients', 'bullets']},
        'profiles_with_animations': sum(bool(p['animation_ids']) for p in profiles.values()),
        'profiles_without_animations': [k for k, p in profiles.items() if not p['animation_ids']],
        'binding_resolution_counts': dict(sorted(collections.Counter(b['resolution'] for b in bindings).items())),
        'profile_blocker_counts': dict(sorted(collections.Counter(x for p in profiles.values() for x in p['validation']['blockers']).items())),
        'ranking_eligible_profiles': sum(p['ranking_eligible'] for p in profiles.values()),
        'missing_references': package['missing_references']}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/elden-ring-dps')
    parser.add_argument('--expanded', type=Path, help='Optional uncompressed JSON for local inspection')
    args = parser.parse_args()
    package = prepare(*load_sources(args.source_dir))
    raw = encode_json(package)
    payload = {'schema_version': 1, 'encoding': 'gzip+base64',
               'sha256': hashlib.sha256(raw).hexdigest(), 'uncompressed_bytes': len(raw),
               'data': base64.b64encode(gzip.compress(raw, mtime=0)).decode()}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / 'payload.json').write_bytes(encode_json(payload) + b'\n')
    report = coverage(package)
    (args.output_dir / 'coverage.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    if args.expanded:
        args.expanded.write_bytes(raw + b'\n')
    print(json.dumps({'counts': report['counts'], 'binding_resolution_counts': report['binding_resolution_counts'],
        'uncompressed_bytes': len(raw), 'payload_bytes': (args.output_dir / 'payload.json').stat().st_size,
        'ranking_eligible_profiles': report['ranking_eligible_profiles']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
