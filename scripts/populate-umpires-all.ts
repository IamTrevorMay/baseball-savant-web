/**
 * Populate game_umpires for all years 2015-2025.
 * Uses Supabase run_query RPC (works with anon key) + MLB Stats API.
 *
 * Usage: npx tsx scripts/populate-umpires-all.ts
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually
const envFile = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env: Record<string, string> = {}
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) env[m[1].trim()] = m[2].trim()
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })

async function populateYear(year: number) {
  console.log(`\n=== Processing ${year} ===`)

  // Get games missing umpire data
  const { data: games, error: gErr } = await q(`
    SELECT DISTINCT p.game_pk, MIN(p.game_date)::text as game_date,
           MIN(p.home_team) as home_team, MIN(p.away_team) as away_team
    FROM pitches p
    LEFT JOIN game_umpires u ON p.game_pk = u.game_pk
    WHERE p.game_year = ${year} AND u.game_pk IS NULL
    GROUP BY p.game_pk
    ORDER BY game_date
  `)

  if (gErr) {
    console.error(`  Error fetching games: ${gErr.message}`)
    return
  }
  if (!games || games.length === 0) {
    console.log(`  No new games to process`)
    return
  }
  console.log(`  ${games.length} games to process`)

  let inserted = 0
  let errors = 0
  let rows: any[] = []

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

    // Insert in batches of 200 via Supabase client upsert
    if (rows.length >= 200 || i === games.length - 1) {
      if (rows.length > 0) {
        const { error } = await supabase.from('game_umpires').upsert(rows, { onConflict: 'game_pk' })
        if (error) {
          console.error(`  Batch insert error: ${error.message}`)
        } else {
          inserted += rows.length
        }
        rows = []
      }
    }

    // Progress every 100
    if (i > 0 && i % 100 === 0) {
      console.log(`  ${i}/${games.length} (${inserted} inserted, ${errors} errors)`)
    }

    // Small delay every 50 requests
    if (i > 0 && i % 50 === 0) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`  Done: ${inserted} inserted, ${errors} errors out of ${games.length} games`)
}

async function main() {
  const years = [2025, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015]
  for (const year of years) {
    await populateYear(year)
  }
  console.log('\n=== All years complete ===')
}

main().catch(console.error)
