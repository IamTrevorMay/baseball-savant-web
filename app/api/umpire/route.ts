import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { ZONE_HALF_WIDTH } from '@/lib/constants-data'

// Zone boundary constants (feet) derived from ZONE_HALF_WIDTH (half plate + ball radius)
const SHADOW = 0.083 // 1 inch buffer
const IN_ZONE = `(ABS(p.plate_x) <= ${ZONE_HALF_WIDTH} AND p.plate_z >= p.sz_bot AND p.plate_z <= p.sz_top)`
const CORRECT = `((${IN_ZONE} AND p.type = 'S') OR (NOT ${IN_ZONE} AND p.type = 'B'))`
// Shadow zone: within 1" of zone edge (in expanded but not contracted)
const EXPANDED = `(ABS(p.plate_x) <= ${ZONE_HALF_WIDTH + SHADOW} AND p.plate_z >= p.sz_bot - ${SHADOW} AND p.plate_z <= p.sz_top + ${SHADOW})`
const CONTRACTED = `(ABS(p.plate_x) <= ${ZONE_HALF_WIDTH - SHADOW} AND p.plate_z >= p.sz_bot + ${SHADOW} AND p.plate_z <= p.sz_top - ${SHADOW})`
const NOT_SHADOW = `(NOT (${EXPANDED} AND NOT ${CONTRACTED}))`
const BASE_WHERE = `p.type IN ('B', 'S') AND p.plate_x IS NOT NULL AND p.sz_top IS NOT NULL AND p.pitch_type NOT IN ('PO', 'IN')`

const VALID_GAME_TYPES = ['R', 'S', 'P', 'E', 'W', 'D', 'L', 'F']

function gameTypeFilter(gameType: string | null): string {
  if (!gameType || !VALID_GAME_TYPES.includes(gameType)) return ''
  return `AND p.game_type = '${gameType}'`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action } = body

  if (action === 'leaderboard') {
    const season = body.season ? Number(body.season) : null
    const gtFilter = gameTypeFilter(body.gameType || null)

    // When season is specified, filter pitches first by game_year (indexed) for performance
    const yearJoin = season ? `AND p.game_year = ${season}` : ''
    const { data, error } = await supabase.rpc('run_query', {
      query_text: `SELECT u.hp_umpire,
          COUNT(DISTINCT u.game_pk) as games,
          MIN(u.game_date)::text as first_date,
          MAX(u.game_date)::text as last_date,
          COUNT(*) as called_pitches,
          COUNT(*) FILTER (WHERE ${CORRECT}) as correct_calls,
          COUNT(*) FILTER (WHERE ${NOT_SHADOW}) as real_called_pitches,
          COUNT(*) FILTER (WHERE ${NOT_SHADOW} AND ${CORRECT}) as real_correct_calls
        FROM game_umpires u
        JOIN pitches p ON p.game_pk = u.game_pk ${yearJoin} ${gtFilter}
        WHERE ${BASE_WHERE}
        GROUP BY u.hp_umpire
        ORDER BY games DESC
        LIMIT 50`
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (action === 'search') {
    const searchQuery = (body.query || '').trim().toLowerCase().replace(/'/g, "''")
    if (!searchQuery) return NextResponse.json([])

    const { data, error } = await supabase.rpc('run_query', {
      query_text: `SELECT hp_umpire, COUNT(DISTINCT game_pk) as games
        FROM game_umpires
        WHERE LOWER(hp_umpire) LIKE '%${searchQuery}%'
        GROUP BY hp_umpire
        ORDER BY games DESC
        LIMIT 8`
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
    const gtFilter = gameTypeFilter(body.gameType || null)
    const pitcherHandFilter = body.pitcherHand && ['R', 'L'].includes(body.pitcherHand) ? `AND p.p_throws = '${body.pitcherHand}'` : ''
    const batterSideFilter = body.batterSide && ['R', 'L'].includes(body.batterSide) ? `AND p.stand = '${body.batterSide}'` : ''
    const handFilters = `${pitcherHandFilter} ${batterSideFilter}`
    const umpWhere = `u.hp_umpire = '${umpireName}' AND ${BASE_WHERE} ${seasonFilter} ${pitchSeasonFilter} ${gtFilter} ${handFilters}`

    // 1. Summary stats
    const summarySQL = `
      SELECT
        COUNT(DISTINCT u.game_pk) as games,
        MIN(u.game_date)::text as first_date,
        MAX(u.game_date)::text as last_date,
        COUNT(*) as called_pitches,
        COUNT(*) FILTER (WHERE ${CORRECT}) as correct_calls,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW}) as real_called_pitches,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW} AND ${CORRECT}) as real_correct_calls,
        COUNT(*) FILTER (WHERE p.type = 'S') as called_strikes,
        COUNT(*) FILTER (WHERE p.type = 'B') as called_balls,
        COUNT(*) FILTER (WHERE ${IN_ZONE}) as true_strikes,
        COUNT(*) FILTER (WHERE p.type = 'S' AND NOT ${IN_ZONE}) as incorrect_strikes,
        COUNT(*) FILTER (WHERE p.type = 'B' AND ${IN_ZONE}) as incorrect_balls
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE ${umpWhere}
    `

    // 2. Missed calls (for scatter plot)
    const missedSQL = `
      SELECT p.plate_x, p.plate_z, p.type
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE ${umpWhere}
        AND NOT ${CORRECT}
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
        COUNT(*) FILTER (WHERE ${CORRECT}) as correct
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE ${umpWhere}
      GROUP BY zone_cell
    `

    // 4. Game log
    const gameLogSQL = `
      SELECT u.game_pk, u.game_date::text as game_date, u.home_team, u.away_team,
        COUNT(*) as called,
        COUNT(*) FILTER (WHERE ${CORRECT}) as correct,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW}) as real_called,
        COUNT(*) FILTER (WHERE ${NOT_SHADOW} AND ${CORRECT}) as real_correct
      FROM game_umpires u
      JOIN pitches p ON p.game_pk = u.game_pk
      WHERE ${umpWhere}
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

    // 6. Challenge summary
    const chalWhere = [`c.hp_umpire = '${umpireName}'`]
    if (season) chalWhere.push(`EXTRACT(YEAR FROM c.game_date) = ${season}`)
    // Filter challenges by game type via pitches table
    if (body.gameType && VALID_GAME_TYPES.includes(body.gameType)) {
      chalWhere.push(`c.game_pk IN (SELECT DISTINCT game_pk FROM pitches WHERE game_year = ${season || 'game_year'} AND game_type = '${body.gameType}')`)
    }
    if (body.pitcherHand && ['R', 'L'].includes(body.pitcherHand)) {
      chalWhere.push(`c.pitcher_id IN (SELECT DISTINCT pitcher FROM pitches WHERE p_throws = '${body.pitcherHand}')`)
    }
    if (body.batterSide && ['R', 'L'].includes(body.batterSide)) {
      chalWhere.push(`c.batter_id IN (SELECT DISTINCT batter FROM pitches WHERE stand = '${body.batterSide}')`)
    }
    const chalWhereStr = chalWhere.join(' AND ')

    const chalSummarySQL = `
      SELECT
        COUNT(*) as total_challenges,
        COUNT(*) FILTER (WHERE c.is_overturned) as overturned,
        COUNT(*) FILTER (WHERE NOT c.is_overturned) as upheld,
        ROUND(COUNT(*) FILTER (WHERE c.is_overturned)::numeric / NULLIF(COUNT(*), 0), 4) as overturn_rate,
        COUNT(*) FILTER (WHERE c.review_type = 'MJ') as abs_challenges,
        COUNT(*) FILTER (WHERE c.review_type = 'MJ' AND c.is_overturned) as abs_overturned
      FROM umpire_challenges c
      WHERE ${chalWhereStr}
    `

    // 7. Challenge events — join to pitches to get plate location
    const chalEventsSQL = `
      SELECT c.game_pk, c.game_date::text as game_date, c.inning, c.half_inning,
        c.review_type, c.is_overturned, c.challenge_team,
        c.challenger_name, c.batter_name, c.pitcher_name,
        c.balls, c.strikes, c.outs, c.description,
        p.plate_x, p.plate_z
      FROM umpire_challenges c
      LEFT JOIN LATERAL (
        SELECT plate_x, plate_z
        FROM pitches
        WHERE game_pk = c.game_pk
          AND at_bat_number = c.at_bat_index + 1
          AND description IN ('called_strike', 'ball')
          AND plate_x IS NOT NULL
        ORDER BY pitch_number DESC
        LIMIT 1
      ) p ON true
      WHERE ${chalWhereStr}
      ORDER BY c.game_date DESC, c.inning
      LIMIT 500
    `

    const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })
    const [summaryRes, missedRes, zoneRes, gameLogRes, seasonsRes, chalSumRes, chalEvtRes] = await Promise.all([
      q(summarySQL), q(missedSQL), q(zoneSQL), q(gameLogSQL), q(seasonsSQL), q(chalSummarySQL), q(chalEventsSQL),
    ])

    for (const res of [summaryRes, missedRes, zoneRes, gameLogRes, seasonsRes, chalSumRes, chalEvtRes]) {
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    }

    return NextResponse.json({
      summary: summaryRes.data?.[0] || null,
      missedCalls: missedRes.data || [],
      zoneGrid: zoneRes.data || [],
      gameLog: gameLogRes.data || [],
      seasons: (seasonsRes.data || []).map((r: any) => r.season),
      challenges: {
        summary: chalSumRes.data?.[0] || null,
        events: chalEvtRes.data || [],
      },
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
