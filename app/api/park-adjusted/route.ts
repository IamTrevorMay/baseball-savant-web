import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'
import { PARK_FACTORS } from '@/lib/constants-data'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { season = 2025, category = 'pitching', minPitches = 500, minPA = 0 } = await req.json()
    const safeSeason = parseInt(season)
    if (isNaN(safeSeason)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

    const isPitching = category === 'pitching'
    const mp = Math.max(parseInt(String(minPitches)) || 0, 0)
    const mpa = Math.max(parseInt(String(minPA)) || 0, 0)

    // Use materialized views for pre-aggregated data (regular season)
    const mvTable = isPitching ? 'mv_pitcher_season_stats' : 'mv_batter_season_stats'
    const filterParts: string[] = []
    if (mp > 0) filterParts.push(`mv.pitches >= ${mp}`)
    if (mpa > 0) filterParts.push(`mv.pa >= ${mpa}`)
    const mvWhere = filterParts.length > 0 ? `AND ${filterParts.join(' AND ')}` : ''

    // pitcher MV has home_runs for hr_pct; batter MV does not
    const hrCol = isPitching
      ? 'ROUND(100.0 * mv.home_runs / NULLIF(mv.pa, 0), 1) as hr_pct,'
      : 'NULL::numeric as hr_pct,'

    const { data, error } = await q(`
      SELECT mv.player_id, pl.name as player_name, mv.team,
        mv.pitches, mv.pa, mv.avg_xwoba as xwoba,
        ${hrCol}
        mv.k_pct, mv.bb_pct
      FROM ${mvTable} mv
      JOIN players pl ON pl.id = mv.player_id
      WHERE mv.game_year = ${safeSeason} ${mvWhere}
      ORDER BY mv.avg_xwoba ${isPitching ? 'ASC' : 'DESC'} NULLS LAST
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
