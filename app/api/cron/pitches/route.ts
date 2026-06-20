import { NextRequest, NextResponse } from 'next/server'
import { syncPitches } from '@/app/api/update/route'
import { invalidateBySource, purgeExpired } from '@/lib/queryCache'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trackCronRun } from '@/lib/cronTracker'
import { ymdInTimeZone, addDaysToYmd } from '@/lib/dateTz'
import { reportError } from '@/lib/observability'

export const maxDuration = 300

/**
 * Nightly Statcast ingest. Kept lean: fetch + upsert + Stuff+ only.
 *
 * The heavy downstream (compute-triton/deception, league_averages, percentiles,
 * materialized-view refresh, bat-tracking) was moved to /api/cron/refresh — running
 * it all here pushed this function to ~280s against the 300s ceiling and it was
 * killed ~1 in 3 nights. This run records a `pitches_last_run` marker that the
 * refresh cron (scheduled a few minutes later) reads to decide what to do.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type(s) based on current month (ET calendar, not UTC)
  const today = ymdInTimeZone()
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

      const totalInserted = Object.values(results).reduce(
        (sum: number, r: any) => sum + (r?.inserted ?? r?.count ?? 0),
        0,
      )

      // Hand off to /api/cron/refresh: record what we ingested so it knows whether
      // (and for which game types / season) to run the downstream chain.
      await supabaseAdmin
        .from('system_metadata')
        .upsert(
          {
            key: 'pitches_last_run',
            value: { date: today, year, gameTypes, totalInserted },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'key' },
        )
        .then(() => {}, () => {})

      // Invalidate pitch caches now that new rows landed.
      await Promise.all([
        totalInserted === 0 ? Promise.resolve() : invalidateBySource('pitches'),
        purgeExpired(),
      ]).catch(() => {})

      const payload = { ok: true as const, gameTypes, start, end, totalInserted, results }
      return { result: payload, counts: { gameTypes, totalInserted } }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    reportError(err, { route: 'cron/pitches' })
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
