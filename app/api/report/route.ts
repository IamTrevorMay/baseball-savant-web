import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Metric Definitions ───────────────────────────────────────────────────────
const METRICS: Record<string, string> = {
  // Counting
  pitches: 'COUNT(*)',
  pa: "COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END)",
  games: 'COUNT(DISTINCT game_pk)',
  // Averages
  avg_velo: 'ROUND(AVG(release_speed)::numeric, 1)',
  max_velo: 'ROUND(MAX(release_speed)::numeric, 1)',
  avg_spin: 'ROUND(AVG(release_spin_rate)::numeric, 0)',
  avg_ext: 'ROUND(AVG(release_extension)::numeric, 2)',
  avg_hbreak_in: 'ROUND(AVG(pfx_x * 12)::numeric, 1)',
  avg_ivb_in: 'ROUND(AVG(pfx_z * 12)::numeric, 1)',
  avg_arm_angle: 'ROUND(AVG(arm_angle)::numeric, 1)',
  // Batted Ball
  avg_ev: 'ROUND(AVG(launch_speed)::numeric, 1)',
  max_ev: 'ROUND(MAX(launch_speed)::numeric, 1)',
  avg_la: 'ROUND(AVG(launch_angle)::numeric, 1)',
  avg_dist: 'ROUND(AVG(hit_distance_sc)::numeric, 0)',
  // Rates
  k_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 1)",
  bb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk') / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 1)",
  whiff_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%') / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip'), 0), 1)",
  csw_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike') / NULLIF(COUNT(*), 0), 1)",
  zone_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9) / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1)",
  chase_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play')) / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1)",
  // Batting
  ba: "ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  slg: "ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3)",
  obp: "ROUND((COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run','walk','hit_by_pitch')))::numeric / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN CONCAT(game_pk, '-', at_bat_number) END), 0), 3)",
  // Expected
  avg_xba: 'ROUND(AVG(estimated_ba_using_speedangle)::numeric, 3)',
  avg_xwoba: 'ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3)',
  avg_xslg: 'ROUND(AVG(estimated_slg_using_speedangle)::numeric, 3)',
  avg_woba: 'ROUND(AVG(woba_value)::numeric, 3)',
  total_re24: 'ROUND(SUM(delta_run_exp)::numeric, 1)',
  // GB/FB/LD
  gb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'ground_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  fb_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'fly_ball') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  ld_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'line_drive') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  pu_pct: "ROUND(100.0 * COUNT(*) FILTER (WHERE bb_type = 'popup') / NULLIF(COUNT(*) FILTER (WHERE bb_type IS NOT NULL), 0), 1)",
  // Usage
  usage_pct: 'ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY player_name), 0), 1)',
  // Swing
  avg_bat_speed: 'ROUND(AVG(bat_speed)::numeric, 1)',
  avg_swing_length: 'ROUND(AVG(swing_length)::numeric, 2)',
}

// ── Allowed Group-By Columns ─────────────────────────────────────────────────
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
      minPitches = 100,
    } = body

    // Validate
    for (const m of metrics) {
      if (!METRICS[m]) return NextResponse.json({ error: `Unknown metric: ${m}` }, { status: 400 })
    }
    for (const g of groupBy) {
      if (!GROUP_COLS[g]) return NextResponse.json({ error: `Unknown group: ${g}` }, { status: 400 })
    }

    // Build SELECT
    const selectParts = [
      ...groupBy.map((g: string) => GROUP_COLS[g]),
      ...metrics.map((m: string) => `${METRICS[m]} AS ${m}`),
    ]

    // Build WHERE
    const whereParts: string[] = []
    for (const f of filters) {
      const { column, op, value } = f
      if (!FILTER_COLS.has(column)) continue
      // Sanitize
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
    const groupClause = `GROUP BY ${groupBy.map((g: string) => GROUP_COLS[g]).join(', ')}`
    const havingClause = minPitches > 0 ? `HAVING COUNT(*) >= ${parseInt(minPitches)}` : ''
    const safeSortBy = METRICS[sortBy] ? sortBy : metrics[0] || 'pitches'
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
    const orderClause = `ORDER BY ${safeSortBy} ${safeSortDir}`
    const limitClause = `LIMIT ${Math.min(Math.max(parseInt(limit), 1), 1000)}`

    const sql = `SELECT ${selectParts.join(', ')} FROM pitches ${whereClause} ${groupClause} ${havingClause} ${orderClause} ${limitClause}`

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data, sql, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
