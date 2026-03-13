import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GAME_TYPE_MAP: Record<string, string> = {
  R: 'R|',
  S: 'S|',
  P: 'P|',
}

export async function syncPitches(start_date: string, end_date: string, game_type: string = 'R') {
  const hfGT = GAME_TYPE_MAP[game_type] || 'R|'

  const params = new URLSearchParams({
    all: 'true', hfPT: '', hfAB: '', hfGT, hfPR: '', hfZ: '',
    stadium: '', hfBBL: '', hfNewZones: '', hfPull: '', hfC: '',
    hfSea: '', hfSit: '', player_type: 'pitcher', hfOuts: '',
    opponent: '', pitcher_throws: '', batter_stands: '', hfSA: '',
    game_date_gt: start_date, game_date_lt: end_date,
    hfMo: '', team: '', home_road: '', hfRO: '', position: '',
    hfInfield: '', hfOutfield: '', hfInn: '', hfBBT: '', hfFlag: '',
    metric_1: '', group_by: 'name', min_pitches: '0',
    min_results: '0', min_pas: '0', sort_col: 'pitches',
    player_event_sort: 'api_p_release_speed', sort_order: 'desc',
    type: 'details'
  })

  const savantUrl = `https://baseballsavant.mlb.com/statcast_search/csv?${params}`
  const resp = await fetch(savantUrl, { signal: AbortSignal.timeout(120000) })

  if (!resp.ok) throw new Error('Failed to fetch from Baseball Savant')

  const csv = (await resp.text()).replace(/^\ufeff/, '') // strip UTF-8 BOM
  if (csv.length < 100) return { fetched: 0, inserted: 0, errors: 0, message: 'No data available for this date range' }

  // Parse CSV (proper RFC 4180 parser to handle quoted fields with commas)
  function parseCSVLine(line: string): string[] {
    const fields: string[] = []
    let i = 0
    while (i <= line.length) {
      if (i === line.length) { fields.push(''); break }
      if (line[i] === '"') {
        let val = ''
        i++ // skip opening quote
        while (i < line.length) {
          if (line[i] === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') { val += '"'; i += 2 }
            else { i++; break }
          } else { val += line[i]; i++ }
        }
        fields.push(val)
        if (i < line.length && line[i] === ',') i++ // skip comma
      } else {
        const next = line.indexOf(',', i)
        if (next === -1) { fields.push(line.slice(i)); break }
        fields.push(line.slice(i, next))
        i = next + 1
      }
    }
    return fields
  }

  const lines = csv.split('\n')
  const headers = parseCSVLine(lines[0]).map(h => h.trim()).filter(h => h !== '')
  const numHeaders = headers.length
  const rows: any[] = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue
    const vals = parseCSVLine(lines[i])
    // Allow rows with >= numHeaders fields (trailing empty fields from commas)
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

  if (rows.length === 0) return { fetched: 0, inserted: 0, errors: 0, message: 'No valid rows parsed' }

  // Remove id column if present
  rows.forEach(r => delete r.id)
  // Remove unnamed columns
  rows.forEach(r => { Object.keys(r).forEach(k => { if (k.startsWith('Unnamed')) delete r[k] }) })

  // Upload in batches
  let inserted = 0
  let errors = 0
  const batchSize = 500

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await supabase.from('pitches').upsert(batch, {
      onConflict: 'game_pk,at_bat_number,pitch_number',
      ignoreDuplicates: true
    })
    if (error) errors += batch.length
    else inserted += batch.length
  }

  // Refresh materialized view
  await supabase.rpc('refresh_player_summary')

  return {
    fetched: rows.length,
    inserted,
    errors,
    message: `Fetched ${rows.length} pitches, ${inserted} processed`
  }
}

export async function POST(req: NextRequest) {
  try {
    const { start_date, end_date, game_type } = await req.json()
    const result = await syncPitches(start_date, end_date, game_type || 'R')

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
