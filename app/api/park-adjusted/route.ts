import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { PARK_FACTORS } from '@/lib/constants-data'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, category = 'pitching', minPitches = 500, minPA = 0 } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    const isPitching = category === 'pitching'
    const playerCol = isPitching ? 'pitcher' : 'batter'
    const teamExpr = isPitching
      ? "CASE WHEN inning_topbot = 'Top' THEN home_team ELSE away_team END"
      : "CASE WHEN inning_topbot = 'Top' THEN away_team ELSE home_team END"

    const mp = Math.max(parseInt(String(minPitches)) || 0, 0)
    const mpa = Math.max(parseInt(String(minPA)) || 0, 0)
    const havingParts: string[] = []
    if (mp > 0) havingParts.push(`COUNT(*) >= ${mp}`)
    if (mpa > 0) havingParts.push(`COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) >= ${mpa}`)
    const having = havingParts.length > 0 ? `HAVING ${havingParts.join(' AND ')}` : ''

    const { data, error } = await q(`
      SELECT p.${playerCol} as player_id, pl.name as player_name,
        MODE() WITHIN GROUP (ORDER BY ${teamExpr}) as team,
        COUNT(*) as pitches,
        COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END) as pa,
        ROUND(AVG(estimated_woba_using_speedangle)::numeric, 3) as xwoba,
        ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'home_run')
          / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as hr_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE events LIKE '%strikeout%')
          / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as k_pct,
        ROUND(100.0 * COUNT(*) FILTER (WHERE events = 'walk')
          / NULLIF(COUNT(DISTINCT CASE WHEN events IS NOT NULL THEN game_pk::bigint * 10000 + at_bat_number END), 0), 1) as bb_pct
      FROM pitches p
      JOIN players pl ON pl.id = p.${playerCol}
      WHERE game_year = ${safeSeason} AND pitch_type NOT IN ('PO', 'IN')
      GROUP BY p.${playerCol}, pl.name
      ${having}
      ORDER BY xwoba ${isPitching ? 'ASC' : 'DESC'} NULLS LAST
      LIMIT 300
    `)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Apply park factor adjustments server-side
    const rows = (data || []).map((row: any) => {
      const pf = PARK_FACTORS[row.team]
      if (!pf) return { ...row, adj_xwoba: row.xwoba, adj_hr_pct: row.hr_pct, adj_k_pct: row.k_pct, adj_bb_pct: row.bb_pct, park_factor: 100 }

      return {
        ...row,
        park_factor: pf.basic,
        adj_xwoba: row.xwoba != null ? Math.round(row.xwoba * (100 / pf.basic) * 1000) / 1000 : null,
        adj_hr_pct: row.hr_pct != null ? Math.round(row.hr_pct * (100 / pf.pf_hr) * 10) / 10 : null,
        adj_k_pct: row.k_pct != null ? Math.round(row.k_pct * (100 / pf.pf_so) * 10) / 10 : null,
        adj_bb_pct: row.bb_pct != null ? Math.round(row.bb_pct * (100 / pf.pf_bb) * 10) / 10 : null,
      }
    })

    return NextResponse.json({ rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
