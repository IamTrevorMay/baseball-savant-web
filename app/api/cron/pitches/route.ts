import { NextRequest, NextResponse } from 'next/server'
import { syncPitches } from '@/app/api/update/route'
import { invalidateBySource, purgeExpired } from '@/lib/queryCache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trackCronRun } from '@/lib/cronTracker'
import { syncBatTrackingSwingMiss } from '@/lib/syncBatTracking'
import { ymdInTimeZone, addDaysToYmd } from '@/lib/dateTz'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type(s) based on current month (ET calendar, not UTC)
  const today = ymdInTimeZone() // YYYY-MM-DD in America/New_York
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const gameTypes: string[] = []
  if (month >= 2 && month <= 3) gameTypes.push('S')
  if (month === 3 || (month >= 4 && month <= 9)) gameTypes.push('R')
  if (month >= 10 && month <= 11) gameTypes.push('P')
  if (gameTypes.length === 0) gameTypes.push('R')

  // Sync last 3 days (covers delayed Savant uploads)
  const end = today
  const start = addDaysToYmd(today, -3)

  try {
    const result = await trackCronRun('pitches', async () => {
      const results: Record<string, any> = {}
      for (const gt of gameTypes) {
        results[gt] = await syncPitches(start, end, gt)
      }

      // Check total rows inserted across game types. If 0, skip downstream steps.
      const totalInserted = Object.values(results).reduce((sum: number, r: any) => sum + (r?.inserted ?? r?.count ?? 0), 0)
      const skipDownstream = totalInserted === 0

      // Recompute Triton + Deception metrics for each active game type
      const computeResults: Record<string, any> = {}
      if (!skipDownstream) {
        for (const gt of gameTypes) {
          try {
            const [tritonRes, deceptionRes] = await Promise.all([
              fetch(`${SITE_URL}/api/compute-triton?year=${year}&gameType=${gt}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
              }),
              fetch(`${SITE_URL}/api/compute-deception?year=${year}&gameType=${gt}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
              }),
            ])
            computeResults[gt] = {
              triton: await tritonRes.json(),
              deception: await deceptionRes.json(),
            }
          } catch (e: any) {
            computeResults[gt] = { error: e.message }
          }
        }
      }

      // Dependency gate: skip league_averages + downstream if ALL game types failed compute
      const allComputeFailed = !skipDownstream &&
        Object.values(computeResults).every((r: any) => r.error)

      // Refresh league_averages for the current season (covers MLB + MiLB).
      // Idempotent: deletes and reinserts rows for this season.
      let leagueAveragesResult: { ok: true } | { error: string } | { skipped: string }
      if (skipDownstream) {
        leagueAveragesResult = { skipped: 'no new pitches' }
      } else if (allComputeFailed) {
        leagueAveragesResult = { skipped: 'all compute steps failed' }
        console.warn('[cron/pitches] Skipping league_averages: all compute steps failed')
      } else {
        try {
          const { error } = await supabaseAdmin.rpc('refresh_league_averages', { p_season: year })
          leagueAveragesResult = error ? { error: error.message } : { ok: true }
        } catch (e: any) {
          leagueAveragesResult = { error: e.message }
        }
      }

      // Refresh league_percentiles (empirical breakpoints) after averages.
      let leaguePercentilesResult: { ok: true } | { error: string } | { skipped: string }
      if (skipDownstream || allComputeFailed) {
        leaguePercentilesResult = { skipped: skipDownstream ? 'no new pitches' : 'all compute steps failed' }
      } else {
        try {
          const { error } = await supabaseAdmin.rpc('refresh_league_percentiles', { p_season: year })
          leaguePercentilesResult = error ? { error: error.message } : { ok: true }
        } catch (e: any) {
          leaguePercentilesResult = { error: e.message }
        }
      }

      // Refresh materialized views (pre-aggregated stats for fast API routes).
      let materializedViewsResult: { ok: true } | { error: string } | { skipped: string }
      if (skipDownstream || allComputeFailed) {
        materializedViewsResult = { skipped: skipDownstream ? 'no new pitches' : 'all compute steps failed' }
      } else {
        try {
          const { error } = await supabaseAdmin.rpc('refresh_materialized_views')
          materializedViewsResult = error ? { error: error.message } : { ok: true }

          // Track MV freshness timestamp
          if (!error) {
            await supabaseAdmin
              .from('system_metadata')
              .upsert({
                key: 'mv_last_refreshed',
                value: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'key' })
              .then(() => {}, () => {})
          }
        } catch (e: any) {
          materializedViewsResult = { error: e.message }
        }
      }

      // Snapshot the Savant swing-timing/miss-distance bat-tracking leaderboard.
      // Season-cumulative with no date slicing, so we snapshot it daily regardless of
      // whether new pitches landed (it refreshes on Savant's side independently).
      let batTrackingResult: Awaited<ReturnType<typeof syncBatTrackingSwingMiss>> | { error: string }
      try {
        batTrackingResult = await syncBatTrackingSwingMiss(year, today)
      } catch (e: any) {
        batTrackingResult = { error: e.message }
      }

      // Invalidate query caches (always purge expired; only invalidate sources if new data)
      await Promise.all([
        skipDownstream ? Promise.resolve() : invalidateBySource('pitches'),
        purgeExpired(),
      ]).catch(() => {})

      const payload = {
        ok: true as const,
        gameTypes,
        start,
        end,
        totalInserted,
        skippedDownstream: skipDownstream,
        results,
        computeResults,
        leagueAverages: leagueAveragesResult,
        leaguePercentiles: leaguePercentilesResult,
        materializedViews: materializedViewsResult,
        batTracking: batTrackingResult,
      }

      return { result: payload, counts: { gameTypes, results, leagueAverages: leagueAveragesResult, leaguePercentiles: leaguePercentilesResult, materializedViews: materializedViewsResult, batTracking: batTrackingResult } }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
