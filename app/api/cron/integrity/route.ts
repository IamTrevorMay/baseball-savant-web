import { NextRequest, NextResponse } from 'next/server'
import { trackCronRun } from '@/lib/cronTracker'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  checkUnknownPlayers,
  checkOrphanedPitchers,
  checkOrphanedBatters,
  checkNewPitchNames,
  checkSeasonConstants,
  checkMaterializedViews,
  checkLeagueAverages,
  checkPitchBaselines,
  type CheckResult,
} from '@/lib/dataIntegrity'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = await trackCronRun('integrity', async () => {
      const year = new Date().getFullYear()

      const settled = await Promise.allSettled([
        checkUnknownPlayers(),
        checkOrphanedPitchers(year),
        checkOrphanedBatters(year),
        checkNewPitchNames(year),
        checkSeasonConstants(year),
        checkMaterializedViews(),
        checkLeagueAverages(year),
        checkPitchBaselines(year),
      ])

      // Collect results, converting rejected promises to fail entries
      const results: CheckResult[] = settled.map((s, i) => {
        if (s.status === 'fulfilled') return s.value
        const names = [
          'unknown_players',
          'orphaned_pitchers',
          'orphaned_batters',
          'new_pitch_names',
          'season_constants',
          'materialized_views',
          'league_averages',
          'pitch_baselines',
        ]
        return {
          check_name: names[i],
          status: 'fail' as const,
          found: 0,
          remediated: 0,
          details: { error: s.reason?.message ?? String(s.reason) },
        }
      })

      // Insert all results into integrity_checks (run_id is set by cronTracker via cron_runs)
      // We get the run_id from the most recent running cron_runs row for 'integrity'
      const { data: runRow } = await supabaseAdmin
        .from('cron_runs')
        .select('id')
        .eq('job', 'integrity')
        .eq('status', 'running')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle() // tolerate 0/>1 running rows (overlapping runs) instead of throwing

      const runId = runRow?.id ?? null

      const rows = results.map((r) => ({
        run_id: runId,
        check_name: r.check_name,
        status: r.status,
        found: r.found,
        remediated: r.remediated,
        details: r.details,
      }))

      if (runId) {
        const { error: insErr } = await supabaseAdmin.from('integrity_checks').insert(rows)
        if (insErr) console.error('[cron/integrity] integrity_checks insert failed:', insErr.message)
      } else {
        console.warn('[cron/integrity] no running cron_runs row found; skipping integrity_checks insert')
      }

      // Build summary counts
      const summary = {
        total: results.length,
        pass: results.filter((r) => r.status === 'pass').length,
        warn: results.filter((r) => r.status === 'warn').length,
        fail: results.filter((r) => r.status === 'fail').length,
        remediated: results.filter((r) => r.status === 'remediated').length,
      }

      return {
        result: { ok: true as const, year, summary, checks: results },
        counts: summary,
      }
    })

    return NextResponse.json(payload)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
