/** Browser/Node reader. Requires DecompressionStream and Web Crypto. No network. */
export async function decodeDpsPayload(payload) {
  if (payload?.schema_version !== 1 || payload.encoding !== 'gzip+base64'
      || !/^[a-f0-9]{64}$/.test(payload.sha256) || typeof payload.data !== 'string'
      || !Number.isSafeInteger(payload.uncompressed_bytes)
      || payload.uncompressed_bytes < 1 || payload.uncompressed_bytes > 32 * 1024 * 1024) {
    throw new Error('Unsupported or invalid DPS payload');
  }
  const compressed = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    size += value.length;
    if (size > payload.uncompressed_bytes) {
      await reader.cancel();
      throw new Error('DPS decompressed size exceeds declaration');
    }
    chunks.push(value);
  }
  if (size !== payload.uncompressed_bytes) throw new Error('DPS size mismatch');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
  if (hash !== payload.sha256) throw new Error('DPS checksum mismatch');
  const data = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
  if (data.schema_version !== 1 || data.status !== 'implementation-candidates-unverified'
      || data.time_base?.verified !== false || data.time_base.seconds_per_unit !== null) {
    throw new Error('Unsupported DPS dataset status');
  }
  for (const table of ['sources', 'entities', 'profiles', 'animations', 'attacks', 'spell_coefficients', 'bullets']) {
    if (!data[table] || typeof data[table] !== 'object' || Array.isArray(data[table])) {
      throw new Error(`Missing DPS table: ${table}`);
    }
  }
  for (const profile of Object.values(data.profiles)) {
    if (profile.ranking_eligible !== false || profile.cycle_seconds !== null
        || profile.validation?.status !== 'unverified'
        || !Array.isArray(profile.transition_edges) || profile.transition_edges.length) {
      throw new Error('Candidate schema cannot contain verified DPS values');
    }
  }
  return data;
}

/** Inspection only. Returns all stage candidates; never sums attack references. */
export function inspectDpsProfile(data, entityId, action) {
  const key = `${entityId}:${action}`;
  if (!Object.hasOwn(data.profiles, key)) return null;
  const profile = data.profiles[key];
  return {
    entity: data.entities[profile.entity_id],
    profile,
    animations: profile.animation_ids.map(id => ({id, ...data.animations[id]})),
    bindings: profile.window_bindings.map(binding => ({
      ...binding,
      matching_attacks: binding.matched_attack_keys.map(key => ({key, ...data.attacks[key]})),
    })),
  };
}
