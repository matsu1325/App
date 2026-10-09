#!/usr/bin/env python3
"""Offline, fail-closed audit of the four-skill pilot. Raw sources stay outside git."""
import argparse
import base64
import collections
import gzip
import hashlib
import itertools
import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[3]
TARGETS = {100: "Lion's Claw", 101: 'Impaling Thrust', 114: 'Unsheathe', 115: 'Square Off'}
TYPES = {'physical': 'Phys', 'magic': 'Mag', 'fire': 'Fire', 'lightning': 'Thun', 'holy': 'Dark'}
ROUTES = [(100, 'L2', 'a600_040000', 'Longsword'),
          (101, 'L2', 'a601_040000', 'Longsword'),
          (114, 'R1', 'a614_040060', 'Uchigatana'),
          (114, 'R2', 'a614_040070', 'Uchigatana'),
          (115, 'R1', 'a615_040060', 'Longsword'),
          (115, 'R2', 'a615_040070', 'Longsword')]


def read(path):
    return json.loads(Path(path).read_text())


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def require(value, message):
    if not value:
        raise ValueError(message)


def select_candidate(refs, attacks, weapon):
    """A window's weapon alternatives are never summed as separate hits."""
    candidates = [ref for ref in refs if weapon in attacks[ref]['weapons']]
    require(len(candidates) == 1, f'{weapon}: expected one candidate, got {candidates}')
    return candidates[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--out', type=Path, default=ROOT / 'data/elden-ring-skills')
    args = parser.parse_args()
    manifest = read(args.sources / 'source-manifest.json') + read(args.sources / 'reference-manifest.json')
    for source in manifest:
        require('error' not in source, f"unavailable: {source['id']}")
        require(digest(args.sources / source['file']) == source['actual_sha256'], f"changed: {source['file']}")
        if source['id'].startswith(('frame:', 'hks:')):
            require(source['actual_sha256'] == source['sha256'], f"baseline drift: {source['file']}")
    raw = {name: read(args.sources / (name + '.json')) for name in
           ['SwordArtsParam', 'BehaviorParam_PC', 'AtkParam_Pc', 'FinalDamageRateParam', 'animations', 'attacks']}
    params = {name: {row['Row ID']: row for row in raw[name]} for name in
              ['SwordArtsParam', 'BehaviorParam_PC', 'AtkParam_Pc', 'FinalDamageRateParam']}
    wrapper = read(ROOT / 'data/elden-ring-payload.json')
    payload = json.loads(gzip.decompress(base64.b64decode(wrapper['data'])))
    workbook = openpyxl.load_workbook(args.sources / 'motion-values.xlsx', read_only=True, data_only=True)
    sheet = workbook['Ashes of War Attack Data']
    rows = list(sheet.values)
    # Base attack rows only; weapon-specific rows can change stamina/attribute.
    sheet_attacks = {int(row[2]): (i, row) for i, row in enumerate(rows, 1)
                     if row[0] is None and isinstance(row[2], (int, float))}
    compatibility = openpyxl.load_workbook(args.sources / 'ash-compatibility.xlsx', read_only=True, data_only=True)
    compat_rows = list(compatibility['Weapons'].values)
    catalog = []
    for skill_id, row in sorted(params['SwordArtsParam'].items()):
        ashes = [a['id'] for a in payload['ashes'] if a['skill_id'] == skill_id]
        weapons = [w['id'] for w in payload['weapons'] if w.get('default_skill_id') == skill_id]
        names = payload['skills'].get(str(skill_id), {})
        state = 'pilot_source_audited' if skill_id in TARGETS else 'not_started'
        classification = ('no_skill' if row['Row Name'] == 'No Skill' else
                          'player_linked_candidate' if ashes or weapons else 'unclassified')
        catalog.append(dict(skill_id=skill_id, name_en=row['Row Name'], names=names,
                            ash_ids=ashes, default_weapon_ids=weapons, classification=classification,
                            collection_state=state, simulator_ready=False,
                            blocker='formula_and_game_validation_pending' if skill_id in TARGETS else 'not_audited'))
    profiles, normalized_attacks, missing = [], {}, []
    for skill_id, name in TARGETS.items():
        param = params['SwordArtsParam'][skill_id]
        section = f"a{600 + param['swordArtsTypeNew']:03d}"
        animations = []
        for key, anim in sorted(raw['animations'].items()):
            if anim['section'] != section or name not in anim.get('categories', []):
                continue
            require(anim['version'] == '1.17', f'animation version mismatch: {key}')
            windows = []
            for index, event in enumerate(anim.get('events', {}).get('activeFrames', [])):
                refs = event['params'].get('AtkParamID', [])
                if event['type'] == 'Attack' and not refs:
                    missing.append(dict(skill_id=skill_id, animation=key, window=index,
                                        reason='source_has_no_attack_refs_or_weapon_users'))
                for ref in refs:
                    require(ref in raw['attacks'], f'missing attack {ref}')
                    attack = raw['attacks'][ref]
                    attack_id = attack['refs']['atkParamId']
                    ap = params['AtkParam_Pc'][attack_id]
                    # These keys encode a BehaviorParam row followed by a generated variant index.
                    behavior_id = int(ref.split(':')[0])
                    behavior = params['BehaviorParam_PC'][behavior_id]
                    require(behavior['refType'] == 0 and behavior['refId'] == attack_id, f'behavior mismatch {ref}')
                    require(event['params']['BehaviorJudgeID'] == behavior['behaviorJudgeId'] + 3000,
                            f'pilot behavior judge convention changed {ref}')
                    typed_mv = {kind: ap['atk' + suffix + 'Correction'] for kind, suffix in TYPES.items()}
                    typed_flat = {kind: ap['atk' + suffix] for kind, suffix in TYPES.items()}
                    for kind, value in typed_mv.items():
                        require(value == attack[kind + 'DamageMV'], f'generated MV mismatch {ref}/{kind}')
                        require(typed_flat[kind] == attack[kind + 'DamageFlat'], f'flat mismatch {ref}/{kind}')
                    sheet_row, values = sheet_attacks[attack_id]
                    require(list(typed_mv.values()) == list(values[3:8]), f'sheet MV mismatch {ref}')
                    final = params['FinalDamageRateParam'][ap['finalDamageRateId']]
                    normalized_attacks[ref] = dict(
                        attack_ref=ref, atk_param_id=attack_id, behavior_param_id=behavior_id,
                        weapon_candidates=attack['weapons'], typed_mv=typed_mv, typed_flat=typed_flat,
                        physical_type=attack['physAttribute'], status_mv=attack['statusMV'],
                        poise_mv=ap['atkSuperArmorCorrection'],
                        pvp_final_damage_rates={kind: final[suffix.lower() + 'Rate']
                                                for kind, suffix in TYPES.items()},
                        final_damage_rate_id=ap['finalDamageRateId'],
                        pvp_scope_evidence='motion-values.xlsx/Info!C6,L6',
                        disable_both_hands_attack_bonus_raw=ap['isDisableBothHandsAtkBonus'],
                        two_hand_strength_semantics='unverified_do_not_infer_from_flag_name',
                        overwrite_attack_element_correct_id=ap['overwriteAttackElementCorrectId'],
                        effect_ids=attack['refs']['spEffectIds'],
                        stamina_base=behavior['stamina'], stamina_generated=attack['staminaCost'],
                        provenance=dict(animation=key, event=index, attack=ref,
                                        atk_param_row=attack_id, behavior_param_row=behavior_id,
                                        sheet=f'Ashes of War Attack Data!C{sheet_row}:H{sheet_row}'),
                        validation=dict(raw_generated_mv='matched', reference_sheet_mv='matched',
                                        independent_in_game_measurement=False))
                windows.append(dict(source_range=event['range'], event_type=event['type'],
                                    behavior_judge_id=event['params'].get('BehaviorJudgeID'),
                                    alternative_attack_refs=refs, selection='exactly_one_per_weapon_or_block'))
            animations.append(dict(id=key, source_name=anim['name'], users=anim['users'],
                                   active_windows=windows, source_events=anim.get('events', {}),
                                   input_mapping='candidate_from_source_labels_and_HKS_not_full_Havok_graph',
                                   no_fp_label='No FP' in anim['name']))
        profiles.append(dict(skill_id=skill_id, name_en=name, game_version='1.17',
                             hks_arts_type=param['swordArtsTypeNew'], animation_section=section,
                             fp_fields_raw={b: param['useMagicPoint_' + b] for b in ['L1', 'L2', 'R1', 'R2']},
                             fp_semantics='unmodified_parameter_cost; -1 is a sentinel, not negative FP',
                             animations=animations,
                             validation=dict(source_mapping='partial', formula='partial', damage='unmeasured',
                                             timing='unmeasured', simulator_ready=False),
                             blockers=['full_input_selector_graph', 'two_hand_strength_and_requirement_semantics',
                                       'effects_and_rounding', 'in_game_damage', 'cycle_timing']))
    samples, measurement_cases = [], []
    for skill_id, button, animation, weapon in ROUTES:
        events = raw['animations'][animation]['events']['activeFrames']
        require(len(events) == 1, 'representative attack no longer has exactly one window')
        require(weapon in [u['name'] for u in raw['animations'][animation]['users']], 'weapon/animation mismatch')
        ref = select_candidate(events[0]['params']['AtkParamID'], raw['attacks'], weapon)
        attack = normalized_attacks[ref]
        cost = params['SwordArtsParam'][skill_id]['useMagicPoint_' + button]
        require(cost > 0, 'invalid attacking FP cost')
        samples.append(dict(skill_id=skill_id, input=button, weapon=weapon, animation=animation, attack_ref=ref,
                            fp_parameter=cost, assumed_physical_ar=400,
                            mv_only_pre_defense_attack=400 * attack['typed_mv']['physical'] / 100,
                            predicted_hp_damage=None, damage_per_fp=None, dps=None,
                            scope='illustrative_MV_arithmetic_only_not_a_build_or_game_prediction'))
        for affinity, upgrade, stats, hands in itertools.product(
                ['Standard', 'Heavy', 'Magic'], [0, 12, 25], [(16, 16, 10), (40, 40, 40), (80, 80, 80)], [1, 2]):
            matches = [(i, row) for i, row in enumerate(compat_rows, 1)
                       if row[1] == weapon and row[3] == affinity and TARGETS[skill_id] in row[8:]]
            require(len(matches) == 1, f'compatibility not proved: {weapon}/{affinity}/{skill_id}')
            measurement_cases.append(dict(case_id=f'{skill_id}-{button}-{affinity}-{upgrade}-{stats[0]}-{hands}',
                                          skill_id=skill_id, input=button, weapon=weapon, affinity=affinity,
                                          upgrade=upgrade, strength=stats[0], dexterity=stats[1], intelligence=stats[2],
                                          hands=hands, fp_condition='enough',
                                          compatibility_evidence=f'ash-compatibility.xlsx/Weapons!row{matches[0][0]}',
                                          game_version=None, target=None, observed_damage=None, trials=[],
                                          state='awaiting_controlled_game_measurement'))
    audit = dict(schema_version=1, baseline='1.17',
                 counts=dict(source_files=len(manifest), baseline_hash_matches=sum(s.get('hash_matches', False) for s in manifest),
                             catalog=len(catalog), classification=dict(collections.Counter(c['classification'] for c in catalog)),
                             pilot_skills=len(profiles), animations=sum(len(p['animations']) for p in profiles),
                             resolved_attack_variants=len(normalized_attacks), missing_windows=len(missing),
                             representative_actions=len(samples), planned_measurement_cases=len(measurement_cases),
                             measured_cases=0),
                 missing_references=missing,
                 sheet_hash_drift=[s['file'] for s in manifest if not s.get('hash_matches')],
                 simulator_ready=False)
    args.out.mkdir(parents=True, exist_ok=True)
    outputs = {'source-manifest': manifest, 'catalog': catalog, 'pilot': profiles,
               'attack-variants': normalized_attacks, 'samples': samples,
               'measurement-cases': measurement_cases, 'audit': audit}
    for name, data in outputs.items():
        (args.out / (name + '.json')).write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
    print(json.dumps(audit, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
