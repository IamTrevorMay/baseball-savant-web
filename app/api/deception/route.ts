import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/deception?pitcher=X&years=2024,2025
 *
 * Raw pitcher_season_deception rows (per pitch_type × year) for one pitcher.
 * Exists because the dashboard components used to run this SELECT through
 * client-side `run_query`, and the security hardening revoked that RPC from
 * the `authenticated` role — the browser calls failed silently and every
 * Deception/Uniqueness cell showed "—". Callers keep doing their own
 * pitch-weighted aggregation; this just gets them the rows.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams

  const pitcher = parseInt(sp.get('pitcher') || '', 10)
  if (isNaN(pitcher)) return NextResponse.json({ error: 'Missing or invalid pitcher' }, { status: 400 })

  const years = (sp.get('years') || '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n))
  const yearClause = years.length ? ` AND game_year IN (${years.join(',')})` : ''

  const sql = `
    SELECT game_year, pitch_type, pitch_name, pitches, unique_score, deception_score,
      z_vaa, z_haa, z_vb, z_hb, z_ext
    FROM pitcher_season_deception
    WHERE pitcher = ${pitcher}${yearClause}
  `
  const { data, error } = await supabase.rpc('run_query', { query_text: sql.trim() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rows: data || [] }, {
    headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' },
  })
}
