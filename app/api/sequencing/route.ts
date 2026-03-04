import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { pitcherId, season = 2025, hand, counts } = await req.json()

    const safeId = parseInt(pitcherId)
    if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid pitcher ID' }, { status: 400 })

    const safeSeason = parseInt(season)
    const yearFilter = isNaN(safeSeason) ? '' : `AND a.game_year = ${safeSeason}`
    const yearFilterSimple = isNaN(safeSeason) ? '' : `AND game_year = ${safeSeason}`

    const handFilter = hand && hand !== 'All' ? `AND a.stand = '${hand === 'L' ? 'L' : 'R'}'` : ''
    const handFilterSimple = hand && hand !== 'All' ? `AND stand = '${hand === 'L' ? 'L' : 'R'}'` : ''

    // Count filter: array of count strings like ["0-0", "0-1", "1-2"]
    let countFilter = ''
    let countFilterSimple = ''
    if (counts && Array.isArray(counts) && counts.length > 0) {
      const pairs = counts.map((c: string) => {
        const [b, s] = c.split('-').map(Number)
        return `(a.balls = ${b} AND a.strikes = ${s})`
      }).join(' OR ')
      countFilter = `AND (${pairs})`

      const pairsSimple = counts.map((c: string) => {
        const [b, s] = c.split('-').map(Number)
        return `(balls = ${b} AND strikes = ${s})`
      }).join(' OR ')
      countFilterSimple = `AND (${pairsSimple})`
    }

    const [transitionsRes, arsenalRes] = await Promise.all([
      // 1. Transition matrix
      q(`SELECT a.pitch_name as from_pitch, b.pitch_name as to_pitch,
          COUNT(*) as freq,
          ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (PARTITION BY a.pitch_name), 0), 1) as transition_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE b.description LIKE '%swinging_strike%' OR b.description = 'missed_bunt')
            / NULLIF(COUNT(*) FILTER (WHERE b.description LIKE '%swinging_strike%' OR b.description LIKE '%foul%' OR b.description = 'hit_into_play' OR b.description = 'foul_tip' OR b.description = 'missed_bunt'), 0), 1) as whiff_pct,
          ROUND(AVG(b.estimated_woba_using_speedangle)::numeric, 3) as xwoba
        FROM pitches a
        JOIN pitches b ON a.game_pk = b.game_pk AND a.at_bat_number = b.at_bat_number
          AND b.pitch_number = a.pitch_number + 1
        WHERE a.pitcher = ${safeId} ${yearFilter}
          AND a.pitch_name IS NOT NULL AND b.pitch_name IS NOT NULL
          AND a.pitch_type NOT IN ('PO', 'IN') AND b.pitch_type NOT IN ('PO', 'IN')
          ${handFilter} ${countFilter}
        GROUP BY a.pitch_name, b.pitch_name
        ORDER BY a.pitch_name, freq DESC`),

      // 2. Arsenal summary
      q(`SELECT pitch_name,
          COUNT(*) as pitches,
          ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) as usage_pct,
          ROUND(AVG(release_speed)::numeric, 1) as avg_velo,
          ROUND(100.0 * COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description = 'missed_bunt')
            / NULLIF(COUNT(*) FILTER (WHERE description LIKE '%swinging_strike%' OR description LIKE '%foul%' OR description = 'hit_into_play' OR description = 'foul_tip' OR description = 'missed_bunt'), 0), 1) as whiff_pct
        FROM pitches
        WHERE pitcher = ${safeId} ${yearFilterSimple}
          AND pitch_name IS NOT NULL AND pitch_type NOT IN ('PO', 'IN')
          ${handFilterSimple} ${countFilterSimple}
        GROUP BY pitch_name ORDER BY pitches DESC`),
    ])

    for (const res of [transitionsRes, arsenalRes]) {
      if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 })
    }

    return NextResponse.json({
      transitions: transitionsRes.data || [],
      arsenal: arsenalRes.data || [],
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
