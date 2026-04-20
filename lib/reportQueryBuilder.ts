import { METRICS } from '@/lib/reportMetrics'

// ── Indexed Columns (guard against full table scans) ─────────────────────────
export const INDEXED_FILTER_COLS = new Set([
  'pitcher', 'batter', 'game_year', 'game_date', 'home_team', 'away_team', 'game_type',
])

// ── Shared Group-By Columns ─────────────────────────────────────────────────
const BASE_GROUP_COLS: Record<string, string> = {
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
  pitch_team: "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END",
  bat_team: "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END",
}

// ── Shared Filter Columns ───────────────────────────────────────────────────
const BASE_FILTER_COLS = [
  'pitcher', 'batter', 'game_year', 'game_date', 'pitch_name', 'pitch_type',
  'stand', 'p_throws', 'home_team', 'away_team', 'inning', 'inning_topbot',
  'balls', 'strikes', 'outs_when_up', 'events', 'description', 'type',
  'bb_type', 'zone', 'game_type', 'release_speed', 'release_spin_rate',
  'launch_speed', 'launch_angle', 'pfx_x', 'pfx_z', 'plate_x', 'plate_z',
  'if_fielding_alignment', 'of_fielding_alignment', 'bat_speed', 'swing_length',
  'attack_angle', 'attack_direction', 'swing_path_tilt',
  'estimated_ba_using_speedangle', 'estimated_woba_using_speedangle',
  'release_extension', 'arm_angle', 'effective_speed', 'spin_axis',
  'hit_distance_sc', 'home_score', 'away_score', 'n_thruorder_pitcher',
  'player_name',
]

export interface ReportQueryConfig {
  table: string
  extraGroupCols?: Record<string, string>
  extraFilterCols?: string[]
}

export interface Filter {
  column: string
  op: string
  value: any
}

interface ReportQueryBody {
  metrics?: string[]
  groupBy?: string[]
  filters?: Filter[]
  sortBy?: string
  sortDir?: string
  limit?: number
  offset?: number
  minPitches?: number
  minPA?: number
}

/**
 * Build a full report SQL query from config + request body.
 * Returns { sql } on success, { error } on validation failure.
 */
export function buildReportQuery(
  config: ReportQueryConfig,
  body: ReportQueryBody,
): { sql: string; error?: undefined } | { error: string; sql?: undefined } {
  const GROUP_COLS: Record<string, string> = { ...BASE_GROUP_COLS, ...config.extraGroupCols }
  const FILTER_COLS = new Set([...BASE_FILTER_COLS, ...(config.extraFilterCols || [])])

  const {
    metrics = ['pitches', 'avg_velo', 'whiff_pct'],
    groupBy = ['player_name'],
    filters = [],
    sortBy = 'pitches',
    sortDir = 'DESC',
    limit = 100,
    offset = 0,
    minPitches = 0,
    minPA = 0,
  } = body

  // Validate
  for (const m of metrics) {
    if (!METRICS[m]) return { error: `Unknown metric: ${m}` }
  }
  for (const g of groupBy) {
    if (!GROUP_COLS[g]) return { error: `Unknown group: ${g}` }
  }

  // Build SELECT
  const selectParts = [
    ...groupBy.map((g: string) => {
      const expr = GROUP_COLS[g]
      return expr.includes(' ') ? `${expr} AS ${g}` : expr
    }),
    ...metrics.map((m: string) => `${METRICS[m]} AS ${m}`),
  ]

  // Build GROUP BY
  const groupByExprs = groupBy.map((g: string) => GROUP_COLS[g])

  // Build WHERE
  const whereParts: string[] = []
  for (const f of filters) {
    const { column, op, value } = f
    if (!FILTER_COLS.has(column)) continue
    const safeCol = column.replace(/[^a-z_]/g, '')
    if (op === 'in' && Array.isArray(value)) {
      const escaped = value.map((v: any) => `'${String(v).replace(/'/g, "''")}'`).join(',')
      whereParts.push(`${safeCol} IN (${escaped})`)
    } else if (op === 'gte') {
      whereParts.push(`${safeCol} >= ${parseFloat(value)}`)
    } else if (op === 'lte') {
      whereParts.push(`${safeCol} <= ${parseFloat(value)}`)
    } else if (op === 'eq') {
      whereParts.push(`${safeCol} = '${String(value).replace(/'/g, "''")}'`)
    } else if (op === 'between' && Array.isArray(value) && value.length === 2) {
      whereParts.push(`${safeCol} BETWEEN '${String(value[0]).replace(/'/g, "''")}' AND '${String(value[1]).replace(/'/g, "''")}'`)
    }
  }

  whereParts.push("pitch_type NOT IN ('PO', 'IN')")
  const whereClause = `WHERE ${whereParts.join(' AND ')}`
  const groupClause = `GROUP BY ${groupByExprs.join(', ')}`

  // HAVING
  const havingParts: string[] = []
  const mp = typeof minPitches === 'number' ? minPitches : parseInt(String(minPitches))
  if (mp > 0) havingParts.push(`COUNT(*) >= ${mp}`)
  const mpa = typeof minPA === 'number' ? minPA : parseInt(String(minPA))
  if (mpa > 0) havingParts.push(`COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) >= ${mpa}`)
  const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''

  // ORDER BY
  const safeSortBy = (METRICS[sortBy] || GROUP_COLS[sortBy]) ? sortBy : metrics[0] || 'pitches'
  const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
  const orderClause = `ORDER BY ${safeSortBy} ${safeSortDir}`
  const safeLimit = Math.min(Math.max(typeof limit === 'number' ? limit : parseInt(String(limit)), 1), 1000)
  const safeOffset = Math.max((typeof offset === 'number' ? offset : parseInt(String(offset))) || 0, 0)
  const limitClause = `LIMIT ${safeLimit} OFFSET ${safeOffset}`

  const sql = `SELECT ${selectParts.join(', ')} FROM ${config.table} ${whereClause} ${groupClause} ${havingClause} ${orderClause} ${limitClause}`

  return { sql }
}

// ── Granular helpers (used by tests and other consumers) ─────────────────────

/** The base GROUP_COLS record (no extras). */
export const GROUP_COLS = BASE_GROUP_COLS

/** The base FILTER_COLS set (no extras). */
export const FILTER_COLS = new Set(BASE_FILTER_COLS)

/** Build WHERE clause parts from a filter array against BASE_FILTER_COLS. */
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

/** Check whether the filter list includes at least one indexed column. */
export function hasIndexedFilter(filters: Filter[]): boolean {
  return filters.some(f => INDEXED_FILTER_COLS.has(f.column))
}

/** Build SELECT parts from groupBy + metrics. */
export function buildSelectParts(
  groupBy: string[],
  metrics: string[],
  metricsMap: Record<string, string>,
): string[] {
  return [
    ...groupBy.map(g => {
      const expr = GROUP_COLS[g]
      return expr.includes(' ') ? `${expr} AS ${g}` : expr
    }),
    ...metrics.map(m => `${metricsMap[m]} AS ${m}`),
  ]
}
