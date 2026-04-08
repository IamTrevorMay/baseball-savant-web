/**
 * Pure-logic helpers extracted from app/api/report/route.ts for testability.
 */

// ── Allowed Group-By Columns ─────────────────────────────────────────────────
export const GROUP_COLS: Record<string, string> = {
  player_name: 'player_name',
  pitcher: 'pitcher',
  batter: 'batter',
  game_year: 'game_year',
  pitch_name: 'pitch_name',
  pitch_type: 'pitch_type',
  stand: 'stand',
  p_throws: 'p_throws',
  home_team: 'home_team',
  away_team: 'away_team',
  inning: 'inning',
  inning_topbot: 'inning_topbot',
  balls: 'balls',
  strikes: 'strikes',
  outs_when_up: 'outs_when_up',
  bb_type: 'bb_type',
  events: 'events',
  type: 'type',
  zone: 'zone',
  game_date: 'game_date',
  game_pk: 'game_pk',
  if_fielding_alignment: 'if_fielding_alignment',
  of_fielding_alignment: 'of_fielding_alignment',
  // Computed team columns
  pitch_team: "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END",
  bat_team: "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END",
}

// ── Allowed Filter Columns ───────────────────────────────────────────────────
export const FILTER_COLS = new Set([
  'pitcher', 'batter', 'game_year', 'game_date', 'pitch_name', 'pitch_type',
  'stand', 'p_throws', 'home_team', 'away_team', 'inning', 'inning_topbot',
  'balls', 'strikes', 'outs_when_up', 'events', 'description', 'type',
  'bb_type', 'zone', 'game_type', 'release_speed', 'release_spin_rate',
  'launch_speed', 'launch_angle', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z',
  'if_fielding_alignment', 'of_fielding_alignment', 'bat_speed', 'swing_length',
  'estimated_ba_using_speedangle', 'estimated_woba_using_speedangle',
  'release_extension', 'arm_angle', 'effective_speed', 'spin_axis',
  'hit_distance_sc', 'home_score', 'away_score', 'n_thruorder_pitcher',
  'player_name',
])

// ── Indexed Columns (guard against full table scans) ─────────────────────────
export const INDEXED_FILTER_COLS = new Set([
  'pitcher', 'batter', 'game_year', 'game_date', 'home_team', 'away_team', 'game_type',
])

export interface Filter {
  column: string
  op: string
  value: any
}

/**
 * Build WHERE clause parts from filter array.
 * Unknown columns are skipped. Values are escaped.
 */
export function buildWhereParts(filters: Filter[]): string[] {
  const parts: string[] = []
  for (const f of filters) {
    const { column, op, value } = f
    if (!FILTER_COLS.has(column)) continue
    const safeCol = column.replace(/[^a-z_]/g, '')
    if (op === 'in' && Array.isArray(value)) {
      const escaped = value.map((v: any) => `'${String(v).replace(/'/g, "''")}'`).join(',')
      parts.push(`${safeCol} IN (${escaped})`)
    } else if (op === 'gte') {
      parts.push(`${safeCol} >= ${parseFloat(value)}`)
    } else if (op === 'lte') {
      parts.push(`${safeCol} <= ${parseFloat(value)}`)
    } else if (op === 'eq') {
      parts.push(`${safeCol} = '${String(value).replace(/'/g, "''")}'`)
    } else if (op === 'between' && Array.isArray(value) && value.length === 2) {
      parts.push(`${safeCol} BETWEEN '${String(value[0]).replace(/'/g, "''")}' AND '${String(value[1]).replace(/'/g, "''")}'`)
    }
  }
  return parts
}

/**
 * Check whether the filter list includes at least one indexed column.
 */
export function hasIndexedFilter(filters: Filter[]): boolean {
  return filters.some(f => INDEXED_FILTER_COLS.has(f.column))
}

/**
 * Build SELECT parts from groupBy + metrics.
 * Computed columns (containing spaces / CASE expressions) get an AS alias.
 */
export function buildSelectParts(
  groupBy: string[],
  metrics: string[],
  metricsMap: Record<string, string>
): string[] {
  return [
    ...groupBy.map(g => {
      const expr = GROUP_COLS[g]
      return expr.includes(' ') ? `${expr} AS ${g}` : expr
    }),
    ...metrics.map(m => `${metricsMap[m]} AS ${m}`),
  ]
}
