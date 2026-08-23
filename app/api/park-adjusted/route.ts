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

    // A park factor scales run environment relative to league average, so it must be applied
    // to a player's DEVIATION from that average, not to the level of the stat. Scaling the
    // level moved every value toward zero: a league-average .320 xwOBA hitter at Coors
    // (PF 112) rendered .286, as if a neutral hitter in a hitters' park were below average.
    //   adjusted = leagueAvg + (observed - leagueAvg) * (100 / PF)
    //
    // The anchor comes from league_averages, not from the 300 rows this route returns — those
    // are the top of a leaderboard, so their mean is not the league. The `hitter` role carries
    // the league-wide rate for both categories: a pitcher's xwOBA-against and a hitter's xwOBA
    // describe the same events from opposite sides.
    const all = (data || []) as any[]

    const { data: laRows, error: laErr } = await q(`
      SELECT metric, value FROM league_averages
      WHERE season = ${safeSeason} AND level = 'MLB' AND role = 'hitter'
        AND metric IN ('avg_xwoba', 'k_pct', 'bb_pct')
    `)
    if (laErr) return NextResponse.json({ error: laErr.message }, { status: 500 })

    const la = new Map<string, number>(
      ((laRows || []) as any[]).map((r: any) => [r.metric, Number(r.value)]),
    )

    // league_averages carries no hr_pct, so take it from the same population the route reads
    // — the whole season, not the leaderboard slice.
    const { data: hrRows } = await q(`
      SELECT ROUND(100.0 * SUM(home_runs)::numeric / NULLIF(SUM(pa), 0), 3) AS hr_pct
      FROM mv_pitcher_season_stats WHERE game_year = ${safeSeason}
    `)

    const finite = (v: any): number | null => {
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const avgXwoba = finite(la.get('avg_xwoba'))
    const avgKPct  = finite(la.get('k_pct'))
    const avgBbPct = finite(la.get('bb_pct'))
    const avgHrPct = finite(((hrRows || []) as any[])[0]?.hr_pct)

    const adjust = (v: number | null, avg: number | null, pf: number, dp: number): number | null => {
      if (v == null) return null
      if (avg == null || !pf) return v
      const f = Math.pow(10, dp)
      return Math.round((avg + (Number(v) - avg) * (100 / pf)) * f) / f
    }

    const rows = all.map((row: any) => {
      const pf = PARK_FACTORS[row.team]
      if (!pf) return { ...row, adj_xwoba: row.xwoba, adj_hr_pct: row.hr_pct, adj_k_pct: row.k_pct, adj_bb_pct: row.bb_pct, park_factor: 100 }

      return {
        ...row,
        park_factor: pf.basic,
        adj_xwoba: adjust(row.xwoba, avgXwoba, pf.basic, 3),
        adj_hr_pct: adjust(row.hr_pct, avgHrPct, pf.pf_hr, 1),
        adj_k_pct: adjust(row.k_pct, avgKPct, pf.pf_so, 1),
        adj_bb_pct: adjust(row.bb_pct, avgBbPct, pf.pf_bb, 1),
      }
    })

    return NextResponse.json({ rows })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
