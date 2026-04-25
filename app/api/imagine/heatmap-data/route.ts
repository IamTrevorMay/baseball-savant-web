/**
 * GET /api/imagine/heatmap-data
 *
 * Scope-aware pitch fetcher for the Imagine Heat Maps widget. Supports a
 * player scope (pitcher or batter, by id) and a team scope (pitching or
 * hitting, by team code). Returns the same row shape as /api/player-data
 * — minus per-batter/per-pitcher name JOIN, which isn't needed for
 * heatmap rendering — so consumers can run components/FilterEngine
 * `applyFiltersToData` directly against `rows`.
 *
 * Query params:
 *   scope  = 'player' | 'team'    required
 *   id     = number                required when scope=player
 *   col    = 'pitcher' | 'batter'  required when scope=player
 *   team   = 3-letter code         required when scope=team
 *   side   = 'pitching' | 'hitting' required when scope=team
 *   year   = optional season cap (cuts payload size dramatically)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

// Same field set as /api/player-data so FilterEngine works against either source.
const COLUMNS = 'game_pk,game_date,game_year,game_type,pitcher,batter,player_name,stand,p_throws,pitch_name,pitch_type,release_speed,effective_speed,release_spin_rate,spin_axis,pfx_x,pfx_z,plate_x,plate_z,sz_top,sz_bot,zone,type,events,description,bb_type,balls,strikes,outs_when_up,inning,inning_topbot,home_team,away_team,launch_speed,launch_angle,launch_speed_angle,hit_distance_sc,release_extension,arm_angle,release_pos_x,release_pos_z,vx0,vy0,vz0,ax,ay,az,bat_speed,swing_length,attack_angle,attack_direction,swing_path_tilt,estimated_ba_using_speedangle,estimated_woba_using_speedangle,estimated_slg_using_speedangle,woba_value,delta_run_exp,at_bat_number,pitch_number,home_score,away_score,n_thruorder_pitcher,if_fielding_alignment,of_fielding_alignment,on_1b,on_2b,on_3b,hc_x,hc_y,stuff_plus'

const SAFE_TEAM = /^[A-Z]{2,3}$/

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const scope = sp.get('scope')
  const yearParam = sp.get('year')

  let yearFilter = ''
  if (yearParam) {
    const safeYear = parseInt(yearParam)
    if (isNaN(safeYear)) return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    yearFilter = ` AND p.game_year = ${safeYear}`
  }

  let scopeWhere = ''
  if (scope === 'player') {
    const idRaw = sp.get('id')
    const col = sp.get('col')
    if (!idRaw) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    if (col !== 'pitcher' && col !== 'batter') return NextResponse.json({ error: 'Invalid col' }, { status: 400 })
    const safeId = parseInt(idRaw)
    if (isNaN(safeId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    scopeWhere = `p.${col} = ${safeId}`
  } else if (scope === 'team') {
    const team = sp.get('team') || ''
    const side = sp.get('side')
    if (!SAFE_TEAM.test(team)) return NextResponse.json({ error: 'Invalid team code' }, { status: 400 })
    if (side !== 'pitching' && side !== 'hitting') return NextResponse.json({ error: 'Invalid side' }, { status: 400 })
    // Pitching side: home pitcher throws when inning_topbot = 'Top' (away batting).
    // Hitting side: home batter hits when inning_topbot = 'Bot' (home batting).
    const home = side === 'pitching' ? 'Top' : 'Bot'
    const away = side === 'pitching' ? 'Bot' : 'Top'
    scopeWhere = `((p.home_team = '${team}' AND p.inning_topbot = '${home}') OR (p.away_team = '${team}' AND p.inning_topbot = '${away}'))`
  } else {
    return NextResponse.json({ error: 'scope must be player or team' }, { status: 400 })
  }

  try {
    const prefixed = COLUMNS.split(',').map(c => `p.${c.trim()}`).join(', ')
    const sql = `SELECT ${prefixed} FROM pitches p WHERE ${scopeWhere} AND p.pitch_type NOT IN ('PO', 'IN')${yearFilter} ORDER BY p.game_date DESC LIMIT 50000`
    const { data, error } = await supabase.rpc('run_query_long', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data || [], count: data?.length || 0 }, {
      headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600' },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
