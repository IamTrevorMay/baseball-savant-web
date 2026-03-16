/**
 * WBC Backfill Script
 * Run: npx tsx scripts/backfill-wbc.ts [2023|2026|all]
 *
 * Fetches WBC Statcast data from Baseball Savant and inserts into wbc_pitches table.
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
  // Strip surrounding quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = val
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i <= line.length) {
    if (i === line.length) { fields.push(''); break }
    if (line[i] === '"') {
      let val = ''
      i++
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { val += '"'; i += 2 }
          else { i++; break }
        } else { val += line[i]; i++ }
      }
      fields.push(val)
      if (i < line.length && line[i] === ',') i++
    } else {
      const next = line.indexOf(',', i)
      if (next === -1) { fields.push(line.slice(i)); break }
      fields.push(line.slice(i, next))
      i = next + 1
    }
  }
  return fields
}

async function fetchStatcastForGame(gamePk: number): Promise<any[]> {
  const url = `https://baseballsavant.mlb.com/statcast_search/csv?all=true&game_pk=${gamePk}&type=details`
  const resp = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!resp.ok) throw new Error(`Savant returned ${resp.status} for game ${gamePk}`)

  const csv = (await resp.text()).replace(/^\ufeff/, '')
  if (csv.length < 100) return []

  const lines = csv.split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const numHeaders = headers.length
  const rows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    if (vals.length < numHeaders) continue
    const row: any = {}
    headers.forEach((h, j) => {
      let v: any = vals[j]?.trim() || null
      if (v === '' || v === 'null') v = null
      else if (v && !isNaN(Number(v)) && h !== 'game_date' && h !== 'sv_id') v = Number(v)
      row[h] = v
    })
    if (row.game_pk) rows.push(row)
  }

  rows.forEach(r => {
    delete r.id
    Object.keys(r).forEach(k => { if (k.startsWith('Unnamed')) delete r[k] })
  })

  return rows
}

async function syncPlayers(rows: any[]) {
  const pitcherMap = new Map<number, string>()
  for (const r of rows) {
    if (r.pitcher && r.player_name) pitcherMap.set(r.pitcher, r.player_name)
  }
  const batterIds = [...new Set(rows.map(r => r.batter).filter(Boolean))] as number[]
  const allIds = [...new Set([...pitcherMap.keys(), ...batterIds])]
  if (allIds.length === 0) return

  const { data: existing } = await supabase.from('players').select('id').in('id', allIds)
  const existingSet = new Set((existing || []).map((p: any) => p.id))

  const missingPitchers = [...pitcherMap.entries()]
    .filter(([id]) => !existingSet.has(id))
    .map(([id, name]) => ({ id, name }))

  const missingBatterIds = batterIds.filter(id => !existingSet.has(id) && !pitcherMap.has(id))
  const missingBatters: { id: number; name: string }[] = []

  for (let i = 0; i < missingBatterIds.length; i += 50) {
    const batch = missingBatterIds.slice(i, i + 50)
    try {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}`)
      const data = await resp.json()
      for (const p of data.people || []) {
        missingBatters.push({ id: p.id, name: p.fullName })
      }
    } catch { /* skip */ }
  }

  const toInsert = [...missingPitchers, ...missingBatters]
  if (toInsert.length > 0) {
    await supabase.from('players').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true })
    console.log(`  Synced ${toInsert.length} players`)
  }
}

async function backfillSeason(season: number) {
  const startDate = season === 2023 ? '2023-03-07' : '2026-03-01'
  const endDate = season === 2023 ? '2023-03-22' : '2026-03-25'

  console.log(`\nFetching WBC ${season} schedule (${startDate} to ${endDate})...`)

  const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=51&season=${season}&leagueId=160&startDate=${startDate}&endDate=${endDate}&hydrate=team`
  const schedResp = await fetch(schedUrl)
  const schedData = await schedResp.json()

  const allGames: { gamePk: number; date: string; away: string; home: string }[] = []
  for (const dateEntry of schedData.dates || []) {
    for (const g of dateEntry.games || []) {
      if (g.status?.abstractGameState === 'Final') {
        allGames.push({
          gamePk: g.gamePk,
          date: dateEntry.date,
          away: g.teams?.away?.team?.teamName || '?',
          home: g.teams?.home?.team?.teamName || '?',
        })
      }
    }
  }

  console.log(`Found ${allGames.length} completed games`)

  // Check which are already ingested
  const gamePks = allGames.map(g => g.gamePk)
  const { data: existingGames } = await supabase
    .from('wbc_pitches')
    .select('game_pk')
    .in('game_pk', gamePks)
  const existingSet = new Set((existingGames || []).map((r: any) => r.game_pk))
  const newGames = allGames.filter(g => !existingSet.has(g.gamePk))

  if (newGames.length === 0) {
    console.log('All games already ingested!')
    return
  }

  console.log(`${newGames.length} new games to ingest`)

  let totalRows = 0
  let errors = 0

  for (let gi = 0; gi < newGames.length; gi++) {
    const game = newGames[gi]
    process.stdout.write(`  [${gi + 1}/${newGames.length}] Game ${game.gamePk} (${game.date}: ${game.away} @ ${game.home})... `)

    try {
      const rows = await fetchStatcastForGame(game.gamePk)
      if (rows.length === 0) {
        console.log('no data')
        continue
      }

      await syncPlayers(rows)

      let gameInserted = 0
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase.from('wbc_pitches').upsert(batch, {
          onConflict: 'game_pk,at_bat_number,pitch_number',
          ignoreDuplicates: false,
        })
        if (error) {
          console.error(`batch error: ${error.message}`)
          errors++
        } else {
          gameInserted += batch.length
        }
      }

      totalRows += gameInserted
      console.log(`${gameInserted} pitches`)

      // Rate limit
      await new Promise(r => setTimeout(r, 1200))
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`)
      errors++
    }
  }

  console.log(`\nSeason ${season} complete: ${totalRows} rows inserted, ${errors} errors`)
}

async function main() {
  const arg = process.argv[2] || 'all'

  if (arg === '2023' || arg === 'all') {
    await backfillSeason(2023)
  }
  if (arg === '2026' || arg === 'all') {
    await backfillSeason(2026)
  }

  // Final count
  const { data } = await supabase.rpc('run_query', {
    query_text: 'SELECT COUNT(*) as count FROM wbc_pitches'
  })
  console.log(`\nTotal wbc_pitches rows: ${data?.[0]?.count || 0}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
