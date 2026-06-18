import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

// Serves the Savant swing-timing/miss-distance bat-tracking leaderboard from the
// daily snapshot table (most-recent snapshot per player via the _latest view).
// See lib/syncBatTracking.ts + scripts/create-bat-tracking-swing-miss.sql.

export interface BatTrackingRow {
  player_id: number
  player_name: string
  bat_side: string | null
  team_name: string | null
  pitch_type: string
  miss_distance: number | null
  n_swings: number | null
  whiff_rate: number | null
  competitive_percent: number | null
  flawed_percent: number | null
  perfect_percent: number | null
  tied_up_percent: number | null
  avg_x_tied_up: number | null
  centered_percent: number | null
  flailed_percent: number | null
  avg_x_flail: number | null
  early_percent: number | null
  avg_y_early: number | null
  on_time_percent: number | null
  late_percent: number | null
  avg_y_late: number | null
  over_percent: number | null
  avg_z_over: number | null
  lined_up_percent: number | null
  under_percent: number | null
  avg_z_under: number | null
}

// Canonical pitch-type display order (subset present depends on data).
const PITCH_ORDER = ['FF', 'SI', 'FC', 'SL', 'ST', 'CU', 'KC', 'SV', 'CH', 'FS', 'FO', 'SC', 'KN']

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const type = sp.get('type') === 'batter' ? 'batter' : 'pitcher'
  const season = parseInt(sp.get('season') || '2026')
  const pitchType = (sp.get('pitchType') || 'ALL').toUpperCase()
  const minSwings = Math.max(0, parseInt(sp.get('minSwings') || '50') || 0)

  if (season < 2023 || season > 2026) {
    return NextResponse.json({ error: 'Invalid season (bat tracking is 2023+)' }, { status: 400 })
  }

  const cols =
    'player_id,player_name,bat_side,team_name,pitch_type,miss_distance,n_swings,whiff_rate,' +
    'competitive_percent,flawed_percent,perfect_percent,tied_up_percent,avg_x_tied_up,centered_percent,' +
    'flailed_percent,avg_x_flail,early_percent,avg_y_early,on_time_percent,late_percent,avg_y_late,' +
    'over_percent,avg_z_over,lined_up_percent,under_percent,avg_z_under,snapshot_date'

  // Rows for the selected pitch type
  const { data: rows, error } = await supabase
    .from('bat_tracking_swing_miss_latest')
    .select(cols)
    .eq('player_type', type)
    .eq('season', season)
    .eq('pitch_type', pitchType)
    .gte('n_swings', minSwings)
    .order('miss_distance', { ascending: false, nullsFirst: false })
    .limit(1000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Distinct pitch types available for the selector (excludes ALL), canonical order
  const { data: ptRows } = await supabase
    .from('bat_tracking_swing_miss_latest')
    .select('pitch_type')
    .eq('player_type', type)
    .eq('season', season)
    .neq('pitch_type', 'ALL')

  const present = new Set((ptRows || []).map((r: any) => r.pitch_type))
  const pitchTypes = PITCH_ORDER.filter(pt => present.has(pt))
    .concat([...present].filter(pt => !PITCH_ORDER.includes(pt)).sort())

  const latestDate = (rows && rows[0] && (rows[0] as any).snapshot_date) || null

  return NextResponse.json(
    { type, season, pitchType, minSwings, latestDate, pitchTypes, rows: rows || [] },
    { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' } },
  )
}
