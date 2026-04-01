import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Auth: require CRON_SECRET (production) or allow localhost (dev)
  const authHeader = req.headers.get('authorization')
  const isLocal = req.nextUrl.hostname === 'localhost' || req.nextUrl.hostname === '127.0.0.1'
  if (!isLocal && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get all "Unknown" players that need name resolution
    const { data: unknowns } = await supabase
      .from('players')
      .select('id')
      .eq('name', 'Unknown')
      .limit(3500)

    if (!unknowns || unknowns.length === 0) {
      return NextResponse.json({ message: 'No unknown players to resolve', updated: 0 })
    }

    const ids = unknowns.map((p: any) => p.id) as number[]
    let updated = 0
    let apiErrors = 0
    let notFound = 0

    // Fetch names from MLB Stats API in batches of 50
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50)
      const idsParam = batch.join(',')
      try {
        const resp = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${idsParam}`)
        if (!resp.ok) { apiErrors++; continue }
        const data = await resp.json()

        const foundMap = new Map<number, string>()
        for (const p of data.people || []) {
          const parts = (p.fullName as string).split(' ')
          const formatted = parts.length > 1
            ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
            : p.fullName
          foundMap.set(p.id, formatted)
        }

        // Update each found player
        for (const [id, name] of foundMap) {
          await supabase.from('players').update({ name }).eq('id', id)
          updated++
        }

        notFound += batch.length - foundMap.size
      } catch {
        apiErrors++
      }
    }

    // Refresh materialized views
    await supabase.rpc('refresh_player_summary')
    await supabase.rpc('refresh_batter_summary')

    return NextResponse.json({
      total_unknown: ids.length,
      updated,
      not_found: notFound,
      api_errors: apiErrors,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export const maxDuration = 300
