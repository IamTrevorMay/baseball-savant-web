import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_COLUMNS = 'game_pk,game_date,game_year,game_type,pitcher,batter,player_name,stand,p_throws,pitch_name,pitch_type,release_speed,effective_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,plate_x,plate_z,zone,type,events,description,bb_type,balls,strikes,outs_when_up,inning,inning_topbot,home_team,away_team,launch_speed,launch_angle,hit_distance_sc,release_extension,arm_angle,release_pos_x,release_pos_z,vx0,vy0,vz0,ax,ay,az,bat_speed,swing_length,estimated_ba_using_speedangle,estimated_woba_using_speedangle,estimated_slg_using_speedangle,woba_value,delta_run_exp,at_bat_number,pitch_number,home_score,away_score,n_thruorder_pitcher,if_fielding_alignment,of_fielding_alignment,on_1b,on_2b,on_3b,hc_x,hc_y'

async function getColumnsWithModels(): Promise<string> {
  try {
    const { data: models } = await supabase.from('models').select('column_name').eq('status', 'deployed')
    if (models && models.length > 0) {
      const modelCols = models.map((m: any) => m.column_name).join(',')
      return `${BASE_COLUMNS},${modelCols}`
    }
  } catch {}
  return BASE_COLUMNS
}

export async function GET(req: NextRequest) {
  const playerId = req.nextUrl.searchParams.get('id')
  const col = req.nextUrl.searchParams.get('col') || 'pitcher'

  if (!playerId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (col !== 'pitcher' && col !== 'batter') return NextResponse.json({ error: 'Invalid col' }, { status: 400 })

  const safeId = parseInt(playerId)
  if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  try {
    const COLUMNS = await getColumnsWithModels()
    const sql = `SELECT ${COLUMNS} FROM pitches WHERE ${col} = ${safeId} ORDER BY game_date DESC LIMIT 50000`
    const { data, error } = await supabase.rpc('run_query', { query_text: sql })

    if (error) {
      console.error('Query error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rows: data || [], count: data?.length || 0 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
