import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COLUMNS = 'game_pk,game_date,game_year,game_type,pitcher,batter,player_name,stand,p_throws,pitch_name,pitch_type,release_speed,effective_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,plate_x,plate_z,zone,type,events,description,bb_type,balls,strikes,outs_when_up,inning,inning_topbot,home_team,away_team,launch_speed,launch_angle,hit_distance_sc,release_extension,arm_angle,release_pos_x,release_pos_z,vx0,vy0,vz0,ax,ay,az,bat_speed,swing_length,estimated_ba_using_speedangle,estimated_woba_using_speedangle,estimated_slg_using_speedangle,woba_value,delta_run_exp,at_bat_number,home_score,away_score,n_thruorder_pitcher,if_fielding_alignment,of_fielding_alignment'

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('id')
  const col = req.nextUrl.searchParams.get('col') || 'pitcher' // 'pitcher' or 'batter'
  
  if (!playerId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (col !== 'pitcher' && col !== 'batter') return NextResponse.json({ error: 'Invalid col' }, { status: 400 })

  try {
    let allRows: any[] = []
    let from = 0
    const pageSize = 1000

    while (true) {
      const { data: rows, error } = await supabase
        .from('pitches')
        .select(COLUMNS)
        .eq(col, Number(playerId))
        .order('game_date', { ascending: false })
        .range(from, from + pageSize - 1)
      
      if (error) {
        console.error('Query error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!rows || rows.length === 0) break
      allRows = allRows.concat(rows)
      if (rows.length < pageSize) break
      from += pageSize
      if (allRows.length >= 50000) break
    }

    return NextResponse.json({ rows: allRows, count: allRows.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
