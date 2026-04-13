import { NextRequest, NextResponse } from 'next/server'
import { syncMilbPitches } from '@/app/api/update/milb/route'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type based on current month (mirrors MLB cron)
  const now = new Date()
  const month = now.getMonth() + 1
  let gameType: string
  if (month >= 2 && month <= 3) gameType = 'S'
  else if (month >= 10 && month <= 11) gameType = 'P'
  else gameType = 'R'

  // Sync last 3 days (mirrors MLB cron lookback window)
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - 3)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  try {
    const result = await syncMilbPitches(fmt(start), fmt(end), gameType)
    return NextResponse.json({ ok: true, gameType, start: fmt(start), end: fmt(end), ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
