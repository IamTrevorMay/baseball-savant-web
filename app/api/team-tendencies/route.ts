import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, tab = 'pitching', gameType = 'all' } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    const gtMap: Record<string, string> = {
      regular: "AND game_type = 'R'",
      spring: "AND game_type = 'S'",
      postseason: "AND game_type IN ('D','L','W','F','P')",
    }
    const gtFilter = gtMap[gameType] || ''

    const yearFilter = `game_year = ${safeSeason} AND pitch_type NOT IN ('PO', 'IN') ${gtFilter}`

    if (tab === 'bullpen') {
      const { data, error } = await q(`
        SELECT CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END as team,
          COUNT(DISTINCT game_pk) as games,
          COUNT(DISTINCT pitcher) as unique_pitchers,
          ROUND(COUNT(DISTINCT pitcher)::numeric / NULLIF(COUNT(DISTINCT game_pk), 0), 1) as pitchers_per_game,
          COUNT(*) as pitches,
          ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
          ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt')
            / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1) as whiff_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
          ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba
        FROM pitches
        WHERE ${yearFilter} AND inning >= 6
        GROUP BY 1 ORDER BY whiff_pct DESC
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    if (tab === 'platoon') {
      const teamExpr = tab === 'platoon'
        ? "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
        : "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"

      const { data, error } = await q(`
        SELECT ${teamExpr} as team, p_throws,
          COUNT(*) as pitches,
          COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
            / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt')
            / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1) as whiff_pct,
          ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
          ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ba,
          ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric
            / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as slg
        FROM pitches
        WHERE ${yearFilter}
        GROUP BY 1, p_throws ORDER BY team, p_throws
      `)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ rows: data || [] })
    }

    // Pitching or Hitting tab — use team expression
    const isPitching = tab === 'pitching'
    const teamExpr = isPitching
      ? "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
      : "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"

    const metricsSQL = isPitching
      ? `COUNT(*) as pitches,
         COUNT(DISTINCT game_pk) as games,
         COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
         ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
         ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt')
           / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1) as whiff_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
         ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
         ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'called_strike')
           / NULLIF(COUNT(*), 0), 1) as csw_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9)
           / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1) as zone_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'missed_bunt'))
           / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1) as chase_pct`
      : `COUNT(*) as pitches,
         COUNT(DISTINCT game_pk) as games,
         COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
         ROUND(AVG(launch_speed)::numeric, 1) as avg_ev,
         ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
           / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ba,
         ROUND((COUNT(*) FILTER (WHERE events = 'single') + 2 * COUNT(*) FILTER (WHERE events = 'double') + 3 * COUNT(*) FILTER (WHERE events = 'triple') + 4 * COUNT(*) FILTER (WHERE events = 'home_run'))::numeric
           / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as slg,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
           / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct,
         ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba,
         ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95)
           / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1) as hard_hit_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed_angle::text = '6')
           / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0), 1) as barrel_pct`

    const sortCol = isPitching ? 'avg_xwoba' : 'avg_xwoba'
    const sortDir = isPitching ? 'ASC' : 'DESC'

    const { data, error } = await q(`
      SELECT ${teamExpr} as team, ${metricsSQL}
      FROM pitches WHERE ${yearFilter}
      GROUP BY 1 ORDER BY ${sortCol} ${sortDir}
    `)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
