/**
 * Backfill player_season_stats from MLB Stats API.
 * Run: npx tsx scripts/backfill-player-stats.ts [startYear] [endYear]
 *
 * Defaults to current year only if no args given.
 * Rate-limited: 500ms between MLB API requests.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Parse .env.local manually
const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf-8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  let val = trimmed.slice(eqIdx + 1)
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = val
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(120000) })
    }
  }
)

const q = (sql: string) => supabase.rpc('run_query', { query_text: sql.trim() })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function backfillYear(year: number) {
  console.log(`\n=== Backfilling ${year} ===`)

  // Get all unique pitcher IDs for the season
  const { data: pitcherRows } = await q(
    `SELECT DISTINCT pitcher FROM pitches WHERE game_year = ${year} AND game_type = 'R'`
  )
  const pitcherIds = (pitcherRows || []).map((r: any) => r.pitcher).filter(Boolean) as number[]
  console.log(`  ${pitcherIds.length} pitchers`)

  // Get all unique batter IDs for the season
  const { data: batterRows } = await q(
    `SELECT DISTINCT batter FROM pitches WHERE game_year = ${year} AND game_type = 'R'`
  )
  const batterIds = (batterRows || []).map((r: any) => r.batter).filter(Boolean) as number[]
  console.log(`  ${batterIds.length} batters`)

  let pitchingUpserted = 0
  let hittingUpserted = 0

  // Fetch pitching stats in batches of 50
  for (let i = 0; i < pitcherIds.length; i += 50) {
    const batch = pitcherIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=stats(group=[pitching],type=[season],season=${year})`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!resp.ok) { console.log(`  Pitching batch ${i} failed: ${resp.status}`); continue }

      const data = await resp.json()
      const rows: any[] = []

      for (const person of data.people || []) {
        const stat = person.stats?.[0]?.splits?.[0]?.stat
        if (!stat) continue
        rows.push({
          player_id: person.id,
          season: year,
          stat_group: 'pitching',
          era: stat.era != null ? parseFloat(stat.era) : null,
          wins: stat.wins ?? null,
          losses: stat.losses ?? null,
          saves: stat.saves ?? null,
          holds: stat.holds ?? null,
          innings_pitched: stat.inningsPitched != null ? parseFloat(stat.inningsPitched) : null,
          earned_runs: stat.earnedRuns ?? null,
          runs: stat.runs ?? null,
          rbi: null,
          stolen_bases: null,
          updated_at: new Date().toISOString(),
        })
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from('player_season_stats')
          .upsert(rows, { onConflict: 'player_id,season,stat_group' })
        if (error) console.log(`  Pitching upsert error batch ${i}:`, error.message)
        else pitchingUpserted += rows.length
      }
    } catch (e: any) {
      console.log(`  Pitching batch ${i} error:`, e.message)
    }
    await sleep(500)
  }

  // Fetch hitting stats in batches of 50
  for (let i = 0; i < batterIds.length; i += 50) {
    const batch = batterIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(
        `https://statsapi.mlb.com/api/v1/people?personIds=${ids}&hydrate=stats(group=[hitting],type=[season],season=${year})`,
        { signal: AbortSignal.timeout(15000) }
      )
      if (!resp.ok) { console.log(`  Hitting batch ${i} failed: ${resp.status}`); continue }

      const data = await resp.json()
      const rows: any[] = []

      for (const person of data.people || []) {
        const stat = person.stats?.[0]?.splits?.[0]?.stat
        if (!stat) continue
        rows.push({
          player_id: person.id,
          season: year,
          stat_group: 'hitting',
          era: null,
          wins: null,
          losses: null,
          saves: null,
          holds: null,
          innings_pitched: null,
          earned_runs: null,
          runs: stat.runs ?? null,
          rbi: stat.rbi ?? null,
          stolen_bases: stat.stolenBases ?? null,
          updated_at: new Date().toISOString(),
        })
      }

      if (rows.length > 0) {
        const { error } = await supabase
          .from('player_season_stats')
          .upsert(rows, { onConflict: 'player_id,season,stat_group' })
        if (error) console.log(`  Hitting upsert error batch ${i}:`, error.message)
        else hittingUpserted += rows.length
      }
    } catch (e: any) {
      console.log(`  Hitting batch ${i} error:`, e.message)
    }
    await sleep(500)
  }

  console.log(`  Done: ${pitchingUpserted} pitching, ${hittingUpserted} hitting rows upserted`)
}

async function main() {
  const args = process.argv.slice(2)
  const currentYear = new Date().getFullYear()
  const startYear = args[0] ? parseInt(args[0]) : currentYear
  const endYear = args[1] ? parseInt(args[1]) : startYear

  console.log(`Backfilling player_season_stats: ${startYear}–${endYear}`)

  for (let year = startYear; year <= endYear; year++) {
    await backfillYear(year)
  }

  console.log('\nBackfill complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
