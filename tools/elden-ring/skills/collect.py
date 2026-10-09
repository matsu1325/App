#!/usr/bin/env python3
"""Restore source snapshots outside the repo. Never overwrite a differing pinned file."""
import argparse
import base64
import concurrent.futures
import datetime
import gzip
import hashlib
import json
from pathlib import Path
import urllib.request

from common import read, sha256

ROOT = Path(__file__).resolve().parents[3]
REFERENCE_IDS = {'motion-values', 'ash-compatibility', 'misc-effects', 'build-planner', 'scaling-data'}
HKS = {
    'id': 'hks:c0000.hks', 'file': 'c0000.hks',
    'url': 'https://raw.githubusercontent.com/soulsmods/EldenRingHKS/d88d6441f5fccfdd6a5fd10d493309b680181897/c0000.hks',
    'sha256': '97fac87ec418656e069f26b08e0804b7cb1e3c99772ec55524ae8bbda03ad530',
    'version': 'header declares HKS last updated in 1.15.1; fixed community commit',
    'license': 'See upstream; community edits',
}
SUPPLEMENTS = [
    dict(id='supplement:ReinforceParamWeapon.json', file='ReinforceParamWeapon.json', version='1.17',
         url='https://er-frame-data.nyasu.business/generated/1.17/ReinforceParamWeapon.json'),
    dict(id='supplement:explorer.js', file='explorer.js', version='1.17 display implementation',
         url='https://er-frame-data.nyasu.business/assets/index-D-GRXV7h.js'),
    dict(id='skill-damage-explanation', file='skill-damage-explanation.txt',
         version='historical guidance mentions App Ver. 1.04.1; not a 1.17 verification',
         url='https://docs.google.com/document/d/17og1zLnCfdL9TFvTnI4A9Nf9EwkBbutishHPTGBDAE8/export?format=txt'),
    dict(id='research:hks-commit.json', file='hks-commit.json', version='commit message declares 1.17',
         url='https://api.github.com/repos/soulsmods/EldenRingHKS/commits/d88d6441f5fccfdd6a5fd10d493309b680181897'),
    dict(id='research:tae-repository-commit.json', file='tae-repository-commit.json', version='1.14; rejected as 1.17 source',
         url='https://api.github.com/repos/EldenRingDatabase/er-animation-data-diff/commits/d26d510738cde477eb27275d803f68b4f2c7b997'),
]


def acquire(root, source, locked=None):
    source = dict(source)
    path = root / source['file']
    if path.exists() and locked:
        if sha256(path) != locked['actual_sha256']:
            raise ValueError(f"local source changed: {path.name}")
        return locked
    data = urllib.request.urlopen(source['url'], timeout=60).read()
    digest = hashlib.sha256(data).hexdigest()
    # New reference exports may differ from the old baseline; record them distinctly.
    if source['id'].startswith(('frame:', 'hks:')) and digest != source['sha256']:
        raise ValueError(f"upstream baseline changed: {source['id']}")
    if source['file'].endswith('.json'):
        json.loads(data)
    if source['file'].endswith('.xlsx') and not data.startswith(b'PK'):
        raise ValueError(f"not an XLSX export: {source['id']}")
    if locked and digest != locked['actual_sha256']:
        raise ValueError(f"upstream snapshot changed: {source['id']}; acquire as a new snapshot")
    path.write_bytes(data)
    source.update(actual_sha256=digest, bytes=len(data),
                  retrieved_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  hash_matches=digest == source.get('sha256'),
                  license=source.get('license', 'Public reference; reuse terms not established'))
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', type=Path, required=True)
    parser.add_argument('--lock', type=Path, help='Combined source manifest for exact restoration')
    args = parser.parse_args()
    args.dest.mkdir(parents=True, exist_ok=True)
    payload = read(ROOT / 'data/elden-ring-payload.json')
    payload = json.loads(gzip.decompress(base64.b64decode(payload['data'])))
    sources = []
    for source in payload['sources']:
        if source['id'].startswith('frame:'):
            sources.append(dict(source, file=source['id'].split(':', 1)[1]))
        elif source['id'] in REFERENCE_IDS:
            sources.append(dict(source, file=source['id'] + '.xlsx'))
    sources.extend([HKS, *SUPPLEMENTS])
    existing = []
    if args.lock:
        existing = read(args.lock)
    else:
        for name in ['source-manifest', 'reference-manifest', 'supplemental-manifest']:
            path = args.dest / (name + '.json')
            if path.exists():
                existing.extend(read(path))
    lock = {x['file']: x for x in existing}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        acquired = list(executor.map(lambda s: acquire(args.dest, s, lock.get(s['file'])), sources))
    # Three manifests retain compatibility with the pilot's offline extraction command.
    groups = {'source-manifest': [s for s in acquired if s['id'].startswith(('frame:', 'hks:'))],
              'reference-manifest': [s for s in acquired if s['file'] in {'motion-values.xlsx', 'ash-compatibility.xlsx'}],
              'supplemental-manifest': [s for s in acquired if
                                        not s['id'].startswith(('frame:', 'hks:')) and
                                        s['file'] not in {'motion-values.xlsx', 'ash-compatibility.xlsx'}]}
    for name, data in groups.items():
        (args.dest / (name + '.json')).write_text(json.dumps(data, indent=2) + '\n')
    print(json.dumps({'acquired': len(acquired), 'historical_hash_drift':
                      [s['id'] for s in acquired if s.get('sha256') and not s.get('hash_matches')]}, indent=2))


if __name__ == '__main__':
    main()
