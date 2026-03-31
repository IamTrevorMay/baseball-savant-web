import { NextRequest, NextResponse } from 'next/server'
import { syncPitches } from '@/app/api/update/route'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type(s) based on current month
  const now = new Date()
  const month = now.getMonth() + 1
  const gameTypes: string[] = []
  if (month >= 2 && month <= 3) gameTypes.push('S')
  if (month === 3 || (month >= 4 && month <= 9)) gameTypes.push('R')
  if (month >= 10 && month <= 11) gameTypes.push('P')
  if (gameTypes.length === 0) gameTypes.push('R')

  // Sync last 3 days (covers delayed Savant uploads)
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - 3)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  try {
    const results: Record<string, any> = {}
    for (const gt of gameTypes) {
      results[gt] = await syncPitches(fmt(start), fmt(end), gt)
    }
    return NextResponse.json({ ok: true, gameTypes, start: fmt(start), end: fmt(end), results })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
