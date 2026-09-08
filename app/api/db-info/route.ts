import { NextResponse } from 'next/server'
import { supabaseAdminLong as supabase } from '@/lib/supabase-admin'

/**
 * GET /api/db-info
 *
 * The pitchers/hitters landing pages' "N pitches through DATE" banner. Was a
 * client-side `run_query` COUNT(*), which the security hardening broke (the
 * RPC is no longer executable by `authenticated`). A full count of ~9M rows
 * is also too heavy to run per pageview, so it is cached hard and uses the
 * long client in case the table is cold.
 */
export const revalidate = 600

export async function GET() {
  const { data, error } = await supabase.rpc('run_query_long', {
    query_text: 'SELECT COUNT(*)::int AS total, MAX(game_date)::text AS last_date FROM pitches',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const row = (data?.[0] || {}) as { total?: number; last_date?: string }
  return NextResponse.json(
    { total: row.total || 0, lastDate: row.last_date || '' },
    { headers: { 'Cache-Control': 'public, max-age=600, stale-while-revalidate=3600' } },
  )
}
