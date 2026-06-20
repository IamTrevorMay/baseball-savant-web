import { NextRequest, NextResponse } from 'next/server'
import { computeSOSForYears } from '@/app/api/update/route'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { trackCronRun } from '@/lib/cronTracker'
import { ymdInTimeZone } from '@/lib/dateTz'
import { reportError } from '@/lib/observability'

export const maxDuration = 300

/**
 * Weekly Strength-of-Schedule recompute.
 *
 * SOS is a whole-season pitcher×batter recompute — too slow to run nightly inside
 * the pitches ingest (it was a big part of that cron blowing past 300s). SOS shifts
 * slowly, so recompute the current season once a week here instead.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await trackCronRun('sos-weekly', async () => {
      const today = ymdInTimeZone() // YYYY-MM-DD in ET → current season
      const sos = await computeSOSForYears(supabaseAdmin as any, today, today)
      return {
        result: { ok: sos.ok as boolean, season: Number(today.slice(0, 4)), sos },
        counts: { ok: sos.ok, upserted: (sos as any).upserted ?? null },
      }
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    reportError(err, { route: 'cron/sos-weekly' })
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
