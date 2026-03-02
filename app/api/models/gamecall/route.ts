import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  try {
    const { pitcherId, batterId, season } = await req.json()

    if (!pitcherId || !batterId) {
      return NextResponse.json({ error: 'pitcherId and batterId required' }, { status: 400 })
    }

    const safePitcher = parseInt(pitcherId)
    const safeBatter = parseInt(batterId)
    const safeSeason = season ? parseInt(season) : 2025
    if (isNaN(safePitcher) || isNaN(safeBatter)) {
      return NextResponse.json({ error: 'Invalid player IDs' }, { status: 400 })
    }

    const seasonFilter = `game_year = ${safeSeason}`

    // 1. Pitcher arsenal
    const arsenalSQL = `
      SELECT
        pitch_name,
        pitch_type,
        COUNT(*) as pitches,
        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as usage_pct,
        ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
        ROUND(AVG(release_spin_rate)::numeric, 0) as avg_spin,
        ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%')
          / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%'
            OR description LIKE '%foul%' OR description = 'hit_into_play'
            OR description = 'foul_tip'), 0), 1) as whiff_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE zone BETWEEN 1 AND 9)
          / NULLIF(COUNT(*) FILTER (WHERE zone IS NOT NULL), 0), 1) as zone_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE zone > 9 AND (description LIKE '%swinging_strike%'
          OR description LIKE '%foul%' OR description = 'hit_into_play'))
          / NULLIF(COUNT(*) FILTER (WHERE zone > 9), 0), 1) as chase_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%'
          OR description = 'called_strike')
          / NULLIF(COUNT(*), 0), 1) as csw_pct,
        ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as avg_xwoba
      FROM pitches
      WHERE pitcher = ${safePitcher} AND ${seasonFilter}
        AND pitch_name IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY pitch_name, pitch_type
      ORDER BY pitches DESC
    `

    // 2. Batter damage zones
    const damageSQL = `
      SELECT zone,
        COUNT(*) as pitches,
        ROUND(AVG(launch_speed)::numeric, 1) as avg_ev,
        ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed >= 95)
          / NULLIF(COUNT(*) FILTER (WHERE launch_speed IS NOT NULL), 0), 1) as hard_hit_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE launch_speed_angle IN ('6'))
          / NULLIF(COUNT(*) FILTER (WHERE launch_speed_angle IS NOT NULL), 0), 1) as barrel_pct,
        ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as xwoba
      FROM pitches
      WHERE batter = ${safeBatter} AND ${seasonFilter}
        AND zone IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY zone
      ORDER BY zone
    `

    // 3. Head-to-head history
    const h2hSQL = `
      SELECT pitch_name,
        COUNT(*) as pitches,
        ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%')
          / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%'
            OR description LIKE '%foul%' OR description = 'hit_into_play'
            OR description = 'foul_tip'), 0), 1) as whiff_pct,
        ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as xwoba,
        ROUND(AVG(launch_speed)::numeric, 1) as avg_ev,
        ROUND(COUNT(*) FILTER (WHERE events IN ('single','double','triple','home_run'))::numeric
          / NULLIF(COUNT(*) FILTER (WHERE events IS NOT NULL
            AND events NOT IN ('walk','hit_by_pitch','sac_fly','sac_bunt','catcher_interf')), 0), 3) as ba
      FROM pitches
      WHERE pitcher = ${safePitcher} AND batter = ${safeBatter}
        AND pitch_name IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY pitch_name
      ORDER BY pitches DESC
    `

    // 4. Pitch transition matrix
    const transitionSQL = `
      SELECT
        a.pitch_name as from_pitch,
        b.pitch_name as to_pitch,
        COUNT(*) as freq,
        ROUND(100.0 * COUNT(*) FILTER (WHERE b.description LIKE '%swinging_strike%')
          / NULLIF(COUNT(*) FILTER (WHERE b.description LIKE '%swinging_strike%'
            OR b.description LIKE '%foul%' OR b.description = 'hit_into_play'
            OR b.description = 'foul_tip'), 0), 1) as whiff_pct,
        ROUND(AVG(b.estimated_woba_using_speedangle)::numeric, 3) as xwoba
      FROM pitches a
      JOIN pitches b
        ON a.game_pk = b.game_pk
        AND a.at_bat_number = b.at_bat_number
        AND b.pitch_number = a.pitch_number + 1
      WHERE a.pitcher = ${safePitcher} AND a.game_year = ${safeSeason}
        AND a.pitch_name IS NOT NULL AND b.pitch_name IS NOT NULL
        AND a.pitch_type NOT IN ('PO', 'IN') AND b.pitch_type NOT IN ('PO', 'IN')
      GROUP BY a.pitch_name, b.pitch_name
      ORDER BY freq DESC
    `

    // 5. Recent at-bat sequences (pitcher vs batter)
    const recentABSQL = `
      SELECT
        game_date::text as game_date,
        game_pk,
        at_bat_number,
        pitch_number,
        pitch_name,
        description,
        balls,
        strikes,
        ROUND(release_speed::numeric, 1) as release_speed
      FROM pitches
      WHERE pitcher = ${safePitcher} AND batter = ${safeBatter} AND ${seasonFilter}
        AND pitch_name IS NOT NULL
        AND pitch_type NOT IN ('PO', 'IN')
      ORDER BY game_date DESC, at_bat_number, pitch_number
    `

    // 6. Player names
    const namesSQL = `
      SELECT player_name, pitcher, batter
      FROM (
        SELECT DISTINCT ON (pitcher) player_name, pitcher, NULL::int as batter
        FROM pitches WHERE pitcher = ${safePitcher} AND player_name IS NOT NULL
        UNION ALL
        SELECT DISTINCT ON (batter) player_name, NULL::int as pitcher, batter
        FROM pitches WHERE batter = ${safeBatter} AND player_name IS NOT NULL
      ) sub
      LIMIT 2
    `

    const q = (sql: string) => supabaseAdmin.rpc('run_query', { query_text: sql.trim() })
    const [arsenalRes, damageRes, h2hRes, transRes, recentRes, namesRes] = await Promise.all([
      q(arsenalSQL), q(damageSQL), q(h2hSQL), q(transitionSQL), q(recentABSQL), q(namesSQL),
    ])

    for (const res of [arsenalRes, damageRes, h2hRes, transRes, recentRes, namesRes]) {
      if (res.error) {
        return NextResponse.json({ error: res.error.message }, { status: 500 })
      }
    }

    const names = namesRes.data || []
    const pitcherRec = names.find((n: any) => n.pitcher === safePitcher)
    const batterRec = names.find((n: any) => n.batter === safeBatter)

    return NextResponse.json({
      arsenal: arsenalRes.data || [],
      batterZones: damageRes.data || [],
      h2h: h2hRes.data || [],
      transitions: transRes.data || [],
      recentABs: recentRes.data || [],
      pitcherName: pitcherRec?.player_name || `Pitcher ${safePitcher}`,
      batterName: batterRec?.player_name || `Batter ${safeBatter}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
