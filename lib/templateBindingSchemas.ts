/**
 * templateBindingSchemas — Schema definitions, field lists, sample data,
 * and format helpers for the custom template builder.
 */

import { DataSchemaType, ElementType } from './sceneTypes'

// ── Schema Field Definitions ────────────────────────────────────────────────

export interface SchemaField {
  path: string
  label: string
  type: 'string' | 'number' | 'player_id'
}

const LEADERBOARD_FIELDS: SchemaField[] = [
  { path: 'rank', label: 'Rank', type: 'number' },
  { path: 'player_id', label: 'Player ID', type: 'player_id' },
  { path: 'player_name', label: 'Player Name', type: 'string' },
  { path: 'primary_value', label: 'Primary Value', type: 'number' },
  { path: 'secondary_value', label: 'Secondary Value', type: 'number' },
  { path: 'tertiary_value', label: 'Tertiary Value', type: 'number' },
]

const OUTING_FIELDS: SchemaField[] = [
  { path: 'pitcher_id', label: 'Pitcher ID', type: 'player_id' },
  { path: 'pitcher_name', label: 'Pitcher Name', type: 'string' },
  { path: 'game_date', label: 'Game Date', type: 'string' },
  { path: 'opponent', label: 'Opponent', type: 'string' },
  { path: 'game_line.ip', label: 'IP', type: 'string' },
  { path: 'game_line.h', label: 'Hits', type: 'number' },
  { path: 'game_line.r', label: 'Runs', type: 'number' },
  { path: 'game_line.er', label: 'Earned Runs', type: 'number' },
  { path: 'game_line.bb', label: 'Walks', type: 'number' },
  { path: 'game_line.k', label: 'Strikeouts', type: 'number' },
  { path: 'game_line.pitches', label: 'Pitches', type: 'number' },
  { path: 'command.waste_pct', label: 'Waste %', type: 'number' },
  { path: 'command.avg_cluster', label: 'Avg Cluster', type: 'number' },
  { path: 'command.avg_brink', label: 'Avg Brink', type: 'number' },
]

const STARTER_CARD_FIELDS: SchemaField[] = [
  { path: 'pitcher_id', label: 'Pitcher ID', type: 'player_id' },
  { path: 'pitcher_name', label: 'Pitcher Name', type: 'string' },
  { path: 'p_throws', label: 'Throws', type: 'string' },
  { path: 'team', label: 'Team', type: 'string' },
  { path: 'age', label: 'Age', type: 'number' },
  { path: 'game_date', label: 'Game Date', type: 'string' },
  { path: 'opponent', label: 'Opponent', type: 'string' },
  { path: 'game_line.ip', label: 'IP', type: 'string' },
  { path: 'game_line.er', label: 'ER', type: 'number' },
  { path: 'game_line.h', label: 'Hits', type: 'number' },
  { path: 'game_line.bb', label: 'Walks', type: 'number' },
  { path: 'game_line.k', label: 'Strikeouts', type: 'number' },
  { path: 'game_line.pitches', label: 'Pitches', type: 'number' },
  { path: 'game_line.csw_pct', label: 'CSW %', type: 'number' },
  { path: 'grades.start', label: 'Grade: Start', type: 'string' },
  { path: 'grades.stuff', label: 'Grade: Stuff', type: 'string' },
  { path: 'grades.command', label: 'Grade: Command', type: 'string' },
  { path: 'grades.triton', label: 'Grade: Triton', type: 'string' },
]

const PERCENTILE_FIELDS: SchemaField[] = [
  { path: 'metric_name', label: 'Metric Name', type: 'string' },
  { path: 'percentile_value', label: 'Percentile', type: 'number' },
  { path: 'raw_value', label: 'Raw Value', type: 'number' },
]

const GENERIC_FIELDS: SchemaField[] = [
  { path: 'player_id', label: 'Player ID', type: 'player_id' },
  { path: 'player_name', label: 'Player Name', type: 'string' },
  { path: 'stat_value', label: 'Stat Value', type: 'number' },
  { path: 'stat_label', label: 'Stat Label', type: 'string' },
]

export const SCHEMA_FIELDS: Record<DataSchemaType, SchemaField[]> = {
  'leaderboard': LEADERBOARD_FIELDS,
  'outing': OUTING_FIELDS,
  'starter-card': STARTER_CARD_FIELDS,
  'percentile': PERCENTILE_FIELDS,
  'generic': GENERIC_FIELDS,
}

export const SCHEMA_LABELS: Record<DataSchemaType, string> = {
  'leaderboard': 'Leaderboard',
  'outing': 'Pitcher Outing',
  'starter-card': 'Starter Card',
  'percentile': 'Percentile Rankings',
  'generic': 'Generic',
}

// ── Sample Data (for preview) ───────────────────────────────────────────────

export function getSampleData(schema: DataSchemaType): Record<string, any>[] {
  switch (schema) {
    case 'leaderboard':
      return [
        { rank: 1, player_id: 669373, player_name: 'Skenes, Paul', primary_value: 98.2, secondary_value: 34.1, tertiary_value: 2.35 },
        { rank: 2, player_id: 543037, player_name: 'Cole, Gerrit', primary_value: 97.1, secondary_value: 31.2, tertiary_value: 2.63 },
        { rank: 3, player_id: 808967, player_name: 'Richardson, Sail', primary_value: 96.8, secondary_value: 29.5, tertiary_value: 3.12 },
        { rank: 4, player_id: 663556, player_name: 'Wheeler, Zack', primary_value: 96.4, secondary_value: 28.8, tertiary_value: 2.57 },
        { rank: 5, player_id: 665861, player_name: 'Glasnow, Tyler', primary_value: 96.1, secondary_value: 33.7, tertiary_value: 3.32 },
      ]
    case 'outing':
      return [{
        pitcher_id: 669373, pitcher_name: 'Skenes, Paul', game_date: '2025-06-15', opponent: 'NYM',
        game_line: { ip: '7.0', h: 3, r: 1, er: 1, bb: 1, k: 10, pitches: 98 },
        command: { waste_pct: 18.2, avg_cluster: 6.4, avg_brink: 12.1 },
      }]
    case 'starter-card':
      return [{
        pitcher_id: 669373, pitcher_name: 'Skenes, Paul', p_throws: 'R', team: 'PIT', age: 23,
        game_date: '2025-06-15', opponent: 'NYM',
        game_line: { ip: '7.0', er: 1, h: 3, hr: 0, bb: 1, k: 10, whiffs: 22, csw_pct: 34.2, pitches: 98 },
        grades: { start: 'A', stuff: 'A+', command: 'B+', triton: 'A' },
      }]
    case 'percentile':
      return [
        { metric_name: 'Fastball Velo', percentile_value: 98, raw_value: 98.2 },
        { metric_name: 'Whiff Rate', percentile_value: 92, raw_value: 34.1 },
        { metric_name: 'K Rate', percentile_value: 88, raw_value: 31.2 },
        { metric_name: 'Hard Hit %', percentile_value: 82, raw_value: 28.5 },
        { metric_name: 'xERA', percentile_value: 95, raw_value: 2.35 },
      ]
    case 'generic':
      return [
        { player_id: 669373, player_name: 'Skenes, Paul', stat_value: 98.2, stat_label: 'Avg Velo' },
      ]
  }
}

// ── Format Helpers ──────────────────────────────────────────────────────────

export type FormatType = 'raw' | '1f' | '2f' | 'integer' | 'percent' | '3f'

export function formatValue(value: any, format?: FormatType): string {
  if (value == null) return '—'
  if (!format || format === 'raw') return String(value)
  const num = typeof value === 'number' ? value : parseFloat(value)
  if (isNaN(num)) return String(value)
  switch (format) {
    case '1f': return num.toFixed(1)
    case '2f': return num.toFixed(2)
    case 'integer': return Math.round(num).toString()
    case 'percent': return `${num.toFixed(1)}%`
    case '3f': return num.toFixed(3).replace(/^0\./, '.')
    default: return String(value)
  }
}

export const FORMAT_OPTIONS: { value: FormatType; label: string }[] = [
  { value: 'raw', label: 'Raw' },
  { value: '1f', label: '1 Decimal (96.2)' },
  { value: '2f', label: '2 Decimal (3.45)' },
  { value: 'integer', label: 'Integer (96)' },
  { value: 'percent', label: 'Percent (96.2%)' },
  { value: '3f', label: '.3f (.312)' },
]

// ── Auto-format: default format per metric key ──────────────────────────────

export const METRIC_DEFAULT_FORMAT: Record<string, FormatType> = {
  // Batting averages (.xxx)
  ba: '3f', obp: '3f', slg: '3f', ops: '3f',
  avg_xba: '3f', avg_xwoba: '3f', avg_xslg: '3f', avg_woba: '3f',
  // ERA family (x.xx)
  era: '2f', fip: '2f', xera: '2f',
  whip: '2f', avg_ext: '2f', avg_swing_length: '2f',
  // Deception scores (.xxx)
  deception_score: '3f', unique_score: '3f', xdeception_score: '3f',
  // Velocities & spin (x.x)
  avg_velo: '1f', max_velo: '1f', avg_ev: '1f', max_ev: '1f',
  avg_la: '1f', avg_hbreak_in: '1f', avg_ivb_in: '1f',
  avg_arm_angle: '1f', avg_bat_speed: '1f', total_re24: '1f',
  avg_attack_angle: '1f', avg_attack_direction: '1f', avg_swing_path_tilt: '1f',
  // Rates (x.x%)
  whiff_pct: 'percent', k_pct: 'percent', bb_pct: 'percent',
  k_minus_bb: 'percent', csw_pct: 'percent', swstr_pct: 'percent',
  zone_pct: 'percent', chase_pct: 'percent', contact_pct: 'percent',
  z_swing_pct: 'percent', o_contact_pct: 'percent',
  hard_hit_pct: 'percent', barrel_pct: 'percent',
  fast_swing_rate: 'percent', squared_up_rate: 'percent',
  blast_rate: 'percent', ideal_attack_angle_rate: 'percent',
  gb_pct: 'percent', fb_pct: 'percent', ld_pct: 'percent', pu_pct: 'percent',
  usage_pct: 'percent', close_pct: 'percent', waste_pct: 'percent',
  // Counting (integers)
  pitches: 'integer', pa: 'integer', games: 'integer',
  h: 'integer', singles: 'integer', doubles: 'integer', triples: 'integer',
  hr_count: 'integer', bb_count: 'integer', k_count: 'integer', hbp_count: 'integer',
  avg_spin: 'integer', avg_dist: 'integer',
  // Triton+ (integers)
  cmd_plus: 'integer', rpcom_plus: 'integer', brink_plus: 'integer',
  cluster_plus: 'integer', cluster_r_plus: 'integer', cluster_l_plus: 'integer',
  hdev_plus: 'integer', vdev_plus: 'integer',
  missfire_plus: 'integer', close_pct_plus: 'integer',
  // Triton raw (x.x)
  avg_brink: '1f', avg_cluster: '1f', avg_cluster_r: '1f', avg_cluster_l: '1f',
  avg_hdev: '1f', avg_vdev: '1f', avg_missfire: '1f',
  // Game scores (integers)
  away_score: 'integer', home_score: 'integer', outs: 'integer',
  // String fields (raw)
  player_name: 'raw', away_abbrev: 'raw', home_abbrev: 'raw',
  away_name: 'raw', home_name: 'raw',
  pitcher_name: 'raw', batter_name: 'raw',
  inning_display: 'raw', state_line: 'raw', game_state: 'raw',
  detailed_state: 'raw', inning_half: 'raw', inning_ordinal: 'raw',
}

/** Get the correct format for a metric. Uses explicit format if non-default, otherwise auto-detects. */
export function getMetricFormat(metric: string | undefined, explicitFormat?: FormatType): FormatType {
  // If user explicitly chose a non-default format, respect it
  if (explicitFormat && explicitFormat !== '1f') return explicitFormat
  // Auto-detect from metric key
  if (metric && METRIC_DEFAULT_FORMAT[metric]) return METRIC_DEFAULT_FORMAT[metric]
  // Fallback
  return explicitFormat || '1f'
}

// ── Auto-detect target property for binding ─────────────────────────────────

export function autoTargetProp(elementType: ElementType, fieldType: SchemaField['type']): string {
  if (fieldType === 'player_id') {
    if (elementType === 'player-image') return 'playerId'
    return 'text'
  }
  switch (elementType) {
    case 'text': return 'text'
    case 'stat-card': return 'value'
    case 'comparison-bar': return 'value'
    case 'player-image': return 'playerId'
    default: return 'text'
  }
}

export const STAT_CARD_TARGET_OPTIONS = [
  { value: 'value', label: 'Value' },
  { value: 'label', label: 'Label' },
  { value: 'sublabel', label: 'Sublabel' },
]

export const COMPARISON_BAR_TARGET_OPTIONS = [
  { value: 'value', label: 'Value' },
  { value: 'label', label: 'Label' },
]
