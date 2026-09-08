import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/pitch-shapes?pitcher=X&years=2025,2026
 *
 * Per-pitch-type shape averages (velo, spin, axis, movement, release) for the
 * Graphics Pitch Simulation template. Replaces its client-side `run_query`
 * call, which the security hardening revoked from the `authenticated` role.
 * Seasons for the picker come from /api/player-filter-options.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const pitcher = parseInt(sp.get('pitcher') || '', 10)
  if (isNaN(pitcher)) return NextResponse.json({ error: 'Missing or invalid pitcher' }, { status: 400 })

  const years = (sp.get('years') || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n))
  if (years.length === 0) return NextResponse.json({ error: 'Missing or invalid years' }, { status: 400 })

  const sql = `
    SELECT pitch_name,
      AVG(release_speed) AS avg_velo, AVG(release_spin_rate) AS avg_spin,
      AVG(spin_axis) AS avg_axis, AVG(pfx_x) AS avg_hb, AVG(pfx_z) AS avg_ivb,
      AVG(release_pos_x) AS avg_rel_x, AVG(release_pos_z) AS avg_rel_z,
      COUNT(*) AS cnt
    FROM pitches
    WHERE pitcher = ${pitcher} AND game_year IN (${years.join(',')})
      AND pitch_name IS NOT NULL AND pitch_type NOT IN ('PO', 'IN')
    GROUP BY pitch_name
    HAVING COUNT(*) >= 3
    ORDER BY COUNT(*) DESC
  `
  const { data, error } = await supabase.rpc('run_query', { query_text: sql.trim() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data || [] }, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' },
  })
}
