#!/usr/bin/env python3
"""Validate schema-v1 invariants and every cross-reference in prepared data."""
import argparse
import base64
import gzip
import hashlib
import json
from pathlib import Path
from prepare import select_attacks


def load_payload(path):
    payload = json.loads(path.read_text())
    assert payload['schema_version'] == 1 and payload['encoding'] == 'gzip+base64'
    raw = gzip.decompress(base64.b64decode(payload['data'], validate=True))
    assert len(raw) == payload['uncompressed_bytes']
    assert hashlib.sha256(raw).hexdigest() == payload['sha256']
    return json.loads(raw)


def validate(data):
    assert data['schema_version'] == 1
    assert data['status'] == 'implementation-candidates-unverified'
    assert data['time_base'] == {'unit': 'source_frame', 'seconds_per_unit': None, 'verified': False}
    simplified = {k: {'weapons': a['applicable_source_names']} for k, a in data['attacks'].items()}
    missing_attacks, missing_bullets = set(), set()
    for pid, profile in data['profiles'].items():
        entity = data['entities'][profile['entity_id']]
        assert pid == profile['entity_id'] + ':' + profile['action']
        assert profile['cycle_seconds'] is None and profile['ranking_eligible'] is False
        assert profile['transition_edges'] == []
        assert profile['validation']['status'] == 'unverified'
        assert profile['validation']['evidence'] == []
        assert 'cycle_unverified' in profile['validation']['blockers']
        expected = {(aid, i) for aid in profile['animation_ids']
                    for i in range(len(data['animations'][aid]['active_windows']))}
        actual = [(b['animation_id'], b['window_index']) for b in profile['window_bindings']]
        assert len(actual) == len(set(actual)) and set(actual) == expected
        for binding in profile['window_bindings']:
            window = data['animations'][binding['animation_id']]['active_windows'][binding['window_index']]
            keys = window['source_params'].get('AtkParamID', [])
            assert keys == binding['candidate_attack_keys']
            selection = select_attacks(keys, entity['name_en'], simplified)
            for key, value in selection.items():
                assert binding[key] == value, (pid, key)
            missing_attacks.update(binding['missing_attack_keys'])
            for attack_key, variants in binding.get('coefficient_variant_ids', {}).items():
                assert attack_key in binding['matched_attack_keys']
                for variant_id in variants:
                    v = data['spell_coefficients'][variant_id]
                    assert v['spell_id'] == profile['entity_id']
                    assert v['attack_id'] == data['attacks'][attack_key]['refs']['atkParamId']
            expected_roots = sorted({data['attacks'][key]['refs']['bulletId']
                for key in binding['matched_attack_keys']
                if isinstance(data['attacks'][key]['refs'].get('bulletId'), int)
                and data['attacks'][key]['refs']['bulletId'] > 0})
            assert binding['bullet_roots'] == expected_roots
            pending, visited, absent = list(expected_roots), set(), set()
            while pending:
                bid = pending.pop()
                if bid in visited:
                    continue
                visited.add(bid)
                if str(bid) not in data['bullets']:
                    absent.add(bid)
                else:
                    pending.extend(data['bullets'][str(bid)]['child_references'].values())
            assert binding['missing_bullet_ids'] == sorted(absent)
            if absent:
                assert 'missing_bullet_reference' in profile['validation']['blockers']
    for aid, a in data['animations'].items():
        for i, window in enumerate(a['active_windows']):
            assert window['index'] == i
            r = window['range_source_frames']
            assert len(r) == 2 and all(isinstance(n, (int, float)) for n in r) and r[0] <= r[1], aid
    for a in data['attacks'].values():
        bid = a['refs'].get('bulletId')
        if isinstance(bid, int) and bid > 0 and str(bid) not in data['bullets']:
            missing_bullets.add(bid)
    for b in data['bullets'].values():
        missing_bullets.update(bid for bid in b['child_references'].values() if str(bid) not in data['bullets'])
    assert sorted(missing_attacks) == data['missing_references']['attacks']
    assert sorted(missing_bullets) == data['missing_references']['bullets']
    for v in data['spell_coefficients'].values():
        assert v['spell_id'] in data['entities']
    return {'profiles_checked': len(data['profiles']), 'animations_checked': len(data['animations']),
            'ranking_eligible': 0, 'missing_references_explicit': data['missing_references']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('payload', type=Path)
    print(json.dumps(validate(load_payload(parser.parse_args().payload))))
