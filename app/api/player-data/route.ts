import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

const BASE_COLUMNS = 'game_pk,game_date,game_year,game_type,pitcher,batter,player_name,stand,p_throws,pitch_name,pitch_type,release_speed,effective_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,plate_x,plate_z,sz_top,sz_bot,zone,type,events,description,bb_type,balls,strikes,outs_when_up,inning,inning_topbot,home_team,away_team,launch_speed,launch_angle,launch_speed_angle,hit_distance_sc,release_extension,arm_angle,release_pos_x,release_pos_z,vx0,vy0,vz0,ax,ay,az,bat_speed,swing_length,estimated_ba_using_speedangle,estimated_woba_using_speedangle,estimated_slg_using_speedangle,woba_value,delta_run_exp,at_bat_number,pitch_number,home_score,away_score,n_thruorder_pitcher,if_fielding_alignment,of_fielding_alignment,on_1b,on_2b,on_3b,hc_x,hc_y,stuff_plus'

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
  const yearParam = req.nextUrl.searchParams.get('year')

  if (!playerId) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  if (col !== 'pitcher' && col !== 'batter') return NextResponse.json({ error: 'Invalid col' }, { status: 400 })

  const safeId = parseInt(playerId)
  if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Optional year filter — dramatically reduces rows (50K → ~5K)
  let yearFilter = ''
  if (yearParam) {
    const safeYear = parseInt(yearParam)
    if (isNaN(safeYear)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    yearFilter = ` AND p.game_year = ${safeYear}`
  }

  // Inline JOIN for opposite-side player name (eliminates client-side batch lookups)
  const nameCol = col === 'pitcher' ? 'batter' : 'pitcher'

  try {
    const COLUMNS = await getColumnsWithModels()
    // Prefix columns with p. for the pitches table
    const prefixedColumns = COLUMNS.split(',').map(c => `p.${c.trim()}`).join(', ')
    const sql = `SELECT ${prefixedColumns}, pl.name as ${nameCol}_name FROM pitches p LEFT JOIN players pl ON pl.id = p.${nameCol} WHERE p.${col} = ${safeId} AND p.pitch_type NOT IN ('PO', 'IN')${yearFilter} ORDER BY p.game_date DESC LIMIT 50000`
    const { data, error } = await supabase.rpc('run_query_long', { query_text: sql })

    if (error) {
      console.error('Query error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ rows: data || [], count: data?.length || 0 }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
