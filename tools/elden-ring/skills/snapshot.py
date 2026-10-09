#!/usr/bin/env python3
"""Pack generated files for Git; restore only after all content hashes pass."""
import argparse
import base64
import hashlib
import io
import json
import zipfile
from pathlib import Path

from common import encode, read, sha256

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / 'data/elden-ring-skills/all'
CHUNK_BYTES = 96000


def pack(data, target):
    index = read(data / 'index.json')
    names = sorted([*index['files'], 'index.json'])
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in names:
            raw = (data / name).read_bytes()
            if name != 'index.json' and hashlib.sha256(raw).hexdigest() != index['files'][name]['sha256']:
                raise ValueError(f'generated file changed: {name}')
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw, compresslevel=9)
    raw = buffer.getvalue()
    encoded = base64.b64encode(raw)
    target.mkdir(parents=True, exist_ok=True)
    parts = []
    for number, offset in enumerate(range(0, len(encoded), CHUNK_BYTES)):
        name = f'part-{number:03d}.b64'
        content = encoded[offset:offset + CHUNK_BYTES] + b'\n'
        (target / name).write_bytes(content)
        parts.append({'file': name, 'bytes': len(content), 'sha256': sha256(target / name)})
    manifest = {'schema_version': 1, 'encoding': 'zip-base64-chunks',
                'archive_sha256': hashlib.sha256(raw).hexdigest(), 'archive_bytes': len(raw),
                'index_sha256': sha256(data / 'index.json'), 'files': names, 'parts': parts}
    (target / 'manifest.json').write_bytes(encode(manifest) + b'\n')
    return manifest


def safe_name(name):
    return Path(name).name == name and name not in {'.', '..'} and '/' not in name and '\\' not in name


def unpack(source, target):
    manifest = read(source / 'manifest.json')
    if manifest['schema_version'] != 1 or manifest['encoding'] != 'zip-base64-chunks':
        raise ValueError('unsupported snapshot format')
    chunks = []
    for part in manifest['parts']:
        if not safe_name(part['file']):
            raise ValueError('invalid part path')
        path = source / part['file']
        raw = path.read_bytes()
        if len(raw) != part['bytes'] or sha256(path) != part['sha256']:
            raise ValueError(f"snapshot part changed: {part['file']}")
        chunks.append(raw.strip())
    raw = base64.b64decode(b''.join(chunks), validate=True)
    if len(raw) != manifest['archive_bytes'] or hashlib.sha256(raw).hexdigest() != manifest['archive_sha256']:
        raise ValueError('snapshot archive changed')
    files = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        names = archive.namelist()
        if sorted(names) != manifest['files'] or len(set(names)) != len(names) or not all(safe_name(n) for n in names):
            raise ValueError('invalid archive file list')
        index_raw = archive.read('index.json')
        if hashlib.sha256(index_raw).hexdigest() != manifest['index_sha256']:
            raise ValueError('snapshot index changed')
        index = json.loads(index_raw)
        if set(names) != set(index['files']) | {'index.json'}:
            raise ValueError('snapshot index file list changed')
        for name in names:
            content = archive.read(name)
            if name != 'index.json':
                expected = index['files'][name]
                if len(content) != expected['bytes'] or hashlib.sha256(content).hexdigest() != expected['sha256']:
                    raise ValueError(f'snapshot file changed: {name}')
            files[name] = content
    # Validate existing destinations before writing any file; a different snapshot needs another directory.
    for name, content in files.items():
        path = target / name
        if path.exists() and path.read_bytes() != content:
            raise ValueError(f'destination has different data: {name}')
    target.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (target / name).write_bytes(content)
    return len(files)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['pack', 'unpack'])
    parser.add_argument('--data', type=Path, default=DATA)
    parser.add_argument('--packed', type=Path, default=DATA / 'packed')
    args = parser.parse_args()
    if args.operation == 'pack':
        manifest = pack(args.data, args.packed)
        print(f"packed {len(manifest['files'])} files into {len(manifest['parts'])} chunks")
    else:
        print(f'restored {unpack(args.packed, args.data)} files')


if __name__ == '__main__':
    main()
