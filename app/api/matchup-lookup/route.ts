import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { METRICS } from '@/lib/reportMetrics'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { pitcherId, batterId, season } = await req.json()

    const safePitcher = parseInt(pitcherId)
    const safeBatter = parseInt(batterId)
    if (isNaN(safePitcher) || isNaN(safeBatter)) {
      return NextResponse.json({ error: 'Invalid player IDs' }, { status: 400 })
    }

    const seasonClause = season && season !== 'all' ? `AND game_year = ${parseInt(season)}` : ''
    const matchWhere = `pitcher = ${safePitcher} AND batter = ${safeBatter} AND pitch_type NOT IN ('PO', 'IN') ${seasonClause}`

    // 4 parallel queries
    const [summaryRes, breakdownRes, locationsRes, namesRes] = await Promise.all([
      // 1. Summary stats
      q(`SELECT
        ${METRICS.pa} as pa,
        ${METRICS.ba} as ba,
        ${METRICS.obp} as obp,
        ${METRICS.slg} as slg,
        ${METRICS.k_pct} as k_pct,
        ${METRICS.bb_pct} as bb_pct,
        COUNT(*) as pitches
      FROM pitches WHERE ${matchWhere}`),

      // 2. Pitch-type breakdown
      q(`SELECT pitch_name,
        COUNT(*) as pitches,
        ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as usage_pct,
        ${METRICS.whiff_pct} as whiff_pct,
        ${METRICS.avg_xwoba} as xwoba,
        ${METRICS.ba} as ba,
        ${METRICS.avg_ev} as avg_ev
      FROM pitches
      WHERE ${matchWhere} AND pitch_name IS NOT NULL
      GROUP BY pitch_name ORDER BY pitches DESC`),

      // 3. Pitch locations
      q(`SELECT plate_x, plate_z, pitch_name, description, events,
        ROUND(release_speed::numeric, 1) as velo
      FROM pitches WHERE ${matchWhere}
        AND plate_x IS NOT NULL AND plate_z IS NOT NULL
      ORDER BY game_date DESC LIMIT 500`),

      // 4. Player names
      q(`SELECT id, name FROM players WHERE id IN (${safePitcher}, ${safeBatter})`),
    ])

    for (const res of [summaryRes, breakdownRes, locationsRes, namesRes]) {
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    }

    const names = namesRes.data || []
    const pitcherName = names.find((n: any) => n.id === safePitcher)?.name || `Pitcher ${safePitcher}`
    const batterName = names.find((n: any) => n.id === safeBatter)?.name || `Batter ${safeBatter}`

    return NextResponse.json({
      summary: summaryRes.data?.[0] || null,
      breakdown: breakdownRes.data || [],
      locations: locationsRes.data || [],
      pitcherName,
      batterName,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
