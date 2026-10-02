/** Schema v1: candidate data, never a verified attack cycle. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type SourceRange = [number, number];
export interface Source { path: string; sha256: string; bytes: number; url?: string }
export type Resolution = 'unique_applicable_reference' | 'multiple_applicable_references'
  | 'missing_reference' | 'no_applicable_reference' | 'no_attack_reference';
export interface Binding {
  animation_id: string;
  window_index: number;
  candidate_attack_keys: string[];
  matched_attack_keys: string[];
  missing_attack_keys: string[];
  resolution: Resolution;
  selection_basis: 'exact_source_entity_name_in_attack_weapons';
  coefficient_variant_ids?: Record<string, string[]>;
  bullet_roots: number[];
  missing_bullet_ids: number[];
}
export interface Profile {
  entity_id: string;
  action: '1h-r1' | '2h-r1' | 'ground-cast';
  /** Stable ID sort; NOT combo order or a verified state graph. */
  animation_ids: string[];
  window_bindings: Binding[];
  transition_edges: [];
  cycle_seconds: null;
  ranking_eligible: false;
  validation: { status: 'unverified'; blockers: string[]; evidence: [] };
}
export interface Entity {
  game_id: number;
  name_en: string;
  name_ja: string | null;
  kind: 'weapon' | 'spell';
  category: string;
  source_id: 'weapons' | 'spells';
  dlc?: boolean;
  motion_parameters?: Record<string, Json>;
  cast_parameters?: Record<string, Json>;
  magic_references?: { slot: number; ref_id: number; category: number; consume_type: number }[];
}
export interface Animation {
  name: string;
  version: string;
  labels: string[];
  source_id: 'animations';
  source_key: string;
  source_hash: string;
  section: string;
  motion_category: number;
  active_windows: { index: number; type: string; range_source_frames: SourceRange; source_params: Record<string, Json> }[];
  cancel_windows: { type: string; ranges_source_frames: Record<string, SourceRange> }[];
  cancel_from_types: string[];
  speed_gradients: { range: SourceRange; startSpeed: number; endSpeed: number }[];
  blend_ranges_source_frames: SourceRange[];
  effect_windows: Json[];
}
export interface Attack {
  source_id: 'attacks';
  refs: { key: string; atkParamId: number; bulletId: number | null; spEffectIds: number[] };
  applicable_source_names: string[];
  /** Original field names. MV is a percentage; Flat and spell coefficients differ. */
  source_fields: Record<string, Json>;
  bullet_data: Record<string, Json>;
}
export interface SpellCoefficient {
  spell_id: string;
  attack_id: number | null;
  name_en: string;
  fp: number | null;
  charged_fp: number | null;
  stamina: number | null;
  charged_stamina: number | null;
  typed_attack_coefficient: Record<string, Json>;
  only_int: boolean;
  only_faith: boolean;
  no_scale: boolean;
  source: Json;
}
export interface DpsCandidateData {
  schema_version: 1;
  status: 'implementation-candidates-unverified';
  game_version: string;
  time_base: { unit: 'source_frame'; seconds_per_unit: null; verified: false };
  sources: Record<string, Source>;
  entities: Record<string, Entity>;
  profiles: Record<string, Profile>;
  animations: Record<string, Animation>;
  attacks: Record<string, Attack>;
  spell_coefficients: Record<string, SpellCoefficient>;
  bullets: Record<string, { source_id: 'bullets'; source_fields: Record<string, Json>; child_references: Record<string, number> }>;
  missing_references: { attacks: string[]; bullets: number[] };
}
export interface DpsPayload {
  schema_version: 1;
  encoding: 'gzip+base64';
  sha256: string;
  uncompressed_bytes: number;
  data: string;
}
