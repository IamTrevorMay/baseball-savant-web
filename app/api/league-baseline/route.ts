/**
 * GET /api/league-baseline
 *
 * Returns league_averages baseline (value + stddev) for one
 * (season, level, role, metric) combination — used to center heatmap
 * color scales on the league average and extend ±3σ to the extremes.
 * Consumers: Imagine Heat Maps, Reports TileHeatmap, Visualize
 * StrikeZoneHeatmapViz, RCHeatmapRenderer.
 *
 * When `role=pitching` is given, the helper averages the SP and RP rows
 * (heatmap callers don't always classify a single player's role on
 * their own). For `role=hitting` it returns the `hitter` row directly.
 *
 * Heatmap-namespace metric keys are mapped to league_averages metric
 * keys here, with normalization for percentage metrics (whiff_pct,
 * chase_pct are stored 0–100 in league_averages but the heatmap
 * renderer compares against 0–1 fractions).
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Heatmap-namespace metric → league_averages metric. `scale` divides the
// stored value into the 0–1 fraction the heatmap renderers compare against
// (league_averages stores percentages as 0–100).
const HEATMAP_TO_LA_METRIC: Record<string, { metric: string; scale?: number }> = {
  ba:            { metric: 'ba' },
  slg:           { metric: 'slg' },
  woba:          { metric: 'avg_woba' },
  xba:           { metric: 'avg_xba' },
  xwoba:         { metric: 'avg_xwoba' },
  xslg:          { metric: 'avg_xslg' },
  ev:            { metric: 'avg_ev' },
  la:            { metric: 'avg_la' },
  whiff:         { metric: 'whiff_pct', scale: 1 / 100 },
  whiff_pct:     { metric: 'whiff_pct', scale: 1 / 100 },
  chase:         { metric: 'chase_pct', scale: 1 / 100 },
  chase_pct:     { metric: 'chase_pct', scale: 1 / 100 },
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const seasonRaw = sp.get('season')
  const level = sp.get('level') || 'MLB'
  const roleRaw = sp.get('role') || ''
  const metricRaw = sp.get('metric') || ''

  if (!seasonRaw) return NextResponse.json({ error: 'Missing season' }, { status: 400 })
  if (level !== 'MLB' && level !== 'MiLB') return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
  const season = parseInt(seasonRaw)
  if (isNaN(season)) return NextResponse.json({ error: 'Invalid season' }, { status: 400 })

  const mapping = HEATMAP_TO_LA_METRIC[metricRaw]
  if (!mapping) return NextResponse.json({ baseline: null })

  // Resolve roles to query.
  let roles: string[]
  if (roleRaw === 'hitting' || roleRaw === 'hitter') roles = ['hitter']
  else if (roleRaw === 'pitching' || roleRaw === 'pitcher') roles = ['SP', 'RP']
  else if (roleRaw === 'SP' || roleRaw === 'RP') roles = [roleRaw]
  else return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('league_averages')
    .select('value, stddev, n_qualified')
    .eq('season', season)
    .eq('level', level)
    .eq('metric', mapping.metric)
    .in('role', roles)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ baseline: null })

  // Average across roles when multiple (e.g. SP+RP for pitcher scope).
  // n_qualified-weighted so a thin sample (early-season RP) doesn't pull
  // the midpoint as much as a larger SP cohort.
  let totalW = 0, vSum = 0, sSum = 0
  for (const row of data) {
    const v = row.value == null ? null : Number(row.value)
    const s = row.stddev == null ? null : Number(row.stddev)
    const n = Number(row.n_qualified) || 1
    if (v == null) continue
    vSum += v * n
    if (s != null) sSum += s * n
    totalW += n
  }
  if (totalW === 0) return NextResponse.json({ baseline: null })

  const scale = mapping.scale ?? 1
  const value = (vSum / totalW) * scale
  const stddev = (sSum / totalW) * scale

  return NextResponse.json({
    baseline: { value, stddev },
  }, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } })
}
