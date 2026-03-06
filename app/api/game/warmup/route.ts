import { NextRequest, NextResponse } from 'next/server'
import { SEASON_CONSTANTS } from '@/lib/constants-data'

const YEARS = Object.keys(SEASON_CONSTANTS).map(Number)
const TYPES = ['pitcher', 'hitter'] as const

export async function GET(req: NextRequest) {
  // Simple auth: only allow Vercel cron or requests with correct secret
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const origin = req.nextUrl.origin
  const results: { key: string; ok: boolean }[] = []

  // Fetch all year/type combos in parallel (22 requests)
  const promises = YEARS.flatMap(year =>
    TYPES.map(async type => {
      const key = `${year}-${type}`
      try {
        const res = await fetch(`${origin}/api/game/puzzle?year=${year}&type=${type}`)
        results.push({ key, ok: res.ok })
      } catch {
        results.push({ key, ok: false })
      }
    })
  )

  await Promise.all(promises)

  const ok = results.filter(r => r.ok).length
  const failed = results.filter(r => !r.ok)

  console.log(`Warmup complete: ${ok}/${results.length} puzzles cached`)
  if (failed.length) console.warn('Failed:', failed.map(f => f.key))

  return NextResponse.json({ cached: ok, total: results.length, failed: failed.map(f => f.key) })
}
