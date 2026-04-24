import { NextRequest, NextResponse } from 'next/server'
import { syncPitches } from '@/app/api/update/route'
import { invalidateCache, purgeExpired } from '@/lib/queryCache'
import { supabaseAdmin } from '@/lib/supabase-admin'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine game type(s) based on current month
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
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

    // Recompute Triton + Deception metrics for each active game type
    const computeResults: Record<string, any> = {}
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

    // Refresh league_averages for the current season (covers MLB + MiLB).
    // Idempotent: deletes and reinserts rows for this season.
    let leagueAveragesResult: { ok: true } | { error: string }
    try {
      const { error } = await supabaseAdmin.rpc('refresh_league_averages', { p_season: year })
      leagueAveragesResult = error ? { error: error.message } : { ok: true }
    } catch (e: any) {
      leagueAveragesResult = { error: e.message }
    }

    // Invalidate query caches after fresh data sync
    await Promise.all([
      invalidateCache('trends:'),
      purgeExpired(),
    ]).catch(() => {})

    return NextResponse.json({
      ok: true,
      gameTypes,
      start: fmt(start),
      end: fmt(end),
      results,
      computeResults,
      leagueAverages: leagueAveragesResult,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
