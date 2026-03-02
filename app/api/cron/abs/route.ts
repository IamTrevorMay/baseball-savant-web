import { NextRequest, NextResponse } from 'next/server'
import { syncData } from '@/app/api/abs/route'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type based on current month
  const month = new Date().getMonth() + 1 // 1-indexed
  let gameType: 'S' | 'R' | 'P'
  if (month >= 2 && month <= 3) gameType = 'S'
  else if (month >= 10 && month <= 11) gameType = 'P'
  else gameType = 'R'

  const year = new Date().getFullYear()

  try {
    const result = await syncData(year, gameType, 'MLB')
    return NextResponse.json({ ok: true, year, gameType, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
