import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { pitcherId, season } = await req.json()

    if (!pitcherId) {
      return NextResponse.json({ error: 'pitcherId required' }, { status: 400 })
    }

    const safePitcher = parseInt(pitcherId)
    const safeSeason = season ? parseInt(season) : 2025
    if (isNaN(safePitcher)) {
      return NextResponse.json({ error: 'Invalid pitcher ID' }, { status: 400 })
    }

    // 1. Game log (per-game aggregation)
    const gameLogSQL = `
      SELECT
        game_date::text as game_date,
        game_pk,
        COUNT(*) as pitches,
        ROUND(AVG(release_speed) FILTER (WHERE pitch_name IN ('4-Seam Fastball','Sinker','Cutter'))::numeric, 1) as avg_fb_velo,
        ROUND(MAX(release_speed) FILTER (WHERE pitch_name IN ('4-Seam Fastball','Sinker','Cutter'))::numeric, 1) as max_fb_velo,
        ROUND(AVG(release_spin_rate)::numeric, 0) as avg_spin,
        MAX(inning) as innings,
        COUNT(DISTINCT at_bat_number) as batters_faced,
        COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike') as csw,
        MAX(CASE WHEN inning >= 7 THEN 1 ELSE 0 END) as late_inning,
        MAX(CASE WHEN on_1b IS NOT NULL OR on_2b IS NOT NULL OR on_3b IS NOT NULL THEN 1 ELSE 0 END) as had_runners,
        MAX(CASE WHEN ABS(home_score - away_score) <= 2 THEN 1 ELSE 0 END) as close_game
      FROM pitches
      WHERE pitcher = ${safePitcher} AND game_year = ${safeSeason}
        AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY game_date, game_pk
      ORDER BY game_date DESC
    `

    // 2. Inning-level fastball velocity (for within-game fade)
    const inningVeloSQL = `
      SELECT
        game_date::text as game_date,
        inning,
        ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
        COUNT(*) as pitches
      FROM pitches
      WHERE pitcher = ${safePitcher} AND game_year = ${safeSeason}
        AND pitch_name IN ('4-Seam Fastball','Sinker','Cutter')
        AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY game_date, inning
      ORDER BY game_date DESC, inning
    `

    // 3. Pitcher name
    const nameSQL = `
      SELECT DISTINCT player_name
      FROM pitches
      WHERE pitcher = ${safePitcher} AND player_name IS NOT NULL
      LIMIT 1
    `

    const q = (sql: string) => supabaseAdmin.rpc('run_query', { query_text: sql.trim() })
    const [gameLogRes, inningVeloRes, nameRes] = await Promise.all([
      q(gameLogSQL), q(inningVeloSQL), q(nameSQL),
    ])

    for (const res of [gameLogRes, inningVeloRes, nameRes]) {
      if (res.error) {
        return NextResponse.json({ error: res.error.message }, { status: 500 })
      }
    }

    const nameRow = (nameRes.data || [])[0]

    return NextResponse.json({
      gameLog: gameLogRes.data || [],
      inningVelo: inningVeloRes.data || [],
      pitcherName: nameRow?.player_name || `Pitcher ${safePitcher}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
