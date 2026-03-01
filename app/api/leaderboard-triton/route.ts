import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Query pre-computed Triton command metrics for the leaderboard.
 * Aggregates across pitch types per pitcher using pitch-count weighted averages.
 *
 * POST /api/leaderboard-triton
 * Body: { gameYear, minPitches, sortBy, sortDir, limit, offset }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      gameYear = 2025,
      minPitches = 500,
      sortBy = 'cmd_plus',
      sortDir = 'DESC',
      limit = 100,
      offset = 0,
    } = body

    // Whitelist sortable columns
    const SORT_COLS = new Set([
      'player_name', 'pitches', 'cmd_plus', 'rpcom_plus',
      'brink_plus', 'cluster_plus', 'hdev_plus', 'vdev_plus',
      'missfire_plus', 'waste_pct',
    ])
    const safeSortBy = SORT_COLS.has(sortBy) ? sortBy : 'cmd_plus'
    const safeSortDir = sortDir === 'ASC' ? 'ASC' : 'DESC'
    const safeLimit = Math.min(Math.max(parseInt(limit), 1), 1000)
    const safeOffset = Math.max(parseInt(offset) || 0, 0)
    const safeMinPitches = Math.max(parseInt(minPitches) || 0, 0)

    const sql = `
      SELECT
        pitcher,
        player_name,
        SUM(pitches) AS pitches,
        ROUND((SUM(cmd_plus * pitches) / NULLIF(SUM(CASE WHEN cmd_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS cmd_plus,
        ROUND((SUM(rpcom_plus * pitches) / NULLIF(SUM(CASE WHEN rpcom_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS rpcom_plus,
        ROUND((SUM(brink_plus * pitches) / NULLIF(SUM(CASE WHEN brink_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS brink_plus,
        ROUND((SUM(cluster_plus * pitches) / NULLIF(SUM(CASE WHEN cluster_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS cluster_plus,
        ROUND((SUM(hdev_plus * pitches) / NULLIF(SUM(CASE WHEN hdev_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS hdev_plus,
        ROUND((SUM(vdev_plus * pitches) / NULLIF(SUM(CASE WHEN vdev_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS vdev_plus,
        ROUND((SUM(missfire_plus * pitches) / NULLIF(SUM(CASE WHEN missfire_plus IS NOT NULL THEN pitches END), 0))::numeric, 1) AS missfire_plus,
        ROUND((SUM(waste_pct * pitches) / NULLIF(SUM(pitches), 0))::numeric, 1) AS waste_pct
      FROM pitcher_season_command
      WHERE game_year = ${parseInt(String(gameYear))}
      GROUP BY pitcher, player_name
      HAVING SUM(pitches) >= ${safeMinPitches}
      ORDER BY ${safeSortBy} ${safeSortDir} NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message, sql }, { status: 500 })

    return NextResponse.json({ rows: data, count: data?.length || 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
