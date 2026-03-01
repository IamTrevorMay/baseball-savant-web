import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { METRICS } from '@/lib/reportMetrics'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Allowed Group-By Columns ─────────────────────────────────────────────────
// Values can be bare column names OR CASE expressions (for computed columns)
const GROUP_COLS: Record<string, string> = {
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
const FILTER_COLS = new Set([
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
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
      if (!METRICS[m]) return NextResponse.json({ error: `Unknown metric: ${m}` }, { status: 400 })
    }
    for (const g of groupBy) {
      if (!GROUP_COLS[g]) return NextResponse.json({ error: `Unknown group: ${g}` }, { status: 400 })
    }

    // Build SELECT — computed cols get aliased, bare cols stay bare
    const selectParts = [
      ...groupBy.map((g: string) => {
        const expr = GROUP_COLS[g]
        return expr.includes(' ') ? `${expr} AS ${g}` : expr
      }),
      ...metrics.map((m: string) => `${METRICS[m]} AS ${m}`),
    ]

    // Build GROUP BY — use the raw expression (not alias)
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

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : ''
    const groupClause = `GROUP BY ${groupByExprs.join(', ')}`

    // HAVING — support both minPitches and minPA
    const havingParts: string[] = []
    const mp = parseInt(minPitches)
    if (mp > 0) havingParts.push(`COUNT(*) >= ${mp}`)
    const mpa = parseInt(minPA)
    if (mpa > 0) havingParts.push(`COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) >= ${mpa}`)
    const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''

    // Allow sorting by metrics OR group-by columns
    const safeSortBy = (METRICS[sortBy] || GROUP_COLS[sortBy]) ? sortBy : metrics[0] || 'pitches'
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
    const orderClause = `ORDER BY ${safeSortBy} ${safeSortDir}`
    const safeLimit = Math.min(Math.max(parseInt(limit), 1), 1000)
    const safeOffset = Math.max(parseInt(offset) || 0, 0)
    const limitClause = `LIMIT ${safeLimit} OFFSET ${safeOffset}`

    const sql = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause} ${groupClause} ${havingClause} ${orderClause} ${limitClause}`

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data, sql, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
