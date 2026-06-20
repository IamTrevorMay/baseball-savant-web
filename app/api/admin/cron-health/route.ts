import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { requireSessionAdmin } from '@/lib/apiAuth'

/**
 * GET /api/admin/cron-health
 * Admin-only. Surfaces the latest run per cron job (status, duration, error) plus
 * recent failures and materialized-view freshness, from the cron_runs table.
 */
export async function GET() {
  const auth = await requireSessionAdmin()
  if (auth instanceof NextResponse) return auth

  // Latest run per job.
  const latestSql = `
    SELECT DISTINCT ON (job)
      job, status, started_at, finished_at, duration_ms, error_message, counts
    FROM cron_runs
    ORDER BY job, started_at DESC
  `.trim()

  // Failures in the last 24h.
  const failuresSql = `
    SELECT job, started_at, error_message
    FROM cron_runs
    WHERE status = 'error' AND started_at > now() - interval '24 hours'
    ORDER BY started_at DESC
    LIMIT 50
  `.trim()

  const [{ data: jobs, error: jobsErr }, { data: failures }] = await Promise.all([
    supabaseAdmin.rpc('run_query', { query_text: latestSql }),
    supabaseAdmin.rpc('run_query', { query_text: failuresSql }),
  ])

  if (jobsErr) {
    return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  }

  // MV freshness marker (written by the pitches cron).
  const { data: meta } = await supabaseAdmin
    .from('system_metadata')
    .select('value, updated_at')
    .eq('key', 'mv_last_refreshed')
    .maybeSingle()

  const now = Date.now()
  const enriched = (jobs || []).map((j: any) => {
    const last = j.finished_at || j.started_at
    const ageMinutes = last ? Math.round((now - new Date(last).getTime()) / 60000) : null
    return { ...j, age_minutes: ageMinutes }
  })

  return NextResponse.json({
    jobs: enriched,
    failures24h: failures || [],
    mvLastRefreshed: meta?.value ?? meta?.updated_at ?? null,
    fetchedAt: new Date().toISOString(),
  })
}
