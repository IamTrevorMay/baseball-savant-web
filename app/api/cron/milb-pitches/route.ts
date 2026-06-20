import { NextRequest, NextResponse } from 'next/server'
import { syncMilbPitches } from '@/app/api/update/milb/route'
import { trackCronRun } from '@/lib/cronTracker'
import { ymdInTimeZone, addDaysToYmd } from '@/lib/dateTz'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type based on current month (ET calendar; mirrors MLB cron)
  const today = ymdInTimeZone() // YYYY-MM-DD in America/New_York
  const month = Number(today.slice(5, 7))
  let gameType: string
  if (month >= 2 && month <= 3) gameType = 'S'
  else if (month >= 10 && month <= 11) gameType = 'P'
  else gameType = 'R'

  // Sync last 3 days (mirrors MLB cron lookback window)
  const end = today
  const start = addDaysToYmd(today, -3)

  try {
    const payload = await trackCronRun('milb-pitches', async () => {
      const result = await syncMilbPitches(start, end, gameType)
      const summary = {
        gameType,
        gamesProcessed: (result as any)?.gamesProcessed,
        totalRows: (result as any)?.totalRows,
        errors: Array.isArray((result as any)?.errors) ? (result as any).errors.length : undefined,
      }
      return {
        result: { ok: true as const, gameType, start, end, ...result },
        counts: summary,
      }
    })
    return NextResponse.json(payload)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
