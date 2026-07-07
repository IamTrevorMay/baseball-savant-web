import { NextRequest, NextResponse } from 'next/server'
import { invalidateBySource, purgeExpired } from '@/lib/queryCache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trackCronRun } from '@/lib/cronTracker'
import { syncBatTrackingSwingMiss } from '@/lib/syncBatTracking'
import { indexRecentPitchVideos } from '@/lib/pitchVideos'
import { ymdInTimeZone } from '@/lib/dateTz'
import { reportError } from '@/lib/observability'

export const maxDuration = 300

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

/**
 * Downstream of the nightly pitches ingest, split out so neither invocation
 * approaches the 300s Vercel ceiling. Scheduled a few minutes after /api/cron/pitches.
 *
 * Reads the `pitches_last_run` marker the ingest wrote: recomputes Triton/Deception,
 * refreshes league_averages + league_percentiles + materialized views (gated on new
 * data + compute success, same as before), and snapshots the bat-tracking leaderboard
 * (daily regardless, since it's season-cumulative on Savant's side).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await trackCronRun('refresh', async () => {
      const today = ymdInTimeZone()

      const { data: marker } = await supabaseAdmin
        .from('system_metadata')
        .select('value')
        .eq('key', 'pitches_last_run')
        .maybeSingle()

      const info = (marker?.value || {}) as {
        date?: string; year?: number; gameTypes?: string[]; totalInserted?: number
      }
      const year = info.year ?? Number(today.slice(0, 4))
      const gameTypes = info.gameTypes ?? ['R']
      const freshToday = info.date === today
      const totalInserted = freshToday ? (info.totalInserted ?? 0) : 0
      const skipDownstream = totalInserted === 0

      // Bat-tracking snapshot — daily regardless of new pitches (season-cumulative).
      let batTrackingResult: Awaited<ReturnType<typeof syncBatTrackingSwingMiss>> | { error: string }
      try {
        batTrackingResult = await syncBatTrackingSwingMiss(year, today)
      } catch (e: any) {
        batTrackingResult = { error: e.message }
      }

      // Recompute Triton + Deception per active game type.
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
            computeResults[gt] = { triton: await tritonRes.json(), deception: await deceptionRes.json() }
          } catch (e: any) {
            computeResults[gt] = { error: e.message }
          }
        }
      }

      const allComputeFailed = !skipDownstream &&
        Object.values(computeResults).every((r: any) => r.error)

      // Refresh league_averages for the current season (idempotent).
      let leagueAveragesResult: { ok: true } | { error: string } | { skipped: string }
      if (skipDownstream) {
        leagueAveragesResult = { skipped: 'no new pitches' }
      } else if (allComputeFailed) {
        leagueAveragesResult = { skipped: 'all compute steps failed' }
        console.warn('[cron/refresh] Skipping league_averages: all compute steps failed')
      } else {
        try {
          const { error } = await supabaseAdmin.rpc('refresh_league_averages', { p_season: year })
          leagueAveragesResult = error ? { error: error.message } : { ok: true }
        } catch (e: any) {
          leagueAveragesResult = { error: e.message }
        }
      }

      // Refresh league_percentiles after averages.
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

      // Refresh materialized views.
      let materializedViewsResult: { ok: true } | { error: string } | { skipped: string }
      if (skipDownstream || allComputeFailed) {
        materializedViewsResult = { skipped: skipDownstream ? 'no new pitches' : 'all compute steps failed' }
      } else {
        try {
          const { error } = await supabaseAdmin.rpc('refresh_materialized_views')
          materializedViewsResult = error ? { error: error.message } : { ok: true }
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

      // Queue new games' pitch clips for the video archive download worker.
      // Runs regardless of skipDownstream — cheap no-op when nothing is missing,
      // and it self-heals gaps left by a failed prior run.
      let pitchVideosResult: Awaited<ReturnType<typeof indexRecentPitchVideos>> | { error: string }
      try {
        pitchVideosResult = await indexRecentPitchVideos()
      } catch (e: any) {
        pitchVideosResult = { error: e.message }
      }

      // Invalidate query caches (always purge expired; invalidate sources only on new data).
      await Promise.all([
        skipDownstream ? Promise.resolve() : invalidateBySource('pitches'),
        purgeExpired(),
      ]).catch(() => {})

      const payload = {
        ok: true as const,
        freshToday,
        totalInserted,
        skippedDownstream: skipDownstream,
        gameTypes,
        computeResults,
        leagueAverages: leagueAveragesResult,
        leaguePercentiles: leaguePercentilesResult,
        materializedViews: materializedViewsResult,
        batTracking: batTrackingResult,
        pitchVideos: pitchVideosResult,
      }
      return {
        result: payload,
        counts: {
          gameTypes, totalInserted,
          leagueAverages: leagueAveragesResult,
          leaguePercentiles: leaguePercentilesResult,
          materializedViews: materializedViewsResult,
          batTracking: batTrackingResult,
          pitchVideos: pitchVideosResult,
        },
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    reportError(err, { route: 'cron/refresh' })
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
