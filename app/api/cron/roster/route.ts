import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Sync unknown player names from MLB Stats API ────────────────────────────

async function syncPlayers(): Promise<{ updated: number; errors: number; remaining: number }> {
  const { data: unknowns } = await supabaseAdmin
    .from('players').select('id').eq('name', 'Unknown').limit(500)

  if (!unknowns || unknowns.length === 0) {
    return { updated: 0, errors: 0, remaining: 0 }
  }

  let updated = 0
  let errors = 0

  for (let i = 0; i < unknowns.length; i += 10) {
    const batch = unknowns.slice(i, i + 10)
    const results = await Promise.all(
      batch.map(async (p) => {
        try {
          const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${p.id}`)
          if (!res.ok) return null
          const data = await res.json()
          const person = data?.people?.[0]
          if (!person) return null
          return {
            id: p.id,
            name: person.fullName || 'Unknown',
            position: person.primaryPosition?.abbreviation || null,
          }
        } catch { return null }
      })
    )

    for (const r of results) {
      if (r && r.name !== 'Unknown') {
        const parts = r.name.split(' ')
        const formatted = parts.length > 1
          ? `${parts.slice(-1)[0]}, ${parts.slice(0, -1).join(' ')}`
          : r.name

        await supabaseAdmin.from('players').update({
          name: formatted,
          position: r.position,
          updated_at: new Date().toISOString(),
        }).eq('id', r.id)
        updated++
      } else {
        errors++
      }
    }
  }

  const { count } = await supabaseAdmin
    .from('players').select('*', { count: 'exact', head: true }).eq('name', 'Unknown')

  return { updated, errors, remaining: count ?? 0 }
}

// ── Sync umpire assignments for recent games ────────────────────────────────

async function syncUmpires(): Promise<{ inserted: number; errors: number; total_games: number }> {
  const year = new Date().getFullYear()

  const { data: games, error: gErr } = await supabaseAdmin.rpc('run_query', {
    query_text: `SELECT DISTINCT p.game_pk, p.game_date, p.home_team, p.away_team
      FROM pitches p
      LEFT JOIN game_umpires u ON p.game_pk = u.game_pk
      WHERE p.game_year = ${year} AND u.game_pk IS NULL
      ORDER BY p.game_date DESC
      LIMIT 500`,
  })

  if (gErr) throw new Error(`Umpire query failed: ${gErr.message}`)
  if (!games || games.length === 0) return { inserted: 0, errors: 0, total_games: 0 }

  let inserted = 0
  let errors = 0
  const rows: any[] = []

  for (let i = 0; i < games.length; i++) {
    const g = games[i]
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1.1/game/${g.game_pk}/feed/live`,
        { signal: AbortSignal.timeout(10000) }
      )
      if (!resp.ok) { errors++; continue }

      const data = await resp.json()
      const officials = data?.liveData?.boxscore?.officials || []
      const hp = officials.find((o: any) => o.officialType === 'Home Plate')

      if (hp?.official) {
        rows.push({
          game_pk: g.game_pk,
          game_date: g.game_date,
          hp_umpire: hp.official.fullName,
          hp_umpire_id: hp.official.id,
          home_team: g.home_team,
          away_team: g.away_team,
        })
      }
    } catch {
      errors++
    }

    if (rows.length >= 100 || i === games.length - 1) {
      if (rows.length > 0) {
        const { error } = await supabaseAdmin.from('game_umpires').upsert(rows, { onConflict: 'game_pk' })
        if (!error) inserted += rows.length
        rows.length = 0
      }
    }

    if (i > 0 && i % 50 === 0) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  return { inserted, errors, total_games: games.length }
}

// ── Cron handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [players, umpires] = await Promise.all([
      syncPlayers(),
      syncUmpires(),
    ])

    return NextResponse.json({
      ok: true,
      players,
      umpires,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
