/** Source-display timing helpers. These are not an in-game validation certificate. */
const finite = value => typeof value === 'number' && Number.isFinite(value);
export function sourceFramesToSeconds(frames) {
  if (!finite(frames) || frames < 0) throw new Error('Invalid source frame count');
  return frames / 30;
}

/** Reproduces Explorer's clamped vDex boundary interpolation, quantized at half a source frame. */
export function castingBoundarySourceFrame(range, virtualDexterity) {
  if (!Array.isArray(range) || range.length !== 2 || !range.every(finite)
      || range[0] < 0 || range[0] > range[1] || !finite(virtualDexterity)) {
    throw new Error('Invalid casting boundary');
  }
  const dex = Math.min(70, Math.max(10, virtualDexterity));
  const fast = range[0] * 2, slow = range[1] * 2;
  return Math.ceil(slow - (dex - 10) * (slow - fast) / 60) / 2;
}

/** Preview math only. Damage must already be resolved per actual hit, after defense if desired. */
export function previewCycleDps({cycleSeconds, hits}) {
  if (!finite(cycleSeconds) || cycleSeconds <= 0 || !Array.isArray(hits) || !hits.length) {
    throw new Error('Invalid cycle');
  }
  const seen = new Set();
  let damage = 0;
  for (const hit of hits) {
    if (typeof hit.id !== 'string' || !hit.id || seen.has(hit.id)
        || !finite(hit.timeSeconds) || hit.timeSeconds < 0 || hit.timeSeconds >= cycleSeconds
        || !finite(hit.damage) || hit.damage < 0) throw new Error('Invalid or duplicate hit');
    seen.add(hit.id);
    damage += hit.damage;
  }
  return {cycleDamage: damage, cycleSeconds, dps: damage / cycleSeconds,
    rankingEligible: false, verification: 'model-only'};
}

/** Compare numeric scores with null always last, in either direction, then stable ID. */
export function compareDpsRows(a, b, direction = 'desc') {
  if (!['asc', 'desc'].includes(direction)) throw new Error('Invalid sort direction');
  const av = finite(a.dps) && a.dps >= 0, bv = finite(b.dps) && b.dps >= 0;
  if (av !== bv) return av ? -1 : 1;
  if (av && a.dps !== b.dps) return direction === 'asc' ? a.dps - b.dps : b.dps - a.dps;
  return String(a.id).localeCompare(String(b.id), 'en');
}
