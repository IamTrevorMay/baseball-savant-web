import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

export async function POST(req: NextRequest) {
  try {
    const { pitcherId, season = 2025, hand } = await req.json()

    const safeId = parseInt(pitcherId)
    if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid pitcher ID' }, { status: 400 })

    const safeSeason = parseInt(season)
    const yearFilter = isNaN(safeSeason) ? '' : `AND p.game_year = ${safeSeason}`
    const handFilter = hand && hand !== 'All' ? `AND p.stand = '${hand === 'L' ? 'L' : 'R'}'` : ''

    const { data, error } = await q(`
      SELECT
        p.game_pk, p.at_bat_number, p.game_date, p.pitch_number,
        p.pitch_name, p.pitch_type,
        p.release_speed, p.plate_x, p.plate_z,
        p.description, p.events, p.balls, p.strikes,
        p.stand, p.inning, p.inning_topbot,
        p.batter,
        pl.player_name as batter_name,
        p.vx0, p.vy0, p.vz0, p.ax, p.ay, p.az,
        p.release_pos_x, p.release_pos_z, p.release_extension
      FROM pitches p
      JOIN players pl ON pl.id = p.batter
      WHERE p.pitcher = ${safeId}
        ${yearFilter}
        ${handFilter}
        AND p.pitch_type NOT IN ('PO', 'IN')
        AND p.vx0 IS NOT NULL
      ORDER BY p.game_date DESC, p.game_pk, p.at_bat_number, p.pitch_number
      LIMIT 5000
    `)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ pitches: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
