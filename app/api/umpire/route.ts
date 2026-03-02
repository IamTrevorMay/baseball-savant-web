import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'leaderboard') {
    const season = body.season ? Number(body.season) : null
    const seasonFilter = season ? `AND u.game_date >= '${season}-01-01' AND u.game_date <= '${season}-12-31'` : ''
    const pitchSeasonFilter = season ? `AND p.game_year = ${season}` : ''

    const { data, error } = await supabase.rpc('run_query', {
      query_text: `
        SELECT u.hp_umpire,
          COUNT(DISTINCT u.game_pk) as games,
          MIN(u.game_date)::text as first_date,
          MAX(u.game_date)::text as last_date,
          COUNT(*) FILTER (WHERE p.type IN ('B','S')) as called_pitches,
          COUNT(*) FILTER (WHERE
            (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
            OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
          ) as correct_calls
        FROM game_umpires u
        JOIN pitches p ON p.game_pk = u.game_pk
        WHERE p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
          AND p.pitch_type NOT IN ('PO', 'IN')
          ${seasonFilter} ${pitchSeasonFilter}
        GROUP BY u.hp_umpire
        ORDER BY games DESC
        LIMIT 50
      `
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'search') {
    const searchQuery = (body.query || '').trim().toLowerCase().replace(/'/g, "''")
    if (!searchQuery) return NextResponse.json([])

    const { data, error } = await supabase.rpc('run_query', {
      query_text: `
        SELECT hp_umpire, COUNT(DISTINCT game_pk) as games
        FROM game_umpires
        WHERE LOWER(hp_umpire) LIKE '%${searchQuery}%'
        GROUP BY hp_umpire
        ORDER BY games DESC
        LIMIT 8
      `
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'scorecard') {
    const umpireName = (body.name || '').replace(/'/g, "''")
    if (!umpireName) return NextResponse.json({ error: 'name required' }, { status: 400 })
    const season = body.season ? Number(body.season) : null
    const seasonFilter = season ? `AND u.game_date >= '${season}-01-01' AND u.game_date <= '${season}-12-31'` : ''
    const pitchSeasonFilter = season ? `AND p.game_year = ${season}` : ''

    // 1. Summary stats
    const summarySQL = `
      SELECT
        COUNT(DISTINCT u.game_pk) as games,
        MIN(u.game_date)::text as first_date,
        MAX(u.game_date)::text as last_date,
        COUNT(*) as called_pitches,
        COUNT(*) FILTER (WHERE
          (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
          OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
        ) as correct_calls,
        COUNT(*) FILTER (WHERE p.type = 'S') as called_strikes,
        COUNT(*) FILTER (WHERE p.type = 'B') as called_balls,
        COUNT(*) FILTER (WHERE ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) as true_strikes,
        COUNT(*) FILTER (WHERE p.type = 'S' AND NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top)) as incorrect_strikes,
        COUNT(*) FILTER (WHERE p.type = 'B' AND ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) as incorrect_balls
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE u.hp_umpire = '${umpireName}'
        AND p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
        AND p.pitch_type NOT IN ('PO', 'IN')
        ${seasonFilter} ${pitchSeasonFilter}
    `

    // 2. Missed calls (for scatter plot)
    const missedSQL = `
      SELECT p.plate_x, p.plate_z, p.type
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE u.hp_umpire = '${umpireName}'
        AND p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
        AND p.pitch_type NOT IN ('PO', 'IN')
        AND NOT (
          (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
          OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
        )
        ${seasonFilter} ${pitchSeasonFilter}
    `

    // 3. Zone accuracy grid (3x3 + outside)
    const zoneSQL = `
      SELECT
        CASE
          WHEN p.plate_x < -0.28 AND p.plate_x >= -0.83 AND p.plate_z >= 2.83 AND p.plate_z <= 3.5 THEN 'r0c0'
          WHEN p.plate_x >= -0.28 AND p.plate_x <= 0.28 AND p.plate_z >= 2.83 AND p.plate_z <= 3.5 THEN 'r0c1'
          WHEN p.plate_x > 0.28 AND p.plate_x <= 0.83 AND p.plate_z >= 2.83 AND p.plate_z <= 3.5 THEN 'r0c2'
          WHEN p.plate_x < -0.28 AND p.plate_x >= -0.83 AND p.plate_z >= 2.17 AND p.plate_z < 2.83 THEN 'r1c0'
          WHEN p.plate_x >= -0.28 AND p.plate_x <= 0.28 AND p.plate_z >= 2.17 AND p.plate_z < 2.83 THEN 'r1c1'
          WHEN p.plate_x > 0.28 AND p.plate_x <= 0.83 AND p.plate_z >= 2.17 AND p.plate_z < 2.83 THEN 'r1c2'
          WHEN p.plate_x < -0.28 AND p.plate_x >= -0.83 AND p.plate_z >= 1.5 AND p.plate_z < 2.17 THEN 'r2c0'
          WHEN p.plate_x >= -0.28 AND p.plate_x <= 0.28 AND p.plate_z >= 1.5 AND p.plate_z < 2.17 THEN 'r2c1'
          WHEN p.plate_x > 0.28 AND p.plate_x <= 0.83 AND p.plate_z >= 1.5 AND p.plate_z < 2.17 THEN 'r2c2'
          ELSE 'outside'
        END as zone_cell,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE
          (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
          OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
        ) as correct
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE u.hp_umpire = '${umpireName}'
        AND p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
        AND p.pitch_type NOT IN ('PO', 'IN')
        ${seasonFilter} ${pitchSeasonFilter}
      GROUP BY zone_cell
    `

    // 4. Game log
    const gameLogSQL = `
      SELECT u.game_pk, u.game_date::text as game_date, u.home_team, u.away_team,
        COUNT(*) as called,
        COUNT(*) FILTER (WHERE
          (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top AND p.type = 'S')
          OR (NOT (ABS(p.plate_x) <= 0.83 AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top) AND p.type = 'B')
        ) as correct
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE u.hp_umpire = '${umpireName}'
        AND p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL
        AND p.pitch_type NOT IN ('PO', 'IN')
        ${seasonFilter} ${pitchSeasonFilter}
      GROUP BY u.game_pk, u.game_date, u.home_team, u.away_team
      ORDER BY u.game_date DESC
      LIMIT 200
    `

    // 5. Available seasons
    const seasonsSQL = `
      SELECT DISTINCT EXTRACT(YEAR FROM game_date)::int as season
      FROM game_umpires
      WHERE hp_umpire = '${umpireName}'
      ORDER BY season DESC
    `

    const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })
    const [summaryRes, missedRes, zoneRes, gameLogRes, seasonsRes] = await Promise.all([
      q(summarySQL), q(missedSQL), q(zoneSQL), q(gameLogSQL), q(seasonsSQL),
    ])

    for (const res of [summaryRes, missedRes, zoneRes, gameLogRes, seasonsRes]) {
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    }

    return NextResponse.json({
      summary: summaryRes.data?.[0] || null,
      missedCalls: missedRes.data || [],
      zoneGrid: zoneRes.data || [],
      gameLog: gameLogRes.data || [],
      seasons: (seasonsRes.data || []).map((r: any) => r.season),
    })
  }

  if (action === 'seasons') {
    const { data, error } = await supabase.rpc('run_query', {
      query_text: `SELECT DISTINCT EXTRACT(YEAR FROM game_date)::int as season FROM game_umpires ORDER BY season DESC`
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json((data || []).map((r: any) => r.season))
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
