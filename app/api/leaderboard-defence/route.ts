import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TABLE_MAP: Record<string, string> = {
  oaa: 'defensive_oaa',
  outfield_oaa: 'defensive_oaa_outfield',
  catch_probability: 'defensive_catch_probability',
  arm_strength: 'defensive_arm_strength',
  run_value: 'defensive_run_value',
  catcher_framing: 'defensive_catcher_framing',
}

// Allowed sort columns per table (to prevent SQL injection)
const ALLOWED_COLUMNS: Record<string, Set<string>> = {
  defensive_oaa: new Set(['player_name', 'team', 'position', 'fielding_runs_prevented', 'outs_above_average', 'oaa_infront', 'oaa_lateral_3b', 'oaa_lateral_1b', 'oaa_behind', 'oaa_rhh', 'oaa_lhh', 'actual_success_rate', 'estimated_success_rate', 'diff_success_rate']),
  defensive_oaa_outfield: new Set(['player_name', 'attempts', 'oaa', 'oaa_back_left', 'oaa_back', 'oaa_back_right', 'oaa_back_all', 'oaa_in_left', 'oaa_in', 'oaa_in_right', 'oaa_in_all']),
  defensive_catch_probability: new Set(['player_name', 'oaa', 'five_star_plays', 'five_star_opps', 'five_star_pct', 'four_star_plays', 'four_star_opps', 'four_star_pct', 'three_star_plays', 'three_star_opps', 'three_star_pct', 'two_star_plays', 'two_star_opps', 'two_star_pct', 'one_star_plays', 'one_star_opps', 'one_star_pct']),
  defensive_arm_strength: new Set(['player_name', 'team', 'position', 'total_throws', 'max_arm_strength', 'arm_1b', 'arm_2b', 'arm_3b', 'arm_ss', 'arm_lf', 'arm_cf', 'arm_rf', 'arm_inf', 'arm_of', 'arm_overall']),
  defensive_run_value: new Set(['player_name', 'team', 'n_teams', 'total_runs', 'inf_of_runs', 'range_runs', 'arm_runs', 'dp_runs', 'catching_runs', 'framing_runs', 'throwing_runs', 'blocking_runs', 'outs_total', 'tot_pa']),
  defensive_catcher_framing: new Set(['player_name', 'team', 'pitches', 'pitches_shadow', 'rv_total', 'pct_total']),
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      season = 2025,
      statSet = 'oaa',
      sortBy = 'outs_above_average',
      sortDir = 'DESC',
      limit = 100,
      offset = 0,
    } = body

    const table = TABLE_MAP[statSet]
    if (!table) {
      return NextResponse.json({ error: `Unknown stat set: ${statSet}` }, { status: 400 })
    }

    const safeSeason = parseInt(String(season))
    const safeLimit = Math.min(Math.max(parseInt(String(limit)), 1), 500)
    const safeOffset = Math.max(parseInt(String(offset)) || 0, 0)
    const safeDir = sortDir === 'ASC' ? 'ASC' : 'DESC'

    // Validate sort column
    const allowed = ALLOWED_COLUMNS[table]
    const safeSortBy = allowed?.has(sortBy) ? sortBy : 'player_name'

    const sql = `
      SELECT * FROM ${table}
      WHERE season = ${safeSeason}
      ORDER BY ${safeSortBy} ${safeDir} NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `.trim()

    const { data, error } = await supabase.rpc('run_query', { query_text: sql })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ rows: data || [], count: (data || []).length })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
