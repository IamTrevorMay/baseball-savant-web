import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { season } = await req.json().catch(() => ({ season: 2024 }))

    // Get distinct game_pks for this season that we don't already have umpire data for
    const { data: games, error: gErr } = await supabase.rpc('run_query', {
      query_text: `SELECT DISTINCT p.game_pk, p.game_date, p.home_team, p.away_team
        FROM pitches p
        LEFT JOIN game_umpires u ON p.game_pk = u.game_pk
        WHERE p.game_year = ${Number(season)} AND u.game_pk IS NULL
        ORDER BY p.game_date DESC
        LIMIT 3000`,
    })

    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
    if (!games || games.length === 0) return NextResponse.json({ inserted: 0, message: 'No new games to process' })

    let inserted = 0
    let errors = 0
    const rows: any[] = []

    // Process in chunks to avoid rate limiting
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

      // Insert in batches of 100
      if (rows.length >= 100 || i === games.length - 1) {
        if (rows.length > 0) {
          const { error } = await supabase.from('game_umpires').upsert(rows, { onConflict: 'game_pk' })
          if (!error) inserted += rows.length
          rows.length = 0
        }
      }

      // Small delay every 50 requests to avoid rate limiting
      if (i > 0 && i % 50 === 0) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    return NextResponse.json({
      inserted,
      errors,
      total_games: games.length,
      message: `Populated ${inserted} game umpires for ${season}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
