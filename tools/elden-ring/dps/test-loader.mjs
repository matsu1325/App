import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import { decodeDpsPayload, inspectDpsProfile } from './load.mjs';
globalThis.crypto ??= webcrypto;
const payload = JSON.parse(await readFile(new URL('../../../data/elden-ring-dps/payload.json', import.meta.url), 'utf8'));
const data = await decodeDpsPayload(payload);
assert.equal(Object.keys(data.profiles).length, 1189);
const longsword = inspectDpsProfile(data, 'weapon:2000000', '1h-r1');
assert.equal(longsword.entity.name_en, 'Longsword');
assert.deepEqual(longsword.bindings[0].matching_attacks.map(a => a.key), ['100200000:768']);
assert.equal(inspectDpsProfile(data, 'weapon:does-not-exist', '1h-r1'), null);
await assert.rejects(decodeDpsPayload({...payload, sha256: '0'.repeat(64)}), /checksum/);
await assert.rejects(decodeDpsPayload({...payload, uncompressed_bytes: 10}), /size/);
await assert.rejects(decodeDpsPayload({...payload, schema_version: 2}), /Unsupported/);
// Even a newly checksummed package must not promote unverified candidates.
data.profiles['weapon:2000000:1h-r1'].ranking_eligible = true;
const raw = Buffer.from(JSON.stringify(data));
await assert.rejects(decodeDpsPayload({...payload, data: gzipSync(raw).toString('base64'),
  uncompressed_bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex')}), /Candidate schema/);
console.log('DPS loader: integrity, size, alternatives, lookup and candidate-only guard passed');
