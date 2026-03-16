import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// CSV parser (RFC 4180 — handles quoted fields with commas)
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

  // Clean rows
  rows.forEach(r => {
    delete r.id
    Object.keys(r).forEach(k => { if (k.startsWith('Unnamed')) delete r[k] })
  })

  return rows
}

async function syncPlayers(rows: any[]) {
  // Collect unique pitcher IDs and names
  const pitcherMap = new Map<number, string>()
  for (const r of rows) {
    if (r.pitcher && r.player_name) pitcherMap.set(r.pitcher, r.player_name)
  }

  // Collect unique batter IDs
  const batterIds = [...new Set(rows.map(r => r.batter).filter(Boolean))] as number[]

  // Check which players already exist
  const allIds = [...new Set([...pitcherMap.keys(), ...batterIds])]
  if (allIds.length === 0) return

  const { data: existing } = await supabase
    .from('players')
    .select('id')
    .in('id', allIds)
  const existingSet = new Set((existing || []).map((p: any) => p.id))

  // Insert missing pitchers (we have names from player_name column)
  const missingPitchers = [...pitcherMap.entries()]
    .filter(([id]) => !existingSet.has(id))
    .map(([id, name]) => ({ id, name }))

  // For missing batters, fetch names from MLB People API
  const missingBatterIds = batterIds.filter(id => !existingSet.has(id) && !pitcherMap.has(id))
  const missingBatters: { id: number; name: string }[] = []

  for (let i = 0; i < missingBatterIds.length; i += 50) {
    const batch = missingBatterIds.slice(i, i + 50)
    const ids = batch.join(',')
    try {
      const resp = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${ids}`)
      const data = await resp.json()
      for (const p of data.people || []) {
        missingBatters.push({ id: p.id, name: p.fullName })
      }
    } catch { /* skip */ }
  }

  const toInsert = [...missingPitchers, ...missingBatters]
  if (toInsert.length > 0) {
    await supabase.from('players').upsert(toInsert, { onConflict: 'id', ignoreDuplicates: true })
  }
}

async function ingestWBCGames(season: number, startDate?: string, endDate?: string): Promise<{
  gamesProcessed: number; totalRows: number; errors: string[]
}> {
  const sd = startDate || `${season}-03-01`
  const ed = endDate || `${season}-03-25`

  // Fetch WBC schedule
  const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=51&season=${season}&leagueId=160&startDate=${sd}&endDate=${ed}&hydrate=team`
  const schedResp = await fetch(schedUrl, { signal: AbortSignal.timeout(15000) })
  if (!schedResp.ok) throw new Error(`Schedule API returned ${schedResp.status}`)
  const schedData = await schedResp.json()

  // Get all Final games
  const allGames: number[] = []
  for (const dateEntry of schedData.dates || []) {
    for (const g of dateEntry.games || []) {
      if (g.status?.abstractGameState === 'Final') {
        allGames.push(g.gamePk)
      }
    }
  }

  if (allGames.length === 0) return { gamesProcessed: 0, totalRows: 0, errors: [] }

  // Check which games are already in wbc_pitches
  const { data: existingGames } = await supabase
    .from('wbc_pitches')
    .select('game_pk')
    .in('game_pk', allGames)
  const existingSet = new Set((existingGames || []).map((r: any) => r.game_pk))

  const newGames = allGames.filter(gp => !existingSet.has(gp))
  if (newGames.length === 0) return { gamesProcessed: 0, totalRows: 0, errors: ['All games already ingested'] }

  let totalRows = 0
  const errors: string[] = []

  for (const gamePk of newGames) {
    try {
      const rows = await fetchStatcastForGame(gamePk)
      if (rows.length === 0) {
        errors.push(`Game ${gamePk}: no Statcast data`)
        continue
      }

      // Sync unknown players
      await syncPlayers(rows)

      // Upsert into wbc_pitches in batches
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const { error } = await supabase.from('wbc_pitches').upsert(batch, {
          onConflict: 'game_pk,at_bat_number,pitch_number',
          ignoreDuplicates: false,
        })
        if (error) errors.push(`Game ${gamePk} batch ${i}: ${error.message}`)
        else totalRows += batch.length
      }

      // Rate-limit: 1s between games
      await new Promise(r => setTimeout(r, 1000))
    } catch (err: any) {
      errors.push(`Game ${gamePk}: ${err.message}`)
    }
  }

  return { gamesProcessed: newGames.length, totalRows, errors }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backfill = req.nextUrl.searchParams.get('backfill')
  const season = req.nextUrl.searchParams.get('season')

  try {
    // Backfill mode: ingest a full season
    if (backfill === '2023' || season === '2023') {
      const result = await ingestWBCGames(2023, '2023-03-07', '2023-03-22')
      return NextResponse.json({ season: 2023, ...result })
    }

    if (backfill === '2026' || season === '2026') {
      const result = await ingestWBCGames(2026, '2026-03-01', '2026-03-25')
      return NextResponse.json({ season: 2026, ...result })
    }

    // Daily cron mode — only run if WBC is active
    const now = new Date()
    const cutoff = new Date('2026-03-21T00:00:00Z')
    if (now > cutoff) {
      return NextResponse.json({ skipped: 'WBC ended' })
    }

    // Fetch games from last 3 days
    const threeDaysAgo = new Date(now)
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const startDate = threeDaysAgo.toISOString().slice(0, 10)
    const endDate = now.toISOString().slice(0, 10)

    const result = await ingestWBCGames(2026, startDate, endDate)
    return NextResponse.json({ mode: 'daily', ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export const maxDuration = 300
