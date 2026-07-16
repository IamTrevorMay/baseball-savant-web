/**
 * Backfill player_season_stats from MLB Stats API.
 * Run: npx tsx scripts/backfill-player-stats.ts [startYear] [endYear]
 *
 * Defaults to current year only if no args given.
 * Uses the league-wide season-stats endpoint (one call per season per group),
 * so it works for any season the API covers — inherited runners are complete
 * from 1974 onward. Also inserts players missing from the players table
 * (insert-if-missing; never overwrites existing rows).
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

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

// id → players-table row, collected across every season processed
const seenPlayers = new Map<number, { id: number; name: string; position: string | null }>()

async function fetchSeasonSplits(year: number, group: 'pitching' | 'hitting') {
  const splits: any[] = []
  let offset = 0
  for (;;) {
    const resp = await fetch(
      `https://statsapi.mlb.com/api/v1/stats?stats=season&group=${group}&season=${year}&sportIds=1&playerPool=all&limit=2000&offset=${offset}`,
      { signal: AbortSignal.timeout(30000) }
    )
    if (!resp.ok) throw new Error(`${group} ${year} fetch failed: ${resp.status}`)
    const data = await resp.json()
    const stats = data.stats?.[0]
    const page: any[] = stats?.splits || []
    splits.push(...page)
    const total = stats?.totalSplits ?? splits.length
    if (page.length === 0 || splits.length >= total) return splits
    offset = splits.length
    await sleep(500)
  }
}

function rememberPlayer(split: any) {
  const p = split.player
  if (!p?.id || seenPlayers.has(p.id)) return
  const name = p.lastName && p.firstName ? `${p.lastName}, ${p.firstName}` : p.fullName
  if (!name) return
  seenPlayers.set(p.id, { id: p.id, name, position: split.position?.abbreviation ?? null })
}

async function upsertRows(rows: any[], label: string) {
  let upserted = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const { error } = await supabase
      .from('player_season_stats')
      .upsert(chunk, { onConflict: 'player_id,season,stat_group' })
    if (error) console.log(`  ${label} upsert error at ${i}:`, error.message)
    else upserted += chunk.length
  }
  return upserted
}

async function backfillYear(year: number) {
  console.log(`\n=== Backfilling ${year} ===`)

  const pitching = await fetchSeasonSplits(year, 'pitching')
  const pitchingRows = pitching.map(s => {
    rememberPlayer(s)
    const stat = s.stat || {}
    return {
      player_id: s.player.id,
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
      inherited_runners: stat.inheritedRunners ?? null,
      inherited_runners_scored: stat.inheritedRunnersScored ?? null,
      updated_at: new Date().toISOString(),
    }
  })
  const pitchingUpserted = await upsertRows(pitchingRows, 'pitching')
  await sleep(500)

  const hitting = await fetchSeasonSplits(year, 'hitting')
  const hittingRows = hitting.map(s => {
    rememberPlayer(s)
    const stat = s.stat || {}
    return {
      player_id: s.player.id,
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
      inherited_runners: null,
      inherited_runners_scored: null,
      updated_at: new Date().toISOString(),
    }
  })
  const hittingUpserted = await upsertRows(hittingRows, 'hitting')
  await sleep(500)

  console.log(`  Done: ${pitchingUpserted} pitching, ${hittingUpserted} hitting rows upserted`)
}

async function insertMissingPlayers() {
  const { data, error } = await supabase.rpc('run_query', { query_text: 'SELECT id FROM players' })
  if (error) { console.log('players id fetch failed, skipping name inserts:', error.message); return }
  const existing = new Set((data || []).map((r: any) => r.id))
  const missing = [...seenPlayers.values()].filter(p => !existing.has(p.id))
  console.log(`\nPlayers: ${seenPlayers.size} seen, ${missing.length} missing from players table`)

  let inserted = 0
  for (let i = 0; i < missing.length; i += 500) {
    const chunk = missing.slice(i, i + 500)
    const { error: insErr } = await supabase
      .from('players')
      .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
    if (insErr) console.log(`  players insert error at ${i}:`, insErr.message)
    else inserted += chunk.length
  }
  console.log(`Inserted ${inserted} historical players`)
}

async function main() {
  const args = process.argv.slice(2)
  const currentYear = new Date().getFullYear()
  const startYear = args[0] ? parseInt(args[0]) : currentYear
  const endYear = args[1] ? parseInt(args[1]) : startYear

  console.log(`Backfilling player_season_stats: ${startYear}–${endYear}`)

  for (let year = startYear; year <= endYear; year++) {
    try {
      await backfillYear(year)
    } catch (e: any) {
      console.log(`  ${year} FAILED: ${e.message}`)
    }
  }

  await insertMissingPlayers()

  console.log('\nBackfill complete.')
}

main().catch(e => { console.error(e); process.exit(1) })
