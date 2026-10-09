"""Publication must round-trip exactly and reject altered parts before writing."""
import tempfile
import unittest
from pathlib import Path

from common import encode, sha256
from snapshot import pack, unpack


class SnapshotTest(unittest.TestCase):
    def fixture(self, root):
        data = root / 'source'
        data.mkdir()
        (data / 'skill.json').write_bytes(encode({'name': '居合', 'damage': None, 'fp': 0}) + b'\n')
        index = {'schema_version': 2, 'files': {'skill.json': {'sha256': sha256(data / 'skill.json'),
                                                           'bytes': (data / 'skill.json').stat().st_size}}}
        (data / 'index.json').write_bytes(encode(index) + b'\n')
        packed = root / 'packed'
        manifest = pack(data, packed)
        return data, packed, manifest

    def test_exact_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data, packed, _ = self.fixture(root)
            target = root / 'restored'
            self.assertEqual(unpack(packed, target), 2)
            for path in data.iterdir():
                self.assertEqual(path.read_bytes(), (target / path.name).read_bytes())

    def test_tampered_part_writes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, packed, manifest = self.fixture(root)
            (packed / manifest['parts'][0]['file']).write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'part changed'):
                unpack(packed, root / 'target')
            self.assertFalse((root / 'target').exists())

    def test_existing_different_data_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, packed, _ = self.fixture(root)
            target = root / 'target'
            target.mkdir()
            (target / 'skill.json').write_bytes(b'local changes')
            with self.assertRaisesRegex(ValueError, 'different data'):
                unpack(packed, target)
            self.assertEqual((target / 'skill.json').read_bytes(), b'local changes')
            self.assertFalse((target / 'index.json').exists())


if __name__ == '__main__':
    unittest.main()
